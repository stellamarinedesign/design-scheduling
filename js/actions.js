// actions.js — every change the app makes, in one place.
//
// A view never writes. It calls one of these, which works out the patches
// with the pure logic (tree.js, status.js), writes them as ONE store commit,
// and says what happened in a toast — with Undo for the changes that are easy
// to make by mistake (status, approve, archive, move), instead of a confirm
// in front of them. Deleting is the one thing behind a confirm, which starts
// on Cancel.
//
// Writes are not awaited before the toast. Firestore applies them to its
// cache at once (the live query redraws straight away) and to the server when
// it can; on a phone with no signal that can be minutes, and the toast should
// not wait for it. A write that fails says so in the warning toast.

import { state, node, isMine, personName, realName, noteOf, setLog } from './state.js';
import { Store } from './store.js';
import * as T from './tree.js';
import * as S from './status.js';
import { nowISO, dayOf } from './dates.js';
import { toast, toastError } from './ui.js';
import * as C from './convert.js';
import { confirmDialog, promptDialog } from './dialog.js';
import * as TM from './team.js';
import * as NT from './notes.js';
import { mergeNotes } from './notes.js';
import * as PH from './photos.js';
import * as SH from './sharing.js';
import * as M from './migrate.js';
import { openNote, openTask } from './router.js';

const ctx = () => ({ by: state.me, at: nowISO(), role: state.role, canWrite });

const mineDoc = (n) => Boolean(n) && (n.createdBy === state.me || n.assignee === state.me);

/**
 * The rules' walk for a designer (firestore.rules, ownsParentOf): is the
 * node's parent theirs, or - through sections and tasks with nobody on them
 * - the task above that, at most four levels up? That is "inside work they
 * can edit": a job of theirs, or a task in someone's job assigned to them.
 */
function ownsParentOf(n) {
  let p = n?.parentId ? node(n.parentId) : null;
  if (!p) return false;
  if (mineDoc(p)) return true;
  for (let level = 2; level <= 4; level++) {
    const through = p.parentId && (p.kind === T.KIND.group || p.kind === T.KIND.step || (p.kind === T.KIND.task && !p.assignee));
    if (!through) return false;
    p = node(p.parentId);
    if (!p) return false;
    if (p.kind === T.KIND.task && mineDoc(p)) return true;
  }
  return false;
}

/**
 * Would the rules let this person write this task? The same test the
 * Firestore rules make for a designer: their own tasks (made by them or
 * assigned to them), and a task with nobody on it inside work of theirs -
 * which, being part of the job, they may also tick Done. A batch with one
 * refused write fails whole, so knock-on changes (unblocks, cascades,
 * activity times) on tasks that are not ours are left out; the reconcile,
 * run by someone who can write them, catches the unblocks.
 */
export function canWrite(t) {
  if (state.role === 'lead') return true;
  if (state.role !== 'designer' || !t) return false;
  if (T.isLight(state.idx, t)) return ownsParentOf(t);
  return mineDoc(t);
}

/**
 * May this person change a node that is not a task (a section inside a
 * job)? The rules' test: it sits inside work of theirs.
 */
export const canEdit = (n) => (n?.kind === T.KIND.task ? canWrite(n)
  : state.role === 'lead' || (state.role === 'designer' && ownsParentOf(n)));

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * A change that touches steps not converted yet (migrate.js) is written in
 * a step's own terms. Null when it can be; the sentence when a step cannot
 * hold it.
 */
function asStepWrites(c) {
  if (!state.rawSteps.length || !c.patch?.length) return null;
  const out = [];
  for (const p of c.patch) {
    const n = node(p.id);
    if (!n?.legacyStep) { out.push(p); continue; }
    const r = M.stepPatch(state.rawSteps.find((s) => s.id === p.id), p);
    if (r.error) return r.error;
    if (r.patch) out.push(r.patch);
  }
  c.patch = out;
  return null;
}

/**
 * Write a change; a failure is said, never swallowed. Whoever makes activity
 * on a task is noted with it (`lastBy`), which is how Crew knows when a
 * designer was last heard from without reading every timeline.
 */
export function write(change, what = 'That did not save') {
  const stamp = (p) => ('lastActivityAt' in p && !('lastBy' in p) ? { ...p, lastBy: state.me } : p);
  const c = { ...change };
  if (c.patch) c.patch = c.patch.map(stamp);
  if (c.set) c.set = c.set.map((n) => (n.kind === T.KIND.task ? stamp(n) : n));
  const refused = asStepWrites(c);
  // Refused before it is sent, but said the same way as a refusal from the
  // server: after the toast the action shows, in place of it.
  const p = refused ? Promise.reject(new Error(refused)) : Store.commit(c);
  p.catch((e) => toastError(e, what));
  return p;
}

/** The patches that put back what `patches` change. */
function inverseOf(patches) {
  return patches.map((p) => {
    const cur = node(p.id) ?? {};
    const inv = { id: p.id };
    for (const k of Object.keys(p)) if (k !== 'id') inv[k] = cur[k] ?? null;
    return inv;
  });
}

/** Merge patches for the same node, later winning. */
function mergePatches(list) {
  const m = new Map();
  for (const p of list) m.set(p.id, { ...(m.get(p.id) ?? {}), ...p });
  return [...m.values()];
}

// ---------------------------------------------------------------------------
// new nodes
// ---------------------------------------------------------------------------

/** A task node with every field written, so queries and rules see real values. */
export function taskNode({ id = Store.newId(), parentId = null, order, title, brief = '', at = nowISO(), status = 'todo', assignee = state.me }) {
  return T.blankTask({ id, parentId, order, title, brief, at, by: state.me, status, assignee });
}

/** Tasks from a template, under a parent: nobody on them, part of the job. */
export const fromTemplate = (template, parentId, at = nowISO()) => T.tasksFromTemplate(template, parentId, { at, by: state.me, newId: Store.newId });

/** How many tasks a template makes, the ones inside others included. */
const templateCount = (list) => (list ?? []).reduce((s, t) => s + 1 + templateCount(typeof t === 'string' ? [] : t.children), 0);

