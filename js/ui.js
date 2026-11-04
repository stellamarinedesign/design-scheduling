// ui.js — the small kit every view builds with: an element helper, the icon
// set, the toast, the popover menu, and the status pill.
//
// Icons are drawn SVG in one stroke weight (1.8 on a 24 grid), never Unicode
// glyphs, so they line up and take the text colour.

import { LABEL } from './status.js';

/**
 * Make an element. `props` may hold class, text, html (trusted strings only),
 * attrs, dataset, style, on{Event} handlers; children are nodes or strings.
 */
export function el(tag, props = {}, ...children) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props ?? {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = v;
    else if (k === 'html') n.innerHTML = v;
    else if (k === 'dataset') Object.assign(n.dataset, v);
    else if (k === 'style' && typeof v === 'object') for (const [sk, sv] of Object.entries(v)) n.style.setProperty(sk, sv);
    else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'attrs') for (const [ak, av] of Object.entries(v)) { if (av !== undefined && av !== null && av !== false) n.setAttribute(ak, av === true ? '' : av); }
    else if (v === true) n.setAttribute(k, '');
    else n.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    n.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return n;
}

const P = {
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  cog: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3 1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8 1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  more: '<circle cx="5" cy="12" r="1.4" fill="currentColor"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/><circle cx="19" cy="12" r="1.4" fill="currentColor"/>',
  play: '<path d="M7 4.5v15l12.5-7.5z" fill="currentColor" stroke="none"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  chevDown: '<path d="m6 9 6 6 6-6"/>',
  chevRight: '<path d="m9 6 6 6-6 6"/>',
  back: '<path d="M15 18 9 12l6-6"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  folderPlus: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M12 11v5M9.5 13.5h5"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h8"/>',
  sort: '<path d="M7 4v16M3.5 16.5 7 20l3.5-3.5M17 20V4M13.5 7.5 17 4l3.5 3.5"/>',
  page: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>',
  open: '<path d="M14 4h6v6M20 4l-8 8M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4"/>',
  archive: '<rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8M10 12h4"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  expand: '<path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7"/>',
  collapse: '<path d="M4 14h6v6M20 10h-6V4M14 10l7-7M10 14l-7 7"/>',
  move: '<path d="M5 9 2 12l3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3M2 12h20M12 2v20"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/>',
  grid: '<rect x="4" y="4" width="7" height="7" rx="1"/><rect x="13" y="4" width="7" height="7" rx="1"/><rect x="4" y="13" width="7" height="7" rx="1"/><rect x="13" y="13" width="7" height="7" rx="1"/>',
  list: '<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  home: '<path d="M4 11 12 4l8 7v8a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z"/>',
  tasks: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="m8 12 2.5 2.5L16 9"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
  restore: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
  hide: '<path d="M3 3l18 18M10.6 6.1A10 10 0 0 1 12 6c6 0 9.5 6 9.5 6a17 17 0 0 1-3 3.7M6.2 7.6A17 17 0 0 0 2.5 12s3.5 6 9.5 6a9.6 9.6 0 0 0 4-.9"/><path d="M9.9 10a3 3 0 0 0 4.2 4.2"/>',
  drag: '<circle cx="9" cy="6" r="1.2" fill="currentColor"/><circle cx="15" cy="6" r="1.2" fill="currentColor"/><circle cx="9" cy="12" r="1.2" fill="currentColor"/><circle cx="15" cy="12" r="1.2" fill="currentColor"/><circle cx="9" cy="18" r="1.2" fill="currentColor"/><circle cx="15" cy="18" r="1.2" fill="currentColor"/>',
};

/** An icon, aria-hidden: the button around it carries the label. */
export function icon(name, size = 18) {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('width', size);
  s.setAttribute('height', size);
  s.setAttribute('fill', 'none');
  s.setAttribute('stroke', 'currentColor');
  s.setAttribute('stroke-width', '1.8');
  s.setAttribute('stroke-linecap', 'round');
  s.setAttribute('stroke-linejoin', 'round');
  s.setAttribute('aria-hidden', 'true');
  s.setAttribute('focusable', 'false');
  s.innerHTML = P[name] ?? '';
  return s;
}

/**
 * A password field with its own Show / Hide button. Edge's built-in eye goes
 * once the field loses focus and does not come back while it holds text (a
 * browser security choice), so the app draws one that stays; css hides
 * Edge's own.
 */
export function withReveal(input) {
  const b = el('button', { class: 'reveal', type: 'button', 'aria-controls': input.id || null }, 'Show');
  b.addEventListener('click', () => {
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    b.textContent = show ? 'Hide' : 'Show';
    input.focus();
  });
  return el('div', { class: 'reveal-wrap' }, input, b);
}

/** A labelled icon button. */
export const iconBtn = (name, label, onClick, cls = '') => el('button', {
  class: `ib ${cls}`.trim(), type: 'button', 'aria-label': label, title: label, onclick: onClick,
}, icon(name));

/** A text button, optionally with a leading icon. */
export const btn = (text, onClick, { cls = '', ic = null, title = null, attrs = {} } = {}) => el('button', {
  class: `btn ${cls}`.trim(), type: 'button', onclick: onClick, title, attrs,
}, ic ? icon(ic, 16) : null, text);

