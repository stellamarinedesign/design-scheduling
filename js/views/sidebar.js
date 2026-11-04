// views/sidebar.js — the category tree: every group with its dot and open
// count. Pinned on wide screens; a pop-out below 1100px (app.js). The same
// sidebar on Home and Tasks.
//
// Master categories are small labels; the categories in them are the rows.
// A category's sub-groups show only while you are inside it, so the list stays
// a list at 200–300 nodes.

import { el, icon, iconBtn, dot } from '../ui.js';
import { state } from '../state.js';
import * as T from '../tree.js';
import { route, routeHref } from '../router.js';
import { promptDialog } from '../dialog.js';
import * as A from '../actions.js';
import { go } from '../router.js';

export async function newMasterCategory() {
  const name = await promptDialog({ title: 'New master category', label: 'Name', placeholder: 'e.g. Production', ok: 'Add', body: 'Master categories sit at the top of Tasks, with categories inside them.' });
  if (!name) return;
  const id = A.createGroup({ name, parentId: null });
  if (id) go(`/tasks/${id}`);
}

export function renderSidebar(root) {
  root.textContent = '';
  const { idx } = state;
  root.append(el('div', { class: 'side-head' },
    el('span', { class: 'lbl' }, 'Categories'), el('span', { class: 'sp' }),
    state.role === 'lead' ? iconBtn('plus', 'New master category', newMasterCategory, 'sm') : null));

  if (!state.ready) {
    for (let i = 0; i < 6; i++) root.append(el('div', { class: 'si', 'aria-hidden': 'true' }, el('span', { class: 'skel-line', style: { width: `${50 + (i * 17) % 40}%` } })));
    return;
  }

  const current = route.parts[0] === 'tasks' && route.parts[1] && route.parts[1] !== 'top' ? route.parts[1] : null;
  const open = new Set(current ? [current, ...T.ancestorChain(idx, current).map((a) => a.id)] : []);
  const item = (g, depth = 0, extraCls = '') => el('a', {
    class: `si ${depth ? 'sub' : ''} ${extraCls}`.trim(), href: routeHref(`/tasks/${g.id}`),
    'aria-current': g.id === current ? 'page' : null, style: depth ? { '--depth': depth } : null,
  },
  depth ? null : dot(T.colourOf(idx, g.id)),
  el('span', { class: 'nm' }, T.nameOf(g)),
  el('span', { class: 'n', 'aria-label': 'open jobs' }, String(T.openJobCount(idx, g.id) || '')));

  const subs = (g, depth) => {
    if (!open.has(g.id)) return [];
    const out = [];
    for (const c of T.childrenOf(idx, g.id)) {
      if (!T.isGroupLike(c)) continue;
      out.push(item(c, depth));
      out.push(...subs(c, depth + 1));
    }
    return out;
  };

  const masters = T.childrenOf(idx, null).filter(T.isGroupLike);
  for (const m of masters) {
    const cats = T.childrenOf(idx, m.id).filter(T.isGroupLike);
    if (!cats.length) { root.append(item(m)); continue; }
    root.append(el('a', {
      class: 'si master-link', href: routeHref(`/tasks/${m.id}`), 'aria-current': m.id === current ? 'page' : null,
    }, el('span', { class: 'nm' }, T.nameOf(m))));
    for (const c of cats) { root.append(item(c)); root.append(...subs(c, 1)); }
  }
  const loose = T.childrenOf(idx, null).filter((n) => n.kind === T.KIND.task);
  if (loose.length) {
    root.append(el('a', { class: 'si', href: routeHref('/tasks/top'), 'aria-current': route.parts[1] === 'top' ? 'page' : null },
      dot(null), el('span', { class: 'nm' }, 'Not in a category'),
      el('span', { class: 'n' }, String(loose.filter((n) => n.status !== 'done' && n.status !== 'cancelled').length || ''))));
  }
  if (!masters.length && !loose.length) root.append(el('p', { class: 'side-empty' }, 'No categories yet. Make a master category, or import your TileDo or Excel data.'));

  root.append(el('div', { class: 'side-foot' },
    el('a', { class: 'si', href: routeHref('/archive'), 'aria-current': route.parts[0] === 'archive' ? 'page' : null }, icon('archive', 16), el('span', { class: 'nm' }, 'Archive')),
    state.role === 'lead' ? el('a', { class: 'si', href: routeHref('/import'), 'aria-current': route.parts[0] === 'import' ? 'page' : null }, icon('upload', 16), el('span', { class: 'nm' }, 'Import')) : null));
}
