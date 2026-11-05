// status.js — the fixed statuses, and the rules that keep them cheap and true.
//
// Statuses are semantic, not stages anybody edits: To do → In progress →
// Ready for check → Done, with Waiting, Fix (sent back) and Cancelled beside
// them. What makes them worth trusting:
//
// - STARTING IS ONE TAP, and posting an update on a To-do task starts it. The
//   owner's TileDo data had 1 of 124 open tasks marked in progress because
//   changing status cost too much; Home is only true if this costs nothing.
// - ONLY A LEAD MARKS A JOB, OR A TASK WITH AN ASSIGNEE, DONE (decided
//   2026-11-04; narrowed 2026-11-06 when steps merged into tasks), by any
//   route: that closes the check → in progress → done way round review. Only
//   a lead sends back, and a send-back always says why. Whoever submitted
//   work may TAKE IT BACK from Ready for check to In progress, with an
//   optional note. A task inside a job with NOBODY ON IT is part of its job
//   (tree.isLight): anyone who may edit the job ticks it Done, and it never
//   goes for check on its own - the job does. The Firestore rules enforce the
//   same, so the UI never offers what the rules refuse.
// - WAITING REMEMBERS where it came from (`waiting.prevStatus`), so leaving it
//   restores that status instead of guessing.
// - CANCELLED IS FINISHED LIKE DONE, RECORDED APART (decided 2026-11-04). It
//   leaves every active list, unblocks what waits on it, and cancels the open
//   tasks inside it; but it keeps `cancelled: {by, at, reason,
//   prevStatus}` and a `cancel` timeline event, and Reopen puts it - and what
//   was cancelled with it - back where it was.
// - A WAITING TASK CAN BE BLOCKED BY OTHER TASKS (`waiting.blockedBy`). When the
//   last blocker is done or cancelled - and the wait has no reason text - the
//   task unblocks itself, in the same batch as the blocker's change, with an
//   "Unblocked" update (`shouldUnblock` is the one rule). A reconcile on
//   load catches a blocker finished by someone whose rules did not let them
//   touch the dependent. Cycles are refused.
//
// Everything here is pure: it reads an index (tree.js) and returns patches and
// updates for the store to write in one batch.

import { ancestorChain, descendantIds, childrenOf, nameOf, KIND, isLight, isContainer } from './tree.js';

export const STATUSES = ['todo', 'in_progress', 'waiting', 'check', 'fix', 'done', 'cancelled'];

export const LABEL = {
  todo: 'To do',
  in_progress: 'In progress',
  waiting: 'Waiting',
  check: 'Ready for check',
  fix: 'Fix',
  done: 'Done',
  cancelled: 'Cancelled',
};

/** The order tiles band in, on Home and in Tasks. */
export const BAND_ORDER = ['in_progress', 'fix', 'check', 'waiting', 'todo'];

export const isOpen = (s) => s !== 'done' && s !== 'cancelled';
export const isFinished = (s) => s === 'done' || s === 'cancelled';

/**
 * The statuses a task part of its job can take: no check and no send-back,
 * since its job goes for check, not it. Cancelled is what N/a was.
 */
export const LIGHT_STATUSES = ['todo', 'in_progress', 'waiting', 'done', 'cancelled'];

/**
 * Null when the change is allowed, a sentence when it is not. `light`: the
 * task is part of its job (tree.isLight), which anyone who may edit the job
 * ticks Done, and which is never checked on its own.
 */
export function changeProblem(from, to, role = 'lead', light = false) {
  if (!STATUSES.includes(to)) return `Not a status: ${to}`;
  if (from === to && to !== 'waiting') return null;
  if (light && (to === 'check' || to === 'fix')) return 'A task with nobody on it is ticked done, not checked: its job goes for check. Assign someone to give it a check of its own.';
  if (role !== 'lead' && !light) {
    if (to === 'done') return from === 'check' ? 'Only the Design lead can approve.' : 'Only the Design lead marks work done. Submit it for check instead.';
    if (from === 'check' && to === 'fix') return 'Only the Design lead can send back.';
  }
  return null;
}

