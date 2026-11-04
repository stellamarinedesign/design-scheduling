// views/tile.js — the tile and the list row, shared by Home and Tasks, with
// the menus they open and the drag-to-reorder helper.
//
// THE TILE (a new component, recorded in DESIGN.md once built): status pill,
// title clamped to two lines, the category dot and path (Home only), one
// subtext line (what it waits on, the send-back comment, or the next step),
// a progress bar along the bottom, and its age. A click anywhere opens the
// task panel; the pill opens the status menu in one tap; To-do tiles carry a
// one-tap Start. Every action in the ⋯ menu is also reachable without hover,
// and Move to… is the touch path for everything drag does.

import { el, icon, iconBtn, btn, pill, dot, avatar, bar, menu, canDrag } from '../ui.js';
import { state, node, personName } from '../state.js';
import * as T from '../tree.js';
import * as S from '../status.js';
import * as A from '../actions.js';
import { ageLabel, ageDays, dayLabel, dayOf } from '../dates.js';
import { go, openTask, routeHref } from '../router.js';

export const backlogDays = () => {
  try { return Number(JSON.parse(localStorage.getItem('stella.design.pref.backlogDays'))) || 14; } catch { return 14; }
};

/**
 * The assignee's initials. In local mode there is one person and no name to
 * take initials from, so the badge says nothing and is left off.
 */
export function whoBadge(email) {
  if (!email) return null;
  if (state.mode === 'local' && email === state.me) return null;
  return avatar(personName(email) === 'You' ? email : personName(email), personName(email));
}

/** "Cancelled 12 Mar · Customer cancelled": when, and why. */
export function cancelledLine(t) {
  const at = t.cancelled?.at;
  const when = at ? ` ${dayLabel(dayOf(new Date(at)))}` : '';
  const why = String(t.cancelled?.reason ?? '').trim();
  return `Cancelled${when}${why ? ` · ${why}` : ''}`;
}

/** The one subtext line a tile or row shows. */
export function subtext(t) {
  if (t.status === 'cancelled') return { text: cancelledLine(t), cls: '' };
  if (t.status === 'fix' && t.fixNote) return { text: `Sent back: ${t.fixNote}`, cls: 'fix' };
  if (t.status === 'waiting') return { text: S.waitingLine(state.idx, t), cls: 'wait' };
  if (S.isOpen(t.status)) {
    const n = T.nextStep(state.idx, t.id);
    if (n) return { text: `Next: ${T.nameOf(n)}`, cls: '' };
  }
  return null;
}

/** Status changes offered from a pill. Approve/send back only for the lead. */
export function statusMenu(anchor, t) {
  const lead = state.role === 'lead';
  if (t.status === 'cancelled') {
    menu(anchor, [{ heading: 'Cancelled' }, { label: `Reopen · back to ${S.LABEL[S.reopenTo(t)]}`, icon: 'restore', onSelect: () => A.reopen(t.id) }], { label: 'Set status' });
    return;
  }
  const items = S.STATUSES.filter((s) => s !== t.status || s === 'waiting').map((s) => {
    const blocked = !lead && t.status === 'check' && (s === 'done' || s === 'fix');
    let label = S.LABEL[s];
    if (t.status === 'check' && s === 'done') label = 'Approve';
    if (t.status === 'check' && s === 'fix') label = 'Send back…';
    if (s === 'waiting') label = t.status === 'waiting' ? 'Edit what it waits on…' : 'Waiting…';
    if (s === 'cancelled') label = 'Cancel…';
    return {
      node: el('span', { class: 'row' }, pill(s, { label: S.LABEL[s] }), s === t.status ? null : el('span', { class: 'menu-hint' }, label === S.LABEL[s] ? '' : label)),
      label, disabled: blocked,
      onSelect: () => A.setStatus(t.id, s),
    };
  });
  menu(anchor, [{ heading: 'Set status' }, ...items], { label: 'Set status' });
}

