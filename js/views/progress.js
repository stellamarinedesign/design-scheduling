// views/progress.js — the Progress tab: the design register (PLAN, "Progress
// page: the design register" and "Progress page build"). The Excel Progress
// sheet made live: one section per category that holds products, one row per
// product, one cell per top-level task of its current job, under the
// category's tasks template as columns. The logic is register.js; this file
// only draws it.
//
// WHO (owner, 2026-11-09): the Design lead, and designers read-only. For a
// designer a cell or a row opens the task panel, which follows the usual
// rules there. The lead ticks cells, adds products and starts revisions.
//
// THE CELL is the job's own task, never a copy: a tick in the job shows here
// at once, through the one live tree, and a tick here is a tick in the job.
// It is the check control (tile.js checkBox): a click goes forward, a
// right-click, long-press or Shift+F10 back, and ticking one done starts the
// next as it does in the job. Its mark gives every state a symbol, since a
// cell has no word beside it: ✓ done, half-filled in progress, ✓ on violet
// for check, ! sent back, … waiting, – cancelled, an empty box to do; the
// word is in its name and tooltip. Done recedes - most of a register is done
// - so open work is what the eye finds.
//
// THE MATRIX is one grid per section, its widths shared by every row. How
// it lays out depends on the section's own width AND its number of columns,
// so each section is measured (fitter, below): full, compact (the panel open
// beside the list, a half-screen window), or stacked (a phone: name and job
// on top, the cells below under the same upright labels).
//
// KEYBOARD: each section is one tab stop. The arrow keys move between cells
// (Home and End along the row), Enter or Space acts, Shift+F10 and the
// context-menu key go back a state.

import { el, btn, icon, iconBtn, dot, pill, prefs, isWide, menu, loadProblem, withMenu } from '../ui.js';
import { state, personName } from '../state.js';
import * as T from '../tree.js';
import * as S from '../status.js';
import * as RG from '../register.js';
import * as A from '../actions.js';
import { assignable } from '../team.js';
import { openDialog } from '../dialog.js';
import { route, openTask, go } from '../router.js';
import { whoBadge, statusMenu } from './tile.js';

