// app.js — the shell: sign-in gate, the live tree, the router, and drawing
// the sidebar, the view and the panel whenever any of them changes.

import { VERSION } from './version.js';
import { Auth, setAccess, ROLE } from './auth.js';
import { Store } from './store.js';
import { state, subscribe, setNodes, setError } from './state.js';
import { initRouter, route, go, currentTab, closePanel } from './router.js';
import { el, icon, isWide, closeMenu, installContextMenus } from './ui.js';
import * as A from './actions.js';
import { renderSidebar } from './views/sidebar.js';
import { renderHome } from './views/home.js';
import { renderTasks, viewTitle } from './views/tasks.js';
import { renderPanel, panelEditing } from './views/panel.js';
// Loaded up front, not on demand: N (or the capture hotkey) is followed at
// once by typing, and keystrokes made while a module loads are lost.
import { openSearch as searchNow } from './views/search.js';
import { openQuickAdd } from './views/quick-add.js';

const $ = (id) => document.getElementById(id);
const view = $('view');
const side = $('side');
const panel = $('panel');

// ---------------------------------------------------------------------------
// header furniture
// ---------------------------------------------------------------------------

$('menuBtn').append(icon('menu', 20));
$('searchBtn').append(icon('search', 20));
$('cogBtn').append(icon('cog', 20));
$('fab').append(icon('plus', 24));
$('newJob').append(icon('plus', 16), 'New job');
$('searchField').append(icon('search', 16), el('span', {}, 'Search jobs and tasks'), el('kbd', {}, 'Ctrl K'));
const tabbar = document.querySelectorAll('.tabbar a');
tabbar[0].append(icon('home', 22), 'Home');
tabbar[1].append(icon('tasks', 22), 'Tasks');

installContextMenus();

const openSearch = () => searchNow();
const quickAdd = (opts) => openQuickAdd(opts ?? {});
$('searchField').addEventListener('click', openSearch);
$('searchBtn').addEventListener('click', openSearch);
$('newJob').addEventListener('click', () => quickAdd());
$('fab').addEventListener('click', () => quickAdd());
$('cogBtn').addEventListener('click', async () => (await import('./settings.js')).openSettings());

// The category pop-out, below 1100px.
let sideOpen = false;
let scrim = null;
function setSide(open) {
  sideOpen = open && !isWide();
  side.classList.toggle('open', sideOpen);
  $('menuBtn').setAttribute('aria-expanded', String(sideOpen));
  if (sideOpen && !scrim) {
    scrim = el('div', { class: 'scrim', onclick: () => setSide(false) });
    document.body.append(scrim);
    side.querySelector('a, button')?.focus();
  } else if (!sideOpen && scrim) { scrim.remove(); scrim = null; }
}
$('menuBtn').addEventListener('click', () => setSide(!sideOpen));
side.addEventListener('click', (e) => { if (e.target.closest('a')) setSide(false); });
window.matchMedia('(min-width: 1100px)').addEventListener('change', () => setSide(false));

// ---------------------------------------------------------------------------
// keyboard accelerators (every one also has a visible control)
// ---------------------------------------------------------------------------

const typing = (t) => t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); closeMenu(); openSearch(); return; }
  if (document.querySelector('.overlay.show, .menu')) return;
  if (e.key === 'Escape') {
    if (sideOpen) { setSide(false); return; }
    if (state.openId && !typing(e.target)) { closePanel(); return; }
  }
  if (typing(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key === 'n' || e.key === 'N') { e.preventDefault(); quickAdd(); }
  if (e.key === '/') { e.preventDefault(); openSearch(); }
});

// ---------------------------------------------------------------------------
// drawing
// ---------------------------------------------------------------------------

let lastOpen = null;
let drawn = 0;

function drawView() {
  // Keep the scroll position and the focused control across a redraw: the
  // live query redraws on every write, including your own.
  const top = view.scrollTop;
  const fk = document.activeElement?.closest?.('#view [data-fk]')?.dataset.fk;
  view.textContent = '';
  const tab = currentTab();
  const p = route.parts;
  // The archive and import pages load on demand. A later draw (Apply moving
  // on to Tasks) can overtake the load, so a late arrival checks it is still
  // the latest draw before it paints.
  const mine = ++drawn;
  const late = (fn) => (m) => { if (mine === drawn) { view.textContent = ''; fn(m); } };
  if (p[0] === 'archive') import('./views/archive.js').then(late((m) => m.renderArchive(view)));
  else if (p[0] === 'import') import('./views/import.js').then(late((m) => m.renderImport(view)));
  else if (tab === 'home') renderHome(view);
  else renderTasks(view, p[1] ?? null);
  view.scrollTop = top;
  if (fk) view.querySelector(`[data-fk="${CSS.escape(fk)}"]`)?.focus({ preventScroll: true });
}

