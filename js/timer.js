// timer.js — the timer on quotable jobs (Phase 2.5, milestone 2, decided
// 2026-11-06): what starts it, pauses it, moves it with the task in progress,
// stops it at lunch and finish, and restarts it after lunch. The logic is
// timing.js, pure; this is the part with a clock, a store and a person.
//
// WHAT THIS APP LOOKS AFTER. A designer's app watches their own running
// entries; the lead's app watches everyone's, so a timer left running on a
// closed laptop is closed at its stop the next time the lead's app loads (and
// its own app does the same). Each also watches this person's entries of
// today, which is where a lunch pause and its restart are found, and the
// team's workday. The panel adds the open job's entries.
//
// THE RECONCILE runs on every change and every ten seconds: it writes what
// the data says has happened (timing.reconcileMine, closeForOthers,
// lunchRestart) and nothing else, and it is idempotent - the next run finds
// nothing to do. Writes in flight are remembered, so a run that comes before
// the write's echo does not write it twice.
//
// ONE TIMER PER PERSON: starting one pauses the other. The job's `timeTotal`
// (minutes, closed entries) is kept by whoever can write the job, after a
// close and whenever the open panel sees the job's entries differ from it.

import { state, node, setTime, personName } from './state.js';
import { Store } from './store.js';
import * as T from './tree.js';
import * as S from './status.js';
import * as TC from './timing.js';
import { nowISO, dayOf } from './dates.js';
import { toast } from './ui.js';
import { write, canWrite } from './actions.js';

/** The warning popup's drawing, registered by views/timer-ui.js (so this module stays free of views). */
export const hooks = { warn: null };

const works = () => state.role === 'lead' || state.role === 'designer';
const isLead = () => state.role === 'lead';
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

let started = false;
let todayKey = null;
let stopToday = null;
const pending = new Set();

/**
 * Warnings already answered on this device: once per stop, through a
 * reload too (sessionStorage; in memory if the browser will not keep it).
 */
const dismissed = (() => {
  const KEY = 'stella.design.timerWarned';
  let set;
  try { set = new Set(JSON.parse(sessionStorage.getItem(KEY) ?? '[]')); } catch { set = new Set(); }
  return {
    has: (k) => set.has(k),
    add: (k) => {
      set.add(k);
      try { sessionStorage.setItem(KEY, JSON.stringify([...set].slice(-20))); } catch { /* this page only */ }
    },
  };
})();

/** Start watching (once, after sign-in, for the lead and designers). */
export function startTimers() {
  if (started || !works()) return;
  started = true;
  const loaded = { running: false, today: false, workday: false };
  const done = (k) => { if (loaded[k]) return; loaded[k] = true; if (Object.values(loaded).every(Boolean)) setTime({ loaded: true }); };
  Store.watchTime(isLead() ? { end: null } : { by: state.me, end: null }, (list) => { setTime({ running: list ?? state.time.running }); done('running'); check(); });
  watchToday(() => done('today'));
  Store.watchWorkday((doc) => { setTime({ workday: TC.workdayOf(doc) }); done('workday'); check(); });
  setInterval(() => { check(); tickAll(); }, 10000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { check(); tickAll(); } });
}

/** This person's entries of today, re-watched when the day turns over. */
function watchToday(onFirst) {
  todayKey = dayOf();
  stopToday?.();
  stopToday = Store.watchTime({ by: state.me, day: todayKey }, (list) => { setTime({ today: list ?? state.time.today }); onFirst?.(); check(); });
}

const mine = () => state.time.running.filter((e) => e.by === state.me && !e.end);

/** My running timer, if any (one per person). */
export const myRunning = () => mine().sort((a, b) => String(b.start).localeCompare(String(a.start)))[0] ?? null;

/** Everyone's running entries on a job that this app can see. */
export const runningOn = (jobId) => state.time.running.filter((e) => e.jobId === jobId && !e.end);

/** The workday in force. */
export const workday = () => state.time.workday ?? TC.DEFAULT_WORKDAY;

