// dialog.js — the one thing every dialog in this app has in common, from the
// board, plus the small confirm and prompt dialogs built on it.
//
// The house rules for every dialog: Enter saves, Esc cancels, and a
// destructive action defaults to Cancel (focus starts there, so a reflexive
// Enter never deletes anything).
//
// A GUARDED dialog - any that holds typed input (decided 2026-11-04, after
// the owner lost a half-typed Settings change to a stray click) - closes only
// on purpose: its Close or Cancel button, or Esc, never a click outside it.
// And when something has been typed and not saved, those ask "Discard
// changes?" first, with Cancel as the default.

/**
 * Close a dialog when its backdrop is CLICKED: pressed and released there.
 *
 * A drag that starts inside the dialog and ends outside it - highlighting the
 * text in a field and letting go past the edge of the box - is reported by
 * the browser as a click on the backdrop, because the backdrop is the nearest
 * element that contains both ends of the drag. Listening for the click alone
 * closed the dialog in the middle of an edit. So the press is remembered, and
 * a click only counts when it began on the backdrop as well.
 *
 * @param {Element|null} overlay  the backdrop, which holds the dialog box
 * @param {() => void} close
 */
export function closeOnBackdrop(overlay, close) {
  if (!overlay) return;
  let pressedHere = false;
  overlay.addEventListener('pointerdown', (e) => { pressedHere = e.target === overlay; });
  overlay.addEventListener('click', (e) => {
    const genuine = e.target === overlay && pressedHere;
    pressedHere = false;
    if (genuine) close();
  });
}

const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
};

/**
 * Open dialogs, innermost last. A dialog can open another (quick add opens the
 * place picker), and only the top one may take Esc and Tab — otherwise Esc in
 * the picker closes the dialog underneath it as well.
 */
const stack = [];

/** A field whose typing counts as a change: text of any kind, not ticks or files, nor a search that only filters (data-noguard). */
const TYPED = 'textarea, input:not([type=checkbox]):not([type=radio]):not([type=file]):not([type=button]):not([type=submit]):not([type=search])';

/**
 * A modal box on a scrim. `build(box, close, {dismiss, markClean})` fills the
 * box. `close(value)` resolves the returned promise; `dismiss()` is what a
 * Close or Cancel button calls, and Esc too: it resolves with null, asking
 * first in a guarded dialog with unsaved typing. `markClean()` says what is
 * typed now is saved (a field that saves in place).
 * @returns {Promise<any>}
 */
export function openDialog(build, { label = '', wide = false, className = '', guard = false } = {}) {
  return new Promise((resolve) => {
    // Which element had focus before, so closing gives it back.
    const lastFocus = document.activeElement;
    const overlay = el('div', 'overlay show');
    const box = el('div', `box${wide ? ' wide' : ''}${className ? ` ${className}` : ''}`);
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    if (label) box.setAttribute('aria-label', label);
    overlay.append(box);
    let done = false;
    const me = {};
    stack.push(me);
    const close = (value = null) => {
      if (done) return;
      done = true;
      overlay.remove();
      document.removeEventListener('keydown', onKey, true);
      stack.splice(stack.indexOf(me), 1);
      if (lastFocus?.isConnected) lastFocus.focus?.();
      resolve(value);
    };
    // What each typed field held when the dialog opened: a field is changed
    // when it holds something else now. Fields drawn later (a list redrawn
    // after a save) are noted on their first focus or keystroke.
    const typed = new Map();
    const note = (f) => { if (f.matches?.(TYPED) && !f.closest('[data-noguard]') && !typed.has(f)) typed.set(f, f.value); };
    box.addEventListener('focusin', (e) => note(e.target));
    box.addEventListener('beforeinput', (e) => note(e.target));
    const dirty = () => [...typed].some(([f, v]) => f.isConnected && f.value !== v);
    const markClean = () => { for (const f of [...typed.keys()]) { if (f.isConnected) typed.set(f, f.value); else typed.delete(f); } };
    let asking = false;
    const dismiss = async () => {
      if (done || asking) return;
      if (guard && dirty()) {
        asking = true;
        const discard = await confirmDialog({ title: 'Discard changes?', body: 'What you typed here has not been saved.', ok: 'Discard', destructive: true });
        asking = false;
        if (!discard) return;
      }
      close(null);
    };
    const onKey = (e) => {
      if (stack[stack.length - 1] !== me) return;
      if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); dismiss(); }
      if (e.key === 'Tab') trapTab(e, box);
    };
    document.addEventListener('keydown', onKey, true);
    if (!guard) closeOnBackdrop(overlay, () => close(null));
    build(box, close, { dismiss, markClean });
    box.querySelectorAll(TYPED).forEach(note);
    document.body.append(overlay);
    const first = box.querySelector('[data-autofocus]') ?? box.querySelector('input, textarea, select, button');
    first?.focus();
  });
}