/** The status pill. As a button it opens the status menu (one tap to change). */
export function pill(status, { onClick = null, extra = '', label = null } = {}) {
  const props = { class: `pill st-${status} ${extra}`.trim() };
  if (onClick) {
    const word = label ?? LABEL[status] ?? status;
    return el('button', { ...props, type: 'button', title: 'Change status', 'aria-label': `${word}: change status`, 'aria-haspopup': 'menu', onclick: onClick }, word);
  }
  return el('span', props, label ?? LABEL[status] ?? status);
}

/** The category dot. `colour` is 1–10 (a category token) or null for no colour. */
export const dot = (colour, big = false) => el('span', {
  class: `dot${big ? ' big' : ''}${colour ? '' : ' none'}`,
  style: colour ? { '--dot': `var(--cat-${colour})` } : null,
  'aria-hidden': 'true',
});

/** Initials in a circle. */
export function initials(name) {
  const parts = String(name ?? '').replace(/@.*/, '').split(/[\s._-]+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts.length === 1 ? parts[0].slice(0, 2) : parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
export const avatar = (name, title = name) => el('span', { class: 'av', title, 'aria-label': title }, initials(name));

/** The progress bar on a tile. */
export function bar(done, total) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return el('span', {
    class: 'bar', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(total || 0), 'aria-valuenow': String(done),
    'aria-label': total ? `${done} of ${total} done` : 'No steps',
  }, el('i', { style: { width: `${pct}%` } }));
}

// ---------------------------------------------------------------------------
// toast
// ---------------------------------------------------------------------------

let toastTimer = null;

/**
 * A short message at the bottom, with an optional action (Undo, Open). Status
 * changes, approvals and archives use it with Undo instead of a confirm.
 */
export function toast(message, { action = null, onAction = null, warn = false, ms = 5000 } = {}) {
  const host = document.getElementById('toast');
  if (!host) { console.log('[toast]', message); return; }
  clearTimeout(toastTimer);
  host.textContent = '';
  host.classList.toggle('warn', warn);
  host.append(el('span', { class: 'toast-msg' }, message));
  if (action && onAction) {
    host.append(el('button', {
      class: 'toast-act', type: 'button',
      onclick: () => { hideToast(); onAction(); },
    }, action));
  }
  host.hidden = false;
  // Re-trigger the entrance: a second toast replacing the first should read as new.
  host.classList.remove('show');
  void host.offsetWidth;
  host.classList.add('show');
  toastTimer = setTimeout(hideToast, ms);
}

export function hideToast() {
  const host = document.getElementById('toast');
  if (!host) return;
  host.classList.remove('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { host.hidden = true; }, 220);
}

/** An error, said plainly, in the warning toast. */
export const toastError = (e, what = 'That did not save') => toast(`${what}: ${e?.message ?? e}`, { warn: true, ms: 8000 });

// ---------------------------------------------------------------------------
// popover menu
// ---------------------------------------------------------------------------

let openMenu = null;

export function closeMenu() {
  if (!openMenu) return;
  const { node, anchor, onKey, onDown } = openMenu;
  node.remove();
  document.removeEventListener('keydown', onKey, true);
  document.removeEventListener('pointerdown', onDown, true);
  anchor?.setAttribute('aria-expanded', 'false');
  openMenu = null;
}

/**
 * A menu under (or above) an anchor. Items: {label, onSelect, icon?, danger?,
 * checked?, disabled?, hint?, node?} or 'sep' or {heading}. Fixed-position, so
 * no overflow:hidden ancestor clips it. Arrow keys move; Esc closes.
 */
export function menu(anchor, items, { label = 'Actions', at = null } = {}) {
  closeMenu();
  const node = el('div', { class: 'menu', role: 'menu', 'aria-label': label });
  const buttons = [];
  for (const it of items) {
    if (!it) continue;
    if (it === 'sep') { node.append(el('div', { class: 'menu-sep', role: 'separator' })); continue; }
    if (it.heading) { node.append(el('div', { class: 'menu-head' }, it.heading)); continue; }
    const b = el('button', {
      class: `menu-item${it.danger ? ' danger' : ''}`,
      type: 'button',
      role: it.checked !== undefined ? 'menuitemradio' : 'menuitem',
      'aria-checked': it.checked !== undefined ? String(Boolean(it.checked)) : null,
      disabled: it.disabled,
      title: it.title,
      onclick: (e) => { e.stopPropagation(); closeMenu(); it.onSelect?.(); },
    },
    it.node ?? null,
    it.icon ? icon(it.icon, 16) : null,
    it.node ? null : el('span', { class: 'menu-label' }, it.label),
    it.hint ? el('span', { class: 'menu-hint' }, it.hint) : null,
    it.checked ? icon('check', 16) : null);
    buttons.push(b);
    node.append(b);
  }
  document.body.append(node);
  // Place: below the anchor, flipped above when there is no room, kept on screen.
  const r = at ?? anchor.getBoundingClientRect();
  const w = node.offsetWidth;
  const h = node.offsetHeight;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let left = Math.min(Math.max(8, r.left), vw - w - 8);
  let top = r.bottom + 4;
  if (top + h > vh - 8) top = Math.max(8, r.top - h - 4);
  node.style.left = `${left}px`;
  node.style.top = `${top}px`;
  anchor?.setAttribute('aria-expanded', 'true');

  const onKey = (e) => {
    const i = buttons.indexOf(document.activeElement);
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeMenu(); anchor?.focus(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); (buttons[(i + 1) % buttons.length] ?? buttons[0])?.focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); (buttons[(i - 1 + buttons.length) % buttons.length] ?? buttons[0])?.focus(); }
    else if (e.key === 'Tab') closeMenu();
  };
  const onDown = (e) => { if (!node.contains(e.target) && e.target !== anchor && !anchor?.contains(e.target)) closeMenu(); };
  document.addEventListener('keydown', onKey, true);
  document.addEventListener('pointerdown', onDown, true);
  openMenu = { node, anchor, onKey, onDown };
  (buttons.find((b) => b.getAttribute('aria-checked') === 'true' && !b.disabled) ?? buttons.find((b) => !b.disabled))?.focus();
  return node;
}

