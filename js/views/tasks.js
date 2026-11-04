// views/tasks.js — Tasks: ONE FULL LIST of the whole tree (decided
// 2026-11-04, after first live use; it supersedes the separate overview and
// category pages of the Tasks brief).
//
// MASTER CATEGORIES are collapsible sections. Inside each, CATEGORIES (and
// sub-categories) sit as category tiles - dot, name, open count, status
// pills, oldest untouched - in the same grid as the JOBS directly in it.
// Expanding a category tile turns it into a full-width section IN PLACE,
// with its own header: chevron, name, count, + Job, + Group, its By status /
// Side by side and Tiles / List switches, and ⋯. Clicking the header folds it
// back into a tile. A category's jobs can fold into one "Jobs in X (n)" tile.
// Done (N) and Cancelled (N) fold at the end of each. Expanded and folded
// state is remembered per device; the first visit shows master categories
// open and their categories as tiles.
//
// Inside a container the open jobs come first, then its categories, each in
// their manual order (they share one order; new jobs sit above sub-groups).
//
// The sidebar is navigation: #/tasks?c=<id> scrolls to the category, expands
// it and its ancestors, and briefly highlights it. A category's ⋯ keeps
// Focus (#/tasks/<id>, the category alone). A job opens in the task panel,
// which is a navigable page of its own (panel.js); the old "Open as page"
// links (#/tasks/<job>) land there.
//
// Everything with a ⋯ also opens that menu on right-click, long-press and
// Shift+F10 (ui.js withMenu). Categories drag like tiles: reorder among
// siblings, or drop onto a category to move inside it.

import { el, icon, iconBtn, btn, pill, dot, menu, prefs, isPhone, withMenu } from '../ui.js';
import { state, node, personName } from '../state.js';
import * as T from '../tree.js';
import * as S from '../status.js';
import * as A from '../actions.js';
import { ageDays } from '../dates.js';
import { tile, row, band, enableDrag, backlogDays } from './tile.js';
import { go, route, routeHref } from '../router.js';
import { promptDialog } from '../dialog.js';
import { welcome, errorState } from './home.js';
import { newMasterCategory } from './sidebar.js';

const SORTS = {
  manual: { label: 'Manual' },
  status: { label: 'Status', cmp: (a, b) => S.BAND_ORDER.indexOf(a.status) - S.BAND_ORDER.indexOf(b.status) },
  age: { label: 'Age', cmp: (a, b) => String(a.createdAt).localeCompare(String(b.createdAt)) },
  updated: { label: 'Last update', cmp: (a, b) => String(b.lastActivityAt).localeCompare(String(a.lastActivityAt)) },
  priority: { label: 'Priority', cmp: (a, b) => ({ high: 0, normal: 1, low: 2 }[a.priority] ?? 1) - ({ high: 0, normal: 1, low: 2 }[b.priority] ?? 1) },
  assignee: { label: 'Assignee', cmp: (a, b) => personName(a.assignee).localeCompare(personName(b.assignee)) },
};

/** The header title on a phone. */
export function viewTitle(id) {
  if (!id) return 'Tasks';
  if (id === 'top') return 'Not in a category';
  return T.nameOf(node(id)) || 'Tasks';
}

// ---------------------------------------------------------------------------
// remembered per device: what is expanded, which job lists are folded
// ---------------------------------------------------------------------------

const OPEN_KEY = 'tasks.open';
const FOLD_KEY = 'tasks.jobsFolded';

/** Expanded? Master categories start open, categories start as tiles. */
export function isExpanded(g) {
  const v = prefs.get(OPEN_KEY, {})[g.id];
  return v ?? !g.parentId;
}
function setExpanded(ids, value) {
  const m = prefs.get(OPEN_KEY, {});
  for (const id of ids) m[id] = value;
  prefs.set(OPEN_KEY, m);
}
const jobsFolded = (id) => Boolean(prefs.get(FOLD_KEY, {})[id ?? 'top']);
function setJobsFolded(id, value) {
  const m = prefs.get(FOLD_KEY, {});
  m[id ?? 'top'] = value;
  prefs.set(FOLD_KEY, m);
}
/** Every category in the tree (not the sections inside jobs). */
const allCategories = () => state.idx.nodes.filter((n) => T.isGroupLike(n) && !T.isSection(state.idx, n));

