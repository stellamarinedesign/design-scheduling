// app.js — the shell: sign-in gate, the live tree, the router, and drawing
// the sidebar, the view and the panel whenever any of them changes.
//
// WHAT EACH ROLE SEES (decided 2026-11-04): the Design lead has Home ·
// Tasks · Progress · Team · Log and the category sidebar; a designer has
// Tasks (their own action-first list) · Progress (read-only, 2026-11-09) ·
// Log, and no Home; a contributor the Log only; a
// manager contributor Jobs · Log. The tabs are drawn from the role
// (router.js ROLE_TABS), and a link to a tab the role does not have lands on
// the role's own first tab. Hiding is tidiness: firestore.rules is what
// enforces it.

import { VERSION } from './version.js';
import { Auth, setAccess, currentAccess, ROLE, setLocalRole } from './auth.js';
import { ROLE_LABEL } from './access.js';
import { Store } from './store.js';
import { skipNextLoad } from './saved-copy.js';
import { state, subscribe, setNodes, setError, allNotes } from './state.js';
import { initRouter, route, go, currentTab, roleTabs, isSpecial, closePanel } from './router.js';
import { el, btn, icon, isWide, closeMenu, installContextMenus, countText, plainWhy } from './ui.js';
import * as A from './actions.js';
import * as TM from './team.js';
import * as TR from './timer.js';
import { renderSidebar } from './views/sidebar.js';
import { renderHome } from './views/home.js';
import { renderTasks, viewTitle } from './views/tasks.js';
import { renderMyTasks } from './views/mytasks.js';
import { renderTeam } from './views/team.js';
import { renderProgress } from './views/progress.js';
import { renderPanel, panelEditing, panelUp } from './views/panel.js';
import { renderLog } from './views/log.js';
import { renderJobs, renderJobSheet } from './views/jobs.js';
import { renderNotePanel } from './views/note-panel.js';
import { openComposer } from './views/composer.js';
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
  progress: { label: 'Progress', icon: 'register' },
  team: { label: 'Team', icon: 'team' },
  log: { label: 'Log', icon: 'log' },
  jobs: { label: 'Design jobs', icon: 'tasks' },   // "jobs" on the board are production orders (owner, 2026-11-23)
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
const manager = () => state.role === ROLE.MANAGER;
const openSearch = () => { if (lead() || designer()) searchNow(); };
/**
 * The one way to add, by where you are: on the Log a note (anyone); else a
 * job for the lead, a task of their own for a designer.
 */