/** May this person take this task back from Ready for check? Whoever submitted it. */
export const canTakeBack = (t, me) => t?.status === 'check' && Boolean(me) && t.submittedBy === me;

// ---------------------------------------------------------------------------
// the check control on every task inside a job (decided 2026-11-04, live
// test run; one control since steps merged into tasks, 2026-11-06)
// ---------------------------------------------------------------------------

/**
 * The check control, click. A task part of its job: To do → In progress →
 * Done, for anyone who may edit the job. A task with an assignee: To do →
 * In progress → Done for the lead; → Ready for check for everyone else, who
 * never reach Done. Fix restarts. Waiting, Done and Cancelled are changed
 * from the task itself, so null.
 */
export function taskForward(t, role, light = false) {
  switch (t?.status ?? 'todo') {
    case 'todo': case 'fix': return 'in_progress';
    case 'in_progress': return role === 'lead' || light ? 'done' : 'check';
    case 'check': return role === 'lead' || light ? 'done' : null;
    default: return null;
  }
}

/**
 * The check control, right-click or long-press: backwards. In progress →
 * To do; Ready for check → In progress is a Take back, so only whoever
 * submitted it; Done → In progress only for the lead, since nobody else could
 * put it back to Done - except on a task part of its job, which whoever
 * ticked it Done may untick. A cancelled task part of its job reopens (as
 * N/a → Done did).
 */
export function taskBack(t, role, me, light = false) {
  switch (t?.status ?? 'todo') {
    case 'done': return role === 'lead' || light ? 'in_progress' : null;
    case 'in_progress': return 'todo';
    case 'check': return canTakeBack(t, me) || light ? 'in_progress' : null;
    case 'fix': return light ? 'in_progress' : null;
    case 'cancelled': return light ? reopenTo(t) : null;
    default: return null;
  }
}

/**
 * AUTO-ADVANCE: ticking a task Done (or Ready for check) starts the next
 * To-do task at its level - into a light task's insides when it has them -
 * only if that one is nobody's or has the same assignee, so nobody's work is
 * started for them. Finished and submitted ones are passed over; one already
 * under way (or waiting) ends the search. Sections are not crossed.
 * @returns {string|null} the task to start
 */
export function nextTaskToStart(idx, taskId) {
  const t = idx.byId.get(taskId);
  if (!t) return null;
  const who = t.assignee ?? null;
  // undefined: nothing open in this list, look on; null: stop; an id: start it.
  const look = (list) => {
    for (const c of list) {
      if (c.kind !== KIND.task) continue;
      if (isContainer(idx, c)) {
        if (c.status === 'cancelled') continue;
        const inner = look(childrenOf(idx, c.id));
        if (inner !== undefined) return inner;
        continue;
      }
      const st = c.status ?? 'todo';
      if (st === 'done' || st === 'cancelled' || st === 'check') continue;
      if (st !== 'todo') return null;
      return !c.assignee || c.assignee === who ? c.id : null;
    }
    return undefined;
  };
  const siblings = childrenOf(idx, t.parentId);
  return look(siblings.slice(siblings.findIndex((x) => x.id === taskId) + 1)) ?? null;
}

/** The kind of timeline entry a change posts. */
function eventKind(from, to) {
  if (from === 'check' && to === 'done') return 'approve';
  if (from === 'check' && to === 'fix') return 'sendback';
  if (from === 'check' && to === 'in_progress') return 'retract';
  if (to === 'check') return 'submit';
  return 'status';
}

const blockersOfTask = (t) => (t?.status === 'waiting' ? (t.waiting?.blockedBy ?? []) : []);

/**
 * Why `blockerId` cannot block `taskId`, or null when it can. Refused: itself,
 * anything that is not a task, a finished task, the task's own ancestors and
 * descendants, and anything that already waits (however indirectly) on it.
 */
