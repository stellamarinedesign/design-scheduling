// views/home.js — what is happening right now (Home brief, 2026-11-04).
//
// 1. MY WORK: filter pills (In progress · Waiting · Fix, with counts) over a
//    tile grid of my tasks at ANY depth — nesting organises, it never hides.
//    Two rows by default, "Show all (N)" for the rest. Drag reorders (Home's
//    own `homeOrder`); on touch the ⋯ menu has Move earlier / later.
// 2. BACKLOG: one row of my To-do jobs and sub-jobs untouched for 14 days or
//    more, picked afresh each day, weighted toward the oldest. ▶ Start on each.
// Ready for checking and Crew come with the team, in Phase 2.

import { el, btn, prefs, isPhone } from '../ui.js';
import { state, isMine } from '../state.js';
import * as T from '../tree.js';
import * as A from '../actions.js';
import * as BL from '../backlog.js';
import { tile, enableDrag, backlogDays } from './tile.js';
import { go } from '../router.js';
import { newMasterCategory } from './sidebar.js';

const FILTERS = [
  { key: 'in_progress', label: 'In progress', match: (s) => s === 'in_progress' || s === 'check' },
  { key: 'waiting', label: 'Waiting', match: (s) => s === 'waiting' },
  { key: 'fix', label: 'Fix', match: (s) => s === 'fix' },
];

let showAll = false;
let backlogAll = false;

/** Mine, ordered: unplaced (just started) first by activity, then Home's own order. */
function ordered(list) {
  const unplaced = list.filter((t) => t.homeOrder == null).sort((a, b) => String(b.lastActivityAt).localeCompare(String(a.lastActivityAt)));
  const placed = list.filter((t) => t.homeOrder != null).sort((a, b) => a.homeOrder - b.homeOrder);
  return [...unplaced, ...placed];
}

/** The Backlog pool for whoever is looking (the logic is backlog.js). */
export const backlogPool = () => BL.backlogPool(state.idx, { me: state.me, days: backlogDays() });

/** How many columns a grid is showing right now. */
const columns = (grid) => getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length || 1;

export function renderHome(root) {
  const inner = el('div', { class: 'view-inner' });
  root.append(inner);
  inner.append(el('h1', { class: 'sr-only' }, 'Home'));
  if (state.error && !state.ready) { inner.append(errorState()); return; }
  if (!state.ready) { inner.append(loading()); return; }
  if (!state.idx.nodes.length) { inner.append(welcome()); return; }

  // ── My work ──
  const mine = state.idx.nodes.filter((n) => n.kind === T.KIND.task && isMine(n));
  let filter = prefs.get('homeFilter', 'in_progress');
  if (!FILTERS.some((f) => f.key === filter)) filter = 'in_progress';
  const f = FILTERS.find((x) => x.key === filter);
  const list = ordered(mine.filter((t) => f.match(t.status)));

  const head = el('div', { class: 'sec-head' },
    el('h2', { class: 'h2' }, 'My work'),
    el('div', { class: 'filters', role: 'group', 'aria-label': 'Filter my work' },
      FILTERS.map((x) => el('button', {
        class: 'fp', type: 'button', 'aria-pressed': String(x.key === filter),
        onclick: () => { prefs.set('homeFilter', x.key); showAll = false; go('/home', { keepTask: true }); },
      }, x.label, el('b', {}, String(mine.filter((t) => x.match(t.status)).length))))),
    el('span', { class: 'sp' }),
    !isPhone() && list.length > 1 ? el('span', { class: 'meta' }, 'Drag tiles to reorder') : null);

  const sec = el('section', { class: 'sec', 'aria-label': 'My work' }, head);
  if (!list.length) {
    sec.append(el('div', { class: 'empty' }, emptyLine(filter)));
  } else {
    const grid = el('div', { class: 'grid' });
    list.forEach((t, i) => grid.append(tile(t, {
      path: true,
      menuExtra: [
        { label: 'Move earlier', icon: 'back', disabled: i === 0, onSelect: () => A.setHomeOrder(moveIn(list, i, i - 1)) },
        { label: 'Move later', icon: 'chevRight', disabled: i === list.length - 1, onSelect: () => A.setHomeOrder(moveIn(list, i, i + 1)) },
      ],
    })));
    enableDrag(grid, {
      onDrop: (dragId, targetId, where) => {
        const ids = list.map((t) => t.id).filter((id) => id !== dragId);
        const at = ids.indexOf(targetId) + (where === 'after' ? 1 : 0);
        ids.splice(at, 0, dragId);
        A.setHomeOrder(ids);
      },
      validate: false,          // Home's own order, not a move in the tree
    });
    sec.append(grid);
    // Two rows, unless asked for all: measured once the grid has its width.
    const more = el('div', { class: 'more-row' });
    sec.append(more);
    requestAnimationFrame(() => {
      const limit = columns(grid) * 2;
      if (list.length <= limit) return;
      const tiles = [...grid.children];
      tiles.forEach((n, i) => { n.hidden = !showAll && i >= limit; });
      more.append(btn(showAll ? 'Show fewer' : `Show all (${list.length})`, () => {
        showAll = !showAll;
        tiles.forEach((n, i) => { n.hidden = !showAll && i >= limit; });
        more.firstChild.textContent = showAll ? 'Show fewer' : `Show all (${list.length})`;
      }, { cls: 'ghost sm' }));
    });
  }
  inner.append(sec);

  // ── Backlog ──
  const pool = backlogPool();
  const bsec = el('section', { class: 'sec', 'aria-label': 'Backlog' },
    el('div', { class: 'sec-head' },
      el('h2', { class: 'h2' }, 'Backlog'),
      el('span', { class: 'meta' }, isPhone() ? 'Rotates daily' : `Rotates daily · jobs untouched ${backlogDays()} days or more`),
      el('span', { class: 'sp' }),
      pool.length ? btn(backlogAll ? 'Back to today\'s pick' : `See all ${pool.length}`, () => { backlogAll = !backlogAll; go('/home', { keepTask: true }); }, { cls: 'ghost sm' }) : null));
  if (!pool.length) {
    bsec.append(el('div', { class: 'empty' }, `Nothing has sat untouched for ${backlogDays()} days. Well kept.`));
  } else if (backlogAll) {
    const grid = el('div', { class: 'grid' });
    [...pool].sort((a, b) => String(a.lastActivityAt).localeCompare(String(b.lastActivityAt)))
      .forEach((t) => grid.append(backlogTile(t, pool)));
    bsec.append(grid);
  } else {
    const rowEl = el('div', { class: 'backlog-row' });
    const pick = BL.todaysBacklog(pool);
    pick.forEach((t) => rowEl.append(backlogTile(t, pool)));
    bsec.append(rowEl);
    // One row: as many as fit. The phone row scrolls sideways instead.
    requestAnimationFrame(() => {
      if (isPhone()) return;
      const n = columns(rowEl);
      [...rowEl.children].forEach((c, i) => { c.hidden = i >= n; });
    });
  }
  inner.append(bsec);
}

