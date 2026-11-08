// views/timer-ui.js — what time tracking looks like (Phase 2.5, milestone 2,
// decided 2026-11-06): the job panel's Start / Pause and total, each task's
// own time on its tile and row, the clock mark on a job's tile, the
// five-minute warning, and the Time log sheet. The timer itself is timer.js.
//
// FIGURES TICK WITHOUT REDRAWING. A figure with a running entry inside it
// carries what it was when drawn and how many timers feed it; timer.js moves
// every such figure on every ten seconds (data-tick-*), never past the stop.
//
// THE WARNING DOES NOT TAKE FOCUS. Someone mid-drawing should not have their
// typing land in a popup: it slides in at the corner, its words are read out
// (role="alert"), and its buttons are there for the mouse or a Tab.

import { el, btn, icon, iconBtn, toast } from '../ui.js';
import { state, node, personName, realName } from '../state.js';
import * as T from '../tree.js';
import * as TC from '../timing.js';
import * as TR from '../timer.js';
import { canWrite } from '../actions.js';
import { Store } from '../store.js';
import { openDialog, confirmDialog } from '../dialog.js';
import { nowISO, dayOf, dayLabel } from '../dates.js';

const works = () => state.role === 'lead' || state.role === 'designer';

// ---------------------------------------------------------------------------
// figures
// ---------------------------------------------------------------------------

/**
 * A job's times as the panel draws them: each node's total (its insides
 * included), how many running timers feed each, and the earliest stop among
 * them. Null until the job's entries are in hand, or when it is not tracked.
 */
export function jobTimes(jobId) {
  const job = node(jobId);
  const t = state.time.job;
  if (!job?.timeTracked || t.id !== jobId || !t.loaded) return null;
  const now = nowISO();
  const totals = TC.totals(state.idx, jobId, t.list, now);
  const live = new Map();
  let until = Infinity;
  for (const e of t.list) {
    if (e.end || TC.stopOf(e, job, now)) continue;
    for (const id of TC.liveNodes(state.idx, e)) live.set(id, (live.get(id) ?? 0) + 1);
    if (e.stopAt) until = Math.min(until, Date.parse(e.stopAt));
  }
  return { totals, live, until, at: Date.now(), list: t.list };
}

/** A figure that ticks while timers feed it: '1h 20m'. */
export function figure(times, id, { cls = 'meta', always = false } = {}) {
  if (!times) return null;
  const ms = times.totals.get(id) ?? 0;
  const rate = times.live.get(id) ?? 0;
  if (!ms && !rate && !always) return null;
  const span = el('span', { class: `${cls} time-fig${rate ? ' live' : ''}`.trim(), title: rate ? 'Time so far, ticking' : 'Time recorded' }, TC.fmt(ms));
  if (rate) {
    span.dataset.tickMs = String(ms);
    span.dataset.tickFrom = String(times.at);
    if (Number.isFinite(times.until)) span.dataset.tickUntil = String(times.until);
    if (rate > 1) span.dataset.tickRate = String(rate);
  }
  return span;
}

/** A job's clock mark on its tile or row: tracked, and its recorded total (kept on the job, so lists read no entries). */
export function timeMark(t) {
  if (!t?.timeTracked) return null;
  const mine = TR.myRunning()?.jobId === t.id;
  const total = TC.fmt((t.timeTotal ?? 0) * 60000);
  return el('span', {
    class: `time-mark${mine ? ' live' : ''}`,
    title: mine ? `Your timer is running · ${total} recorded` : `Time tracked · ${total} recorded`,
    'aria-label': mine ? `Your timer is running, ${total} recorded` : `Time tracked, ${total} recorded`,
  }, icon('clock', 14), el('span', {}, total));
}

/** "Track time" for the job's ⋯ menu: anyone working on it (owner, 2026-11-06). */
export function trackItem(t) {
  if (!t || !T.isJob(state.idx, t) || !canWrite(t)) return null;
  return t.timeTracked
    ? { label: 'Stop tracking time', icon: 'clock', onSelect: () => TR.setTracked(t.id, false) }
    : { label: 'Track time', icon: 'clock', onSelect: () => TR.setTracked(t.id, true) };
}

// ---------------------------------------------------------------------------
// the job panel: Start / Pause and the total
// ---------------------------------------------------------------------------

/**
 * The timer at the top of a tracked job's panel: Start or Pause, the job's
 * total (opens the Time log), and what the time is counting to.
 */
