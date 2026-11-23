// views/progress.js — the Progress tab: the design register, as PRODUCT LINES
// with JOBS AS ROWS (owner, 2026-11-19; PLAN, "Progress page redesign"). The
// Excel Progress sheet made live: a heading per category (the sheet's red
// header line), a table per product line in it (its bold title), a row per
// job in the line, a cell per stage or sub-step of its tasks template. The
// logic is register.js; the boxes are lines.js; this file only draws.
//
// WHO (owner, 2026-11-09): the Design lead, and designers read-only. For a
// designer a cell or a name opens the task panel, which follows the usual
// rules there. The lead manages it all from here: lines (new, rename, order,
// columns, on or off the Tasks list, archive), rows (add, rename, order, move
// to another line, on or off the Tasks list, the next revision, archive),
// and bringing a job in from Tasks.
//
// THE CELL is the job's own task, never a copy: a tick in the job shows here
// at once, and a tick here is a tick in the job. It is the check control: a
// click goes forward, a right-click, long-press or Shift+F10 back, and
// ticking one done starts the next. A stage that WAITS ON THE CUSTOMER
// (Approval) starts as Waiting and takes its job into Waiting with it; the
// row then shows how long it has waited. Every state has a mark, since a
// cell has no word beside it; the word is in its name and tooltip. Done
// recedes - most of a register is done - so open work is what the eye finds.
//
// THE MATRIX is one grid per line, its widths shared by every row, measured
// against the line's own width and number of columns (fitter, below): full,
// compact (the panel open beside it, a half-screen window) or stacked (a
// phone). A stage with sub-steps is a heading over their narrow columns.
//
// SUB-JOBS (owner, 2026-11-19) are rows under a row ("300kg base" → "with
// post", "with gussets"): full jobs of the same line linked by `subOf`, their
// names indented a step a level. An arrow folds them into their row, which
// then says "2 sub-jobs · 1 done"; they start open and each fold is
// remembered on the device. The row's ⋯ adds one (inline, under the row's
// sub-rows), brings a job in as one, or files the row under another.
//
// KEYBOARD: each line is one tab stop. The arrow keys move between cells
// (Home and End along the row), Enter or Space acts, Shift+F10 and the
// context-menu key go back a state.

import { el, btn, icon, iconBtn, dot, pill, prefs, isWide, menu, loadProblem, withMenu, canDrag, refuse } from '../ui.js';
import { state, personName } from '../state.js';
import * as T from '../tree.js';
import * as S from '../status.js';
import * as RG from '../register.js';
import * as A from '../actions.js';
import { assignable } from '../team.js';
import { route, openTask, go } from '../router.js';
import { ageDays, dayLabel, dayOf } from '../dates.js';
import { whoBadge, statusMenu, enableDrag } from './tile.js';

