// app.js — the shell: sign-in gate, the live tree, the router, and drawing
// the sidebar, the view and the panel whenever any of them changes.
//
// WHAT EACH ROLE SEES (decided 2026-11-04): the Design lead has Home ·
// Tasks · Team · Log and the category sidebar; a designer has Tasks (their
// own action-first list) · Log, and no Home; a contributor the Log only; a
// manager contributor Jobs · Log. The tabs are drawn from the role
// (router.js ROLE_TABS), and a link to a tab the role does not have lands on
// the role's own first tab. Hiding is tidiness: firestore.rules is what
// enforces it.

import { VERSION } from './version.js';
import { Auth, setAccess, currentAccess, ROLE, setLocalRole } from './auth.js';
import { ROLE_LABEL } from './access.js';
import { Store } from './store.js';
import { state, subscribe, setNodes, setError } from './state.js';
import { initRouter, route, go, currentTab, roleTabs, isSpecial } from './router.js';
import { el, icon, isWide, closeMenu, installContextMenus } from './ui.js';
import * as A from './actions.js';
import * as TM from './team.js';
import { renderSidebar } from './views/sidebar.js';
import { renderHome } from './views/home.js';
import { renderTasks, viewTitle } from './views/tasks.js';
import { renderMyTasks } from './views/mytasks.js';
import { renderTeam } from './views/team.js';
import { renderPanel, panelEditing, panelUp } from './views/panel.js';
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

const TABS = {
  home: { label: 'Home', icon: 'home' },
  tasks: { label: 'Tasks', icon: 'tasks' },
  team: { label: 'Team', icon: 'team' },
};

$('menuBtn').append(icon('menu', 20));
$('searchBtn').append(icon('search', 20));
$('cogBtn').append(icon('cog', 20));
$('fab').append(icon('plus', 24));
$('newJob').append(icon('plus', 16), 'New job');
$('searchField').append(icon('search', 16), el('span', {}, 'Search jobs and tasks'), el('kbd', {}, 'Ctrl K'));

/** The tabs this role has, in the header and the phone's bottom bar, each with a count bubble. */
function drawTabs() {
  const tabs = $('tabs');
  const bar = $('tabbar');
  tabs.textContent = '';
  bar.textContent = '';
  for (const key of roleTabs()) {
    const t = TABS[key];
    tabs.append(el('a', { class: 'tab', href: `#/${key}`, dataset: { tab: key } }, t.label, el('span', { class: 'count', hidden: true })));
    bar.append(el('a', { href: `#/${key}`, dataset: { tab: key } }, el('span', { class: 'tb-ic' }, icon(t.icon, 22), el('span', { class: 'count', hidden: true })), t.label));
  }
  // One tab is no choice: no bar for it.
  bar.hidden = roleTabs().length < 2;
  document.getElementById('app').classList.toggle('no-tabbar', roleTabs().length < 2);
}

installContextMenus();

const lead = () => state.role === ROLE.LEAD;
const designer = () => state.role === ROLE.DESIGNER;
const openSearch = () => { if (lead() || designer()) searchNow(); };
/** The one way to add: a job for the lead, a task of their own for a designer. */
const quickAdd = (opts) => {
  if (lead()) openQuickAdd(opts ?? {});
  else if (designer()) openQuickAdd({ ...(opts ?? {}), own: true });
};
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
    // The panel is a page you drill into: Esc goes up one level, and closes it from a job.
    if (state.openId && !typing(e.target)) { panelUp(); return; }
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
let lastPath = null;

/** A role whose own view arrives with a later milestone. */
function comingSoon(root) {
  root.append(el('div', { class: 'view-inner' }, el('div', { class: 'state-msg' },
    el('h1', { class: 'h1' }, `Signed in as ${ROLE_LABEL[state.role] ?? state.role}`),
    el('p', {}, state.role === ROLE.CONTRIBUTOR
      ? 'The Log, where you post photo notes, is on its way. Nothing else here is for your account.'
      : 'Your Jobs list and the Log are on their way.'))));
}

