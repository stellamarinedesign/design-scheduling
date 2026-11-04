// views/pickers.js — choosing a task or a place: what a task waits on, where
// something moves to, where a new job goes. Search-as-you-type over the tree,
// with the reason a choice is refused shown beside it rather than hidden.

import { el, icon, btn, pill, dot } from '../ui.js';
import { state, node } from '../state.js';
import * as T from '../tree.js';
import * as S from '../status.js';
import * as A from '../actions.js';
import { openDialog } from '../dialog.js';
import * as NT from '../notes.js';

const norm = (s) => String(s ?? '').toLowerCase();

/** Highlight the matched part of a label. */
function marked(text, q) {
  const i = q ? norm(text).indexOf(norm(q)) : -1;
  if (i < 0) return [text];
  return [text.slice(0, i), el('mark', {}, text.slice(i, i + q.length)), text.slice(i + q.length)];
}

/** Arrow keys between the picks, Enter chooses. */
function listKeys(input, list) {
  input.addEventListener('keydown', (e) => {
    const picks = [...list.querySelectorAll('.pick:not(:disabled)')];
    if (e.key === 'ArrowDown') { e.preventDefault(); picks[0]?.focus(); }
    if (e.key === 'Enter') { e.preventDefault(); picks[0]?.click(); }
  });
  list.addEventListener('keydown', (e) => {
    const picks = [...list.querySelectorAll('.pick:not(:disabled)')];
    const i = picks.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); picks[Math.min(i + 1, picks.length - 1)]?.focus(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); if (i <= 0) input.focus(); else picks[i - 1]?.focus(); }
  });
}

/**
 * What a task waits on: a reason, and/or the tasks holding it up.
 * @returns {Promise<{note: string, blockedBy: string[]}|null>}
 */
export function waitingDialog(id) {
  const t = node(id);
  const chosen = new Set(t?.status === 'waiting' ? (t.waiting?.blockedBy ?? []) : []);
  return openDialog((box, close, { dismiss }) => {
    box.append(el('h3', {}, t?.status === 'waiting' ? 'What it is waiting on' : `Waiting: ${t?.title ?? ''}`));
    const note = el('textarea', { class: 'textarea', rows: '2', id: 'wNote', placeholder: 'e.g. Supplier sample, customer sign-off', 'data-autofocus': '' });
    note.value = t?.status === 'waiting' ? (t.waiting?.note ?? '') : '';
    box.append(el('div', { class: 'field' }, el('label', { for: 'wNote' }, 'Reason'), note));

    const chips = el('div', { class: 'chips' });
    const drawChips = () => {
      chips.textContent = '';
      for (const b of chosen) {
        const n = node(b);
        if (!n) continue;
        chips.append(el('button', { class: 'chip', type: 'button', title: 'Remove', onclick: () => { chosen.delete(b); drawChips(); drawList(); } },
          pill(n.status), el('span', {}, n.title), icon('close', 14)));
      }
    };
    const q = el('input', { class: 'input', type: 'search', id: 'wFind', placeholder: 'Find the job or task holding it up', autocomplete: 'off' });
    const list = el('div', { class: 'picker-list', role: 'listbox', 'aria-label': 'Open tasks' });
    const drawList = () => {
      list.textContent = '';
      const query = q.value.trim();
      const open = state.idx.nodes.filter((n) => n.kind === T.KIND.task && S.isOpen(n.status) && n.id !== id && !chosen.has(n.id)
        && (!query || norm(n.title).includes(norm(query)) || norm(T.pathText(state.idx, n.id)).includes(norm(query))));
      open.sort((a, b) => String(b.lastActivityAt).localeCompare(String(a.lastActivityAt)));
      for (const n of open.slice(0, 40)) {
        const why = S.blockerProblem(state.idx, id, n.id);
        list.append(el('button', {
          class: 'pick', type: 'button', role: 'option', disabled: Boolean(why), title: why ?? '',
          'aria-label': `${n.title}, ${S.LABEL[n.status]}${why ? `: ${why}` : ''}`,
          onclick: () => { chosen.add(n.id); q.value = ''; drawChips(); drawList(); q.focus(); },
        }, pill(n.status), el('span', {}, ...marked(n.title, query)), el('span', { class: 'sub' }, why ?? T.pathText(state.idx, n.id))));
      }
      if (!list.childNodes.length) list.append(el('div', { class: 'pick', 'aria-disabled': 'true' }, query ? 'No open task matches.' : 'No other open tasks.'));
    };
    q.addEventListener('input', drawList);
    listKeys(q, list);
    box.append(el('div', { class: 'field' }, el('label', { for: 'wFind' }, 'Blocked by (optional)'), chips, q, list));
    drawChips();
    drawList();
    const err = el('div', { class: 'form-err', role: 'alert' });
    box.append(err, el('div', { class: 'actions' },
      btn('Save', () => {
        const v = note.value.trim();
        if (!v && !chosen.size) { err.textContent = 'Give a reason, or pick the task holding it up.'; return; }
        close({ note: v, blockedBy: [...chosen] });
      }, { cls: 'primary' }),
      btn('Cancel', dismiss)));
    note.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); box.querySelector('.btn.primary').click(); } });
  }, { label: 'Waiting', wide: true, guard: true });
}

