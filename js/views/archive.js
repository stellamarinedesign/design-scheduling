// views/archive.js — what was archived, newest first, with Restore. Read on
// demand (the live query watches only what is not archived).

import { el, btn, pill, dot } from '../ui.js';
import { state } from '../state.js';
import * as T from '../tree.js';
import * as A from '../actions.js';
import { Store } from '../store.js';
import { whenLabel } from '../dates.js';

let cache = null;
let query = '';

export async function renderArchive(root) {
  const inner = el('div', { class: 'view-inner' });
  root.append(inner);
  inner.append(el('div', { class: 'view-head' }, el('h1', { class: 'h1' }, 'Archive'), el('span', { class: 'meta' }, 'Archived jobs, tasks and categories. Restore puts them back where they were.')));
  const host = el('div', { class: 'sec', 'aria-busy': 'true' }, el('div', { class: 'skel', style: { 'min-height': '44px' } }), el('div', { class: 'skel', style: { 'min-height': '44px' } }));
  inner.append(host);
  try {
    cache = await Store.loadArchived();
  } catch (e) {
    host.textContent = '';
    host.removeAttribute('aria-busy');
    host.append(el('div', { class: 'state-msg', role: 'alert' }, el('p', {}, `The archive did not load: ${e.message}`), el('div', {}, btn('Try again', () => { root.textContent = ''; renderArchive(root); }))));
    return;
  }
  draw(host, root);
}

function draw(host, root) {
  host.textContent = '';
  host.removeAttribute('aria-busy');
  const archived = cache ?? [];
  const ids = new Set(archived.map((n) => n.id));
  // Show what was archived as a unit: a node whose parent was not archived in the same act.
  const roots = archived.filter((n) => !(n.parentId && ids.has(n.parentId) && archived.find((p) => p.id === n.parentId)?.archivedAt === n.archivedAt));
  roots.sort((a, b) => String(b.archivedAt).localeCompare(String(a.archivedAt)));
  if (!roots.length) { host.append(el('div', { class: 'empty' }, 'Nothing archived. Done jobs can be archived from the Done fold at the end of each category.')); return; }
  const q = el('input', { class: 'input', type: 'search', placeholder: 'Filter the archive', value: query, 'aria-label': 'Filter the archive' });
  q.addEventListener('input', () => { query = q.value; drawRows(); });
  const rows = el('div', { class: 'rows' });
  const drawRows = () => {
    rows.textContent = '';
    const shown = roots.filter((n) => !query || T.nameOf(n).toLowerCase().includes(query.toLowerCase()));
    for (const n of shown.slice(0, 300)) {
      const inside = archived.filter((x) => x.archivedAt === n.archivedAt && x.id !== n.id).length;
      const where = state.idx.byId.get(n.parentId);
      rows.append(el('div', { class: 'arch-row' },
        el('div', { class: 'row', style: { 'min-width': '0' } },
          n.kind === T.KIND.task ? pill(n.status) : dot(n.colour ?? null),
          el('div', { style: { 'min-width': '0' } },
            el('div', { class: 'trow-title' }, T.nameOf(n)),
            el('div', { class: 'trow-sub' }, [n.status === 'cancelled' && n.cancelled?.reason ? `Cancelled: ${n.cancelled.reason}` : null, where ? `From ${T.nameOf(where)}` : null, `archived ${whenLabel(n.archivedAt)}`, inside ? `${inside} inside` : null].filter(Boolean).join(' · ')))),
        el('div', { class: 'row' },
          btn('Restore', () => { const back = A.restore(n, archived); cache = archived.filter((x) => !back.has(x.id)); draw(host, root); }, { cls: 'sm', ic: 'restore' }),
          btn('Delete…', async () => { if (await A.removeArchived(n, archived)) { cache = await Store.loadArchived(); draw(host, root); } }, { cls: 'sm ghost' }))));
    }
    if (!shown.length) rows.append(el('div', { class: 'arch-row' }, el('span', { class: 'meta' }, 'Nothing archived matches.')));
  };
  host.append(q, rows);
  drawRows();
}