export function timerBar(job) {
  if (!job?.timeTracked) return null;
  const times = jobTimes(job.id);
  const running = TR.myRunning();
  const mineHere = running?.jobId === job.id;
  const others = (times?.list ?? []).filter((e) => !e.end && e.by !== state.me && !TC.stopOf(e, job, nowISO()));
  const who = [...new Set(others.map((e) => personName(e.by)))];
  const total = times ? figure(times, job.id, { cls: 'timer-total-fig', always: true }) : el('span', { class: 'timer-total-fig' }, TC.fmt((job.timeTotal ?? 0) * 60000));
  let control = null;
  let line = '';
  if (works() && TC.onBench(job)) {
    control = mineHere
      ? btn('Pause', () => TR.pauseTimer(job.id), { cls: 'sm timer-btn on', ic: 'pause', title: 'Pause your timer. It does not restart by itself.' })
      : btn('Start', () => TR.startTimer(job.id), { cls: 'sm timer-btn', ic: 'play', title: running ? `Start timing this job (pauses ${node(running.jobId)?.title ?? 'your other timer'})` : 'Start timing this job' });
    if (mineHere) {
      const task = node(running.taskId);
      line = `On ${task ? task.title : 'the job'} · stops ${TC.clock(running.stopAt)}${running.stopFor === 'lunch' ? ' for lunch' : ''}`;
    } else if (running) {
      line = `Your timer is on ${node(running.jobId)?.title ?? 'another job'}`;
    }
  } else if (works()) {
    line = 'The timer runs while the job is being worked on';
  }
  if (who.length) line = [line, `${who.join(', ')} timing too`].filter(Boolean).join(' · ');
  return el('div', { class: 'timer-bar', role: 'group', 'aria-label': 'Time' },
    control,
    el('button', { class: 'timer-total', type: 'button', title: 'Open the time log', 'aria-label': `Time recorded: ${total.textContent}. Open the time log`, onclick: () => openTimeLog(job.id) },
      icon('clock', 16), total),
    line ? el('span', { class: 'meta timer-line' }, line) : null);
}

/** A task's time in the panel's property row, inside a tracked job: opens the job's log. */
export function taskTime(n) {
  const job = T.jobOf(state.idx, n.id);
  if (!job?.timeTracked || job.id === n.id) return null;
  const times = jobTimes(job.id);
  const fig = figure(times, n.id, { cls: '', always: true });
  if (!fig) return null;
  return el('button', { class: 'pv-btn', type: 'button', title: 'Open the job\'s time log', 'aria-label': `Time on this task: ${fig.textContent}. Open the time log`, onclick: () => openTimeLog(job.id) }, fig);
}

// ---------------------------------------------------------------------------
// the five-minute warning
// ---------------------------------------------------------------------------

let warnEl = null;
let warnKey = null;
let hideTimer = null;

/** Draw (or take away) the warning. `o`: {text, keepGoing, stopNow, okay}, or null. */
function renderWarning(o) {
  if (!o) {
    if (!warnEl || warnEl.hidden) return;
    warnEl.classList.remove('show');
    warnKey = null;
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => { if (!warnKey && warnEl) warnEl.hidden = true; }, 160);
    return;
  }
  if (warnKey === o.text && warnEl && !warnEl.hidden) return;
  warnKey = o.text;
  clearTimeout(hideTimer);
  if (!warnEl) {
    warnEl = el('section', { class: 'timer-warn', 'aria-label': 'Timer', hidden: true });
    document.body.append(warnEl);
  }
  warnEl.textContent = '';
  warnEl.append(
    el('div', { class: 'timer-warn-head' }, icon('clock', 18), el('span', { role: 'alert' }, o.text)),
    el('div', { class: 'timer-warn-acts' },
      btn('Keep going', o.keepGoing, { cls: 'sm', title: 'Move the stop on: lunch to finish, finish to an hour later' }),
      btn('Stop now', o.stopNow, { cls: 'sm' }),
      el('span', { class: 'sp' }),
      btn('Okay', o.okay, { cls: 'sm', title: 'Clear this. The timer still stops at the time shown.' })));
  warnEl.hidden = false;
  // Next frame: the hidden → shown change has to be drawn first for the slide to run.
  requestAnimationFrame(() => requestAnimationFrame(() => warnEl?.classList.add('show')));
}
TR.hooks.warn = renderWarning;

// ---------------------------------------------------------------------------
// the Time log
// ---------------------------------------------------------------------------

