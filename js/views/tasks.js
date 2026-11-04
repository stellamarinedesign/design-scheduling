// views/tasks.js — the full list (Tasks brief, 2026-11-04).
//
// OVERVIEW (#/tasks): each master category is a collapsible section of
// category cards: dot, name, open count, status pills, oldest untouched age.
//
// A CATEGORY PAGE (#/tasks/<id>): the children in their manual order. Runs of
// jobs render as tiles in STATUS BANDS (In progress → Fix → Ready for check →
// Waiting → To do), or side by side in that order (the switch, 2026-11-04);
// each sub-group is a collapsible section at its place in the order; Done (N)
// folds at the end of each group. Tiles or list is remembered per group, as
// in TileDo. Sort applies within each group and pauses dragging.
//
// A JOB OPENED AS A PAGE renders the same way: its steps, its sections, its
// tasks as tiles or a list.

import { el, icon, iconBtn, btn, pill, dot, menu, prefs, isPhone } from '../ui.js';
import { state, node, personName } from '../state.js';
import * as T from '../tree.js';
import * as S from '../status.js';
import * as A from '../actions.js';
import { ageDays } from '../dates.js';
import { tile, row, band, enableDrag, statusMenu, taskMenu, backlogDays } from './tile.js';
import { go, routeHref, openTask } from '../router.js';
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

export function renderTasks(root, id) {
  const inner = el('div', { class: 'view-inner' });
  root.append(inner);
  if (state.error && !state.ready) { inner.append(errorState()); return; }
  if (!state.ready) { inner.append(el('div', { class: 'grid', 'aria-busy': 'true', 'aria-label': 'Loading' }, [1, 2, 3, 4].map(() => el('div', { class: 'skel' })))); return; }
  if (!id) return overview(inner);
  if (id === 'top') return groupPage(inner, null);
  const n = node(id);
  if (!n) {
    inner.append(el('div', { class: 'state-msg' },
      el('h1', { class: 'h1' }, 'Not here any more'),
      el('p', {}, 'It may have been archived, deleted, or moved by an import. The archive keeps what was archived.'),
      el('div', { class: 'row' }, btn('All tasks', () => go('/tasks')), btn('Open the archive', () => go('/archive'), { cls: 'ghost' }))));
    return;
  }
  if (n.kind === T.KIND.task) return jobPage(inner, n);
  if (n.kind === T.KIND.step) { openTask(T.jobOf(state.idx, n.id)?.id ?? n.parentId); return; }
  return groupPage(inner, n);
}

// ---------------------------------------------------------------------------
// overview
// ---------------------------------------------------------------------------

function overview(inner) {
  const { idx } = state;
  if (!idx.nodes.length) { inner.append(welcome()); return; }
  const masters = T.childrenOf(idx, null).filter(T.isGroupLike);
  const allOpen = T.jobsUnder(idx, null).filter((j) => S.isOpen(j.status)).length;
  const catCount = idx.nodes.filter((n) => T.isGroupLike(n) && n.parentId && !T.isSection(idx, n)).length;
  inner.append(el('div', { class: 'view-head' },
    el('h1', { class: 'h1' }, 'Tasks'),
    el('span', { class: 'meta' }, `${allOpen} open across ${catCount} ${catCount === 1 ? 'category' : 'categories'}`),
    el('span', { class: 'sp' }),
    state.role === 'lead' ? btn('New master category', newMasterCategory, { ic: 'folderPlus' }) : null));

  masters.forEach((m, i) => {
    const key = `col.overview.${m.id}`;
    const closed = prefs.get(key, isPhone() && i > 0);
    const cats = T.childrenOf(idx, m.id).filter(T.isGroupLike);
    const direct = T.childrenOf(idx, m.id).filter((c) => c.kind === T.KIND.task);
    const open = T.openJobCount(idx, m.id);
    const sec = el('section', { class: 'sec' },
      el('div', { class: 'master-head' },
        el('button', {
          class: 'ib', type: 'button', 'aria-expanded': String(!closed), 'aria-label': `${closed ? 'Expand' : 'Collapse'} ${m.name}`,
          onclick: () => { prefs.set(key, !closed); go('/tasks'); },
        }, icon(closed ? 'chevRight' : 'chevDown', 16)),
        el('h2', { class: 'h2' }, el('a', { href: routeHref(`/tasks/${m.id}`) }, m.name)),
        el('span', { class: 'meta' }, `${cats.length} ${cats.length === 1 ? 'category' : 'categories'} · ${open} open`)));
    if (!closed) {
      const grid = el('div', { class: 'cards' });
      for (const c of cats) grid.append(card(c));
      if (direct.length) grid.append(card(m, { label: `Jobs directly in ${m.name}`, onlyDirect: true }));
      if (!cats.length && !direct.length) {
        grid.append(el('div', { class: 'empty' }, 'Empty.', btn('Open it', () => go(`/tasks/${m.id}`), { cls: 'sm' })));
      }
      sec.append(grid);
    }
    inner.append(sec);
  });

  const loose = T.childrenOf(idx, null).filter((n) => n.kind === T.KIND.task);
  if (loose.length) {
    const open = loose.filter((t) => S.isOpen(t.status));
    inner.append(el('section', { class: 'sec' },
      el('div', { class: 'master-head' },
        el('h2', { class: 'h2' }, el('a', { href: routeHref('/tasks/top') }, 'Not in a category')),
        el('span', { class: 'meta' }, `${open.length} open · use Move to… to file them`)),
      el('div', { class: 'grid' }, open.slice(0, 8).map((t) => tile(t)))));
  }
}