function trapTab(e, box) {
  const focusable = [...box.querySelectorAll('button, input, textarea, select, a[href], [tabindex]:not([tabindex="-1"])')]
    .filter((n) => !n.disabled && n.offsetParent !== null);
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}

/**
 * Yes or no. A destructive confirm starts with focus on Cancel.
 * @returns {Promise<boolean>}
 */
export async function confirmDialog({ title, body = '', ok = 'OK', cancel = 'Cancel', destructive = false, alt = null }) {
  const v = await openDialog((box, close) => {
    box.append(el('h3', null, title));
    if (body) box.append(el('p', 'lede', body));
    const acts = el('div', 'actions');
    const yes = el('button', destructive ? 'btn danger' : 'btn primary', ok);
    yes.addEventListener('click', () => close('ok'));
    const no = el('button', 'btn', cancel);
    no.addEventListener('click', () => close(null));
    if (destructive) no.dataset.autofocus = '';
    else yes.dataset.autofocus = '';
    acts.append(yes);
    if (alt) {
      const a = el('button', 'btn', alt);
      a.addEventListener('click', () => close('alt'));
      acts.append(a);
    }
    acts.append(no);
    box.append(acts);
  }, { label: title });
  return alt ? v : v === 'ok';
}

/**
 * One line (or several, `multiline`) of text. Enter saves (Ctrl+Enter when
 * multiline); Esc cancels. `validate(value)` returns an error sentence or
 * nothing.
 * @returns {Promise<string|null>}
 */
export function promptDialog({ title, label = '', value = '', placeholder = '', ok = 'Save', dismiss = 'Cancel', multiline = false, required = true, validate = null, body = '' }) {
  return openDialog((box, close, guard) => {
    box.append(el('h3', null, title));
    if (body) box.append(el('p', 'lede', body));
    const field = el('div', 'field');
    const id = `pd${Math.random().toString(36).slice(2, 8)}`;
    if (label) { const l = el('label', null, label); l.htmlFor = id; field.append(l); }
    const input = document.createElement(multiline ? 'textarea' : 'input');
    input.id = id;
    input.className = multiline ? 'textarea' : 'input';
    if (multiline) input.rows = 4;
    input.value = value;
    input.placeholder = placeholder;
    input.dataset.autofocus = '';
    field.append(input);
    const err = el('div', 'form-err');
    err.setAttribute('role', 'alert');
    field.append(err);
    box.append(field);
    const acts = el('div', 'actions');
    const yes = el('button', 'btn primary', ok);
    const no = el('button', 'btn', dismiss);
    acts.append(yes, no);
    box.append(acts);
    const submit = () => {
      const v = input.value.trim();
      if (required && !v) { err.textContent = 'This cannot be empty.'; input.focus(); return; }
      const problem = validate?.(v);
      if (problem) { err.textContent = problem; input.focus(); return; }
      close(v);
    };
    yes.addEventListener('click', submit);
    no.addEventListener('click', () => guard.dismiss());
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (!multiline || e.ctrlKey || e.metaKey)) { e.preventDefault(); submit(); }
    });
    queueMicrotask(() => { input.select?.(); });
  }, { label: title, guard: true });
}
