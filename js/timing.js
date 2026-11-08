// timing.js — time tracking on quotable jobs (Phase 2.5, milestone 2,
// decided 2026-11-06). Pure: no store, no DOM, no clock of its own (every
// function is handed `now`), so the tests hold it still.
//
// WHAT IS STORED. Every stretch of work is one `time` document with its real
// start and stop: { jobId, taskId | null, by, start, end | null, stopAt,
// stopFor, source, pausedFor?, day, createdAt, editedBy?, editedAt? }.
// Instants are ISO strings; DURATIONS ARE WORKED OUT, NEVER STORED.
//
// THE STOP IS IN THE DATA, NOT IN A RUNNING PAGE. A running entry carries
// `stopAt`, the next boundary of the day (lunch, finish, or an hour on after
// finish), moved by Keep going. Whatever reads it counts no further than
// that, so a timer left running on a closed laptop or a sleeping phone never
// counts overnight; the next app to load writes the `end` (`stopOf`). It
// also stops when the job leaves the bench (submitted for check, done,
// cancelled or set Waiting), is no longer tracked, or has gone.
//
// TIME FOLLOWS THE TASK IN PROGRESS (`followTarget`): the job's task that is
// In progress, the one started most recently when several are, else the job
// alone. When that changes while the timer runs, one entry closes and the
// next opens, with an id worked out from the old one, so two devices of the
// same person write the same entry rather than two.
//
// LUNCH. A timer stopped by the lunch boundary is `pausedFor: 'lunch'`, and
// only that pause restarts by itself (owner, 2026-11-06): at lunch end when
// the app is open, or from the moment it is next opened that day, with the
// lunch end on offer (`lunchRestart`). The restarted entry's id is made from
// the paused one's, so it happens once, however many devices are open.

import { KIND, childrenOf, descendantIds, ancestorChain, isContainer, nameOf } from './tree.js';
import { dayOf, pad } from './dates.js';

const MIN = 60000;
const HOUR = 60 * MIN;

/** The team's day when nobody has set one (owner, 2026-11-06): lunch 12:00 to 12:30, finish 4:30 pm. */
export const DEFAULT_WORKDAY = { lunchStart: '12:00', lunchEnd: '12:30', finish: '16:30' };

/** A warning this long before the stop. */
export const WARN_MS = 5 * MIN;

/** Keep going past finish: an hour more, and the same warning again. */
export const EXTRA_MS = HOUR;

/** Restarted more than this after lunch end, the app was not open then: start from now, offer the lunch end. */
export const LATE_MS = 2 * MIN;

/** The statuses a job is on the bench in; anything else stops its timers. */
export const OFF_BENCH = ['check', 'done', 'cancelled', 'waiting'];

const HM = /^([01]\d|2[0-3]):([0-5]\d)$/;
export const isHM = (s) => HM.test(String(s ?? ''));
const minsOf = (hm) => { const m = HM.exec(hm); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };

/** Why a workday will not do, or null. Lunch starts before it ends, which is before finish. */
export function workdayProblem(w) {
  for (const k of ['lunchStart', 'lunchEnd', 'finish']) if (!isHM(w?.[k])) return 'Each time needs hours and minutes.';
  if (!(minsOf(w.lunchStart) < minsOf(w.lunchEnd))) return 'Lunch has to end after it starts.';
  if (!(minsOf(w.lunchEnd) < minsOf(w.finish))) return 'Finish has to come after lunch.';
  return null;
}

/** settings/workday as the app uses it: the defaults stand in for anything missing or out of order. */
export const workdayOf = (doc) => {
  const w = { ...DEFAULT_WORKDAY, ...Object.fromEntries(Object.entries(doc ?? {}).filter(([k, v]) => k in DEFAULT_WORKDAY && isHM(v))) };
  return workdayProblem(w) ? { ...DEFAULT_WORKDAY } : w;
};