const FILTER_KEY = 'progress.filter';
const filterOf = () => { const f = prefs.get(FILTER_KEY, 'all'); return RG.FILTERS.some((x) => x.key === f) ? f : 'all'; };
const rerender = () => go(location.hash.replace(/^#/, '').split('?')[0], { keepTask: true });
const lead = () => state.role === 'lead';
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

/** The status behind a cell's state, and the mark it draws. */
const STATE_STATUS = { todo: 'todo', doing: 'in_progress', check: 'check', fix: 'fix', wait: 'waiting', done: 'done', na: 'cancelled' };
const MARK = { done: 'check', check: 'check', doing: 'half', fix: 'bang', wait: 'more', na: 'dash' };

/** Leads and designers, you first: who a job can be for. */
const people = () => {
  const list = assignable(state.access);
  return [state.me, ...list.filter((p) => p !== state.me).sort((a, b) => personName(a).localeCompare(personName(b)))];
};
const whoSelect = (id, value) => el('select', { class: 'sel', id },
  people().map((p) => el('option', { value: p, selected: p === value }, personName(p))),
  el('option', { value: '', selected: !value }, 'Nobody yet'));

// ---------------------------------------------------------------------------
// reveal: the sidebar, Jump to, and #/progress?c=<id>
// ---------------------------------------------------------------------------

let pendingReveal = null;
let lastDeepLink = null;

/** Scroll to a category's section (or the first section inside it) and light it briefly. */
export function revealSection(id) {
  pendingReveal = id;
  const next = `#/progress?c=${encodeURIComponent(id)}`;
  if (location.hash === next) rerender();
  else location.hash = next;
}

function takeReveal() {
  let target = pendingReveal;
  pendingReveal = null;
  const c = route.parts[0] === 'progress' ? (route.query.c ?? null) : null;
  if (!target && c && c !== lastDeepLink) target = c;
  lastDeepLink = c;
  return target;
}

/** The section that shows a category: its own, else the first one inside it. */
function sectionFor(sections, id) {
  const own = sections.find((s) => s.id === id);
  if (own) return own;
  return sections.find((s) => s.group && T.ancestorChain(state.idx, s.group.id).some((a) => a.id === id)) ?? null;
}

function flash(inner, sectionId) {
  // A timeout, not a frame: a page in a background tab skips frames, and the
  // scroll would never happen.
  setTimeout(() => {
    const n = inner.querySelector(`[data-section="${CSS.escape(sectionId)}"]`);
    if (!n) return;
    const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    n.scrollIntoView({ block: 'start', behavior: smooth ? 'smooth' : 'auto' });
    n.classList.add('flash');
    setTimeout(() => n.classList.add('flash-out'), 900);
    setTimeout(() => n.classList.remove('flash', 'flash-out'), 1700);
  }, 0);
}

// ---------------------------------------------------------------------------
// the page
// ---------------------------------------------------------------------------

export function renderProgress(root) {
  const inner = el('div', { class: 'view-inner prog' });
  root.append(inner);
  const filter = filterOf();
  // The sections of the last draw are gone: stop measuring them.
  fitter.disconnect();

  if (state.error && !state.ready) {
    inner.append(head(null, filter), el('div', { class: 'state-msg', role: 'alert' },
      el('h2', { class: 'h2' }, 'The Progress page did not load'),
      ...loadProblem(state.error).map((line) => el('p', {}, line)),
      el('div', {}, btn('Reload', () => location.reload()))));
    return;
  }
  if (!state.ready) {
    inner.append(head(null, filter), el('div', { class: 'rg-skel', 'aria-busy': 'true', 'aria-label': 'Loading the Progress page' },
      el('div', { class: 'skel-line', style: { width: '30%' } }),
      [1, 2, 3, 4, 5].map(() => el('div', { class: 'skel rg-skel-row' }))));
    return;
  }

  const reg = RG.register(state.idx);
  openJobId = state.openId ? (T.jobOf(state.idx, state.openId)?.id ?? null) : null;
  inner.append(head(reg, filter));
  if (!reg.sections.length) { inner.append(noProducts()); return; }

  const keep = (RG.FILTERS.find((f) => f.key === filter) ?? RG.FILTERS[0]).test;
  const shown = reg.sections.map((s) => ({ ...s, rows: s.rows.filter(keep) }));
  // A section the filter empties drops out, unless a product is being added to it.
  const visible = shown.filter((s) => s.rows.length || filter === 'all' || adding?.sectionId === s.id);
  if (!visible.length) {
    const f = RG.FILTERS.find((x) => x.key === filter);
    inner.append(el('div', { class: 'empty' },
      el('span', {}, el('strong', {}, filter === 'open' ? 'No product has an open job. ' : 'Every product is complete. '),
        'All shows every product.'),
      btn('Show all', () => { prefs.set(FILTER_KEY, 'all'); rerender(); }, { cls: 'sm', attrs: { 'aria-label': `Show all products, not only ${f.label.toLowerCase()}` } })));
    return;
  }
  // Fitted before the sections go in, from the width they will have (the
  // view's, less its padding, up to the page's limit), so the first draw is
  // right without laying out a thousand cells twice; the observer then
  // follows every resize.
  const cs = getComputedStyle(root);
  const width = Math.min(1400, root.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight));
  const list = el('div', { class: 'rg-list' }, visible.map(section));
  for (const sec of list.children) fitSection(sec, width);
  inner.append(list);

  const target = takeReveal();
  if (target) {
    const s = sectionFor(visible, target);
    if (s) flash(inner, s.id);
  }
  // A product row just opened for typing takes the focus.
  if (adding?.focus) {
    adding.focus = false;
    inner.querySelector(`[data-fk="rg-add-${CSS.escape(adding.sectionId)}"]`)?.focus({ preventScroll: false });
  }
}

/** The heading: the counts, the filters, and a way to jump between sections where there is no sidebar. */
function head(reg, filter) {
  const counts = reg ? countRows(reg) : null;
  const sections = reg?.sections ?? [];
  const jump = reg && sections.length > 1 && (!lead() || !isWide())
    ? btn('Jump to', (e) => menu(e.currentTarget, sections.map((s) => ({
      label: s.title, node: el('span', { class: 'row' }, dot(s.group ? T.colourOf(state.idx, s.group.id) : null), s.title),
      onSelect: () => revealSection(s.id),
    })), { label: 'Jump to a section' }), { cls: 'sm', ic: 'chevDown', attrs: { 'aria-haspopup': 'menu' } })
    : null;
  return el('div', { class: 'view-head rg-head-bar' },
    el('h1', { class: 'h1' }, 'Progress'),
    reg ? el('span', { class: 'meta' }, `${plural(reg.products, 'product')} · ${reg.complete} complete`) : null,
    reg && reg.products ? el('div', { class: 'filters', role: 'group', 'aria-label': 'Show the products' },
      RG.FILTERS.map((f) => el('button', {
        class: 'fp', type: 'button', 'aria-pressed': String(f.key === filter),
        onclick: () => { prefs.set(FILTER_KEY, f.key); rerender(); },
      }, f.label, el('b', {}, String(counts[f.key] ?? 0))))) : null,
    el('span', { class: 'sp' }),
    jump);
}

function countRows(reg) {
  const rows = reg.sections.flatMap((s) => s.rows);
  return Object.fromEntries(RG.FILTERS.map((f) => [f.key, rows.filter(f.test).length]));
}

/** No products anywhere yet: what they are and where they come from. */
function noProducts() {
  return el('section', { class: 'welcome' },
    el('h2', { class: 'h2' }, 'No products yet'),
    lead()
      ? el('p', {}, 'Each product is a row here, with a cell for every task in its current job and a column for every task in its category\'s template. Add one from a category\'s ⋯ menu in Tasks (Add a product), or bring in the Excel Progress sheet.')
      : el('p', {}, 'Each product is a row here, with a cell for every task in its current job. The Design lead adds them.'),
    lead() ? el('div', { class: 'acts' },
      btn('Open Tasks', () => go('/tasks'), { ic: 'tasks' }),
      btn('Import the Progress sheet', () => go('/import'), { cls: 'ghost', ic: 'upload' })) : null);
}

// ---------------------------------------------------------------------------
// a section: its labels row (with its name in the corner), its rows, its foot
// ---------------------------------------------------------------------------

function section(s) {
  const n = s.columns.length;
  const grid = el('div', {
    class: 'rg-grid', role: 'grid', 'aria-labelledby': `rg-h-${s.id}`, 'aria-rowcount': String(s.rows.length + 1),
    style: { '--n': String(n) },
  },
  columnLabels(s),
  s.rows.map((r, i) => rowEl(s, r, i)));
  wireKeys(grid, s.id);
  const sec = el('section', { class: 'rg-sec', dataset: { section: s.id, n: String(n) } },
    grid,
    !n ? el('p', { class: 'meta wrap rg-note' }, s.group
      ? `No columns yet: ${T.nameOf(s.group)} has no tasks template, and its jobs have no tasks.${lead() ? ' Set the columns from ⋯ above.' : ''}`
      : 'No columns yet: these products are in no category.') : null,
    !s.rows.length && s.all ? el('p', { class: 'meta wrap rg-note' }, 'No product here matches the filter.') : null,
    addFoot(s));
  fitter.observe(sec);
  return sec;
}

/**
 * The labels row, which stays at the top while its section scrolls by: the
 * section's name in the corner over the product names, then the column
 * labels upright in the cells' own width (the whole name in the tooltip).
 */
function columnLabels(s) {
  const colour = s.group ? T.colourOf(state.idx, s.group.id) : null;
  const fullPath = s.group ? [...T.categoryPath(state.idx, s.group.id), s.group].map(T.nameOf).join(' › ') : s.title;
  return el('div', { class: 'rg-row rg-cols', role: 'row' },
    el('div', { class: 'rg-name rg-corner', role: 'columnheader' },
      el('h2', { class: 'h2 rg-title', id: `rg-h-${s.id}`, title: fullPath }, dot(colour), el('span', {}, s.title)),
      el('div', { class: 'rg-corner-foot' },
        el('span', { class: 'meta' }, `${plural(s.all, 'product')} · ${s.complete} complete`),
        lead() && s.group ? iconBtn('more', `${s.title} actions`, (e) => sectionMenu(e.currentTarget, s), 'sm') : null)),
    el('div', { class: 'rg-cells' }, s.columns.map((c) => el('span', { class: 'rg-col', role: 'columnheader', title: c.label },
      el('span', { class: 'rg-col-text' }, c.label)))),
    el('span', { class: 'rg-count lbl', role: 'columnheader' }, 'Done'),
    el('span', { class: 'rg-rev lbl', role: 'columnheader' }, 'Rev'),
    el('span', { class: 'rg-job lbl', role: 'columnheader' }, 'Job'));
}

/** The lead's ⋯ on a section: add a product, set the columns, find it in Tasks. */
function sectionMenu(anchor, s) {
  const owner = s.templateFrom ?? s.group;
  menu(anchor, [
    { label: 'Add a product', icon: 'plus', onSelect: () => openAdd(s) },
    {
      label: s.fromTemplate ? 'Edit the columns…' : 'Set the columns…', icon: 'tasks',
      hint: owner !== s.group ? `${T.nameOf(owner)} template` : 'tasks template',
      onSelect: async () => (await import('./tasks.js')).editTemplate(owner),
    },
    { label: 'Show in Tasks', icon: 'open', onSelect: async () => (await import('./tasks.js')).revealCategory(s.group.id) },
  ], { label: `${s.title} actions` });
}

// ---------------------------------------------------------------------------
// fitting a section to its width
// ---------------------------------------------------------------------------

/**
 * Full: every column side by side at 36px cells. Compact: 28 to 32px cells
 * and narrower name, revision and job columns. Stacked: the name and job on one line, the cells on
 * the next, as wide as the section allows (26 to 40px each).
 */
function fitSection(sec, w) {
  if (!w) return;
  const n = Math.max(1, Number(sec.dataset.n) || 0);
  let fit = 'stack';
  let cell = Math.max(26, Math.min(40, Math.floor((w - 72) / n)));
  // The fixed parts: full 480px (name 140, count, rev, job 176, gaps); compact 348px.
  if (w >= n * 36 + 480) { fit = 'full'; cell = 36; } else if (w >= n * 28 + 348) { fit = 'compact'; cell = Math.min(32, Math.floor((w - 348) / n)); }
  if (sec.dataset.fit !== fit) sec.dataset.fit = fit;
  const px = `${cell}px`;
  if (sec.style.getPropertyValue('--cell') !== px) sec.style.setProperty('--cell', px);
}
const fitter = new ResizeObserver((entries) => { for (const e of entries) fitSection(e.target, e.contentRect.width); });

// ---------------------------------------------------------------------------
// a row
// ---------------------------------------------------------------------------

/** The job the panel is showing (or the job of the task it shows): its row is lit. Once per draw. */
let openJobId = null;
const rowIsOpen = (r) => Boolean(r.job) && r.job.id === openJobId;

function rowEl(s, r, i) {
  const { product, job } = r;
  const name = T.nameOf(product);
  const nameCell = el('span', { class: 'rg-name', role: 'rowheader' }, job
    ? el('button', {
      class: 'rg-name-btn', type: 'button', dataset: { fk: `rg-name-${product.id}` },
      title: `Open ${T.nameOf(job)}`,
      'aria-label': `${name}, ${S.LABEL[job.status] ?? job.status}: open ${T.nameOf(job)}`, onclick: () => openTask(job.id),
    }, el('span', { class: 'rg-name-text' }, name))
    : el('span', { class: 'rg-name-text' }, name));
  const rowCls = `rg-row${r.cancelled ? ' cancelled' : ''}${r.complete ? ' complete' : ''}`;
  return el('div', { class: rowCls, role: 'row', 'aria-rowindex': String(i + 2), 'aria-current': rowIsOpen(r) ? 'true' : null, dataset: { product: product.id } },
    nameCell,
    job
      ? el('div', { class: 'rg-cells' }, r.cells.map((c, ci) => cellEl(r, c, ci)))
      : el('div', { class: 'rg-cells rg-nojob', role: 'gridcell', 'aria-colspan': String(Math.max(1, s.columns.length)) }, el('span', { class: 'meta' }, 'No job yet')),
    el('span', { class: 'rg-count', role: 'gridcell' },
      job && r.total ? el('span', { class: 'rg-frac', 'aria-label': `${r.done} of ${r.total} done` }, `${r.done}/${r.total}`) : el('span', { class: 'rg-none', 'aria-label': 'Nothing to count' }, '–'),
      r.extras.length ? el('button', {
        class: 'rg-more', type: 'button', title: `Outside the columns: ${r.extras.map(T.nameOf).join(', ')}`,
        'aria-label': `${plural(r.extras.length, 'more task')} outside the columns: ${r.extras.map(T.nameOf).join(', ')}. Open the job`,
        onclick: () => openTask(job.id),
      }, `+${r.extras.length}`) : null),
    el('span', { class: 'rg-rev mono', role: 'gridcell', title: job?.revision ?? '' },
      job?.revision ? job.revision : el('span', { class: 'rg-none', 'aria-label': 'No revision' }, '–')),
    jobCell(r));
}

/**
 * The job column: its status (the lead's pill opens the status menu), who
 * has it, and a title of its own when it says more than the row does. With
 * no open job, the lead's Start revision.
 */
function jobCell(r) {
  const { job, product } = r;
  const start = lead() && !r.open
    ? btn(job ? 'Start revision' : 'Start a job', () => startRevisionBox(product), {
      // Quiet: a register of finished products shows one on every row.
      cls: 'sm ghost rg-start', ic: 'plus', attrs: { 'aria-label': `${job ? 'Start the next revision of' : 'Start a job for'} ${T.nameOf(product)}` },
    })
    : null;
  if (!job) return el('span', { class: 'rg-job', role: 'gridcell' }, start ?? el('span', { class: 'rg-none' }, '–'));
  const plain = [T.nameOf(product), RG.revisionTitle(product, job.revision ?? '')].map(RG.labelKey);
  const own = !plain.includes(RG.labelKey(T.nameOf(job)));
  const canSet = lead() && A.canWrite(job);
  return el('span', { class: `rg-job${start ? ' has-start' : ''}`, role: 'gridcell' },
    pill(job.status, canSet ? { onClick: (e) => { e.stopPropagation(); statusMenu(e.currentTarget, job); } } : {}),
    job.assignee ? el('span', { class: 'rg-who', title: personName(job.assignee) }, whoBadge(job.assignee) ?? el('span', { class: 'meta' }, personName(job.assignee))) : null,
    own && !start ? el('span', { class: 'rg-job-title', title: T.nameOf(job) }, T.nameOf(job)) : null,
    r.moreOpen ? el('span', { class: 'meta', title: `${plural(r.moreOpen, 'more open job')} in ${T.nameOf(product)}` }, `+${r.moreOpen} open`) : null,
    start);
}

/**
 * One cell. For the lead it is the check control on the job's own task; a
 * column the job has no task for offers to add it. For a designer it opens
 * the task.
 */
function cellEl(r, c, ci) {
  const col = c.col.label;
  const fk = `rg-${r.product.id}-${c.col.key}`;
  const job = T.nameOf(r.job);
  if (!c.task) {
    if (!lead()) return el('span', { class: 'rc none', role: 'gridcell', title: `${col}: not in this job`, 'aria-label': `${col}: not in this job`, dataset: { col: String(ci) } }, el('i', {}));
    return el('span', { class: 'rg-cell', role: 'gridcell' }, el('button', {
      class: 'rc none', type: 'button', tabindex: '-1', dataset: { fk, cell: '1', col: String(ci) },
      'aria-label': `${col}: not in this job. Add it`, title: `${col}: not in this job`, 'aria-haspopup': 'menu',
      onclick: (e) => menu(e.currentTarget, [{
        label: `Add ${col} to ${job}`, icon: 'plus',
        onSelect: () => A.createTask({ title: col, parentId: r.job.id, order: RG.insertOrder(state.idx, r.job.id, r.cells, ci) }),
      }], { label: col }),
    }, el('i', {})));
  }
  const status = STATE_STATUS[c.state] ?? 'todo';
  const word = S.LABEL[status] ?? status;
  const inner = c.inner ? `, ${c.inner.done} of ${c.inner.total} done` : '';
  const mark = el('i', {}, MARK[c.state] ? icon(MARK[c.state], 14) : null);
  const base = { class: `rc ${c.state}`, type: 'button', tabindex: '-1', dataset: { fk, cell: '1', col: String(ci) } };
  // A task with tasks inside shows how they stand; it opens rather than ticks.
  if (!lead() || c.inner) {
    return el('span', { class: 'rg-cell', role: 'gridcell' }, el('button', {
      ...base, 'aria-label': `${col}: ${word}${inner}. Open it`, title: `${col} · ${word}${inner}${lead() ? ' · its tasks are ticked inside it' : ''}`,
      onclick: () => openTask(c.task.id),
    }, mark));
  }
  const t = c.task;
  const light = T.isLight(state.idx, t);
  const fwd = S.taskForward(t, state.role, light);
  const back = S.taskBack(t, state.role, state.me, light);
  const b = el('button', {
    ...base,
    'aria-label': `${col}: ${word}${fwd ? `. Click for ${S.LABEL[fwd]}` : ''}`,
    title: [`${col} · ${word}`, fwd && `click: ${S.LABEL[fwd]}`, back && `right-click: back to ${S.LABEL[back]}`].filter(Boolean).join(' · '),
    onclick: () => A.tick(t.id, 1),
  }, mark);
  return el('span', { class: 'rg-cell', role: 'gridcell' }, withMenu(b, () => A.tick(t.id, -1)));
}

// ---------------------------------------------------------------------------
// keyboard: one tab stop per section, the arrows move between cells
// ---------------------------------------------------------------------------

const lastCell = new Map();   // section id → the data-fk of the cell that last had focus

function wireKeys(grid, sectionId) {
  // After a redraw the cell that had focus keeps the tab stop; else the first.
  const cells = [...grid.querySelectorAll('[data-cell]')];
  if (cells.length) (cells.find((b) => b.dataset.fk === lastCell.get(sectionId)) ?? cells[0]).tabIndex = 0;
  grid.addEventListener('focusin', (e) => {
    const b = e.target.closest?.('[data-cell]');
    if (!b) return;
    for (const x of grid.querySelectorAll('[data-cell][tabindex="0"]')) if (x !== b) x.tabIndex = -1;
    b.tabIndex = 0;
    lastCell.set(sectionId, b.dataset.fk);
  });
  grid.addEventListener('keydown', (e) => {
    const b = e.target.closest?.('[data-cell]');
    if (!b) return;
    const rows = [...grid.querySelectorAll('.rg-row:not(.rg-cols)')].map((r) => [...r.querySelectorAll('[data-cell]')]).filter((r) => r.length);
    const ri = rows.findIndex((r) => r.includes(b));
    if (ri < 0) return;
    const ci = rows[ri].indexOf(b);
    // Up and down keep the column: the cell in the same column, else the nearest one that row has.
    const col = Number(b.dataset.col);
    const near = (row) => row && [...row].sort((x, y) => Math.abs(Number(x.dataset.col) - col) - Math.abs(Number(y.dataset.col) - col))[0];
    let next = null;
    if (e.key === 'ArrowRight') next = rows[ri][ci + 1];
    else if (e.key === 'ArrowLeft') next = rows[ri][ci - 1];
    else if (e.key === 'ArrowDown') next = near(rows[ri + 1]);
    else if (e.key === 'ArrowUp') next = near(rows[ri - 1]);
    else if (e.key === 'Home') next = rows[ri][0];
    else if (e.key === 'End') next = rows[ri][rows[ri].length - 1];
    else return;
    e.preventDefault();
    next?.focus();
  });
}

// ---------------------------------------------------------------------------
// Add product: a row at the foot of a section, typed straight in
// ---------------------------------------------------------------------------

// What is being typed survives the redraws every write causes.
let adding = null;   // { sectionId, name, withJob, who, err, focus }

function openAdd(s) {
  adding = { sectionId: s.id, name: '', withJob: true, who: state.me, err: '', focus: true };
  rerender();
}
function closeAdd() { adding = null; rerender(); }

function addFoot(s) {
  if (!lead() || !s.group) return null;
  if (adding?.sectionId !== s.id) {
    return el('div', { class: 'rg-foot' }, btn('Add product', () => openAdd(s), { cls: 'sm ghost', ic: 'plus', attrs: { 'aria-label': `Add a product to ${s.title}` } }));
  }
  const a = adding;
  const tpl = T.stepsTemplateOf(state.idx, s.group.id);
  const errId = `rg-add-err-${s.id}`;
  const name = el('input', {
    class: 'input', type: 'text', placeholder: 'Product name', maxlength: '120', autocomplete: 'off', value: a.name,
    dataset: { fk: `rg-add-${s.id}` }, 'aria-label': `New product in ${s.title}`,
    'aria-invalid': a.err ? 'true' : null, 'aria-describedby': a.err ? errId : null,
  });
  const err = el('div', { class: 'form-err', id: errId, role: 'alert' }, a.err);
  name.addEventListener('input', () => {
    a.name = name.value;
    if (a.err) { a.err = ''; err.textContent = ''; name.removeAttribute('aria-invalid'); }
  });
  const withJob = el('input', { type: 'checkbox', checked: a.withJob, dataset: { fk: `rg-add-job-${s.id}` } });
  const who = whoSelect(`rg-add-who-${s.id}`, a.who);
  who.disabled = !a.withJob;
  who.setAttribute('aria-label', 'Who has its first job');
  withJob.addEventListener('change', () => { a.withJob = withJob.checked; who.disabled = !a.withJob; });
  who.addEventListener('change', () => { a.who = who.value || null; });
  const submit = () => {
    const v = name.value.trim();
    const say = (m) => { a.err = m; err.textContent = m; name.setAttribute('aria-invalid', 'true'); name.setAttribute('aria-describedby', errId); name.focus(); };
    if (!v) return say('Give it a name.');
    const clash = T.childrenOf(state.idx, s.group.id).find((c) => c.kind === T.KIND.product && RG.labelKey(T.nameOf(c)) === RG.labelKey(v));
    if (clash) return say(`${T.nameOf(clash)} is already here.`);
    a.name = '';
    a.focus = true;
    // The row stays open for the next one: products often come in a run.
    A.addProduct({ name: v, parentId: s.group.id, withJob: a.withJob, assignee: a.withJob ? a.who : null, onFail: () => { if (adding === a) { a.name = v; rerender(); } } });
  };
  name.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); submit(); }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeAdd(); }
  });
  const jobWords = tpl ? `Start R1 with the ${plural(tpl.template.length, `${T.nameOf(tpl.from)} task`)}` : 'Start R1 (no tasks template above it)';
  return el('div', { class: 'rg-add', role: 'group', 'aria-label': `Add a product to ${s.title}` },
    el('div', { class: 'rg-add-name' }, name, err),
    el('label', { class: 'check-line' }, withJob, jobWords),
    who,
    el('div', { class: 'rg-add-acts' },
      btn('Add', submit, { cls: 'primary sm' }),
      btn('Done', closeAdd, { cls: 'ghost sm', attrs: { 'aria-label': 'Stop adding products' } })));
}

