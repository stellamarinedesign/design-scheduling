// convert.js — turn a job into a category, and a category back into a job
// (decided 2026-11-04, after first live use). Lead only; pure, like tree.js:
// it reads the index and returns patches and updates for one store commit.
//
// The import made some jobs that were really categories, and some
// categories that were really jobs. Converting fixes that in place:
//
// JOB → CATEGORY: `kind` becomes 'group' and it takes the next category
// colour. Its job details (status, brief, assignee, due, revision, folders,
// waiting, check and done records…) are KEPT BUT HIDDEN in `jobStash`, so
// turning it back restores the job as it was. Its subtasks become jobs in the
// new category, and its sections become sub-categories. Tasks that waited on
// it stop waiting on it: a category cannot hold anything up.
//
// ITS STEPS BECOME JOBS (owner's amendment, 2026-11-04): each top-level step
// becomes its own job in the new category, in the same place in the order -
// Done → Done, Doing → In progress, To do → To do - and its sub-steps stay
// steps inside that job. An N/a step is not a job; it stays hidden with the
// stash. A subtask under an N/a step is lifted out to the category, so
// nothing real is hidden. Turned back into a job, the step-jobs become
// subtasks like any other job inside it; they do not go back to steps.
//
// CATEGORY → JOB: `kind` becomes 'task'; the stash restores the job it used
// to be, or it starts as To do. Its jobs become subtasks and its
// sub-categories become sections inside the job. A category holding products
// is refused: a product can only live in a category.
//
// Both ways post a `convert` event in the timeline.

import { KIND, nameOf, childrenOf, descendantIds, isJob, isSection, newOrder, ORDER_GAP } from './tree.js';
import { removeBlockers } from './status.js';

/** The job fields that are stashed while it is a category. */
export const JOB_FIELDS = [
  'brief', 'status', 'waiting', 'priority', 'assignee', 'due', 'revision', 'folders',
  'checkedBy', 'checkedAt', 'doneAt', 'fixNote', 'cancelled', 'submittedBy', 'submittedAt',
  'homeOrder', 'backlogIgnored',
];

/** Why this job cannot become a category, or null. */
export function toCategoryProblem(idx, id) {
  const n = idx.byId.get(id);
  if (!n || n.kind !== KIND.task) return 'Only a job can become a category.';
  if (!isJob(idx, n)) return 'Only a job (a task directly in a category) can become a category. Move it out of its job first.';
  return null;
}

/** Why this category cannot become a job, or null. */
export function toJobProblem(idx, id) {
  const n = idx.byId.get(id);
  if (!n || n.kind !== KIND.group) return 'Only a category can become a job.';
  if (isSection(idx, n)) return 'That is a section inside a job, not a category.';
  const products = descendantIds(idx, id).map((d) => idx.byId.get(d)).filter((d) => d.kind === KIND.product);
  if (products.length) {
    const names = products.slice(0, 3).map(nameOf).join(', ');
    return `It holds ${products.length === 1 ? 'a product' : `${products.length} products`} (${names}${products.length > 3 ? '…' : ''}), and a product can only live in a category. Move ${products.length === 1 ? 'it' : 'them'} out first.`;
  }
  return null;
}

/**
 * A job becomes a category.
 * @param {{by: string, at: string, colour: number|null}} o  colour: the next category colour
 * @returns {{error: string}|{patches: object[], updates: object[]}}
 */