const quickAdd = (opts) => {
  if (currentTab() === 'log' && !(lead() && isSpecial())) return openComposer();
  if (lead()) return openQuickAdd(opts ?? {});
  if (designer()) return openQuickAdd({ ...(opts ?? {}), own: true });
  return null;
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
  if (document.querySelector('.overlay.show, .menu, .lightbox')) return;
  if (e.key === 'Escape') {
    if (sideOpen) { setSide(false); return; }
    if (state.noteId && !typing(e.target)) { closePanel(); return; }
    // The panel is a page you drill into: Esc goes up one level, and closes it from a job.
    // A manager's job sheet is one page: Esc closes it.
    if (state.openId && !typing(e.target)) { if (manager()) closePanel(); else panelUp(); return; }
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

/** A role with no page here (every role has the Log, so this is a fallback only). */
function comingSoon(root) {
  root.append(el('div', { class: 'view-inner' }, el('div', { class: 'state-msg' },
    el('h1', { class: 'h1' }, `Signed in as ${ROLE_LABEL[state.role] ?? state.role}`),
    el('p', {}, 'Nothing here is for your account. The Log is under Log.'))));
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
  // The skeleton index.html painted while the app started is gone now.
  view.removeAttribute('aria-busy');
  view.removeAttribute('aria-label');
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
  else if (tab === 'progress') renderProgress(view);
  else if (tab === 'tasks') { if (lead()) renderTasks(view, p[0] === 'tasks' ? (p[1] ?? null) : null); else renderMyTasks(view); }
  else if (tab === 'log') renderLog(view);
  else if (tab === 'jobs') renderJobs(view);
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

/**
 * What needs this person, as a count on a tab: for the lead, checks and the
 * Log's open issues and ideas; for a designer, send-backs.
 */
const COUNT_WORDS = { team: 'ready for check', tasks: 'sent back', log: 'open in the Log' };
function tabCounts() {
  if (!state.ready) return {};
  if (lead()) return { team: TM.checkQueue(state.idx).length, log: state.log.triage.filter((n) => n.state === 'open').length };
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
    if (c) { c.hidden = !n; c.textContent = countText(n); }
    a.setAttribute('aria-label', n ? `${TABS[a.dataset.tab]?.label}, ${n} ${COUNT_WORDS[a.dataset.tab] ?? ''}` : TABS[a.dataset.tab]?.label ?? '');
  }
  const title = special ? (route.parts[0] === 'archive' ? 'Archive' : 'Import')
    : tab === 'home' ? 'Home' : tab === 'team' ? 'Team' : tab === 'log' ? 'Log' : tab === 'jobs' ? 'Design jobs' : tab === 'progress' ? 'Progress'
      : tab === 'tasks' ? (lead() ? viewTitle(route.parts[0] === 'tasks' ? route.parts[1] : null) : 'Tasks') : 'Design Scheduling';
  // The + button adds what this page holds: a note on the Log; a job or a task elsewhere.
  const onLog = tab === 'log' && !special;
  $('fab').hidden = !(onLog || lead() || designer());
  $('fab').setAttribute('aria-label', onLog ? 'New note' : lead() ? 'New job' : 'Add a task of your own');
  $('hdView').textContent = title;
  document.title = title === 'Design Scheduling' ? title : `${title} · Design Scheduling`;
}

/** On a phone the panel is a full-screen sheet: nothing behind it may take focus. */
function setBehindInert(on) {
  for (const n of [view, side, $('tabbar'), $('fab'), document.querySelector('.hd')]) if (n) n.inert = on;
}

let lastNote = null;
// A Log note or a manager's job sheet holding a field being typed in is not
// redrawn under the cursor; it catches up once the field lets go (the task
// panel does the same itself, in panel.js).
let sheetStale = false;
const typingInPanel = () => panel.contains(document.activeElement) && document.activeElement.matches('textarea, input:not([type=checkbox])');
panel.addEventListener('focusout', () => setTimeout(() => {
  if (sheetStale && !typingInPanel() && (state.noteId || manager())) { sheetStale = false; drawPanel(); }
}, 0));
function drawPanel(meta = {}) {
  const id = state.openId;
  setBehindInert(Boolean(id || state.noteId) && window.matchMedia('(max-width: 699px)').matches);
  // A Log note: anyone listed may read one.
  if (state.noteId) {
    if (lastNote === state.noteId && typingInPanel()) { sheetStale = true; return; }
    panel.hidden = false;
    renderNotePanel(panel, state.noteId, { fresh: lastNote !== state.noteId });
    lastNote = state.noteId;
    lastOpen = null;
    return;
  }
  lastNote = null;
  // A manager's sheet: a shared job, read-only, with their notes on it.
  if (id && manager()) {
    if (lastOpen === id && typingInPanel()) { sheetStale = true; return; }
    panel.hidden = false;
    renderJobSheet(panel, id, { fresh: lastOpen !== id });
    lastOpen = id;
    return;
  }
  panel.setAttribute('aria-label', 'Task details');
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
  if (lead()) renderSidebar(side, { notes: allNotes() });
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

/** Something real is on screen: the start-up watch (startwatch.js) ends. */
const bootDone = () => window.__boot?.finish();

/** It could not start: why, in plain words, and the way to try again. */
function couldNotStart(e) {
  console.error(e);
  bootDone();
  view.textContent = '';
  view.removeAttribute('aria-busy');
  view.removeAttribute('aria-label');
  view.append(el('div', { class: 'view-inner' }, el('div', { class: 'state-msg', role: 'alert' },
    el('h1', { class: 'h1' }, 'Design Scheduling could not start'),
    el('p', {}, `${plainWhy(e).replace(/^./, (ch) => ch.toUpperCase())}.`),
    el('p', {}, 'Reload the page. If it keeps happening, close the app fully and open it again.'),
    el('div', { class: 'row' }, btn('Reload page', () => location.reload())))));
}

async function boot() {
  console.info(`Design Scheduling ${VERSION}`);
  await Auth.init(async ({ mode, email }) => {
    if (mode === 'firebase' && !email) {
      // No user (hub-bridge.js noUserAction): reload if the page had started
      // (the session went while it was open, and the reload asks the hub
      // again); nothing if the hub's full-screen card is up; the app's copy
      // of its "cannot be reached" card if it could not draw one; the old
      // form only off the live site.
      const { noUserAction, HUB_SITE } = await import('./hub-bridge.js');
      const act = noUserAction({
        started: state.started, hubState: Auth.hubState,
        onSite: location.hostname === HUB_SITE, hubCard: Boolean(document.querySelector('.shub-screen')),
      });
      if (act === 'reload') { location.reload(); return; }
      bootDone();
      if (act === 'nothing') return;
      const view = await import('./views/signin.js');
      if (act === 'cannot') view.renderCannotReach(document.getElementById('app'));
      else view.renderSignIn(document.getElementById('app'));
      return;
    }
    if (mode === 'firebase' && email && !state.started) await start().catch(couldNotStart);
  });
  if (Auth.mode === 'local') await start();
}

// After the server's access list changed this person's role, the next load
// reads the list from the server, not the device's copy (confirmAccess). The
// note goes in session storage; where that is blocked, in the address
// (`?access=server`). Without it, an account taken off the lists would load
// the device's copy again, be refused again, and go round reloading.
const ACCESS_FROM_SERVER = 'stella.design.accessFromServer';
const SERVER_MARK = 'access';
const session = {
  take(k) { try { const v = sessionStorage.getItem(k); sessionStorage.removeItem(k); return v; } catch { return null; } },
  put(k, v) { try { sessionStorage.setItem(k, v); return sessionStorage.getItem(k) === v; } catch { return false; } },
};

/** Is this load to read the access list from the server? Either note, taken once. */
function takeFromServer() {
  const q = new URLSearchParams(location.search);
  const inAddress = q.get(SERVER_MARK) === 'server';
  if (inAddress) {
    q.delete(SERVER_MARK);
    history.replaceState(history.state, '', `${location.pathname}${q.toString() ? `?${q}` : ''}${location.hash}`);
  }
  return session.take(ACCESS_FROM_SERVER) === '1' || inAddress;
}

/** Load again, reading the access list from the server. */
function restartFromServer() {
  if (session.put(ACCESS_FROM_SERVER, '1')) { location.reload(); return; }
  const q = new URLSearchParams(location.search);
  q.set(SERVER_MARK, 'server');
  location.replace(`${location.pathname}?${q}${location.hash}`);
}

/**
 * The access list came from this device's copy, so the app could draw
 * without waiting on the network. The server's copy decides: the same role
 * carries on with it (new names, new people to assign), and a changed role -
 * or an account taken off the lists, which may no longer read it - starts the
 * app again from the server's copy. Not reachable: the device's copy stands,
 * the strip says the data is unconfirmed, and this runs again once the server
 * answers (start). A check that fails anyway - the connection came back and
 * went again - is tried again in half a minute, until one gets an answer.
 */
let confirming = false;
let confirmAgain = null;
async function confirmAccess() {
  if (confirming || !Store.accessFromCache) return;
  confirming = true;
  clearTimeout(confirmAgain);
  const r = await Store.confirmAccess();
  confirming = false;
  if (r.failed) { confirmAgain = setTimeout(confirmAccess, 30000); return; }
  Store.accessFromCache = false;
  console.info('[access] confirmed by the server');
  if (r.refused) { restartFromServer(); return; }
  const was = state.role;
  setAccess(r.access);
  Auth.refreshRole();
  if (Auth.role !== was) { restartFromServer(); return; }
  state.access = currentAccess();
  drawAll();
}

async function start() {
  state.started = true;
  state.mode = await Store.init();
  // A saved copy that does not answer would hold up everything below: load
  // again, once, without it (saved-copy.js).
  if (!(await Store.savedCopyAnswers())) {
    console.warn('[store] the saved copy on this device did not answer');
    if (skipNextLoad()) { location.reload(); return; }
  }
  // The device's copy of the access list first (store.js loadAccess), unless
  // the last load found the role had changed. A copy that lists this person
  // nowhere is never trusted: they may have been added since, so the server
  // decides that one before anything is drawn.
  const fromServer = takeFromServer();
  setAccess(await Store.loadAccess({ cacheFirst: !fromServer }));
  if (Auth.mode === 'firebase') Auth.refreshRole();
  if (Store.accessFromCache && Auth.role === ROLE.NONE) {
    setAccess(await Store.loadAccess());
    Auth.refreshRole();
  }
  if (Store.accessFromCache) console.info('[access] started from this device\'s copy; checking it with the server');
  state.access = currentAccess();
  state.me = Auth.me;
  state.role = Auth.role;
  if (Auth.mode === 'firebase' && Auth.role === ROLE.NONE) {
    bootDone();
    // The list could not be read: that is not the same as not being on it.
    if (Store.accessError) { couldNotStart(Store.accessError); return; }
    (await import('./views/signin.js')).renderNotListed(document.getElementById('app'), Auth.user?.email, { canClaim: Store.accessMissing === true });
    return;
  }
  const app = document.getElementById('app');
  app.dataset.role = state.role;
  drawTabs();
  // Searching is for those who read tasks; the + button follows the page (drawChrome).
  const works = lead() || designer();
  $('searchField').hidden = !works;
  $('searchBtn').hidden = !works;
  const note = $('modeNote');
  // The strip under the header says where changes go: this browser only
  // (local mode), or - with Firebase - that the connection is down and
  // changes are held until it is back (Firestore queues them), or that the
  // screen shows this device's saved copy because the server has not
  // answered (store.js `fresh`). A repeat open shows the saved copy for a
  // moment on every load, so that is said only after a few seconds of it.
  let unconfirmed = false;
  let unconfirmedTimer = null;
  // Only once the data is drawn: until then there is no saved copy to speak
  // of, and the start-up watch speaks (startwatch.js).
  const kept = () => (Store.keepsOffline ? 'Changes are kept on this device and sent when the connection is back.'
    : 'Keep this page open: changes are sent when the connection is back, and lost if it is closed first.');
  const sayMode = () => {
    const live = state.mode !== 'local';
    const offline = live && state.ready && !navigator.onLine;
    const stale = live && state.ready && !offline && unconfirmed;
    note.hidden = live && !offline && !stale;
    if (!live) localStrip(note);
    else note.textContent = offline ? `Offline: showing saved data. ${kept()}`
      : stale ? `Showing saved data: the server has not answered yet, so some of it may be out of date. ${kept()}` : '';
  };
  sayMode();
  window.addEventListener('online', sayMode);
  window.addEventListener('offline', sayMode);
  Store.watchFreshness((fresh) => {
    clearTimeout(unconfirmedTimer);
    if (fresh) {
      if (unconfirmed) { unconfirmed = false; sayMode(); }
      // The server answers: an access list taken from the device's copy is checked now.
      confirmAccess();
    } else {
      unconfirmedTimer = setTimeout(() => { unconfirmed = true; sayMode(); }, 4000);
    }
  });

  initRouter(() => { closeMenu(); drawAll(); });
  // Some controls differ by width band (a phone folds switches into menus):
  // crossing the phone breakpoint - a rotated phone, a resized window -
  // draws again.
  window.matchMedia('(max-width: 699px)').addEventListener('change', () => { closeMenu(); drawAll(); });
  let drawn = false;
  subscribe((meta) => {
    drawAll(meta);
    // The first answer (or why there is none) is on screen: the watch ends.
    if (!drawn && (state.ready || state.error)) { drawn = state.ready; bootDone(); sayMode(); }
    if (!state.reconciled && state.ready) { state.reconciled = true; A.reconcileOnLoad(); }
    A.ensureInboxes();
    A.ensureSharing();
    A.reconcileNotes();
    // A change to the tree can stop or move a timer (a task done, the job submitted).
    if (!meta.time) TR.check();
  });
  // A name that arrives late also puts right a designer's group named from
  // the address before it did (team.js inboxRepairs).
  Store.watchPeople((people) => { state.people = people; if (state.ready) { drawAll(); A.ensureInboxes(); } });
  drawAll();
  // A contributor or a manager reads no tasks, only the categories (the
  // rules refuse the rest): the Log's category picker and paths need them.
  // A manager also reads the jobs the lead shared (and, for those shared
  // with their stage, the steps).
  if (works) Store.watchTasks((nodes, meta) => setNodes(nodes, meta), (e) => setError(e));
  else if (manager()) Store.watchShared((nodes, meta) => setNodes(nodes, meta), (e) => setError(e));
  else Store.watchGroups((nodes, meta) => setNodes(nodes, meta), (e) => setError(e));
  // Everyone listed has the Log.
  A.startLog();
  // Time tracking: the lead's and designers' timers (timer.js).
  if (works) TR.startTimers();
  // Where Stella Systems opens on the web, for folder links on a phone.
  if (works) Store.watchLibrary((address) => { if (address !== state.library) { state.library = address; if (state.ready) drawAll(); } });

  // ?capture=1 (the PC helper's hotkey, tools/pc-helper): straight into
  // quick add. With close=1 it is the hotkey's own small window, which goes
  // once the box is done with - unless the new job was opened to work on.
  // A browser closes only a window with nothing behind it in its history: the
  // helper opens it at #/home, and nothing here adds an entry first.
  const ask = new URLSearchParams(location.search);
  if (ask.get('capture') === '1') {
    history.replaceState(null, '', location.pathname + location.hash);
    const added = quickAdd({ capture: true });
    if (ask.get('close') === '1') {
      Promise.resolve(added).then((id) => { if (!state.openId) setTimeout(() => window.close(), id ? 1200 : 0); });
    }
  }
  if (!location.hash && roleTabs().length) go(`/${roleTabs()[0]}`);
}

boot().catch(couldNotStart);