function drawView() {
  // Keep the scroll position and the focused control across a redraw: the
  // live query redraws on every write, including your own.
  const top = view.scrollTop;
  const fk = document.activeElement?.closest?.('#view [data-fk]')?.dataset.fk;
  // A field typed in (a search that filters as you type) keeps its caret too.
  const ae = document.activeElement;
  const caret = fk && typeof ae?.selectionStart === 'number' ? [ae.selectionStart, ae.selectionEnd] : null;
  view.textContent = '';
  const tab = currentTab();
  const p = route.parts;
  // The archive and import pages load on demand. A later draw (Apply moving
  // on to Tasks) can overtake the load, so a late arrival checks it is still
  // the latest draw before it paints.
  const mine = ++drawn;
  const late = (fn) => (m) => { if (mine === drawn) { view.textContent = ''; fn(m); } };
  if (lead() && p[0] === 'archive') import('./views/archive.js').then(late((m) => m.renderArchive(view)));
  else if (lead() && p[0] === 'import') import('./views/import.js').then(late((m) => m.renderImport(view)));
  else if (tab === 'home') renderHome(view);
  else if (tab === 'team') renderTeam(view);
  else if (tab === 'tasks') { if (lead()) renderTasks(view, p[0] === 'tasks' ? (p[1] ?? null) : null); else renderMyTasks(view); }
  else comingSoon(view);
  // A redraw of the same page keeps its place; another page starts at the top.
  view.scrollTop = lastPath === route.path ? top : 0;
  lastPath = route.path;
  if (fk) {
    const f = view.querySelector(`[data-fk="${CSS.escape(fk)}"]`);
    f?.focus({ preventScroll: true });
    if (caret && typeof f?.setSelectionRange === 'function') { try { f.setSelectionRange(...caret); } catch { /* not a text field */ } }
  }
}

/** What needs this person, as a count on a tab: checks for the lead, send-backs for a designer. */
function tabCounts() {
  if (!state.ready) return {};
  if (lead()) return { team: TM.checkQueue(state.idx).length };
  if (designer()) return { tasks: state.idx.nodes.filter((n) => n.kind === 'task' && n.assignee === state.me && n.status === 'fix').length };
  return {};
}

function drawChrome() {
  const tab = currentTab();
  const special = lead() && isSpecial();
  const counts = tabCounts();
  for (const a of document.querySelectorAll('[data-tab]')) {
    const on = !special && a.dataset.tab === tab;
    a.toggleAttribute('aria-current', on);
    if (on) a.setAttribute('aria-current', 'page');
    const c = a.querySelector('.count');
    const n = counts[a.dataset.tab] ?? 0;
    if (c) { c.hidden = !n; c.textContent = String(n); }
    a.setAttribute('aria-label', n ? `${TABS[a.dataset.tab]?.label}, ${n} ${a.dataset.tab === 'team' ? 'ready for check' : 'sent back'}` : TABS[a.dataset.tab]?.label ?? '');
  }
  const title = special ? (route.parts[0] === 'archive' ? 'Archive' : 'Import')
    : tab === 'home' ? 'Home' : tab === 'team' ? 'Team' : tab === 'tasks' ? (lead() ? viewTitle(route.parts[0] === 'tasks' ? route.parts[1] : null) : 'Tasks') : 'Design Scheduling';
  $('hdView').textContent = title;
  document.title = title === 'Design Scheduling' ? title : `${title} · Design Scheduling`;
}

/** On a phone the panel is a full-screen sheet: nothing behind it may take focus. */
function setBehindInert(on) {
  for (const n of [view, side, $('tabbar'), $('fab'), document.querySelector('.hd')]) if (n) n.inert = on;
}

function drawPanel(meta = {}) {
  const id = state.openId;
  setBehindInert(Boolean(id) && window.matchMedia('(max-width: 699px)').matches);
  if (!id || !(lead() || designer())) { panel.hidden = true; panel.textContent = ''; lastOpen = null; return; }
  // A field being edited is never clobbered by the echo of a write (yours or
  // another device's); the panel redraws once the field lets go.
  if (lastOpen === id && panelEditing()) return;
  panel.hidden = false;
  renderPanel(panel, id, { fresh: lastOpen !== id, meta });
  lastOpen = id;
}