export function blockerProblem(idx, taskId, blockerId) {
  if (blockerId === taskId) return 'A task cannot wait on itself.';
  const b = idx.byId.get(blockerId);
  if (!b || b.kind !== KIND.task) return 'Only jobs and tasks can hold something up.';
  if (!isOpen(b.status)) return 'That one is already finished.';
  if (ancestorChain(idx, taskId).some((a) => a.id === blockerId)) return 'That one contains this task.';
  if (descendantIds(idx, taskId).includes(blockerId)) return 'That one is inside this task.';
  // Walk what the blocker waits on; reaching the task means a cycle.
  const seen = new Set();
  const stack = [blockerId];
  while (stack.length) {
    const x = stack.pop();
    if (x === taskId) return 'They would be waiting on each other.';
    if (seen.has(x)) continue;
    seen.add(x);
    stack.push(...blockersOfTask(idx.byId.get(x)));
  }
  return null;
}

/** Tasks waiting on this one. */
export function dependentsOf(idx, blockerId) {
  return idx.nodes.filter((n) => n.kind === KIND.task && blockersOfTask(n).includes(blockerId));
}

/** A waiting task's blockers, split by whether they are still open. Gone blockers count as finished. */
export function blockersOf(idx, task) {
  const open = [];
  const finished = [];
  for (const id of blockersOfTask(task)) {
    const b = idx.byId.get(id);
    if (b && isOpen(b.status)) open.push(b); else finished.push(b ?? { id, title: '(removed)', status: 'cancelled' });
  }
  return { open, finished };
}

/** What a waiting task's subtext says: what holds it up, or why. */
export function waitingLine(idx, task) {
  if (task?.status !== 'waiting') return '';
  const { open, finished } = blockersOf(idx, task);
  const total = open.length + finished.length;
  const note = String(task.waiting?.note ?? '').trim();
  if (total === 1 && open.length === 1) return `Blocked by: ${nameOf(open[0])}`;
  if (open.length) return `Waiting on ${total} tasks · ${finished.length} done`;
  // Every blocker finished, but a reason is still there: the reason is what holds it.
  if (note) return `Waiting: ${note}`;
  return total ? `Waiting on ${total} tasks · ${finished.length} done` : 'Waiting';
}

/** Restore from waiting: the remembered status, never 'waiting' itself. */
const restoreTo = (t) => {
  const prev = t.waiting?.prevStatus;
  return prev && prev !== 'waiting' && STATUSES.includes(prev) ? prev : 'todo';
};

function unblockOne(t, { by, at, why }) {
  return {
    patch: { id: t.id, status: restoreTo(t), waiting: null, updatedAt: at, lastActivityAt: at, statusAt: at },
    update: { taskId: t.id, at, by, kind: 'unblock', from: 'waiting', to: restoreTo(t), text: why },
  };
}

/**
 * THE ONE UNBLOCK RULE. All three paths use it: a blocker finishing in the
 * same batch, the reconcile on load, and a blocker archived or deleted. A
 * waiting task unblocks by itself only when none of its blockers is still
 * open AND it has no reason text. A reason is something the app cannot see
 * finish ("customer sign-off"), so it keeps the task waiting until a person
 * says otherwise; its finished blockers show as done meanwhile.
 * `statusOverride` carries this batch's pending status changes; `removed`
 * the blockers this batch takes away. A blocker no longer in the tree counts
 * as finished.
 */
export function shouldUnblock(idx, t, { statusOverride = {}, removed = new Set() } = {}) {
  if (t?.kind !== KIND.task || t.status !== 'waiting') return false;
  if (String(t.waiting?.note ?? '').trim()) return false;
  return (t.waiting?.blockedBy ?? []).filter((b) => !removed.has(b)).every((b) => {
    if (!idx.byId.has(b)) return true;
    return isFinished(statusOverride[b] ?? idx.byId.get(b).status);
  });
}

/**
 * The dependents that unblock because `finishedIds` reach done or cancelled
 * in this same batch. `canWrite(task)` leaves out what this person's rules
 * would refuse (one refused write fails the whole batch); the reconcile on
 * load, run by someone who can write it, catches those.
 */