/** The ⋯ menu on a tile or row. `extra` items go first (Home's Move earlier/later). */
export function taskMenu(anchor, t, { extra = [] } = {}) {
  const items = [
    ...extra,
    ...(extra.length ? ['sep'] : []),
    { label: 'Open', icon: 'open', onSelect: () => openTask(t.id) },
    { label: 'Open as page', icon: 'page', onSelect: () => go(`/tasks/${t.id}`) },
    'sep',
    t.status === 'todo' || t.status === 'fix' ? { label: 'Start', icon: 'play', onSelect: () => A.start(t.id) } : null,
    S.isOpen(t.status) && t.status !== 'check' ? { label: 'Mark done', icon: 'check', onSelect: () => A.setStatus(t.id, 'done') } : null,
    t.status !== 'waiting' && S.isOpen(t.status) ? { label: 'Waiting…', icon: 'hide', onSelect: () => A.setStatus(t.id, 'waiting') } : null,
    S.isOpen(t.status) ? { label: 'Cancel…', icon: 'close', onSelect: () => A.setStatus(t.id, 'cancelled') } : null,
    t.status === 'cancelled' ? { label: `Reopen · back to ${S.LABEL[S.reopenTo(t)]}`, icon: 'restore', onSelect: () => A.reopen(t.id) } : null,
    { label: 'Move to…', icon: 'move', onSelect: async () => { const { moveDialog } = await import('./pickers.js'); moveDialog(t.id); } },
    'sep',
    { label: 'Archive', icon: 'archive', onSelect: () => A.archive(t.id) },
    { label: 'Delete…', icon: 'trash', danger: true, onSelect: () => A.remove(t.id) },
  ];
  menu(anchor, items, { label: `${t.title} actions` });
}

/**
 * A tile.
 * @param {object} t
 * @param {object} o
 * @param {boolean} o.path      show the category dot and path (Home)
 * @param {boolean} o.assignee  show the assignee's initials (Tasks)
 * @param {'normal'|'backlog'} o.variant
 * @param {object[]} o.menuExtra  extra ⋯ items
 */
export function tile(t, { path = false, assignee = false, variant = 'normal', menuExtra = [], drag = true } = {}) {
  const open = state.openId === t.id;
  const days = ageDays(t.lastActivityAt);
  const stale = t.status === 'todo' && days >= backlogDays();
  const prog = T.progress(state.idx, t.id);
  const sub = variant === 'backlog' ? null : subtext(t);
  const colour = T.colourOf(state.idx, t.id);
  const pathText = T.pathText(state.idx, t.id);
  const titleCls = `tile-title${t.status === 'done' ? ' done' : ''}${t.status === 'cancelled' ? ' cancelled' : ''}`;

  const a = el('article', {
    class: `tile${t.status === 'cancelled' ? ' muted' : ''}`, dataset: { id: t.id }, 'aria-current': open ? 'true' : null,
    draggable: drag && variant !== 'backlog' && canDrag() ? 'true' : null,
  },
  el('button', {
    class: 'open-link', type: 'button', dataset: { fk: `open-${t.id}` },
    'aria-label': `Open ${t.title}, ${S.LABEL[t.status]}`, onclick: () => openTask(t.id),
  }),
  el('div', { class: 'tile-top' },
    pill(t.status, { onClick: (e) => { e.stopPropagation(); statusMenu(e.currentTarget, t); } }),
    el('span', { class: 'sp' }),
    el('span', { class: `meta${stale || variant === 'backlog' ? ' warn' : ''}`, title: 'Since the last activity' },
      variant === 'backlog' ? `${days}d untouched` : ageLabel(t.lastActivityAt)),
    iconBtn('more', `More actions for ${t.title}`, (e) => { e.stopPropagation(); taskMenu(e.currentTarget, t, { extra: menuExtra }); })),
  el('div', { class: titleCls }, t.title),
  path && pathText ? el('div', { class: 'tile-path' }, dot(colour), el('span', {}, pathText)) : null,
  sub ? el('div', { class: `tile-sub ${sub.cls}`.trim() }, sub.text) : null,
  el('div', { class: 'tile-foot' },
    t.status === 'todo' ? btn('Start', (e) => { e.stopPropagation(); A.start(t.id); }, { cls: 'sm', ic: 'play', title: 'Start: one tap to In progress' }) : null,
    variant !== 'backlog' && prog.total ? bar(prog.done, prog.total) : el('span', { class: 'sp' }),
    variant !== 'backlog' && prog.total ? el('span', { class: 'meta' }, `${prog.done}/${prog.total}`) : null,
    assignee ? whoBadge(t.assignee) : null));
  return a;
}

