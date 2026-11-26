// views/numbers.js — due dates and throughput on screen (Phase 4, owner
// 2026-11-26; the logic is metrics.js).
//
// HOME › DUE: open work overdue or due within a week, across the team, the
// most overdue first. Only when there is any: an empty section would be a
// line of reassurance read dozens of times a day.
//
// TEAM › THE LAST 12 WEEKS: four figures for the team (done, with a bar per
// week; on time; added to done; wait for check), and one line of the same
// in each person's column. Archived work counts, so it is read once per
// visit (Store.loadArchived) and kept for a few minutes; until it arrives the
// figures say they are counting, and if it cannot be read they say they
// count only what is not archived.

import { el, btn, pill, iconBtn, withMenu } from '../ui.js';
import { state, personName } from '../state.js';
import * as T from '../tree.js';
import * as A from '../actions.js';
import * as MX from '../metrics.js';
import { Store } from '../store.js';
import { dayLabel } from '../dates.js';
import { openTask, redraw } from '../router.js';
import { statusMenu, taskMenu } from './tile.js';

// ---------------------------------------------------------------------------
// Home: Due
// ---------------------------------------------------------------------------

let dueAll = false;
const DUE_SHOWN = 6;

/** Home's Due section, or null when nothing is overdue or due within the week. */
export function dueSection() {
  const list = MX.dueList(state.listIdx);
  if (!list.length) return null;
  const late = list.filter((d) => d.days < 0).length;
  const shown = dueAll ? list : list.slice(0, DUE_SHOWN);
  const sec = el('section', { class: 'sec', 'aria-label': 'Due' },
    el('div', { class: 'sec-head' },
      el('h2', { class: 'h2' }, 'Due'),
      el('span', { class: 'meta' }, [late ? `${late} overdue` : null, `${list.length - late} due within ${MX.DUE_SOON} days`].filter((x) => x && !x.startsWith('0 ')).join(' · ')),
      el('span', { class: 'sp' }),
      list.length > DUE_SHOWN ? btn(dueAll ? 'Show fewer' : `See all ${list.length}`, () => { dueAll = !dueAll; redraw(); }, { cls: 'ghost sm', attrs: { 'data-fk': 'due-all' } }) : null),
    el('div', { class: 'due-list' }, shown.map(dueRow)));
  return sec;
}

function dueRow({ t, days }) {
  const path = T.pathText(state.idx, t.id);
  const job = T.isJob(state.idx, t) ? null : T.jobOf(state.idx, t.id);
  const where = [job?.title, path].filter(Boolean).join(' › ');
  const r = el('div', { class: 'lrow due-row', dataset: { id: t.id }, 'aria-current': state.openId === t.id ? 'true' : null },
    el('button', { class: 'open-link', type: 'button', 'aria-label': `Open ${t.title}, ${MX.dueWords(days)}`, onclick: () => openTask(t.id) }),
    el('span', { class: 'lrow-pill' }, pill(t.status, A.canWrite(t) ? { onClick: (e) => { e.stopPropagation(); statusMenu(e.currentTarget, t); } } : {})),
    el('div', { class: 'lrow-main' },
      el('div', { class: 'lrow-title' }, t.title),
      el('div', { class: 'lrow-sub' }, [t.assignee ? personName(t.assignee) : null, where || 'Not in a category'].filter(Boolean).join(' · '))),
    el('span', { class: `due-when${days < 0 ? ' late' : days <= 1 ? ' soon' : ''}`, title: dayLabel(t.due) }, MX.dueWords(days)),
    iconBtn('more', `More actions for ${t.title}`, (e) => { e.stopPropagation(); taskMenu(e.currentTarget, t); }, 'sm'));
  return withMenu(r, (at) => taskMenu(r.querySelector(':scope > .ib') ?? r, t, { at }));
}

// ---------------------------------------------------------------------------
// Team: the last 12 weeks
// ---------------------------------------------------------------------------

const KEEP = 5 * 60 * 1000;
const archive = { nodes: null, at: 0, busy: false, failed: false };