/**
 * A place in the tree: the top, a group, a product, or (for a task) a job.
 * `allow(n)` returns a refusal sentence or null.
 * @returns {Promise<string|null|undefined>} an id, null for the top level, undefined when cancelled
 */
export function placeDialog({ title, allow, includeJobs = false, current = undefined, topLabel = 'The top level (no category)' }) {
  return openDialog((box, close) => {
    box.append(el('h3', {}, title));
    const q = el('input', { class: 'input', type: 'search', placeholder: 'Find a category or job', autocomplete: 'off', 'data-autofocus': '' });
    const list = el('div', { class: 'picker-list', role: 'listbox', 'aria-label': 'Places' });
    const draw = () => {
      list.textContent = '';
      const query = q.value.trim();
      const pick = (n, depth) => {
        const why = allow(n);
        return el('button', {
          class: 'pick', type: 'button', role: 'option', disabled: Boolean(why), title: why ?? '',
          'aria-selected': (n?.id ?? null) === current ? 'true' : null, style: { '--depth': query ? 0 : depth },
          onclick: () => close({ id: n?.id ?? null }),
        },
        n ? (n.kind === T.KIND.task ? pill(n.status) : dot(T.colourOf(state.idx, n.id))) : icon('home', 16),
        el('span', {}, ...marked(n ? T.nameOf(n) : topLabel, query)),
        el('span', { class: 'sub' }, why ?? (n && query ? T.pathText(state.idx, n.id, { skipMaster: false }) : n?.kind === T.KIND.product ? 'Product' : '')));
      };
      if (!query) list.append(pick(null, 0));
      const walk = (pid, depth) => {
        for (const c of T.childrenOf(state.idx, pid)) {
          const isPlace = T.isGroupLike(c) || (includeJobs && c.kind === T.KIND.task && T.isJob(state.idx, c));
          if (!isPlace) continue;
          if (!query || norm(T.nameOf(c)).includes(norm(query))) list.append(pick(c, depth));
          if (T.isGroupLike(c)) walk(c.id, depth + 1);
        }
      };
      walk(null, 0);
      if (!list.childNodes.length) list.append(el('div', { class: 'pick' }, 'Nothing matches.'));
    };
    q.addEventListener('input', draw);
    listKeys(q, list);
    box.append(q, list, el('div', { class: 'actions' }, btn('Cancel', () => close(null))));
    draw();
  }, { label: title, wide: true }).then((r) => (r ? r.id : undefined));
}

/**
 * A job (or any task) to link a Log note to: open work first, most recently
 * active first, searchable by title and category.
 * @returns {Promise<string|null>} the task's id
 */