/**
 * Write time changes (and any job patches with them) as one commit. Ids in
 * flight are held back from the reconcile until the write settles; the
 * jobs that lost a running entry get their total brought up to date.
 */
function commit({ close = [], open = [], timePatch = [], timeRemove = [], patch = [], updates = [] }, what = 'The timer did not save') {
  const tp = [...close.map((c) => ({ id: c.id, end: c.end, ...(c.pausedFor ? { pausedFor: c.pausedFor } : {}) })), ...timePatch];
  const ids = [...tp.map((p) => p.id), ...open.map((e) => e.id), ...timeRemove];
  const jobs = new Set([
    ...close.map((c) => state.time.running.find((e) => e.id === c.id)?.jobId ?? state.time.job.list.find((e) => e.id === c.id)?.jobId),
    ...timePatch.map((p) => state.time.job.list.find((e) => e.id === p.id)?.jobId),
    ...timeRemove.map((id) => state.time.job.list.find((e) => e.id === id)?.jobId),
  ].filter(Boolean));
  for (const id of ids) pending.add(id);
  const p = write({ timeSet: open, timePatch: tp, timeRemove, patch, updates }, what);
  p.catch(() => {}).finally(() => {
    for (const id of ids) pending.delete(id);
    for (const j of jobs) syncTotal(j);
    check();
  });
  return p;
}

/** Keep a job's `timeTotal` (closed minutes) right, when this person may write the job. */
async function syncTotal(jobId) {
  const job = node(jobId);
  if (!job || !canWrite(job) || !job.timeTracked && !job.timeTotal) return;
  let list = state.time.job.id === jobId && state.time.job.loaded ? state.time.job.list : null;
  if (!list) { try { list = await Store.getTime({ jobId }); } catch { return; } }
  const m = TC.closedMinutes(list);
  if ((node(jobId)?.timeTotal ?? 0) !== m && !pending.has(`total:${jobId}`)) {
    pending.add(`total:${jobId}`);
    write({ patch: [{ id: jobId, timeTotal: m }] }).catch(() => {}).finally(() => pending.delete(`total:${jobId}`));
  }
}

/**
 * THE RECONCILE: what the data says has happened, written once. Runs on
 * every change and every ten seconds.
 */
export function check() {
  if (!started || !state.ready || !state.time.loaded) return;
  if (dayOf() !== todayKey) { watchToday(); return; }
  const now = nowISO();
  const running = state.time.running.filter((e) => !pending.has(e.id));
  const r = TC.reconcileMine(running, { idx: state.idx, now, me: state.me });
  const others = isLead() ? TC.closeForOthers(running, { idx: state.idx, now, me: state.me }) : [];
  if (r.close.length || r.open.length || others.length) {
    // Said only when it is news to this person: their own timer stopped by
    // the day's boundary. Worked out before the write: a local write calls
    // back into this reconcile, and the entry is no longer running after it.
    const stops = new Map(state.time.running.map((e) => [e.id, e.stopAt]));
    const ended = r.open.length ? null : r.close.find((c) => stops.get(c.id) && Date.parse(c.end) >= Date.parse(stops.get(c.id)) - 1000 && Date.parse(stops.get(c.id)) <= Date.parse(now));
    commit({ close: [...r.close, ...others], open: r.open });
    if (ended) toast(ended.pausedFor === 'lunch' ? 'Timer paused for lunch' : 'Timer stopped for the day');
  }
  restartAfterLunch(now);
  warn(now);
}

/** The lunch restart, once, on whichever of this person's devices gets there first. */
function restartAfterLunch(now) {
  const r = TC.lunchRestart(state.time.today, state.time.running, { idx: state.idx, now, workday: workday(), me: state.me });
  if (!r || pending.has(r.entry.id)) return;
  commit({ open: [r.entry] });
  const name = T.nameOf(node(r.entry.taskId) ?? node(r.entry.jobId));
  if (r.late) {
    toast(`Timer restarted on ${name}`, {
      action: `Back since ${TC.clock(r.lunchEnd)}`, ms: 15000,
      onAction: () => commit({ timePatch: [{ id: r.entry.id, start: r.lunchEnd }] }),
    });
  } else {
    toast(`Timer restarted on ${name}`, { action: 'Stop', ms: 12000, onAction: () => stopEntry(r.entry.id) });
  }
}