function backlogTile(t, pool) {
  // Hiding is for an item whose job (or a job above it) is in the Backlog too: it stops the doubling up.
  const hide = BL.canHideFromBacklog(state.idx, t.id, pool);
  return tile(t, {
    path: true, variant: 'backlog',
    menuExtra: hide ? [{ label: 'Hide from the Backlog', icon: 'hide', onSelect: () => A.setBacklogIgnored(t.id, true) }] : [],
  });
}

function moveIn(list, from, to) {
  const ids = list.map((t) => t.id);
  const [x] = ids.splice(from, 1);
  ids.splice(to, 0, x);
  return ids;
}

function emptyLine(filter) {
  if (filter === 'waiting') return 'Nothing of yours is waiting on anyone.';
  if (filter === 'fix') return 'Nothing sent back to fix.';
  return el('span', {}, el('strong', {}, 'Nothing in progress. '), 'Start something from the Backlog below, or from Tasks: Start is one tap.');
}

function loading() {
  const grid = el('div', { class: 'grid', 'aria-busy': 'true', 'aria-label': 'Loading' });
  for (let i = 0; i < 6; i++) grid.append(el('div', { class: 'skel' }));
  return el('section', { class: 'sec' }, el('h2', { class: 'h2' }, 'My work'), grid);
}

export function errorState() {
  return el('div', { class: 'state-msg', role: 'alert' },
    el('h1', { class: 'h1' }, 'Your tasks did not load'),
    el('p', {}, String(state.error?.message ?? state.error)),
    el('p', {}, 'If you are offline, they load when the connection is back. Otherwise reload the page.'),
    el('div', {}, btn('Reload', () => location.reload())));
}

/** First run: nothing in the tree yet. */
export function welcome() {
  const local = state.mode === 'local';
  return el('section', { class: 'welcome' },
    el('h1', { class: 'h1' }, 'Nothing here yet'),
    el('p', {}, 'Bring in your TileDo data and the Excel tracker, or start fresh with a master category such as Production and the categories inside it.'),
    el('div', { class: 'acts' },
      btn('Import TileDo or Excel', () => go('/import'), { cls: 'primary', ic: 'upload' }),
      btn('New master category', newMasterCategory, { ic: 'folderPlus' }),
      local ? btn('Load sample data', async () => (await import('../sample.js')).loadSample(), { cls: 'ghost', title: 'Invented jobs to try the app with. Local mode only.' }) : null),
    local ? el('p', { class: 'hint' }, 'Local mode: everything is saved in this browser only, until the Firebase project is set up.') : null);
}