export function jobDialog({ title = 'Link to a job', exclude = [] } = {}) {
  return openDialog((box, close) => {
    box.append(el('h3', {}, title));
    const q = el('input', { class: 'input', type: 'search', placeholder: 'Find the job', autocomplete: 'off', 'data-autofocus': '', 'aria-label': 'Find the job' });
    const list = el('div', { class: 'picker-list', role: 'listbox', 'aria-label': 'Jobs' });
    const draw = () => {
      list.textContent = '';
      const query = q.value.trim();
      const tasks = state.idx.nodes.filter((n) => n.kind === T.KIND.task && !exclude.includes(n.id)
        && (!query || norm(n.title).includes(norm(query)) || norm(T.pathText(state.idx, n.id)).includes(norm(query))));
      const rank = (n) => (S.isOpen(n.status) ? 0 : 1) * 2 + (T.isJob(state.idx, n) ? 0 : 1);
      tasks.sort((a, b) => rank(a) - rank(b) || String(b.lastActivityAt).localeCompare(String(a.lastActivityAt)));
      for (const n of tasks.slice(0, 50)) {
        list.append(el('button', {
          class: 'pick', type: 'button', role: 'option', onclick: () => close(n.id),
          'aria-label': `${n.title}, ${S.LABEL[n.status]}`,
        }, pill(n.status), el('span', {}, ...marked(n.title, query)), el('span', { class: 'sub' }, T.pathText(state.idx, n.id))));
      }
      if (!list.childNodes.length) list.append(el('div', { class: 'pick', 'aria-disabled': 'true' }, query ? 'No job matches.' : 'No jobs yet.'));
    };
    q.addEventListener('input', draw);
    listKeys(q, list);
    box.append(q, list, el('div', { class: 'actions' }, btn('Cancel', () => close(null))));
    draw();
  }, { label: title, wide: true });
}

/**
 * A category for a Log note: this person's recent ones first, then the
 * whole tree. Only categories (never a section inside a job, nor "From
 * designers").
 * @returns {Promise<{id: string|null}|null>} null when cancelled; {id: null} for "No category"
 */
export function categoryDialog({ title = 'Category', current = null, recent = [], noneLabel = 'No category' } = {}) {
  return openDialog((box, close) => {
    box.append(el('h3', {}, title));
    const q = el('input', { class: 'input', type: 'search', placeholder: 'Find a category', autocomplete: 'off', 'data-autofocus': '', 'aria-label': 'Find a category' });
    const list = el('div', { class: 'picker-list', role: 'listbox', 'aria-label': 'Categories' });
    const { recent: fresh, all } = NT.categoryList(state.idx, { recent });
    const pick = ({ node: n, depth }, query, sub = '') => el('button', {
      class: 'pick', type: 'button', role: 'option', 'aria-selected': n.id === current ? 'true' : null,
      style: { '--depth': query ? 0 : depth }, onclick: () => close({ id: n.id }),
    }, dot(T.colourOf(state.idx, n.id)), el('span', {}, ...marked(T.nameOf(n), query)), el('span', { class: 'sub' }, sub));
    const draw = () => {
      list.textContent = '';
      const query = q.value.trim();
      if (!query) {
        list.append(el('button', { class: 'pick', type: 'button', role: 'option', 'aria-selected': current === null ? 'true' : null, onclick: () => close({ id: null }) },
          dot(null), el('span', {}, noneLabel)));
        if (fresh.length) {
          list.append(el('div', { class: 'pick-head' }, 'Recent'));
          for (const x of fresh) list.append(pick({ ...x, depth: 0 }, '', NT.placeText(state.idx, x.node.id)));
          list.append(el('div', { class: 'pick-head' }, 'All categories'));
        }
      }
      for (const x of all) {
        if (query && !norm(T.nameOf(x.node)).includes(norm(query))) continue;
        list.append(pick(x, query, query ? NT.placeText(state.idx, x.node.id) : ''));
      }
      if (!all.length && !query) list.append(el('div', { class: 'pick', 'aria-disabled': 'true' }, 'No categories yet. The Design lead makes them.'));
      else if (query && list.querySelectorAll('.pick').length === 0) list.append(el('div', { class: 'pick', 'aria-disabled': 'true' }, 'Nothing matches.'));
    };
    q.addEventListener('input', draw);
    listKeys(q, list);
    box.append(q, list, el('div', { class: 'actions' }, btn('Cancel', () => close(null))));
    draw();
  }, { label: title, wide: true });
}

/** Move to…: a group, product or job picker that works on a phone. */
export async function moveDialog(id) {
  const n = node(id);
  if (!n) return;
  const dest = await placeDialog({
    title: `Move ${T.nameOf(n)} to…`,
    includeJobs: n.kind === T.KIND.task,
    current: n.parentId ?? null,
    allow: (p) => {
      if ((p?.id ?? null) === (n.parentId ?? null)) return 'It is here now';
      return T.nestProblem(state.idx, id, p?.id ?? null);
    },
  });
  if (dest === undefined) return;
  A.moveInto(id, dest, n.kind === T.KIND.task ? 'beforeGroups' : 'end');
}
