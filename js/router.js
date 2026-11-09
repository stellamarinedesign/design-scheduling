// router.js — where you are, in the URL hash, so Back works and a link can be
// shared or bookmarked.
//
//   #/home                 Home (the Design lead)
//   #/tasks                Tasks: the full list (?c=<id> reveals a category);
//                          a designer's own action-first list
//   #/progress             Progress: the design register (the lead; designers
//                          read-only); ?c=<id> jumps to a category's section
//   #/team                 Team (the Design lead)
//   #/tasks/<id>           Focus: one category alone
//   #/tasks/top            jobs not in any category
//   #/archive, #/import    the archive, the staged import
//   #/log                  the Log (?c=<id> filters it to a category)
//   #/jobs                 a manager contributor's shared jobs
//   …?t=<id>               with the task panel open on <id>: a task, a step
//                          or a section inside a job
//   …?n=<id>               with the panel open on a Log note (one or the
//                          other: opening a note closes a task, and back)
//
// THE PANEL IS ONE NAVIGABLE PAGE (decided 2026-11-04, live test run).
// Opening a node pushes a history entry that remembers where it came from,
// so Back walks the drill path (and closes the panel from a job, which is
// what a phone user expects of a full-screen sheet). ← and Esc go UP one
// level: by Back when the entry before is the parent, by replacing the entry
// when the node was opened directly (a search, a link).

import { state } from './state.js';

export const route = { path: '/home', parts: ['home'], query: {} };
let listener = () => {};

function parse() {
  const h = location.hash.replace(/^#/, '') || '/home';
  const [p, q] = h.split('?');
  route.path = p.startsWith('/') ? p : `/${p}`;
  route.parts = route.path.split('/').filter(Boolean);
  route.query = Object.fromEntries(new URLSearchParams(q ?? ''));
  state.openId = route.query.t ?? null;
  state.noteId = state.openId ? null : route.query.n ?? null;
}

export function initRouter(onChange) {
  listener = onChange;
  window.addEventListener('hashchange', () => { parse(); listener(); });
  parse();
}

/** Draw again where you are (a filter changed that lives outside the URL). */
export const redraw = () => listener();

export const routeHref = (path, query = null) => {
  const q = query ? new URLSearchParams(query).toString() : '';
  return `#${path}${q ? `?${q}` : ''}`;
};

/** Go somewhere; the panel closes unless asked to stay. */
export function go(path, { keepTask = false } = {}) {
  const q = keepTask && state.openId ? { t: state.openId } : null;
  const next = routeHref(path, q);
  if (location.hash === next) listener();
  else location.hash = next;
}

const withTask = (id) => {
  const q = new URLSearchParams(route.query);
  q.delete('n');
  q.set('t', id);
  return `#${route.path}?${q}`;
};

/** Open the panel on a Log note, wherever you are. Pushes, so Back returns. */
export function openNote(id) {
  if (!id || id === state.noteId) return;
  const q = new URLSearchParams(route.query);
  q.delete('t');
  q.set('n', id);
  history.pushState({ from: null }, '', `#${route.path}?${q}`);
  parse();
  listener();
}

/** Open the panel on a node, wherever you are. Pushes, noting where from. */
export function openTask(id) {
  if (!id || id === state.openId) return;
  history.pushState({ from: state.openId ?? null }, '', withTask(id));
  parse();
  listener();
}

/** Show `id` in the panel in place of what it shows now (no new history entry). */
export function replaceTask(id) {
  history.replaceState({ from: null }, '', withTask(id));
  parse();
  listener();
}

/**
 * Up one level to `parentId`: Back, when the entry before this one is the
 * parent (the drill path), else in place.
 */
export function upTo(parentId) {
  if (history.state?.from === parentId) history.back();
  else replaceTask(parentId);
}

/** Close the panel. Replaces rather than pushes, so Back does not reopen it. */
export function closeTask() {
  const q = new URLSearchParams(route.query);
  q.delete('t');
  q.delete('n');
  const next = `#${route.path}${q.toString() ? `?${q}` : ''}`;
  history.replaceState(null, '', next);
  parse();
  listener();
}

/**
 * Close the panel with its slide-out (half-screen and phone, where it floats),
 * then drop it from the URL. Exit is faster than entry (200ms against 260ms):
 * the system is responding, not the person deciding.
 */
export function closePanel() {
  if (!state.openId && !state.noteId) return;
  const panel = document.getElementById('panel');
  const animated = window.matchMedia('(max-width: 1279px)').matches && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!animated || !panel) { closeTask(); return; }
  panel.classList.add('closing');
  setTimeout(() => { panel.classList.remove('closing'); closeTask(); }, 200);
}

/**
 * The tabs each role has, first is where it lands (decided 2026-11-04):
 * the lead Home · Tasks · Progress · Team · Log; a designer Tasks ·
 * Progress · Log (no Home; Progress read-only, owner 2026-11-09); a
 * contributor the Log only; a manager contributor Jobs · Log.
 */
export const ROLE_TABS = {
  lead: ['home', 'tasks', 'progress', 'team', 'log'],
  designer: ['tasks', 'progress', 'log'],
  contributor: ['log'],
  manager: ['jobs', 'log'],
};
export const roleTabs = (role = state.role) => ROLE_TABS[role] ?? [];

/** Pages outside the tabs: the lead's archive and import. */
export const isSpecial = () => route.parts[0] === 'archive' || route.parts[0] === 'import';

/** The current tab: where the route says, if this role has it; else where the role lands. */
export function currentTab() {
  const tabs = roleTabs();
  return tabs.includes(route.parts[0]) ? route.parts[0] : (tabs[0] ?? 'none');
}