/** The tasks an entry can be put on: the job itself, then every task in it, indented. */
function taskOptions(jobId, current) {
  const opts = [el('option', { value: '', selected: !current }, 'The job itself')];
  const walk = (pid, depth) => {
    for (const c of T.childrenOf(state.idx, pid)) {
      if (c.kind === T.KIND.task) opts.push(el('option', { value: c.id, selected: c.id === current }, `${' '.repeat(depth)}${c.title}`));
      if (c.kind === T.KIND.task || c.kind === T.KIND.group) walk(c.id, c.kind === T.KIND.task ? depth + 1 : depth);
    }
  };
  walk(jobId, 0);
  return opts;
}

/** "edited by Alex, 4 Nov" / "added by Alex, 4 Nov": the honest record. */
function provenance(e) {
  const when = (iso) => dayLabel(TC.dayOfInstant(iso));
  const who = (email) => (email === state.me ? 'you' : personName(email));
  if (e.editedBy) return `edited by ${who(e.editedBy)}, ${when(e.editedAt)}`;
  if (e.source === 'manual') return `added by ${who(e.by)}, ${when(e.createdAt ?? e.start)}`;
  return '';
}

/**
 * The Time log: every entry of the job by day, newest day first, with start
 * and stop, length, task and person. Your own entries (the lead: anyone's)
 * can be fixed - start, stop, task - or deleted; + Add time records a
 * stretch the timer missed; Export CSV is for the quote.
 */