function card(g, { label = null, onlyDirect = false } = {}) {
  const { idx } = state;
  const jobs = (onlyDirect ? T.childrenOf(idx, g.id).filter((c) => c.kind === T.KIND.task) : T.jobsUnder(idx, g.id)).filter((j) => S.isOpen(j.status));
  const counts = {};
  for (const j of jobs) counts[j.status] = (counts[j.status] ?? 0) + 1;
  const words = { in_progress: 'in progress', fix: 'fix', check: 'for check', waiting: 'waiting', todo: 'to do' };
  const pills = S.BAND_ORDER.filter((s) => counts[s]).map((s) => pill(s, { label: `${counts[s]} ${words[s]}` }));
  const todo = jobs.filter((j) => j.status === 'todo');
  const oldest = todo.length ? Math.max(...todo.map((j) => ageDays(j.lastActivityAt))) : null;
  return el('a', { class: 'card', href: routeHref(`/tasks/${g.id}`) },
    el('div', { class: 'row' }, dot(T.colourOf(idx, g.id)), el('span', { class: 'nm' }, label ?? T.nameOf(g)), el('span', { class: 'sp' }), el('span', { class: 'meta' }, `${jobs.length} open`)),
    pills.length ? el('div', { class: 'pills' }, pills) : el('div', { class: 'meta' }, jobs.length ? '' : 'Nothing open'),
    oldest ? el('div', { class: `meta foot${oldest >= backlogDays() ? ' warn' : ''}` }, `Oldest untouched ${oldest}d`) : null);
}

// ---------------------------------------------------------------------------
// a category page (or the top level, for jobs not in a category)
// ---------------------------------------------------------------------------

