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
//
// THE CHECK CONTROL (decided 2026-11-04, live test run): steps and subtasks
// (any task that is not a job) carry the same box. A click goes forward, a
// right-click, long-press or Shift+F10 goes back, and ticking one done starts
// the next (actions.js tick).

import { el, icon, iconBtn, btn, pill, dot, avatar, bar, menu, canDrag, withMenu } from '../ui.js';
import { state, node, personName } from '../state.js';
import * as T from '../tree.js';
import * as S from '../status.js';
import * as A from '../actions.js';
import { ageLabel, ageDays, dayLabel, dayOf } from '../dates.js';
import { openTask } from '../router.js';
import { assignable } from '../team.js';

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

/** What the check control shows for a subtask's status. */
const BOX = { todo: 'todo', in_progress: 'doing', fix: 'fix', waiting: 'wait', check: 'check', done: 'done', cancelled: 'na' };

/**
 * The check control on a step or subtask. A step that holds steps or tasks
 * shows how they stand and is not ticked itself (tree.stepFinished).
 */
export function checkBox(n) {
  const { idx } = state;
  const name = T.nameOf(n);
  const step = n.kind === T.KIND.step;
  if (step && T.childrenOf(idx, n.id).some((k) => k.kind === T.KIND.step || k.kind === T.KIND.task)) {
    const p = T.progress(idx, n.id);
    const st = T.stepFinished(idx, n) ? 'done' : p.done ? 'doing' : 'todo';
    return el('button', { class: `tick ${st}`, type: 'button', disabled: true, 'aria-label': `${name}: ${p.done} of ${p.total} done` }, el('i', {}, st === 'done' ? icon('check', 14) : null));
  }
  const now = step ? S.STEP_LABEL[n.state ?? 'todo'] : S.LABEL[n.status ?? 'todo'];
  const fwd = step ? S.STEP_LABEL[S.nextStepState(n.state ?? 'todo')] : S.LABEL[S.taskForward(n, state.role)];
  const back = step ? S.STEP_LABEL[S.stepBack(n.state ?? 'todo')] : S.LABEL[S.taskBack(n, state.role, state.me)];
  const st = step ? (n.state ?? 'todo') : (BOX[n.status] ?? 'todo');
  const b = el('button', {
    class: `tick ${st}`, type: 'button',
    'aria-label': `${name}: ${now}${fwd ? `. Click for ${fwd}` : ''}`,
    title: [now, fwd && `click: ${fwd}`, back && `right-click: back to ${back}`].filter(Boolean).join(' · '),
    onclick: (e) => { e.stopPropagation(); A.tick(n.id, 1); },
  }, el('i', {}, st === 'done' || st === 'check' ? icon('check', 14) : null));
  // Right-click, long-press and Shift+F10 on the box go back a state; on the
  // rest of the row they still open its menu (the nearest wins).
  return withMenu(b, () => A.tick(n.id, -1));
}

/** Status changes offered from a pill. Approve/send back only for the lead. */
export function statusMenu(anchor, t) {
  const lead = state.role === 'lead';
  if (t.status === 'cancelled') {
    menu(anchor, [{ heading: 'Cancelled' }, { label: `Reopen · back to ${S.LABEL[S.reopenTo(t)]}`, icon: 'restore', onSelect: () => A.reopen(t.id) }], { label: 'Set status' });
    return;
  }
  // Done (and, from check, Fix) is the lead's alone: not offered, rather than
  // offered and refused. From check, In progress is a Take back, for whoever
  // submitted it.
  const offered = (s) => (s !== t.status || s === 'waiting')
    && (lead || (s !== 'done' && !(t.status === 'check' && s === 'fix')))
    && !(t.status === 'check' && s === 'in_progress' && !lead && !S.canTakeBack(t, state.me));
  const items = S.STATUSES.filter(offered).map((s) => {
    const takeBack = t.status === 'check' && s === 'in_progress';
    let label = S.LABEL[s];
    if (takeBack) label = 'Take back…';
    if (t.status === 'check' && s === 'done') label = 'Approve';
    if (t.status === 'check' && s === 'fix') label = 'Send back…';
    if (s === 'waiting') label = t.status === 'waiting' ? 'Edit what it waits on…' : 'Waiting…';
    if (s === 'cancelled') label = 'Cancel…';
    return {
      node: el('span', { class: 'row' }, pill(s, { label: S.LABEL[s] }), s === t.status ? null : el('span', { class: 'menu-hint' }, label === S.LABEL[s] ? '' : label)),
      label,
      onSelect: () => (takeBack ? A.takeBack(t.id) : A.setStatus(t.id, s)),
    };
  });
  menu(anchor, [{ heading: 'Set status' }, ...items], { label: 'Set status' });
}