export function unblockFor(idx, finishedIds, { by, at, statusOverride = {}, canWrite = () => true } = {}) {
  const patches = [];
  const updates = [];
  const done = new Set(finishedIds);
  const deps = new Map();
  for (const id of finishedIds) for (const d of dependentsOf(idx, id)) deps.set(d.id, d);
  for (const d of deps.values()) {
    if (statusOverride[d.id] || !canWrite(d)) continue;     // changed in this batch already, or not ours to write
    if (!shouldUnblock(idx, d, { statusOverride })) continue;
    const names = blockersOfTask(d).filter((b) => done.has(b)).map((b) => nameOf(idx.byId.get(b))).filter(Boolean);
    const { patch, update } = unblockOne(d, { by, at, why: names.length ? `Unblocked: ${names.join(', ')} finished` : 'Unblocked' });
    patches.push(patch);
    updates.push(update);
  }
  return { patches, updates };
}

/**
 * The idempotent sweep run on load: any waiting task that the one unblock
 * rule says should be free unblocks now. Run it twice and the second run
 * finds nothing. Only tasks that had blockers: a wait for a reason alone is
 * a person's to end.
 */
export function reconcile(idx, { by, at, canWrite = () => true } = {}) {
  const patches = [];
  const updates = [];
  for (const t of idx.nodes) {
    if (t.kind !== KIND.task || t.status !== 'waiting') continue;
    if (!(t.waiting?.blockedBy ?? []).length || !canWrite(t)) continue;
    if (!shouldUnblock(idx, t)) continue;
    const { patch, update } = unblockOne(t, { by, at, why: 'Unblocked: everything it was waiting on has finished' });
    patches.push(patch);
    updates.push(update);
  }
  return { patches, updates };
}

/**
 * Blockers going away together (archived or deleted, a whole job at once):
 * each dependent loses all of them in ONE patch, worked out once. Done one
 * blocker at a time against the same index, the last result won and left
 * the others behind as stale blockers.
 */
export function removeBlockers(idx, blockerIds, { by, at, canWrite = () => true } = {}) {
  const removed = new Set(blockerIds);
  const patches = [];
  const updates = [];
  const deps = new Map();
  for (const id of blockerIds) for (const d of dependentsOf(idx, id)) if (!removed.has(d.id)) deps.set(d.id, d);
  for (const d of deps.values()) {
    if (!canWrite(d)) continue;
    const gone = blockersOfTask(d).filter((b) => removed.has(b)).map((b) => nameOf(idx.byId.get(b))).filter(Boolean);
    if (shouldUnblock(idx, d, { removed })) {
      const { patch, update } = unblockOne(d, { by, at, why: `Unblocked: ${gone.join(', ') || 'its blocker'} ${gone.length > 1 ? 'were' : 'was'} removed` });
      patches.push(patch);
      updates.push(update);
    } else {
      patches.push({ id: d.id, waiting: { ...d.waiting, blockedBy: d.waiting.blockedBy.filter((b) => !removed.has(b)) }, updatedAt: at });
    }
  }
  return { patches, updates };
}

/** One blocker going away. */
export const removeBlocker = (idx, blockerId, opts = {}) => removeBlockers(idx, [blockerId], opts);

/** What a cancelled task goes back to when reopened: exactly where it was. */
export function reopenTo(t) {
  const prev = t?.cancelled?.prevStatus;
  if (prev === 'waiting' && !t.cancelled?.prevWaiting) return 'todo';
  return prev && prev !== 'cancelled' && STATUSES.includes(prev) ? prev : 'todo';
}

/**
 * What a task was before it was cancelled, kept on the record so Reopen can
 * put it back exactly: Waiting with its blockers and note, Fix with its
 * send-back note.
 */
const cancelRecord = (t, { by, at, reason, withId = null }) => ({
  by, at, reason,
  prevStatus: t.status ?? 'todo',
  prevWaiting: t.status === 'waiting' ? (t.waiting ?? null) : null,
  prevFixNote: t.status === 'fix' ? (t.fixNote ?? null) : null,
  ...(withId ? { withId } : {}),
});