/** The five-minute warning, on this device, once per stop. */
function warn(now) {
  const e = myRunning();
  const key = e ? `${e.id}|${e.stopAt}` : null;
  const show = e && TC.warningDue(e, now) && !dismissed.has(key);
  hooks.warn?.(show ? {
    text: TC.warningText(e, workday()),
    keepGoing: () => { dismissed.add(key); keepGoing(e.id); },
    stopNow: () => { dismissed.add(key); stopEntry(e.id); },
    okay: () => { dismissed.add(key); hooks.warn?.(null); },
  } : null);
}

// ---------------------------------------------------------------------------
// what a person does
// ---------------------------------------------------------------------------

/**
 * Start the job's timer for this person: time follows the job's task in
 * progress. Their other running timer pauses (one per person), and a To-do
 * job starts with it.
 */
export function startTimer(jobId) {
  const job = node(jobId);
  if (!job?.timeTracked) return;
  if (!TC.onBench(job)) {
    toast(`${S.LABEL[job.status] ?? 'Finished'}: the timer runs only while a job is being worked on.`, { warn: true });
    return;
  }
  const now = nowISO();
  const others = mine();
  const patch = [];
  const updates = [];
  if ((job.status ?? 'todo') === 'todo' && canWrite(job)) {
    const r = S.changeStatus(state.idx, jobId, 'in_progress', { by: state.me, at: now, role: state.role, canWrite });
    if (!r.error) { patch.push(...r.patches); updates.push(...r.updates); }
  }
  const entry = {
    id: Store.newId(), jobId, taskId: TC.followTarget(state.idx, jobId, state.me), by: state.me,
    start: now, end: null, ...TC.nextStop(now, workday()), source: 'timer', day: dayOf(), createdAt: now,
  };
  commit({ close: others.map((e) => ({ id: e.id, end: now })), open: [entry], patch, updates }, 'The timer did not start');
  const paused = others.filter((e) => e.jobId !== jobId).map((e) => node(e.jobId)?.title).filter(Boolean);
  toast(`Timer started${patch.length ? ' · job started' : ''}${paused.length ? ` · ${paused[0]} paused` : ''}`);
}

/** Pause this person's timer on a job. Pause never restarts by itself. */
export function pauseTimer(jobId) {
  const now = nowISO();
  const mineHere = mine().filter((e) => e.jobId === jobId);
  if (!mineHere.length) return;
  commit({ close: mineHere.map((e) => ({ id: e.id, end: now })) });
  toast('Timer paused');
}

/** Stop one running entry now (Stop now, the restart toast's Stop). Never restarts. */
export function stopEntry(id) {
  const e = state.time.running.find((x) => x.id === id && !x.end) ?? state.time.today.find((x) => x.id === id && !x.end);
  if (!e) return;
  commit({ close: [{ id, end: TC.latestOf(e.start, nowISO()) }] });
  hooks.warn?.(null);
  toast('Timer stopped');
}

/** Keep going: the stop moves to the next boundary (lunch to finish, finish to an hour on). */
export function keepGoing(id) {
  const e = state.time.running.find((x) => x.id === id && !x.end);
  if (!e) return;
  const next = TC.keepGoing(e, workday());
  commit({ timePatch: [{ id, stopAt: next.stopAt, stopFor: next.stopFor }] });
  hooks.warn?.(null);
  toast(`Keeping going: the timer now stops at ${TC.clock(next.stopAt)}`);
}

/**
 * "Track time" on a job, or off: anyone working on it (the lead, or a
 * designer who can edit the job; owner, 2026-11-06). Off hides the controls
 * and keeps the recorded time; this person's running timer on it stops.
 */
