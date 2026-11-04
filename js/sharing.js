// sharing.js — what the Design lead shares with manager contributors, and
// how a shared job reads from outside the design team. Pure (no store, no
// DOM), so the tests hold it still. PLAN: "Contributors, and a 'manager
// contributor' role", "Stage on shared jobs", and Cancelled's "Jobs".
//
// SHARING IS CHOSEN ON A NODE AND INHERITED. The lead sets `shared` on a job
// or on a group: 'status' (Status only), 'stage' (Status + stage), or 'off'
// (not shared, even inside a shared group); nothing means "as the group above
// it". A job's effective share is the nearest choice, itself first.
//
// THE RULES CANNOT WALK UP THE TREE, so the effective share is written onto
// the nodes a manager may read: `sharedEffective` and `shareLevel` on each
// shared job, and on the steps inside a job shared with its stage (through
// steps and sections, never into a subtask, which is somebody's work). The
// lead's app keeps them right on every change (sharePatches); nobody else
// may write them.
//
// REQUESTS. A manager adds a note to a shared job - a Question, an Update
// from customer, or a Request - as a `request` update in its timeline, and
// the job carries the latest one (`request`) and how many are open
// (`requestOpen`), so the lead's Home can list them without reading every
// timeline. A reply on the job, or Mark answered, closes them.

import * as T from './tree.js';
import { LABEL } from './status.js';
import { stepStrip } from './team.js';
import { dayOf } from './dates.js';

export const SHARE_LABEL = { status: 'Status only', stage: 'Status + stage' };
const CHOICES = ['status', 'stage', 'off'];

/** The lead's own choice on a node: 'status' | 'stage' | 'off', or null (as the group above). */
export const choiceOf = (n) => (CHOICES.includes(n?.shared) ? n.shared : null);

/**
 * What a node gets from above it, its own choice left out.
 * @returns {{level: 'status'|'stage'|null, from: object|null}}
 */
export function inherited(idx, id) {
  const chain = T.ancestorChain(idx, id);
  for (let i = chain.length - 1; i >= 0; i--) {
    const c = choiceOf(chain[i]);
    if (c) return { level: c === 'off' ? null : c, from: chain[i] };
  }
  return { level: null, from: null };
}

/** A node's effective share: its own choice, else the nearest above. */
export function shareOf(idx, id) {
  const n = idx.byId.get(id);
  const own = choiceOf(n);
  if (own) return { level: own === 'off' ? null : own, from: n };
  return inherited(idx, id);
}

/** The steps a manager may read for a job shared with its stage: through steps and sections, never into a task. */
export function stageNodes(idx, jobId) {
  const out = [];
  const walk = (pid) => {
    for (const c of T.childrenOf(idx, pid)) {
      if (c.kind === T.KIND.step) { out.push(c.id); walk(c.id); }
      else if (c.kind === T.KIND.group) walk(c.id);
    }
  };
  walk(jobId);
  return out;
}

/**
 * The patches that make `sharedEffective` and `shareLevel` right on every
 * node: on for shared jobs and (stage) their steps, off for anything that
 * had them and no longer should. Only what differs.
 * @returns {object[]}
 */