/**
 * The fields that reopen a cancelled task. A wait it is restored into is
 * checked against the one unblock rule: if everything it waited on has
 * finished since (and there is no reason), it comes back already unblocked.
 */
export function reopenFields(idx, t) {
  let status = reopenTo(t);
  const fields = { status, cancelled: null };
  if (status === 'waiting') {
    const w = { ...t.cancelled.prevWaiting };
    w.blockedBy = (w.blockedBy ?? []).filter((b) => idx.byId.has(b));
    if (shouldUnblock(idx, { kind: KIND.task, status: 'waiting', waiting: w })) {
      status = w.prevStatus && STATUSES.includes(w.prevStatus) && w.prevStatus !== 'waiting' ? w.prevStatus : 'todo';
      fields.status = status;
      fields.waiting = null;
    } else {
      fields.waiting = w;
    }
  }
  if (status === 'fix') fields.fixNote = t.cancelled?.prevFixNote ?? null;
  return fields;
}

/**
 * Cancelling a job cancels what is still open inside it: open tasks become
 * Cancelled, marked as cancelled with it. Done work stays done. Each carries
 * `withId`, so Reopen can put it back. Only a task with an assignee gets a
 * `cancel` update in its own timeline: one part of its job gets none, as a
 * step did not (a job of thirty ticks would write thirty more).
 */
export function cancelInside(idx, id, { by, at, reason = '', canWrite = () => true } = {}) {
  const patches = [];
  const updates = [];
  const tasks = [];
  for (const d of descendantIds(idx, id)) {
    const n = idx.byId.get(d);
    if (n.kind !== KIND.task || !isOpen(n.status) || !canWrite(n)) continue;
    patches.push({
      id: d, status: 'cancelled', waiting: null, fixNote: null, updatedAt: at, lastActivityAt: at, statusAt: at,
      cancelled: cancelRecord(n, { by, at, reason, withId: id }),
    });
    if (!isLight(idx, n)) updates.push({ taskId: d, at, by, kind: 'cancel', from: n.status, to: 'cancelled', text: reason ? `${reason} (cancelled with its job)` : 'Cancelled with its job' });
    tasks.push(d);
  }
  return { patches, updates, tasks };
}

/** Reopening puts back what was cancelled with it, as it was. */
export function reopenInside(idx, id, { by, at, canWrite = () => true } = {}) {
  const patches = [];
  const updates = [];
  for (const d of descendantIds(idx, id)) {
    const n = idx.byId.get(d);
    if (n.kind !== KIND.task || n.status !== 'cancelled' || n.cancelled?.withId !== id || !canWrite(n)) continue;
    const f = reopenFields(idx, n);
    patches.push({ id: d, ...f, updatedAt: at, lastActivityAt: at, statusAt: at });
    if (!isLight(idx, n)) updates.push({ taskId: d, at, by, kind: 'reopen', from: 'cancelled', to: f.status, text: 'Reopened with its job' });
  }
  return { patches, updates };
}

/**
 * "Close them too", when a job is marked done: its open tasks become Done.
 * Tasks waiting for check are left as they are - closing them would approve
 * them without anyone checking - and so are tasks this person cannot write.
 * The role is the real one, never assumed. Only a task with an assignee gets
 * a timeline entry for it, as with cancelling.
 */
export function closeInside(idx, id, { by, at, role, canWrite = () => true } = {}) {
  const patches = [];
  const updates = [];
  const tasks = [];
  let leftInCheck = 0;
  for (const d of descendantIds(idx, id)) {
    const n = idx.byId.get(d);
    if (n.kind !== KIND.task || !isOpen(n.status)) continue;
    if (n.status === 'check') { leftInCheck += 1; continue; }
    if (!canWrite(n)) continue;
    const r = changeStatus(idx, d, 'done', { by, at, role });
    if (r.error) continue;
    patches.push(r.patches[0]);
    if (!isLight(idx, n)) updates.push(r.updates[0]);
    tasks.push(d);
  }
  return { patches, updates, tasks, leftInCheck };
}