/**
 * Assign to…: the leads and designers, you first. The lead's alone (a
 * designer's own tasks are theirs already).
 */
export function assignMenu(anchor, t, { at = null } = {}) {
  const people = assignable(state.access);
  const list = [...(people.includes(state.me) ? [state.me] : []), ...people.filter((p) => p !== state.me)
    .sort((a, b) => personName(a).localeCompare(personName(b)))];
  menu(anchor, [
    { heading: 'Assign to' },
    ...list.map((p) => ({ label: personName(p), checked: t.assignee === p, onSelect: () => A.assign(t.id, p) })),
    { label: 'Unassigned', checked: !t.assignee, onSelect: () => A.assign(t.id, null) },
  ], { label: 'Assign to', at });
}

/**
 * The ⋯ menu on a tile or row. `extra` items go first (Home's Move
 * earlier/later). What it offers follows what the rules allow this person:
 * the lead everything; a designer the status changes on their own work,
 * never Done, Delete or moving things about the lead's tree.
 */
export function taskMenu(anchor, t, { extra = [], at = null } = {}) {
  const lead = state.role === 'lead';
  const can = A.canWrite(t);
  const items = [
    ...extra,
    ...(extra.length ? ['sep'] : []),
    { label: 'Open', icon: 'open', onSelect: () => openTask(t.id) },
    'sep',
    can && (t.status === 'todo' || t.status === 'fix') ? { label: 'Start', icon: 'play', onSelect: () => A.start(t.id) } : null,
    lead && S.isOpen(t.status) && t.status !== 'check' ? { label: 'Mark done', icon: 'check', onSelect: () => A.setStatus(t.id, 'done') } : null,
    !lead && can && ['in_progress', 'fix'].includes(t.status) ? { label: 'Submit for check', icon: 'check', onSelect: () => A.setStatus(t.id, 'check') } : null,
    S.canTakeBack(t, state.me) ? { label: 'Take back from check…', icon: 'undo', onSelect: () => A.takeBack(t.id) } : null,
    can && t.status !== 'waiting' && S.isOpen(t.status) ? { label: 'Waiting…', icon: 'hide', onSelect: () => A.setStatus(t.id, 'waiting') } : null,
    can && S.isOpen(t.status) ? { label: 'Cancel…', icon: 'close', onSelect: () => A.setStatus(t.id, 'cancelled') } : null,
    can && t.status === 'cancelled' ? { label: `Reopen · back to ${S.LABEL[S.reopenTo(t)]}`, icon: 'restore', onSelect: () => A.reopen(t.id) } : null,
    lead ? { label: 'Assign to…', icon: 'user', hint: t.assignee && t.assignee !== state.me ? personName(t.assignee) : null, onSelect: () => assignMenu(anchor, t, { at }) } : null,
    lead ? { label: 'Move to…', icon: 'move', onSelect: async () => { const { moveDialog } = await import('./pickers.js'); moveDialog(t.id); } } : null,
    lead && T.isJob(state.idx, t) ? { label: 'Turn into a category', icon: 'folderPlus', onSelect: () => A.turnIntoCategory(t.id) } : null,
    'sep',
    can ? { label: 'Archive', icon: 'archive', onSelect: () => A.archive(t.id) } : null,
    lead ? { label: 'Delete…', icon: 'trash', danger: true, onSelect: () => A.remove(t.id) } : null,
  ];
  // No dangling divider when the last group is empty (a designer on someone else's task).
  while (items.length && (items[items.length - 1] === 'sep' || items[items.length - 1] === null)) items.pop();
  menu(anchor, items, { label: `${t.title} actions`, at });
}