/** The colour least used so far, so categories spread across the ten. */
function nextColour() {
  const count = new Array(11).fill(0);
  for (const n of state.nodes) if (n.kind === T.KIND.group && n.colour) count[n.colour] += 1;
  let best = 1;
  for (let c = 2; c <= 10; c++) if (count[c] < count[best]) best = c;
  return best;
}

/**
 * A new job (or a task, when the parent is a task or a section in a job).
 * A job takes the tasks template of its nearest group unless told not to.
 * @returns {string} the new id
 */
export function createTask({ title, parentId = null, brief = '', useTemplate = true, assignee, onFail = null }) {
  const at = nowISO();
  const parent = parentId ? node(parentId) : null;
  const inJob = parent && (parent.kind === T.KIND.task || parent.kind === T.KIND.step || T.isSection(state.idx, parent));
  // Who it is for: as asked; inside a job, nobody - it is part of the job,
  // ticked by whoever has it, until someone is assigned (2026-11-06);
  // otherwise whoever adds it.
  let who = assignee !== undefined ? assignee : inJob ? null : state.me;
  // A designer adds work for themselves or for nobody yet; handing it to
  // someone else is the lead's (the rules refuse it).
  if (state.role !== 'lead' && who && who !== state.me) who = state.me;
  // A parent that is not here yet (a designer's own group, before the lead's
  // app has made it): after whatever already names it.
  const order = parentId && !parent
    ? Math.max(0, ...state.nodes.filter((x) => x.parentId === parentId).map((x) => x.order ?? 0)) + T.ORDER_GAP
    : T.newOrder(state.idx, parentId, inJob ? 'end' : 'beforeGroups');
  const n = taskNode({ parentId, order, title, brief, at, assignee: who });
  const set = [n];
  if (useTemplate && !inJob && parentId) {
    const t = T.stepsTemplateOf(state.idx, parentId);
    if (t) set.push(...fromTemplate(t.template, n.id, at));
  }
  // A task added inside a job is activity on the job (and the tasks above it).
  write({ set, patch: inJob && parent ? touchJob(parentId, at) : [], updates: inJob ? [] : [{ taskId: n.id, at, by: state.me, kind: 'create', text: '' }] },
    onFail ? `"${title.length > 60 ? `${title.slice(0, 57)}…` : title}" was not added (it is back in the box)` : undefined)
    .catch(() => onFail?.());
  return n.id;
}

/** A new group: a master category at the top, a category, or a section in a job. */
export function createGroup({ name, parentId = null, kind = T.KIND.group }) {
  const at = nowISO();
  const parent = parentId ? node(parentId) : null;
  const isCategory = parent && !T.isSection(state.idx, parent) && parent.kind === T.KIND.group && !parent.parentId;
  const n = {
    id: Store.newId(), kind, parentId, order: T.newOrder(state.idx, parentId, 'end'),
    name: String(name).trim(), createdBy: state.me, createdAt: at, updatedAt: at, archivedAt: null,
  };
  if (isCategory && kind === T.KIND.group) n.colour = nextColour();
  const problem = T.nestProblem(T.buildIndex([...state.nodes, n]), n.id, parentId);
  if (problem) { toast(problem, { warn: true }); return null; }
  write({ set: [n] });
  return n.id;
}

/** Tasks from the nearest template, added to a job that has nothing inside yet. */
export function applyTemplate(jobId) {
  const t = T.stepsTemplateOf(state.idx, jobId);
  if (!t) return;
  const at = nowISO();
  const base = T.newOrder(state.idx, jobId, 'start');
  const tasks = fromTemplate(t.template, jobId, at).map((s) => (s.parentId === jobId ? { ...s, order: base - (t.template.length * T.ORDER_GAP) + s.order } : s));
  write({ set: tasks, patch: touchJob(jobId, at) });
  toast(`Added ${plural(templateCount(t.template), 'task')} from ${T.nameOf(t.from)}`);
}

/**
 * Activity at a node moves the "last activity" of every task above it - the
 * sub-job it sits in as well as the job - which is what keeps them out of the
 * Backlog. `self` includes the node itself when it is a task. Only tasks this
 * person may write: one refused write would fail the whole batch.
 */
function touchJob(id, at, { self = true } = {}) {
  return T.activityTargets(state.idx, id)
    .filter((t) => (self || t !== id) && canWrite(node(t)))
    .map((t) => ({ id: t, lastActivityAt: at, updatedAt: at }));
}

// ---------------------------------------------------------------------------
// status
// ---------------------------------------------------------------------------

const STATUS_WORD = {
  todo: 'Back to To do', in_progress: 'Started', waiting: 'Waiting', check: 'Submitted for check',
  fix: 'Sent back', done: 'Marked done', cancelled: 'Cancelled',
};

/**
 * Change a task's status. Waiting asks what it waits on; a send-back asks
 * why; Done on a job with open work inside asks whether to close it too.
 */
