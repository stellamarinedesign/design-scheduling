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
import * as TM from '../js/team.js';
import * as NT from '../js/notes.js';
import * as PH from '../js/photos.js';
import * as SH from '../js/sharing.js';
import * as M from '../js/migrate.js';
import * as TC from '../js/timing.js';
import { sampleNodes, sampleStepNodes, tiledoData, tiledoArchive, excelRows } from './samples.js';

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
    ok(!T.isJob(idx, idx.byId.get('t1')), 't1 under a task is a task');
    ok(!T.isJob(idx, idx.byId.get('t2')), 't2 in a section is a task');
  });
  test('category path skips the master and stops at the job', () => {
    const idx = index();
    expect(T.pathText(idx, 'j3'), 'Alpha Units › Small range');
    expect(T.pathText(idx, 't2'), 'Alpha Units');
    expect(T.pathText(idx, 'j3', { skipMaster: false }), 'Production › Alpha Units › Small range');
  });
  test('colour and tasks template come from the nearest group', () => {
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
  test('progress: through tasks part of the job, a task someone has once, cancelled left out', () => {
    // Concept done; 3D model → Body done, Head todo, t1 (the lead's) open; Approval cancelled; section → t2 todo.
    expect(T.progress(index(), 'j1'), { done: 2, total: 5 }, 'the same numbers the steps gave');
  });
  test('the next task is the first open one, depth first, inside tasks part of the job', () => {
    expect(T.nameOf(T.nextTask(index(), 'j1')), 'Head');
  });
  test('cascade targets: every open task inside', () => {
    const c = T.cascadeTargets(index(), 'j1');
    expect(c.tasks.sort(), ['s2', 's2b', 't1', 't2']);
  });
  // ---- one kind of task (decided 2026-11-06) ----
  test('a task inside a job with nobody on it is part of the job; a job never is', () => {
    const idx = index();
    ok(T.isLight(idx, idx.byId.get('s1')), 'Concept is part of j1');
    ok(T.isLight(idx, idx.byId.get('s2a')), 'and so is a task inside it');
    ok(!T.isLight(idx, idx.byId.get('t1')), 'a task someone has is a task of its own');
    ok(!T.isLight(idx, idx.byId.get('j2')), "a job with nobody on it is the lead's, not part of anything");
    ok(T.isContainer(idx, idx.byId.get('s2')), '3D model holds tasks');
    ok(!T.isContainer(idx, idx.byId.get('s1')), 'Concept holds none');
  });
  test('its state comes from inside: done when all is finished, in progress when anything is under way', () => {
    const shown = (patches) => { const idx = T.buildIndex(apply(sampleNodes(), patches)); return T.shownStatus(idx, idx.byId.get('s2')); };
    expect(shown([]), 'in_progress', 'Body done, t1 under way');
    expect(shown([{ id: 's2a', status: 'todo' }, { id: 't1', status: 'todo' }]), 'todo', 'nothing started');
    expect(shown([{ id: 's2b', status: 'done' }, { id: 't1', status: 'cancelled' }]), 'done', 'done or cancelled, all of it');
    expect(shown([{ id: 's2a', status: 'cancelled' }, { id: 's2b', status: 'cancelled' }, { id: 't1', status: 'cancelled' }]), 'cancelled');
    expect(shown([{ id: 's2', status: 'cancelled' }]), 'cancelled', 'its own Cancelled stands');
    const idx = index();
    expect(T.shownStatus(idx, idx.byId.get('t1')), 'in_progress', 'a task someone has shows its own');
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
  test('a task moves anywhere (into a category it is a job); products only in a category', () => {
    const idx = T.buildIndex([...sampleNodes(), { id: 'p1', kind: 'product', parentId: 'g-beta', order: 9000, name: 'Model X' }]);
    ok(!T.nestProblem(idx, 's1', 'g-beta'), 'a task part of a job into a category: it becomes a job');
    ok(!T.nestProblem(idx, 's1', 'j2'), 'into another job allowed');
    ok(T.nestProblem(idx, 'p1', 'j1'), 'product into a job refused');
    ok(!T.nestProblem(idx, 'j2', 'p1'), 'job into a product allowed');
  });
  test('open job count looks through sub-groups, not into jobs', () => {
    expect(T.openJobCount(index(), 'g-alpha'), 3);
    expect(T.openJobCount(index(), 'g-beta'), 0);
  });
  test('tasks template text round-trips with the tasks inside them', () => {
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
    expect(T.activityTargets(idx, 's2b'), ['j1', 's2b'], 'not the task part of the job it sits in: only jobs and tasks of their own need it');
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
  test('cancelling a job cancels every open task inside it; done stays done', () => {
    const nodes = apply(sampleNodes(), [{ id: 't2', status: 'done' }]);
    const r = S.changeStatus(T.buildIndex(nodes), 'j1', 'cancelled', { by: BY, at: AT, reason: 'Dropped' });
    const byId = Object.fromEntries(r.patches.map((x) => [x.id, x]));
    expect(byId.t1.status, 'cancelled');
    expect(byId.t1.cancelled.withId, 'j1');
    expect(byId.t1.cancelled.prevStatus, 'in_progress');
    ok(!byId.t2, 'the done task is left alone');
    expect([byId.s2b.status, byId.s2b.cancelled.withId, byId.s2b.cancelled.prevStatus], ['cancelled', 'j1', 'todo'], 'a task part of the job: cancelled with it, as N/a was');
    ok(!byId.s1 && !byId.s2a && !byId.s3, 'done ones, and one cancelled before, are left alone');
    ok(r.updates.some((u) => u.taskId === 't1' && u.kind === 'cancel'), 'a task someone has gets a timeline entry');
    ok(!r.updates.some((u) => u.taskId === 's2b'), 'a task part of the job does not: thirty ticks would write thirty');
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
    expect(byId.s2b.status, 'todo');
    ok(!byId.s3, 'cancelled before the job was: stays cancelled');
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
  // ---- only a Design lead marks a job, or a task with an assignee, Done (2026-11-04, narrowed 2026-11-06) ----
  test('a designer cannot mark a job done, from any status', () => {
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
  test('Close them too as a designer closes only the tasks part of the job, never one someone has', () => {
    const r = S.closeInside(index(), 'j1', { by: BY, at: AT, role: 'designer' });
    expect(r.tasks.sort(), ['s2', 's2b']);
  });
  test('a designer ticks a task part of the job Done; never one someone has, never a job', () => {
    const DS = 'designer@example.test';
    const idx = index();
    const r = S.changeStatus(idx, 's2b', 'done', { by: DS, at: AT, role: 'designer' });
    ok(!r.error, r.error);
    expect([r.patches[0].status, r.patches[0].doneAt], ['done', AT]);
    ok(!S.changeStatus(idx, 's2b', 'cancelled', { by: DS, at: AT, role: 'designer' }).error, 'and may cancel it');
    ok(S.changeStatus(idx, 't1', 'done', { by: DS, at: AT, role: 'designer' }).error, 'a task with an assignee: refused');
    ok(S.changeStatus(idx, 'j2', 'done', { by: DS, at: AT, role: 'designer' }).error, 'a job: refused');
  });
  test('a task part of the job never goes for check on its own', () => {
    const idx = index();
    ok(S.changeStatus(idx, 's2b', 'check', { by: BY, at: AT, role: 'lead' }).error, 'not even the lead submits one');
    ok(!S.changeStatus(idx, 't1', 'check', { by: BY, at: AT, role: 'designer' }).error, 'one someone has does');
    ok(S.changeProblem('in_progress', 'fix', 'lead', true), 'nor is one sent back');
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
  test('the box on a task part of the job: To do → In progress → Done, for a designer too', () => {
    for (const role of ['lead', 'designer']) {
      const f = (status) => S.taskForward({ status }, role, true);
      expect(['todo', 'in_progress', 'waiting', 'done', 'cancelled'].map(f), ['in_progress', 'done', null, null, null], role);
    }
  });
  test('backwards on a task part of the job: Done → In progress → To do; Cancelled comes back', () => {
    const me = 'designer@example.test';
    expect(['done', 'in_progress', 'todo'].map((status) => S.taskBack({ status }, 'designer', me, true)), ['in_progress', 'todo', null]);
    expect(S.taskBack({ status: 'cancelled', cancelled: { prevStatus: 'in_progress' } }, 'designer', me, true), 'in_progress', 'as N/a → Done did, it reopens where it was');
  });
  test('a task checkbox: the lead goes To do → In progress → Done', () => {
    const f = (status) => S.taskForward({ status }, 'lead');
    expect(['todo', 'in_progress', 'check', 'fix'].map(f), ['in_progress', 'done', 'done', 'in_progress']);
    expect(['waiting', 'done', 'cancelled'].map(f), [null, null, null], 'those change from the task itself');
  });
  test('a task checkbox: a designer goes To do → In progress → Ready for check, never Done', () => {
    const f = (status) => S.taskForward({ status }, 'designer');
    expect(['todo', 'in_progress', 'check', 'fix'].map(f), ['in_progress', 'check', null, 'in_progress']);
  });
  test('a task checkbox backwards: Done → In progress (lead only), In progress → To do, check → Take back', () => {
    const me = 'designer@example.test';
    expect(S.taskBack({ status: 'done' }, 'lead', BY), 'in_progress');
    expect(S.taskBack({ status: 'done' }, 'designer', me), null, 'nobody else could put it back to Done');
    expect(S.taskBack({ status: 'in_progress' }, 'designer', me), 'todo');
    expect(S.taskBack({ status: 'check', submittedBy: me }, 'designer', me), 'in_progress', 'the submitter takes it back');
    expect(S.taskBack({ status: 'check', submittedBy: 'other@example.test' }, 'designer', me), null, 'only the submitter');
    expect(S.taskBack({ status: 'check', submittedBy: 'other@example.test' }, 'lead', BY), null, 'the lead sends back instead');
    expect(['todo', 'waiting', 'fix', 'cancelled'].map((status) => S.taskBack({ status }, 'lead', BY)), [null, null, null, null]);
  });
  test('auto-advance: a task part of the job ticked Done starts the next To-do one at its level', () => {
    const nodes = [
      { id: 'j', kind: 'task', parentId: 'g-alpha', order: 1, title: 'J', status: 'in_progress' },
      { id: 'a', kind: 'task', parentId: 'j', order: 1, title: 'A', status: 'done', assignee: null },
      { id: 'b', kind: 'task', parentId: 'j', order: 2, title: 'B', status: 'cancelled', assignee: null },
      { id: 'c', kind: 'task', parentId: 'j', order: 3, title: 'C', status: 'todo', assignee: null },
      { id: 'd', kind: 'task', parentId: 'j', order: 4, title: 'D', status: 'todo', assignee: null },
    ];
    const idx = T.buildIndex(nodes);
    expect(S.nextTaskToStart(idx, 'a'), 'c', 'Cancelled and Done are passed over');
    expect(S.nextTaskToStart(idx, 'c'), 'd');
    expect(S.nextTaskToStart(idx, 'd'), null, 'the last starts nothing');
    const busy = T.buildIndex(apply(nodes, [{ id: 'c', status: 'in_progress' }]));
    expect(S.nextTaskToStart(busy, 'a'), null, 'one already under way ends the search');
  });
  test('auto-advance: into the insides of the next one when it holds tasks, never out of its own level', () => {
    const idx = T.buildIndex(apply(sampleNodes(), [{ id: 's2a', status: 'todo' }]));
    expect(S.nextTaskToStart(idx, 's1'), 's2a', 'the next holds tasks: its first To-do one');
    const idx2 = T.buildIndex(sampleNodes());
    expect(S.nextTaskToStart(idx2, 's1'), 's2b', 'Body is done, so Head');
    expect(S.nextTaskToStart(idx2, 's2b'), null, 'the one after it is under way: the search ends there');
  });
  test("auto-advance: a task ticked Done starts the next To-do task, only if nobody else's", () => {
    const me = 'designer@example.test';
    const nodes = [
      { id: 'j', kind: 'task', parentId: 'g-alpha', order: 1, title: 'J', status: 'in_progress', assignee: me },
      { id: 'a', kind: 'task', parentId: 'j', order: 1, title: 'A', status: 'done', assignee: me },
      { id: 'x', kind: 'task', parentId: 'j', order: 2, title: 'X', status: 'done', assignee: null },
      { id: 'b', kind: 'task', parentId: 'j', order: 3, title: 'B', status: 'check', assignee: me },
      { id: 'c', kind: 'task', parentId: 'j', order: 4, title: 'C', status: 'todo', assignee: me },
      { id: 'd', kind: 'task', parentId: 'j', order: 5, title: 'D', status: 'todo', assignee: 'other@example.test' },
      { id: 'e', kind: 'task', parentId: 'j', order: 6, title: 'E', status: 'todo', assignee: null },
    ];
    const idx = T.buildIndex(nodes);
    expect(S.nextTaskToStart(idx, 'a'), 'c', 'done and submitted tasks are passed over');
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
    expect([job.assignee, wait.assignee], [BY, null], 'the job is the importer\'s; what is inside it has nobody on it, part of the job');
  });
  test('a TileDo Review inside a job comes in under way: a task part of its job is never checked on its own', () => {
    const q = TD.parseTiledo(JSON.stringify({ tasks: [
      { id: 'r1', title: 'Job', stage: 'todo', parent_id: null, order: 0 },
      { id: 'r2', title: 'Inner review', stage: 'review', parent_id: 'r1', order: 0 },
    ] }));
    const built = TD.buildTiledo(q, { r1: { as: 'job', into: null } }, { idx: empty, by: BY, at: AT, newId });
    expect(built.nodes.find((x) => x.title === 'Inner review').status, 'in_progress');
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
  test('a job becomes a category: details stashed, its tasks become its jobs', () => {
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
    ok(T.isJob(idx, idx.byId.get('s2')), '"3D model", part of the job, is now a job');
    expect(idx.byId.get('s2').assignee, BY, 'and goes to whoever had the job');
    expect(idx.byId.get('t1').parentId, 's2', 'the task under it stays inside that new job');
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
  test('a category becomes a job: its jobs become tasks inside it, sub-categories sections', () => {
    const r = C.toJob(index(), 'g-alpha', { by: BY, at: AT });
    ok(!r.error, r.error);
    const p = r.patches[0];
    expect([p.kind, p.title, p.status, p.assignee], ['task', 'Alpha Units', 'todo', BY]);
    const idx = T.buildIndex(apply(sampleNodes(), r.patches));
    ok(!T.isJob(idx, idx.byId.get('j1')), 'j1 is a task inside it now');
    ok(T.isLight(idx, idx.byId.get('j1')), 'with nobody on it, part of the new job');
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
    expect(kids.filter((c) => c.kind === 'task').map((c) => c.id), ['s1', 's2', 's3'], 'its jobs are tasks inside it again, in their order');
  });
  test('its tasks become jobs as they are: status, order, and a cancelled one in the Cancelled strip', () => {
    const nodes = apply(sampleNodes(), [{ id: 'j1', assignee: 'alex@example.test' }, { id: 's1', status: 'in_progress' }]);
    const r = C.toCategory(T.buildIndex(nodes), 'j1', { by: BY, at: AT, colour: 2 });
    const idx = T.buildIndex(apply(nodes, r.patches));
    expect(T.childrenOf(idx, 'j1').filter((c) => c.kind === 'task').map((c) => [c.id, c.status, c.assignee]),
      [['s1', 'in_progress', 'alex@example.test'], ['s2', 'todo', 'alex@example.test'], ['s3', 'cancelled', 'alex@example.test']]);
    ok(T.isJob(idx, idx.byId.get('s3')), 'the cancelled one (what N/a was) is a job too, not hidden');
    expect(idx.byId.get('t1').assignee, BY, 'a task someone has keeps them');
    expect(T.childrenOf(idx, 's2').filter((c) => c.kind === 'task').map((c) => c.id), ['s2a', 's2b', 't1'], 'what was inside stays inside');
    const lead = C.toCategory(index(), 'j1', { by: BY, at: AT, colour: 2 });
    ok(!lead.patches.some((x) => x.id === 's1'), 'a job of the lead\'s own: its tasks stay with nobody, the lead\'s');
  });

  // -------------------------------------------------------------------------
  group = 'backlog';
  const old = '2026-09-01T00:00:00.000Z';
  const NOW = Date.parse('2026-11-04T00:00:00.000Z');
  const blNodes = () => apply(sampleNodes(), [
    { id: 'j2', lastActivityAt: old }, { id: 'j3', lastActivityAt: old },
    { id: 't2', lastActivityAt: old, status: 'todo' },
    // Old and To do, holding tasks, but part of its job: never in the pool.
    { id: 's2', lastActivityAt: old }, { id: 's2a', status: 'todo', lastActivityAt: old },
  ]).concat([{ id: 'deep', kind: 'task', parentId: 't2', order: 1, title: 'Deep', status: 'todo', lastActivityAt: old, assignee: BY }]);
  test('the pool is my To-do jobs and sub-jobs, never bottom-level tasks or tasks part of a job', () => {
    const idx = T.buildIndex(blNodes());
    const pool = BL.backlogPool(idx, { me: BY, days: 14, now: NOW }).map((n) => n.id).sort();
    expect(pool, ['j2', 'j3', 't2']);
    const other = BL.backlogPool(idx, { me: 'alex@example.test', days: 14, now: NOW }).map((n) => n.id).sort();
    expect(other, ['j2', 'j3'], 'jobs with nobody on them, as before (only the lead\'s Home shows it); not the lead\'s own sub-job');
  });
  test('Hide from the Backlog is offered only when an ancestor is in the pool too', () => {
    const idx = T.buildIndex(apply(blNodes(), [{ id: 'j1', status: 'todo', lastActivityAt: old }]));
    const pool = BL.backlogPool(idx, { me: BY, days: 14, now: NOW });
    ok(BL.canHideFromBacklog(idx, 't2', pool), 't2 doubles up with its job j1');
    ok(!BL.canHideFromBacklog(idx, 'j2', pool), 'a job with nothing above it in the pool');
  });

  // -------------------------------------------------------------------------
  group = 'team';
  const DA = 'alex@example.test';
  const DB = 'sam@example.test';
  const T0 = Date.parse('2026-11-04T02:00:00.000Z');
  const ago = (d) => new Date(T0 - d * 86400000).toISOString();
  const teamNodes = () => apply(sampleNodes(), [
    { id: 'j1', assignee: DA, status: 'in_progress', statusAt: ago(3), lastActivityAt: ago(1), lastBy: DA },
    { id: 'j2', assignee: DA, status: 'check', submittedBy: DA, submittedAt: ago(2), lastActivityAt: ago(2) },
    { id: 'j3', assignee: DA, status: 'fix', fixNote: 'Wrong hole size', statusAt: ago(1), lastActivityAt: ago(1) },
    { id: 'j4', assignee: DB, status: 'done', doneAt: ago(1) },
    { id: 't1', assignee: DA, status: 'in_progress' },
    { id: 't2', assignee: DB, status: 'todo' },
  ]);
  test('ownerTask: a task is its own; a section belongs to the task it sits in', () => {
    const idx = index();
    expect(T.ownerTask(idx, 's2b').id, 's2b', 'a task part of the job is a task');
    expect(T.ownerTask(idx, 'sec').id, 'j1', 'a section belongs to its job');
    expect(T.ownerTask(idx, 't1').id, 't1', 'a task is its own');
    expect(T.ownerTask(idx, 'g-alpha'), null, 'a category belongs to no task');
  });
  test('a designer\'s own group id is fixed by the address, whatever its case', () => {
    expect(TM.inboxId('Alex@Example.test'), TM.inboxId('alex@example.test'));
    ok(TM.isInboxId(TM.inboxId(DA)), 'it looks like one');
    ok(TM.inboxId(DA) !== TM.inboxId(DB), 'two designers, two groups');
    ok(!TM.isInboxId('g-alpha'), 'an ordinary group is not one');
  });
  test('From designers: made only when a designer\'s task names a group that is not there, once', () => {
    const at = AT;
    const idx0 = T.buildIndex(sampleNodes());
    expect(TM.inboxFixes(idx0, { designers: [DA], people: {}, by: BY, at }), [], 'no designer task: nothing made');
    const own = { id: 'own1', kind: 'task', parentId: TM.inboxId(DA), order: 1024, title: 'Seal detail', status: 'todo', assignee: DA, createdBy: DA };
    const idx1 = T.buildIndex([...sampleNodes(), own]);
    ok(T.childrenOf(idx1, null).some((n) => n.id === 'own1'), 'until then it sits at the top, not lost');
    const made = TM.inboxFixes(idx1, { designers: [DA], people: { [DA]: { name: 'Alex' } }, by: BY, at });
    expect(made.map((n) => [n.id, n.parentId, n.name]), [[TM.FROM_DESIGNERS, null, 'From designers'], [TM.inboxId(DA), TM.FROM_DESIGNERS, 'Alex']]);
    const idx2 = T.buildIndex([...sampleNodes(), own, ...made]);
    expect(T.ancestorChain(idx2, 'own1').map((n) => n.id), [TM.FROM_DESIGNERS, TM.inboxId(DA)], 'now inside, nothing moved');
    expect(TM.inboxFixes(idx2, { designers: [DA], people: {}, by: BY, at }), [], 'idempotent');
  });
  test('From designers: a designer missing from an out-of-date list is still found from their task', () => {
    const own = { id: 'own1', kind: 'task', parentId: TM.inboxId(DA), order: 1024, title: 'Seal detail', status: 'todo', assignee: DA, createdBy: DA };
    const made = TM.inboxFixes(T.buildIndex([...sampleNodes(), own]), { designers: [], people: { [DA]: { name: 'Alex' } }, by: BY, at: AT });
    expect(made.map((n) => [n.id, n.name, n.inboxOf]).slice(1), [[TM.inboxId(DA), 'Alex', DA]]);
  });
  test('From designers: a stand-in group name is put right, a name the lead typed is kept', () => {
    const own = { id: 'own1', kind: 'task', parentId: TM.inboxId(DA), order: 1024, title: 'Seal detail', status: 'todo', assignee: DA, createdBy: DA };
    const grp = (extra) => ({ id: TM.inboxId(DA), kind: 'group', parentId: TM.FROM_DESIGNERS, order: 1024, inboxOf: null, ...extra });
    const master = { id: TM.FROM_DESIGNERS, kind: 'group', parentId: null, order: 9999, name: 'From designers' };
    const people = { [DA]: { name: 'Alex' } };
    const idxOf = (g) => T.buildIndex([...sampleNodes(), master, g, own]);
    expect(TM.inboxRepairs(idxOf(grp({ name: 'A former designer' })), { designers: [], people, at: AT }),
      [{ id: TM.inboxId(DA), inboxOf: DA, name: 'Alex', updatedAt: AT }], 'former designer: named');
    const prefix = DA.replace(/@.*/, '');
    expect(TM.inboxRepairs(idxOf(grp({ name: prefix, inboxOf: DA })), { designers: [DA], people, at: AT }),
      [{ id: TM.inboxId(DA), inboxOf: DA, name: 'Alex', updatedAt: AT }], 'named from the address: the real name once it loads');
    expect(TM.inboxRepairs(idxOf(grp({ name: 'Alex', inboxOf: DA })), { designers: [DA], people, at: AT }), [], 'right already: nothing');
    expect(TM.inboxRepairs(idxOf(grp({ name: 'Alex (old jobs)', inboxOf: DA })), { designers: [DA], people, at: AT }), [], 'the lead\'s name is kept');
    expect(TM.inboxRepairs(idxOf(grp({ name: 'A former designer' })), { designers: [], people: {}, at: AT }),
      [{ id: TM.inboxId(DA), inboxOf: DA, name: prefix, updatedAt: AT }], 'no name yet: the address, better than nobody');
  });
  test('Ready for checking: every task in check, the longest waiting first; never one part of a job', () => {
    const idx = T.buildIndex(apply(teamNodes(), [{ id: 't2', status: 'check', submittedAt: ago(5) }, { id: 's2b', status: 'check', submittedAt: ago(9) }]));
    expect(TM.checkQueue(idx).map((t) => t.id), ['t2', 'j2']);
  });
  test('the lead\'s Team column: unassigned means jobs, not the tasks part of them', () => {
    const idx = T.buildIndex(apply(sampleNodes(), [{ id: 's2b', status: 'in_progress' }, { id: 't1', assignee: DA }]));
    const ids = TM.teamColumn(idx, BY, { includeUnassigned: true }).flatMap((g) => g.rows.map((t) => t.id)).sort();
    expect(ids, ['j1', 'j2', 'j3', 't2'], 's2b, part of j1, is not a row of its own');
  });
  test('time in a status: statusAt, else the stamp the status kept', () => {
    expect(TM.statusSince({ status: 'in_progress', statusAt: ago(3), lastActivityAt: ago(1) }), ago(3));
    expect(TM.statusSince({ status: 'check', submittedAt: ago(2), lastActivityAt: ago(1) }), ago(2));
    expect(TM.statusSince({ status: 'waiting', waiting: { since: ago(6) }, lastActivityAt: ago(1) }), ago(6));
    expect(TM.statusSince({ status: 'todo', lastActivityAt: ago(4) }), ago(4));
    expect(TM.sinceShare({ statusAt: ago(7) }, T0), 0.5, 'a week is half the bar');
    expect(TM.sinceShare({ statusAt: ago(40) }, T0), 1, 'never over');
  });
  test('a Crew lane: active work, sent back first, counts and when they were heard from', () => {
    const lane = TM.crewLane(T.buildIndex(teamNodes()), DA, { now: T0 });
    expect(lane.rows.map((t) => t.id), ['j3', 'j2', 't1', 'j1'], 'by status, then the longest sitting (t1 since October) first');
    expect(lane.counts, { active: 4, check: 1, fix: 1, waiting: 0, todo: 0 });
    expect(lane.seen, ago(1), 'their own last activity (lastBy)');
    ok(!lane.quiet, 'not quiet');
    const quiet = TM.crewLane(T.buildIndex(apply(teamNodes(), [{ id: 'j1', lastActivityAt: ago(9) }, { id: 'j3', lastActivityAt: ago(9) }, { id: 'j2', lastActivityAt: ago(9) }])), DA, { now: T0 });
    ok(quiet.quiet && quiet.quietFor === 9, `quiet for 9 days (${quiet.quietFor})`);
  });
  test('done this week and month: approved work only, never cancelled', () => {
    const idx = T.buildIndex(apply(teamNodes(), [
      { id: 't2', status: 'cancelled', doneAt: ago(1) },
      { id: 'j2', assignee: DB, status: 'done', doneAt: ago(20) },
    ]));
    const c = TM.doneCounts(idx, DB, T0);
    expect(c.week, 1, 'this week');
    expect(c.month, 1, 'last month\'s does not count this month');
  });
  test('assigning takes the open tasks inside that were following it, and no others', () => {
    const idx = T.buildIndex(apply(sampleNodes(), [
      { id: 'j1', assignee: BY }, { id: 't1', assignee: BY, status: 'in_progress' }, { id: 't2', assignee: DB, status: 'todo' },
    ]));
    const p = TM.reassignPatches(idx, 'j1', DA, { at: AT });
    expect(p.map((x) => [x.id, x.assignee]), [['j1', DA], ['t1', DA]], 'the tasks part of the job go with it as they are, nobody on them');
    const fromNobody = TM.reassignPatches(T.buildIndex(apply(sampleNodes(), [{ id: 'j1', assignee: null }])), 'j1', DA, { at: AT });
    expect(fromNobody.map((x) => x.id), ['j1'], 'a job of the lead\'s given out: its tasks with nobody on them are not promoted');
  });
  test('promote: assigning a task part of the job makes it a task of their own; its status stays', () => {
    const idx = index();
    const p = TM.reassignPatches(idx, 's2b', DA, { at: AT });
    expect(p, [{ id: 's2b', assignee: DA, updatedAt: AT, lastActivityAt: AT }]);
    const after = T.buildIndex(apply(sampleNodes(), p));
    ok(!T.isLight(after, after.byId.get('s2b')), 'its own now');
    expect(TM.myTaskGroups(after, DA, { now: T0 }).find((g) => g.key === 'todo').rows.map((t) => t.id), ['s2b'], 'on their list');
    const box = TM.reassignPatches(idx, 's2', DA, { at: AT })[0];
    expect([box.status, box.statusAt], ['in_progress', AT], 'one holding tasks starts from the state they gave it');
  });
  test('demote: unassigning a task inside a job makes it part of the job; check and send-back go back to In progress', () => {
    const idx = T.buildIndex(apply(sampleNodes(), [{ id: 't1', assignee: DA, status: 'check', submittedBy: DA }, { id: 't2', assignee: DA, status: 'fix', fixNote: 'Holes' }]));
    const p = TM.reassignPatches(idx, 't1', null, { at: AT })[0];
    expect([p.assignee, p.status, p.submittedBy], [null, 'in_progress', null]);
    const q = TM.reassignPatches(idx, 't2', null, { at: AT })[0];
    expect([q.status, q.fixNote], ['in_progress', null]);
    const waiting = T.buildIndex(apply(sampleNodes(), [{ id: 't1', status: 'waiting' }]));
    ok(!('status' in TM.reassignPatches(waiting, 't1', null, { at: AT })[0]), 'any other status stays');
    const job = TM.reassignPatches(T.buildIndex(apply(sampleNodes(), [{ id: 'j2', assignee: DA, status: 'check' }])), 'j2', null, { at: AT })[0];
    ok(!('status' in job), 'a job unassigned is the lead\'s, and keeps its check');
  });
  test('a designer\'s list: theirs only, grouped by what to do next, done only this month', () => {
    const idx = T.buildIndex(apply(teamNodes(), [{ id: 'j4', assignee: DA, doneAt: ago(1) }]));
    const g = TM.myTaskGroups(idx, DA, { now: T0 });
    const ids = Object.fromEntries(g.map((x) => [x.key, x.rows.map((t) => t.id)]));
    expect(ids.fix, ['j3']);
    expect(ids.progress.sort(), ['j1', 'j2', 't1'], 'Ready for check sits under In progress');
    expect(ids.done, ['j4']);
    const old = T.buildIndex(apply(teamNodes(), [{ id: 'j4', assignee: DA, doneAt: ago(60) }]));
    expect(TM.myTaskGroups(old, DA, { now: T0 }).find((x) => x.key === 'done').rows, [], 'done long ago drops off');
    const q = TM.myTaskGroups(idx, DA, { now: T0, query: 'bracket' });
    expect(q.flatMap((x) => x.rows.map((t) => t.id)), ['j1']);
  });
  test('a designer\'s list sorts by due date first, undated last', () => {
    const idx = T.buildIndex(apply(teamNodes(), [
      { id: 'j1', due: '2026-11-20' }, { id: 't1', due: '2026-11-10' },
    ]));
    const rows = TM.myTaskGroups(idx, DA, { now: T0, sort: 'due' }).find((x) => x.key === 'progress').rows.map((t) => t.id);
    expect(rows, ['t1', 'j1', 'j2']);
  });
  test('the next line: send-back, wait, latest update, brief, or not filed yet', () => {
    const idx = T.buildIndex(teamNodes());
    expect(TM.nextLine(idx, idx.byId.get('j3'), { now: T0 }).text, 'Sent back: Wrong hole size');
    expect(TM.nextLine(idx, { ...idx.byId.get('j1'), lastNote: { text: 'Half way', by: DA } }, { now: T0, who: () => 'You' }).text, 'You: Half way');
    expect(TM.nextLine(idx, { id: 'x', status: 'todo', brief: '- **Check** the pins\n- then the plate' }, { now: T0 }).text, 'Brief: Check the pins');
    expect(TM.nextLine(idx, { id: 'x', status: 'todo', brief: '', parentId: TM.inboxId(DA) }, { now: T0 }).text, 'Added by you · not filed yet');
    const w = TM.nextLine(idx, { id: 'x', status: 'waiting', waiting: { since: ago(6) } }, { now: T0, waitingLine: () => 'Waiting: supplier sample' });
    expect(w.text, 'Waiting on: supplier sample · 6d');
  });
  test('the strip: a segment per top-level task, sections looked into, one holding tasks as they stand', () => {
    expect(TM.stageStrip(index(), 'j1'), ['done', 'doing', 'na', 'todo']);
  });
  test('one action per row: Start, Post update, Submit once everything inside is done, else Open', () => {
    const idx = index();
    expect(TM.rowAction(idx, { ...idx.byId.get('j2'), status: 'todo' }), 'start');
    expect(TM.rowAction(idx, idx.byId.get('j1')), 'update', 'tasks still open');
    const allDone = T.buildIndex(apply(sampleNodes(), [{ id: 's2b', status: 'done' }, { id: 't1', status: 'done' }, { id: 't2', status: 'done' }]));
    expect(TM.rowAction(allDone, allDone.byId.get('j1')), 'submit');
    expect(TM.rowAction(idx, { ...idx.byId.get('j2'), status: 'fix' }), 'open');
  });
  test('statusAt: set by a status change, kept while a wait is edited', () => {
    const idx = index();
    const r = S.changeStatus(idx, 'j2', 'in_progress', { by: BY, at: AT });
    expect(r.patches[0].statusAt, AT);
    const waiting = T.buildIndex(apply(sampleNodes(), S.changeStatus(idx, 'j2', 'waiting', { by: BY, at: AT, note: 'Sample' }).patches));
    const later = '2026-11-05T01:00:00.000Z';
    ok(!('statusAt' in S.changeStatus(waiting, 'j2', 'waiting', { by: BY, at: later, note: 'Sample, again' }).patches[0]), 'editing a wait keeps its clock');
  });
  test('posting an update: the task carries it; someone who cannot write it posts it alone', () => {
    const idx = index();
    const r = S.postUpdate(idx, 'j2', 'Model done, drawings next', { by: DA, at: AT });
    expect(r.patches[0].lastNote, { text: 'Model done, drawings next', by: DA, at: AT });
    expect(r.patches[0].statusAt, AT, 'it started, and says when');
    const ro = S.postUpdate(idx, 'j2', 'A question', { by: DA, at: AT, canWrite: false });
    expect([ro.patches.length, ro.updates.length, ro.updates[0].from], [0, 1, undefined], 'no patch, no auto-start');
    expect(S.postUpdate(idx, 'j1', 'x'.repeat(400), { by: DA, at: AT }).patches[0].lastNote.text.length, S.LAST_NOTE_MAX);
  });

  // -------------------------------------------------------------------------
  group = 'log';
  const RY = 'riley@example.test';
  const mk = (o) => NT.noteNode({ id: 'n1', text: 'Hinge binds\nPaint in the knuckle', kind: 'issue', by: RY, at: AT, ...o });
  test('a note\'s first line is its title; the rest is its body', () => {
    expect(NT.titleOf({ text: '\n  - **Hinge** binds after paint  \nMore here\n\nAnd here' }), 'Hinge binds after paint');
    expect(NT.bodyOf({ text: '\nHinge binds\nMore here\n\nAnd here' }), 'More here\n\nAnd here');
    expect(NT.excerptOf({ text: 'T\n- one\n- **two**' }), 'one · two');
    expect(NT.titleOf({ text: 'x'.repeat(300) }).length, NT.TITLE_MAX, 'a long first line is cut');
    expect(NT.titleOf({ text: '' }), '');
  });
  test('a new note starts open, or filed for reference, or actioned with a job', () => {
    const n = mk();
    expect([n.state, n.jobIds, n.dismissed, n.archivedAt], ['open', [], null, null]);
    expect(mk({ kind: 'reference' }).state, 'filed');
    const j = mk({ jobs: [{ id: 'j1', title: 'Bracket redesign' }] });
    expect([j.state, j.jobIds, j.links], ['actioned', ['j1'], [{ id: 'j1', title: 'Bracket redesign' }]]);
    expect(mk({ kind: 'nonsense' }).kind, 'issue', 'an unknown kind is an issue');
    ok(!('id' in NT.noteNode({ text: 'x', by: RY, at: AT })) || NT.noteNode({ text: 'x', by: RY, at: AT }).id === undefined, 'an id only when given');
  });
  test('editing the kind moves an untriaged note between open and filed, and nothing else', () => {
    expect(NT.stateForKind(mk(), 'reference'), 'filed');
    expect(NT.stateForKind(mk({ kind: 'reference' }), 'idea'), 'open');
    expect(NT.stateForKind({ ...mk(), state: 'actioned' }, 'reference'), 'actioned');
    expect(NT.stateForKind({ ...mk(), state: 'dismissed' }, 'idea'), 'dismissed');
  });
  test('linking a job actions an open issue; linking twice changes nothing; unlinking the last reopens it', () => {
    const n = mk();
    const p = NT.linkPatch(n, { id: 'j1', title: 'Bracket redesign' }, { by: BY, at: AT });
    expect([p.state, p.jobIds, p.actioned], ['actioned', ['j1'], { by: BY, at: AT }]);
    const linked = { ...n, ...p };
    expect(NT.linkPatch(linked, { id: 'j1', title: 'x' }, { by: BY, at: AT }), null);
    const p2 = NT.linkPatch(linked, { id: 'j2', title: 'Hinge plate update' }, { by: BY, at: AT });
    ok(!('state' in p2), 'a second job leaves the state alone');
    const u = NT.unlinkPatch(linked, 'j1', { by: BY, at: AT });
    expect([u.state, u.jobIds, u.links], ['open', [], []]);
    expect(NT.unlinkPatch(linked, 'nope', { by: BY, at: AT }), null);
    const ref = NT.linkPatch(mk({ kind: 'reference' }), { id: 'j1', title: 'x' }, { by: BY, at: AT });
    ok(!('state' in ref), 'a reference note stays filed when linked');
    const done = NT.unlinkPatch({ ...linked, state: 'resolved' }, 'j1', { by: BY, at: AT });
    ok(!('state' in done) && done.jobIds.length === 0, 'a resolved note stays resolved when its job is unlinked (deleted, archived)');
  });
  test('dismiss keeps the reason; reopen goes back to open, or actioned with a job', () => {
    const d = NT.dismissPatch(mk(), '  Already fixed  ', { by: BY, at: AT });
    expect([d.state, d.dismissed.reason], ['dismissed', 'Already fixed']);
    expect(NT.dismissPatch(mk({ kind: 'reference' }), 'x', { by: BY, at: AT }), null, 'reference notes are not dismissed');
    expect(NT.reopenPatch({ ...mk(), ...d }, { by: BY, at: AT }).state, 'open');
    expect(NT.reopenPatch({ ...mk({ jobs: [{ id: 'j1' }] }), state: 'dismissed' }, { by: BY, at: AT }).state, 'actioned');
    expect(NT.reopenPatch(mk(), { by: BY, at: AT }), null, 'only a dismissed note reopens');
  });
  test('resolved: every linked job finished and one done; a job out of sight decides nothing', () => {
    const idx = index();
    const on = (ids) => ({ ...mk({ jobs: ids.map((id) => ({ id })) }), id: `n-${ids.join('-')}` });
    expect(NT.resolveFixes([on(['j4'])], idx, { at: AT }).map((p) => [p.id, p.state]), [['n-j4', 'resolved']]);
    expect(NT.resolveFixes([on(['j4', 'j2'])], idx, { at: AT }), [], 'one still to do');
    expect(NT.resolveFixes([on(['j4', 'gone'])], idx, { at: AT }), [], 'one it cannot see');
    const cancelled = T.buildIndex(apply(sampleNodes(), [{ id: 'j2', status: 'cancelled' }]));
    expect(NT.resolveFixes([on(['j2'])], cancelled, { at: AT }), [], 'cancelled alone is not resolved');
    expect(NT.resolveFixes([on(['j2', 'j4'])], cancelled, { at: AT }).length, 1, 'cancelled and done is');
  });
  test('the Log\'s categories: groups outside jobs and outside From designers, recent first', () => {
    const fd = { id: TM.FROM_DESIGNERS, kind: 'group', parentId: null, order: 9000, name: 'From designers', archivedAt: null };
    const inbox = { id: TM.inboxId(RY), kind: 'group', parentId: TM.FROM_DESIGNERS, order: 1024, name: 'Riley', archivedAt: null };
    const idx = T.buildIndex([...sampleNodes(), fd, inbox]);
    ok(!NT.isNoteCategory(idx, idx.byId.get('sec')), 'a section inside a job is not');
    ok(!NT.isNoteCategory(idx, idx.byId.get(inbox.id)) && !NT.isNoteCategory(idx, fd), 'From designers is not');
    const { recent, all } = NT.categoryList(idx, { recent: ['g-beta', 'missing'] });
    expect(all.map((x) => [x.node.id, x.depth]), [['g-prod', 0], ['g-alpha', 1], ['g-alpha-sub', 2], ['g-beta', 1], ['g-prog', 0]]);
    expect(recent.map((x) => x.node.id), ['g-beta'], 'a recent one that is gone is skipped');
    expect(NT.pushRecent(['a', 'b', 'c'], 'b'), ['b', 'a', 'c']);
    expect(NT.placeText(idx, 'g-alpha-sub'), 'Alpha Units › Small range');
  });
  test('the feed: pills, a category with what is inside it, who posted, and search', () => {
    const idx = index();
    const notes = [
      { ...mk(), id: 'a', groupId: 'g-alpha-sub', at: '2026-11-04T03:00:00.000Z' },
      { ...mk({ kind: 'reference' }), id: 'b', groupId: 'g-beta', text: 'Weld prep\nBevel both sides', by: BY, at: '2026-11-04T02:00:00.000Z' },
      { ...mk(), id: 'c', state: 'dismissed', groupId: null, at: '2026-11-04T01:00:00.000Z' },
      { ...mk({ kind: 'reference' }), id: 'd', state: 'archived', at: '2026-11-03T01:00:00.000Z' },
    ];
    const ids = (f) => NT.filterNotes(notes, { idx, ...f }).map((n) => n.id);
    expect(ids({}), ['a', 'b', 'c'], 'All leaves archived out');
    expect(ids({ pill: 'open' }), ['a']);
    expect(ids({ pill: 'reference' }), ['b', 'd'], 'Reference keeps archived, shown apart');
    expect(ids({ groupId: 'g-alpha' }), ['a'], 'a category takes in its sub-categories');
    expect(ids({ author: BY }), ['b']);
    expect(ids({ query: 'small range' }), ['a'], 'search reaches the category');
    expect(ids({ query: 'bevel', who: () => 'Lead' }), ['b']);
    expect(ids({ query: 'lead', who: (e) => (e === BY ? 'Lead' : 'Riley') }), ['b'], 'and the author');
    expect(NT.mergeNotes([notes[1]], [notes[0], { ...notes[1], text: 'newer copy' }]).map((n) => [n.id, n.text.slice(0, 5)]), [['a', 'Hinge'], ['b', 'newer']]);
    expect(NT.authorsOf(notes), [RY, BY]);
  });
  test('photos: HEIC is known by its header; sizes fit within the long edge and never grow', () => {
    const head = (brand) => new Uint8Array([0, 0, 0, 24, ...[...'ftyp'].map((c) => c.charCodeAt(0)), ...[...brand].map((c) => c.charCodeAt(0))]);
    ok(PH.isHeic(head('heic')) && PH.isHeic(head('mif1')), 'heic and mif1');
    ok(!PH.isHeic(head('isom')) && !PH.isHeic(new Uint8Array([255, 216, 255, 224, 0, 16, 74, 70, 73, 70, 0, 1])), 'mp4 and jpeg are not');
    expect(PH.fitWithin(4032, 3024, 1280), { w: 1280, h: 960 });
    expect(PH.fitWithin(3024, 4032, 1280), { w: 960, h: 1280 });
    expect(PH.fitWithin(800, 600, 1280), { w: 800, h: 600 }, 'never enlarged');
    expect(PH.dataUrlBytes('data:image/jpeg;base64,QUJD'), 3);
    expect(PH.dataUrlBytes('data:image/jpeg;base64,QUI='), 2);
    ok(PH.looksLikePhoto({ name: 'IMG_0001.HEIC', type: '' }) && !PH.looksLikePhoto({ name: 'notes.pdf', type: 'application/pdf' }), 'by name or type');
  });
  test('an update can be photos alone; the task carries a line saying so', () => {
    const idx = index();
    const ph = [{ id: 'p1', w: 1280, h: 960, thumb: 'data:,' }, { id: 'p2', w: 960, h: 1280, thumb: 'data:,' }];
    const r = S.postUpdate(idx, 'j1', '  ', { by: BY, at: AT, photos: ph });
    expect([r.updates[0].text, r.updates[0].photos.length, r.patches[0].lastNote.text], ['', 2, 'Added 2 photos']);
    ok(S.postUpdate(idx, 'j1', '', { by: BY, at: AT }).error, 'nothing at all is refused');
    ok(!('photos' in S.postUpdate(idx, 'j1', 'Words only', { by: BY, at: AT }).updates[0]), 'no empty photo list');
  });

  // -------------------------------------------------------------------------
  group = 'sharing';
  const shared = (patches) => T.buildIndex(apply(sampleNodes(), patches));
  test('a job takes the nearest choice above it; its own wins; Not shared stops it', () => {
    const idx = shared([{ id: 'g-alpha', shared: 'stage' }, { id: 'g-alpha-sub', shared: 'status' }, { id: 'j2', shared: 'off' }]);
    expect(SH.shareOf(idx, 'j1').level, 'stage');
    expect(SH.shareOf(idx, 'j1').from.id, 'g-alpha', 'and says where from');
    expect(SH.shareOf(idx, 'j3').level, 'status', 'a sub-group\'s own choice');
    expect(SH.shareOf(idx, 'j2').level, null, 'off inside a shared group');
    expect(SH.shareOf(idx, 'j4').level, null, 'nothing above it chose');
    expect(SH.inherited(idx, 'j2').level, 'stage', 'what it would get without its own choice');
    expect(SH.choiceOf({ shared: true }), null, 'only the three words count');
  });
  test('the flags: on shared jobs; for stage, on the top-level tasks and inside those with nobody on them', () => {
    const withKid = [...sampleNodes(), { id: 'kid', kind: 'task', parentId: 't1', order: 1, title: 'Inside the lead\'s own', status: 'todo', assignee: null }];
    const share = [{ id: 'g-alpha', shared: 'stage' }, { id: 'g-beta', shared: 'status' }];
    const idx = T.buildIndex(apply(withKid, share));
    const p = SH.sharePatches(idx);
    const by = Object.fromEntries(p.map((x) => [x.id, x.shareLevel]));
    expect(Object.keys(by).sort(), ['j1', 'j2', 'j3', 'j4', 's1', 's2', 's2a', 's2b', 's3', 't1', 't2'].sort());
    expect([by.j1, by.s2a, by.t2, by.j4], ['stage', 'stage', 'stage', 'status']);
    ok(!('kid' in by), 'never inside a task someone has');
    ok(!('sec' in by), 'sections are groups, which managers read anyway');
    const after = T.buildIndex(apply(withKid, [...share, ...p]));
    expect(SH.sharePatches(after), [], 'idempotent');
    const unshared = T.buildIndex(apply(after.nodes, [{ id: 'g-alpha', shared: null }]));
    const off = SH.sharePatches(unshared);
    expect(off.map((x) => x.id).sort(), ['j1', 'j2', 'j3', 's1', 's2', 's2a', 's2b', 's3', 't1', 't2'].sort(), 'turned off where it went');
    ok(off.every((x) => x.sharedEffective === false));
    expect(SH.sharePatches(index()), [], 'nothing shared, nothing written');
  });
  test('outside words: Ready for check is Being checked; a send-back is still In progress', () => {
    expect(SH.outsideStatus('check'), { pill: 'check', label: 'Being checked' });
    expect(SH.outsideStatus('fix'), { pill: 'in_progress', label: 'In progress' });
    expect(SH.outsideStatus('waiting').label, 'Waiting');
  });
  test('the Jobs list: shared jobs only, filters, busiest first, done only this month', () => {
    const now = Date.parse('2026-11-20T02:00:00.000Z');
    const idx = shared([
      { id: 'j1', sharedEffective: true, status: 'check', lastActivityAt: '2026-11-19T00:00:00.000Z' },
      { id: 'j2', sharedEffective: true, status: 'fix', lastActivityAt: '2026-11-18T00:00:00.000Z' },
      { id: 'j3', sharedEffective: true, status: 'done', doneAt: '2026-10-30T00:00:00.000Z' },
      { id: 'j4', sharedEffective: true, status: 'done', doneAt: '2026-11-03T00:00:00.000Z' },
      { id: 't1', sharedEffective: true },
    ]);
    const ids = (f, q = '') => SH.jobsList(idx, { filter: f, query: q, now }).map((j) => j.id);
    expect(ids('all'), ['j1', 'j2', 'j4'], 'last month\'s done drops off; a subtask is never listed');
    expect(ids('in_progress'), ['j2']);
    expect(ids('check'), ['j1']);
    expect(ids('done'), ['j4']);
    expect(ids('all', 'small range'), [], 'search reaches the category path');
    expect(ids('all', 'alpha hinge'), ['j2']);
    expect(SH.filterCounts(idx, now), { all: 3, in_progress: 1, waiting: 0, check: 1, done: 1 });
  });
  test('by category: a section per category below the master, deeper groups under the title', () => {
    const idx = shared([{ id: 'j1', sharedEffective: true }, { id: 'j3', sharedEffective: true }, { id: 'j4', sharedEffective: true }]);
    const secs = SH.byCategory(idx, ['j4', 'j3', 'j1'].map((id) => idx.byId.get(id)));
    expect(secs.map((s) => [s.id, s.items.map((x) => [x.job.id, x.sub])]), [['g-alpha', [['j3', 'Small range'], ['j1', '']]], ['g-beta', [['j4', '']]]]);
  });
  test('the stage: the current task, its state, and how far, from the tasks the reader can see', () => {
    const lead = index();
    expect(SH.stageOf(lead, lead.byId.get('j1')).line, 'Head (next) · 2 of 5');
    // A manager reads the categories, the job, and its stage tasks: what the lead's app flags.
    const seen = new Set(['j1', ...SH.stageNodes(lead, 'j1')]);
    const mgr = T.buildIndex(sampleNodes().filter((n) => n.kind === 'group' || seen.has(n.id)));
    const st = SH.stageOf(mgr, mgr.byId.get('j1'));
    expect([st.line, st.strip], ['Head (next) · 2 of 5', ['done', 'doing', 'na', 'todo']], 'the same as the lead sees');
    const waiting = T.buildIndex(apply(mgr.nodes, [{ id: 'j1', status: 'waiting' }]));
    expect(SH.stageOf(waiting, waiting.byId.get('j1')).line, 'Head (waiting) · 2 of 5');
    const doing = T.buildIndex(apply(mgr.nodes, [{ id: 's2b', status: 'in_progress' }]));
    expect(SH.stageOf(doing, doing.byId.get('j1')).line, 'Head (under way) · 2 of 5');
    const theirs = T.buildIndex(apply(mgr.nodes, [{ id: 's2b', status: 'done' }, { id: 't1', status: 'check' }]));
    expect(SH.stageOf(theirs, theirs.byId.get('j1')).line, 'Swap pins to standard (being checked) · 3 of 5', 'a task someone has reads its status from outside');
    expect(SH.stageOf(lead, lead.byId.get('j2')), null, 'nothing inside, no stage');
  });
  test('a manager\'s note: the update in full, the job\'s copy short, one more open', () => {
    const job = { id: 'j1', requestOpen: 1 };
    const r = SH.requestWrite(job, { kind: 'customer', text: `  ${'x'.repeat(400)}  `, cancels: true, by: 'casey@example.test', at: AT });
    expect([r.patch.requestOpen, r.patch.request.text.length, r.patch.request.cancels, r.update.kind, r.update.requestKind, r.update.text.length], [2, SH.REQUEST_LINE_MAX, true, 'request', 'customer', 400]);
    expect(SH.requestWrite({ id: 'j1' }, { kind: 'question', text: 'When?', cancels: true, by: 'c', at: AT }).patch.request.cancels, false, 'only a customer update cancels');
    expect(SH.requestWrite({ id: 'j1' }, { kind: 'nonsense', text: 'Hm', by: 'c', at: AT }).update.requestKind, 'question');
    ok(SH.requestWrite({ id: 'j1' }, { kind: 'question', text: '  ', by: 'c', at: AT }).error, 'nothing written, nothing sent');
    expect(SH.cancelReason({ request: { text: 'Gone with another supplier', by: 'casey@example.test' } }, () => 'Casey'), 'Customer cancelled (via Casey): Gone with another supplier');
    const idx = shared([{ id: 'j2', requestOpen: 1, request: { at: '2026-11-04T05:00:00.000Z' } }, { id: 'j1', requestOpen: 2, request: { at: '2026-11-04T03:00:00.000Z' } }, { id: 'j3', requestOpen: 0 }]);
    expect(SH.requestQueue(idx).map((j) => j.id), ['j1', 'j2'], 'the longest waiting first');
    expect(S.eventLabel({ kind: 'request', requestKind: 'customer', cancels: true }), 'Update from customer · customer cancelled');
  });

  // -------------------------------------------------------------------------
  group = 'steps into tasks (migration)';
  const LEAD_AT = '2026-11-06T00:00:00.000Z';
  const stepIdx = () => T.buildIndex(sampleStepNodes());
  test('every step becomes a task in its place, nobody on it, label to title, state to status', () => {
    const steps = sampleStepNodes().filter(M.isStep);
    const set = M.convertSteps(sampleStepNodes(), { by: BY, at: LEAD_AT });
    expect(set.map((x) => x.id).sort(), steps.map((x) => x.id).sort(), 'only the steps, each once');
    const byId = Object.fromEntries(set.map((x) => [x.id, x]));
    expect(['s1', 's2', 's2a', 's2b', 's3'].map((id) => byId[id].status), ['done', 'todo', 'done', 'todo', 'cancelled']);
    const doing = M.stepAsTask({ id: 'x', kind: 'step', parentId: 'j1', order: 1, label: 'Doing one', state: 'doing', updatedAt: AT }, { by: BY, at: LEAD_AT });
    expect(doing.status, 'in_progress', 'Doing is In progress');
    const s1 = byId.s1;
    expect([s1.kind, s1.title, s1.assignee, s1.parentId, s1.order], ['task', 'Concept', null, 'j1', 1024]);
    ok(!('label' in s1) && !('state' in s1), 'written whole: the step\'s own fields go');
    const at = sampleStepNodes().find((x) => x.id === 's1').updatedAt;
    expect([s1.statusAt, s1.doneAt, s1.lastActivityAt], [at, at, at], 'its times from when it was last changed');
    ok(['brief', 'folders', 'waiting', 'due', 'priority', 'archivedAt', 'cancelled'].every((k) => k in s1), 'every task field written');
  });
  test('an N/a step is cancelled by the lead, "Was N/a", from To do; one that went with its job remembers it', () => {
    const set = M.convertSteps(sampleStepNodes(), { by: BY, at: LEAD_AT });
    const s3 = set.find((x) => x.id === 's3');
    const was = sampleStepNodes().find((x) => x.id === 's3');
    expect(s3.cancelled, { by: BY, at: was.updatedAt, reason: 'Was N/a', prevStatus: 'todo', prevWaiting: null, prevFixNote: null });
    const withJob = M.stepAsTask({ id: 'y', kind: 'step', parentId: 'j1', order: 1, label: 'Y', state: 'na', cancelledFrom: { state: 'doing', withId: 'j1' }, updatedAt: AT }, { by: BY, at: LEAD_AT });
    expect([withJob.cancelled.prevStatus, withJob.cancelled.withId], ['in_progress', 'j1'], 'so reopening the job brings it back where it was');
    ok(!('cancelledFrom' in withJob));
  });
  test('converted, the tree reads as before: the same progress, strip and next task', () => {
    const before = stepIdx();
    const nodes = apply(sampleStepNodes(), M.convertSteps(sampleStepNodes(), { by: BY, at: LEAD_AT }));
    const idx = T.buildIndex(nodes);
    expect(T.progress(idx, 'j1'), { done: 2, total: 5 });
    expect(TM.stageStrip(idx, 'j1'), ['done', 'doing', 'na', 'todo']);
    expect(T.nameOf(T.nextTask(idx, 'j1')), 'Head');
    ok(before.byId.get('s1').kind === 'step' && idx.byId.get('s1').kind === 'task');
    ok(!idx.nodes.some(M.isStep), 'no step left');
  });
  test('archived steps convert too, and stay archived; everything else is left alone', () => {
    const nodes = [...sampleStepNodes(), { id: 'old', kind: 'step', parentId: 'j4', order: 1, label: 'Old', state: 'done', archivedAt: AT }];
    const set = M.convertSteps(nodes, { by: BY, at: LEAD_AT });
    expect(set.find((x) => x.id === 'old').archivedAt, AT);
    ok(!set.some((x) => ['j1', 't1', 'g-alpha', 'sec'].includes(x.id)), 'tasks and groups are not rewritten');
    expect(M.convertSteps(apply(nodes, set), { by: BY, at: LEAD_AT }), [], 'run again, it finds nothing');
  });
  test('until it has run, a step is read as the task it becomes', () => {
    const raw = sampleStepNodes().find((x) => x.id === 's2b');
    const read = M.readNode(raw);
    expect([read.kind, read.title, read.status, read.assignee, read.legacyStep], ['task', 'Head', 'todo', null, true]);
    expect(M.readNode(sampleStepNodes().find((x) => x.id === 'j1')).legacyStep, undefined, 'a task is read as it is');
    const idx = T.buildIndex(sampleStepNodes().map(M.readNode));
    expect(T.progress(idx, 'j1'), { done: 2, total: 5 });
    ok(T.isLight(idx, idx.byId.get('s2b')), 'part of its job, as it will be');
  });
  test('a change to a step not yet converted is written as a step; what a step cannot hold is refused', () => {
    const raw = sampleStepNodes().find((x) => x.id === 's2b');
    expect(M.stepPatch(raw, { id: 's2b', status: 'done', updatedAt: AT, lastActivityAt: AT, statusAt: AT, doneAt: AT }).patch, { id: 's2b', state: 'done', updatedAt: AT }, 'a tick is its state');
    expect(M.stepPatch(raw, { id: 's2b', status: 'in_progress', waiting: null }).patch, { id: 's2b', state: 'doing' });
    expect(M.stepPatch(raw, { id: 's2b', title: 'Head plate' }).patch, { id: 's2b', label: 'Head plate' }, 'a new name is its label');
    expect(M.stepPatch(raw, { id: 's2b', status: 'cancelled', cancelled: { by: BY, at: AT, reason: '', prevStatus: 'todo', withId: 'j1' } }).patch,
      { id: 's2b', state: 'na', cancelledFrom: { state: 'todo', withId: 'j1' } }, 'cancelled with its job: N/a, remembering it');
    expect(M.stepPatch(raw, { id: 's2b', archivedAt: AT, parentId: 'j2', order: 5 }).patch, { id: 's2b', archivedAt: AT, parentId: 'j2', order: 5 }, 'moved and archived as it is');
    expect(M.stepPatch(raw, { id: 's2b', lastActivityAt: AT, updatedAt: AT }).patch, null, 'activity alone: nothing to write on a step');
    for (const p of [{ status: 'waiting' }, { status: 'check' }, { assignee: 'alex@example.test' }, { brief: 'x' }, { folders: [] }]) {
      ok(M.stepPatch(raw, { id: 's2b', ...p }).error, `refused: ${Object.keys(p)[0]}`);
    }
  });

  // -------------------------------------------------------------------------
  group = 'time tracking';
  // Local clock times on an invented Monday, 9 Nov 2026: the logic reads local parts, as the app does.
  const L = (h, m = 0, s = 0, d = 9) => new Date(2026, 10, d, h, m, s).toISOString();
  const WD = TC.DEFAULT_WORKDAY;
  const DA2 = 'alex@example.test';
  const tracked = (patches = []) => T.buildIndex(apply(sampleNodes(), [{ id: 'j1', timeTracked: true, status: 'in_progress' }, ...patches]));
  const run1 = (o = {}) => ({ id: 'e1', jobId: 'j1', taskId: 't1', by: BY, start: L(9), end: null, ...TC.nextStop(L(9), WD), source: 'timer', day: '2026-11-09', ...o });
  test('the day\'s stops: lunch before lunch, finish after, an hour on after finish', () => {
    expect(TC.nextStop(L(9), WD), { stopAt: L(12), stopFor: 'lunch' });
    expect(TC.nextStop(L(12, 10), WD), { stopAt: L(16, 30), stopFor: 'finish' }, 'started during lunch: runs to finish');
    expect(TC.nextStop(L(13), WD), { stopAt: L(16, 30), stopFor: 'finish' });
    expect(TC.nextStop(L(17), WD), { stopAt: L(18), stopFor: 'finish' }, 'after finish: an hour');
  });
  test('Keep going: lunch to finish, finish to an hour later', () => {
    expect(TC.keepGoing({ stopAt: L(12), stopFor: 'lunch' }, WD), { stopAt: L(16, 30), stopFor: 'finish' });
    expect(TC.keepGoing({ stopAt: L(16, 30), stopFor: 'finish' }, WD), { stopAt: L(17, 30), stopFor: 'finish' });
  });
  test('the warning comes five minutes before the stop, in the owner\'s words', () => {
    const e = run1();
    expect([L(11, 54), L(11, 55), L(11, 59, 59), L(12)].map((t) => TC.warningDue(e, t)), [false, true, true, false]);
    expect(TC.warningText(e, WD), 'Timer pauses at 12:00 for lunch and restarts at 12:30');
    expect(TC.warningText({ stopAt: L(16, 30), stopFor: 'finish' }, WD), 'Timer stops at 4:30, end of day');
    expect(TC.warningText({ stopAt: L(17, 30), stopFor: 'finish' }, WD), 'Timer stops at 5:30', 'kept going: the same warning again');
  });
  test('a workday out of order falls back to the defaults', () => {
    expect(TC.workdayOf({ lunchStart: '13:00', lunchEnd: '12:30', finish: '16:30' }), WD);
    expect(TC.workdayOf({ lunchStart: '11:45', finish: '17:00' }), { lunchStart: '11:45', lunchEnd: '12:30', finish: '17:00' });
    ok(TC.workdayProblem({ lunchStart: '12:00', lunchEnd: '12:30', finish: '12:15' }), 'finish before lunch end');
    expect(TC.workdayProblem(WD), null);
  });
  test('the stop is in the data: left running overnight, nothing past lunch counts', () => {
    const idx = tracked();
    const e = run1();
    expect(TC.stopOf(e, idx.byId.get('j1'), L(11)), null, 'still going');
    expect(TC.stopOf(e, idx.byId.get('j1'), L(7, 0, 0, 10)), { end: L(12), pausedFor: 'lunch' }, 'next morning: closed at its stop, a lunch pause');
    expect(TC.fmt(TC.msOf(e, idx.byId.get('j1'), L(7, 0, 0, 10))), '3h');
    const late = { ...run1(), start: L(13), ...TC.nextStop(L(13), WD) };
    expect(TC.stopOf(late, idx.byId.get('j1'), L(20)), { end: L(16, 30), pausedFor: null }, 'end of day is no pause');
  });
  test('the job leaving the bench stops it when it left; untracked or gone stops it now', () => {
    const e = run1();
    for (const status of ['check', 'done', 'cancelled', 'waiting']) {
      const idx = tracked([{ id: 'j1', status, statusAt: L(10, 30) }]);
      expect(TC.stopOf(e, idx.byId.get('j1'), L(11)), { end: L(10, 30), pausedFor: null }, status);
    }
    expect(TC.stopOf(e, tracked([{ id: 'j1', status: 'fix' }]).byId.get('j1'), L(11)), null, 'sent back is still on the bench');
    expect(TC.stopOf(e, tracked([{ id: 'j1', timeTracked: false }]).byId.get('j1'), L(11)), { end: L(11), pausedFor: null });
    expect(TC.stopOf(e, undefined, L(11)), { end: L(11), pausedFor: null });
  });
  test('time follows the task in progress: the newest started, mine or nobody\'s, else the job', () => {
    const idx = tracked();
    expect(TC.followTarget(idx, 'j1', BY), 't1', 'the lead\'s own task, under way');
    expect(TC.followTarget(idx, 'j1', DA2), null, 'someone else\'s task is theirs to time: the job');
    const two = tracked([{ id: 's2b', status: 'in_progress', statusAt: L(10) }, { id: 't1', statusAt: L(9) }]);
    expect(TC.followTarget(two, 'j1', BY), 's2b', 'started more recently');
    expect(TC.followTarget(two, 'j1', DA2), 's2b', 'part of the job: anyone\'s');
    const box = tracked([{ id: 's2', status: 'in_progress', statusAt: L(11) }, { id: 't1', status: 'todo' }]);
    expect(TC.followTarget(box, 'j1', BY), null, 'a task holding tasks is passed over for its insides');
  });
  test('when the task in progress changes, one entry closes and the next opens, the same on every device', () => {
    const idx = tracked([{ id: 't1', status: 'done' }, { id: 's2b', status: 'in_progress', statusAt: L(10) }]);
    const r = TC.reconcileMine([run1()], { idx, now: L(10), me: BY });
    expect(r.close, [{ id: 'e1', end: L(10) }]);
    expect([r.open[0].taskId, r.open[0].start, r.open[0].stopAt, r.open[0].id], ['s2b', L(10), L(12), TC.followId('e1', 's2b')]);
    expect(TC.reconcileMine([run1()], { idx, now: L(10, 0, 3), me: BY }).open[0].id, r.open[0].id, 'a second device writes the same entry');
    expect(TC.reconcileMine([run1()], { idx: tracked(), now: L(10), me: BY }), { close: [], open: [] }, 'nothing changed: nothing written');
  });
  test('one timer per person: two running (devices raced), the newest stays', () => {
    const r = TC.reconcileMine([run1(), run1({ id: 'e2', start: L(10) })], { idx: tracked(), now: L(10, 5), me: BY });
    expect(r.close.map((c) => c.id), ['e1']);
  });
  test('the lead\'s app closes others\' timers whose stop has come, at the stop', () => {
    const idx = tracked();
    const theirs = run1({ id: 'a1', by: DA2 });
    expect(TC.closeForOthers([theirs, run1()], { idx, now: L(13), me: BY }), [{ id: 'a1', end: L(12), pausedFor: 'lunch' }]);
    expect(TC.closeForOthers([theirs], { idx, now: L(11), me: BY }), []);
  });
  test('lunch: the pause restarts once, at lunch end; opened later, from then, with lunch end offered', () => {
    const idx = tracked();
    const paused = run1({ end: L(12), pausedFor: 'lunch' });
    const on = TC.lunchRestart([paused], [], { idx, now: L(12, 30, 20), workday: WD, me: BY });
    expect([on.late, on.entry.start, on.entry.stopAt, on.entry.taskId, on.entry.id], [false, L(12, 30), L(16, 30), 't1', TC.restartId('e1')]);
    const late = TC.lunchRestart([paused], [], { idx, now: L(13, 10), workday: WD, me: BY });
    expect([late.late, late.entry.start, late.lunchEnd], [true, L(13, 10), L(12, 30)]);
    expect(TC.lunchRestart([paused, { ...on.entry, end: L(13) }], [], { idx, now: L(14), workday: WD, me: BY }), null, 'once: restarted and stopped since, it stays stopped');
    expect(TC.lunchRestart([paused], [run1({ id: 'x', start: L(12, 40) })], { idx, now: L(12, 45), workday: WD, me: BY }), null, 'a timer running already');
    expect(TC.lunchRestart([paused], [], { idx, now: L(12, 20), workday: WD, me: BY }), null, 'still lunch');
    expect(TC.lunchRestart([paused], [], { idx, now: L(16, 40), workday: WD, me: BY }), null, 'past finish');
    expect(TC.lunchRestart([paused], [], { idx: tracked([{ id: 'j1', status: 'waiting' }]), now: L(12, 31), workday: WD, me: BY }), null, 'the job left the bench');
    expect(TC.lunchRestart([run1({ end: L(11, 50) })], [], { idx, now: L(12, 31), workday: WD, me: BY }), null, 'only a lunch pause restarts, not a Pause');
  });
  test('roll-ups: a task\'s time includes the tasks inside it, and the live one ticks into its stage', () => {
    const idx = tracked();
    const e = (id, taskId, h1, h2) => ({ id, jobId: 'j1', taskId, by: BY, start: L(h1), end: L(h2), source: 'timer' });
    const list = [e('a', 't1', 8, 9), { ...e('b', 's2b', 9, 10), end: L(9, 30) }, e('c', null, 10, 11), e('d', 'gone', 13, 14), { ...run1({ id: 'r', start: L(14), stopAt: L(16, 30), stopFor: 'finish' }) }];
    const t = TC.totals(idx, 'j1', list, L(14, 15));
    expect(TC.fmt(t.get('s2')), '1h 45m', '3D model: t1 (with the running quarter hour) and Head');
    expect(TC.fmt(t.get('t1')), '1h 15m', 'with the running quarter hour');
    expect(TC.fmt(t.get('j1')), '3h 45m', 'the job: everything, an entry on a task gone included');
    expect(TC.closedMinutes(list), 210, 'timeTotal: closed entries only');
    expect([...TC.liveNodes(idx, list[4])].sort(), ['j1', 's2', 't1']);
  });
  test('the log: by day, newest first; the CSV for a quote, with the stage', () => {
    const idx = tracked([{ id: 't1', title: 'Swap pins, standard' }]);
    const list = [
      { id: 'a', jobId: 'j1', taskId: 't1', by: BY, start: L(8, 5, 0, 6), end: L(9, 35, 0, 6) },
      { id: 'b', jobId: 'j1', taskId: null, by: DA2, start: L(13, 0), end: L(13, 45) },
    ];
    expect(TC.byDay(list).map((d) => [d.day, d.entries.map((x) => x.id)]), [['2026-11-09', ['b']], ['2026-11-06', ['a']]]);
    const csv = TC.csvOf(idx, 'j1', list, { now: L(17), who: (e) => (e === BY ? 'Lead' : 'Alex') }).split('\r\n');
    expect(csv[0], 'Day,Start,Stop,Minutes,Task,Stage,Person');
    expect(csv[1], '2026-11-06,08:05,09:35,90,"Swap pins, standard",3D model,Lead');
    expect(csv[2], '2026-11-09,13:00,13:45,45,Bracket redesign,,Alex');
  });
  test('time typed in: a start, a stop after it, not still to come', () => {
    expect(TC.entryProblem({ start: L(9), end: L(10) }, L(12)), null);
    ok(TC.entryProblem({ start: L(10), end: L(9) }, L(12)), 'stop before start');
    ok(TC.entryProblem({ start: L(9), end: L(13) }, L(12)), 'in the future');
    expect(TC.instantOf('2026-11-09', '14:05'), L(14, 5));
    expect([TC.hmOf(L(14, 5)), TC.clock(L(16, 30)), TC.clockAmPm(L(9, 5))], ['14:05', '4:30', '9:05 am']);
    expect([TC.fmt(0), TC.fmt(35 * 60000), TC.fmt(275 * 60000), TC.fmt(120 * 60000)], ['0m', '35m', '4h 35m', '2h']);
  });

  group = 'writes';
  test('a template makes tasks with nobody on them - part of the job - every field written', () => {
    let k = 0;
    const tasks = T.tasksFromTemplate([{ label: 'A', children: [{ label: 'A1' }] }, 'B'], 'job1', { at: AT, by: BY, newId: () => `s${++k}` });
    expect(tasks.length, 3);
    ok(tasks.every((x) => x.kind === 'task' && x.assignee === null && x.status === 'todo' && x.archivedAt === null), 'tasks, nobody on them');
    ok(tasks.every((x) => x.createdBy === BY), 'every one has createdBy');
    expect(tasks.find((x) => x.title === 'A1').parentId, tasks.find((x) => x.title === 'A').id);
  });
  test('the tests page stays pure: no store, no Firebase', () => {
    const loaded = performance.getEntriesByType('resource').map((e) => e.name);
    ok(!loaded.some((u) => /\/js\/(store|firebase|actions|state)\.js|gstatic\.com/.test(u)), loaded.filter((u) => /store|firebase|actions|state|gstatic/.test(u)).join(', '));
  });

  return results;
}
