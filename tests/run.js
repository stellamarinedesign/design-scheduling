// run.js — the browser tests. Open /tests/ with the local server running
// (`python -m http.server 8790`). Pure logic only; every fixture is invented.

import * as T from '../js/tree.js';
import * as S from '../js/status.js';
import * as F from '../js/folders.js';
import * as D from '../js/dates.js';
import * as TD from '../js/import/tiledo.js';
import * as XL from '../js/import/excel.js';
import * as BL from '../js/backlog.js';
import * as C from '../js/convert.js';
import { sampleNodes, tiledoData, tiledoArchive, excelRows } from './samples.js';

const results = [];
let group = '';
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function test(name, fn) {
  try {
    fn();
    results.push({ group, name, pass: true });
  } catch (e) {
    results.push({ group, name, pass: false, detail: e?.message ?? String(e) });
  }
}
function expect(actual, expected, what = '') {
  if (!eq(actual, expected)) throw new Error(`${what ? what + ': ' : ''}expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
function ok(cond, what) { if (!cond) throw new Error(what || 'expected true'); }

/** Apply patches to a node list, as the store would. */
function apply(nodes, patches) {
  const m = new Map(nodes.map((n) => [n.id, { ...n }]));
  for (const p of patches) m.set(p.id, { ...(m.get(p.id) ?? {}), ...p });
  return [...m.values()];
}
const index = () => T.buildIndex(sampleNodes());
const BY = 'lead@example.test';
const AT = '2026-11-04T01:00:00.000Z';

export async function run() {
  // -------------------------------------------------------------------------
  group = 'tree';
  test('children come back in manual order', () => {
    const idx = index();
    expect(T.childrenOf(idx, 'g-alpha').map((n) => n.id), ['j1', 'j2', 'g-alpha-sub']);
    expect(T.childrenOf(idx, null).map((n) => n.id), ['g-prod', 'g-prog']);
  });
  test('descendants, depth first', () => {
    expect(T.descendantIds(index(), 'j1'), ['s1', 's2', 's2a', 's2b', 't1', 's3', 'sec', 't2']);
  });
  test('ancestor chain, top first', () => {
    expect(T.ancestorChain(index(), 't1').map((n) => n.id), ['g-prod', 'g-alpha', 'j1', 's2']);
  });
  test('a job is a task whose parent is a group (or the top)', () => {
    const idx = index();
    ok(T.isJob(idx, idx.byId.get('j1')), 'j1 is a job');
    ok(T.isJob(idx, idx.byId.get('j3')), 'j3 in a sub-group is a job');
    ok(!T.isJob(idx, idx.byId.get('t1')), 't1 under a step is a task');
    ok(!T.isJob(idx, idx.byId.get('t2')), 't2 in a section is a task');
  });
  test('category path skips the master and stops at the job', () => {
    const idx = index();
    expect(T.pathText(idx, 'j3'), 'Alpha Units › Small range');
    expect(T.pathText(idx, 't2'), 'Alpha Units');
    expect(T.pathText(idx, 'j3', { skipMaster: false }), 'Production › Alpha Units › Small range');
  });
  test('colour and steps template come from the nearest group', () => {
    const idx = index();
    expect(T.colourOf(idx, 'j3'), 2);
    expect(T.colourOf(idx, 'j4'), 5);
    expect(T.colourOf(idx, 'g-prog'), null);
    expect(T.stepsTemplateOf(idx, 'j3').from.id, 'g-alpha');
    expect(T.stepsTemplateOf(idx, 'j4'), null);
  });
  test('a section inside a job is not a category', () => {
    const idx = index();
    ok(T.isSection(idx, idx.byId.get('sec')), 'sec is a section');
    ok(!T.isSection(idx, idx.byId.get('g-alpha-sub')), 'sub-category is not');
  });
  test('progress counts leaf steps and subtasks, N/a left out', () => {
    // Concept done; 3D model → Body done, Head todo, subtask t1 open; Approval N/a; section → t2 todo.
    expect(T.progress(index(), 'j1'), { done: 2, total: 5 });
  });
  test('next step is the first open leaf, depth first', () => {
    expect(T.nameOf(T.nextStep(index(), 'j1')), 'Head');
  });
  test('cascade targets: open tasks and open leaf steps inside', () => {
    const c = T.cascadeTargets(index(), 'j1');
    expect(c.tasks.sort(), ['t1', 't2']);
    expect(c.steps.sort(), ['s2b']);
  });
  test('renumber returns only what changes', () => {
    const list = [{ id: 'a', order: 1024 }, { id: 'b', order: 5 }, { id: 'c', order: 3072 }];
    expect(T.renumber(list), [{ id: 'b', order: 2048 }]);
  });
  test('insert before a sibling lands between neighbours', () => {
    const idx = index();
    const r = T.insertRelative(idx, 'j2', 'j1', 'before');
    const after = T.buildIndex(apply(sampleNodes(), r.patches));
    expect(T.childrenOf(after, 'g-alpha').map((n) => n.id), ['j2', 'j1', 'g-alpha-sub']);
    expect(r.patches.length, 1, 'only the moved node is written');
  });
  test('insert after, into another parent, moves the parent too', () => {
    const r = T.insertRelative(index(), 'j4', 'j2', 'after');
    const after = T.buildIndex(apply(sampleNodes(), r.patches));
    expect(T.childrenOf(after, 'g-alpha').map((n) => n.id), ['j1', 'j2', 'j4', 'g-alpha-sub']);
    expect(after.byId.get('j4').parentId, 'g-alpha');
  });
  test('no room between neighbours renumbers the siblings', () => {
    const nodes = sampleNodes().map((n) => (n.id === 'j2' ? { ...n, order: 1024 + 1e-7 } : n));
    const idx = T.buildIndex(nodes);
    const r = T.insertRelative(idx, 'j4', 'j2', 'before');
    const after = T.buildIndex(apply(nodes, r.patches));
    expect(T.childrenOf(after, 'g-alpha').map((n) => n.id), ['j1', 'j4', 'j2', 'g-alpha-sub']);
  });
  test('nest under refuses a node into its own descendant', () => {
    ok(T.nestUnder(index(), 'j1', 't1').error, 'refused');
    ok(T.nestUnder(index(), 'g-alpha', 'j3').error, 'refused');
  });
  test('nest under: a new job sits above the sub-groups', () => {
    const r = T.nestUnder(index(), 'j4', 'g-alpha', 'beforeGroups');
    const after = T.buildIndex(apply(sampleNodes(), r.patches));
    expect(T.childrenOf(after, 'g-alpha').map((n) => n.id), ['j1', 'j2', 'j4', 'g-alpha-sub']);
  });
  test('steps only live inside a job; products only in a category', () => {
    const idx = T.buildIndex([...sampleNodes(), { id: 'p1', kind: 'product', parentId: 'g-beta', order: 9000, name: 'Model X' }]);
    ok(T.nestProblem(idx, 's1', 'g-beta'), 'step into category refused');
    ok(!T.nestProblem(idx, 's1', 'j2'), 'step into another job allowed');
    ok(T.nestProblem(idx, 'p1', 'j1'), 'product into a job refused');
    ok(!T.nestProblem(idx, 'j2', 'p1'), 'job into a product allowed');
  });
  test('open job count looks through sub-groups, not into jobs', () => {
    expect(T.openJobCount(index(), 'g-alpha'), 3);
    expect(T.openJobCount(index(), 'g-beta'), 0);
  });
  test('steps template text round-trips with sub-steps', () => {
    const text = 'Concept\n3D model\n  Body\n  Head\nDrawings';
    const t = T.templateFromText(text);
    expect(t, [{ label: 'Concept' }, { label: '3D model', children: [{ label: 'Body' }, { label: 'Head' }] }, { label: 'Drawings' }]);
    expect(T.templateToText(t), text);
  });
  test('a parent cycle puts its members at the top; walks end; others stay put', () => {
    const idx = T.buildIndex([
      { id: 'A', kind: 'group', parentId: 'B', order: 1, name: 'A' },
      { id: 'B', kind: 'group', parentId: 'A', order: 2, name: 'B' },
      { id: 'C', kind: 'task', parentId: 'A', order: 1, title: 'C', status: 'todo' },
    ]);
    expect(T.childrenOf(idx, null).map((n) => n.id).sort(), ['A', 'B']);
    expect(T.descendantIds(idx, 'A'), ['C']);
    expect(T.parentOf(idx, idx.byId.get('A')), null);
    expect(T.parentOf(idx, idx.byId.get('C')).id, 'A');
    expect(T.ancestorChain(idx, 'C').map((n) => n.id), ['A']);
  });
  test('activity moves every task above: the sub-job as well as the job', () => {
    const idx = T.buildIndex([...sampleNodes(), { id: 'sub', kind: 'task', parentId: 't2', order: 1, title: 'Deep task', status: 'todo' }]);
    expect(T.activityTargets(idx, 'sub'), ['j1', 't2', 'sub']);
    expect(T.activityTargets(idx, 's2b'), ['j1']);
  });
  test('restoring one item brings back only it, not everything archived at that moment', () => {
    const stamp = '2026-11-04T05:00:00.000Z';
    const archived = [
      { id: 'a', parentId: 'g', archivedAt: stamp }, { id: 'a1', parentId: 'a', archivedAt: stamp },
      { id: 'b', parentId: 'g', archivedAt: stamp },
    ];
    expect([...T.restoreSet(archived[0], archived)].sort(), ['a', 'a1']);
  });
  test('an orphan (parent gone) shows at the top rather than vanishing', () => {
    const idx = T.buildIndex([{ id: 'x', kind: 'task', parentId: 'gone', order: 1, title: 'Orphan' }]);
    expect(T.childrenOf(idx, null).map((n) => n.id), ['x']);
  });

  // -------------------------------------------------------------------------
  group = 'status';
  test('starting is a plain status change with a Started event', () => {
    const r = S.changeStatus(index(), 'j2', 'in_progress', { by: BY, at: AT });
    expect(r.patches[0].status, 'in_progress');
    expect(S.eventLabel(r.updates[0]), 'Started');
  });
  test('waiting keeps prevStatus and leaving restores it', () => {
    const idx = index();
    const w = S.changeStatus(idx, 'j1', 'waiting', { by: BY, at: AT, note: 'Supplier sample' });
    expect(w.patches[0].waiting.prevStatus, 'in_progress');
    const idx2 = T.buildIndex(apply(sampleNodes(), w.patches));
    const back = S.changeStatus(idx2, 'j1', 'in_progress', { by: BY, at: AT });
    expect(back.patches[0].waiting, null);
  });
  test('waiting needs a reason or a blocker', () => {
    ok(S.changeStatus(index(), 'j2', 'waiting', { by: BY, at: AT }).error, 'refused');
  });
  test('editing a waiting task keeps its original prevStatus and since', () => {
    const w = S.changeStatus(index(), 'j1', 'waiting', { by: BY, at: AT, note: 'A' });
    const idx2 = T.buildIndex(apply(sampleNodes(), w.patches));
    const again = S.changeStatus(idx2, 'j1', 'waiting', { by: BY, at: '2026-11-05T00:00:00.000Z', note: 'B' });
    expect(again.patches[0].waiting.prevStatus, 'in_progress');
    expect(again.patches[0].waiting.since, AT);
  });
  test('only a lead approves or sends back', () => {
    const nodes = apply(sampleNodes(), [{ id: 'j2', status: 'check' }]);
    const idx = T.buildIndex(nodes);
    ok(S.changeStatus(idx, 'j2', 'done', { by: BY, at: AT, role: 'designer' }).error, 'designer approve refused');
    ok(S.changeStatus(idx, 'j2', 'fix', { by: BY, at: AT, role: 'designer', comment: 'x' }).error, 'designer send back refused');
    const ap = S.changeStatus(idx, 'j2', 'done', { by: BY, at: AT, role: 'lead' });
    expect(ap.patches[0].checkedBy, BY);
    expect(ap.updates[0].kind, 'approve');
  });
  test('a send-back always says why', () => {
    const idx = T.buildIndex(apply(sampleNodes(), [{ id: 'j2', status: 'check' }]));
    ok(S.changeStatus(idx, 'j2', 'fix', { by: BY, at: AT }).error, 'empty comment refused');
    const r = S.changeStatus(idx, 'j2', 'fix', { by: BY, at: AT, comment: 'Hole pattern off' });
    expect(r.updates[0].kind, 'sendback');
    expect(r.updates[0].text, 'Hole pattern off');
  });
  test('posting an update on a To-do task starts it', () => {
    const r = S.postUpdate(index(), 'j2', 'Had a first look', { by: BY, at: AT });
    expect(r.patches[0].status, 'in_progress');
    const r2 = S.postUpdate(index(), 'j1', 'More', { by: BY, at: AT });
    expect(r2.patches[0].status, undefined, 'in progress stays');
  });

  // Blocking: A (j2) waits on B (j3) and C (j4 reopened).
  const blocked = () => {
    const nodes = apply(sampleNodes(), [{ id: 'j4', status: 'todo' }]);
    const w = S.changeStatus(T.buildIndex(nodes), 'j2', 'waiting', { by: BY, at: AT, blockedBy: ['j3', 'j4'] });
    if (w.error) throw new Error(w.error);
    return apply(nodes, w.patches);
  };
  test('blocking: unblocks only when ALL blockers finish', () => {
    let nodes = blocked();
    const one = S.changeStatus(T.buildIndex(nodes), 'j3', 'done', { by: BY, at: AT });
    expect(one.patches.length, 1, 'first blocker done: nothing unblocks');
    nodes = apply(nodes, one.patches);
    ok(S.waitingLine(T.buildIndex(nodes), T.buildIndex(nodes).byId.get('j2')).includes('1 done'), 'partial progress line');
    const two = S.changeStatus(T.buildIndex(nodes), 'j4', 'cancelled', { by: BY, at: AT });
    const un = two.patches.find((p) => p.id === 'j2');
    ok(un, 'second blocker cancelled: A unblocks in the same batch');
    expect(un.status, 'todo', 'back to the status it had');
    expect(two.updates.find((u) => u.taskId === 'j2').kind, 'unblock');
  });
  test('blocking: cycles are refused', () => {
    const nodes = blocked();
    const idx = T.buildIndex(nodes);
    ok(S.blockerProblem(idx, 'j3', 'j2'), 'j3 waiting on j2, which waits on j3, refused');
    ok(S.changeStatus(idx, 'j3', 'waiting', { by: BY, at: AT, blockedBy: ['j2'] }).error, 'refused through changeStatus');
  });
  test('blocking: own ancestors and descendants are refused', () => {
    const idx = index();
    ok(S.blockerProblem(idx, 't1', 'j1'), 'ancestor refused');
    ok(S.blockerProblem(idx, 'j1', 't1'), 'descendant refused');
    ok(S.blockerProblem(idx, 'j1', 'j1'), 'self refused');
    ok(!S.blockerProblem(idx, 'j1', 'j2'), 'a sibling job is fine');
  });
  test('blocking: removing a blocker unblocks when nothing is left and no reason', () => {
    const nodes = apply(sampleNodes(), []);
    const w = S.changeStatus(T.buildIndex(nodes), 'j2', 'waiting', { by: BY, at: AT, blockedBy: ['j3'] });
    const idx = T.buildIndex(apply(nodes, w.patches));
    const r = S.removeBlocker(idx, 'j3', { by: BY, at: AT });
    expect(r.patches[0].status, 'todo');
    expect(r.patches[0].waiting, null);
  });
  test('blocking: removing a blocker keeps waiting when a reason is left', () => {
    const nodes = apply(sampleNodes(), []);
    const w = S.changeStatus(T.buildIndex(nodes), 'j2', 'waiting', { by: BY, at: AT, blockedBy: ['j3'], note: 'Also the customer' });
    const idx = T.buildIndex(apply(nodes, w.patches));
    const r = S.removeBlocker(idx, 'j3', { by: BY, at: AT });
    expect(r.patches[0].waiting.blockedBy, []);
    expect(r.patches[0].status, undefined);
  });
  test('reconcile catches a blocker finished elsewhere, and is idempotent', () => {
    let nodes = blocked();
    nodes = apply(nodes, [{ id: 'j3', status: 'done' }, { id: 'j4', status: 'done' }]);   // finished without the batch
    const r1 = S.reconcile(T.buildIndex(nodes), { by: BY, at: AT });
    expect(r1.patches.map((p) => p.id), ['j2']);
    nodes = apply(nodes, r1.patches);
    const r2 = S.reconcile(T.buildIndex(nodes), { by: BY, at: AT });
    expect(r2.patches.length, 0, 'second run finds nothing');
  });
  test('reconcile leaves a waiting-for-a-reason task alone', () => {
    const w = S.changeStatus(index(), 'j1', 'waiting', { by: BY, at: AT, note: 'Customer' });
    const r = S.reconcile(T.buildIndex(apply(sampleNodes(), w.patches)), { by: BY, at: AT });
    expect(r.patches.length, 0);
  });
  test('waiting line: one open blocker names it', () => {
    const w = S.changeStatus(index(), 'j2', 'waiting', { by: BY, at: AT, blockedBy: ['j3'] });
    const idx = T.buildIndex(apply(sampleNodes(), w.patches));
    expect(S.waitingLine(idx, idx.byId.get('j2')), 'Blocked by: Compact frame concept');
  });
  // Cancelled: finished like Done, recorded apart (decided 2026-11-04).
  test('cancelling records who, when, why and where it was, with a cancel event', () => {
    const r = S.changeStatus(index(), 'j2', 'cancelled', { by: BY, at: AT, reason: 'Customer cancelled' });
    const p = r.patches.find((x) => x.id === 'j2');
    expect(p.cancelled, { by: BY, at: AT, reason: 'Customer cancelled', prevStatus: 'todo', prevWaiting: null, prevFixNote: null });
    expect(r.updates[0].kind, 'cancel');
    expect(r.updates[0].text, 'Customer cancelled');
    expect(S.eventLabel(r.updates[0]), 'Cancelled');
  });
  test('cancelling a job cancels its open tasks and steps; done stays done', () => {
    const nodes = apply(sampleNodes(), [{ id: 't2', status: 'done' }]);
    const r = S.changeStatus(T.buildIndex(nodes), 'j1', 'cancelled', { by: BY, at: AT, reason: 'Dropped' });
    const byId = Object.fromEntries(r.patches.map((x) => [x.id, x]));
    expect(byId.t1.status, 'cancelled');
    expect(byId.t1.cancelled.withId, 'j1');
    expect(byId.t1.cancelled.prevStatus, 'in_progress');
    ok(!byId.t2, 'the done task is left alone');
    expect(byId.s2b.state, 'na', 'open leaf step becomes N/a');
    expect(byId.s2b.cancelledFrom, { state: 'todo', withId: 'j1' });
    ok(!byId.s1 && !byId.s2a, 'done steps are left alone');
    ok(!byId.s2, 'a step with sub-steps is derived, not written');
  });
  test('cancelled counts as finished for blocking, the job and what went with it', () => {
    let nodes = sampleNodes();
    const w = S.changeStatus(T.buildIndex(nodes), 'j2', 'waiting', { by: BY, at: AT, blockedBy: ['t1'] });
    nodes = apply(nodes, w.patches);
    const r = S.changeStatus(T.buildIndex(nodes), 'j1', 'cancelled', { by: BY, at: AT });
    const un = r.patches.find((x) => x.id === 'j2');
    ok(un && un.status === 'todo', 'j2 waited on t1, which was cancelled with j1: it unblocks');
  });
  test('cancelling from Waiting keeps the whole wait for Reopen', () => {
    const w = S.changeStatus(index(), 'j1', 'waiting', { by: BY, at: AT, note: 'Customer' });
    const idx = T.buildIndex(apply(sampleNodes(), w.patches));
    const r = S.changeStatus(idx, 'j1', 'cancelled', { by: BY, at: AT });
    const p = r.patches.find((x) => x.id === 'j1');
    expect(p.cancelled.prevStatus, 'waiting');
    expect(p.cancelled.prevWaiting.note, 'Customer');
    expect(p.waiting, null);
  });
  test('reopen returns it, and what was cancelled with it, to where they were', () => {
    let nodes = sampleNodes();
    const c = S.changeStatus(T.buildIndex(nodes), 'j1', 'cancelled', { by: BY, at: AT });
    nodes = apply(nodes, c.patches);
    const idx = T.buildIndex(nodes);
    const t = idx.byId.get('j1');
    expect(S.reopenTo(t), 'in_progress');
    const r = S.changeStatus(idx, 'j1', S.reopenTo(t), { by: BY, at: AT });
    const byId = Object.fromEntries(r.patches.map((x) => [x.id, x]));
    expect(byId.j1.cancelled, null);
    expect(byId.t1.status, 'in_progress');
    expect(byId.s2b.state, 'todo');
    expect(r.updates[0].kind, 'reopen');
    expect(S.eventLabel(r.updates[0]), 'Reopened · In progress');
  });
  test('a task cancelled on its own is not reopened by its job', () => {
    let nodes = sampleNodes();
    nodes = apply(nodes, S.changeStatus(T.buildIndex(nodes), 't2', 'cancelled', { by: BY, at: AT }).patches);
    nodes = apply(nodes, S.changeStatus(T.buildIndex(nodes), 'j1', 'cancelled', { by: BY, at: AT }).patches);
    const r = S.changeStatus(T.buildIndex(nodes), 'j1', 'in_progress', { by: BY, at: AT });
    ok(!r.patches.some((x) => x.id === 't2'), 't2 stays cancelled');
  });
  // ---- only a Design lead marks anything Done (decided 2026-11-04) ----
  test('a designer cannot mark anything done, from any status', () => {
    for (const from of ['todo', 'in_progress', 'waiting', 'fix', 'check']) {
      const nodes = apply(sampleNodes(), [{ id: 'j2', status: from, waiting: from === 'waiting' ? { note: 'x', since: AT, prevStatus: 'todo', blockedBy: [] } : null }]);
      const r = S.changeStatus(T.buildIndex(nodes), 'j2', 'done', { by: BY, at: AT, role: 'designer' });
      ok(r.error, `from ${from}: refused`);
    }
    ok(!S.changeStatus(index(), 'j2', 'done', { by: BY, at: AT, role: 'lead' }).error, 'a lead may');
  });
  test('the check → in progress → done way round review is closed', () => {
    const nodes = apply(sampleNodes(), [{ id: 'j2', status: 'check', submittedBy: BY }]);
    const back = S.changeStatus(T.buildIndex(nodes), 'j2', 'in_progress', { by: BY, at: AT, role: 'designer' });
    ok(!back.error, 'taking it back is allowed');
    const after = T.buildIndex(apply(nodes, back.patches));
    ok(S.changeStatus(after, 'j2', 'done', { by: BY, at: AT, role: 'designer' }).error, 'but then done is still refused');
  });
  test('submitting records who submitted; only they may take it back', () => {
    const r = S.changeStatus(index(), 'j1', 'check', { by: BY, at: AT, role: 'designer' });
    expect(r.patches[0].submittedBy, BY);
    expect(r.patches[0].submittedAt, AT);
    const t = T.buildIndex(apply(sampleNodes(), r.patches)).byId.get('j1');
    ok(S.canTakeBack(t, BY), 'the submitter may');
    ok(!S.canTakeBack(t, 'someone@example.test'), 'nobody else may');
  });
  test('take back: In progress, logged with its note', () => {
    const nodes = apply(sampleNodes(), [{ id: 'j2', status: 'check', submittedBy: BY }]);
    const r = S.changeStatus(T.buildIndex(nodes), 'j2', 'in_progress', { by: BY, at: AT, role: 'designer', comment: 'forgot a part' });
    expect(r.patches[0].status, 'in_progress');
    expect(r.updates[0].kind, 'retract');
    expect(r.updates[0].text, 'forgot a part');
    expect(S.eventLabel(r.updates[0]), 'Taken back from check');
  });
  test('Close them too as a designer closes no tasks (only a lead marks done)', () => {
    const r = S.closeInside(index(), 'j1', { by: BY, at: AT, role: 'designer' });
    expect(r.tasks, []);
  });
  test('a designer cannot reopen something straight into Done', () => {
    let nodes = apply(sampleNodes(), [{ id: 'j4', status: 'done' }]);
    nodes = apply(nodes, S.changeStatus(T.buildIndex(nodes), 'j4', 'cancelled', { by: BY, at: AT }).patches);
    const idx = T.buildIndex(nodes);
    expect(S.reopenTo(idx.byId.get('j4')), 'done');
    ok(S.changeStatus(idx, 'j4', 'done', { by: BY, at: AT, role: 'designer' }).error, 'refused for a designer');
  });

  // ---- fix batch before the first push (regressions) ----
  test('removeBlockers: a job archived with both blockers in it leaves no stale blocker', () => {
    // D (j2) waits on X (t1) and Y (t2); their job j1 is archived as a whole.
    let nodes = sampleNodes();
    nodes = apply(nodes, S.changeStatus(T.buildIndex(nodes), 'j2', 'waiting', { by: BY, at: AT, blockedBy: ['t1', 't2'] }).patches);
    const r = S.removeBlockers(T.buildIndex(nodes), ['j1', 't1', 't2'], { by: BY, at: AT });
    const d = r.patches.filter((x) => x.id === 'j2');
    expect(d.length, 1, 'one patch for the dependent');
    expect(d[0].status, 'todo', 'nothing left and no reason: it unblocks');
  });
  test('removeBlockers: an open blocker that stays is all that is left', () => {
    let nodes = sampleNodes();
    nodes = apply(nodes, S.changeStatus(T.buildIndex(nodes), 'j2', 'waiting', { by: BY, at: AT, blockedBy: ['t1', 't2', 'j3'] }).patches);
    const r = S.removeBlockers(T.buildIndex(nodes), ['t1', 't2'], { by: BY, at: AT });
    expect(r.patches[0].waiting.blockedBy, ['j3']);
  });
  test('editing a wait keeps its blockers without re-checking them; finished ones drop', () => {
    let nodes = apply(sampleNodes(), [{ id: 'j4', status: 'todo' }]);
    nodes = apply(nodes, S.changeStatus(T.buildIndex(nodes), 'j2', 'waiting', { by: BY, at: AT, blockedBy: ['j3', 'j4'] }).patches);
    nodes = apply(nodes, [{ id: 'j3', status: 'done' }]);
    const idx = T.buildIndex(nodes);
    const r = S.changeStatus(idx, 'j2', 'waiting', { by: BY, at: AT, note: 'and the customer', blockedBy: ['j3', 'j4'] });
    ok(!r.error, r.error);
    expect(r.patches[0].waiting.blockedBy, ['j4']);
  });
  test('canWrite: unblocks and cascades leave out tasks this person cannot write', () => {
    let nodes = sampleNodes();
    nodes = apply(nodes, S.changeStatus(T.buildIndex(nodes), 'j2', 'waiting', { by: BY, at: AT, blockedBy: ['j3'] }).patches);
    const no = () => false;
    const r = S.changeStatus(T.buildIndex(nodes), 'j3', 'done', { by: BY, at: AT, canWrite: no });
    ok(!r.patches.some((x) => x.id === 'j2'), 'the dependent is left to the reconcile');
    const c = S.changeStatus(index(), 'j1', 'cancelled', { by: BY, at: AT, canWrite: (t) => t.id !== 't1' });
    ok(!c.patches.some((x) => x.id === 't1'), 'a task we cannot write is not cancelled with it');
  });
  test('Close them too: never approves what waits for check, even for the lead', () => {
    const nodes = apply(sampleNodes(), [{ id: 't2', status: 'check' }]);
    const r = S.closeInside(T.buildIndex(nodes), 'j1', { by: BY, at: AT, role: 'lead' });
    ok(!r.patches.some((x) => x.id === 't2'), 'the task in check is left alone');
    expect(r.leftInCheck, 1);
    expect(r.patches.find((x) => x.id === 't1').status, 'done');
    ok(!r.patches.some((x) => x.checkedBy), 'nothing approved');
  });
  test('the one unblock rule: a wait with a reason stays, on every path', () => {
    let nodes = sampleNodes();
    nodes = apply(nodes, S.changeStatus(T.buildIndex(nodes), 'j2', 'waiting', { by: BY, at: AT, blockedBy: ['j3'], note: 'Customer sign-off' }).patches);
    const fin = S.changeStatus(T.buildIndex(nodes), 'j3', 'done', { by: BY, at: AT });
    ok(!fin.patches.some((x) => x.id === 'j2'), 'last blocker finishing: still waiting');
    const done = apply(nodes, [{ id: 'j3', status: 'done' }]);
    expect(S.reconcile(T.buildIndex(done), { by: BY, at: AT }).patches.length, 0, 'reconcile: still waiting');
    expect(S.waitingLine(T.buildIndex(done), T.buildIndex(done).byId.get('j2')), 'Waiting: Customer sign-off');
    const rm = S.removeBlockers(T.buildIndex(nodes), ['j3'], { by: BY, at: AT });
    expect(rm.patches[0].status, undefined, 'last blocker removed: still waiting');
  });
  test('reopen restores Waiting exactly: its blockers and its note', () => {
    let nodes = apply(sampleNodes(), [{ id: 'j4', status: 'todo' }]);
    nodes = apply(nodes, S.changeStatus(T.buildIndex(nodes), 'j2', 'waiting', { by: BY, at: AT, blockedBy: ['j4'], note: 'Sample' }).patches);
    nodes = apply(nodes, S.changeStatus(T.buildIndex(nodes), 'j2', 'cancelled', { by: BY, at: AT }).patches);
    const idx = T.buildIndex(nodes);
    const t = idx.byId.get('j2');
    expect(S.reopenTo(t), 'waiting');
    const r = S.changeStatus(idx, 'j2', S.reopenTo(t), { by: BY, at: AT });
    expect(r.patches[0].status, 'waiting');
    expect(r.patches[0].waiting.blockedBy, ['j4']);
    expect(r.patches[0].waiting.note, 'Sample');
  });
  test('reopen into a wait whose blockers finished meanwhile comes back unblocked', () => {
    let nodes = sampleNodes();
    nodes = apply(nodes, S.changeStatus(T.buildIndex(nodes), 'j2', 'waiting', { by: BY, at: AT, blockedBy: ['j3'] }).patches);
    nodes = apply(nodes, S.changeStatus(T.buildIndex(nodes), 'j2', 'cancelled', { by: BY, at: AT }).patches);
    nodes = apply(nodes, [{ id: 'j3', status: 'done' }]);
    const idx = T.buildIndex(nodes);
    const r = S.changeStatus(idx, 'j2', S.reopenTo(idx.byId.get('j2')), { by: BY, at: AT });
    expect(r.patches[0].status, 'todo');
    expect(r.patches[0].waiting, null);
  });
  test('reopen restores Fix with its send-back note', () => {
    let nodes = apply(sampleNodes(), [{ id: 'j2', status: 'check' }]);
    nodes = apply(nodes, S.changeStatus(T.buildIndex(nodes), 'j2', 'fix', { by: BY, at: AT, comment: 'Hole pattern off' }).patches);
    nodes = apply(nodes, S.changeStatus(T.buildIndex(nodes), 'j2', 'cancelled', { by: BY, at: AT }).patches);
    const idx = T.buildIndex(nodes);
    const r = S.changeStatus(idx, 'j2', S.reopenTo(idx.byId.get('j2')), { by: BY, at: AT });
    expect(r.patches[0].status, 'fix');
    expect(r.patches[0].fixNote, 'Hole pattern off');
  });
  test('step states cycle To do → Doing → Done → N/a', () => {
    expect(['todo', 'doing', 'done', 'na'].map(S.nextStepState), ['doing', 'done', 'na', 'todo']);
  });
  test('a step checkbox goes backwards: Doing → To do, Done → Doing, N/a → Done', () => {
    expect(['doing', 'done', 'na', 'todo'].map(S.stepBack), ['todo', 'doing', 'done', null]);
  });
  test('a subtask checkbox: the lead goes To do → In progress → Done', () => {
    const f = (status) => S.taskForward({ status }, 'lead');
    expect(['todo', 'in_progress', 'check', 'fix'].map(f), ['in_progress', 'done', 'done', 'in_progress']);
    expect(['waiting', 'done', 'cancelled'].map(f), [null, null, null], 'those change from the task itself');
  });
  test('a subtask checkbox: a designer goes To do → In progress → Ready for check, never Done', () => {
    const f = (status) => S.taskForward({ status }, 'designer');
    expect(['todo', 'in_progress', 'check', 'fix'].map(f), ['in_progress', 'check', null, 'in_progress']);
  });
  test('a subtask checkbox backwards: Done → In progress (lead only), In progress → To do, check → Take back', () => {
    const me = 'designer@example.test';
    expect(S.taskBack({ status: 'done' }, 'lead', BY), 'in_progress');
    expect(S.taskBack({ status: 'done' }, 'designer', me), null, 'nobody else could put it back to Done');
    expect(S.taskBack({ status: 'in_progress' }, 'designer', me), 'todo');
    expect(S.taskBack({ status: 'check', submittedBy: me }, 'designer', me), 'in_progress', 'the submitter takes it back');
    expect(S.taskBack({ status: 'check', submittedBy: 'other@example.test' }, 'designer', me), null, 'only the submitter');
    expect(S.taskBack({ status: 'check', submittedBy: 'other@example.test' }, 'lead', BY), null, 'the lead sends back instead');
    expect(['todo', 'waiting', 'fix', 'cancelled'].map((status) => S.taskBack({ status }, 'lead', BY)), [null, null, null, null]);
  });
  test('auto-advance: a step ticked Done starts the next To-do step at its level', () => {
    const nodes = [
      { id: 'j', kind: 'task', parentId: 'g-alpha', order: 1, title: 'J', status: 'in_progress' },
      { id: 'a', kind: 'step', parentId: 'j', order: 1, label: 'A', state: 'done' },
      { id: 'b', kind: 'step', parentId: 'j', order: 2, label: 'B', state: 'na' },
      { id: 'c', kind: 'step', parentId: 'j', order: 3, label: 'C', state: 'todo' },
      { id: 'd', kind: 'step', parentId: 'j', order: 4, label: 'D', state: 'todo' },
    ];
    const idx = T.buildIndex(nodes);
    expect(S.nextStepToStart(idx, 'a'), 'c', 'N/a and Done steps are passed over');
    expect(S.nextStepToStart(idx, 'c'), 'd');
    expect(S.nextStepToStart(idx, 'd'), null, 'the last step starts nothing');
    const busy = T.buildIndex(apply(nodes, [{ id: 'c', state: 'doing' }]));
    expect(S.nextStepToStart(busy, 'a'), null, 'a step already Doing ends the search');
  });
  test("auto-advance: into the next step's sub-steps, and never out of its own level", () => {
    const idx = T.buildIndex(apply(sampleNodes(), [{ id: 's2a', state: 'todo' }]));
    expect(S.nextStepToStart(idx, 's1'), 's2a', 'the next step has sub-steps: its first To-do one');
    const idx2 = T.buildIndex(sampleNodes());
    expect(S.nextStepToStart(idx2, 's1'), 's2b', 'Body is done, so Head');
    expect(S.nextStepToStart(idx2, 's2b'), null, 'the subtask after it is not a step, and the level ends there');
  });
  test("auto-advance: a subtask ticked Done starts the next To-do subtask, only if nobody else's", () => {
    const me = 'designer@example.test';
    const nodes = [
      { id: 'j', kind: 'task', parentId: 'g-alpha', order: 1, title: 'J', status: 'in_progress', assignee: me },
      { id: 'a', kind: 'task', parentId: 'j', order: 1, title: 'A', status: 'done', assignee: me },
      { id: 'x', kind: 'step', parentId: 'j', order: 2, label: 'X', state: 'todo' },
      { id: 'b', kind: 'task', parentId: 'j', order: 3, title: 'B', status: 'check', assignee: me },
      { id: 'c', kind: 'task', parentId: 'j', order: 4, title: 'C', status: 'todo', assignee: me },
      { id: 'd', kind: 'task', parentId: 'j', order: 5, title: 'D', status: 'todo', assignee: 'other@example.test' },
      { id: 'e', kind: 'task', parentId: 'j', order: 6, title: 'E', status: 'todo', assignee: null },
    ];
    const idx = T.buildIndex(nodes);
    expect(S.nextTaskToStart(idx, 'a'), 'c', 'steps and submitted subtasks are passed over');
    expect(S.nextTaskToStart(idx, 'c'), null, "the next one is someone else's: left alone");
    expect(S.nextTaskToStart(idx, 'd'), 'e', "nobody's yet: started");
    expect(S.nextTaskToStart(idx, 'e'), null);
    const busy = T.buildIndex(apply(nodes, [{ id: 'c', status: 'in_progress' }]));
    expect(S.nextTaskToStart(busy, 'a'), null, 'one already under way ends the search');
  });

  // -------------------------------------------------------------------------
  group = 'folders';
  const full = (who) => `C:\\Users\\${who}\\OneDrive - Example Pty Ltd\\Stella Systems\\Example Products\\02 - Production\\Job A`;
  test('full OneDrive paths from different profiles normalise the same', () => {
    expect(F.normaliseFolder(full('alex')).path, 'Example Products/02 - Production/Job A');
    expect(F.normaliseFolder(full('Sam.Smith')).path, 'Example Products/02 - Production/Job A');
  });
  test('the prefix is kept for learning', () => {
    expect(F.normaliseFolder(full('alex')).prefix, 'C:\\Users\\alex\\OneDrive - Example Pty Ltd\\Stella Systems');
  });
  test('Stella Systems\\… (the Excel form)', () => {
    const r = F.normaliseFolder('Stella Systems\\Example Products\\Custom\\Thing');
    expect(r.path, 'Example Products/Custom/Thing');
    expect(r.prefix, null);
  });
  test('quoted "Copy as path" output', () => {
    expect(F.normaliseFolder(`"${full('alex')}"`).path, 'Example Products/02 - Production/Job A');
  });
  test('a path already relative is kept', () => {
    expect(F.normaliseFolder('Example Products/02 - Production/Job A').path, 'Example Products/02 - Production/Job A');
  });
  test('the Stella Systems segment matches in any case, trailing slash dropped', () => {
    expect(F.normaliseFolder('C:\\x\\stella systems\\A\\B\\').path, 'A/B');
  });
  test('non-Stella absolute paths are refused, with a reason', () => {
    ok(F.normaliseFolder('D:\\Elsewhere\\Thing').error, 'refused');
    ok(F.normaliseFolder('\\\\server\\share\\Thing').error, 'UNC refused');
    ok(F.normaliseFolder('C:\\Users\\x\\Stella Systems').error, 'the root itself refused');
    ok(F.normaliseFolder('   ').error, 'empty refused');
  });
  test('round trip to this PC\'s full path', () => {
    const n = F.normaliseFolder(full('alex'));
    expect(F.fullPath(n.path, n.prefix), full('alex'));
    expect(F.fullPath('A/B', ''), null, 'no prefix yet');
  });

  // -------------------------------------------------------------------------
  group = 'dates';
  test('calendar days come from local parts', () => {
    expect(D.dayOf(new Date(2026, 10, 4, 0, 30)), '2026-11-04');
    expect(D.dayLabel('2026-11-14', new Date(2026, 0, 1)), '14 Nov');
    expect(D.dayLabel('2027-01-02', new Date(2026, 0, 1)), '2 Jan 2027');
  });
  test('an impossible calendar day is not one', () => {
    expect(D.parseDay('2026-02-31'), null);
    expect(D.parseDay('2026-13-01'), null);
    ok(D.parseDay('2028-02-29'), 'a leap day is');
  });
  test('days until a calendar day', () => {
    expect(D.daysUntil('2026-11-06', new Date(2026, 10, 4, 23, 0)), 2);
    expect(D.daysUntil('2026-11-03', new Date(2026, 10, 4, 1, 0)), -1);
  });
  test('ages read in minutes, hours, then days', () => {
    const now = Date.parse('2026-11-04T12:00:00Z');
    expect(D.ageLabel('2026-11-04T11:50:00Z', now), '10m');
    expect(D.ageLabel('2026-11-04T07:00:00Z', now), '5h');
    expect(D.ageLabel('2026-10-04T12:00:00Z', now), '31d');
  });

  // -------------------------------------------------------------------------
  group = 'import: TileDo';
  const p = TD.parseTiledo(JSON.stringify(tiledoData), tiledoArchive);
  test('counts open, done and archived', () => {
    expect(p.stats, { total: 7, open: 5, done: 2, archived: 1 });
  });
  test('stage mapping, completed winning', () => {
    const s = (id) => p.byId.get(`aaaaaaaa-0000-0000-0000-00000000000${id}`).status;
    expect([s(2), s(3), s(4), s(5)], ['in_progress', 'done', 'waiting', 'check']);
  });
  test('TileDo times are read as local time', () => {
    expect(TD.tiledoInstant('2026-09-02T08:00:00.000000'), new Date(2026, 8, 2, 8, 0, 0).toISOString());
  });
  test('suggestions come from the words in existing categories', () => {
    const groups = [{ id: 'ga', name: 'Alpha Units', depth: 1 }, { id: 'gb', name: 'Beta Frames', depth: 1 }];
    expect(TD.suggestGroup('Alpha unit rework', groups), 'ga');
    expect(TD.suggestGroup('Beta frame drawings', groups), 'gb');
    expect(TD.suggestGroup('Unrelated thing', groups), null);
  });
  let n = 0;
  const newId = () => `n${++n}`;
  const empty = T.buildIndex([]);
  test('default plan keeps the tree: roots as groups, children as jobs', () => {
    const plan = TD.defaultPlan(p, []);
    const built = TD.buildTiledo(p, plan, { idx: empty, by: BY, at: AT, newId });
    expect(built.stats.groups, 2);
    expect(built.stats.jobs, 4, 'two under Current Jobs, one under Misc, one archived root');
    expect(built.stats.tasks, 2);
  });
  test('dissolve lifts the children, into the chosen category', () => {
    const plan = TD.defaultPlan(p, []);
    plan['aaaaaaaa-0000-0000-0000-000000000001'] = { as: 'dissolve', into: null };
    plan['aaaaaaaa-0000-0000-0000-000000000002'].into = 'g-alpha';
    const idx = index();
    const built = TD.buildTiledo(p, plan, { idx, by: BY, at: AT, newId });
    const job = built.nodes.find((x) => x.title === 'Alpha unit rework');
    expect(job.parentId, 'g-alpha');
    expect(job.brief, 'Check the mounting holes.');
    expect(job.priority, 'high');
    ok(!built.nodes.some((x) => x.name === 'Current Jobs'), 'no group for the dissolved root');
    const wait = built.nodes.find((x) => x.title === 'Waiting on supplier sample');
    expect(wait.waiting.note, 'Sample due next week');
    expect(wait.waiting.prevStatus, 'in_progress');
    expect(wait.parentId, job.id, 'subtree kept under its job');
    expect(built.views[job.id], 'list', 'TileDo view choice carried');
  });
  test('done jobs can go straight to the archive; archive.json stays archived', () => {
    const plan = TD.defaultPlan(p, []);
    const built = TD.buildTiledo(p, plan, { idx: empty, by: BY, at: AT, newId, archiveDone: true });
    const old = built.nodes.find((x) => x.title === 'Old cleanup');
    ok(old.archivedAt, 'archive.json item archived');
    const live = built.nodes.find((x) => x.title === 'Alpha unit rework');
    expect(live.archivedAt, null);
  });
  test('skip drops the whole branch', () => {
    const plan = TD.defaultPlan(p, []);
    plan['aaaaaaaa-0000-0000-0000-000000000006'] = { as: 'skip', into: null };
    const built = TD.buildTiledo(p, plan, { idx: empty, by: BY, at: AT, newId });
    ok(!built.nodes.some((x) => x.title === 'Tidy the template folder'), 'skipped');
    expect(built.stats.skipped, 2);
  });

  // -------------------------------------------------------------------------
  group = 'import: Excel';
  const xp = XL.parseTodoRows(excelRows);
  test('sections and their titles are found by the header rows', () => {
    expect(xp.sections.map((s) => s.title), ['Drafting tracker', 'Handover']);
    expect(xp.sections.map((s) => s.rows.length), [6, 3]);
  });
  test('Status and Checked map onto statuses', () => {
    const m = xp.sections[0].rows.map((r) => XL.mapRow(r).status);
    expect(m, ['in_progress', 'done', 'fix', 'todo', 'cancelled', 'cancelled']);
    ok(XL.mapRow(xp.sections[0].rows[1]).checked, 'Checked = Done is checked');
  });
  test('Path normalises, and a non-Stella path is reported, not imported', () => {
    const [a, b, c] = xp.sections[1].rows.map(XL.mapRow);
    expect(a.folders[0].path, 'Example Products/02 - Production/Epsilon');
    expect(b.folders[0].path, 'Example Products/Zeta');
    ok(c.folderError && !c.folders.length, 'refused with a reason');
  });
  test('build: Notes → brief, Status Notes → first update, done rows archived', () => {
    const built = XL.buildExcel(xp, { into: { 0: 'new', 1: null }, skip: new Set() }, { idx: empty, by: BY, at: AT, newId, archiveDone: true });
    expect(built.stats.groups, 1);
    expect(built.stats.jobs, 9);
    const a = built.nodes.find((x) => x.title === 'Alpha bracket R2');
    expect(a.brief, 'Use the standard pins');
    ok(built.updates.some((u) => u.taskId === a.id && u.text === 'Drawings half done'), 'first update');
    expect(built.nodes.find((x) => x.title === 'Beta frame laser').checkedBy, BY);
    ok(built.nodes.find((x) => x.title === 'Beta frame laser').archivedAt, 'done archived');
    expect(built.nodes.find((x) => x.title === 'Gamma panel').archivedAt, null, 'fix stays live');
  });
  test('a Cancelled row keeps its Status Notes as the reason, dated from the note', () => {
    const row = xp.sections[0].rows.find((r) => r.model === 'Theta cradle');
    const m = XL.mapRow(row);
    expect(m.status, 'cancelled');
    expect(m.cancelReason, 'Cancelled - verbal 12/03/26');
    expect(m.cancelledAt, new Date(2026, 2, 12).toISOString());
    expect(m.firstUpdate, '', 'the note is the reason, not an update');
    const built = XL.buildExcel(xp, { into: {}, skip: new Set() }, { idx: empty, by: BY, at: AT, newId, archiveDone: false });
    const n = built.nodes.find((x) => x.title === 'Theta cradle');
    expect(n.cancelled.reason, 'Cancelled - verbal 12/03/26');
    ok(built.updates.some((u) => u.taskId === n.id && u.kind === 'cancel'), 'a cancel event in the timeline');
  });
  test('Checked never overrides a Cancelled status', () => {
    expect(XL.mapRow({ model: 'X', status: 'Cancelled', statusNotes: '', notes: '', checked: 'Done', path: '' }).status, 'cancelled');
    expect(XL.mapRow({ model: 'X', status: 'Cancelled', statusNotes: '', notes: '', checked: 'Fix', path: '' }).status, 'cancelled');
    ok(!XL.mapRow({ model: 'X', status: 'Cancelled', statusNotes: '', notes: '', checked: 'Done', path: '' }).checked, 'not checked');
  });
  test('note dates: Australian order, impossible days refused', () => {
    expect(XL.noteDate('verbal 3/7/2026'), new Date(2026, 6, 3).toISOString());
    expect(XL.noteDate('31/02/26'), null);
    expect(XL.noteDate('no date here'), null);
  });
  test('skipped rows are not written', () => {
    const built = XL.buildExcel(xp, { into: {}, skip: new Set(['0:0', '0:1']) }, { idx: empty, by: BY, at: AT, newId });
    expect(built.stats.jobs, 7);
    expect(built.stats.skipped, 2);
  });

  // -------------------------------------------------------------------------
  group = 'convert';
  test('a job becomes a category: details stashed, steps and subtasks become its jobs', () => {
    const nodes = apply(sampleNodes(), [{ id: 'j1', brief: 'The brief', revision: 'R2', assignee: BY }]);
    const r = C.toCategory(T.buildIndex(nodes), 'j1', { by: BY, at: AT, colour: 7 });
    ok(!r.error, r.error);
    const p = r.patches.find((x) => x.id === 'j1');
    expect(p.kind, 'group');
    expect(p.name, 'Bracket redesign');
    expect(p.colour, 7);
    expect(p.jobStash.status, 'in_progress');
    expect(p.jobStash.brief, 'The brief');
    expect(p.status, null, 'hidden while it is a category');
    const idx = T.buildIndex(apply(nodes, r.patches));
    ok(T.isJob(idx, idx.byId.get('s2')), 'the step "3D model" is now a job');
    expect(idx.byId.get('t1').parentId, 's2', 'the subtask under it stays inside that new job');
    ok(!T.isSection(idx, idx.byId.get('sec')), 'its section is now a sub-category');
    expect(r.updates[0].kind, 'convert');
    expect(S.eventLabel(r.updates[0]), 'Turned into a category');
  });
  test('a job that held something up stops holding it up', () => {
    let nodes = sampleNodes();
    nodes = apply(nodes, S.changeStatus(T.buildIndex(nodes), 'j2', 'waiting', { by: BY, at: AT, blockedBy: ['j1'] }).patches);
    const r = C.toCategory(T.buildIndex(nodes), 'j1', { by: BY, at: AT });
    expect(r.patches.find((x) => x.id === 'j2').status, 'todo');
  });
  test('only a job can become a category', () => {
    ok(C.toCategory(index(), 't1', { by: BY, at: AT }).error, 'a subtask is refused');
    ok(C.toCategory(index(), 'g-alpha', { by: BY, at: AT }).error, 'a category is refused');
  });
  test('a category becomes a job: its jobs become subtasks, sub-categories sections', () => {
    const r = C.toJob(index(), 'g-alpha', { by: BY, at: AT });
    ok(!r.error, r.error);
    const p = r.patches[0];
    expect([p.kind, p.title, p.status, p.assignee], ['task', 'Alpha Units', 'todo', BY]);
    const idx = T.buildIndex(apply(sampleNodes(), r.patches));
    ok(!T.isJob(idx, idx.byId.get('j1')), 'j1 is a subtask now');
    ok(T.isSection(idx, idx.byId.get('g-alpha-sub')), 'its sub-category is a section now');
    expect(S.eventLabel(r.updates[0]), 'Turned into a job');
  });
  test('a category holding a product is refused, with the reason', () => {
    const idx = T.buildIndex([...sampleNodes(), { id: 'p1', kind: 'product', parentId: 'g-alpha-sub', order: 9000, name: 'Model X' }]);
    const r = C.toJob(idx, 'g-alpha', { by: BY, at: AT });
    ok(r.error && r.error.includes('Model X'), r.error);
    ok(C.toJob(index(), 'sec', { by: BY, at: AT }).error, 'a section inside a job is refused too');
  });
  test('round trip: job → category → job brings the job back as it was', () => {
    const before = apply(sampleNodes(), [{ id: 'j1', brief: 'Keep me', due: '2026-12-01', priority: 'high', assignee: BY }]);
    const a = C.toCategory(T.buildIndex(before), 'j1', { by: BY, at: AT, colour: 3 });
    const mid = apply(before, a.patches);
    const b = C.toJob(T.buildIndex(mid), 'j1', { by: BY, at: AT });
    const after = T.buildIndex(apply(mid, b.patches)).byId.get('j1');
    const was = T.buildIndex(before).byId.get('j1');
    expect([after.kind, after.title, after.status, after.brief, after.due, after.priority, after.assignee],
      [was.kind, was.title, was.status, was.brief, was.due, was.priority, was.assignee]);
    expect(after.jobStash, null);
    const kids = T.childrenOf(T.buildIndex(apply(mid, b.patches)), 'j1');
    expect(kids.filter((c) => c.kind === 'task' && ['s1', 's2'].includes(c.id)).map((c) => c.id), ['s1', 's2'], 'the step-jobs are subtasks now, not steps again');
    expect(kids.filter((c) => c.kind === 'step').map((c) => c.id), ['s3'], 'the N/a step was kept hidden and is a step again');
  });
  test('converted steps: Done → Done, Doing → In progress, To do → To do, in their order', () => {
    const nodes = apply(sampleNodes(), [{ id: 's1', state: 'doing' }, { id: 's2b', state: 'doing' }]);
    const doneStep = { id: 's0', kind: 'step', parentId: 'j1', order: 512, label: 'Brief agreed', state: 'done' };
    const r = C.toCategory(T.buildIndex([...nodes, doneStep]), 'j1', { by: BY, at: AT, colour: 2 });
    const byId = Object.fromEntries(r.patches.map((x) => [x.id, x]));
    expect([byId.s0.kind, byId.s0.status, byId.s0.title], ['task', 'done', 'Brief agreed']);
    expect([byId.s1.kind, byId.s1.status], ['task', 'in_progress']);
    expect([byId.s2.kind, byId.s2.status], ['task', 'todo']);
    ok(byId.s0.doneAt, 'a done step-job has a done time');
    ok(!byId.s3, 'the N/a step is not a job');
    ok(!byId.s2a && !byId.s2b, 'sub-steps are left as steps');
    const idx = T.buildIndex(apply([...nodes, doneStep], r.patches));
    expect(T.childrenOf(idx, 'j1').filter((c) => c.kind === 'task').map((c) => c.id), ['s0', 's1', 's2'], 'same order');
    expect(T.childrenOf(idx, 's2').filter((c) => c.kind === 'step').map((c) => c.state), ['done', 'doing'], 'the new job keeps its sub-steps as steps');
    ok(r.updates.some((u) => u.taskId === 's1' && u.kind === 'convert'), 'each step-job notes where it came from');
  });
  test('a subtask under an N/a step is lifted out to the category, not hidden', () => {
    const nodes = [...sampleNodes(), { id: 'tna', kind: 'task', parentId: 's3', order: 1, title: 'Under N/a', status: 'todo' }];
    const r = C.toCategory(T.buildIndex(nodes), 'j1', { by: BY, at: AT });
    expect(r.patches.find((x) => x.id === 'tna').parentId, 'j1');
  });

  // -------------------------------------------------------------------------
  group = 'backlog';
  const old = '2026-09-01T00:00:00.000Z';
  const NOW = Date.parse('2026-11-04T00:00:00.000Z');
  const blNodes = () => apply(sampleNodes(), [
    { id: 'j2', lastActivityAt: old }, { id: 'j3', lastActivityAt: old },
    { id: 't2', lastActivityAt: old, status: 'todo' },
  ]).concat([{ id: 'deep', kind: 'task', parentId: 't2', order: 1, title: 'Deep', status: 'todo', lastActivityAt: old }]);
  test('the pool is my To-do jobs and sub-jobs, never bottom-level tasks', () => {
    const idx = T.buildIndex(blNodes());
    const pool = BL.backlogPool(idx, { me: BY, days: 14, now: NOW }).map((n) => n.id).sort();
    expect(pool, ['j2', 'j3', 't2']);
  });
  test('Hide from the Backlog is offered only when an ancestor is in the pool too', () => {
    const idx = T.buildIndex(apply(blNodes(), [{ id: 'j1', status: 'todo', lastActivityAt: old }]));
    const pool = BL.backlogPool(idx, { me: BY, days: 14, now: NOW });
    ok(BL.canHideFromBacklog(idx, 't2', pool), 't2 doubles up with its job j1');
    ok(!BL.canHideFromBacklog(idx, 'j2', pool), 'a job with nothing above it in the pool');
  });

  group = 'writes';
  test('steps from a template carry createdBy, which the rules check', () => {
    let k = 0;
    const steps = T.stepsFromTemplate([{ label: 'A', children: [{ label: 'A1' }] }, 'B'], 'job1', { at: AT, by: BY, newId: () => `s${++k}` });
    expect(steps.length, 3);
    ok(steps.every((x) => x.createdBy === BY), 'every step has createdBy');
    expect(steps.find((x) => x.label === 'A1').parentId, steps.find((x) => x.label === 'A').id);
  });
  test('the tests page stays pure: no store, no Firebase', () => {
    const loaded = performance.getEntriesByType('resource').map((e) => e.name);
    ok(!loaded.some((u) => /\/js\/(store|firebase|actions|state)\.js|gstatic\.com/.test(u)), loaded.filter((u) => /store|firebase|actions|state|gstatic/.test(u)).join(', '));
  });

  return results;
}