export async function setStatus(id, to, { comment, note, blockedBy, reason, advance = false, clearRequests = false } = {}) {
  const t = node(id);
  if (!t || t.kind !== T.KIND.task) return;
  const from = t.status ?? 'todo';
  if (to === 'waiting' && note === undefined && blockedBy === undefined) {
    const { waitingDialog } = await import('./views/pickers.js');
    const r = await waitingDialog(id);
    if (!r) return;
    ({ note, blockedBy } = r);
  }
  if (to === 'fix' && from === 'check' && comment === undefined) {
    comment = await promptDialog({ title: 'Send back', label: 'What needs fixing?', multiline: true, ok: 'Send back', body: 'The comment shows on the task, highlighted, until it is resubmitted.' });
    if (comment === null) return;
  }
  if (to === 'cancelled' && reason === undefined) {
    // Finished like Done, recorded apart: say why, for later (optional).
    const inside = T.cascadeTargets(state.idx, id);
    const tasks = inside.tasks.filter((x) => canWrite(node(x))).length;
    const what = tasks ? plural(tasks, 'open task') : '';
    reason = await promptDialog({
      title: `Cancel ${t.title}?`, label: 'Reason (optional)', value: 'Customer cancelled', required: false,
      ok: 'Mark cancelled', dismiss: 'Keep it',
      body: `It leaves the active lists and stops holding anything up, but stays on record with its reason.${what ? ` Its ${what} are cancelled with it.` : ''} Reopen brings it back.`,
    });
    if (reason === null) return;
  }
  const c = ctx();
  const extra = { patches: [], updates: [] };
  if (to === 'done') {
    const open = T.cascadeTargets(state.idx, id);
    if (open.tasks.length) {
      // Tasks waiting for check are never closed from here: that would approve
      // them without anyone checking. They are named and left as they are.
      const inCheck = open.tasks.filter((x) => node(x)?.status === 'check').length;
      const closable = open.tasks.length - inCheck;
      const what = closable ? plural(closable, 'open task') : '';
      const ans = !what ? 'alt' : await confirmDialog({
        title: 'Close what is still open inside?',
        body: `${t.title} still has ${what}.${inCheck ? ` ${plural(inCheck, 'task')} waiting for check ${inCheck === 1 ? 'stays' : 'stay'} as ${inCheck === 1 ? 'it is' : 'they are'}.` : ''}`,
        ok: 'Close them too', alt: 'Leave them open', cancel: 'Cancel',
      });
      if (!ans) return;
      if (ans === 'ok') {
        const closed = S.closeInside(state.idx, id, c);
        const override = { [id]: 'done' };
        for (const tid of closed.tasks) override[tid] = 'done';
        extra.patches.push(...closed.patches);
        extra.updates.push(...closed.updates);
        const more = S.unblockFor(state.idx, closed.tasks, { ...c, statusOverride: override });
        extra.patches.push(...more.patches);
        extra.updates.push(...more.updates);
      }
    }
  }
  const r = S.changeStatus(state.idx, id, to, { ...c, comment, note, blockedBy, reason });
  if (r.error) { toast(r.error, { warn: true }); return; }
  if (!r.patches.length) return;
  // The checkbox's auto-advance: the next To-do subtask starts in the same
  // write, so the one Undo puts both back.
  let started = null;
  if (advance && (to === 'done' || to === 'check')) {
    const next = node(S.nextTaskToStart(state.idx, id));
    if (next && canWrite(next)) {
      const r2 = S.changeStatus(state.idx, next.id, 'in_progress', c);
      if (!r2.error && r2.patches.length) { extra.patches.push(...r2.patches); extra.updates.push(...r2.updates); started = next; }
    }
  }
  // Cancelled from a customer's update: that note is answered by it.
  if (clearRequests) extra.patches.push({ id, requestOpen: 0 });
  // A tick inside a job is activity on the job (and any task of its own it
  // sits in), as ticking a step always was: it keeps them out of the Backlog.
  const above = touchJob(id, c.at, { self: false }).filter((p) => !r.patches.some((x) => x.id === p.id));
  const patches = mergePatches([...r.patches, ...extra.patches, ...above]);
  const inverse = inverseOf(patches);
  write({ patch: patches, updates: [...r.updates, ...extra.updates] });
  const unblocked = [...r.updates, ...extra.updates].filter((u) => u.kind === 'unblock').length;
  // Counted from the changes, not the timeline: tasks part of the job are
  // cancelled and reopened with it without an entry of their own.
  const withIt = r.patches.filter((p) => p.id !== id && 'cancelled' in p && 'status' in p).length;
  const word = from === 'check' && to === 'done' ? 'Approved'
    : from === 'check' && to === 'in_progress' ? 'Taken back from check'
    : from === 'cancelled' ? `Reopened · ${S.LABEL[to]}`
      : from === 'waiting' && to !== 'waiting' ? `Stopped waiting · ${S.LABEL[to]}` : STATUS_WORD[to];
  toast(`${word}${started ? ` · started ${started.title}` : ''}${withIt ? ` · ${plural(withIt, 'task')} with it` : ''}${unblocked ? ` · ${plural(unblocked, 'task')} unblocked` : ''}`, {
    action: 'Undo',
    onAction: () => write({ patch: inverse, updates: [
      { taskId: id, at: nowISO(), by: state.me, kind: 'status', from: to, to: from, text: 'Undone' },
      ...(started ? [{ taskId: started.id, at: nowISO(), by: state.me, kind: 'status', from: 'in_progress', to: started.status ?? 'todo', text: 'Undone' }] : []),
    ] }),
  });
}

/**
 * Take back from Ready for check (whoever submitted it): back to In progress,
 * with an optional note that goes in the timeline.
 */
export async function takeBack(id) {
  const t = node(id);
  if (!t || t.status !== 'check') return;
  const note = await promptDialog({
    title: 'Take it back from check?', label: 'Note (optional)', placeholder: 'e.g. forgot a part', required: false,
    ok: 'Take back', dismiss: 'Leave it with the lead',
    body: 'It goes back to In progress; submit it again when it is ready.',
  });
  if (note === null) return;
  setStatus(id, 'in_progress', { comment: note });
}

/** One tap: To do (or Fix) → In progress. */
export const start = (id) => setStatus(id, 'in_progress');

/** Reopen a cancelled task: back to where it was before. */
export const reopen = (id) => { const t = node(id); if (t) setStatus(id, S.reopenTo(t)); };

/**
 * Post an update, with photos if any (prepared by photos.js): the photos and
 * the update go in one batch. On a To-do task it starts it.
 */
export function postUpdate(id, text, photos = [], { onFail = null } = {}) {
  const c = ctx();
  const refs = photos.map((p) => ({ ...PH.refOf(p), by: state.me }));
  const r = S.postUpdate(state.idx, id, text, { ...c, canWrite: canWrite(node(id)), photos: refs });
  if (r.error) { toast(r.error, { warn: true }); return false; }
  // A reply on a job answers the managers' notes waiting on it.
  if (r.patches[0] && (node(id)?.requestOpen ?? 0) > 0) r.patches[0].requestOpen = 0;
  const patches = [...r.patches, ...touchJob(id, c.at, { self: false })];
  write({ patch: patches, updates: r.updates, images: photos.map((p) => ({ ...p, by: state.me, at: c.at })) }, 'The update did not post (its words are back in the box)')
    .catch(() => onFail?.());
  if (r.patches[0]?.status === 'in_progress') toast('Posted, and started');
  else if (photos.length && offline()) toast('Will post when back online');
  return true;
}

