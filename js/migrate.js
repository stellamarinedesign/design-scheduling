// migrate.js — steps merge into tasks (Phase 2.5, decided 2026-11-06).
//
// Before the change, a job held two kinds of thing: steps (`kind: 'step'`,
// a `label` and a `state` of todo | doing | done | na) and real tasks. Now
// there is one kind, and a task inside a job with no assignee of its own is
// what a step was (tree.isLight). This module is the bridge, and it is pure.
//
// THE MIGRATION is the Design lead's to run, once, and only when asked: the
// app shows the count with an Export a backup button beside Convert, and
// nothing converts on its own. Each step becomes a task in the same place,
// with nobody on it, written WHOLE (so its `label` and `state` go), live and
// archived alike, in batches the store keeps under Firestore's 500 a commit.
//
// UNTIL IT HAS RUN the app still reads step nodes: `readNode` shows each one
// as the task it will become (marked `legacyStep`), so every view works off
// tasks. A change to one is written back in a step's own terms
// (`stepPatch`): a tick is a state, a new name is a label; anything a step
// cannot hold is refused with a sentence, rather than converting it on the
// side. The rules keep their step branches until the live migration is done.

import { KIND, blankTask } from './tree.js';

/** A step's state, as a task's status. N/a is what Cancelled is now. */
export const STATE_TO_STATUS = { todo: 'todo', doing: 'in_progress', done: 'done', na: 'cancelled' };

/** And back, for writing a tick on a step that is not converted yet. */
export const STATUS_TO_STATE = { todo: 'todo', in_progress: 'doing', done: 'done', cancelled: 'na' };

export const isStep = (n) => n?.kind === KIND.step;

/** The reason an N/a step carries once it is a cancelled task. */
export const NA_REASON = 'Was N/a';

/**
 * The task a step becomes: every task field written, nobody on it, its
 * status from its state and `statusAt` from when it was last changed. An N/a
 * step is cancelled, by the lead, "Was N/a"; one that went N/a with its job
 * (`cancelledFrom`) keeps where it was and which job took it, so reopening
 * the job still brings it back. Whatever else the step carried (its sharing
 * flags, archivedAt, createdBy) is kept. `by` is the lead running it.
 */
export function stepAsTask(step, { by, at }) {
  const { label, state, cancelledFrom, ...rest } = step;
  const when = step.updatedAt ?? at;
  const status = STATE_TO_STATUS[state ?? 'todo'] ?? 'todo';
  const base = blankTask({
    id: step.id, parentId: step.parentId ?? null, order: step.order ?? 0, title: label ?? '',
    at: when, by: step.createdBy ?? by, status,
  });
  const task = {
    ...base,
    ...rest,
    kind: KIND.task,
    title: String(label ?? '').trim(),
    status,
    assignee: null,
    createdAt: step.createdAt ?? when,
    updatedAt: when,
    lastActivityAt: when,
    statusAt: when,
    doneAt: status === 'done' ? when : null,
    cancelled: null,
    archivedAt: step.archivedAt ?? null,
  };
  if (status === 'cancelled') {
    task.cancelled = {
      by, at: when, reason: NA_REASON,
      prevStatus: cancelledFrom?.state ? (STATE_TO_STATUS[cancelledFrom.state] ?? 'todo') : 'todo',
      prevWaiting: null, prevFixNote: null,
      ...(cancelledFrom?.withId ? { withId: cancelledFrom.withId } : {}),
    };
  }
  return task;
}

/**
 * How the app reads a node: a step not yet converted is shown as the task it
 * will become, marked so a change to it is written as a step.
 */
export function readNode(n) {
  return isStep(n) ? { ...stepAsTask(n, { by: n.createdBy ?? null, at: n.updatedAt ?? n.createdAt ?? null }), legacyStep: true } : n;
}

/**
 * The migration: every step (live and archived) as a whole task document.
 * @param {object[]} nodes  raw nodes; anything that is not a step is ignored
 * @returns {object[]} whole nodes to `set`
 */
export function convertSteps(nodes, { by, at }) {
  return (nodes ?? []).filter(isStep).map((s) => stepAsTask(s, { by, at }));
}

// Fields a step holds as they are, and fields a task works out for itself
// that a step does without (activity stamps, the latest update): those are
// left off quietly. A tick that empties a wait or a send-back note is fine too.
const SAME = ['archivedAt', 'parentId', 'order', 'sharedEffective', 'shareLevel', 'updatedAt'];
const DROPPED = ['lastActivityAt', 'lastBy', 'statusAt', 'doneAt', 'lastNote', 'submittedBy', 'submittedAt', 'checkedBy', 'checkedAt', 'homeOrder'];
const EMPTY_OK = ['waiting', 'fixNote'];

/** What a step that is not converted yet can hold, said once. */
export const STEP_LIMIT = 'it is still a step. Steps become tasks when the Design lead converts them; until then one can be ticked, renamed, moved or archived.';

/**
 * A change to a step not yet converted, in a step's own terms: a status as
 * its state, a title as its label, a cancel as N/a (remembering the job that
 * took it). Null when nothing is left to write; an error when it asks for
 * something a step cannot hold (a wait, a check, someone on it, a brief).
 * @returns {{patch: object|null}|{error: string}}
 */
export function stepPatch(step, patch) {
  const out = { id: patch.id };
  for (const [k, v] of Object.entries(patch)) {
    if (k === 'id' || DROPPED.includes(k)) continue;
    if (SAME.includes(k)) { out[k] = v; continue; }
    if (EMPTY_OK.includes(k) && (v === null || v === '')) continue;
    if (k === 'title') { out.label = String(v ?? '').trim(); continue; }
    if (k === 'status') {
      const s = STATUS_TO_STATE[v];
      if (!s) return { error: STEP_LIMIT };
      out.state = s;
      continue;
    }
    if (k === 'cancelled') {
      if (v?.withId) out.cancelledFrom = { state: STATUS_TO_STATE[v.prevStatus] ?? 'todo', withId: v.withId };
      else if (v === null && step?.cancelledFrom) out.cancelledFrom = null;
      continue;
    }
    if (k === 'assignee' && !v) continue;
    return { error: STEP_LIMIT };
  }
  const keys = Object.keys(out).filter((k) => k !== 'id' && k !== 'updatedAt');
  return { patch: keys.length ? out : null };
}
