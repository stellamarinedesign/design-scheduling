// metrics.js — due dates and throughput (Phase 4, owner 2026-11-26), as pure
// logic: Home's Due section and the Team tab's numbers.
//
// WHAT COUNTS. Jobs, and tasks with someone on them: the work that goes
// through the check. A task part of its job (nobody on it, tree.isLight)
// counts as its job, never on its own. Cancelled work is never "done".
//
// DUE: open work with a due date that is past, or within the next DUE_SOON
// days, the most overdue first. Due dates are calendar days (dates.js).
//
// THROUGHPUT, over the last WEEKS weeks (Monday to Sunday, local time):
//   done per week     approved work, by the week its doneAt falls in;
//   on time           of the done work that had a due date, the share done on
//                     or before it;
//   added to done     the usual (median) days from being added to being done.
//                     The app does not keep when work was first started, so
//                     this is the honest measure it has;
//   wait for check    the usual time from submitted to approved.
// Medians, not means: one job that sat for a year must not say "usually".
// Archived work counts too (the caller passes it in), so archiving the Done
// strip does not empty the numbers.

import { KIND, isJob, isLight } from './tree.js';
import { isOpen } from './status.js';
import { dayOf, daysUntil, parseDay } from './dates.js';

export const DUE_SOON = 7;
export const WEEKS = 12;
const DAY = 86400000;

/** Work that counts: a job, or a task with someone on it. */
const counts = (idx, n) => n?.kind === KIND.task && !isLight(idx, n);

/**
 * Open work that is overdue or due within `soon` days, the most overdue
 * first, then by date. `days` is days until due (negative: overdue).
 * @returns {Array<{t: object, days: number}>}
 */
export function dueList(idx, { now = Date.now(), soon = DUE_SOON } = {}) {
  const today = new Date(now);
  const out = [];
  for (const n of idx.nodes) {
    if (!counts(idx, n) || !isOpen(n.status) || n.archivedAt || !parseDay(n.due)) continue;
    const days = daysUntil(n.due, today);
    if (days !== null && days <= soon) out.push({ t: n, days });
  }
  return out.sort((a, b) => a.days - b.days || String(a.t.title).localeCompare(String(b.t.title)));
}

/** "Overdue 3 days", "Due today", "Due tomorrow", "Due in 4 days". */
export function dueWords(days) {
  if (days < -1) return `Overdue ${-days} days`;
  if (days === -1) return 'Overdue 1 day';
  if (days === 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';
  return `Due in ${days} days`;
}

/** The Monday of the week an instant falls in, as a calendar day (local). */
export function weekOf(ms) {
  const d = new Date(ms);
  return dayOf(new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7)));
}

/** The Mondays of the last `weeks` weeks, oldest first, this week last. */
export function weekStarts(now = Date.now(), weeks = WEEKS) {
  const monday = parseDay(weekOf(now));
  return Array.from({ length: weeks }, (_, i) => dayOf(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() - 7 * (weeks - 1 - i))));
}

const median = (list) => {
  if (!list.length) return null;
  const s = [...list].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const at = (iso) => { const t = Date.parse(iso ?? ''); return Number.isNaN(t) ? null : t; };

/**
 * The numbers, for everyone or for one person (`who`). The lead's own work
 * also takes in the jobs with nobody on them (`includeUnassigned`), as the
 * Team tab's column does.
 * @param {object} idx  an index over the live AND archived nodes
 * @returns {{weeks: string[], perWeek: number[], done: number, onTime: {hit: number, of: number}, addedToDone: number|null, checkWait: number|null}}
 */
export function throughput(idx, { now = Date.now(), weeks = WEEKS, who = null, includeUnassigned = false } = {}) {
  const starts = weekStarts(now, weeks);
  const from = parseDay(starts[0]).getTime();
  const perWeek = starts.map(() => 0);
  const ages = [];
  const waits = [];
  let hit = 0;
  let of = 0;
  for (const n of idx.nodes) {
    if (!counts(idx, n) || n.status !== 'done') continue;
    if (who && !(n.assignee === who || (includeUnassigned && !n.assignee && isJob(idx, n)))) continue;
    const done = at(n.doneAt);
    if (done === null || done < from || done > now) continue;
    perWeek[starts.indexOf(weekOf(done))] += 1;
    if (parseDay(n.due)) { of += 1; if (dayOf(new Date(done)) <= n.due) hit += 1; }
    const added = at(n.createdAt);
    if (added !== null && added <= done) ages.push((done - added) / DAY);
    const sent = at(n.submittedAt);
    const checked = at(n.checkedAt);
    if (sent !== null && checked !== null && sent <= checked) waits.push((checked - sent) / DAY);
  }
  return {
    weeks: starts, perWeek, done: perWeek.reduce((a, b) => a + b, 0),
    onTime: { hit, of }, addedToDone: median(ages), checkWait: median(waits),
  };
}

/** A usual time in days, in words: "under an hour", "5 hours", "1 day", "9 days", "3 weeks". */
export function spanWords(days) {
  if (days === null || days === undefined) return null;
  if (days < 1 / 24) return 'under an hour';
  if (days < 1) { const h = Math.round(days * 24); return `${h} hour${h === 1 ? '' : 's'}`; }
  if (days < 21) { const d = Math.round(days); return `${d} day${d === 1 ? '' : 's'}`; }
  return `${Math.round(days / 7)} weeks`;
}

/** "82%", or null when nothing done had a due date. */
export const onTimeWords = ({ hit, of }) => (of ? `${Math.round((hit / of) * 100)}%` : null);