function drawChrome() {
  const tab = currentTab();
  const special = route.parts[0] === 'archive' || route.parts[0] === 'import';
  for (const a of document.querySelectorAll('[data-tab]')) {
    a.toggleAttribute('aria-current', !special && a.dataset.tab === tab);
    if (!special && a.dataset.tab === tab) a.setAttribute('aria-current', 'page');
  }
  const title = route.parts[0] === 'archive' ? 'Archive' : route.parts[0] === 'import' ? 'Import' : tab === 'home' ? 'Home' : viewTitle(route.parts[1]);
  $('hdView').textContent = title;
  document.title = `${title} · Design Scheduling`;
}

/** On a phone the panel is a full-screen sheet: nothing behind it may take focus. */
function setBehindInert(on) {
  for (const n of [view, side, document.querySelector('.tabbar'), $('fab'), document.querySelector('.hd')]) if (n) n.inert = on;
}

function drawPanel(meta = {}) {
  const id = state.openId;
  setBehindInert(Boolean(id) && window.matchMedia('(max-width: 699px)').matches);
  if (!id) { panel.hidden = true; panel.textContent = ''; lastOpen = null; return; }
  // A field being edited is never clobbered by the echo of a write (yours or
  // another device's); the panel redraws once the field lets go.
  if (lastOpen === id && panelEditing()) return;
  panel.hidden = false;
  renderPanel(panel, id, { fresh: lastOpen !== id, meta });
  lastOpen = id;
}

function drawAll(meta = {}) {
  drawChrome();
  renderSidebar(side);
  drawView();
  drawPanel(meta);
}

// ---------------------------------------------------------------------------
// boot
// ---------------------------------------------------------------------------

async function boot() {
  console.info(`Design Scheduling ${VERSION}`);
  await Auth.init(async ({ mode, email }) => {
    if (mode === 'firebase' && !email) {
      (await import('./views/signin.js')).renderSignIn(document.getElementById('app'));
      return;
    }
    if (mode === 'firebase' && email && !state.started) await start();
  });
  if (Auth.mode === 'local') await start();
}

async function start() {
  state.started = true;
  state.mode = await Store.init();
  if (Auth.mode === 'firebase') {
    setAccess(await Store.loadAccess());
    Auth.refreshRole();
  }
  state.me = Auth.me;
  state.role = Auth.role;
  if (Auth.mode === 'firebase' && Auth.role === ROLE.NONE) {
    (await import('./views/signin.js')).renderNotListed(document.getElementById('app'), Auth.user?.email, { canClaim: Store.accessMissing === true });
    return;
  }
  const note = $('modeNote');
  // The strip under the header says where changes go: this browser only
  // (local mode), or - with Firebase - that the connection is down and
  // changes are held until it is back (Firestore queues them).
  const sayMode = () => {
    const offline = state.mode !== 'local' && !navigator.onLine;
    note.hidden = state.mode !== 'local' && !offline;
    note.textContent = offline ? 'Offline. Changes are kept on this device and sent when the connection is back.' : Store.reason;
  };
  sayMode();
  window.addEventListener('online', sayMode);
  window.addEventListener('offline', sayMode);

  initRouter(() => { closeMenu(); drawAll(); });
  // Some controls differ by width band (a phone folds switches into menus):
  // crossing the phone breakpoint - a rotated phone, a resized window -
  // draws again.
  window.matchMedia('(max-width: 699px)').addEventListener('change', () => { closeMenu(); drawAll(); });
  subscribe((meta) => {
    drawAll(meta);
    if (!state.reconciled && state.ready) { state.reconciled = true; A.reconcileOnLoad(); }
  });
  drawAll();
  Store.watchTasks((nodes, meta) => setNodes(nodes, meta), (e) => setError(e));

  // ?capture=1 (the AutoHotkey hotkey, Phase 4): straight into quick add.
  if (new URLSearchParams(location.search).get('capture') === '1') {
    history.replaceState(null, '', location.pathname + location.hash);
    quickAdd({ capture: true });
  }
  if (!location.hash) go('/home');
}

boot().catch((e) => {
  console.error(e);
  view.textContent = '';
  view.append(el('div', { class: 'state-msg' },
    el('h1', { class: 'h1' }, 'Design Scheduling could not start'),
    el('p', {}, String(e?.message ?? e)),
    el('p', {}, 'Reload the page. If it keeps happening, the browser console has the detail.')));
});