/** A list row: the same facts in 44px. */
export function row(t, { path = false, assignee = false, drag = true } = {}) {
  const open = state.openId === t.id;
  const prog = T.progress(state.idx, t.id);
  const sub = subtext(t);
  const pathText = path ? T.pathText(state.idx, t.id) : '';
  const subLine = [pathText, sub?.text].filter(Boolean).join(' · ');
  return el('div', { class: `trow${t.status === 'cancelled' ? ' muted' : ''}`, dataset: { id: t.id }, 'aria-current': open ? 'true' : null, draggable: drag && canDrag() ? 'true' : null },
    el('button', { class: 'open-link', type: 'button', dataset: { fk: `open-${t.id}` }, 'aria-label': `Open ${t.title}, ${S.LABEL[t.status]}`, onclick: () => openTask(t.id) }),
    pill(t.status, { onClick: (e) => { e.stopPropagation(); statusMenu(e.currentTarget, t); } }),
    el('div', { class: 'trow-main' },
      el('div', { class: 'trow-title' }, t.title),
      subLine ? el('div', { class: `trow-sub` }, subLine) : null),
    el('div', { class: 'trow-end' },
      prog.total ? el('span', { class: 'meta' }, `${prog.done}/${prog.total}`) : null,
      assignee ? whoBadge(t.assignee) : null,
      el('span', { class: 'meta' }, ageLabel(t.lastActivityAt)),
      t.status === 'todo' ? iconBtn('play', `Start ${t.title}`, (e) => { e.stopPropagation(); A.start(t.id); }, 'sm') : null,
      iconBtn('more', `More actions for ${t.title}`, (e) => { e.stopPropagation(); taskMenu(e.currentTarget, t); }, 'sm')));
}

/** The labelled divider above a status band. */
export const band = (status, count) => el('div', { class: 'band' }, el('span', { class: 'lbl' }, S.LABEL[status]), el('span', { class: 'meta' }, String(count)));

/**
 * Drag to reorder, with a mouse. Drop on a tile or row: before or after it,
 * by which half the pointer is over. Drop on a group header: into the group.
 * Touch never sees this; it uses Move to… (and Home's Move earlier/later).
 */
export function enableDrag(root, { onDrop, onDropInto = null }) {
  if (!canDrag()) return;
  let dragId = null;
  const clear = () => root.querySelectorAll('.drop-before, .drop-after, .drop-into').forEach((n) => n.classList.remove('drop-before', 'drop-after', 'drop-into'));
  const where = (target, e) => {
    const r = target.getBoundingClientRect();
    const horizontal = target.classList.contains('tile');
    return horizontal ? (e.clientX < r.left + r.width / 2 ? 'before' : 'after') : (e.clientY < r.top + r.height / 2 ? 'before' : 'after');
  };
  root.addEventListener('dragstart', (e) => {
    const item = e.target.closest?.('[data-id][draggable="true"]');
    if (!item) return;
    dragId = item.dataset.id;
    item.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', dragId);
  });
  root.addEventListener('dragend', (e) => {
    e.target.closest?.('[data-id]')?.classList.remove('dragging');
    dragId = null;
    clear();
  });
  root.addEventListener('dragover', (e) => {
    if (!dragId) return;
    const into = onDropInto && e.target.closest('[data-drop-into]');
    const item = e.target.closest('[data-id]');
    clear();
    if (into && into.dataset.dropInto !== dragId) {
      e.preventDefault();
      into.closest('.grp')?.classList.add('drop-into');
      return;
    }
    if (item && item.dataset.id !== dragId) {
      e.preventDefault();
      item.classList.add(where(item, e) === 'before' ? (item.classList.contains('tile') ? 'drop-before' : 'drop-before') : 'drop-after');
    }
  });
  root.addEventListener('drop', (e) => {
    if (!dragId) return;
    e.preventDefault();
    const into = onDropInto && e.target.closest('[data-drop-into]');
    const item = e.target.closest('[data-id]');
    const id = dragId;
    clear();
    if (into && into.dataset.dropInto !== id) onDropInto(id, into.dataset.dropInto);
    else if (item && item.dataset.id !== id) onDrop(id, item.dataset.id, where(item, e));
  });
}

/** A category link: dot, name. */
export const catLink = (g) => el('a', { href: routeHref(`/tasks/${g.id}`), class: 'cat-link' }, dot(T.colourOf(state.idx, g.id)), T.nameOf(g));

export { icon, node };
