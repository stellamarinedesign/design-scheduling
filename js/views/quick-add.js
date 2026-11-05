// views/quick-add.js — the one way to add: "New job" in the header, N, the
// phone's + button, or ?capture=1 (the AutoHotkey hotkey, Phase 4). It
// defaults to where you are: the category or job on screen, else the last
// place used.
//
// WHO IT IS FOR (Phase 2): the lead picks a person, defaulting to themself -
// or, inside a job, to whoever has that job. A designer's "Add task" is
// always their own, and lands in their group under "From designers" for the
// lead to file (team.js); there is no place to choose.

import { el, btn, dot, pill, toast, prefs } from '../ui.js';
import { state, node, personName } from '../state.js';
import * as T from '../tree.js';
import * as A from '../actions.js';
import { assignable } from '../team.js';
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

export function openQuickAdd({ parentId, capture = false, own = state.role !== 'lead' } = {}) {
  if (own) return openOwnAdd({ capture });
  let place = parentId !== undefined ? parentId : defaultPlace();
  return openDialog((box, close, { dismiss }) => {
    const heading = el('h3', {});
    box.append(heading);
    const title = el('input', { class: 'input', id: 'qaTitle', type: 'text', placeholder: 'What needs doing?', autocomplete: 'off', maxlength: '300', 'data-autofocus': '' });
    box.append(el('div', { class: 'field' }, el('label', { for: 'qaTitle' }, 'Title'), title));

    const placeBtn = el('button', { class: 'pv-btn', type: 'button', id: 'qaPlace', style: { 'margin-left': '0', border: '1px solid var(--border)' } });
    const tplLine = el('label', { class: 'check-line' });
    const tplBox = el('input', { type: 'checkbox', checked: true });

    // For whom: you, or a designer. Inside a job, whoever has the job, until you choose.
    const people = assignable(state.access);
    const forSel = el('select', { class: 'sel', id: 'qaFor' },
      [state.me, ...people.filter((p) => p !== state.me)].map((p) => el('option', { value: p }, personName(p))),
      el('option', { value: '' }, 'Nobody yet'));
    let forTouched = false;
    forSel.addEventListener('change', () => { forTouched = true; });
    const forField = el('div', { class: 'field' }, el('label', { for: 'qaFor' }, 'For'), forSel);
    forField.hidden = people.length < 2;

    const drawPlace = () => {
      const p = place ? node(place) : null;
      const inJob = p && (p.kind === T.KIND.task || T.isSection(state.idx, p));
      heading.textContent = inJob ? 'New task' : 'New job';
      placeBtn.textContent = '';
      placeBtn.append(...[p ? (p.kind === T.KIND.task ? pill(p.status) : dot(T.colourOf(state.idx, p.id))) : null,
        el('span', {}, p ? T.ancestorChain(state.idx, p.id).concat(p).map(T.nameOf).join(' › ') : 'Not in a category')].filter(Boolean));
      const tpl = !inJob && p ? T.stepsTemplateOf(state.idx, p.id) : null;
      tplLine.hidden = !tpl;
      tplLine.textContent = '';
      if (tpl) tplLine.append(tplBox, `Start with the ${T.nameOf(tpl.from)} steps (${tpl.template.length})`);
      if (!forTouched) {
        const owner = inJob ? T.ownerTask(state.idx, p.id)?.assignee : null;
        forSel.value = owner && [...forSel.options].some((o) => o.value === owner) ? owner : state.me;
      }
    };
    placeBtn.addEventListener('click', async () => {
      const dest = await placeDialog({ title: 'Put it in…', includeJobs: true, current: place, allow: () => null, topLabel: 'Not in a category' });
      if (dest !== undefined) { place = dest; drawPlace(); }
      title.focus();
    });
    box.append(el('div', { class: 'field' }, el('label', { for: 'qaPlace' }, 'In'), placeBtn), tplLine, forField);

    const brief = el('textarea', { class: 'textarea', id: 'qaBrief', rows: '3', placeholder: 'What needs doing, and any instructions (optional)' });
    box.append(el('div', { class: 'field' }, el('label', { for: 'qaBrief' }, 'Brief'), brief));
    const err = el('div', { class: 'form-err', role: 'alert' });
    box.append(err);

    const add = ({ andOpen = false, another = false } = {}) => {
      const t = title.value.trim();
      if (!t) { err.textContent = 'Give it a title.'; title.focus(); return; }
      const who = forField.hidden ? undefined : (forSel.value || null);
      const id = A.createTask({ title: t, parentId: place, brief: brief.value, useTemplate: !tplLine.hidden && tplBox.checked, assignee: who });
      prefs.set('lastAddPlace', place);
      const where = place ? T.nameOf(node(place)) : 'Not in a category';
      const forWhom = who && who !== state.me ? ` for ${personName(who)}` : '';
      if (another) {
        title.value = '';
        brief.value = '';
        err.textContent = '';
        toast(`Added to ${where}${forWhom}`, { action: 'Open', onAction: () => openTask(id) });
        title.focus();
        return;
      }
      close(id);
      if (andOpen) openTask(id);
      else toast(`Added to ${where}${forWhom}`, { action: 'Open', onAction: () => openTask(id) });
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

/** A designer's own task: on their list at once, filed by the lead later. */
function openOwnAdd({ capture = false } = {}) {
  return openDialog((box, close, { dismiss }) => {
    box.append(el('h3', {}, 'New task'),
      el('p', { class: 'lede' }, 'It goes on your list, assigned to you. The Design lead files it into a category.'));
    const title = el('input', { class: 'input', id: 'qaTitle', type: 'text', placeholder: 'What needs doing?', autocomplete: 'off', maxlength: '300', 'data-autofocus': '' });
    const brief = el('textarea', { class: 'textarea', id: 'qaBrief', rows: '3', placeholder: 'Any detail worth keeping (optional)' });
    const err = el('div', { class: 'form-err', role: 'alert' });
    box.append(el('div', { class: 'field' }, el('label', { for: 'qaTitle' }, 'Title'), title),
      el('div', { class: 'field' }, el('label', { for: 'qaBrief' }, 'Notes'), brief), err);
    const add = ({ andOpen = false, another = false } = {}) => {
      const t = title.value.trim();
      if (!t) { err.textContent = 'Give it a title.'; title.focus(); return; }
      const id = A.addOwnTask({ title: t, brief: brief.value });
      if (another) {
        title.value = ''; brief.value = ''; err.textContent = '';
        toast('Added to your list', { action: 'Open', onAction: () => openTask(id) });
        title.focus();
        return;
      }
      close(id);
      if (andOpen) openTask(id);
      else toast('Added to your list', { action: 'Open', onAction: () => openTask(id) });
    };
    title.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); add({ another: e.shiftKey }); } });
    brief.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); add(); } });
    box.append(el('div', { class: 'actions' },
      btn('Add', () => add(), { cls: 'primary' }),
      btn('Add and open', () => add({ andOpen: true })),
      btn('Cancel', dismiss, { cls: 'ghost' })),
    el('div', { class: 'hint' }, capture ? 'Captured from the hotkey. Enter adds; Shift+Enter adds and keeps this open.' : 'Enter adds · Shift+Enter adds another · Esc cancels'));
  }, { label: 'New task', guard: true });
}