/** Firestore holds writes made with no connection and sends them later. */
const offline = () => Store.offline();

// ---------------------------------------------------------------------------
// fields
// ---------------------------------------------------------------------------

/** Change fields on a node. Tasks count it as activity. */
export function updateFields(id, fields, { message = null, undo = false } = {}) {
  const n = node(id);
  if (!n) return;
  const at = nowISO();
  const patch = { id, ...fields, updatedAt: at };
  if (n.kind === T.KIND.task) patch.lastActivityAt = at;
  const inverse = inverseOf([patch]);
  write({ patch: [patch, ...touchJob(id, at, { self: false })] });
  if (message) toast(message, undo ? { action: 'Undo', onAction: () => write({ patch: inverse }) } : {});
}

/**
 * THE CHECK CONTROL on every task inside a job (decided 2026-11-04; one
 * control since steps merged into tasks, 2026-11-06). A click goes forward,
 * a right-click or long-press backwards (status.js says where to). A task
 * with nobody on it is part of its job: To do → In progress → Done, for
 * whoever may edit the job. One with an assignee goes through the check for
 * anyone but the lead. Ticking one Done (or Ready for check) starts the next
 * To-do task at its level if it is nobody's or the same person's. One write,
 * one Undo for both.
 * @param {1|-1} dir
 */
export function tick(id, dir = 1) {
  const n = node(id);
  if (!n || n.kind !== T.KIND.task) return;
  if (T.isContainer(state.idx, n)) { toast('Its state comes from the tasks inside it: tick those.'); return; }
  const light = T.isLight(state.idx, n);
  if (!canWrite(n)) {
    toast(light ? 'Only whoever has this job, or the Design lead, ticks its tasks.' : 'Only whoever it is assigned to, or the Design lead, changes it.', { warn: true });
    return;
  }
  const to = dir > 0 ? S.taskForward(n, state.role, light) : S.taskBack(n, state.role, state.me, light);
  if (to) { setStatus(id, to, { advance: dir > 0 }); return; }
  if (dir < 0) return;
  // Forward goes nowhere from here: say what does.
  const why = {
    check: S.canTakeBack(n, state.me) ? 'It is with the Design lead for check. Right-click the box to take it back.' : 'It is with the Design lead for check.',
    waiting: 'It is waiting. Open it to stop waiting.',
    done: state.role === 'lead' || light ? 'Done. Right-click the box to undo it.' : 'Done.',
    cancelled: light ? 'Cancelled. Right-click the box to bring it back.' : 'Cancelled. Open it to reopen it.',
  }[n.status];
  if (why) toast(why);
}

// ---------------------------------------------------------------------------
// moving
// ---------------------------------------------------------------------------

function applyMove(r, what) {
  if (r.error) { toast(r.error, { warn: true }); return false; }
  if (!r.patches.length) return true;
  const inverse = inverseOf(r.patches);
  write({ patch: r.patches.map((p) => ({ ...p, updatedAt: nowISO() })) });
  if (what) toast(what, { action: 'Undo', onAction: () => write({ patch: inverse }) });
  return true;
}

/**
 * Into a new parent (null is the top). A job lands above the sub-groups, as a
 * new one does; a category lands after the categories already there.
 */
export function moveInto(id, parentId, position = T.isGroupLike(node(id)) ? 'end' : 'beforeGroups') {
  const dest = parentId ? T.nameOf(node(parentId)) : 'the top level';
  return applyMove(T.nestUnder(state.idx, id, parentId, position), `Moved to ${dest}`);
}

/** Just before or after another node (drag reorder). Quiet: the screen shows it. */
export const moveNextTo = (id, targetId, where) => applyMove(T.insertRelative(state.idx, id, targetId, where), null);

/** Home's own order: the tiles as listed. */
export function setHomeOrder(ids) {
  const patches = ids.map((id, i) => ({ id, homeOrder: (i + 1) * T.ORDER_GAP })).filter((p) => node(p.id)?.homeOrder !== p.homeOrder);
  if (patches.length) write({ patch: patches });
}

// ---------------------------------------------------------------------------
// archive, restore, delete
// ---------------------------------------------------------------------------

/** Archive a node and everything under it. Blockers in it stop blocking. */
export function archive(ids, { quiet = false } = {}) {
  const list = Array.isArray(ids) ? ids : [ids];
  const at = nowISO();
  const all = new Set();
  for (const id of list) { all.add(id); for (const d of T.descendantIds(state.idx, id)) all.add(d); }
  const patches = [...all].map((id) => ({ id, archivedAt: at }));
  // Every blocker in what is archived comes off its dependents in one go.
  const blockers = [...all].filter((id) => node(id)?.kind === T.KIND.task);
  const r = S.removeBlockers(state.idx, blockers, ctx());
  patches.push(...r.patches);
  const updates = [...r.updates];
  const merged = mergePatches(patches);
  const inverse = inverseOf(merged);
  const name = T.nameOf(node(list[0]));          // before the write: after it, the node has gone from the live tree
  write({ patch: merged, updates });
  if (!quiet) {
    toast(list.length === 1 ? `Archived ${name}` : `Archived ${plural(list.length, 'job')}`, {
      action: 'Undo', onAction: () => write({ patch: inverse }),
    });
  }
}

/** Bring an archived node back, with the rest of what was archived with it, and its archived ancestors. */
export function restore(item, archived) {
  const ids = T.restoreSet(item, archived);
  write({ patch: [...ids].map((id) => ({ id, archivedAt: null })) });
  toast(`Restored ${T.nameOf(item)}`);
  return ids;
}

