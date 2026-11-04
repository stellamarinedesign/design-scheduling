// views/quick-add.js — the one way to add: "New job" in the header, N, the
// phone's + button, or ?capture=1 (the AutoHotkey hotkey, Phase 4). It
// defaults to where you are: the category or job on screen, else the last
// place used; and to you as the assignee.

import { el, btn, dot, pill, toast, prefs } from '../ui.js';
import { state, node } from '../state.js';
import * as T from '../tree.js';
import * as A from '../actions.js';
import { openDialog } from '../dialog.js';
import { route, openTask } from '../router.js';
import { placeDialog } from './pickers.js';

/** Where a new job goes by default: the open task's job, the page on screen, or the last place used. */
function defaultPlace() {
  if (route.parts[0] === 'tasks' && route.parts[1] && route.parts[1] !== 'top' && node(route.parts[1])) return route.parts[1];
  if (route.parts[0] === 'tasks' && route.query.c && node(route.query.c)) return route.query.c;
  const last = prefs.get('lastAddPlace', null);
  return last && node(last) ? last : null;
}

export function openQuickAdd({ parentId, capture = false } = {}) {
  let place = parentId !== undefined ? parentId : defaultPlace();
  return openDialog((box, close, { dismiss }) => {
    const heading = el('h3', {});
    box.append(heading);
    const title = el('input', { class: 'input', id: 'qaTitle', type: 'text', placeholder: 'What needs doing?', autocomplete: 'off', maxlength: '300', 'data-autofocus': '' });
    box.append(el('div', { class: 'field' }, el('label', { for: 'qaTitle' }, 'Title'), title));

    const placeBtn = el('button', { class: 'pv-btn', type: 'button', id: 'qaPlace', style: { 'margin-left': '0', border: '1px solid var(--border)' } });
    const tplLine = el('label', { class: 'check-line' });
    const tplBox = el('input', { type: 'checkbox', checked: true });
    const drawPlace = () => {
      const p = place ? node(place) : null;
      const inJob = p && (p.kind === T.KIND.task || T.isSection(state.idx, p));
      heading.textContent = inJob ? 'New task' : 'New job';
      placeBtn.textContent = '';
      placeBtn.append(p ? (p.kind === T.KIND.task ? pill(p.status) : dot(T.colourOf(state.idx, p.id))) : null,
        el('span', {}, p ? T.ancestorChain(state.idx, p.id).concat(p).map(T.nameOf).join(' › ') : 'Not in a category'));
      const tpl = !inJob && p ? T.stepsTemplateOf(state.idx, p.id) : null;
      tplLine.hidden = !tpl;
      tplLine.textContent = '';
      if (tpl) tplLine.append(tplBox, `Start with the ${T.nameOf(tpl.from)} steps (${tpl.template.length})`);
    };
    placeBtn.addEventListener('click', async () => {
      const dest = await placeDialog({ title: 'Put it in…', includeJobs: true, current: place, allow: () => null, topLabel: 'Not in a category' });
      if (dest !== undefined) { place = dest; drawPlace(); }
      title.focus();
    });
    box.append(el('div', { class: 'field' }, el('label', { for: 'qaPlace' }, 'In'), placeBtn), tplLine);

    const brief = el('textarea', { class: 'textarea', id: 'qaBrief', rows: '3', placeholder: 'What needs doing, and any instructions (optional)' });
    box.append(el('div', { class: 'field' }, el('label', { for: 'qaBrief' }, 'Brief'), brief));
    const err = el('div', { class: 'form-err', role: 'alert' });
    box.append(err);

    const add = ({ andOpen = false, another = false } = {}) => {
      const t = title.value.trim();
      if (!t) { err.textContent = 'Give it a title.'; title.focus(); return; }
      const id = A.createTask({ title: t, parentId: place, brief: brief.value, useTemplate: !tplLine.hidden && tplBox.checked });
      prefs.set('lastAddPlace', place);
      const where = place ? T.nameOf(node(place)) : 'Not in a category';
      if (another) {
        title.value = '';
        brief.value = '';
        err.textContent = '';
        toast(`Added to ${where}`, { action: 'Open', onAction: () => openTask(id) });
        title.focus();
        return;
      }
      close(id);
      if (andOpen) openTask(id);
      else toast(`Added to ${where}`, { action: 'Open', onAction: () => openTask(id) });
    };
    title.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); add({ another: e.shiftKey }); }
    });
    brief.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); add(); } });
    box.append(el('div', { class: 'actions' },
      btn('Add', () => add(), { cls: 'primary' }),
      btn('Add and open', () => add({ andOpen: true })),
      btn('Cancel', dismiss, { cls: 'ghost' })),
    el('div', { class: 'hint' }, capture ? 'Captured from the hotkey. Enter adds; Shift+Enter adds and keeps this open.' : 'Enter adds · Shift+Enter adds another · Esc cancels'));
    drawPlace();
  }, { label: 'New job', guard: true });
}
