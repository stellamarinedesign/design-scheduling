// status.js — the fixed statuses, and the rules that keep them cheap and true.
//
// Statuses are semantic, not stages anybody edits: To do → In progress →
// Ready for check → Done, with Waiting, Fix (sent back) and Cancelled beside
// them. What makes them worth trusting:
//
// - STARTING IS ONE TAP, and posting an update on a To-do task starts it. The
//   owner's TileDo data had 1 of 124 open tasks marked in progress because
//   changing status cost too much; Home is only true if this costs nothing.
// - ONLY A LEAD approves (check → done) or sends back (check → fix), and a
//   send-back always says why. The Firestore rules enforce the first half;
//   this is the same rule, so the UI never offers what the rules refuse.
// - WAITING REMEMBERS where it came from (`waiting.prevStatus`), so leaving it
//   restores that status instead of guessing.
// - A WAITING TASK CAN BE BLOCKED BY OTHER TASKS (`waiting.blockedBy`). When the
//   last blocker is done or cancelled the task unblocks itself, in the same
//   batch as the blocker's change, with an "Unblocked" update. A reconcile on
//   load catches a blocker finished by someone whose rules did not let them
//   touch the dependent. Cycles are refused.
//
// Everything here is pure: it reads an index (tree.js) and returns patches and
// updates for the store to write in one batch.

import { ancestorChain, descendantIds, nameOf, KIND } from './tree.js';

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

export const STEP_STATES = ['todo', 'doing', 'done', 'na'];
export const STEP_LABEL = { todo: 'To do', doing: 'Doing', done: 'Done', na: 'N/a' };
/** Tap to cycle: To do → Doing → Done → N/a → To do. */
export const nextStepState = (s) => STEP_STATES[(STEP_STATES.indexOf(s) + 1) % STEP_STATES.length];

/** Null when the change is allowed, a sentence when it is not. */
export function changeProblem(from, to, role = 'lead') {
  if (!STATUSES.includes(to)) return `Not a status: ${to}`;
  if (from === to && to !== 'waiting') return null;
  if (from === 'check' && (to === 'done' || to === 'fix') && role !== 'lead') {
    return 'Only the Design lead can approve or send back.';
  }
  return null;
}

/** The kind of timeline entry a change posts. */
function eventKind(from, to) {
  if (from === 'check' && to === 'done') return 'approve';
  if (from === 'check' && to === 'fix') return 'sendback';
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
  if (total === 1 && open.length === 1) return `Blocked by: ${nameOf(open[0])}`;
  if (total > 1) return `Waiting on ${total} tasks · ${finished.length} done`;
  const note = String(task.waiting?.note ?? '').trim();
  return note ? `Waiting: ${note}` : 'Waiting';
}

/** Restore from waiting: the remembered status, never 'waiting' itself. */
const restoreTo = (t) => {
  const prev = t.waiting?.prevStatus;
  return prev && prev !== 'waiting' && STATUSES.includes(prev) ? prev : 'todo';
};

function unblockOne(t, { by, at, why }) {
  return {
    patch: { id: t.id, status: restoreTo(t), waiting: null, updatedAt: at, lastActivityAt: at },
    update: { taskId: t.id, at, by, kind: 'unblock', from: 'waiting', to: restoreTo(t), text: why },
  };
}

/**
 * The dependents that unblock because `finishedIds` reach done or cancelled
 * in this same batch. `statusOverride` carries the batch's other pending
 * status changes, so a blocker finished two lines earlier counts.
 */
export function unblockFor(idx, finishedIds, { by, at, statusOverride = {} } = {}) {
  const patches = [];
  const updates = [];
  const statusOf = (id) => statusOverride[id] ?? idx.byId.get(id)?.status;
  const done = new Set(finishedIds);
  const deps = new Map();
  for (const id of finishedIds) for (const d of dependentsOf(idx, id)) deps.set(d.id, d);
  for (const d of deps.values()) {
    if (statusOverride[d.id]) continue;          // changed in this batch already
    const list = blockersOfTask(d);
    if (!list.length) continue;
    if (!list.every((b) => !idx.byId.has(b) || isFinished(statusOf(b)))) continue;
    const names = list.filter((b) => done.has(b)).map((b) => nameOf(idx.byId.get(b))).filter(Boolean);
    const why = names.length ? `Unblocked: ${names.join(', ')} finished` : 'Unblocked';
    const { patch, update } = unblockOne(d, { by, at, why });
    patches.push(patch);
    updates.push(update);
  }
  return { patches, updates };
}