/** Delete for good, after a confirm that starts on Cancel. */
export async function remove(id) {
  const n = node(id);
  if (!n) return false;
  const below = T.descendantIds(state.idx, id);
  const ok = await confirmDialog({
    title: `Delete ${T.nameOf(n) || 'this'}?`,
    body: below.length ? `Everything inside it goes too (${plural(below.length, 'item')}). This cannot be undone. Archive keeps it out of sight instead.` : 'This cannot be undone. Archive keeps it out of sight instead.',
    ok: 'Delete', destructive: true,
  });
  if (!ok) return false;
  const all = [id, ...below];
  const r = S.removeBlockers(state.idx, all.filter((x) => node(x)?.kind === T.KIND.task), ctx());
  // Log notes linked to what goes are unlinked with it: an issue with no job
  // left is Open again, for someone to take up.
  const at = nowISO();
  const notes = [];
  for (const n0 of allLinked(all)) {
    let n1 = n0;
    for (const jid of all) { const p = NT.unlinkPatch(n1, jid, { by: state.me, at }); if (p) n1 = { ...n1, ...p }; }
    notes.push(Object.fromEntries(Object.entries(n1).filter(([k]) => k === 'id' || ['jobIds', 'links', 'state', 'actioned', 'updatedAt', 'lastBy'].includes(k))));
  }
  write({ remove: all, patch: r.patches, updates: r.updates, notes });
  const reopened = notes.filter((p) => p.state === 'open').length;
  toast(`Deleted ${T.nameOf(n)}${notes.length ? ` · ${plural(notes.length, 'Log note')} unlinked${reopened ? `, ${reopened} open again` : ''}` : ''}`);
  return true;
}

/** The notes in hand linked to any of these ids. */
const allLinked = (ids) => mergeNotes(state.log.triage, state.log.feed, state.log.solo ? [state.log.solo] : [])
  .filter((n) => (n.jobIds ?? []).some((j) => ids.includes(j)));

/** Delete an archived node for good (from the archive page). */
export async function removeArchived(item, archived) {
  const ok = await confirmDialog({ title: `Delete ${T.nameOf(item)} for good?`, body: 'It and everything archived inside it go. This cannot be undone.', ok: 'Delete', destructive: true });
  if (!ok) return false;
  const ids = [item.id];
  const walk = (id) => { for (const c of archived) if (c.parentId === id) { ids.push(c.id); walk(c.id); } };
  walk(item.id);
  write({ remove: ids });
  toast(`Deleted ${T.nameOf(item)}`);
  return true;
}

// ---------------------------------------------------------------------------
// Backlog and load-time housekeeping
// ---------------------------------------------------------------------------

export function setBacklogIgnored(id, on) {
  write({ patch: [{ id, backlogIgnored: on }] });
  toast(on ? 'Hidden from the Backlog' : 'Back in the Backlog', on ? { action: 'Undo', onAction: () => write({ patch: [{ id, backlogIgnored: false }] }) } : {});
}

/**
 * The reconcile on load: unblock anything whose blockers all finished while
 * this client was away. Only what this person may write (the rules would
 * refuse the rest; whoever can write it will catch it).
 */
export function reconcileOnLoad() {
  const r = S.reconcile(state.idx, ctx());
  if (r.patches.length) write({ patch: r.patches, updates: r.updates });
  return r.patches.length;
}

// ---------------------------------------------------------------------------
// convert (lead only)
// ---------------------------------------------------------------------------

/** A job becomes a category: its job details kept but hidden, its subtasks become jobs. */
export function turnIntoCategory(id) {
  if (state.role !== 'lead') return;
  const r = C.toCategory(state.idx, id, { ...ctx(), colour: nextColour() });
  if (r.error) { toast(r.error, { warn: true }); return; }
  const name = T.nameOf(node(id));
  const inverse = inverseOf(r.patches);
  write({ patch: r.patches, updates: r.updates });
  toast(`${name} is now a category`, { action: 'Undo', onAction: () => write({ patch: inverse }) });
}

/** A category becomes a job: its jobs become subtasks, its sub-categories sections. */
export function turnIntoJob(id) {
  if (state.role !== 'lead') return;
  const r = C.toJob(state.idx, id, ctx());
  if (r.error) { toast(r.error, { warn: true, ms: 9000 }); return; }
  const name = T.nameOf(node(id));
  const inverse = inverseOf(r.patches);
  write({ patch: r.patches, updates: r.updates });
  toast(`${name} is now a job`, { action: 'Undo', onAction: () => write({ patch: inverse }) });
}

/** Rename via a prompt: groups, products and tasks alike. */
export async function rename(id) {
  const n = node(id);
  if (!n) return;
  const key = n.kind === T.KIND.task ? 'title' : 'name';
  const v = await promptDialog({ title: 'Rename', value: T.nameOf(n), ok: 'Rename' });
  if (v && v !== T.nameOf(n)) updateFields(id, { [key]: v });
}

// ---------------------------------------------------------------------------
// the team
// ---------------------------------------------------------------------------

/**
 * Assign a task (the lead). The open tasks inside it that were following it
 * go with it; an `assign` event names who it went to. Inside a job this is
 * also PROMOTE and DEMOTE (team.js reassignPatches): someone on it makes it
 * a task of their own, nobody makes it part of its job again.
 */
export function assign(id, who) {
  const n = node(id);
  if (!n || n.kind !== T.KIND.task || state.role !== 'lead') return;
  if ((n.assignee ?? null) === (who ?? null)) return;
  const at = nowISO();
  const nested = !T.isJob(state.idx, n);
  const patches = TM.reassignPatches(state.idx, id, who ?? null, { at });
  const inverse = inverseOf(patches);
  const back = patches[0]?.status === 'in_progress' && ['check', 'fix'].includes(n.status);
  const said = who ? `Assigned to ${realName(who)}` : nested ? 'Unassigned: part of its job again' : 'Unassigned';
  const update = { taskId: id, at, by: state.me, kind: 'assign', from: n.assignee ?? null, to: who ?? null, text: back ? `${said} · back to In progress` : said };
  write({ patch: patches, updates: [update] });
  const more = patches.length - 1;
  const word = who ? `Assigned to ${personName(who)}${nested && !n.assignee ? ' · on their list now' : ''}`
    : nested ? `Unassigned · ticked with its job now${back ? ', back to In progress' : ''}` : 'Unassigned';
  toast(`${word}${more ? ` · ${plural(more, 'task')} inside too` : ''}`, {
    action: 'Undo',
    onAction: () => write({ patch: inverse, updates: [{ ...update, at: nowISO(), from: who ?? null, to: n.assignee ?? null, text: n.assignee ? `Assigned back to ${realName(n.assignee)}` : 'Unassigned' }] }),
  });
}