export function toCategory(idx, id, { by, at, colour = null }) {
  const problem = toCategoryProblem(idx, id);
  if (problem) return { error: problem };
  const n = idx.byId.get(id);
  const stash = {};
  for (const k of JOB_FIELDS) stash[k] = n[k] ?? null;
  const patch = { id, kind: KIND.group, name: n.title, jobStash: stash, colour: n.colour ?? colour, updatedAt: at };
  for (const k of JOB_FIELDS) patch[k] = null;
  const patches = [patch];

  const updates = [];
  // Its top-level steps become jobs, where they are; N/a steps stay hidden.
  for (const c of childrenOf(idx, id)) {
    if (c.kind !== KIND.step || c.state === 'na') continue;
    patches.push(stepToJob(c, { by, at, assignee: n.assignee ?? by }));
    updates.push({ taskId: c.id, at, by, kind: 'convert', from: KIND.step, to: KIND.task, text: `Was a step of ${n.title}` });
  }
  // A subtask under an N/a step would be hidden with it: lift it out to the category.
  let order = newOrder(idx, id, 'end');
  const lift = (pid) => {
    for (const c of childrenOf(idx, pid)) {
      if (c.kind === KIND.task) { patches.push({ id: c.id, parentId: id, order, updatedAt: at }); order += ORDER_GAP; }
      else if (c.kind === KIND.step) lift(c.id);
    }
  };
  for (const c of childrenOf(idx, id)) if (c.kind === KIND.step && c.state === 'na') lift(c.id);

  // It no longer holds anything up.
  const freed = removeBlockers(idx, [id], { by, at });
  patches.push(...freed.patches);
  return {
    patches,
    updates: [{ taskId: id, at, by, kind: 'convert', from: KIND.task, to: KIND.group, text: 'Turned into a category' }, ...updates, ...freed.updates],
  };
}

/** A step's state, as a job's status. */
export const STEP_TO_STATUS = { done: 'done', doing: 'in_progress', todo: 'todo' };

/** The patch that makes a step a job (or task) in its own place, with every task field written. */
function stepToJob(step, { by, at, assignee }) {
  const status = STEP_TO_STATUS[step.state ?? 'todo'] ?? 'todo';
  return {
    id: step.id, kind: KIND.task, title: step.label ?? '',
    brief: '', status, waiting: null, priority: 'normal',
    assignee, createdBy: step.createdBy ?? by,
    updatedAt: at, lastActivityAt: at,
    due: null, revision: null, folders: [],
    checkedBy: null, checkedAt: null, doneAt: status === 'done' ? at : null,
    fixNote: null, cancelled: null, submittedBy: null, submittedAt: null,
    homeOrder: null, backlogIgnored: false,
  };
}

/**
 * A category becomes a job: the stash brings back the job it was, or it
 * starts as To do, assigned to whoever converts it.
 * @returns {{error: string}|{patches: object[], updates: object[]}}
 */
export function toJob(idx, id, { by, at }) {
  const problem = toJobProblem(idx, id);
  if (problem) return { error: problem };
  const n = idx.byId.get(id);
  const s = n.jobStash ?? null;
  const fresh = {
    brief: '', status: 'todo', waiting: null, priority: 'normal', assignee: by, due: null, revision: null, folders: [],
    checkedBy: null, checkedAt: null, doneAt: null, fixNote: null, cancelled: null, submittedBy: null, submittedAt: null,
    homeOrder: null, backlogIgnored: false,
  };
  const patch = { id, kind: KIND.task, title: nameOf(n), jobStash: null, updatedAt: at, lastActivityAt: at, createdBy: n.createdBy ?? by };
  for (const k of JOB_FIELDS) patch[k] = s && k in s ? s[k] : fresh[k];
  // A stashed wait whose blockers have gone since is no wait at all.
  if (patch.status === 'waiting') {
    const w = patch.waiting ?? { note: '', blockedBy: [] };
    const blockedBy = (w.blockedBy ?? []).filter((b) => idx.byId.has(b));
    if (!blockedBy.length && !String(w.note ?? '').trim()) {
      patch.status = w.prevStatus && w.prevStatus !== 'waiting' ? w.prevStatus : 'todo';
      patch.waiting = null;
    } else {
      patch.waiting = { ...w, blockedBy };
    }
  }
  return {
    patches: [patch],
    updates: [{ taskId: id, at, by, kind: 'convert', from: KIND.group, to: KIND.task, text: 'Turned into a job' }],
  };
}
