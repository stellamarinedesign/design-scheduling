// views/mytasks.js — a designer's Tasks tab: a flat list of what is theirs,
// grouped by what to do next (PLAN, "Designer Tasks list: action-first
// layout", 2026-11-04). It replaces the Excel sheet's columns: the owner said
// that shape was only a limitation of Excel.
//
// GROUPS, top to bottom: Sent back to you (fix these first) · In progress
// (with Ready for check marked by its pill) · Waiting · To do · Done this
// month, folded. The grouping replaces the status filter pills.
//
// A ROW: status pill and title; ONE "next" line (the send-back comment in Fix
// colour, else what it waits on, the latest update, or the brief's first
// line); a strip of the tasks inside with "2 of 6 done"; due date (amber
// when close) and where it sits; and ONE action: Start, Post update, Submit
// for check, or Open. A row opens the same task panel as the lead's.
//
// Header: search, Sort (Due by default · Age · Last update · Manual), and
// + Add task, which puts a task of their own in "From designers" for the
// lead to file. Manual order drags (a mouse); on touch the row's ⋯ has Move
// earlier / later.

import { el, btn, menu, prefs, isPhone, canDrag, withMenu, pill as uiPill } from '../ui.js';
import { state, personName } from '../state.js';
import * as T from '../tree.js';
import * as S from '../status.js';
import * as A from '../actions.js';
import * as TM from '../team.js';
import { daysUntil, dayLabel } from '../dates.js';
import { openTask, go } from '../router.js';
import { statusMenu, taskMenu, enableDrag } from './tile.js';
import { errorState } from './home.js';
import { openQuickAdd } from './quick-add.js';
import { timeMark } from './timer-ui.js';

let query = '';
let doneOpen = false;

const rerender = () => go('/tasks', { keepTask: true });
const sortOf = () => { const s = prefs.get('mySort', 'due'); return TM.MY_SORTS[s] ? s : 'due'; };
const pathOf = (t) => TM.placeOf(state.idx, t, (id) => T.pathText(state.idx, id));

export function renderMyTasks(root) {
  const inner = el('div', { class: 'view-inner my' });
  root.append(inner);
  if (state.error && !state.ready) { inner.append(errorState()); return; }
  const sort = sortOf();
  const search = el('input', {
    class: 'input my-search', type: 'search', placeholder: 'Search my tasks', 'aria-label': 'Search my tasks', value: query, dataset: { fk: 'my-search' },
  });
  search.addEventListener('input', () => { query = search.value; rerender(); });
  const sortBtn = btn(isPhone() ? TM.MY_SORTS[sort] : `Sort: ${TM.MY_SORTS[sort]}`, (e) => menu(e.currentTarget, [
    { heading: 'Sort' },
    ...Object.entries(TM.MY_SORTS).map(([k, label]) => ({ label, checked: k === sort, onSelect: () => { prefs.set('mySort', k); rerender(); } })),
  ], { label: 'Sort' }), { cls: 'sm', ic: 'sort', attrs: { 'aria-haspopup': 'menu', 'aria-label': `Sort: ${TM.MY_SORTS[sort]}` } });
  // A phone has the + button for this, bottom right.
  const add = isPhone() ? null : btn('Add task', () => openQuickAdd({ own: true }), { cls: 'sm', ic: 'plus', title: 'A task of your own (N)' });

  if (!state.ready) {
    inner.append(head(null, search, sortBtn, add), el('div', { class: 'my-list', 'aria-busy': 'true', 'aria-label': 'Loading' }, [1, 2, 3].map(() => el('div', { class: 'skel my-skel' }))));
    return;
  }
  const groups = TM.myTaskGroups(state.idx, state.me, { sort, query, pathOf });
  const all = TM.myTaskGroups(state.idx, state.me, { sort, pathOf });
  const openCount = all.filter((g) => g.key !== 'done').reduce((n, g) => n + g.rows.length, 0);
  const fixCount = all.find((g) => g.key === 'fix').rows.length;
  inner.append(head({ openCount, fixCount }, search, sortBtn, add));

  if (!openCount && !all.find((g) => g.key === 'done').rows.length) {
    inner.append(el('div', { class: 'welcome' },
      el('h2', { class: 'h2' }, 'Nothing assigned to you yet'),
      el('p', {}, 'Work the Design lead gives you shows here, grouped by what to do next. Add one of your own and it goes on this list too; the lead files it into a category.'),
      el('div', { class: 'acts' }, btn('Add task', () => openQuickAdd({ own: true }), { cls: 'primary', ic: 'plus' }))));
    return;
  }
  const shown = groups.filter((g) => g.key !== 'done').reduce((n, g) => n + g.rows.length, 0);
  if (query.trim() && !shown && !groups.find((g) => g.key === 'done').rows.length) {
    inner.append(el('div', { class: 'empty' }, `Nothing of yours matches "${query.trim()}".`, btn('Clear the search', () => { query = ''; rerender(); }, { cls: 'sm' })));
    return;
  }
  for (const g of groups) {
    if (!g.rows.length) continue;
    if (g.key === 'done') { inner.append(doneGroup(g)); continue; }
    inner.append(group(g, sort));
  }
}