const pageKey = (n) => n?.id ?? 'top';
const viewMode = (n) => prefs.get(`view.${pageKey(n)}`, n?.view ?? 'tiles');
const bandsOn = (n) => prefs.get(`bands.${pageKey(n)}`, true);
const sortOf = (n) => { const s = prefs.get(`sort.${pageKey(n)}`, 'manual'); return SORTS[s] ? s : 'manual'; };
const rerender = () => go(location.hash.replace(/^#/, '').split('?')[0], { keepTask: true });

// ---------------------------------------------------------------------------
// reveal: the sidebar and #/tasks?c=<id>
// ---------------------------------------------------------------------------

let pendingReveal = null;
let lastDeepLink = null;

/**
 * Show a category in the full list: expand it and its ancestors, scroll to
 * it, light it up briefly. The sidebar calls this; a second click on the
 * same item reveals again.
 */
export function revealCategory(id) {
  pendingReveal = id;
  const next = `#/tasks?c=${encodeURIComponent(id)}`;
  if (location.hash === next) rerender();
  else location.hash = next;
}

function takeReveal() {
  let target = pendingReveal;
  pendingReveal = null;
  const c = route.parts[0] === 'tasks' && !route.parts[1] ? (route.query.c ?? null) : null;
  if (!target && c && c !== lastDeepLink) target = c;
  lastDeepLink = c;
  return target;
}

function flash(target, inner) {
  requestAnimationFrame(() => {
    const n = inner.querySelector(`[data-group="${CSS.escape(target)}"]`);
    if (!n) return;
    const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    n.scrollIntoView({ block: 'start', behavior: smooth ? 'smooth' : 'auto' });
    n.classList.add('flash');
    setTimeout(() => n.classList.add('flash-out'), 900);
    setTimeout(() => n.classList.remove('flash', 'flash-out'), 1700);
  });
}

// ---------------------------------------------------------------------------
// routes
// ---------------------------------------------------------------------------

export function renderTasks(root, id) {
  const inner = el('div', { class: 'view-inner' });
  root.append(inner);
  if (state.error && !state.ready) { inner.append(errorState()); return; }
  if (!state.ready) { inner.append(el('div', { class: 'grid', 'aria-busy': 'true', 'aria-label': 'Loading' }, [1, 2, 3, 4].map(() => el('div', { class: 'skel' })))); return; }
  if (!id) return fullList(inner);
  if (id === 'top') return focusPage(inner, null);
  const n = node(id);
  if (!n) {
    inner.append(el('div', { class: 'state-msg' },
      el('h1', { class: 'h1' }, 'Not here any more'),
      el('p', {}, 'It may have been archived, deleted, or moved by an import. The archive keeps what was archived.'),
      el('div', { class: 'row' }, btn('All tasks', () => go('/tasks')), btn('Open the archive', () => go('/archive'), { cls: 'ghost' }))));
    return;
  }
  // A job, a task, a step or a section: the panel shows it, over the list
  // with its category revealed.
  if (!T.isGroupLike(n) || T.isSection(state.idx, n)) {
    const cat = T.ancestorChain(state.idx, n.id).filter((a) => T.isGroupLike(a) && !T.isSection(state.idx, a)).pop();
    location.replace(routeHref('/tasks', cat ? { c: cat.id, t: n.id } : { t: n.id }));
    return;
  }
  return focusPage(inner, n);
}

// ---------------------------------------------------------------------------
// the full list
// ---------------------------------------------------------------------------

function fullList(inner) {
  const { idx } = state;
  if (!idx.nodes.length) { inner.append(welcome()); return; }
  const target = takeReveal();
  if (target && target !== 'top' && node(target)) {
    setExpanded([...T.ancestorChain(idx, target).filter(T.isGroupLike).map((a) => a.id), target], true);
  }
  const masters = T.childrenOf(idx, null).filter(T.isGroupLike);
  const allOpen = T.jobsUnder(idx, null).filter((j) => S.isOpen(j.status)).length;
  // Categories are what sit directly in a master category; sub-groups inside them are not counted again.
  const catCount = masters.reduce((sum, m) => sum + T.childrenOf(idx, m.id).filter(T.isGroupLike).length, 0);
  inner.append(el('div', { class: 'view-head' },
    el('h1', { class: 'h1' }, 'Tasks'),
    el('span', { class: 'meta' }, `${allOpen} open across ${catCount} ${catCount === 1 ? 'category' : 'categories'}`),
    el('span', { class: 'sp' }),
    btn(isPhone() ? 'Collapse' : 'Collapse all', () => { setExpanded(allCategories().map((g) => g.id), false); rerender(); }, { cls: 'sm', ic: 'chevRight', title: 'Fold every category, master categories too' }),
    btn(isPhone() ? 'Expand' : 'Expand all', () => { setExpanded(allCategories().map((g) => g.id), true); rerender(); }, { cls: 'sm', ic: 'chevDown', title: 'Open every category' }),
    state.role === 'lead' ? btn(isPhone() ? 'Master' : 'New master category', newMasterCategory, { cls: 'sm', ic: 'folderPlus', title: 'New master category' }) : null));

  const list = el('div', { class: 'tree' });
  for (const m of masters) list.append(categorySection(m));
  const loose = T.childrenOf(idx, null).filter((n) => n.kind === T.KIND.task);
  if (loose.length) list.append(looseSection(loose));
  inner.append(list);
  wireListDrag(list);
  if (target) flash(target, inner);
}

/** Jobs at the top level, outside every category: shown so they can be filed. */
function looseSection(loose) {
  const open = loose.filter((t) => S.isOpen(t.status)).length;
  return el('section', { class: 'grp master', dataset: { group: 'top' } },
    el('div', { class: 'grp-head' },
      el('h2', { class: 'h2' }, 'Not in a category'),
      el('span', { class: 'meta' }, `${open} open · drag them onto a category, or Move to…`)),
    ...containerBody(null));
}

/** A category (or master) as a full-width section: expanded, or (a master) folded to its header. */
function categorySection(g) {
  const { idx } = state;
  const master = !g.parentId;
  const open = isExpanded(g);
  const cats = T.childrenOf(idx, g.id).filter(T.isGroupLike).length;
  const count = T.openJobCount(idx, g.id);
  const toggle = () => { setExpanded([g.id], !open); rerender(); };
  const head = el('div', {
    class: 'grp-head', dataset: { dropInto: g.id },
    draggable: state.role === 'lead' ? 'true' : null,
    onclick: (e) => { if (!e.target.closest('button, a, input, .seg')) toggle(); },
  },
  el('button', { class: 'ib', type: 'button', 'aria-expanded': String(open), 'aria-label': `${open ? 'Collapse' : 'Expand'} ${T.nameOf(g)}`, onclick: toggle },
    icon(open ? 'chevDown' : 'chevRight', 16)),
  master ? null : dot(T.colourOf(idx, g.id)),
  el('h2', { class: 'h2' }, T.nameOf(g)),
  g.kind === T.KIND.product ? el('span', { class: 'grp-kind' }, 'Product') : null,
  el('span', { class: 'meta' }, master ? `${cats} ${cats === 1 ? 'category' : 'categories'} · ${count} open` : `${count} open`),
  el('span', { class: 'sp' }),
  // A phone keeps the header to one row: + Job, + Group and the switches live in ⋯ there.
  open && !isPhone() ? btn('Job', () => addJob(g.id), { cls: 'sm ghost', ic: 'plus', title: `New job in ${T.nameOf(g)}` }) : null,
  open && !isPhone() && g.kind === T.KIND.group ? btn('Group', () => addGroup(g.id), { cls: 'sm ghost', ic: 'folderPlus', title: `New category inside ${T.nameOf(g)}` }) : null,
  ...(open && !isPhone() ? switches(g, { compact: true }) : []),
  iconBtn('more', `${T.nameOf(g)} actions`, (e) => { e.stopPropagation(); groupMenu(e.currentTarget, g); }, 'sm'));
  withMenu(head, (at) => groupMenu(head.querySelector('.ib[aria-label$="actions"]') ?? head, g, { at }));
  const sec = el('section', {
    class: `grp${master ? ' master' : ''}${open ? '' : ' closed'} span`,
    dataset: { group: g.id, id: g.id }, 'aria-label': T.nameOf(g),
  }, head);
  if (open) sec.append(...containerBody(g));
  return sec;
}

/** A collapsed category, as a tile in its parent's grid. Click to expand in place. */
function categoryTile(g) {
  const { idx } = state;
  const jobs = T.jobsUnder(idx, g.id).filter((j) => S.isOpen(j.status));
  const expand = () => { setExpanded([g.id], true); rerender(); };
  const a = el('article', {
    class: 'card cat-tile', dataset: { id: g.id, dropInto: g.id, group: g.id },
    draggable: state.role === 'lead' ? 'true' : null,
  },
  el('button', { class: 'open-link', type: 'button', 'aria-label': `Expand ${T.nameOf(g)}, ${jobs.length} open`, 'aria-expanded': 'false', onclick: expand }),
  el('div', { class: 'cat-top' },
    dot(T.colourOf(idx, g.id)), el('span', { class: 'nm' }, T.nameOf(g)),
    iconBtn('more', `${T.nameOf(g)} actions`, (e) => { e.stopPropagation(); groupMenu(e.currentTarget, g); }, 'sm')),
  ...countLines(jobs, g.kind === T.KIND.product ? 'Product' : null));
  withMenu(a, (at) => groupMenu(a.querySelector('.ib') ?? a, g, { at }));
  return a;
}

/** "Jobs in Davits (3)": a category's own jobs, folded into one tile. */
function jobsTile(g, open) {
  const name = g ? T.nameOf(g) : 'no category';
  const unfold = () => { setJobsFolded(g?.id, false); rerender(); };
  const a = el('article', { class: 'card cat-tile jobs-tile', dataset: g ? { dropInto: g.id } : {} },
    el('button', { class: 'open-link', type: 'button', 'aria-label': `Show the ${open.length} jobs in ${name}`, onclick: unfold }),
    el('div', { class: 'cat-top' }, icon('tasks', 16), el('span', { class: 'nm' }, `Jobs in ${name} (${open.length})`)),
    ...countLines(open));
  withMenu(a, (at) => menu(a, [{ label: 'Show the jobs as tiles', icon: 'grid', onSelect: unfold }], { label: 'Jobs', at }));
  return a;
}

/** The open count, status pills and oldest-untouched line a category or jobs tile shows. */
function countLines(jobs, kindWord = null) {
  const counts = {};
  for (const j of jobs) counts[j.status] = (counts[j.status] ?? 0) + 1;
  const words = { in_progress: 'in progress', fix: 'fix', check: 'for check', waiting: 'waiting', todo: 'to do' };
  const pills = S.BAND_ORDER.filter((s) => counts[s]).map((s) => pill(s, { label: `${counts[s]} ${words[s]}` }));
  const todo = jobs.filter((j) => j.status === 'todo');
  const oldest = todo.length ? Math.max(...todo.map((j) => ageDays(j.lastActivityAt))) : null;
  return [
    el('div', { class: 'pills' }, kindWord ? el('span', { class: 'grp-kind' }, kindWord) : null,
      el('span', { class: 'meta' }, jobs.length ? `${jobs.length} open` : 'Nothing open'), ...pills),
    oldest ? el('div', { class: `meta foot${oldest >= backlogDays() ? ' warn' : ''}` }, `Oldest untouched ${oldest}d`) : null,
  ];
}

/**
 * What a category (or the top level) holds: its open jobs (tiles in status
 * bands or side by side, a list, or folded into one tile), then its
 * categories as tiles or expanded sections, in one grid; then Done and
 * Cancelled folded away.
 */
function containerBody(g) {
  const { idx } = state;
  const kids = T.childrenOf(idx, g?.id ?? null).filter((k) => k.kind !== T.KIND.step);
  const jobs = kids.filter((k) => k.kind === T.KIND.task);
  const cats = g ? kids.filter(T.isGroupLike) : [];
  const open = jobs.filter((t) => S.isOpen(t.status));
  const sort = sortOf(g);
  const out = [];
  const grid = el('div', { class: 'grid' });
  let shownJobTiles = false;

  if (open.length) {
    if (jobsFolded(g?.id)) grid.append(jobsTile(g, open));
    else {
      const ordered = sort === 'manual' ? (bandsOn(g) ? S.BAND_ORDER.flatMap((s) => open.filter((t) => t.status === s)) : S.BAND_ORDER.flatMap((s) => open.filter((t) => t.status === s)))
        : [...open].sort(SORTS[sort].cmp);
      const opts = { assignee: true, drag: sort === 'manual' };
      if (sort !== 'manual') {
        grid.append(el('div', { class: 'sort-note span' }, `Jobs sorted by ${SORTS[sort].label.toLowerCase()}; dragging them is paused.`,
          el('button', { type: 'button', onclick: () => { prefs.set(`sort.${pageKey(g)}`, 'manual'); rerender(); } }, 'Back to manual order')));
      }
      if (viewMode(g) === 'list') {
        const rows = el('div', { class: 'rows span' });
        let last = null;
        for (const t of ordered) {
          if (sort === 'manual' && bandsOn(g) && t.status !== last) {
            rows.append(el('div', { class: 'trow band-row' }, el('span', { class: 'lbl' }, S.LABEL[t.status]), el('span', {}), el('span', { class: 'meta' }, String(ordered.filter((x) => x.status === t.status).length))));
            last = t.status;
          }
          rows.append(row(t, opts));
        }
        grid.append(rows);
      } else {
        let last = null;
        for (const t of ordered) {
          if (sort === 'manual' && bandsOn(g) && t.status !== last) { grid.append(band(t.status, ordered.filter((x) => x.status === t.status).length)); last = t.status; }
          grid.append(tile(t, opts));
          shownJobTiles = true;
        }
      }
    }
  }
  if (cats.length) {
    // With jobs in status bands above, the categories get their own divider, so a tile under "To do" is not read as to do.
    if (shownJobTiles && sort === 'manual' && bandsOn(g)) grid.append(el('div', { class: 'band' }, el('span', { class: 'lbl' }, 'Categories'), el('span', { class: 'meta' }, String(cats.length))));
    for (const c of cats) grid.append(isExpanded(c) ? categorySection(c) : categoryTile(c));
  }
  if (grid.childNodes.length) out.push(grid);

  const doneOnly = jobs.filter((t) => t.status === 'done');
  const cancelled = jobs.filter((t) => t.status === 'cancelled');
  if (doneOnly.length) out.push(doneFold(g?.id ?? null, doneOnly, g, 'done'));
  if (cancelled.length) out.push(doneFold(g?.id ?? null, cancelled, g, 'cancelled'));
  if (!out.length) {
    out.push(el('div', { class: 'empty' }, el('span', {}, g ? 'Nothing in here yet.' : 'No jobs here.'),
      g ? btn('Job', () => addJob(g.id), { cls: 'sm', ic: 'plus' }) : null,
      g && g.kind === T.KIND.group ? btn('Group', () => addGroup(g.id), { cls: 'sm', ic: 'folderPlus' }) : null));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Focus: one category alone (and the jobs not in any category)
// ---------------------------------------------------------------------------

function crumbs(n) {
  const chain = n ? T.ancestorChain(state.idx, n.id) : [];
  return el('nav', { class: 'crumbs', 'aria-label': 'Breadcrumb' },
    el('a', { href: routeHref('/tasks') }, 'Tasks'),
    chain.flatMap((a) => [el('span', { 'aria-hidden': 'true' }, '›'),
      el('a', { href: routeHref('/tasks', { c: a.id }) }, T.nameOf(a))]));
}

function focusPage(inner, g) {
  const { idx } = state;
  const colour = g ? T.colourOf(idx, g.id) : null;
  const open = g ? T.openJobCount(idx, g.id) : T.childrenOf(idx, null).filter((c) => c.kind === T.KIND.task && S.isOpen(c.status)).length;
  inner.append(el('div', { class: 'sec', style: { gap: '10px' } },
    crumbs(g),
    el('div', { class: 'view-head' },
      // The dot rides inside the heading, so a long name wraps with it rather than leaving it alone on a line.
      el('h1', { class: 'h1 with-dot' }, g ? dot(colour, true) : null, g ? T.nameOf(g) : 'Not in a category'),
      g?.kind === T.KIND.product ? el('span', { class: 'grp-kind' }, 'Product') : null,
      el('span', { class: 'meta' }, `${open} open`),
      el('span', { class: 'sp' }),
      btn('Back to the full list', () => (g ? revealCategory(g.id) : go('/tasks')), { cls: 'sm ghost', ic: 'back' }),
      btn('Job', () => addJob(g?.id ?? null), { cls: 'sm', ic: 'plus', title: 'New job here (N)' }),
      g && g.kind === T.KIND.group ? btn('Group', () => addGroup(g.id), { cls: 'sm', ic: 'folderPlus', title: 'New group inside this one' }) : null,
      ...switches(g),
      g ? iconBtn('more', `${T.nameOf(g)} actions`, (e) => groupMenu(e.currentTarget, g, { focus: true })) : null)));
  const body = el('div', { class: 'sec tree' });
  body.append(...containerBody(g));
  inner.append(body);
  wireListDrag(body);
}

// ---------------------------------------------------------------------------
// the switches and menus
// ---------------------------------------------------------------------------

function switches(n, { compact = false } = {}) {
  const mode = viewMode(n);
  const bands = bandsOn(n);
  const sort = sortOf(n);
  const set = (key, v) => { prefs.set(`${key}.${pageKey(n)}`, v); rerender(); };
  const seg = (label, pairs) => el('div', { class: 'seg', role: 'group', 'aria-label': label }, pairs.map(([text, on, fn, ic]) =>
    el('button', { type: 'button', 'aria-pressed': String(on), onclick: (e) => { e.stopPropagation(); fn(); }, title: text }, ic ? icon(ic, 14) : null, el('span', {}, text))));
  // A phone (or a section header) has room for one row of controls: the
  // switches fold into one View menu with the same choices.
  if (isPhone()) {
    return [btn('View', (e) => { e.stopPropagation(); menu(e.currentTarget, [
      { heading: 'Sort jobs' },
      ...Object.entries(SORTS).map(([k, v]) => ({ label: v.label, checked: k === sort, onSelect: () => set('sort', k) })),
      ...(sort === 'manual' ? [{ heading: 'Status' },
        { label: 'By status', checked: bands, onSelect: () => set('bands', true) },
        { label: 'Side by side', checked: !bands, onSelect: () => set('bands', false) }] : []),
      { heading: 'Show as' },
      { label: 'Tiles', checked: mode === 'tiles', onSelect: () => set('view', 'tiles') },
      { label: 'List', checked: mode === 'list', onSelect: () => set('view', 'list') },
    ], { label: 'View' }); }, { cls: 'sm', ic: 'sort' })];
  }
  return [
    compact ? null : btn(`Sort: ${SORTS[sort].label}`, (e) => menu(e.currentTarget, Object.entries(SORTS).map(([k, v]) => ({
      label: v.label, checked: k === sort, onSelect: () => set('sort', k),
    })), { label: 'Sort' }), { cls: 'sm', ic: 'sort' }),
    sort === 'manual' ? seg('Status layout', [
      ['By status', bands, () => set('bands', true)],
      ['Side by side', !bands, () => set('bands', false)],
    ]) : null,
    seg('View', [
      ['Tiles', mode === 'tiles', () => set('view', 'tiles'), 'grid'],
      ['List', mode === 'list', () => set('view', 'list'), 'list'],
    ]),
  ];
}

async function addJob(parentId) {
  const { openQuickAdd } = await import('./quick-add.js');
  openQuickAdd({ parentId });
}

async function addGroup(parentId, { kind = T.KIND.group } = {}) {
  const parent = parentId ? node(parentId) : null;
  const inJob = parent && (parent.kind === T.KIND.task || T.isSection(state.idx, parent));
  const what = kind === T.KIND.product ? 'product' : inJob ? 'section' : parent ? 'category' : 'master category';
  const name = await promptDialog({
    title: `New ${what}`, label: 'Name', ok: 'Add',
    placeholder: kind === T.KIND.product ? 'e.g. Model 450' : inJob ? 'e.g. Laser' : 'e.g. Davits',
    body: kind === T.KIND.product ? 'A product holds its jobs, one per revision. The Progress page (later) reads its steps.' : '',
  });
  if (name) {
    const id = A.createGroup({ name, parentId, kind });
    if (id && parentId) setExpanded([parentId], true);
  }
}

/** The category ⋯ menu. The same menu opens on right-click and long-press. */
export function groupMenu(anchor, g, { at = null, focus = false } = {}) {
  const lead = state.role === 'lead';
  const isTop = !g.parentId;
  const isCat = !T.isSection(state.idx, g);
  const sort = sortOf(g);
  const hasJobs = T.childrenOf(state.idx, g.id).some((c) => c.kind === T.KIND.task && S.isOpen(c.status));
  menu(anchor, [
    !focus && isCat ? (isExpanded(g)
      ? { label: 'Collapse', icon: 'chevRight', onSelect: () => { setExpanded([g.id], false); rerender(); } }
      : { label: 'Expand', icon: 'chevDown', onSelect: () => { setExpanded([g.id], true); rerender(); } }) : null,
    !focus ? { label: 'Focus: show it alone', icon: 'page', onSelect: () => go(`/tasks/${g.id}`) } : { label: 'Show it in the full list', icon: 'back', onSelect: () => revealCategory(g.id) },
    { label: 'New job here', icon: 'plus', onSelect: () => addJob(g.id) },
    g.kind === T.KIND.group ? { label: 'New category inside', icon: 'folderPlus', onSelect: () => addGroup(g.id) } : null,
    hasJobs ? (jobsFolded(g.id)
      ? { label: 'Show the jobs as tiles', icon: 'grid', onSelect: () => { setJobsFolded(g.id, false); rerender(); } }
      : { label: 'Fold the jobs into one tile', icon: 'tasks', onSelect: () => { setJobsFolded(g.id, true); rerender(); } }) : null,
    'sep',
    { heading: 'Sort jobs' },
    ...Object.entries(SORTS).map(([k, v]) => ({ label: v.label, checked: k === sort, onSelect: () => { prefs.set(`sort.${pageKey(g)}`, k); rerender(); } })),
    ...(isPhone() ? [
      { heading: 'Status' },
      { label: 'By status', checked: bandsOn(g), onSelect: () => { prefs.set(`bands.${pageKey(g)}`, true); rerender(); } },
      { label: 'Side by side', checked: !bandsOn(g), onSelect: () => { prefs.set(`bands.${pageKey(g)}`, false); rerender(); } },
      { heading: 'Show jobs as' },
      { label: 'Tiles', checked: viewMode(g) === 'tiles', onSelect: () => { prefs.set(`view.${pageKey(g)}`, 'tiles'); rerender(); } },
      { label: 'List', checked: viewMode(g) === 'list', onSelect: () => { prefs.set(`view.${pageKey(g)}`, 'list'); rerender(); } },
    ] : []),
    'sep',
    { label: 'Rename', icon: 'edit', onSelect: () => A.rename(g.id) },
    isCat && g.kind === T.KIND.group ? { label: 'Colour…', icon: 'grid', onSelect: () => colourMenu(anchor, g) } : null,
    isCat ? { label: 'Steps template…', icon: 'tasks', onSelect: () => editTemplate(g) } : null,
    lead && isCat && g.kind === T.KIND.group && !isTop ? { label: 'Add a product', icon: 'plus', onSelect: () => addGroup(g.id, { kind: T.KIND.product }) } : null,
    lead && isCat && g.kind === T.KIND.group ? { label: 'Turn into a job', icon: 'restore', onSelect: () => A.turnIntoJob(g.id) } : null,
    { label: 'Move to…', icon: 'move', onSelect: async () => (await import('./pickers.js')).moveDialog(g.id) },
    'sep',
    { label: 'Archive', icon: 'archive', onSelect: () => A.archive(g.id) },
    { label: 'Delete…', icon: 'trash', danger: true, onSelect: async () => { if (await A.remove(g.id) && focus) go('/tasks'); } },
  ], { label: `${T.nameOf(g)} actions`, at });
}

function colourMenu(anchor, g) {
  menu(anchor, [
    { heading: 'Colour' },
    { label: 'No colour', checked: !g.colour, node: el('span', { class: 'row' }, dot(null), 'No colour'), onSelect: () => A.updateFields(g.id, { colour: null }) },
    ...Array.from({ length: 10 }, (_, i) => i + 1).map((c) => ({
      label: `Colour ${c}`, checked: g.colour === c, node: el('span', { class: 'row' }, dot(c, true), `Colour ${c}`),
      onSelect: () => A.updateFields(g.id, { colour: c }),
    })),
  ], { label: 'Colour' });
}

async function editTemplate(g) {
  const v = await promptDialog({
    title: `Steps template for ${T.nameOf(g)}`,
    label: 'One step a line; indent two spaces for sub-steps',
    value: T.templateToText(g.stepsTemplate ?? []),
    placeholder: 'Concept\n3D model\n  Body\n  Head\nDrawings\nLaser\nBuild form',
    multiline: true, required: false, ok: 'Save template',
    body: 'New jobs in this category, and in the groups inside it, start with these steps. Existing jobs are not changed.',
  });
  if (v === null) return;
  A.updateFields(g.id, { stepsTemplate: v.trim() ? T.templateFromText(v) : null }, { message: v.trim() ? 'Template saved' : 'Template removed' });
}

/** Drag in the full list (and Focus): jobs and categories alike. */
function wireListDrag(list) {
  enableDrag(list, {
    onDrop: (dragId, targetId, where) => A.moveNextTo(dragId, targetId, where),
    onDropInto: (dragId, groupId) => { A.moveInto(dragId, groupId); setExpanded([groupId], true); },
  });
}

/** A collapsed strip of finished work: `kind` is 'done' or 'cancelled', each with its own count and archive-all. */
function doneFold(parentId, done, page, kind = 'done') {
  const key = `${kind}.${parentId ?? 'top'}`;
  const openFold = prefs.get(key, false);
  const allKey = `${kind}All.${parentId ?? 'top'}`;
  const all = prefs.get(allKey, false);
  const when = (t) => String((kind === 'cancelled' ? t.cancelled?.at : t.doneAt) ?? t.updatedAt);
  const sorted = [...done].sort((a, b) => when(b).localeCompare(when(a)));
  const word = kind === 'cancelled' ? 'Cancelled' : 'Done';
  const wrap = el('div', { class: 'done-fold' },
    el('div', { class: 'row' },
      btn(`${word} ${done.length}`, () => { prefs.set(key, !openFold); rerender(); }, { cls: 'sm ghost', ic: openFold ? 'chevDown' : 'chevRight', attrs: { 'aria-expanded': String(openFold) } }),
      el('span', { class: 'sp' }),
      btn(`Archive all ${word.toLowerCase()}`, () => A.archive(done.map((d) => d.id)), { cls: 'sm ghost', ic: 'archive' })));
  if (openFold) {
    const shown = all ? sorted : sorted.slice(0, 4);
    const mode = viewMode(page);
    if (mode === 'list') wrap.append(el('div', { class: 'rows' }, shown.map((t) => row(t, { assignee: true, drag: false }))));
    else wrap.append(el('div', { class: 'grid' }, shown.map((t) => tile(t, { assignee: true, drag: false, menuExtra: [{ label: 'Archive', icon: 'archive', onSelect: () => A.archive(t.id) }] }))));
    if (sorted.length > 4) wrap.append(el('div', { class: 'more-row' }, btn(all ? 'Show fewer' : `Show all ${sorted.length}`, () => { prefs.set(allKey, !all); rerender(); }, { cls: 'ghost sm' })));
  }
  return wrap;
}