export function sharePatches(idx) {
  const want = new Map();
  for (const n of idx.nodes) {
    if (n.kind !== T.KIND.task || !T.isJob(idx, n)) continue;
    const { level } = shareOf(idx, n.id);
    if (!level) continue;
    want.set(n.id, level);
    if (level === 'stage') for (const s of stageNodes(idx, n.id)) want.set(s, 'stage');
  }
  const out = [];
  for (const n of idx.nodes) {
    const level = want.get(n.id) ?? null;
    const on = Boolean(level);
    if ((n.sharedEffective === true) !== on || (on && (n.shareLevel ?? null) !== level)) {
      out.push({ id: n.id, sharedEffective: on, shareLevel: level });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// a shared job, as a manager reads it
// ---------------------------------------------------------------------------

/**
 * How a status reads outside the design team: "Being checked" for Ready for
 * check (PLAN), and a send-back is simply still In progress - the check loop
 * is the team's own business.
 */
export function outsideStatus(s) {
  if (s === 'check') return { pill: 'check', label: 'Being checked' };
  if (s === 'fix') return { pill: 'in_progress', label: LABEL.in_progress };
  return { pill: s ?? 'todo', label: LABEL[s] ?? LABEL.todo };
}

export const JOB_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'in_progress', label: 'In progress' },
  { key: 'waiting', label: 'Waiting' },
  { key: 'check', label: 'Being checked' },
  { key: 'done', label: 'Done this month' },
];

const monthOf = (iso) => (iso ? dayOf(new Date(iso)).slice(0, 7) : null);
/** Finished (done or cancelled) in the month of `now`. */
export function finishedThisMonth(j, now = Date.now()) {
  const month = dayOf(new Date(now)).slice(0, 7);
  if (j.status === 'done') return monthOf(j.doneAt ?? j.statusAt) === month;
  if (j.status === 'cancelled') return monthOf(j.cancelled?.at ?? j.statusAt) === month;
  return false;
}

const MATCH = {
  all: (j, now) => (j.status !== 'done' && j.status !== 'cancelled') || finishedThisMonth(j, now),
  in_progress: (j) => j.status === 'in_progress' || j.status === 'fix',
  waiting: (j) => j.status === 'waiting',
  check: (j) => j.status === 'check',
  done: (j, now) => j.status === 'done' && finishedThisMonth(j, now),
};
const RANK = { check: 0, in_progress: 1, fix: 1, waiting: 2, todo: 3, done: 4, cancelled: 5 };

/** The jobs shared with managers: every shared job this reader has, a job and no deeper. */
export const sharedJobs = (idx) => idx.nodes.filter((n) => n.kind === T.KIND.task && n.sharedEffective === true && T.isJob(idx, n));

/**
 * The Jobs list: shared jobs through a filter and a search, busiest status
 * first, then most recently active.
 */
export function jobsList(idx, { filter = 'all', query = '', now = Date.now() } = {}) {
  const match = MATCH[filter] ?? MATCH.all;
  const q = String(query ?? '').trim().toLowerCase();
  return sharedJobs(idx)
    .filter((j) => match(j, now))
    .filter((j) => !q || q.split(/\s+/).every((w) => `${j.title} ${T.pathText(idx, j.id)}`.toLowerCase().includes(w)))
    .sort((a, b) => (RANK[a.status] ?? 9) - (RANK[b.status] ?? 9) || String(b.lastActivityAt ?? '').localeCompare(String(a.lastActivityAt ?? '')));
}

/** How many shared jobs each filter holds. */
export const filterCounts = (idx, now = Date.now()) => Object.fromEntries(JOB_FILTERS.map((f) => [f.key, sharedJobs(idx).filter((j) => MATCH[f.key](j, now)).length]));

/**
 * The Jobs list by the lead's categories: a section per category the jobs
 * come from (below the master category, as the Tasks list reads), in tree
 * order; deeper groups go under the job's title.
 * @returns {{id: string|null, group: object|null, items: {job: object, sub: string}[]}[]}
 */
export function byCategory(idx, jobs) {
  const pos = new Map();
  let k = 0;
  const walk = (pid) => { for (const c of T.childrenOf(idx, pid)) { pos.set(c.id, k++); if (T.isGroupLike(c)) walk(c.id); } };
  walk(null);
  const sections = new Map();
  for (const job of jobs) {
    const path = T.categoryPath(idx, job.id);
    const at = path.length > 1 ? 1 : 0;
    const group = path[at] ?? null;
    const sub = path.slice(at + 1).map(T.nameOf).join(' › ');
    const key = group?.id ?? '';
    if (!sections.has(key)) sections.set(key, { id: group?.id ?? null, group, items: [] });
    sections.get(key).items.push({ job, sub });
  }
  return [...sections.values()].sort((a, b) => (a.group ? pos.get(a.group.id) ?? 1e9 : 1e9 + 1) - (b.group ? pos.get(b.group.id) ?? 1e9 : 1e9 + 1));
}

/**
 * A job's stage, from the steps this reader can see: the strip, the current
 * step and how far along, e.g. "Approval (waiting) · 1 of 8". Null when it
 * has no steps.
 */
export function stageOf(idx, job) {
  const strip = stepStrip(idx, job.id);
  if (!strip.length) return null;
  const { done, total } = T.progress(idx, job.id);
  const next = T.nextStep(idx, job.id);
  let line;
  if (!next) line = `All steps done · ${done} of ${total}`;
  else {
    const word = job.status === 'waiting' ? 'waiting'
      : next.kind === T.KIND.step ? (next.state === 'doing' ? 'under way' : 'next')
        : outsideStatus(next.status).label.toLowerCase();
    line = `${T.nameOf(next)} (${word}) · ${done} of ${total}`;
  }
  return { strip, line, done, total };
}

// ---------------------------------------------------------------------------
// requests: a manager's notes on a shared job
// ---------------------------------------------------------------------------

export const REQUEST_KINDS = { question: 'Question', customer: 'Update from customer', request: 'Request' };
export const REQUEST_TEXT_MAX = 1000;
export const REQUEST_LINE_MAX = 280;

/**
 * A manager's note: the update for the timeline, and the job's own copy of
 * the latest one with the open count one higher (the rules check both).
 * @returns {{patch: object, update: object}|{error: string}}
 */
export function requestWrite(job, { kind, text, cancels = false, by, at }) {
  const body = String(text ?? '').trim().slice(0, REQUEST_TEXT_MAX);
  if (!job) return { error: 'That job is not shared any more.' };
  if (!body) return { error: 'Write the note first.' };
  const k = REQUEST_KINDS[kind] ? kind : 'question';
  const c = k === 'customer' && Boolean(cancels);
  return {
    patch: { id: job.id, request: { kind: k, text: body.slice(0, REQUEST_LINE_MAX), cancels: c, by, at }, requestOpen: (job.requestOpen ?? 0) + 1 },
    update: { taskId: job.id, at, by, kind: 'request', requestKind: k, text: body, cancels: c },
  };
}

/** The jobs with notes from managers still to answer, the longest waiting first. */
export const requestQueue = (idx) => idx.nodes
  .filter((n) => n.kind === T.KIND.task && (n.requestOpen ?? 0) > 0)
  .sort((a, b) => String(a.request?.at ?? '').localeCompare(String(b.request?.at ?? '')));

/** The reason a one-tap Cancel job writes, from the customer's update. */
export const cancelReason = (job, who = (e) => e) => {
  const r = job?.request;
  const said = String(r?.text ?? '').trim();
  return `Customer cancelled${r?.by ? ` (via ${who(r.by)})` : ''}${said ? `: ${said}` : ''}`.slice(0, 500);
};

/** What the timeline calls a request. */
export const requestLabel = (u) => `${REQUEST_KINDS[u?.requestKind] ?? 'Request'}${u?.cancels ? ' · customer cancelled' : ''}`;