function head(counts, search, sortBtn, add) {
  return el('div', { class: 'view-head my-head' },
    el('h1', { class: 'h1' }, 'Tasks'),
    counts ? el('span', { class: 'meta' }, `${counts.openCount} open${counts.fixCount ? ` · ${counts.fixCount} sent back` : ''}`) : null,
    el('span', { class: 'sp' }),
    search, sortBtn, add);
}

function group(g, sort) {
  const list = el('div', { class: 'my-list', role: 'list' });
  g.rows.forEach((t, i) => list.append(myRow(t, {
    menuExtra: sort === 'manual' ? [
      { label: 'Move earlier', icon: 'back', disabled: i === 0, onSelect: () => A.setHomeOrder(moved(g.rows, i, i - 1)) },
      { label: 'Move later', icon: 'chevRight', disabled: i === g.rows.length - 1, onSelect: () => A.setHomeOrder(moved(g.rows, i, i + 1)) },
    ] : [],
    drag: sort === 'manual' && canDrag(),
  })));
  if (sort === 'manual') {
    enableDrag(list, {
      validate: false,       // their own order, not a move in the tree
      onDrop: (dragId, targetId, where) => {
        const ids = g.rows.map((t) => t.id).filter((id) => id !== dragId);
        if (!g.rows.some((t) => t.id === dragId)) return;    // only within its group
        ids.splice(ids.indexOf(targetId) + (where === 'after' ? 1 : 0), 0, dragId);
        A.setHomeOrder(ids);
      },
    });
  }
  return el('section', { class: `my-grp${g.key === 'fix' ? ' fix' : ''}`, 'aria-label': g.label },
    el('div', { class: 'my-grp-head' }, el('h2', { class: 'h2' }, g.label), el('span', { class: 'meta' }, String(g.rows.length)),
      el('span', { class: 'sp' }), g.hint ? el('span', { class: 'meta' }, g.hint) : null),
    list);
}

function doneGroup(g) {
  const wrap = el('section', { class: 'my-grp', 'aria-label': g.label },
    el('div', { class: 'row' }, btn(`${g.label} · ${g.rows.length}`, () => { doneOpen = !doneOpen; rerender(); }, { cls: 'sm ghost', ic: doneOpen ? 'chevDown' : 'chevRight', attrs: { 'aria-expanded': String(doneOpen) } })));
  if (doneOpen) wrap.append(el('div', { class: 'my-list', role: 'list' }, g.rows.map((t) => myRow(t, {}))));
  return wrap;
}

function moved(rows, from, to) {
  const ids = rows.map((t) => t.id);
  const [x] = ids.splice(from, 1);
  ids.splice(to, 0, x);
  return ids;
}

