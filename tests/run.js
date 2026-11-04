// run.js — the browser tests. Open /tests/ with the local server running
// (`python -m http.server 8790`). Pure logic only; every fixture is invented.

import * as T from '../js/tree.js';
import * as S from '../js/status.js';
import * as F from '../js/folders.js';
import * as D from '../js/dates.js';
import * as TD from '../js/import/tiledo.js';
import * as XL from '../js/import/excel.js';
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
  test('step states cycle To do → Doing → Done → N/a', () => {
    expect(['todo', 'doing', 'done', 'na'].map(S.nextStepState), ['doing', 'done', 'na', 'todo']);
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
    expect(xp.sections.map((s) => s.rows.length), [5, 3]);
  });
  test('Status and Checked map onto statuses', () => {
    const m = xp.sections[0].rows.map((r) => XL.mapRow(r).status);
    expect(m, ['in_progress', 'done', 'fix', 'todo', 'cancelled']);
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
    expect(built.stats.jobs, 8);
    const a = built.nodes.find((x) => x.title === 'Alpha bracket R2');
    expect(a.brief, 'Use the standard pins');
    ok(built.updates.some((u) => u.taskId === a.id && u.text === 'Drawings half done'), 'first update');
    expect(built.nodes.find((x) => x.title === 'Beta frame laser').checkedBy, BY);
    ok(built.nodes.find((x) => x.title === 'Beta frame laser').archivedAt, 'done archived');
    expect(built.nodes.find((x) => x.title === 'Gamma panel').archivedAt, null, 'fix stays live');
  });
  test('skipped rows are not written', () => {
    const built = XL.buildExcel(xp, { into: {}, skip: new Set(['0:0', '0:1']) }, { idx: empty, by: BY, at: AT, newId });
    expect(built.stats.jobs, 6);
    expect(built.stats.skipped, 2);
  });

  return results;
}
