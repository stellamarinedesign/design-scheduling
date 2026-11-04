// views/crew.js — the team on the lead's Home, and the row both Home and the
// Team tab are built from (Home brief, 2026-11-04: "Ready for checking" and
// "Crew").
//
// READY FOR CHECKING: every task waiting for the lead's check, at any depth,
// the longest-waiting first, as tiles: who submitted it and where it sits,
// their latest update, and Approve / Send back / Open in place. Approve is
// an outlined button here, not the red one: a page of several checks would
// otherwise carry several red buttons (the One Red Rule). Empty, the section
// is one line.
//
// CREW: a lane per designer (the lead is not one of them): what each has
// under way - sent back, for check, in progress, waiting - with a bar for
// how long it has sat in that status (two weeks fills it), and a quiet flag
// when nothing has come from them for a few days.

import { el, btn, iconBtn, pill, dot, avatar } from '../ui.js';
import { state, personName } from '../state.js';
import * as T from '../tree.js';
import * as S from '../status.js';
import * as A from '../actions.js';
import * as TM from '../team.js';
import { ageLabel, whenLabel } from '../dates.js';
import { openTask } from '../router.js';
import { statusMenu, taskMenu } from './tile.js';
import { withMenu } from '../ui.js';

/** A person's initials badge, named for screen readers. */
export const face = (email) => avatar(TM.nameFor(state.people, email) || email, personName(email));

/** The status pill, a button for whoever may change it. */
const statusPill = (t) => pill(t.status, A.canWrite(t) ? { onClick: (e) => { e.stopPropagation(); statusMenu(e.currentTarget, t); } } : {});

// ---------------------------------------------------------------------------
// Ready for checking
// ---------------------------------------------------------------------------

export function checksSection() {
  const list = TM.checkQueue(state.idx);
  const head = el('div', { class: 'sec-head' }, el('h2', { class: 'h2' }, 'Ready for checking'),
    list.length ? el('span', { class: 'count', 'aria-label': `${list.length} waiting` }, String(list.length)) : el('span', { class: 'meta' }, 'Nothing is waiting for your check.'));
  const sec = el('section', { class: 'sec', 'aria-label': 'Ready for checking' }, head);
  if (!list.length) return sec;
  const grid = el('div', { class: 'grid check-grid' });
  for (const t of list) grid.append(checkTile(t));
  sec.append(grid);
  return sec;
}

function checkTile(t) {
  const who = t.submittedBy ?? t.assignee;
  const path = T.pathText(state.idx, t.id);
  const job = T.isJob(state.idx, t) ? null : T.jobOf(state.idx, t.id);
  const where = [job ? job.title : null, path].filter(Boolean).join(' · ');
  const note = t.lastNote?.text;
  const a = el('article', { class: 'tile check-tile', dataset: { id: t.id }, 'aria-current': state.openId === t.id ? 'true' : null },
    el('button', { class: 'open-link', type: 'button', 'aria-label': `Open ${t.title}, ready for check`, onclick: () => openTask(t.id) }),
    el('div', { class: 'tile-top' },
      statusPill(t),
      el('span', { class: 'sp' }),
      el('span', { class: 'meta', title: 'Waiting for check' }, ageLabel(TM.statusSince(t))),
      iconBtn('more', `More actions for ${t.title}`, (e) => { e.stopPropagation(); taskMenu(e.currentTarget, t); })),
    el('div', { class: 'tile-title' }, t.title),
    el('div', { class: 'tile-path' }, who ? face(who) : dot(T.colourOf(state.idx, t.id)), el('span', {}, [who ? personName(who) : null, where].filter(Boolean).join(' · '))),
    note ? el('div', { class: 'tile-sub' }, note) : null,
    el('div', { class: 'tile-foot acts' },
      btn('Approve', (e) => { e.stopPropagation(); A.setStatus(t.id, 'done'); }, { cls: 'sm', ic: 'check', title: 'Approve: marks it done' }),
      btn('Send back', (e) => { e.stopPropagation(); A.setStatus(t.id, 'fix'); }, { cls: 'sm ghost', title: 'Back to them to fix, with a comment' }),
      el('span', { class: 'sp' }),
      btn('Open', (e) => { e.stopPropagation(); openTask(t.id); }, { cls: 'sm ghost' })));
  return withMenu(a, (at) => taskMenu(a.querySelector('.tile-top .ib') ?? a, t, { at }));
}

// ---------------------------------------------------------------------------
// the lane row: Crew, and the Team tab's columns
// ---------------------------------------------------------------------------

/**
 * One task in a lane: status, title, where it sits (or what holds it), and
 * - in Crew - a bar for how long it has sat in its status.
 */