// ---------------------------------------------------------------------------
// Start revision: the box (owner, 2026-11-09: "ask each time")
// ---------------------------------------------------------------------------

function startRevisionBox(product) {
  const jobs = RG.jobsOf(state.idx, product.id);
  const rev = RG.nextRevision(jobs);
  const finished = jobs.filter((j) => !S.isOpen(j.status));
  const tpl = T.stepsTemplateOf(state.idx, product.id);
  const heading = jobs.length ? `Next revision of ${T.nameOf(product)}` : `First job for ${T.nameOf(product)}`;
  return openDialog((box, close, { dismiss }) => {
    box.append(el('h3', {}, heading),
      el('p', { class: 'lede' }, tpl
        ? `It starts with the ${plural(tpl.template.length, `${T.nameOf(tpl.from)} task`)}, all to do.`
        : 'No tasks template is set above it, so it starts with no tasks.'));
    const title = el('input', { class: 'input', id: 'srTitle', type: 'text', maxlength: '300', autocomplete: 'off', value: RG.revisionTitle(product, rev), 'data-autofocus': '' });
    const revision = el('input', { class: 'input mono', id: 'srRev', type: 'text', maxlength: '40', autocomplete: 'off', value: rev });
    let titleTouched = false;
    title.addEventListener('input', () => { titleTouched = true; });
    // The title follows the revision until it is typed in.
    revision.addEventListener('input', () => { if (!titleTouched) title.value = RG.revisionTitle(product, revision.value.trim()); });
    const who = whoSelect('srWho', state.me);
    const archive = finished.length ? el('input', { type: 'checkbox', checked: true }) : null;
    const names = finished.map(T.nameOf);
    const err = el('div', { class: 'form-err', role: 'alert' });
    box.append(
      el('div', { class: 'field' }, el('label', { for: 'srTitle' }, 'Title'), title),
      el('div', { class: 'sr-row' },
        el('div', { class: 'field' }, el('label', { for: 'srRev' }, 'Revision'), revision),
        el('div', { class: 'field' }, el('label', { for: 'srWho' }, 'For'), who)),
      archive ? el('label', { class: 'check-line' }, archive,
        `Move ${names.length > 2 ? `${names.slice(0, 2).join(', ')} and ${names.length - 2} more` : names.join(' and ')} to the archive`) : null,
      archive ? el('p', { class: 'hint' }, 'Its tasks and updates stay there, and it can be restored.') : null,
      err);
    const go1 = () => {
      const t = title.value.trim();
      if (!t) { err.textContent = 'Give it a title.'; title.setAttribute('aria-invalid', 'true'); title.focus(); return; }
      const id = A.startRevision({ productId: product.id, title: t, revision: revision.value, assignee: who.value || null, archiveOld: Boolean(archive?.checked) });
      close(id);
    };
    for (const f of [title, revision]) f.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); go1(); } });
    title.addEventListener('input', () => { err.textContent = ''; title.removeAttribute('aria-invalid'); });
    box.append(el('div', { class: 'actions' },
      btn(jobs.length ? 'Start revision' : 'Start the job', go1, { cls: 'primary' }),
      btn('Cancel', dismiss, { cls: 'ghost' })));
  }, { label: heading, guard: true });
}