export function setTracked(jobId, on) {
  const job = node(jobId);
  if (!job || !canWrite(job) || Boolean(job.timeTracked) === on) return;
  const now = nowISO();
  const close = on ? [] : mine().filter((e) => e.jobId === jobId).map((e) => ({ id: e.id, end: now }));
  commit({ close, patch: [{ id: jobId, timeTracked: on, updatedAt: now }] }, 'Time tracking did not change');
  toast(on ? 'Time tracking on: Start is at the top of the job' : `Time tracking off${job.timeTotal ? `: ${TC.fmt(job.timeTotal * 60000)} kept` : ''}`, {
    action: 'Undo', onAction: () => commit({ patch: [{ id: jobId, timeTracked: !on, updatedAt: nowISO() }] }),
  });
}

// ---------------------------------------------------------------------------
// the open job's entries, and the Time log's changes
// ---------------------------------------------------------------------------

let jobUnsub = null;

/** Watch the entries of the job the panel shows (null: none). */
export function watchJob(jobId) {
  if ((state.time.job.id ?? null) === (jobId ?? null) && (jobUnsub || !jobId)) return;
  jobUnsub?.();
  jobUnsub = null;
  state.time.job = { id: jobId ?? null, list: [], loaded: false };
  if (!jobId) return;
  jobUnsub = Store.watchTime({ jobId }, (list, meta) => {
    if (state.time.job.id !== jobId) return;
    setTime({ job: { id: jobId, list: list ?? state.time.job.list, loaded: true, error: meta?.error ?? null } });
    syncTotal(jobId);
  });
}

/** + Add time: a stretch the timer missed, as yourself. */
export function addTime({ jobId, taskId = null, start, end }) {
  const now = nowISO();
  const problem = TC.entryProblem({ start, end }, now);
  if (problem) return problem;
  commit({ open: [{ id: Store.newId(), jobId, taskId, by: state.me, start, end, stopAt: null, stopFor: null, source: 'manual', day: TC.dayOfInstant(start), createdAt: now }] }, 'The time was not added');
  toast(`Added ${TC.fmt(Date.parse(end) - Date.parse(start))}`);
  return null;
}

/** May this person change an entry? Their own; the lead anyone's. */
export const canEditEntry = (e) => Boolean(e) && (isLead() || (state.role === 'designer' && e.by === state.me));

/** Fix an entry's start, stop or task. It shows as edited, by whom and when. */
export function editEntry(e, { start, end, taskId }) {
  if (!canEditEntry(e)) return 'Only whoever recorded it, or the Design lead, changes it.';
  const now = nowISO();
  const running = !e.end;
  const problem = running ? (Date.parse(start) < Date.parse(now) ? null : 'That start is still to come.') : TC.entryProblem({ start, end }, now);
  if (problem) return problem;
  const p = { id: e.id, start, taskId: taskId ?? null, day: TC.dayOfInstant(start), editedBy: state.me, editedAt: now };
  if (!running) p.end = end;
  commit({ timePatch: [p] }, 'The change did not save');
  toast('Time changed');
  return null;
}

/** Delete an entry (asked first, in the log). */
export function deleteEntry(e) {
  if (!canEditEntry(e)) return;
  const was = { ...e };
  commit({ timeRemove: [e.id] }, 'The entry was not deleted');
  // Undo writes it again, which the rules allow only as its own person.
  const word = `Deleted ${TC.fmt(TC.msOf(e, node(e.jobId), nowISO()))}${e.by === state.me ? '' : ` by ${personName(e.by)}`}`;
  toast(word, e.by === state.me ? { action: 'Undo', onAction: () => commit({ open: [was] }) } : {});
}

/** Text that ticks: every [data-tick-ms] element moves on to now, never past its stop. */
export function tickAll() {
  const t = Date.now();
  for (const el of document.querySelectorAll('[data-tick-ms]')) {
    const from = Number(el.dataset.tickFrom);
    const until = Number(el.dataset.tickUntil) || Infinity;
    const rate = Number(el.dataset.tickRate) || 1;      // two people timing one task: twice the time
    el.textContent = TC.fmt(Number(el.dataset.tickMs) + rate * Math.max(0, Math.min(t, until) - from));
  }
}

export { plural };