// ---------------------------------------------------------------------------
// right-click, long-press and Shift+F10: the same menu as the ⋯ button
// ---------------------------------------------------------------------------

const contextMenus = new WeakMap();
const TEXT_FIELD = 'input, textarea, select, [contenteditable=""], [contenteditable="true"]';

/**
 * Give an element a context menu: `open(at, element)` opens the SAME menu as
 * its ⋯ button, at a point (`at`: {left, top, bottom}) or, from the keyboard,
 * anchored to the element (`at` null). Returns the element.
 */
export function withMenu(element, open) {
  contextMenus.set(element, open);
  element.classList.add('has-menu');
  return element;
}

function menuFor(target) {
  for (let n = target; n && n !== document.body; n = n.parentElement) {
    if (contextMenus.has(n)) return [n, contextMenus.get(n)];
  }
  return null;
}

const point = (x, y) => ({ left: x, right: x, top: y, bottom: y });

/**
 * Once, at start-up. Right-click opens an element's own menu instead of the
 * browser's - except in text fields, which keep theirs for copy and paste.
 * On touch, holding about half a second does the same; the click the finger
 * then makes is swallowed so it does not also open the tile. Shift+F10 or the
 * context-menu key opens the menu of whatever has focus.
 */
export function installContextMenus() {
  let lastLongPress = 0;
  let timer = null;
  let start = null;
  let swallowClick = false;

  document.addEventListener('contextmenu', (e) => {
    if (e.target.closest?.(TEXT_FIELD)) return;
    // Android fires contextmenu for the long-press we already handled.
    if (Date.now() - lastLongPress < 800) { e.preventDefault(); return; }
    const hit = menuFor(e.target);
    if (!hit) return;
    e.preventDefault();
    hit[1](point(e.clientX, e.clientY), hit[0]);
  });

  const cancel = () => { clearTimeout(timer); timer = null; };
  document.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch' || e.target.closest?.(TEXT_FIELD)) return;
    const hit = menuFor(e.target);
    if (!hit) return;
    start = { x: e.clientX, y: e.clientY };
    cancel();
    timer = setTimeout(() => {
      timer = null;
      lastLongPress = Date.now();
      swallowClick = true;
      setTimeout(() => { swallowClick = false; }, 700);
      hit[1](point(start.x, start.y), hit[0]);
    }, 500);
  }, { passive: true });
  document.addEventListener('pointermove', (e) => {
    if (timer && start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 10) cancel();
  }, { passive: true });
  document.addEventListener('pointerup', cancel);
  document.addEventListener('pointercancel', cancel);
  document.addEventListener('scroll', cancel, true);
  document.addEventListener('click', (e) => {
    if (!swallowClick || e.target.closest?.('.menu')) return;
    swallowClick = false;
    e.preventDefault();
    e.stopPropagation();
  }, true);

  document.addEventListener('keydown', (e) => {
    if (!(e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10'))) return;
    const a = document.activeElement;
    if (!a || a.closest?.(TEXT_FIELD)) return;
    const hit = menuFor(a);
    if (!hit) return;
    e.preventDefault();
    hit[1](null, hit[0]);
  });
}

/** Narrow screens: under 700px is the phone layout (DESIGN.md width bands). */
export const isPhone = () => window.matchMedia('(max-width: 699px)').matches;
/** The sidebar is pinned only on wide screens. */
export const isWide = () => window.matchMedia('(min-width: 1100px)').matches;
/** Does this device drag with a mouse? Touch gets the Move action instead. */
export const canDrag = () => window.matchMedia('(pointer: fine)').matches;

/** Per-user view settings (collapsed groups, tiles/list, bands): localStorage, never data. */
export const prefs = {
  get(key, fallback) { try { const v = localStorage.getItem(`stella.design.pref.${key}`); return v === null ? fallback : JSON.parse(v); } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(`stella.design.pref.${key}`, JSON.stringify(value)); } catch { /* private window: forgets on close */ } },
};