/** Everything, archived work included, as one index; null while the archive is being read. */
function fullIndex() {
  if (!archive.busy && (!archive.at || Date.now() - archive.at > KEEP)) {
    archive.busy = true;
    Store.loadArchived()
      .then((nodes) => { archive.nodes = nodes; archive.failed = false; })
      .catch((e) => { console.warn('[numbers] archive not read:', e?.message ?? e); archive.nodes = []; archive.failed = true; })
      .finally(() => { archive.busy = false; archive.at = Date.now(); redraw(); });
  }
  if (!archive.nodes) return null;
  const ids = new Set(state.nodes.map((n) => n.id));
  return T.buildIndex([...state.nodes, ...archive.nodes.filter((n) => !ids.has(n.id))]);
}

/** One figure: a label, the value, and a line under it. */
const figure = (label, value, sub, extra = null) => el('div', { class: 'stat' },
  el('div', { class: 'stat-label' }, label),
  el('div', { class: 'stat-value' }, value ?? '–'),
  extra,
  el('div', { class: 'stat-sub' }, sub));

/** A bar per week, oldest first; this week drawn darker. The words carry every value. */
function weekBars(m) {
  const most = Math.max(1, ...m.perWeek);
  const words = m.weeks.map((w, i) => `week of ${dayLabel(w)}: ${m.perWeek[i]}`);
  return el('div', { class: 'spark', role: 'img', 'aria-label': `Done each week, oldest first. ${words.join('; ')}.` },
    m.perWeek.map((n, i) => el('span', {
      class: `spark-bar${i === m.perWeek.length - 1 ? ' now' : ''}`, title: `${n} done, week of ${dayLabel(m.weeks[i])}`,
    }, el('i', { style: { height: n ? `${Math.max(8, Math.round((n / most) * 100))}%` : '0' } }))));
}

/** The Team tab's strip: the team's last 12 weeks. */
export function teamNumbers() {
  const idx = fullIndex();
  const sec = el('section', { class: 'sec team-numbers', 'aria-label': `The last ${MX.WEEKS} weeks` },
    el('div', { class: 'sec-head' }, el('h2', { class: 'h2' }, `The last ${MX.WEEKS} weeks`),
      el('span', { class: 'meta' }, idx ? (archive.failed ? 'Archived work could not be read: these count only what is not archived.' : 'Approved work, archived included') : 'Counting…')));
  if (!idx) {
    sec.append(el('div', { class: 'stats', 'aria-busy': 'true' }, [1, 2, 3, 4].map(() => el('div', { class: 'stat skel' }))));
    return sec;
  }
  const m = MX.throughput(idx);
  sec.append(el('div', { class: 'stats' },
    figure('Done', String(m.done), m.done ? `About ${Math.round((m.done / MX.WEEKS) * 10) / 10} a week` : 'Nothing approved yet', weekBars(m)),
    figure('On time', MX.onTimeWords(m.onTime), m.onTime.of ? `Of ${m.onTime.of} with a due date` : 'No due dates on done work'),
    figure('Added to done', MX.spanWords(m.addedToDone), 'Usually, from added to approved'),
    figure('Wait for check', MX.spanWords(m.checkWait), 'Usually, from submitted to approved')));
  return sec;
}

/** One person's line for their Team column: "12 weeks: 18 done · 80% on time · check 1 day". */
export function personNumbers(email, { includeUnassigned = false } = {}) {
  const idx = fullIndex();
  if (!idx) return el('span', { class: 'meta' }, `${MX.WEEKS} weeks: counting…`);
  const m = MX.throughput(idx, { who: email, includeUnassigned });
  const parts = [`${m.done} done`, MX.onTimeWords(m.onTime) ? `${MX.onTimeWords(m.onTime)} on time` : null, m.checkWait !== null ? `check ${MX.spanWords(m.checkWait)}` : null];
  return el('span', { class: 'meta', title: 'Approved work in the last 12 weeks; check is the usual wait from submitted to approved' }, `${MX.WEEKS} weeks: ${parts.filter(Boolean).join(' · ')}`);
}