/**
 * Change a task's status. Waiting takes `note` and `blockedBy`; Fix needs a
 * `comment`; Cancelled takes an optional `reason`. Finishing a task unblocks
 * what waits on it in the same batch, as far as `canWrite` allows.
 * @returns {{error: string}|{patches: object[], updates: object[]}}
 */
export function changeStatus(idx, id, to, { by, at, note = '', blockedBy = [], comment = '', reason = '', role = 'lead', canWrite = () => true } = {}) {
  const t = idx.byId.get(id);
  if (!t || t.kind !== KIND.task) return { error: 'That task has gone.' };
  const from = t.status ?? 'todo';
  const problem = changeProblem(from, to, role, isLight(idx, t));
  if (problem) return { error: problem };
  if (from === to && to !== 'waiting') return { patches: [], updates: [] };

  // Reopen: back exactly where it was, and what was cancelled with it too.
  if (from === 'cancelled' && to === reopenTo(t)) {
    const f = reopenFields(idx, t);
    const back = reopenInside(idx, id, { by, at, canWrite });
    return {
      patches: [{ id, ...f, updatedAt: at, lastActivityAt: at, statusAt: at }, ...back.patches],
      updates: [{ taskId: id, at, by, kind: 'reopen', from, to: f.status, text: '' }, ...back.updates],
    };
  }

  if (to === 'fix' && from === 'check' && !String(comment).trim()) return { error: 'Say what needs fixing: a send-back always says why.' };

  const patch = { id, status: to, updatedAt: at, lastActivityAt: at };
  // When it reached this status: Crew's bars show how long it has sat there.
  // Editing a wait is not a new status, so its clock keeps running.
  if (!(from === 'waiting' && to === 'waiting')) patch.statusAt = at;
  if (to === 'waiting') {
    // Editing a wait: the blockers it already has were checked when they were
    // added. Keep those still open, drop any that finished or went, and check
    // only the new ones.
    const had = new Set(from === 'waiting' ? (t.waiting?.blockedBy ?? []) : []);
    const list = [...new Set(blockedBy)].filter((b) => !had.has(b) || (idx.byId.has(b) && isOpen(idx.byId.get(b).status)));
    for (const b of list) {
      if (had.has(b)) continue;
      const p = blockerProblem(idx, id, b);
      if (p) return { error: `${nameOf(idx.byId.get(b)) || 'That task'}: ${p}` };
    }
    if (!list.length && !String(note).trim()) return { error: 'Say what it is waiting for, or pick the task holding it up.' };
    patch.waiting = {
      note: String(note).trim(),
      since: from === 'waiting' ? (t.waiting?.since ?? at) : at,
      prevStatus: from === 'waiting' ? restoreTo(t) : from,
      blockedBy: list,
    };
  } else if (from === 'waiting') {
    patch.waiting = null;
  }
  if (to === 'done') {
    patch.doneAt = at;
    if (from === 'check') { patch.checkedBy = by; patch.checkedAt = at; }
  } else if (from === 'done') {
    patch.doneAt = null;
  }
  // The send-back comment rides on the task too, so a tile and the designer's
  // list can show it without reading the timeline. It goes once the task is
  // resubmitted or finished.
  if (to === 'fix' && from === 'check') patch.fixNote = String(comment).trim();
  else if (to === 'check' || isFinished(to)) patch.fixNote = null;
  // Who submitted it: they may take it back.
  if (to === 'check') { patch.submittedBy = by; patch.submittedAt = at; }
  const why = String(reason ?? '').trim();
  if (to === 'cancelled') patch.cancelled = cancelRecord(t, { by, at, reason: why });
  else if (from === 'cancelled') patch.cancelled = null;

  let kind = from === 'waiting' && to === 'waiting' ? 'block' : eventKind(from, to);
  if (to === 'cancelled') kind = 'cancel';
  else if (from === 'cancelled') kind = 'reopen';
  const text = to === 'fix' ? String(comment).trim() : to === 'waiting' ? String(note).trim() : to === 'cancelled' ? why : String(comment ?? '').trim();
  const updates = [{ taskId: id, at, by, kind, from, to, text }];
  const patches = [patch];
  let finished = isFinished(to) ? [id] : [];
  const override = { [id]: to };
  if (to === 'cancelled') {
    const inside = cancelInside(idx, id, { by, at, reason: why, canWrite });
    patches.push(...inside.patches);
    updates.push(...inside.updates);
    finished = [id, ...inside.tasks];
    for (const x of inside.tasks) override[x] = 'cancelled';
  } else if (from === 'cancelled') {
    const back = reopenInside(idx, id, { by, at, canWrite });
    patches.push(...back.patches);
    updates.push(...back.updates);
  }
  if (finished.length) {
    const more = unblockFor(idx, finished, { by, at, statusOverride: override, canWrite });
    patches.push(...more.patches.filter((p) => !override[p.id]));
    updates.push(...more.updates.filter((u) => !override[u.taskId]));
  }
  return { patches, updates };
}