export function laneRow(t, { track = false, drag = false, showPill = true } = {}) {
  const sub = t.status === 'fix' && t.fixNote ? { text: `Sent back: ${t.fixNote}`, cls: 'fix' }
    : t.status === 'waiting' ? { text: S.waitingLine(state.idx, t), cls: 'wait' } : null;
  const path = TM.placeOf(state.idx, t, (id) => T.pathText(state.idx, id));
  const job = T.isJob(state.idx, t) ? null : T.jobOf(state.idx, t.id);
  const where = [job?.title, path].filter(Boolean).join(' › ');
  const since = TM.statusSince(t);
  const r = el('div', {
    class: `lrow${track ? ' with-track' : ''}${showPill ? '' : ' no-pill'}`, dataset: { id: t.id }, 'aria-current': state.openId === t.id ? 'true' : null,
    draggable: drag ? 'true' : null,
  },
  el('button', { class: 'open-link', type: 'button', 'aria-label': `Open ${t.title}, ${S.LABEL[t.status]}`, onclick: () => openTask(t.id) }),
  showPill ? el('span', { class: 'lrow-pill' }, statusPill(t)) : null,
  el('div', { class: 'lrow-main' },
    el('div', { class: 'lrow-title' }, t.title),
    el('div', { class: `lrow-sub ${sub?.cls ?? ''}`.trim() }, sub ? sub.text : [dot(T.colourOf(state.idx, t.id)), ' ', where || 'Not in a category'])),
  track ? el('span', {
    class: `track t-${t.status}`, role: 'img', 'aria-label': `${S.LABEL[t.status]} for ${whenLabel(since).replace(' ago', '')}`,
  }, el('i', { style: { width: `${Math.round(TM.sinceShare(t) * 100)}%` } })) : null,
  el('span', { class: 'meta lrow-age', title: `${S.LABEL[t.status]} since ${whenLabel(since)}` }, ageLabel(since)),
  iconBtn('more', `More actions for ${t.title}`, (e) => { e.stopPropagation(); taskMenu(e.currentTarget, t); }, 'sm'));
  return withMenu(r, (at) => taskMenu(r.querySelector(':scope > .ib') ?? r, t, { at }));
}

/** "Updated 3h ago", or the quiet flag. */
export function seenLine(lane) {
  if (!lane.seen) return el('span', { class: 'meta' }, 'Nothing from them yet');
  if (lane.quiet) return el('span', { class: 'meta warn', title: `No activity from them for ${lane.quietFor} days` }, `Quiet for ${lane.quietFor} days`);
  return el('span', { class: 'meta' }, `Updated ${whenLabel(lane.seen)}`);
}

/** "2 active · 1 for check · 3 to do": the counts that are not zero. */
export function countsLine(c) {
  return [
    `${c.active} active`,
    c.check ? `${c.check} for check` : null,
    c.fix ? `${c.fix} sent back` : null,
    c.todo ? `${c.todo} to do` : null,
  ].filter(Boolean).join(' · ');
}

// ---------------------------------------------------------------------------
// Crew
// ---------------------------------------------------------------------------

export function crewSection() {
  const crew = TM.crewOf(state.access);
  const sec = el('section', { class: 'sec', 'aria-label': 'Crew' },
    el('div', { class: 'sec-head' }, el('h2', { class: 'h2' }, 'Crew'),
      crew.length ? el('span', { class: 'meta' }, 'Bars show time in the current status') : null));
  if (!crew.length) {
    sec.append(el('div', { class: 'empty' }, 'No designers yet. A master adds them under the cog, in Accounts; their work shows here, a lane each.'));
    return sec;
  }
  sec.append(el('div', { class: 'lrow with-track axis', 'aria-hidden': 'true' }, el('span', {}), el('span', {}),
    el('span', { class: 'axis-marks' }, el('span', {}, '2 wk'), el('span', {}, '1 wk'), el('span', {}, 'now')), el('span', {}), el('span', {})));
  for (const email of crew) {
    const lane = TM.crewLane(state.idx, email);
    const box = el('div', { class: 'lane' },
      el('div', { class: 'lane-head' },
        face(email),
        el('h3', { class: 'lane-name' }, personName(email)),
        el('span', { class: 'meta' }, countsLine(lane.counts)),
        el('span', { class: 'sp' }),
        seenLine(lane)));
    if (!lane.rows.length) box.append(el('div', { class: 'lane-empty meta wrap' }, lane.counts.todo ? `Nothing under way; ${lane.counts.todo} to do.` : 'Nothing assigned to them.'));
    for (const t of lane.rows) box.append(laneRow(t, { track: true }));
    sec.append(box);
  }
  return sec;
}
