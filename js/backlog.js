// backlog.js — Home's Backlog row, as pure logic (Home brief, 2026-11-04).
//
// POOL: my To-do jobs and sub-jobs (nodes with tasks under them; bottom-level
// tasks are left out) untouched for at least N days (default 14), not hidden.
// Mine is assigned to me, or a job with nobody on it; a task inside a job
// with nobody on it is part of that job, never in the pool itself.
// ROTATION: a daily seeded pick weighted toward the oldest, so the row holds
// still for a day and the oldest come round most often.
// HIDE: `backlogIgnored` takes an item out of the Backlog only, and is offered
// only when one of its ancestors is in the pool too - so a sub-job can stop
// doubling up with its job. Reversible from the task panel.

import { KIND, isJob, hasTaskChildren, ancestorChain } from './tree.js';
import { ageDays, dayOf } from './dates.js';

/**
 * @param {object} idx  the tree index
 * @param {{me: string, days: number, now?: number}} o
 */
export function backlogPool(idx, { me, days, now = Date.now() }) {
  return idx.nodes.filter((n) => {
    if (n.kind !== KIND.task || n.status !== 'todo' || n.backlogIgnored) return false;
    const job = isJob(idx, n);
    if (!(n.assignee === me || (!n.assignee && job))) return false;
    return (job || hasTaskChildren(idx, n.id)) && ageDays(n.lastActivityAt, now) >= days;
  });
}

/** May this item be hidden from the Backlog? Only when an ancestor is in the pool as well. */
export function canHideFromBacklog(idx, id, pool) {
  const ids = new Set(pool.map((n) => n.id));
  return ids.has(id) && ancestorChain(idx, id).some((a) => ids.has(a.id));
}

/** A small seeded random, so the pick holds still for a day. */
function seeded(seedText) {
  let h = 1779033703 ^ seedText.length;
  for (let i = 0; i < seedText.length; i++) { h = Math.imul(h ^ seedText.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  let a = h >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Today's pick: weighted toward the oldest (Efraimidis–Spirakis keys on a daily seed). */
export function todaysBacklog(pool, { count = 24, seed = dayOf(), now = Date.now() } = {}) {
  const rand = seeded(seed);
  return pool
    .map((n) => ({ n, key: Math.pow(rand(), 1 / Math.max(1, ageDays(n.lastActivityAt, now))) }))
    .sort((a, b) => b.key - a.key)
    .slice(0, count)
    .map((x) => x.n);
}
