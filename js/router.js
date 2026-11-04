// router.js — where you are, in the URL hash, so Back works and a link can be
// shared or bookmarked.
//
//   #/home                 Home
//   #/tasks                Tasks overview
//   #/tasks/<id>           a category page, or a job opened as a page
//   #/tasks/top            jobs not in any category
//   #/archive, #/import    the archive, the staged import
//   …?t=<id>               with the task panel open on <id>
//
// Opening the panel pushes a history entry, so Back closes it — which is what
// a phone user expects of a full-screen sheet.

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
}

export function initRouter(onChange) {
  listener = onChange;
  window.addEventListener('hashchange', () => { parse(); listener(); });
  parse();
}

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

/** Open the task panel on a task, wherever you are. */
export function openTask(id) {
  const q = new URLSearchParams(route.query);
  q.set('t', id);
  location.hash = `${route.path}?${q}`;
}

/** Close the panel. Replaces rather than pushes, so Back does not reopen it. */
export function closeTask() {
  const q = new URLSearchParams(route.query);
  q.delete('t');
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
  if (!state.openId) return;
  const panel = document.getElementById('panel');
  const animated = window.matchMedia('(max-width: 1279px)').matches && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!animated || !panel) { closeTask(); return; }
  panel.classList.add('closing');
  setTimeout(() => { panel.classList.remove('closing'); closeTask(); }, 200);
}

/** The current tab: home or tasks. */
export const currentTab = () => (route.parts[0] === 'home' || !route.parts[0] ? 'home' : 'tasks');