function drawAll(meta = {}) {
  // A link to a tab this role does not have lands on the role's own first tab.
  const p0 = route.parts[0];
  if (p0 && !roleTabs().includes(p0) && !(lead() && isSpecial()) && roleTabs().length) {
    location.replace(`#/${roleTabs()[0]}`);
    return;
  }
  drawChrome();
  if (lead()) renderSidebar(side);
  drawView();
  drawPanel(meta);
}

// ---------------------------------------------------------------------------
// local mode: who this browser is viewing as
// ---------------------------------------------------------------------------

/** The local-mode strip, with "View as" so every role's screens can be checked. Local only. */
function localStrip(note) {
  note.textContent = '';
  const sel = el('select', { class: 'sel', 'aria-label': 'View as' },
    Object.keys(TM.LOCAL_AS).map((r) => el('option', { value: r, selected: r === state.role }, r === 'lead' ? ROLE_LABEL[r] : `${ROLE_LABEL[r]} (${TM.nameFor(TM.LOCAL_PEOPLE, TM.LOCAL_AS[r])})`)));
  sel.addEventListener('change', () => { setLocalRole(sel.value); location.hash = ''; location.reload(); });
  note.append(el('span', { class: 'mode-text' }, Store.reason), el('label', { class: 'view-as' }, el('span', {}, 'View as'), sel));
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
  setAccess(await Store.loadAccess());
  if (Auth.mode === 'firebase') Auth.refreshRole();
  state.access = currentAccess();
  state.me = Auth.me;
  state.role = Auth.role;
  if (Auth.mode === 'firebase' && Auth.role === ROLE.NONE) {
    (await import('./views/signin.js')).renderNotListed(document.getElementById('app'), Auth.user?.email, { canClaim: Store.accessMissing === true });
    return;
  }
  const app = document.getElementById('app');
  app.dataset.role = state.role;
  drawTabs();
  // Adding and searching are for those who read and write tasks.
  const works = lead() || designer();
  $('fab').hidden = !works;
  $('fab').setAttribute('aria-label', lead() ? 'New job' : 'Add a task of your own');
  $('searchField').hidden = !works;
  $('searchBtn').hidden = !works;
  const note = $('modeNote');
  // The strip under the header says where changes go: this browser only
  // (local mode), or - with Firebase - that the connection is down and
  // changes are held until it is back (Firestore queues them).
  const sayMode = () => {
    const offline = state.mode !== 'local' && !navigator.onLine;
    note.hidden = state.mode !== 'local' && !offline;
    if (state.mode === 'local') localStrip(note);
    else note.textContent = offline ? 'Offline. Changes are kept on this device and sent when the connection is back.' : '';
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
    A.ensureInboxes();
  });
  Store.watchPeople((people) => { state.people = people; if (state.ready) drawAll(); });
  drawAll();
  // A contributor reads no tasks at all (the rules refuse them): no live tree.
  if (lead() || designer() || state.role === ROLE.MANAGER) {
    if (state.role === ROLE.MANAGER) setNodes([]);
    else Store.watchTasks((nodes, meta) => setNodes(nodes, meta), (e) => setError(e));
  } else setNodes([]);

  // ?capture=1 (the AutoHotkey hotkey, Phase 4): straight into quick add.
  if (new URLSearchParams(location.search).get('capture') === '1') {
    history.replaceState(null, '', location.pathname + location.hash);
    quickAdd({ capture: true });
  }
  if (!location.hash && roleTabs().length) go(`/${roleTabs()[0]}`);
}

boot().catch((e) => {
  console.error(e);
  view.textContent = '';
  view.append(el('div', { class: 'state-msg' },
    el('h1', { class: 'h1' }, 'Design Scheduling could not start'),
    el('p', {}, String(e?.message ?? e)),
    el('p', {}, 'Reload the page. If it keeps happening, the browser console has the detail.')));
});