/** The status pill: a button that opens the status menu, for whoever may change it. */
const statusPill = (t) => pill(t.status, A.canWrite(t) ? { onClick: (e) => { e.stopPropagation(); statusMenu(e.currentTarget, t); } } : {});

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
  const line = variant === 'backlog' ? null : subtext(t);
  const colour = T.colourOf(state.idx, t.id);
  const pathText = T.pathText(state.idx, t.id);
  const titleCls = `tile-title${t.status === 'done' ? ' done' : ''}${t.status === 'cancelled' ? ' cancelled' : ''}`;
  const sub = !T.isJob(state.idx, t);   // a subtask: the check control, in place of Start

  const a = el('article', {
    class: `tile${t.status === 'cancelled' ? ' muted' : ''}`, dataset: { id: t.id }, 'aria-current': open ? 'true' : null,
    draggable: drag && variant !== 'backlog' && canDrag() ? 'true' : null,
  },
  el('button', {
    class: 'open-link', type: 'button', dataset: { fk: `open-${t.id}` },
    'aria-label': `Open ${t.title}, ${S.LABEL[t.status]}`, onclick: () => openTask(t.id),
  }),
  el('div', { class: 'tile-top' },
    sub ? checkBox(t) : null,
    statusPill(t),
    el('span', { class: 'sp' }),
    el('span', { class: `meta${stale || variant === 'backlog' ? ' warn' : ''}`, title: 'Since the last activity' },
      variant === 'backlog' ? `${days}d untouched` : ageLabel(t.lastActivityAt)),
    iconBtn('more', `More actions for ${t.title}`, (e) => { e.stopPropagation(); taskMenu(e.currentTarget, t, { extra: menuExtra }); })),
  el('div', { class: titleCls }, t.title),
  path && pathText ? el('div', { class: 'tile-path' }, dot(colour), el('span', {}, pathText)) : null,
  line ? el('div', { class: `tile-sub ${line.cls}`.trim() }, line.text) : null,
  el('div', { class: 'tile-foot' },
    t.status === 'todo' && !sub && A.canWrite(t) ? btn('Start', (e) => { e.stopPropagation(); A.start(t.id); }, { cls: 'sm', ic: 'play', title: 'Start: one tap to In progress' }) : null,
    variant !== 'backlog' && prog.total ? bar(prog.done, prog.total) : el('span', { class: 'sp' }),
    variant !== 'backlog' && prog.total ? el('span', { class: 'meta' }, `${prog.done}/${prog.total}`) : null,
    assignee ? whoBadge(t.assignee) : null));
  // Right-click, long-press and Shift+F10 open the same menu as ⋯.
  return withMenu(a, (at) => taskMenu(a.querySelector('.tile-top .ib') ?? a, t, { extra: menuExtra, at }));
}

/** A list row: the same facts in 44px. */
export function row(t, { path = false, assignee = false, drag = true } = {}) {
  const open = state.openId === t.id;
  const prog = T.progress(state.idx, t.id);
  const sub = subtext(t);
  const pathText = path ? T.pathText(state.idx, t.id) : '';
  const subLine = [pathText, sub?.text].filter(Boolean).join(' · ');
  const isSub = !T.isJob(state.idx, t);   // a subtask: the check control, in place of Start
  const r = el('div', { class: `trow${t.status === 'cancelled' ? ' muted' : ''}`, dataset: { id: t.id }, 'aria-current': open ? 'true' : null, draggable: drag && canDrag() ? 'true' : null },
    el('button', { class: 'open-link', type: 'button', dataset: { fk: `open-${t.id}` }, 'aria-label': `Open ${t.title}, ${S.LABEL[t.status]}`, onclick: () => openTask(t.id) }),
    el('span', { class: 'trow-lead' }, isSub ? checkBox(t) : null, statusPill(t)),
    el('div', { class: 'trow-main' },
      el('div', { class: 'trow-title' }, t.title),
      subLine ? el('div', { class: `trow-sub` }, subLine) : null),
    el('div', { class: 'trow-end' },
      prog.total ? el('span', { class: 'meta' }, `${prog.done}/${prog.total}`) : null,
      assignee ? whoBadge(t.assignee) : null,
      el('span', { class: 'meta' }, ageLabel(t.lastActivityAt)),
      t.status === 'todo' && !isSub && A.canWrite(t) ? iconBtn('play', `Start ${t.title}`, (e) => { e.stopPropagation(); A.start(t.id); }, 'sm') : null,
      iconBtn('more', `More actions for ${t.title}`, (e) => { e.stopPropagation(); taskMenu(e.currentTarget, t); }, 'sm')));
  return withMenu(r, (at) => taskMenu(r.querySelector('.trow-end .ib:last-child') ?? r, t, { at }));
}

/** The labelled divider above a status band. */
export const band = (status, count) => el('div', { class: 'band' }, el('span', { class: 'lbl' }, S.LABEL[status]), el('span', { class: 'meta' }, String(count)));

