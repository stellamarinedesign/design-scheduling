// views/sidebar.js — the category tree: every group with its dot and open
// count. Pinned on wide screens; a pop-out below 1100px (app.js). The same
// sidebar on Home and Tasks.
//
// NAVIGATION ONLY (decided 2026-11-04): clicking a category shows it in the
// one full Tasks list - scrolled to, expanded with its ancestors, briefly lit
// (#/tasks?c=<id>). There is no separate category page; Focus (in the
// category's ⋯) shows one alone.
//
// Master categories are small headings; the categories in them are the rows.
// A category's sub-groups show only while it is the one shown, so the list
// stays a list at 200–300 nodes. Items drag (the lead): reorder among their
// siblings, or drop onto a category to move inside it. Right-click,
// long-press and Shift+F10 open the category's own menu.

import { el, icon, iconBtn, dot, withMenu } from '../ui.js';
import { state } from '../state.js';
import * as T from '../tree.js';
import { route, routeHref } from '../router.js';
import { promptDialog } from '../dialog.js';
import * as A from '../actions.js';
import { enableDrag } from './tile.js';
import { revealCategory, groupMenu } from './tasks.js';

export async function newMasterCategory() {
  const name = await promptDialog({ title: 'New master category', label: 'Name', placeholder: 'e.g. Production', ok: 'Add', body: 'Master categories sit at the top of Tasks, with categories inside them.' });
  if (!name) return;
  const id = A.createGroup({ name, parentId: null });
  if (id) revealCategory(id);
}

/** The category being shown: ?c= in the full list, or the one in Focus. */
function currentCategory() {
  if (route.parts[0] !== 'tasks') return null;
  if (route.parts[1] && route.parts[1] !== 'top') return route.parts[1];
  return route.query.c ?? null;
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

  const current = currentCategory();
  const open = new Set(current && idx.byId.has(current) ? [current, ...T.ancestorChain(idx, current).map((a) => a.id)] : []);
  const lead = state.role === 'lead';
  const link = (g, cls, ...kids) => {
    const a = el('a', {
      class: cls, href: routeHref('/tasks', { c: g.id }),
      'aria-current': g.id === current ? 'page' : null,
      dataset: { id: g.id, dropInto: g.id },
      draggable: lead ? 'true' : null,
      onclick: (e) => { if (e.button === 0 && !e.ctrlKey && !e.metaKey && !e.shiftKey) { e.preventDefault(); revealCategory(g.id); } },
    }, ...kids);
    return withMenu(a, (at) => groupMenu(a, g, { at }));
  };
  const item = (g, depth = 0) => link(g, `si${depth ? ' sub' : ''}`,
    depth ? null : dot(T.colourOf(idx, g.id)),
    el('span', { class: 'nm' }, T.nameOf(g)),
    el('span', { class: 'n', 'aria-label': 'open jobs' }, String(T.openJobCount(idx, g.id) || '')));
  const withDepth = (n, depth) => { if (depth) n.style.setProperty('--depth', depth); return n; };

  const subs = (g, depth) => {
    if (!open.has(g.id)) return [];
    const out = [];
    for (const c of T.childrenOf(idx, g.id)) {
      if (!T.isGroupLike(c)) continue;
      out.push(withDepth(item(c, depth), depth));
      out.push(...subs(c, depth + 1));
    }
    return out;
  };

  const masters = T.childrenOf(idx, null).filter(T.isGroupLike);
  for (const m of masters) {
    const cats = T.childrenOf(idx, m.id).filter(T.isGroupLike);
    // A master category is a heading, whether or not it has categories in
    // it yet; with none, its own open count sits on the heading.
    root.append(link(m, 'si master-link', el('span', { class: 'nm' }, T.nameOf(m)),
      cats.length ? null : el('span', { class: 'n' }, String(T.openJobCount(idx, m.id) || ''))));
    for (const c of cats) { root.append(item(c)); root.append(...subs(c, 1)); }
  }
  const loose = T.childrenOf(idx, null).filter((n) => n.kind === T.KIND.task);
  if (loose.length) {
    root.append(el('a', {
      class: 'si', href: routeHref('/tasks', { c: 'top' }), 'aria-current': current === 'top' ? 'page' : null,
      onclick: (e) => { if (e.button === 0 && !e.ctrlKey && !e.metaKey) { e.preventDefault(); revealCategory('top'); } },
    }, dot(null), el('span', { class: 'nm' }, 'Not in a category'),
    el('span', { class: 'n' }, String(loose.filter((n) => n.status !== 'done' && n.status !== 'cancelled').length || ''))));
  }
  if (!masters.length && !loose.length) root.append(el('p', { class: 'side-empty' }, 'No categories yet. Make a master category, or import your TileDo or Excel data.'));

  root.append(el('div', { class: 'side-foot' },
    el('a', { class: 'si', href: routeHref('/archive'), 'aria-current': route.parts[0] === 'archive' ? 'page' : null }, icon('archive', 16), el('span', { class: 'nm' }, 'Archive')),
    lead ? el('a', { class: 'si', href: routeHref('/import'), 'aria-current': route.parts[0] === 'import' ? 'page' : null }, icon('upload', 16), el('span', { class: 'nm' }, 'Import')) : null));

  // The sidebar element lives for the whole session and is redrawn often:
  // its drag listeners go on once.
  if (lead && !root.dataset.dragWired) {
    root.dataset.dragWired = '1';
    enableDrag(root, {
      onDrop: (dragId, targetId, where) => A.moveNextTo(dragId, targetId, where),
      onDropInto: (dragId, groupId) => A.moveInto(dragId, groupId, 'end'),
    });
  }
}