/**
 * A designer's own task, assigned to themselves, in their group under "From
 * designers" (team.js): the lead files it into a category later.
 * @returns {string} the new id
 */
export function addOwnTask({ title, brief = '' }) {
  return createTask({ title, brief, parentId: TM.inboxId(state.me), useTemplate: false, assignee: state.me });
}

/**
 * The lead's app makes the "From designers" groups that designers' own
 * tasks name (team.js inboxFixes). Idempotent: it runs on every snapshot
 * and writes only what is missing, once.
 */
const inboxPending = new Set();
export function ensureInboxes() {
  if (state.role !== 'lead' || !state.ready) return;
  const at = nowISO();
  const designers = state.access.designers ?? [];
  const fixes = TM.inboxFixes(state.idx, { designers, people: state.people, by: state.me, at })
    .filter((n) => !inboxPending.has(n.id));
  const repairs = TM.inboxRepairs(state.idx, { designers, people: state.people, at })
    .filter((p) => !inboxPending.has(p.id));
  if (!fixes.length && !repairs.length) return;
  const ids = [...fixes, ...repairs].map((n) => n.id);
  for (const id of ids) inboxPending.add(id);
  write({ set: fixes, patch: repairs }).finally(() => { for (const id of ids) inboxPending.delete(id); });
}

/** How many tasks inside jobs have the lead on them (Settings' one-off tidy). */
export const tasksOnMe = () => (state.role === 'lead' ? TM.unassignAllPatches(state.idx, state.me, { at: '' }).length : 0);

/**
 * Take the lead off every task inside a job, in one go (team.js
 * unassignAllPatches), with Undo. No timeline event on each: it is a tidy
 * after the imports, and hundreds of "Unassigned" lines would bury the real
 * ones. The store writes it in batches under Firestore's limit.
 * @returns {number} how many
 */
export function unassignAllMine({ onUndo = null } = {}) {
  if (state.role !== 'lead') return 0;
  const patches = TM.unassignAllPatches(state.idx, state.me, { at: nowISO() });
  if (!patches.length) return 0;
  const inverse = inverseOf(patches);
  write({ patch: patches }, 'The tasks were not unassigned');
  toast(`Unassigned you from ${plural(patches.length, 'task')} · part of their jobs again`, {
    action: 'Undo', ms: 12000, onAction: () => { write({ patch: inverse }, 'The undo did not save'); onUndo?.(); },
  });
  return patches.length;
}

// ---------------------------------------------------------------------------
// the Log
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// sharing with managers (sharing.js)
// ---------------------------------------------------------------------------

/**
 * Share a job or a group with managers (the lead): 'status', 'stage', 'off',
 * or null for "as the group above". The effective flags follow at once, in
 * the same write, and the reconcile keeps them right afterwards.
 */
export function setShare(id, choice) {
  const n = node(id);
  if (!n || state.role !== 'lead') return;
  const value = ['status', 'stage', 'off'].includes(choice) ? choice : null;
  if ((n.shared ?? null) === value) return;
  const at = nowISO();
  const after = T.buildIndex(state.nodes.map((x) => (x.id === id ? { ...x, shared: value } : x)));
  const patches = [{ id, shared: value, updatedAt: at }, ...SH.sharePatches(after)];
  const inverse = inverseOf(patches);
  write({ patch: patches }, 'Sharing did not save');
  const { level, from } = SH.shareOf(after, id);
  const jobs = after.nodes.filter((x) => x.kind === T.KIND.task && T.isJob(after, x) && SH.shareOf(after, x.id).level).length;
  const word = level ? `Shared with managers: ${SH.SHARE_LABEL[level].toLowerCase()}${from && from.id !== id ? ` (from ${T.nameOf(from)})` : ''}` : 'Not shared with managers';
  toast(`${word} · ${plural(jobs, 'job')} shared in all`, { action: 'Undo', onAction: () => write({ patch: inverse }) });
}

/**
 * The lead's app keeps `sharedEffective` / `shareLevel` right: a job moved
 * into a shared group, a task a designer added to a shared job, a job
 * archived out of one. Idempotent; runs on every change and writes only
 * what differs.
 */
const sharePending = new Set();
export function ensureSharing() {
  if (state.role !== 'lead' || !state.ready) return;
  const fixes = SH.sharePatches(state.idx).filter((p) => !sharePending.has(p.id));
  if (!fixes.length) return;
  for (const p of fixes) sharePending.add(p.id);
  write({ patch: fixes }).catch(() => {}).finally(() => { for (const p of fixes) sharePending.delete(p.id); });
}

// ---------------------------------------------------------------------------
// steps into tasks: the one-time migration (migrate.js), the lead's to run
// ---------------------------------------------------------------------------

/** Steps not converted yet, that the lead's app offers to convert. */
export const stepsLeft = () => (state.role === 'lead' ? state.rawSteps.length : 0);

/**
 * Everything in `tasks` as one JSON file, saved on this computer: what the
 * conversion rewrites, so it can be put back by hand if it ever had to be.
 * Local mode saves the whole browser's data, as Settings' backup does.
 */
export async function exportBackup() {
  try {
    const data = Store.mode === 'local'
      ? Store.exportLocal()
      : { exportedAt: nowISO(), tasks: [...state.raw, ...await Store.loadArchived()] };
    const blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `design-scheduling-tasks-backup-${dayOf()}.json`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    toast('Backup saved to this computer');
    return true;
  } catch (e) {
    toastError(e, 'The backup was not saved');
    return false;
  }
}

