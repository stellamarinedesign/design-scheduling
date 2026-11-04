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

import { state, node, isMine } from './state.js';
import { Store } from './store.js';
import * as T from './tree.js';
import * as S from './status.js';
import { nowISO } from './dates.js';
import { toast, toastError } from './ui.js';
import * as C from './convert.js';
import { confirmDialog, promptDialog } from './dialog.js';

const ctx = () => ({ by: state.me, at: nowISO(), role: state.role, canWrite });

/**
 * Would the rules let this person write this task? The same test the
 * Firestore rules make for a designer. A batch with one refused write fails
 * whole, so knock-on changes (unblocks, cascades, activity times) on tasks
 * that are not ours are left out; the reconcile, run by someone who can
 * write them, catches the unblocks.
 */
export function canWrite(t) {
  return state.role === 'lead' || t?.createdBy === state.me || t?.assignee === state.me;
}
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** Write a change; a failure is said, never swallowed. */
export function write(change, what = 'That did not save') {
  const p = Store.commit(change);
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
export function taskNode({ id = Store.newId(), parentId = null, order, title, brief = '', at = nowISO(), status = 'todo' }) {
  return {
    id, kind: T.KIND.task, parentId, order,
    title: String(title).trim(), brief: String(brief ?? '').trim(),
    status, waiting: null, priority: 'normal',
    assignee: state.me, createdBy: state.me,
    createdAt: at, updatedAt: at, lastActivityAt: at,
    due: null, revision: null, folders: [],
    checkedBy: null, checkedAt: null, doneAt: null, cancelled: null,
    homeOrder: null, backlogIgnored: false, archivedAt: null,
  };
}

/** Step nodes from a template, under a parent. */
export const stepsFrom = (template, parentId, at = nowISO()) => T.stepsFromTemplate(template, parentId, { at, by: state.me, newId: Store.newId });

/** The colour least used so far, so categories spread across the ten. */
function nextColour() {
  const count = new Array(11).fill(0);
  for (const n of state.nodes) if (n.kind === T.KIND.group && n.colour) count[n.colour] += 1;
  let best = 1;
  for (let c = 2; c <= 10; c++) if (count[c] < count[best]) best = c;
  return best;
}

/**
 * A new job (or a task, when the parent is a task or step). Takes the steps
 * template of its nearest group unless told not to.
 * @returns {string} the new id
 */
export function createTask({ title, parentId = null, brief = '', useTemplate = true }) {
  const at = nowISO();
  const parent = parentId ? node(parentId) : null;
  const inJob = parent && (parent.kind === T.KIND.task || parent.kind === T.KIND.step || T.isSection(state.idx, parent));
  const n = taskNode({ parentId, order: T.newOrder(state.idx, parentId, inJob ? 'end' : 'beforeGroups'), title, brief, at });
  const set = [n];
  if (useTemplate && !inJob && parentId) {
    const t = T.stepsTemplateOf(state.idx, parentId);
    if (t) set.push(...stepsFrom(t.template, n.id, at));
  }
  write({ set, updates: inJob ? [] : [{ taskId: n.id, at, by: state.me, kind: 'create', text: '' }] });
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

export function addStep(parentId, label) {
  const at = nowISO();
  const n = { id: Store.newId(), kind: T.KIND.step, parentId, order: T.newOrder(state.idx, parentId, 'end'), label: String(label).trim(), state: 'todo', createdBy: state.me, createdAt: at, updatedAt: at, archivedAt: null };
  write({ set: [n], patch: touchJob(parentId, at) });
  return n.id;
}

/** Steps from the nearest template, added to a job that has none yet. */
export function applyTemplate(jobId) {
  const t = T.stepsTemplateOf(state.idx, jobId);
  if (!t) return;
  const at = nowISO();
  const base = T.newOrder(state.idx, jobId, 'start');
  const steps = stepsFrom(t.template, jobId, at).map((s) => (s.parentId === jobId ? { ...s, order: base - (t.template.length * T.ORDER_GAP) + s.order } : s));
  write({ set: steps, patch: touchJob(jobId, at) });
  toast(`Added ${plural(t.template.length, 'step')} from ${T.nameOf(t.from)}`);
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
export async function setStatus(id, to, { comment, note, blockedBy, reason, advance = false } = {}) {
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
    const what = [tasks && plural(tasks, 'open task'), inside.steps.length && plural(inside.steps.length, 'open step')].filter(Boolean).join(' and ');
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
    if (open.tasks.length || open.steps.length) {
      // Tasks waiting for check are never closed from here: that would approve
      // them without anyone checking. They are named and left as they are.
      const inCheck = open.tasks.filter((x) => node(x)?.status === 'check').length;
      const closable = open.tasks.length - inCheck;
      const what = [closable && plural(closable, 'open task'), open.steps.length && plural(open.steps.length, 'open step')].filter(Boolean).join(' and ');
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
  const patches = mergePatches([...r.patches, ...extra.patches]);
  const inverse = inverseOf(patches);
  write({ patch: patches, updates: [...r.updates, ...extra.updates] });
  const unblocked = [...r.updates, ...extra.updates].filter((u) => u.kind === 'unblock').length;
  const withIt = r.updates.filter((u) => u.taskId !== id && (u.kind === 'cancel' || u.kind === 'reopen')).length;
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

/** Post an update. On a To-do task it starts it. */
export function postUpdate(id, text) {
  const r = S.postUpdate(state.idx, id, text, ctx());
  if (r.error) { toast(r.error, { warn: true }); return false; }
  const patches = [...r.patches, ...touchJob(id, r.patches[0].lastActivityAt, { self: false })];
  write({ patch: patches, updates: r.updates });
  if (r.patches[0].status === 'in_progress') toast('Posted, and started');
  return true;
}

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

/** Tap a step: To do → Doing → Done → N/a. */
export function cycleStep(id) {
  const s = node(id);
  if (!s) return;
  setStepState(id, S.nextStepState(s.state ?? 'todo'));
}

/** May this person tick this step? The rules' test: its parent is theirs. */
const canWriteStep = (s) => state.role === 'lead' || canWrite(node(s?.parentId));

/**
 * THE CHECKBOX on a step or subtask (decided 2026-11-04). A click goes
 * forward, a right-click or long-press backwards (status.js says where to).
 * Ticking a step Done starts the next To-do step at its level; ticking a
 * subtask Done or Ready for check starts the next To-do subtask if it is
 * nobody's or the same person's. One write, one Undo for both.
 * @param {1|-1} dir
 */
export function tick(id, dir = 1) {
  const n = node(id);
  if (!n) return;
  if (n.kind === T.KIND.step) {
    const from = n.state ?? 'todo';
    const to = dir > 0 ? S.nextStepState(from) : S.stepBack(from);
    if (!to) return;
    const at = nowISO();
    const changed = [{ id, state: to, updatedAt: at }];
    const next = dir > 0 && to === 'done' ? node(S.nextStepToStart(state.idx, id)) : null;
    if (next && canWriteStep(next)) changed.push({ id: next.id, state: 'doing', updatedAt: at });
    const inverse = inverseOf(changed);
    write({ patch: mergePatches([...changed, ...touchJob(id, at)]) });
    if (changed.length > 1) toast(`Done · next: ${T.nameOf(next)}`, { action: 'Undo', onAction: () => write({ patch: inverse }) });
    return;
  }
  if (n.kind !== T.KIND.task) return;
  if (!canWrite(n)) { toast('Only whoever it is assigned to, or the Design lead, changes it.', { warn: true }); return; }
  const to = dir > 0 ? S.taskForward(n, state.role) : S.taskBack(n, state.role, state.me);
  if (to) { setStatus(id, to, { advance: dir > 0 }); return; }
  if (dir < 0) return;
  // Forward goes nowhere from here: say what does.
  const why = {
    check: S.canTakeBack(n, state.me) ? 'It is with the Design lead for check. Right-click the box to take it back.' : 'It is with the Design lead for check.',
    waiting: 'It is waiting. Open it to stop waiting.',
    done: state.role === 'lead' ? 'Done. Right-click the box to reopen it.' : 'Done.',
    cancelled: 'Cancelled. Open it to reopen it.',
  }[n.status];
  if (why) toast(why);
}

export function setStepState(id, value) {
  const at = nowISO();
  write({ patch: [{ id, state: value, updatedAt: at }, ...touchJob(id, at)] });
}

/** "Make it a task": the step becomes a real subtask in the same place. */
export function promoteStep(id) {
  const s = node(id);
  if (!s || s.kind !== T.KIND.step) return;
  const at = nowISO();
  const base = taskNode({ id, parentId: s.parentId, order: s.order, title: s.label, at, status: s.state === 'done' ? 'done' : s.state === 'doing' ? 'in_progress' : s.state === 'na' ? 'cancelled' : 'todo' });
  write({ patch: [{ ...base, kind: T.KIND.task }] });
  toast('Now a task, with its own status and updates', { action: 'Undo', onAction: () => write({ patch: [{ id, kind: T.KIND.step }] }) });
}

/** "Make it a step": only a task with no updates, inside a job. */
export async function demoteTask(id) {
  const t = node(id);
  if (!t || t.kind !== T.KIND.task) return;
  if (T.isJob(state.idx, t)) { toast('A job cannot become a step. Move it into another job first.', { warn: true }); return; }
  if (await Store.hasUpdates(id)) { toast('It has updates, so it stays a task: a step has no timeline.', { warn: true }); return; }
  const st = t.status === 'done' ? 'done' : t.status === 'in_progress' ? 'doing' : t.status === 'cancelled' ? 'na' : 'todo';
  write({ patch: [{ id, kind: T.KIND.step, label: t.title, state: st, updatedAt: nowISO() }] });
  toast('Now a step', { action: 'Undo', onAction: () => write({ patch: [{ id, kind: T.KIND.task }] }) });
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
  write({ remove: all, patch: r.patches, updates: r.updates });
  toast(`Deleted ${T.nameOf(n)}`);
  return true;
}

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

/** Rename via a prompt: groups, products, steps and tasks alike. */
export async function rename(id) {
  const n = node(id);
  if (!n) return;
  const key = n.kind === T.KIND.task ? 'title' : n.kind === T.KIND.step ? 'label' : 'name';
  const v = await promptDialog({ title: 'Rename', value: T.nameOf(n), ok: 'Rename' });
  if (v && v !== T.nameOf(n)) updateFields(id, { [key]: v });
}

export { isMine };