/** "Due 12 Nov", amber when it is close (two days or less) or past. */
function dueLine(t) {
  if (!t.due) return el('span', { class: 'meta my-due' }, 'No due date');
  const d = daysUntil(t.due);
  const close = d !== null && d <= 2 && S.isOpen(t.status);
  const word = d === 0 ? 'Due today' : d === 1 ? 'Due tomorrow' : d !== null && d < 0 ? `Overdue · ${dayLabel(t.due)}` : `Due ${dayLabel(t.due)}`;
  return el('span', { class: `my-due${close ? ' soon' : ''}` }, word);
}

/** The strip: one segment per top-level task inside it. */
function strip(t) {
  const segs = TM.stageStrip(state.idx, t.id);
  if (!segs.length) return el('span', { class: 'my-steps' });
  const p = T.progress(state.idx, t.id);
  const label = `${p.done} of ${p.total} done`;
  return el('span', { class: 'my-steps' },
    el('span', { class: 'strip', role: 'img', 'aria-label': label }, segs.slice(0, 14).map((s) => el('i', { class: `s-${s}` }))),
    el('span', { class: 'meta' }, label));
}

/** The one action a row offers. */
function action(t) {
  const kind = TM.rowAction(state.idx, t);
  const can = A.canWrite(t);
  if (kind === 'start' && can) return btn('Start', (e) => { e.stopPropagation(); A.start(t.id); }, { cls: 'sm', ic: 'play', title: 'Start: one tap to In progress' });
  if (kind === 'submit' && can) return btn('Submit for check', (e) => { e.stopPropagation(); A.setStatus(t.id, 'check'); }, { cls: 'sm', ic: 'check' });
  if (kind === 'update') {
    return btn('Post update', (e) => {
      e.stopPropagation();
      openTask(t.id);
      // The panel draws as the route changes: its update box is there now.
      const ta = document.querySelector('#panel .compose-input');
      ta?.scrollIntoView({ block: 'center' });
      ta?.focus();
    }, { cls: 'sm' });
  }
  return btn('Open', (e) => { e.stopPropagation(); openTask(t.id); }, { cls: 'sm ghost' });
}

export function myRow(t, { menuExtra = [], drag = false } = {}) {
  const next = TM.nextLine(state.idx, t, { who: (e) => personName(e), waitingLine: (x) => S.waitingLine(state.idx, x) });
  const job = T.isJob(state.idx, t) ? null : T.jobOf(state.idx, t.id);
  const place = [job?.title, pathOf(t)].filter(Boolean).join(' › ');
  const r = el('div', {
    class: `my-row${t.status === 'done' ? ' finished' : ''}`, role: 'listitem', dataset: { id: t.id },
    'aria-current': state.openId === t.id ? 'true' : null, draggable: drag ? 'true' : null,
  },
  el('button', { class: 'open-link', type: 'button', dataset: { fk: `open-${t.id}` }, 'aria-label': `Open ${t.title}, ${S.LABEL[t.status]}`, onclick: () => openTask(t.id) }),
  el('div', { class: 'my-main' },
    el('div', { class: 'my-title-row' },
      statusPill(t),
      el('span', { class: 'my-title' }, t.title),
      timeMark(t)),
    next ? el('div', { class: `my-next ${next.cls}`.trim() }, next.text) : null),
  strip(t),
  el('div', { class: 'my-when' }, dueLine(t), el('span', { class: 'meta my-place', title: place }, place || 'Not in a category')),
  el('div', { class: 'my-act' }, action(t)));
  return withMenu(r, (at) => taskMenu(r.querySelector('.my-act .btn') ?? r, t, { extra: menuExtra, at }));
}

/** The status pill, a button for whoever may change it. */
const statusPill = (t) => uiPill(t.status, A.canWrite(t) ? { onClick: (e) => { e.stopPropagation(); statusMenu(e.currentTarget, t); } } : {});