/**
 * Convert every step - live and archived - into a task, in one go (the
 * store writes it in batches under Firestore's limit). Only when the lead
 * asks; never on its own.
 * @returns {Promise<number|null>} how many were converted, null on failure
 */
let converting = false;
export async function convertSteps() {
  if (state.role !== 'lead' || converting) return null;
  // Offline, the archived steps would come from this device's cache, which
  // may not hold them all: some would be left the old way, with the strip
  // gone. And the write would wait for the connection anyway.
  if (offline()) {
    toast('Converting needs a connection: it reads every archived step from the server first. Try again when back online.', { warn: true, ms: 9000 });
    return null;
  }
  converting = true;
  try {
    const archived = (await Store.loadArchived()).filter(M.isStep);
    const live = state.rawSteps;
    const set = M.convertSteps([...live, ...archived], { by: state.me, at: nowISO() });
    if (!set.length) return 0;
    await Store.commit({ set });
    toast(`Converted ${plural(set.length, 'step')} into tasks`);
    return set.length;
  } catch (e) {
    toastError(e, 'The steps were not converted');
    return null;
  } finally {
    converting = false;
  }
}

/** A manager's note on a shared job: a Question, an Update from customer, or a Request. */
export function postRequest(id, { kind, text, cancels = false }, { onFail = null } = {}) {
  const job = node(id);
  const r = SH.requestWrite(job, { kind, text, cancels, by: state.me, at: nowISO() });
  if (r.error) { toast(r.error, { warn: true }); return false; }
  write({ patch: [r.patch], updates: [r.update] }, 'The note did not send (it is back in the box)').catch(() => onFail?.());
  toast(offline() ? 'Will send when back online' : 'Sent to the design team');
  return true;
}

/** The lead has dealt with the managers' notes on a job. */
export function answerRequests(id) {
  const job = node(id);
  if (!job || state.role !== 'lead' || !(job.requestOpen > 0)) return;
  const was = job.requestOpen;
  write({ patch: [{ id, requestOpen: 0 }] });
  toast('Marked answered', { action: 'Undo', onAction: () => write({ patch: [{ id, requestOpen: was }] }) });
}

/** One tap from a customer's "cancelled": the job is cancelled, the note's words as the reason. */
export function cancelFromRequest(id) {
  const job = node(id);
  if (!job || state.role !== 'lead' || !S.isOpen(job.status)) return;
  setStatus(id, 'cancelled', { reason: SH.cancelReason(job, realName), clearRequests: true });
}

/**
 * The Log's two live windows (store.js): every open or actioned note, and
 * the newest page. Started once; "Show older" grows the page.
 */
const logSeen = { feed: false, triage: false };
let feedUnsub = null;
function onLog(which, list, meta) {
  if (meta?.error || !list) { setLog({ error: meta?.error ?? new Error('The Log did not load.') }); return; }
  logSeen[which] = true;
  setLog({ [which]: list, ...(which === 'feed' ? { more: Boolean(meta?.more) } : {}), loaded: logSeen.feed && logSeen.triage, error: null });
}
export function startLog() {
  Store.watchTriage((l, m) => onLog('triage', l, m));
  feedUnsub = Store.watchNotes(state.log.limit, (l, m) => onLog('feed', l, m));
}
export function olderNotes() {
  state.log.limit += 40;
  feedUnsub?.();
  feedUnsub = Store.watchNotes(state.log.limit, (l, m) => onLog('feed', l, m));
}

/** The lead and designers turn notes into work: make a job, link one, dismiss. */
export const canTriage = () => state.role === 'lead' || state.role === 'designer';

/** A note is its author's to edit, and the lead's. */
export const canEditNote = (n) => Boolean(n) && (state.role === 'lead' || n.by === state.me);

/**
 * The photos a person may delete: the lead any; anyone else those they
 * added (the rules check the `by` on each image).
 */
const deletable = (refs) => (refs ?? []).filter((r) => r?.id && (state.role === 'lead' || r.by === state.me)).map((r) => r.id);

/**
 * Post a note. Its photos and the note go in one batch, so they arrive
 * together; offline, Firestore keeps both and sends them when it can.
 * @param {{text: string, kind: string, groupId: string|null, jobIds?: string[], photos?: object[]}} draft
 *        `photos` are prepared by photos.js
 * @returns {Promise<string|null>} the new note's id
 */
export async function postNote({ text, kind, groupId = null, jobIds = [], photos = [] }, { onFail = null } = {}) {
  if (!String(text ?? '').trim() && !photos.length) { toast('Write the note first.', { warn: true }); return null; }
  const at = nowISO();
  const id = Store.newId();
  const jobs = canTriage() ? jobIds.map(node).filter(Boolean) : [];
  const note = NT.noteNode({
    id, text: String(text ?? '').trim() || 'Photo', kind, groupId, jobs,
    photos: photos.map((p) => ({ ...PH.refOf(p), by: state.me })), by: state.me, at,
  });
  // A draft's photos are read off this device's photo store; held in memory
  // now, so the draft can be cleared while the write is still on its way.
  const images = await Promise.all(photos.map(async (p) => ({ ...p, blob: new Blob([await p.blob.arrayBuffer()], { type: p.type }), by: state.me, at })));
  // Refused (the rules, a role changed): what was written goes back into
  // the draft, photos and all, rather than vanishing with the closed composer.
  write({ noteSet: [note], images }, 'The note did not post (it is back in your draft: + Note)').catch(() => onFail?.(images));
  toast(offline() ? 'Will post when back online' : 'Posted to the Log', { action: 'Open', onAction: () => openNote(id) });
  return id;
}

/**
 * Change a note (its author, or the lead): the text, kind, category and
 * photos. New photos are prepared ones; photos taken off are deleted.
 */
