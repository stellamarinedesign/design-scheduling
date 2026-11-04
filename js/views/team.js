// views/team.js — the Team tab (the Design lead's): a column per person with
// their open work by status, and the simple counts (PLAN, "Team (lead)").
//
// Designers first, then the lead (you), whose column also holds the
// unassigned work that is yours by default. In each column: sent back, for
// check, in progress and waiting, the longest-sitting first; To do last and
// folded, since a lead's own To-do list runs long. The heading counts done
// this week and this month (approved work; cancelled never counts) and how
// long the oldest check has waited.
//
// ASSIGNING: drag a task onto someone's column (a mouse), or Assign to… in
// any task's ⋯ (touch, and everywhere else). The open tasks inside it that
// were following it go too, with one Undo.

import { el, btn, canDrag } from '../ui.js';
import { state, personName } from '../state.js';
import * as S from '../status.js';
import * as A from '../actions.js';
import * as TM from '../team.js';
import { ageLabel } from '../dates.js';
import { ROLE_LABEL, roleOf } from '../access.js';
import { laneRow, face, seenLine } from './crew.js';
import { errorState } from './home.js';

/** Which columns have their To do unfolded (this visit only). */
const todoOpen = new Set();

export function renderTeam(root) {
  const inner = el('div', { class: 'view-inner' });
  root.append(inner);
  if (state.error && !state.ready) { inner.append(errorState()); return; }
  const people = [...TM.crewOf(state.access), ...state.access.leads.filter((l) => !state.access.designers.includes(l))];
  // You last among the leads, so the designers' columns come first.
  people.sort((a, b) => (a === state.me) - (b === state.me));
  inner.append(el('div', { class: 'view-head' },
    el('h1', { class: 'h1' }, 'Team'),
    el('span', { class: 'meta wrap' }, canDrag() ? 'Open work by person. Drag a task onto someone to give it to them.' : 'Open work by person. Assign to… in a task\'s menu gives it to someone.')));
  if (!state.ready) {
    inner.append(el('div', { class: 'team-cols', 'aria-busy': 'true', 'aria-label': 'Loading' }, [1, 2, 3].map(() => el('div', { class: 'skel' }))));
    return;
  }
  if (!TM.crewOf(state.access).length) {
    inner.append(el('div', { class: 'empty' }, el('span', {}, el('strong', {}, 'No designers yet. '), 'A master adds them under the cog, in Accounts, with a temporary password. Their columns appear here.')));
  }
  const cols = el('div', { class: 'team-cols' });
  for (const email of people) cols.append(column(email));
  inner.append(cols);
  wireAssignDrag(cols);
}

function column(email) {
  const you = email === state.me;
  const groups = TM.teamColumn(state.idx, email, { includeUnassigned: you });
  const open = groups.reduce((n, g) => n + g.rows.length, 0);
  const done = TM.doneCounts(state.idx, email);
  const checks = groups.find((g) => g.key === 'check').rows;
  const oldest = checks.length ? ageLabel(TM.statusSince(checks[0])) : null;
  const lane = TM.crewLane(state.idx, email);
  const role = roleOf(state.access, email);
  const col = el('section', { class: 'team-col', dataset: { who: email }, 'aria-label': personName(email) },
    el('div', { class: 'team-head' },
      el('div', { class: 'row' }, face(email),
        el('div', { class: 'team-who' },
          el('h2', {}, personName(email)),
          el('span', { class: 'meta' }, `${ROLE_LABEL[role] ?? ''}${you && role === 'lead' ? ' · yours includes the unassigned' : ''}`))),
      el('div', { class: 'team-stats' },
        el('span', { class: 'meta' }, `${open} open`),
        el('span', { class: 'meta' }, `Done ${done.week} this week · ${done.month} this month`),
        checks.length ? el('span', { class: 'meta' }, `${checks.length} in check · oldest ${oldest}`) : null,
        you ? null : seenLine(lane))));
  const body = el('div', { class: 'team-body' });
  for (const g of groups) {
    if (!g.rows.length) continue;
    const folded = g.key === 'todo' && !todoOpen.has(email);
    if (g.key === 'todo') {
      body.append(btn(`${S.LABEL.todo} ${g.rows.length}`, () => {
        if (todoOpen.has(email)) todoOpen.delete(email); else todoOpen.add(email);
        const sec = document.querySelector(`.team-col[data-who="${CSS.escape(email)}"]`);
        sec?.replaceWith(column(email));
        wireAssignDrag(document.querySelector('.team-cols'));
      }, { cls: 'sm ghost team-fold', ic: folded ? 'chevRight' : 'chevDown', attrs: { 'aria-expanded': String(!folded) } }));
      if (folded) continue;
    } else {
      body.append(el('div', { class: 'band' }, el('span', { class: 'lbl' }, S.LABEL[g.key]), el('span', { class: 'meta' }, String(g.rows.length))));
    }
    // The band names the status, so the rows leave the pill out.
    for (const t of g.rows) body.append(laneRow(t, { drag: canDrag(), showPill: false }));
  }
  if (!open) body.append(el('p', { class: 'meta wrap team-none' }, you ? 'Nothing open of yours.' : 'Nothing open. Drag a task here, or use Assign to… in its menu.'));
  col.append(body);
  return col;
}

/**
 * Drag a task onto a column to give it to that person. Its own small engine:
 * the tree's drag (tile.js) is about places in the tree, this is about people.
 */
function wireAssignDrag(cols) {
  if (!cols || !canDrag() || cols.dataset.wired) return;
  cols.dataset.wired = '1';
  let dragId = null;
  cols.addEventListener('dragstart', (e) => {
    const r = e.target.closest?.('.lrow[draggable="true"]');
    if (!r) return;
    dragId = r.dataset.id;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', dragId);
    requestAnimationFrame(() => r.classList.add('dragging'));
  });
  const over = (e) => e.target.closest?.('.team-col');
  cols.addEventListener('dragover', (e) => {
    const col = over(e);
    if (!dragId || !col) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    cols.querySelectorAll('.drop-into').forEach((c) => { if (c !== col) c.classList.remove('drop-into'); });
    col.classList.add('drop-into');
  });
  cols.addEventListener('dragleave', (e) => { if (!cols.contains(e.relatedTarget)) cols.querySelectorAll('.drop-into').forEach((c) => c.classList.remove('drop-into')); });
  cols.addEventListener('drop', (e) => {
    const col = over(e);
    if (!dragId || !col) return;
    e.preventDefault();
    const id = dragId;
    dragId = null;
    cols.querySelectorAll('.drop-into').forEach((c) => c.classList.remove('drop-into'));
    A.assign(id, col.dataset.who);
  });
  cols.addEventListener('dragend', () => {
    cols.querySelectorAll('.dragging, .drop-into').forEach((c) => c.classList.remove('dragging', 'drop-into'));
    dragId = null;
  });
}