const pageKey = (n) => n?.id ?? 'top';
const viewMode = (n) => prefs.get(`view.${pageKey(n)}`, n?.view ?? 'tiles');
const bandsOn = (n) => prefs.get(`bands.${pageKey(n)}`, true);
const sortOf = (n) => { const s = prefs.get(`sort.${pageKey(n)}`, 'manual'); return SORTS[s] ? s : 'manual'; };
const rerender = () => go(location.hash.replace(/^#/, '').split('?')[0], { keepTask: true });

function crumbs(n) {
  const chain = n ? T.ancestorChain(state.idx, n.id) : [];
  return el('nav', { class: 'crumbs', 'aria-label': 'Breadcrumb' },
    el('a', { href: routeHref('/tasks') }, 'Tasks'),
    chain.flatMap((a) => [el('span', { 'aria-hidden': 'true' }, '›'), el('a', { href: routeHref(`/tasks/${a.id}`) }, T.nameOf(a))]));
}

function switches(n) {
  const mode = viewMode(n);
  const bands = bandsOn(n);
  const sort = sortOf(n);
  const seg = (label, pairs) => el('div', { class: 'seg', role: 'group', 'aria-label': label }, pairs.map(([text, on, fn, ic]) =>
    el('button', { type: 'button', 'aria-pressed': String(on), onclick: fn, title: text }, ic ? icon(ic, 14) : null, el('span', {}, text))));
  const set = (key, v) => { prefs.set(`${key}.${pageKey(n)}`, v); rerender(); };
  // A phone has room for one row of controls: the three switches fold into
  // one View menu with the same choices.
  if (isPhone()) {
    return [btn('View', (e) => menu(e.currentTarget, [
      { heading: 'Sort' },
      ...Object.entries(SORTS).map(([k, v]) => ({ label: v.label, checked: k === sort, onSelect: () => set('sort', k) })),
      ...(sort === 'manual' ? [{ heading: 'Status' },
        { label: 'By status', checked: bands, onSelect: () => set('bands', true) },
        { label: 'Side by side', checked: !bands, onSelect: () => set('bands', false) }] : []),
      { heading: 'Show as' },
      { label: 'Tiles', checked: mode === 'tiles', onSelect: () => set('view', 'tiles') },
      { label: 'List', checked: mode === 'list', onSelect: () => set('view', 'list') },
    ], { label: 'View' }), { cls: 'sm', ic: 'sort' })];
  }
  return [
    btn(`Sort: ${SORTS[sort].label}`, (e) => menu(e.currentTarget, Object.entries(SORTS).map(([k, v]) => ({
      label: v.label, checked: k === sort, onSelect: () => { prefs.set(`sort.${pageKey(n)}`, k); rerender(); },
    })), { label: 'Sort' }), { cls: 'sm', ic: 'sort' }),
    sort === 'manual' ? seg('Status layout', [
      ['By status', bands, () => { prefs.set(`bands.${pageKey(n)}`, true); rerender(); }],
      ['Side by side', !bands, () => { prefs.set(`bands.${pageKey(n)}`, false); rerender(); }],
    ]) : null,
    seg('View', [
      ['Tiles', mode === 'tiles', () => { prefs.set(`view.${pageKey(n)}`, 'tiles'); rerender(); }, 'grid'],
      ['List', mode === 'list', () => { prefs.set(`view.${pageKey(n)}`, 'list'); rerender(); }, 'list'],
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
  if (name) A.createGroup({ name, parentId, kind });
}

function groupMenu(anchor, g) {
  const isTop = !g.parentId;
  const isCat = !T.isSection(state.idx, g);
  menu(anchor, [
    { label: 'Rename', icon: 'edit', onSelect: () => A.rename(g.id) },
    isCat && g.kind === T.KIND.group ? { label: 'Colour…', icon: 'grid', onSelect: () => colourMenu(anchor, g) } : null,
    isCat ? { label: 'Steps template…', icon: 'tasks', onSelect: () => editTemplate(g) } : null,
    isCat && g.kind === T.KIND.group && !isTop ? { label: 'Add a product', icon: 'plus', onSelect: () => addGroup(g.id, { kind: T.KIND.product }) } : null,
    { label: 'Move to…', icon: 'move', onSelect: async () => (await import('./pickers.js')).moveDialog(g.id) },
    'sep',
    { label: 'Archive', icon: 'archive', onSelect: () => A.archive(g.id) },
    { label: 'Delete…', icon: 'trash', danger: true, onSelect: async () => { if (await A.remove(g.id)) go('/tasks'); } },
  ], { label: `${T.nameOf(g)} actions` });
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

function groupPage(inner, g) {
  const { idx } = state;
  const colour = g ? T.colourOf(idx, g.id) : null;
  const open = g ? T.openJobCount(idx, g.id) : T.childrenOf(idx, null).filter((c) => c.kind === T.KIND.task && S.isOpen(c.status)).length;
  const kindWord = g?.kind === T.KIND.product ? 'Product' : null;
  inner.append(el('div', { class: 'sec', style: { gap: '10px' } },
    crumbs(g),
    el('div', { class: 'view-head' },
      // The dot rides inside the heading, so a long name wraps with it rather than leaving it alone on a line.
      el('h1', { class: 'h1 with-dot' }, g ? dot(colour, true) : null, g ? T.nameOf(g) : 'Not in a category'),
      kindWord ? el('span', { class: 'grp-kind' }, kindWord) : null,
      el('span', { class: 'meta' }, `${open} open`),
      el('span', { class: 'sp' }),
      btn('Job', () => addJob(g?.id ?? null), { cls: 'sm', ic: 'plus', title: 'New job here (N)' }),
      g && g.kind === T.KIND.group ? btn('Group', () => addGroup(g.id), { cls: 'sm', ic: 'folderPlus', title: 'New group inside this one' }) : null,
      ...switches(g),
      g ? iconBtn('more', `${T.nameOf(g)} actions`, (e) => groupMenu(e.currentTarget, g)) : null)));
  const body = el('div', { class: 'sec' });
  body.append(...children(g?.id ?? null, 0, g, { tasksOnly: !g }));
  inner.append(body);
  wireDrag(body, g);
}

// ---------------------------------------------------------------------------
// a job, opened as a page
// ---------------------------------------------------------------------------

function jobPage(inner, j) {
  const { idx } = state;
  const prog = T.progress(idx, j.id);
  inner.append(el('div', { class: 'sec', style: { gap: '10px' } },
    crumbs(j),
    el('div', { class: 'view-head' },
      pill(j.status, { onClick: (e) => statusMenu(e.currentTarget, j) }),
      el('h1', { class: 'h1 plain' }, j.title),
      prog.total ? el('span', { class: 'meta' }, `${prog.done}/${prog.total}`) : null,
      el('span', { class: 'sp' }),
      btn('Details', () => openTask(j.id), { cls: 'sm', ic: 'open', title: 'Brief, steps, folders and updates' }),
      btn('Task', () => addJob(j.id), { cls: 'sm', ic: 'plus' }),
      btn('Section', () => addGroup(j.id), { cls: 'sm', ic: 'folderPlus' }),
      ...switches(j),
      iconBtn('more', `${j.title} actions`, (e) => taskMenu(e.currentTarget, j)))));
  const body = el('div', { class: 'sec' });
  const kids = children(j.id, 0, j, {});
  const hasSteps = T.childrenOf(idx, j.id).some((c) => c.kind === T.KIND.step);
  if (hasSteps) {
    body.append(el('div', { class: 'empty' }, el('span', {}, `${prog.done} of ${prog.total} steps and tasks done. `), btn('Open the steps', () => openTask(j.id), { cls: 'sm' })));
  }
  body.append(...kids);
  inner.append(body);
  wireDrag(body, j);
}

// ---------------------------------------------------------------------------
// the body: runs of tasks, sub-groups as sections, Done folded at the end
// ---------------------------------------------------------------------------

function children(parentId, depth, page, { tasksOnly = false } = {}) {
  const { idx } = state;
  const sort = sortOf(page);
  const kids = T.childrenOf(idx, parentId).filter((k) => k.kind !== T.KIND.step && (!tasksOnly || k.kind === T.KIND.task));
  const out = [];
  const done = [];
  let run = [];
  const flush = () => { if (run.length) out.push(renderRun(run, page)); run = []; };
  if (sort !== 'manual') {
    const tasks = kids.filter((k) => k.kind === T.KIND.task);
    const live = tasks.filter((t) => S.isOpen(t.status)).sort(SORTS[sort].cmp);
    done.push(...tasks.filter((t) => !S.isOpen(t.status)));
    if (live.length) out.push(renderRun(live, page, { flat: true }));
    for (const k of kids) if (T.isGroupLike(k)) out.push(section(k, depth, page));
  } else {
    for (const k of kids) {
      if (k.kind === T.KIND.task) { if (S.isOpen(k.status)) run.push(k); else done.push(k); }
      else if (T.isGroupLike(k)) { flush(); out.push(section(k, depth, page)); }
    }
    flush();
  }
  if (sort !== 'manual' && depth === 0) {
    out.unshift(el('div', { class: 'sort-note' }, `Sorted by ${SORTS[sort].label.toLowerCase()}; dragging is paused.`,
      el('button', { type: 'button', onclick: () => { prefs.set(`sort.${pageKey(page)}`, 'manual'); rerender(); } }, 'Back to manual order')));
  }
  // Finished work folds away at the end: Done, then Cancelled in its own strip, never mixed.
  const doneOnly = done.filter((t) => t.status === 'done');
  const cancelled = done.filter((t) => t.status === 'cancelled');
  if (doneOnly.length) out.push(doneFold(parentId, doneOnly, page, 'done'));
  if (cancelled.length) out.push(doneFold(parentId, cancelled, page, 'cancelled'));
  if (!out.length || (out.length === 1 && out[0].classList.contains('sort-note'))) {
    const p = parentId ? node(parentId) : null;
    const isJob = p?.kind === T.KIND.task;
    out.push(el('div', { class: 'empty' },
      el('span', {}, isJob ? 'No tasks here.' : 'No jobs here yet.'),
      btn(isJob ? 'Task' : 'Job', () => addJob(parentId), { cls: 'sm', ic: 'plus' })));
  }
  return out;
}

function renderRun(list, page, { flat = false } = {}) {
  const mode = viewMode(page);
  const bands = !flat && bandsOn(page);
  const ordered = flat ? list : S.BAND_ORDER.flatMap((s) => list.filter((t) => t.status === s));
  // While sorted, dragging is paused: no grab affordance either.
  const opts = { assignee: true, drag: sortOf(page) === 'manual' };
  if (mode === 'list') {
    const rows = el('div', { class: 'rows' });
    let last = null;
    for (const t of ordered) {
      if (bands && t.status !== last) {
        rows.append(el('div', { class: 'trow band-row' }, el('span', { class: 'lbl' }, S.LABEL[t.status]), el('span', {}), el('span', { class: 'meta' }, String(ordered.filter((x) => x.status === t.status).length))));
        last = t.status;
      }
      rows.append(row(t, opts));
    }
    return rows;
  }
  const grid = el('div', { class: 'grid' });
  let last = null;
  for (const t of ordered) {
    if (bands && t.status !== last) { grid.append(band(t.status, ordered.filter((x) => x.status === t.status).length)); last = t.status; }
    grid.append(tile(t, opts));
  }
  return grid;
}

function section(g, depth, page) {
  const { idx } = state;
  const key = `col.${g.id}`;
  const firstOnPhone = isPhone() && T.childrenOf(idx, g.parentId).filter(T.isGroupLike)[0]?.id !== g.id;
  const empty = !T.childrenOf(idx, g.id).some((c) => c.kind !== T.KIND.step);
  const closed = prefs.get(key, empty || firstOnPhone);
  // A category counts its open jobs; a section inside a job counts its open tasks.
  const open = T.isSection(idx, g) ? T.childrenOf(idx, g.id).filter((t) => t.kind === T.KIND.task && S.isOpen(t.status)).length : T.openJobCount(idx, g.id);
  // Past three levels a link takes over from more nesting: the breadcrumb on its page carries the path.
  if (depth >= 2) {
    return el('a', { class: 'card', href: routeHref(`/tasks/${g.id}`), style: { 'min-height': '0' } },
      el('div', { class: 'row' }, dot(T.colourOf(idx, g.id)), el('span', { class: 'nm' }, T.nameOf(g)), el('span', { class: 'sp' }), el('span', { class: 'meta' }, `${open} open`), icon('chevRight', 16)));
  }
  const s = el('section', { class: `grp${closed ? ' closed' : ''}`, 'aria-label': T.nameOf(g) },
    el('div', { class: 'grp-head', dataset: { dropInto: g.id } },
      el('button', {
        class: 'ib', type: 'button', 'aria-expanded': String(!closed), 'aria-label': `${closed ? 'Expand' : 'Collapse'} ${T.nameOf(g)}`,
        onclick: () => { prefs.set(key, !closed); rerender(); },
      }, icon(closed ? 'chevRight' : 'chevDown', 16)),
      el('h2', { class: 'h2' }, el('a', { href: routeHref(`/tasks/${g.id}`), style: { color: 'inherit', 'text-decoration': 'none' } }, T.nameOf(g))),
      g.kind === T.KIND.product ? el('span', { class: 'grp-kind' }, 'Product') : null,
      el('span', { class: 'meta' }, `${open} open`),
      el('span', { class: 'sp' }),
      btn(page?.kind === T.KIND.task ? 'Task' : 'Job', () => addJob(g.id), { cls: 'sm ghost', ic: 'plus' })));
  if (!closed) s.append(...children(g.id, depth + 1, page));
  return s;
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
    if (mode === 'list') wrap.append(el('div', { class: 'rows' }, shown.map((t) => row(t, { assignee: true }))));
    else wrap.append(el('div', { class: 'grid' }, shown.map((t) => tile(t, { assignee: true, menuExtra: [{ label: 'Archive', icon: 'archive', onSelect: () => A.archive(t.id) }] }))));
    if (sorted.length > 4) wrap.append(el('div', { class: 'more-row' }, btn(all ? 'Show fewer' : `Show all ${sorted.length}`, () => { prefs.set(allKey, !all); rerender(); }, { cls: 'ghost sm' })));
  }
  return wrap;
}

function wireDrag(body, page) {
  if (sortOf(page) !== 'manual') return;
  enableDrag(body, {
    onDrop: (dragId, targetId, where) => A.moveNextTo(dragId, targetId, where),
    onDropInto: (dragId, groupId) => A.moveInto(dragId, groupId),
  });
}
