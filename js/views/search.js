// views/search.js — Ctrl+K (or the header's search): every job, task and
// category, done ones included, each with its breadcrumb. No open/close
// animation: it is a keyboard action used many times a day.

import { el, icon, pill, dot } from '../ui.js';
import { state } from '../state.js';
import * as T from '../tree.js';
import * as S from '../status.js';
import { openDialog } from '../dialog.js';
import { go, openTask } from '../router.js';

const norm = (s) => String(s ?? '').toLowerCase();

let open = false;
let includeCancelled = false;   // cancelled work is on record, found on request

export function openSearch() {
  if (open) return;
  open = true;
  openDialog((box, close) => {
    box.classList.add('search-box');
    const q = el('input', { class: 'input', type: 'search', placeholder: 'Search jobs, tasks and categories', 'aria-label': 'Search', autocomplete: 'off', 'data-autofocus': '' });
    const list = el('div', { class: 'picker-list', role: 'listbox', 'aria-label': 'Results', style: { 'max-height': '60vh' } });
    const tick = el('input', { type: 'checkbox', checked: includeCancelled });
    tick.addEventListener('change', () => { includeCancelled = tick.checked; draw(); q.focus(); });
    const hint = el('div', { class: 'row', style: { 'justify-content': 'space-between', 'flex-wrap': 'wrap' } },
      el('label', { class: 'check-line' }, tick, 'Include cancelled'),
      el('span', { class: 'hint' }, 'Enter opens the first · arrows move · Esc closes'));
    const choose = (n) => {
      close(true);
      // The panel shows a task, a section, or a step where it sits (in what holds it).
      if (n.kind === T.KIND.task || T.isSection(state.idx, n)) openTask(n.id);
      else if (n.kind === T.KIND.step) openTask(n.parentId);
      else go(`/tasks/${n.id}`);
    };
    const draw = () => {
      list.textContent = '';
      const query = q.value.trim();
      const words = norm(query).split(/\s+/).filter(Boolean);
      let hits = state.idx.nodes.filter((n) => (n.kind !== T.KIND.step || words.length) && (includeCancelled || n.status !== 'cancelled'));
      if (words.length) {
        hits = hits.filter((n) => {
          const hay = `${norm(T.nameOf(n))} ${norm(n.brief)} ${norm(n.revision)}`;
          return words.every((w) => hay.includes(w));
        });
      }
      // Titles that start with the query first, then open before finished, then recent.
      hits.sort((a, b) => {
        const s = (n) => (norm(T.nameOf(n)).startsWith(norm(query)) ? 0 : 1) + (n.kind === T.KIND.task && !S.isOpen(n.status) ? 2 : 0);
        return s(a) - s(b) || String(b.lastActivityAt ?? b.updatedAt).localeCompare(String(a.lastActivityAt ?? a.updatedAt));
      });
      for (const n of hits.slice(0, 50)) {
        const name = T.nameOf(n);
        const i = words[0] ? norm(name).indexOf(words[0]) : -1;
        const label = i >= 0 ? [name.slice(0, i), el('mark', {}, name.slice(i, i + words[0].length)), name.slice(i + words[0].length)] : [name];
        list.append(el('button', { class: 'pick', type: 'button', role: 'option', onclick: () => choose(n) },
          n.kind === T.KIND.task ? pill(n.status) : n.kind === T.KIND.step ? icon('tasks', 16) : dot(T.colourOf(state.idx, n.id)),
          el('span', { style: { 'min-width': '0', overflow: 'hidden', 'text-overflow': 'ellipsis', 'white-space': 'nowrap' } }, ...label),
          el('span', { class: 'sub' }, T.ancestorChain(state.idx, n.id).map(T.nameOf).join(' › '))));
      }
      if (!hits.length) {
        // Hidden cancelled work that would match is worth a sentence, not silence.
        const hidden = !includeCancelled && words.length ? state.idx.nodes.filter((n) => n.status === 'cancelled'
          && words.every((w) => `${norm(T.nameOf(n))} ${norm(n.brief)} ${norm(n.revision)}`.includes(w))).length : 0;
        list.append(el('div', { class: 'pick' }, !query ? 'Nothing yet.'
          : hidden ? `Nothing open matches "${query}". ${hidden} cancelled ${hidden === 1 ? 'item does' : 'items do'}: tick Include cancelled.`
            : `Nothing matches "${query}". Archived items are in the archive.`));
      }
    };
    q.addEventListener('input', draw);
    q.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); list.querySelector('button.pick')?.click(); }
      if (e.key === 'ArrowDown') { e.preventDefault(); list.querySelector('button.pick')?.focus(); }
    });
    list.addEventListener('keydown', (e) => {
      const picks = [...list.querySelectorAll('button.pick')];
      const i = picks.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') { e.preventDefault(); picks[Math.min(i + 1, picks.length - 1)]?.focus(); }
      if (e.key === 'ArrowUp') { e.preventDefault(); if (i <= 0) q.focus(); else picks[i - 1]?.focus(); }
    });
    box.append(q, list, hint);
    draw();
  }, { label: 'Search' }).then(() => { open = false; });
}