/**
 * Drag with a mouse: job tiles and rows, category tiles, category headers
 * and sidebar items, all through this one engine.
 * - Over a plain item (a job tile or row): before or after it, by which half
 *   the pointer is in.
 * - Over something that holds things (a category tile, a category header, a
 *   sidebar item, all marked data-drop-into): its outer quarters place before
 *   or after it, its middle drops INTO it.
 * - The thing dragged lifts (it dims in place) and a gap the size of it
 *   shows where it will land; a drop INTO is outlined instead.
 * - The tree decides what is allowed (T.nestProblem): nothing goes into
 *   itself or its own descendants, steps stay in jobs, products in
 *   categories. A refused place shows no gap and takes no drop.
 * Touch never sees this: it has Move to… in the same menus.
 * `validate: false` skips the tree check (Home's own order is not the tree).
 */
export function enableDrag(root, { onDrop, onDropInto = null, validate = true }) {
  if (!canDrag()) return;
  let dragId = null;
  let dragEl = null;
  let plan = null;
  const gap = el('div', { class: 'drop-gap', 'aria-hidden': 'true' });
  const across = (n) => n.classList.contains('tile') || n.classList.contains('cat-tile') || n.classList.contains('ktile');
  const reset = () => {
    gap.remove();
    root.querySelectorAll('.drop-into').forEach((n) => n.classList.remove('drop-into'));
    plan = null;
  };

  root.addEventListener('dragstart', (e) => {
    const handle = e.target.closest?.('[draggable="true"]');
    if (!handle || !root.contains(handle)) return;
    // A category header drags its whole section.
    const box = handle.dataset.id ? handle : (handle.closest('[data-id]') ?? handle);
    const id = box.dataset.id ?? handle.dataset.dropInto;
    if (!id) return;
    dragId = id;
    dragEl = box;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
    gap.className = `drop-gap${across(box) ? '' : ' line'}${box.classList.contains('span') ? ' span' : ''}`;
    gap.style.minHeight = across(box) ? `${box.offsetHeight}px` : '';
    requestAnimationFrame(() => box.classList.add('dragging'));
  });

  root.addEventListener('dragover', (e) => {
    if (!dragId) return;
    if (e.target.closest?.('.drop-gap')) { if (plan) e.preventDefault(); return; }
    if (dragEl?.contains(e.target)) { reset(); return; }
    const item = e.target.closest?.('[data-id]');
    const holder = onDropInto ? e.target.closest?.('[data-drop-into]') : null;
    let next = null;
    if (holder && (!item || item === holder || item.contains(holder))) {
      const r = holder.getBoundingClientRect();
      const pos = across(holder) ? (e.clientX - r.left) / r.width : (e.clientY - r.top) / r.height;
      const box = item && (item === holder || item.contains(holder)) ? item : null;
      if (box && pos < 0.25) next = { where: 'before', targetId: box.dataset.id, el: box };
      else if (box && pos > 0.75) next = { where: 'after', targetId: box.dataset.id, el: box };
      else next = { where: 'into', targetId: holder.dataset.dropInto, el: holder };
    } else if (item) {
      const r = item.getBoundingClientRect();
      const before = across(item) ? e.clientX < r.left + r.width / 2 : e.clientY < r.top + r.height / 2;
      next = { where: before ? 'before' : 'after', targetId: item.dataset.id, el: item };
    }
    if (!next || next.targetId === dragId) { reset(); return; }
    if (validate) {
      const { idx } = state;
      const target = idx.byId.get(next.targetId);
      const parentId = next.where === 'into' ? next.targetId : (T.parentOf(idx, target)?.id ?? null);
      if (!target || T.nestProblem(idx, dragId, parentId)) { reset(); return; }
    }
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (plan && plan.where === next.where && plan.targetId === next.targetId) return;
    reset();
    plan = next;
    if (next.where === 'into') next.el.classList.add('drop-into');
    else next.el[next.where](gap);
  });

  root.addEventListener('drop', (e) => {
    if (!dragId) return;
    e.preventDefault();
    const p = plan;
    const id = dragId;
    reset();
    if (!p) return;
    if (p.where === 'into') onDropInto?.(id, p.targetId);
    else onDrop(id, p.targetId, p.where);
  });

  root.addEventListener('dragend', () => {
    dragEl?.classList.remove('dragging');
    reset();
    dragId = null;
    dragEl = null;
  });
}


export { icon, node };