/** A clock time on the local day of an instant, as an instant. */
export function onDay(instant, hm) {
  const d = new Date(instant);
  const m = minsOf(hm) ?? 0;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), Math.floor(m / 60), m % 60).toISOString();
}

/** A calendar day and a clock time, as an instant ('2026-11-09', '14:05'). */
export function instantOf(day, hm) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(day ?? ''));
  const t = minsOf(hm);
  if (!m || t === null) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Math.floor(t / 60), t % 60).toISOString();
}

/** An instant's local clock time, 'HH:MM' (for time fields and the CSV). */
export const hmOf = (instant) => { const d = new Date(instant); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };

/** The calendar day an instant falls on, from local parts. */
export const dayOfInstant = (instant) => dayOf(new Date(instant));

/** '4:30', '12:00': how the owner writes the day's times. */
export function clock(instant) {
  const d = new Date(instant);
  const h = d.getHours() % 12 || 12;
  return `${h}:${pad(d.getMinutes())}`;
}

/** '4:30 pm': a time on its own, in the Time log. */
export const clockAmPm = (instant) => `${clock(instant)} ${new Date(instant).getHours() < 12 ? 'am' : 'pm'}`;

/**
 * Where a timer started at `from` stops: lunch start if it is before lunch,
 * finish if before finish (a start during lunch runs to finish), else an
 * hour on.
 * @returns {{stopAt: string, stopFor: 'lunch'|'finish'}}
 */
export function nextStop(from, workday) {
  const w = workdayOf(workday);
  const t = Date.parse(from);
  const lunch = Date.parse(onDay(from, w.lunchStart));
  const finish = Date.parse(onDay(from, w.finish));
  if (t < lunch) return { stopAt: new Date(lunch).toISOString(), stopFor: 'lunch' };
  if (t < finish) return { stopAt: new Date(finish).toISOString(), stopFor: 'finish' };
  return { stopAt: new Date(t + EXTRA_MS).toISOString(), stopFor: 'finish' };
}

/** Keep going: from lunch to finish (no lunch pause), from finish to an hour later. */
export function keepGoing(entry, workday) {
  const w = workdayOf(workday);
  if (entry.stopFor === 'lunch') return { stopAt: onDay(entry.stopAt, w.finish), stopFor: 'finish' };
  return { stopAt: new Date(Date.parse(entry.stopAt) + EXTRA_MS).toISOString(), stopFor: 'finish' };
}

/** Is the five-minute warning due for a running entry? */
export function warningDue(entry, now) {
  if (!entry || entry.end || !entry.stopAt) return false;
  const t = Date.parse(now);
  const stop = Date.parse(entry.stopAt);
  return t >= stop - WARN_MS && t < stop;
}

/** The warning's words (PLAN, "Lunch and the end of the day"). */
export function warningText(entry, workday) {
  const w = workdayOf(workday);
  if (entry.stopFor === 'lunch') return `Timer pauses at ${clock(entry.stopAt)} for lunch and restarts at ${clock(onDay(entry.stopAt, w.lunchEnd))}`;
  const finish = onDay(entry.stopAt, w.finish);
  return entry.stopAt === finish ? `Timer stops at ${clock(entry.stopAt)}, end of day` : `Timer stops at ${clock(entry.stopAt)}`;
}

// ---------------------------------------------------------------------------
// ids worked out, so two devices of one person converge on one entry
// ---------------------------------------------------------------------------