export async function editNote(id, { text, kind, groupId, keep = [], added = [] }) {
  const n = noteOf(id);
  if (!n || !canEditNote(n)) return false;
  const at = nowISO();
  const gone = (n.photos ?? []).filter((p) => !keep.some((k) => k.id === p.id));
  const photos = [...keep, ...added.map((p) => ({ ...PH.refOf(p), by: state.me }))].slice(0, NT.PHOTOS_MAX);
  const patch = {
    id, text: String(text ?? '').trim().slice(0, NT.TEXT_MAX) || n.text, kind, state: NT.stateForKind(n, kind),
    groupId: groupId ?? null, photos, editedAt: at, updatedAt: at, lastBy: state.me,
  };
  const images = await Promise.all(added.map(async (p) => ({ ...p, blob: new Blob([await p.blob.arrayBuffer()], { type: p.type }), by: state.me, at })));
  write({ notes: [patch], images, imageRemove: deletable(gone) }, 'The note did not save');
  toast('Note saved');
  return true;
}

/** Delete a note and its photos (its author, or the lead). Behind a confirm. */
export async function deleteNote(id) {
  const n = noteOf(id);
  if (!n || !canEditNote(n)) return false;
  const ok = await confirmDialog({
    title: 'Delete this note?',
    body: `"${NT.titleOf(n)}"${n.photos?.length ? ` and its ${plural(n.photos.length, 'photo')}` : ''} will be gone for everyone. ${n.kind === 'reference' ? 'Archiving keeps it out of the feed instead.' : ''}`.trim(),
    ok: 'Delete', destructive: true,
  });
  if (!ok) return false;
  write({ noteRemove: [id], imageRemove: deletable(n.photos) }, 'The note was not deleted');
  toast('Note deleted');
  return true;
}

/** Write a note patch from notes.js, with an Undo that puts the fields back. */
function notePatch(n, patch, message) {
  if (!patch) return;
  const inverse = { id: n.id };
  for (const k of Object.keys(patch)) if (k !== 'id') inverse[k] = n[k] ?? null;
  write({ notes: [patch] });
  if (message) toast(message, { action: 'Undo', onAction: () => write({ notes: [inverse] }) });
}

/**
 * Make a job from a note: in the chosen category, the note's text as its
 * brief, linked both ways (the note lists the job; the job's panel finds the
 * note), and the note marked Actioned.
 * @returns {string|null} the job's id
 */
export function makeJobFromNote(noteId, { title, parentId, assignee, useTemplate = true }) {
  const n = noteOf(noteId);
  if (!n || !canTriage()) return null;
  const at = nowISO();
  let who = assignee ?? null;
  if (state.role !== 'lead' && who && who !== state.me) who = state.me;
  const job = taskNode({
    parentId: parentId ?? null, order: T.newOrder(state.idx, parentId ?? null, 'beforeGroups'),
    title: String(title || NT.titleOf(n)).slice(0, 300), brief: NT.bodyOf(n), at, assignee: who,
  });
  const set = [job];
  if (useTemplate && parentId) {
    const t = T.stepsTemplateOf(state.idx, parentId);
    if (t) set.push(...fromTemplate(t.template, job.id, at));
  }
  const by = state.me;
  const update = { taskId: job.id, at, by, kind: 'create', text: `From a Log note by ${realName(n.by)}` };
  write({ set, updates: [update], notes: [NT.linkPatch(n, job, { by, at })] }, 'The job was not made');
  toast('Job made from the note', { action: 'Open job', onAction: () => openTask(job.id) });
  return job.id;
}

/** Link an existing job to a note: an open issue or idea becomes Actioned. */
export function linkNote(noteId, jobId) {
  const n = noteOf(noteId);
  const job = node(jobId);
  if (!n || !job || !canTriage()) return;
  const at = nowISO();
  notePatch(n, NT.linkPatch(n, job, { by: state.me, at }), `Linked to ${job.title}`);
}

export function unlinkNote(noteId, jobId) {
  const n = noteOf(noteId);
  if (!n || !canTriage()) return;
  notePatch(n, NT.unlinkPatch(n, jobId, { by: state.me, at: nowISO() }), 'Job unlinked');
}

/** Dismiss an issue or idea, with the reason asked for. */
export async function dismissNote(noteId) {
  const n = noteOf(noteId);
  if (!n || !canTriage()) return;
  const reason = await promptDialog({
    title: 'Dismiss this note?', label: 'Why', placeholder: 'e.g. Already fixed on the current design',
    ok: 'Dismiss', body: `"${NT.titleOf(n)}" stays in the Log, marked Dismissed, with your reason.`, multiline: true,
  });
  if (!reason) return;
  notePatch(n, NT.dismissPatch(n, reason, { by: state.me, at: nowISO() }), 'Dismissed');
}

export function reopenNote(noteId) {
  const n = noteOf(noteId);
  if (!n || !canTriage()) return;
  notePatch(n, NT.reopenPatch(n, { by: state.me, at: nowISO() }), 'Reopened');
}

/** Archive a reference note (the lead): out of the feed, kept. And back. */
export function archiveNote(noteId, on = true) {
  const n = noteOf(noteId);
  if (!n || state.role !== 'lead') return;
  const at = nowISO();
  notePatch(n, on
    ? { id: n.id, state: 'archived', archivedAt: at, updatedAt: at }
    : { id: n.id, state: NT.initialState(n.kind), archivedAt: null, updatedAt: at }, on ? 'Archived' : 'Back in the Log');
}

/**
 * The lead's app moves an Actioned note to Resolved once every job it is
 * linked to is finished (only a lead marks anything done, so the lead's app
 * is always there when it happens). Idempotent; runs on every change.
 */
const resolving = new Set();
export function reconcileNotes() {
  if (state.role !== 'lead' || !state.ready || !state.log.loaded) return;
  const fixes = NT.resolveFixes(state.log.triage, state.idx, { at: nowISO() }).filter((p) => !resolving.has(p.id));
  if (!fixes.length) return;
  for (const p of fixes) resolving.add(p.id);
  write({ notes: fixes }).finally(() => { for (const p of fixes) resolving.delete(p.id); });
}

export { isMine };