const FILTER_KEY = 'progress.filter';
const FOLD_KEY = 'progress.folded';
const folded = () => new Set(Object.keys(prefs.get(FOLD_KEY, {})));
function setFolded(id, on) {
  const m = prefs.get(FOLD_KEY, {});
  if (on) m[id] = true; else delete m[id];
  prefs.set(FOLD_KEY, m);
  rerender();
}
const filterOf = () => { const f = prefs.get(FILTER_KEY, 'all'); return RG.FILTERS.some((x) => x.key === f) ? f : 'all'; };
const rerender = () => go(location.hash.replace(/^#/, '').split('?')[0], { keepTask: true });
const lead = () => state.role === 'lead';
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const lines = () => import('./lines.js');

/** The status behind a cell's state, and the mark it draws. */
const STATE_STATUS = { todo: 'todo', doing: 'in_progress', check: 'check', fix: 'fix', wait: 'waiting', done: 'done', na: 'cancelled' };
const MARK = { done: 'check', check: 'check', doing: 'half', fix: 'bang', wait: 'more', na: 'dash' };

/** Leads and designers, you first. */
const people = () => {
  const list = assignable(state.access);
  return [state.me, ...list.filter((p) => p !== state.me).sort((a, b) => personName(a).localeCompare(personName(b)))];
};

// ---------------------------------------------------------------------------
// reveal: the sidebar, Jump to, and #/progress?c=<id>
// ---------------------------------------------------------------------------

let pendingReveal = null;
let lastDeepLink = null;

/** Scroll to a product line, or a category's first line, and light it briefly. */
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

/** The line that shows a node: itself, the line it is in, or a category's first line. */
function lineFor(lineIds, id) {
  if (lineIds.includes(id)) return id;
  const n = state.idx.byId.get(id);
  const inLine = n && T.ancestorChain(state.idx, id).find(T.isLine);
  if (inLine && lineIds.includes(inLine.id)) return inLine.id;
  return lineIds.find((l) => T.ancestorChain(state.idx, l).some((a) => a.id === id)) ?? null;
}

function flash(inner, lineId) {
  // A timeout, not a frame: a page in a background tab skips frames.
  setTimeout(() => {
    const n = inner.querySelector(`[data-section="${CSS.escape(lineId)}"]`);
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

/** The job the panel shows (or the job of the task it shows): its row is lit. Once per draw. */
let openJobId = null;

export function renderProgress(root) {
  const inner = el('div', { class: 'view-inner prog' });
  root.append(inner);
  const filter = filterOf();
  // The lines of the last draw are gone: stop measuring them.
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
  if (!reg.lines) { inner.append(noLines()); return; }

  const keep = RG.filterTest(filter);
  // A line the filter empties drops out, unless a row is being added to it.
  const groups = reg.groups.map((g) => ({ ...g, lines: g.lines.map((l) => ({ ...l, rows: l.rows.filter(keep) }))
    .filter((l) => l.rows.length || filter === 'all' || adding?.lineId === l.id) })).filter((g) => g.lines.length);
  if (!groups.length) {
    const f = RG.FILTERS.find((x) => x.key === filter);
    inner.append(el('div', { class: 'empty' },
      el('span', {}, el('strong', {}, filter === 'waiting' ? 'Nothing is waiting. ' : 'Every row is finished. '), 'All shows every row.'),
      btn('Show all', () => { prefs.set(FILTER_KEY, 'all'); rerender(); }, { cls: 'sm', attrs: { 'aria-label': `Show all rows, not only ${f.label.toLowerCase()}` } })));
    return;
  }
  // Fitted before the lines go in, from the width they will have (the view's,
  // less its padding, up to the page's limit), so the first draw is right
  // without laying out a thousand cells twice; the observer follows resizes.
  const cs = getComputedStyle(root);
  const width = Math.min(1400, root.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight));
  const list = el('div', { class: 'rg-list' }, groups.map(categoryEl));
  for (const sec of list.querySelectorAll('.rg-sec')) fitSection(sec, width);
  inner.append(list);
  if (lead() && canDrag()) wireDrag(list);

  const target = takeReveal();
  if (target) {
    const l = lineFor(groups.flatMap((g) => g.lines.map((x) => x.id)), target);
    if (l) flash(inner, l);
  }
  // A row just opened for typing takes the focus.
  if (adding?.focus) {
    adding.focus = false;
    inner.querySelector(`[data-fk="rg-add-${CSS.escape(adding.lineId)}"]`)?.focus({ preventScroll: false });
  }
}

/** The heading: the counts, the filters, Jump to where there is no sidebar, and New product line. */
function head(reg, filter) {
  const counts = reg ? countRows(reg) : null;
  const all = reg ? reg.groups.flatMap((g) => g.lines.map((l) => ({ l, g }))) : [];
  const jump = reg && all.length > 1 && (!lead() || !isWide())
    ? btn('Jump to', (e) => menu(e.currentTarget, all.map(({ l, g }) => ({
      label: `${l.title} · ${g.title}`, node: el('span', { class: 'row' }, dot(g.category ? T.colourOf(state.idx, g.category.id) : null), el('span', {}, l.title), el('span', { class: 'menu-hint' }, g.title)),
      onSelect: () => revealSection(l.id),
    })), { label: 'Jump to a product line' }), { cls: 'sm', ic: 'chevDown', attrs: { 'aria-haspopup': 'menu' } })
    : null;
  return el('div', { class: 'view-head rg-head-bar' },
    el('h1', { class: 'h1' }, 'Progress'),
    reg?.lines ? el('span', { class: 'meta' }, `${plural(reg.rows, 'row')} in ${plural(reg.lines, 'product line')} · ${reg.complete} complete`) : null,
    reg && reg.rows ? el('div', { class: 'filters', role: 'group', 'aria-label': 'Show the rows' },
      RG.FILTERS.map((f) => el('button', {
        class: 'fp', type: 'button', 'aria-pressed': String(f.key === filter),
        onclick: () => { prefs.set(FILTER_KEY, f.key); rerender(); },
      }, f.label, el('b', {}, String(counts[f.key] ?? 0))))) : null,
    el('span', { class: 'sp' }),
    jump,
    // With no lines yet, the welcome below has the button.
    reg?.lines && lead() ? btn('Product line', async () => (await lines()).newLine(), { cls: 'sm', ic: 'plus', attrs: { 'aria-label': 'New product line' } }) : null);
}

function countRows(reg) {
  const rows = reg.groups.flatMap((g) => g.lines.flatMap((l) => l.rows));
  return Object.fromEntries(RG.FILTERS.map((f) => [f.key, rows.filter(f.test).length]));
}

/** No product lines yet: what they are and where they come from. */
function noLines() {
  return el('section', { class: 'welcome' },
    el('h2', { class: 'h2' }, 'No product lines yet'),
    lead()
      ? el('p', {}, 'A product line is a table here, such as Custom Lifters in Lifters. Its columns are its stages, and each row is one job, with a cell for each of its tasks. Make one here, switch a category to one from its ⋯ menu in Tasks, or bring in the Excel Progress sheet.')
      : el('p', {}, 'A product line is a table here, with a row for each of its jobs and a cell for each of their tasks. The Design lead sets them up.'),
    lead() ? el('div', { class: 'acts' },
      btn('New product line', async () => (await lines()).newLine(), { cls: 'primary', ic: 'plus' }),
      btn('Import the Progress sheet', () => go('/import'), { cls: 'ghost', ic: 'upload' })) : null);
}

// ---------------------------------------------------------------------------
// a category: its heading and its lines
// ---------------------------------------------------------------------------

function categoryEl(g) {
  const colour = g.category ? T.colourOf(state.idx, g.category.id) : null;
  return el('section', { class: 'rg-cat', 'aria-label': g.title, dataset: { cat: g.id } },
    el('div', { class: 'rg-cat-head' },
      el('h2', { class: 'h2 rg-cat-title' }, dot(colour, true), el('span', {}, g.title)),
      el('span', { class: 'meta' }, plural(g.lines.length, 'product line')),
      el('span', { class: 'sp' }),
      lead() && g.category ? iconBtn('more', `${g.title} actions`, (e) => menu(e.currentTarget, [
        { label: 'New product line here', icon: 'plus', onSelect: async () => (await lines()).newLine({ parentId: g.category.id }) },
        { label: 'Show in Tasks', icon: 'tasks', onSelect: async () => (await import('./tasks.js')).revealCategory(g.category.id) },
      ], { label: `${g.title} actions` }), 'sm') : null),
    g.lines.map(lineEl));
}

// ---------------------------------------------------------------------------
// a line: its labels row (its name in the corner), its rows, its foot
// ---------------------------------------------------------------------------

function lineEl(l) {
  const n = l.columns.cols.length;
  // Rows inside a folded row are not drawn; the folded row says what it holds.
  const shut = folded();
  const shown = [];
  let under = null;
  for (const r of l.rows) {
    if (under !== null && r.depth > under) continue;
    under = null;
    shown.push(r);
    if (r.subs && shut.has(r.job.id)) under = r.depth;
  }
  const tree = l.rows.some((r) => r.depth || r.subs) || adding?.subOf && adding.lineId === l.id;
  const kids = shown.map((r, i) => rowEl(l, r, i, { tree, shut: shut.has(r.job.id) }));
  // A sub-job being added is typed in under its row's last sub-row.
  if (adding?.subOf && adding.lineId === l.id) {
    const at = shown.findIndex((r) => r.job.id === adding.subOf);
    if (at >= 0) {
      let end = at;
      while (end + 1 < shown.length && shown[end + 1].depth > shown[at].depth) end += 1;
      kids.splice(end + 1, 0, el('div', { class: 'rg-row rg-subadd', role: 'row', style: { '--depth': String(Math.min(shown[at].depth + 1, 4)) } },
        el('div', { class: 'rg-subadd-cell', role: 'gridcell', 'aria-colspan': String(n + 4) }, addForm(l, adding))));
    }
  }
  const grid = el('div', {
    class: `rg-grid${tree ? ' has-subs' : ''}`, role: tree ? 'treegrid' : 'grid', 'aria-labelledby': `rg-h-${l.id}`, 'aria-rowcount': String(shown.length + 1),
    style: { '--n': String(n) },
  },
  columnLabels(l),
  kids);
  wireKeys(grid, l.id);
  const sec = el('section', { class: 'rg-sec', dataset: { section: l.id, n: String(n) } },
    grid,
    !n ? el('p', { class: 'meta wrap rg-note' }, `No columns yet.${lead() ? ' Set them from the ⋯ beside the line\'s name.' : ''}`) : null,
    !l.all ? el('p', { class: 'meta wrap rg-note' }, lead() ? 'No rows yet: add one below, or bring in a job from Tasks.' : 'No rows yet.')
      : !l.rows.length ? el('p', { class: 'meta wrap rg-note' }, 'No row here matches the filter.') : null,
    addFoot(l));
  fitter.observe(sec);
  return sec;
}

/**
 * The labels row, which stays at the top while its line scrolls by: the
 * line's name in the corner over the job names; then the columns, upright
 * in the cells' width, a stage with sub-steps as a heading over theirs.
 */
function columnLabels(l) {
  const colLabel = (c, name = c.label) => el('span', {
    class: `rg-col${c.waits ? ' waits' : ''}`, role: 'columnheader', title: c.waits ? `${name}: starting it puts the job into Waiting` : name,
    'aria-label': c.sub ? `${c.stage.label}, ${c.label}` : c.label,
  }, c.waits ? icon('clock', 11) : null, el('span', { class: 'rg-col-text' }, c.label));
  const heads = l.columns.stages.map((s) => {
    const cols = l.columns.cols.filter((c) => c.stage === s);
    if (!s.subs.length) return colLabel(cols[0]);
    return el('div', { class: 'rg-stagecol', style: { '--k': String(cols.length) } },
      el('span', { class: 'rg-stage-label', 'aria-hidden': 'true', title: s.label }, s.label),
      el('div', { class: 'rg-subs' }, cols.map((c) => colLabel(c, `${s.label} › ${c.label}`))));
  });
  return el('div', { class: 'rg-row rg-cols', role: 'row' },
    el('div', { class: 'rg-name rg-corner', role: 'columnheader' },
      el('h3', { class: 'h2 rg-title', id: `rg-h-${l.id}`, title: T.pathText(state.idx, l.id, { skipMaster: false }) }, el('span', {}, l.title)),
      el('div', { class: 'rg-corner-foot' },
        el('span', { class: 'meta' }, `${plural(l.all, 'row')} · ${l.complete} complete`),
        l.listed ? null : el('span', { class: 'grp-kind', title: 'Its rows are not on Tasks, Home or the lists unless one is switched on' }, 'Progress only'),
        lead() ? iconBtn('more', `${l.title} actions`, (e) => lineMenu(e.currentTarget, l), 'sm') : null)),
    el('div', { class: 'rg-cells' }, heads),
    el('span', { class: 'rg-count lbl', role: 'columnheader' }, 'Done'),
    el('span', { class: 'rg-rev lbl', role: 'columnheader' }, 'Rev'),
    el('span', { class: 'rg-job lbl', role: 'columnheader' }, 'Status'));
}

/** The lead's ⋯ on a line. */
function lineMenu(anchor, l) {
  const line = l.line;
  const same = T.childrenOf(state.idx, line.parentId).filter(T.isLine);
  const i = same.findIndex((x) => x.id === line.id);
  const owner = l.columns.templateFrom;
  menu(anchor, [
    { label: 'Add a row', icon: 'plus', onSelect: () => openAdd(l) },
    { label: 'Bring in a job…', icon: 'register', onSelect: async () => (await lines()).bringIn({ lineId: line.id }) },
    { label: l.columns.fromTemplate ? 'Edit the columns…' : 'Set the columns…', icon: 'tasks', hint: owner && owner.id !== line.id ? `from ${T.nameOf(owner)}` : null, onSelect: async () => (await lines()).editColumns(line) },
    'sep',
    { label: 'Show in Tasks', icon: 'tasks', checked: line.listed !== false, hint: line.listed === false ? 'Progress only' : null, onSelect: () => A.setListed(line.id, line.listed === false) },
    line.listed !== false ? { label: 'Open in Tasks', icon: 'open', onSelect: async () => (await import('./tasks.js')).revealCategory(line.id) } : null,
    { label: 'Rename', icon: 'edit', onSelect: () => A.rename(line.id) },
    i > 0 ? { label: 'Move up', icon: 'chevUp', onSelect: () => A.moveStep(line.id, -1) } : null,
    i < same.length - 1 ? { label: 'Move down', icon: 'chevDown', onSelect: () => A.moveStep(line.id, 1) } : null,
    { label: 'Move to…', icon: 'move', onSelect: async () => (await import('./pickers.js')).moveDialog(line.id) },
    'sep',
    { label: 'Not a product line', icon: 'close', hint: 'stays a category', onSelect: () => A.setLine(line.id, false) },
    { label: 'Archive the line', icon: 'archive', hint: l.all ? plural(l.all, 'row') : null, onSelect: () => A.archive(line.id) },
    { label: 'Delete the line…', icon: 'trash', danger: true, onSelect: () => A.remove(line.id) },
  ], { label: `${l.title} actions` });
}

// ---------------------------------------------------------------------------
// fitting a line to its width
// ---------------------------------------------------------------------------

/**
 * How a line lays out depends on its width AND its number of columns, so
 * each is measured. Full: every column side by side at 36px cells, names up
 * to 360px, the status column taking what is left. Compact: 28–32px cells
 * and narrower name, revision and status columns. Stacked: the name and
 * status on one line, the cells on the next (26 to 40px each).
 */
function fitSection(sec, w) {
  if (!w) return;
  const n = Math.max(1, Number(sec.dataset.n) || 0);
  let fit = 'stack';
  let cell = Math.max(26, Math.min(40, Math.floor((w - 72) / n)));
  // The fixed parts: full 576px (name 140, count, rev, status 272, gaps); compact 416px (name 96, count 64, rev, status 168, gaps).
  if (w >= n * 36 + 576) { fit = 'full'; cell = 36; } else if (w >= n * 28 + 416) { fit = 'compact'; cell = Math.min(32, Math.floor((w - 416) / n)); }
  if (sec.dataset.fit !== fit) sec.dataset.fit = fit;
  const px = `${cell}px`;
  if (sec.style.getPropertyValue('--cell') !== px) sec.style.setProperty('--cell', px);
}
const fitter = new ResizeObserver((entries) => { for (const e of entries) fitSection(e.target, e.contentRect.width); });

// ---------------------------------------------------------------------------
// a row
// ---------------------------------------------------------------------------

function rowEl(l, r, i, { tree = false, shut = false } = {}) {
  const { job } = r;
  const name = T.nameOf(job);
  // Said only where a row differs from its line (or, a sub-job, from its row): on the lists, or not.
  const like = r.parentId ? T.rowListed(state.idx, state.idx.byId.get(r.parentId)) : l.listed;
  const tag = r.listed === like ? null : el('span', { class: 'grp-kind rg-row-tag', title: r.listed ? 'This row shows in Tasks' : 'This row is on the Progress page only' }, r.listed ? 'In Tasks' : 'Progress only');
  const fold = r.subs ? iconBtn(shut ? 'chevRight' : 'chevDown', `${shut ? 'Show' : 'Fold'} the ${plural(r.subs, 'sub-job')} of ${name}`, (e) => { e.stopPropagation(); setFolded(job.id, !shut); }, 'sm rg-fold') : null;
  if (fold) fold.setAttribute('aria-expanded', String(!shut));
  const summary = r.subs && shut ? el('span', { class: 'meta rg-subs-sum' }, `${plural(r.subs, 'sub-job')} · ${r.subsComplete} done`) : null;
  const nameCell = el('span', { class: 'rg-name', role: 'rowheader', style: tree ? { '--depth': String(Math.min(r.depth, 4)) } : null },
    fold,
    el('button', {
      class: 'rg-name-btn', type: 'button', dataset: { fk: `rg-name-${job.id}` }, title: r.context ? `${name}: shown for its sub-rows` : `Open ${name}`,
      'aria-label': `${name}, ${S.LABEL[job.status] ?? job.status}${r.parentId ? `, part of ${T.nameOf(state.idx.byId.get(r.parentId))}` : ''}: open it`, onclick: () => openTask(job.id),
    }, el('span', { class: 'rg-name-text' }, name)), summary, tag);
  const rowCls = `rg-row${r.cancelled ? ' cancelled' : ''}${r.complete ? ' complete' : ''}${r.depth ? ' sub' : ''}${r.context ? ' context' : ''}`;
  const rowNode = el('div', {
    class: rowCls, role: 'row', 'aria-rowindex': String(i + 2), 'aria-current': job.id === openJobId ? 'true' : null,
    'aria-level': tree ? String(r.depth + 1) : null, 'aria-expanded': r.subs ? String(!shut) : null,
    dataset: { id: job.id }, draggable: lead() && canDrag() ? 'true' : null,
  },
  nameCell,
  el('div', { class: 'rg-cells' }, r.cells.map((c, ci) => cellEl(r, c, ci))),
  el('span', { class: 'rg-count', role: 'gridcell' },
    r.total ? el('span', { class: 'rg-frac', 'aria-label': `${r.done} of ${r.total} done` }, `${r.done}/${r.total}`) : el('span', { class: 'rg-none', 'aria-label': 'Nothing to count' }, '–'),
    r.extras.length ? el('button', {
      class: 'rg-more', type: 'button', title: `Outside the columns: ${r.extras.map(T.nameOf).join(', ')}`,
      'aria-label': `${plural(r.extras.length, 'more task')} outside the columns: ${r.extras.map(T.nameOf).join(', ')}. Open the job`,
      onclick: () => openTask(job.id),
    }, `+${r.extras.length}`) : null),
  el('span', { class: 'rg-rev mono', role: 'gridcell', title: job.revision ?? '' },
    job.revision ? job.revision : el('span', { class: 'rg-none', 'aria-label': 'No revision' }, '–')),
  jobCell(l, r));
  return lead() ? withMenu(rowNode, (at) => rowMenu(rowNode.querySelector('.rg-job .ib') ?? rowNode, l, r, { at })) : rowNode;
}

/**
 * The status column: the job's pill (the lead's opens the status menu), who
 * has it, how long it has waited, and - finished - the lead's Start
 * revision; then the row's ⋯.
 */
function jobCell(l, r) {
  const { job } = r;
  const start = lead() && !r.open
    ? btn('Start revision', async () => (await lines()).nextRevisionBox(job), {
      cls: 'sm ghost rg-start', ic: 'plus', attrs: { 'aria-label': `Start the next revision of ${T.nameOf(job)}` },
    })
    : null;
  const days = r.waiting && job.waiting?.since ? ageDays(job.waiting.since) : null;
  return el('span', { class: `rg-job${start ? ' has-start' : ''}`, role: 'gridcell' },
    pill(job.status, lead() ? { onClick: (e) => { e.stopPropagation(); statusMenu(e.currentTarget, job); } } : {}),
    days !== null ? el('span', { class: 'meta warn rg-age', title: `Waiting since ${dayLabel(dayOf(new Date(job.waiting.since)))}${job.waiting.note ? `: ${job.waiting.note}` : ''}` }, `${days}d`) : null,
    job.assignee ? el('span', { class: 'rg-who', title: personName(job.assignee) }, whoBadge(job.assignee) ?? el('span', { class: 'meta' }, personName(job.assignee))) : null,
    start,
    lead() ? iconBtn('more', `${T.nameOf(job)} actions`, (e) => { e.stopPropagation(); rowMenu(e.currentTarget, l, r); }, 'sm') : null);
}

/** The lead's ⋯ on a row (and its right-click). */
function rowMenu(anchor, l, r, { at = null } = {}) {
  const { job } = r;
  // Up and down among the rows of its own level: the rows of the line, or its row's sub-jobs.
  const level = r.parentId ?? null;
  const rows = RG.rowsOf(state.idx, l.id).filter((x) => (T.subParentOf(state.idx, x)?.id ?? null) === level);
  const i = rows.findIndex((x) => x.id === job.id);
  const parent = r.parentId ? state.idx.byId.get(r.parentId) : null;
  const like = parent ? T.rowListed(state.idx, parent) : l.listed;
  const shut = folded().has(job.id);
  menu(anchor, [
    { label: 'Open', icon: 'open', onSelect: () => openTask(job.id) },
    { label: 'Rename', icon: 'edit', onSelect: () => A.rename(job.id) },
    { label: 'Start revision…', icon: 'restore', hint: job.revision ? `after ${job.revision}` : null, onSelect: async () => (await lines()).nextRevisionBox(job) },
    l.columns.stages.length ? { label: 'Match to the columns…', icon: 'tasks', onSelect: async () => (await lines()).bringIn({ jobId: job.id, lineId: l.id }) } : null,
    'sep',
    { label: 'Add a sub-job', icon: 'plus', onSelect: () => openAdd(l, job.id) },
    { label: 'Bring in a job as a sub-job…', icon: 'register', onSelect: async () => (await lines()).bringIn({ lineId: l.id, subOf: job.id }) },
    r.subs ? { label: shut ? 'Show its sub-jobs' : 'Fold its sub-jobs', icon: shut ? 'chevDown' : 'chevRight', hint: plural(r.subs, 'sub-job'), onSelect: () => setFolded(job.id, !shut) } : null,
    { label: 'Make it a sub-job of…', icon: 'move', onSelect: () => subOfMenu(anchor, l, job) },
    parent ? { label: 'Make it a row of its own', icon: 'back', hint: `now under ${T.nameOf(parent)}`, onSelect: () => A.setSubOf(job.id, null) } : null,
    'sep',
    { label: 'Show in Tasks', icon: 'tasks', checked: r.listed, hint: r.listed === like ? (parent ? 'as its row' : 'as its line') : null, onSelect: () => A.setListed(job.id, !r.listed) },
    i > 0 ? { label: 'Move up', icon: 'chevUp', onSelect: () => A.moveStep(job.id, -1) } : null,
    i < rows.length - 1 ? { label: 'Move down', icon: 'chevDown', onSelect: () => A.moveStep(job.id, 1) } : null,
    { label: 'Move to another line…', icon: 'move', hint: r.subs ? `with ${plural(r.subs, 'sub-job')}` : null, onSelect: () => moveRow(job) },
    'sep',
    { label: 'Archive', icon: 'archive', onSelect: () => A.archive(job.id) },
    { label: 'Delete…', icon: 'trash', danger: true, onSelect: () => A.remove(job.id) },
  ], { label: `${T.nameOf(job)} actions`, at });
}

/** The rows a row can go under: every row of its line but itself and its own sub-jobs, indented as on the page. */
function subOfMenu(anchor, l, job) {
  const own = new Set([job.id, ...T.subJobTree(state.idx, job.id).map((x) => x.id)]);
  const rows = RG.treeOrder(state.idx, RG.rowsOf(state.idx, l.id)).filter((x) => !own.has(x.job.id));
  if (!rows.length) return;
  menu(anchor, [{ heading: `Put ${T.nameOf(job)} under` }, ...rows.map((x) => ({
    label: T.nameOf(x.job), checked: job.subOf === x.job.id,
    node: el('span', { class: 'row', style: { 'padding-left': `${Math.min(x.depth, 4) * 14}px` } }, T.nameOf(x.job)),
    onSelect: () => A.setSubOf(job.id, x.job.id),
  }))], { label: `Put ${T.nameOf(job)} under` });
}

/** Another line for a row: every line but its own. */
async function moveRow(job) {
  const own = T.lineOfRow(state.idx, job)?.id;
  const others = state.idx.nodes.filter((n) => T.isLine(n) && n.id !== own);
  if (!others.length) return;
  const anchor = document.querySelector(`[data-id="${CSS.escape(job.id)}"] .rg-job .ib`) ?? document.body;
  menu(anchor, [{ heading: 'Move to' }, ...others.map((o) => ({
    label: T.nameOf(o), hint: T.pathText(state.idx, o.id), onSelect: () => A.moveInto(job.id, o.id, 'end'),
  }))], { label: `Move ${T.nameOf(job)} to` });
}

/**
 * One cell. For the lead it is the check control on the job's own task; an
 * empty one offers to add its task. For a designer it opens the task.
 */
function cellEl(r, c, ci) {
  const col = c.col.sub ? `${c.col.stage.label} › ${c.col.label}` : c.col.label;
  const fk = `rg-${r.job.id}-${c.col.key}`;
  const job = T.nameOf(r.job);
  if (!c.task) {
    if (!lead()) return el('span', { class: 'rc none', role: 'gridcell', title: `${col}: not in this job`, 'aria-label': `${col}: not in this job`, dataset: { col: String(ci) } }, el('i', {}));
    return el('span', { class: 'rg-cell', role: 'gridcell' }, el('button', {
      class: 'rc none', type: 'button', tabindex: '-1', dataset: { fk, cell: '1', col: String(ci) },
      'aria-label': `${col}: not in this job. Add it`, title: `${col}: not in this job`, 'aria-haspopup': 'menu',
      onclick: (e) => menu(e.currentTarget, [{
        label: `Add ${c.col.label} to ${job}`, icon: 'plus', hint: c.col.sub && !c.stageTask ? `and ${c.col.stage.label}` : null,
        onSelect: () => A.addCellTask(r, ci),
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
  const fwd = S.stageTarget(state.idx, t, S.taskForward(t, state.role, light) ?? '').to || null;
  const back = S.taskBack(t, state.role, state.me, light);
  const fwdWord = fwd === 'waiting' ? 'Waiting on the customer' : S.LABEL[fwd];
  const b = el('button', {
    ...base,
    'aria-label': `${col}: ${word}${fwd ? `. Click for ${fwdWord}` : ''}`,
    title: [`${col} · ${word}`, fwd && `click: ${fwdWord}`, back && `right-click: back to ${S.LABEL[back]}`].filter(Boolean).join(' · '),
    onclick: () => A.tick(t.id, 1),
  }, mark);
  return el('span', { class: 'rg-cell', role: 'gridcell' }, withMenu(b, () => A.tick(t.id, -1)));
}

// ---------------------------------------------------------------------------
// keyboard: one tab stop per line, the arrows move between cells
// ---------------------------------------------------------------------------

const lastCell = new Map();   // line id → the data-fk of the cell that last had focus

function wireKeys(grid, lineId) {
  // After a redraw the cell that had focus keeps the tab stop; else the first.
  const cells = [...grid.querySelectorAll('[data-cell]')];
  if (cells.length) (cells.find((b) => b.dataset.fk === lastCell.get(lineId)) ?? cells[0]).tabIndex = 0;
  grid.addEventListener('focusin', (e) => {
    const b = e.target.closest?.('[data-cell]');
    if (!b) return;
    for (const x of grid.querySelectorAll('[data-cell][tabindex="0"]')) if (x !== b) x.tabIndex = -1;
    b.tabIndex = 0;
    lastCell.set(lineId, b.dataset.fk);
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

/**
 * Rows drag with a mouse: up and down their line, or into another line (the
 * tree says where they may go). Touch has Move up, Move down and Move to
 * another line in the row's ⋯.
 */
function wireDrag(list) {
  // Dropped beside a row, a row takes that row's place and level (under the same row, or its own).
  enableDrag(list, { onDrop: (dragId, targetId, where) => A.moveRowNextTo(dragId, targetId, where) });
}

// ---------------------------------------------------------------------------
// Add a row: one row at the foot of a line, typed straight in
// ---------------------------------------------------------------------------

// What is being typed survives the redraws every write causes.
let adding = null;   // { lineId, subOf, name, withTemplate, who, err, focus }

function openAdd(l, subOf = null) {
  adding = { lineId: l.id, subOf, name: '', withTemplate: true, who: state.me, err: '', focus: true };
  // A folded row opens, so its new sub-job is seen going in.
  if (subOf && folded().has(subOf)) setFolded(subOf, false);
  else rerender();
}
function closeAdd() { adding = null; rerender(); }

function addFoot(l) {
  if (!lead()) return null;
  if (adding?.lineId !== l.id || adding.subOf) {
    return el('div', { class: 'rg-foot' }, btn('Add a row', () => openAdd(l), { cls: 'sm ghost', ic: 'plus', attrs: { 'aria-label': `Add a row to ${l.title}` } }));
  }
  return addForm(l, adding);
}

/** The add form: a row of the line, or (a.subOf) a sub-job of a row, typed straight in. */
function addForm(l, a) {
  const parent = a.subOf ? state.idx.byId.get(a.subOf) : null;
  const where = parent ? `under ${T.nameOf(parent)}` : `to ${l.title}`;
  const tpl = T.stepsTemplateOf(state.idx, l.id);
  const errId = `rg-add-err-${l.id}`;
  const name = el('input', {
    class: 'input', type: 'text', placeholder: parent ? 'Sub-job name, e.g. with post' : 'Job name, e.g. Model 500', maxlength: '300', autocomplete: 'off', value: a.name,
    dataset: { fk: `rg-add-${l.id}` }, 'aria-label': parent ? `New sub-job of ${T.nameOf(parent)}` : `New row in ${l.title}`,
    'aria-invalid': a.err ? 'true' : null, 'aria-describedby': a.err ? errId : null,
  });
  const err = el('div', { class: 'form-err', id: errId, role: 'alert' }, a.err);
  name.addEventListener('input', () => {
    a.name = name.value;
    if (a.err) { a.err = ''; err.textContent = ''; name.removeAttribute('aria-invalid'); }
  });
  const withTemplate = el('input', { type: 'checkbox', checked: a.withTemplate });
  withTemplate.addEventListener('change', () => { a.withTemplate = withTemplate.checked; });
  const who = el('select', { class: 'sel', 'aria-label': 'Who has it' },
    people().map((p) => el('option', { value: p, selected: p === a.who }, personName(p))),
    el('option', { value: '', selected: !a.who }, 'Nobody yet'));
  who.addEventListener('change', () => { a.who = who.value || null; });
  const submit = () => {
    const v = name.value.trim();
    const say = (m) => { a.err = m; err.textContent = m; refuse(name, err); };
    if (!v) return say('Give it a name.');
    // A name is taken among the rows of its own level (two rows may each have a "with post").
    const level = RG.rowsOf(state.idx, l.id).filter((c) => (T.subParentOf(state.idx, c)?.id ?? null) === (a.subOf ?? null));
    const clash = level.find((c) => RG.labelKey(T.nameOf(c)) === RG.labelKey(v));
    if (clash) return say(parent ? `${T.nameOf(clash)} is already under ${T.nameOf(parent)}.` : `${T.nameOf(clash)} is already a row here.`);
    a.name = '';
    a.focus = true;
    // The form stays open for the next one: rows often come in a run.
    const onFail = () => { if (adding === a) { a.name = v; rerender(); } };
    if (parent) A.addSubJob({ name: v, parentJobId: parent.id, useTemplate: Boolean(tpl) && a.withTemplate, assignee: a.who, onFail });
    else A.addRow({ name: v, lineId: l.id, useTemplate: Boolean(tpl) && a.withTemplate, assignee: a.who, onFail });
  };
  name.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); submit(); }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeAdd(); }
  });
  return el('div', { class: `rg-add${parent ? ' sub' : ''}`, role: 'group', 'aria-label': parent ? `Add a sub-job ${where}` : `Add a row ${where}` },
    el('div', { class: 'rg-add-name' }, parent ? el('span', { class: 'lbl' }, `Sub-job of ${T.nameOf(parent)}`) : null, name, err),
    tpl ? el('label', { class: 'check-line' }, withTemplate, `With the ${plural(tpl.template.length, 'stage')}`) : el('span', { class: 'meta' }, 'No columns yet'),
    who,
    el('div', { class: 'rg-add-acts' },
      btn(parent ? 'Add sub-job' : 'Add row', submit, { cls: 'primary sm' }),
      btn('Stop adding', closeAdd, { cls: 'ghost sm', attrs: { 'aria-label': parent ? 'Stop adding sub-jobs' : 'Stop adding rows' } })));
}