export function openTimeLog(jobId) {
  const job = node(jobId);
  if (!job) return;
  let entries = [];
  let loaded = false;
  let form = null;            // {kind: 'add'} | {kind: 'edit', id}
  let stale = false;
  let unsub = null;
  openDialog((box, close, { dismiss }) => {
    box.classList.add('time-log');
    const totalEl = el('span', { class: 'meta' });
    const addBtn = btn('Add time', () => { form = { kind: 'add' }; draw(); }, { cls: 'sm', ic: 'plus' });
    const csvBtn = btn('Export CSV', () => exportCsv(jobId, entries), { cls: 'sm', ic: 'download' });
    const body = el('div', { class: 'tl-body' });
    box.append(
      el('div', { class: 'tl-head' },
        el('div', { class: 'tl-title' }, el('h3', {}, 'Time log'), el('div', { class: 'meta wrap' }, job.title)),
        totalEl),
      el('div', { class: 'row tl-tools' }, addBtn, csvBtn),
      body,
      el('div', { class: 'actions' }, btn('Close', dismiss)));

    const draw = () => {
      stale = false;
      const now = nowISO();
      const fresh = node(jobId) ?? job;
      const sum = entries.reduce((s, e) => s + TC.msOf(e, fresh, now), 0);
      totalEl.textContent = loaded ? `${TC.fmt(sum)} in all` : '';
      csvBtn.disabled = !entries.length;
      addBtn.disabled = form?.kind === 'add';
      body.textContent = '';
      if (form?.kind === 'add') body.append(entryForm({ jobId, onDone: () => { form = null; draw(); } }));
      if (!loaded) { body.append(el('div', { class: 'skel', 'aria-busy': 'true', style: { 'min-height': '80px' } })); return; }
      if (!entries.length) {
        body.append(el('div', { class: 'empty' }, el('span', {}, 'No time recorded yet. Start the timer at the top of the job, or add a stretch it missed.')));
        return;
      }
      for (const { day, entries: list } of TC.byDay(entries)) {
        const dayMs = list.reduce((s, e) => s + TC.msOf(e, fresh, now), 0);
        const sec = el('section', { class: 'tl-day', 'aria-label': dayLabel(day) },
          el('div', { class: 'tl-day-head' }, el('h4', { class: 'lbl' }, day === dayOf() ? `Today · ${dayLabel(day)}` : dayLabel(day)), el('span', { class: 'meta' }, TC.fmt(dayMs))));
        for (const e of list) sec.append(form?.kind === 'edit' && form.id === e.id ? entryForm({ jobId, entry: e, onDone: () => { form = null; draw(); } }) : entryRow(e, fresh, now));
        body.append(sec);
      }
    };

    const entryRow = (e, fresh, now) => {
      const running = !e.end && !TC.stopOf(e, fresh, now);
      const end = TC.endOf(e, fresh, now);
      const task = e.taskId ? node(e.taskId) : null;
      const prov = provenance(e);
      const can = TR.canEditEntry(e);
      return el('div', { class: `tl-row${running ? ' live' : ''}` },
        el('div', { class: 'tl-when' },
          el('span', { class: 'tl-times' }, `${TC.clockAmPm(e.start)} – ${running ? 'now' : TC.clockAmPm(end)}`),
          el('span', { class: 'tl-dur' }, TC.fmt(TC.msOf(e, fresh, now)))),
        el('div', { class: 'tl-what' },
          el('span', { class: 'tl-task' }, task ? task.title : e.taskId ? 'A task since removed' : 'The job itself'),
          el('span', { class: 'meta' }, [personName(e.by), e.pausedFor === 'lunch' ? 'paused for lunch' : '', prov].filter(Boolean).join(' · '))),
        can ? el('div', { class: 'tl-acts' },
          btn('Edit', () => { form = { kind: 'edit', id: e.id }; draw(); }, { cls: 'sm ghost', ic: 'edit' }),
          iconBtn('trash', `Delete ${TC.clockAmPm(e.start)} entry`, async () => {
            const ok = await confirmDialog({ title: 'Delete this time?', body: `${TC.fmt(TC.msOf(e, fresh, now))} on ${task ? task.title : 'the job'}, ${dayLabel(TC.dayOfInstant(e.start))}, by ${personName(e.by)}. It comes off the job's total.`, ok: 'Delete', destructive: true });
            if (ok) TR.deleteEntry(e);
          }, 'sm')) : null);
    };

    unsub = Store.watchTime({ jobId }, (list) => {
      entries = list ?? entries;
      loaded = true;
      // An open form is never redrawn under the cursor; it catches up when closed.
      if (form) { stale = true; return; }
      draw();
    });
    draw();

    /** Add or edit: day, start, stop, task. A running entry has no stop to change. */
    function entryForm({ jobId: jid, entry = null, onDone }) {
      const running = entry && !entry.end;
      const err = el('div', { class: 'form-err', role: 'alert' });
      const day = el('input', { class: 'input', type: 'date', value: entry ? TC.dayOfInstant(entry.start) : dayOf(), 'aria-label': 'Day', max: dayOf() });
      const start = el('input', { class: 'input', type: 'time', value: entry ? TC.hmOf(entry.start) : '', 'aria-label': 'Start', required: true });
      const stop = el('input', { class: 'input', type: 'time', value: entry?.end ? TC.hmOf(entry.end) : '', 'aria-label': 'Stop', required: !running, disabled: Boolean(running) });
      const task = el('select', { class: 'sel', 'aria-label': 'Task' }, taskOptions(jid, entry?.taskId ?? null));
      const save = () => {
        const s = TC.instantOf(day.value, start.value);
        const f = running ? null : TC.instantOf(day.value, stop.value);
        if (!s || (!running && !f)) { err.textContent = 'Give it a day, a start and a stop.'; return; }
        const problem = entry ? TR.editEntry(entry, { start: s, end: f, taskId: task.value || null }) : TR.addTime({ jobId: jid, taskId: task.value || null, start: s, end: f });
        if (problem) { err.textContent = problem; return; }
        onDone();
        if (stale) draw();
      };
      const wrap = el('div', { class: 'tl-form', role: 'group', 'aria-label': entry ? 'Change this time' : 'Add time' },
        el('div', { class: 'tl-form-fields' },
          el('label', { class: 'field' }, el('span', { class: 'lbl' }, 'Day'), day),
          el('label', { class: 'field' }, el('span', { class: 'lbl' }, 'Start'), start),
          el('label', { class: 'field' }, el('span', { class: 'lbl' }, 'Stop'), running ? el('span', { class: 'meta tl-running' }, 'Still running') : stop),
          el('label', { class: 'field tl-task-field' }, el('span', { class: 'lbl' }, 'Task'), task)),
        err,
        el('div', { class: 'row' },
          btn(entry ? 'Save' : 'Add', save, { cls: 'sm primary' }),
          btn('Cancel', onDone, { cls: 'sm ghost' }),
          entry ? null : el('span', { class: 'hint' }, `Recorded as you, ${realName(state.me) || 'you'}`)));
      wrap.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' && ev.target.tagName !== 'SELECT') { ev.preventDefault(); save(); } });
      requestAnimationFrame(() => start.focus());
      return wrap;
    }
  }, { label: 'Time log', wide: true, guard: true }).then(() => unsub?.());
}

/** The CSV for the quote, saved on this computer. */
function exportCsv(jobId, entries) {
  const job = node(jobId);
  const csv = TC.csvOf(state.idx, jobId, entries, { now: nowISO(), who: (e) => realName(e) || e });
  const slug = String(job?.title ?? 'job').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'job';
  const a = el('a', { href: URL.createObjectURL(new Blob([csv], { type: 'text/csv' })), download: `time-${slug}-${dayOf()}.csv` });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  toast('CSV saved to this computer');
}