/**
 * The idempotent sweep run on load: any waiting task whose blockers are all
 * finished (or gone) unblocks now. Run it twice and the second run finds
 * nothing. `canWrite(task)` lets a client skip what its rules would refuse.
 */
export function reconcile(idx, { by, at, canWrite = () => true } = {}) {
  const patches = [];
  const updates = [];
  for (const t of idx.nodes) {
    if (t.kind !== KIND.task || t.status !== 'waiting') continue;
    const list = t.waiting?.blockedBy ?? [];
    if (!list.length || !canWrite(t)) continue;
    const open = list.filter((b) => idx.byId.has(b) && isOpen(idx.byId.get(b).status));
    if (open.length) continue;
    const { patch, update } = unblockOne(t, { by, at, why: 'Unblocked: everything it was waiting on has finished' });
    patches.push(patch);
    updates.push(update);
  }
  return { patches, updates };
}

/**
 * A blocker is going away (archived or deleted): take it off every
 * blockedBy. A task left with no blockers and no reason unblocks; one left
 * with only finished blockers unblocks too; the rest keep waiting.
 */
export function removeBlocker(idx, blockerId, { by, at } = {}) {
  const patches = [];
  const updates = [];
  const gone = nameOf(idx.byId.get(blockerId));
  for (const d of dependentsOf(idx, blockerId)) {
    const rest = d.waiting.blockedBy.filter((b) => b !== blockerId);
    const note = String(d.waiting?.note ?? '').trim();
    const allDone = rest.length && rest.every((b) => !idx.byId.has(b) || !isOpen(idx.byId.get(b).status));
    if ((!rest.length && !note) || allDone) {
      const { patch, update } = unblockOne(d, { by, at, why: `Unblocked: ${gone || 'its blocker'} was removed` });
      patches.push(patch);
      updates.push(update);
    } else {
      patches.push({ id: d.id, waiting: { ...d.waiting, blockedBy: rest }, updatedAt: at });
    }
  }
  return { patches, updates };
}

/**
 * Change a task's status. Waiting takes `note` and `blockedBy`; Fix needs a
 * `comment`. Finishing a task unblocks what waits on it in the same batch.
 * @returns {{error: string}|{patches: object[], updates: object[]}}
 */
export function changeStatus(idx, id, to, { by, at, note = '', blockedBy = [], comment = '', role = 'lead' } = {}) {
  const t = idx.byId.get(id);
  if (!t || t.kind !== KIND.task) return { error: 'That task has gone.' };
  const from = t.status ?? 'todo';
  const problem = changeProblem(from, to, role);
  if (problem) return { error: problem };
  if (from === to && to !== 'waiting') return { patches: [], updates: [] };
  if (to === 'fix' && from === 'check' && !String(comment).trim()) return { error: 'Say what needs fixing: a send-back always says why.' };

  const patch = { id, status: to, updatedAt: at, lastActivityAt: at };
  if (to === 'waiting') {
    const list = [...new Set(blockedBy)];
    for (const b of list) {
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

  const kind = from === 'waiting' && to === 'waiting' ? 'block' : eventKind(from, to);
  const text = to === 'fix' ? String(comment).trim() : to === 'waiting' ? String(note).trim() : String(comment ?? '').trim();
  const updates = [{ taskId: id, at, by, kind, from, to, text }];
  const patches = [patch];
  if (isFinished(to)) {
    const more = unblockFor(idx, [id], { by, at, statusOverride: { [id]: to } });
    patches.push(...more.patches);
    updates.push(...more.updates);
  }
  return { patches, updates };
}

/** Posting an update: activity now, and a To-do task starts. */
export function postUpdate(idx, id, text, { by, at } = {}) {
  const t = idx.byId.get(id);
  const body = String(text ?? '').trim();
  if (!t) return { error: 'That task has gone.' };
  if (!body) return { error: 'Write the update first.' };
  const patch = { id, updatedAt: at, lastActivityAt: at };
  const update = { taskId: id, at, by, kind: 'comment', text: body };
  if (t.kind === KIND.task && (t.status ?? 'todo') === 'todo') {
    patch.status = 'in_progress';
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
    case 'block': return 'Changed what it waits on';
    case 'unblock': return 'Unblocked';
    case 'assign': return 'Assigned';
    case 'create': return 'Created';
    case 'import': return 'Imported';
    case 'status':
      if (u.to === 'in_progress' && (u.from === 'todo' || !u.from)) return 'Started';
      if (u.from === 'waiting' && u.to !== 'waiting') return `Stopped waiting · ${LABEL[u.to] ?? u.to}`;
      return `${LABEL[u.to] ?? u.to}`;
    default: return u?.kind ?? '';
  }
}