/** How much of the latest update a task carries for its row. */
export const LAST_NOTE_MAX = 280;

/** Posting an update: activity now, and a To-do task starts. */
export function postUpdate(idx, id, text, { by, at, canWrite = true, photos = [] } = {}) {
  const t = idx.byId.get(id);
  const body = String(text ?? '').trim();
  if (!t) return { error: 'That task has gone.' };
  // A photo can be the whole update ("as built"), with or without words.
  if (!body && !photos.length) return { error: 'Write the update first, or add a photo.' };
  const update = { taskId: id, at, by, kind: 'comment', text: body };
  if (photos.length) update.photos = photos;
  // Someone who may not write the task (a designer on the lead's job) still
  // posts: the update goes in, the task itself is left alone.
  if (!canWrite) return { patches: [], updates: [update] };
  // The latest update rides on the task too, so a row (a designer's list,
  // Ready for checking, a manager's Jobs) can show it without reading the
  // timeline.
  const said = body || (photos.length === 1 ? 'Added a photo' : `Added ${photos.length} photos`);
  const patch = { id, updatedAt: at, lastActivityAt: at, lastNote: { text: said.slice(0, LAST_NOTE_MAX), by, at } };
  if (t.kind === KIND.task && (t.status ?? 'todo') === 'todo') {
    patch.status = 'in_progress';
    patch.statusAt = at;
    update.from = 'todo';
    update.to = 'in_progress';
  }
  return { patches: [patch], updates: [update] };
}

/** What the timeline says happened, for an update. */
export function eventLabel(u) {
  switch (u?.kind) {
    case 'comment': return u.to === 'in_progress' ? 'Update · started it' : 'Update';
    case 'submit': return 'Submitted for check';
    case 'approve': return 'Approved';
    case 'sendback': return 'Sent back';
    case 'retract': return 'Taken back from check';
    case 'convert': return u.to === 'group' ? 'Turned into a category' : 'Turned into a job';
    case 'block': return 'Changed what it waits on';
    case 'unblock': return 'Unblocked';
    case 'assign': return 'Assigned';
    case 'create': return 'Created';
    case 'import': return 'Imported';
    case 'cancel': return 'Cancelled';
    case 'reopen': return `Reopened · ${LABEL[u.to] ?? u.to}`;
    // A manager's note on a shared job (sharing.js).
    case 'request': return `${{ question: 'Question', customer: 'Update from customer', request: 'Request' }[u.requestKind] ?? 'Request'}${u.cancels ? ' · customer cancelled' : ''}`;
    case 'status':
      if (u.to === 'in_progress' && (u.from === 'todo' || !u.from)) return 'Started';
      if (u.from === 'waiting' && u.to !== 'waiting') return `Stopped waiting · ${LABEL[u.to] ?? u.to}`;
      return `${LABEL[u.to] ?? u.to}`;
    default: return u?.kind ?? '';
  }
}