function fnv(text, seed) {
  let h = seed >>> 0;
  for (const ch of String(text)) { h ^= ch.codePointAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}
const hashId = (prefix, text) => `${prefix}${fnv(text, 0x811c9dc5)}${fnv(text, 0x050c5d1f)}`;

/** The entry a lunch pause restarts as: one id per paused entry. */
export const restartId = (pausedId) => hashId('tl', `${pausedId}|lunch`);

/** The entry that carries on when the task in progress changes. */
export const followId = (entryId, taskId) => hashId('tf', `${entryId}|${taskId ?? ''}`);

// ---------------------------------------------------------------------------
// what counts
// ---------------------------------------------------------------------------

export const onBench = (job) => Boolean(job) && !job.archivedAt && !OFF_BENCH.includes(job.status ?? 'todo');

const latest = (...isos) => isos.filter(Boolean).reduce((a, b) => (Date.parse(b) > Date.parse(a) ? b : a));

/** The later of some instants. */
export const latestOf = latest;

/**
 * Should a running entry stop, and when? Null while it should keep running.
 * The earliest of: its stopAt, once passed (a lunch stop is a lunch pause);
 * the job leaving the bench (at the moment it left, never before the entry
 * began); the job no longer tracked, archived or gone (now).
 * @returns {{end: string, pausedFor: 'lunch'|null}|null}
 */
export function stopOf(entry, job, now) {
  if (!entry || entry.end) return null;
  const t = Date.parse(now);
  const cands = [];
  // Never before it began (a stop moved back by an edit, a clock that jumped).
  if (entry.stopAt && Date.parse(entry.stopAt) <= t) cands.push({ end: latest(entry.start, entry.stopAt), pausedFor: entry.stopFor === 'lunch' ? 'lunch' : null });
  if (!job || job.archivedAt || job.timeTracked !== true) cands.push({ end: now, pausedFor: null });
  else if (!onBench(job)) {
    const left = latest(entry.start, job.statusAt ?? now);
    cands.push({ end: Date.parse(left) > t ? now : left, pausedFor: null });
  }
  if (!cands.length) return null;
  return cands.reduce((a, b) => (Date.parse(b.end) < Date.parse(a.end) ? b : a));
}

/** When an entry stops counting: its end, else the first of now and the stop worked out from the data. */
export function endOf(entry, job, now) {
  if (entry.end) return entry.end;
  const s = stopOf(entry, job, now);
  return s ? s.end : now;
}

/**
 * An entry's length in ms: never negative, and nothing for one whose stop is
 * before its start or whose times will not read. `job` caps a running one.
 */
export function msOf(entry, job, now) {
  const ms = Date.parse(endOf(entry, job, now)) - Date.parse(entry.start);
  return Number.isFinite(ms) && ms > 0 ? ms : 0;
}

/**
 * A stopped entry whose stop comes before its start: two devices whose clocks
 * disagree, or a hand edit. It counts as nothing, and the log says so.
 */
export const isBackwards = (e) => Boolean(e?.end) && Date.parse(e.end) < Date.parse(e.start);

/** '4h 35m', '2h', '35m', '0m'. */
export function fmt(ms) {
  const m = Math.max(0, Math.floor((ms ?? 0) / MIN));
  const h = Math.floor(m / 60);
  if (!h) return `${m}m`;
  return m % 60 ? `${h}h ${m % 60}m` : `${h}h`;
}

/** Whole minutes, as `timeTotal` keeps them: the closed entries of a job. */
export const closedMinutes = (entries) => Math.round(entries.filter((e) => e.end).reduce((s, e) => s + msOf(e, null, e.end), 0) / MIN);

// ---------------------------------------------------------------------------
// time follows the task in progress
// ---------------------------------------------------------------------------

/**
 * The task a person's time counts to in a job: its task that is In progress
 * - the one started most recently when several are - among those with nobody
 * on them (part of the job) and those that are this person's own; someone
 * else's task is theirs to time. A task holding tasks is passed over for
 * what is inside it. Null when none is: the time is the job's.
 */
export function followTarget(idx, jobId, who) {
  let best = null;
  for (const id of descendantIds(idx, jobId)) {
    const n = idx.byId.get(id);
    if (n.kind !== KIND.task || n.status !== 'in_progress' || isContainer(idx, n)) continue;
    if (n.assignee && n.assignee !== who) continue;
    const at = n.statusAt ?? n.updatedAt ?? '';
    if (!best || String(at) > String(best.at)) best = { id, at };
  }
  return best?.id ?? null;
}

/**
 * What a person's own running timers need now (their app's reconcile):
 * - more than one running (two devices raced): the newest stays, the rest stop now;
 * - one that should stop (`stopOf`) stops, as a lunch pause when lunch stopped it;
 * - one whose task in progress has changed closes now and the next opens,
 *   on the same stop, with an id worked out from it.
 * @returns {{close: {id: string, end: string, pausedFor?: 'lunch'}[], open: object[]}}
 */
export function reconcileMine(running, { idx, now, me }) {
  const close = [];
  const open = [];
  const mine = running.filter((e) => e.by === me && !e.end)
    .sort((a, b) => String(b.start).localeCompare(String(a.start)) || String(b.id).localeCompare(String(a.id)));
  for (const e of mine.slice(1)) close.push({ id: e.id, end: latest(e.start, now) });
  const e = mine[0];
  if (!e) return { close, open };
  const job = idx.byId.get(e.jobId);
  const s = stopOf(e, job, now);
  if (s) {
    close.push({ id: e.id, end: s.end, ...(s.pausedFor ? { pausedFor: s.pausedFor } : {}) });
    return { close, open };
  }
  const target = followTarget(idx, e.jobId, me);
  if ((target ?? null) !== (e.taskId ?? null)) {
    close.push({ id: e.id, end: now });
    open.push({
      id: followId(e.id, target), jobId: e.jobId, taskId: target, by: me, start: now, end: null,
      stopAt: e.stopAt, stopFor: e.stopFor, source: 'timer', day: dayOfInstant(now), createdAt: now,
    });
  }
  return { close, open };
}

/**
 * The running entries the lead's app closes for others: those whose stop has
 * come (closed at it, so nothing extra is counted), or whose job has left the
 * bench, is no longer tracked, or has gone.
 * @returns {{id: string, end: string, pausedFor?: 'lunch'}[]}
 */
export function closeForOthers(running, { idx, now, me }) {
  const out = [];
  for (const e of running) {
    if (e.end || e.by === me) continue;
    const s = stopOf(e, idx.byId.get(e.jobId), now);
    if (s) out.push({ id: e.id, end: s.end, ...(s.pausedFor ? { pausedFor: s.pausedFor } : {}) });
  }
  return out;
}

/**
 * The lunch restart (owner, 2026-11-06): today's lunch pause of this person
 * restarts once, at lunch end, on the job's task in progress - unless they
 * have a timer running already, it is past finish, or the job has left the
 * bench since. Late (the app was not open at lunch end): it starts now, and
 * the lunch end is offered.
 * @param {object[]} today  this person's entries of today (the restart entry among them once written)
 * @returns {{entry: object, late: boolean, lunchEnd: string}|null}
 */
export function lunchRestart(today, running, { idx, now, workday, me }) {
  if (running.some((e) => e.by === me && !e.end)) return null;
  const w = workdayOf(workday);
  const t = Date.parse(now);
  const paused = today.filter((e) => e.by === me && e.pausedFor === 'lunch' && e.end && dayOfInstant(e.end) === dayOfInstant(now))
    .sort((a, b) => String(b.end).localeCompare(String(a.end)))[0];
  if (!paused) return null;
  const id = restartId(paused.id);
  if (today.some((e) => e.id === id)) return null;
  const lunchEnd = onDay(now, w.lunchEnd);
  const finish = onDay(now, w.finish);
  if (t < Date.parse(lunchEnd) || t >= Date.parse(finish)) return null;
  const job = idx.byId.get(paused.jobId);
  if (!job || job.timeTracked !== true || !onBench(job)) return null;
  const late = t - Date.parse(lunchEnd) > LATE_MS;
  const start = late ? now : lunchEnd;
  return {
    late, lunchEnd,
    entry: {
      id, jobId: job.id, taskId: followTarget(idx, job.id, me), by: me, start, end: null,
      stopAt: finish, stopFor: 'finish', source: 'timer', day: dayOfInstant(now), createdAt: now,
    },
  };
}

// ---------------------------------------------------------------------------
// roll-ups, the log and the CSV
// ---------------------------------------------------------------------------

/**
 * Every node's time in a job, the tasks inside it included: a top-level
 * task shows its stage's total, and the job the whole. An entry on a task no
 * longer in the job counts to the job. ms by node id.
 * @returns {Map<string, number>}
 */
export function totals(idx, jobId, entries, now) {
  const job = idx.byId.get(jobId);
  const inJob = new Set(descendantIds(idx, jobId));
  const own = new Map();
  for (const e of entries) {
    if (e.jobId !== jobId) continue;
    const key = e.taskId && inJob.has(e.taskId) ? e.taskId : jobId;
    own.set(key, (own.get(key) ?? 0) + msOf(e, job, now));
  }
  const out = new Map();
  const walk = (id) => {
    let s = own.get(id) ?? 0;
    for (const c of childrenOf(idx, id)) s += walk(c.id);
    out.set(id, s);
    return s;
  };
  walk(jobId);
  return out;
}

/** The ids of the nodes a running entry's time is ticking into: its task and everything above it, up to the job. */
export function liveNodes(idx, entry) {
  if (!entry || entry.end) return new Set();
  const out = new Set([entry.jobId]);
  if (entry.taskId && idx.byId.has(entry.taskId)) {
    out.add(entry.taskId);
    for (const a of ancestorChain(idx, entry.taskId).reverse()) { if (a.id === entry.jobId) break; out.add(a.id); }
  }
  return out;
}

/** The stage an entry belongs to: the job's top-level task its task sits in (sections passed over), or ''. */
export function stageOf(idx, jobId, taskId) {
  if (!taskId || !idx.byId.has(taskId)) return '';
  const chain = [...ancestorChain(idx, taskId), idx.byId.get(taskId)];
  const at = chain.findIndex((n) => n.id === jobId);
  if (at === -1) return '';
  const top = chain.slice(at + 1).find((n) => n.kind === KIND.task);
  return top ? nameOf(top) : '';
}

/** Entries by calendar day, newest day first, each day in order. */
export function byDay(entries) {
  const days = new Map();
  for (const e of [...entries].sort((a, b) => String(a.start).localeCompare(String(b.start)))) {
    const d = dayOfInstant(e.start);
    if (!days.has(d)) days.set(d, []);
    days.get(d).push(e);
  }
  return [...days.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([day, list]) => ({ day, entries: list }));
}

/** Why an entry typed in will not do, or null: a start, a stop after it, not in the future. */
export function entryProblem({ start, end }, now) {
  if (!start || !end) return 'Give it a start and a stop.';
  if (!(Date.parse(end) > Date.parse(start))) return 'The stop has to come after the start.';
  if (Date.parse(end) > Date.parse(now)) return 'That stop is still to come.';
  if (Date.parse(end) - Date.parse(start) > 16 * HOUR) return 'More than 16 hours in one go: split it into the stretches it was.';
  return null;
}

const cell = (v) => {
  const s = String(v ?? '');
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/**
 * The CSV for a quote: day, start, stop, minutes, task, stage and person, in
 * order. A running entry stops where it would now.
 */
export function csvOf(idx, jobId, entries, { now, who = (e) => e }) {
  const job = idx.byId.get(jobId);
  const rows = [['Day', 'Start', 'Stop', 'Minutes', 'Task', 'Stage', 'Person']];
  for (const e of [...entries].filter((x) => x.jobId === jobId).sort((a, b) => String(a.start).localeCompare(String(b.start)))) {
    const end = endOf(e, job, now);
    const task = e.taskId && idx.byId.has(e.taskId) ? nameOf(idx.byId.get(e.taskId)) : nameOf(job);
    rows.push([dayOfInstant(e.start), hmOf(e.start), hmOf(end), Math.round(msOf(e, job, now) / MIN), task, stageOf(idx, jobId, e.taskId), who(e.by)]);
  }
  return `${rows.map((r) => r.map(cell).join(',')).join('\r\n')}\r\n`;
}
