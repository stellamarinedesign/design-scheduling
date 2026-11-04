// folders.js — Stella Systems folder links: normalising what is pasted, and
// rebuilding the full path for THIS PC.
//
// A link is stored relative to Stella Systems with '/' separators
// ('Stella Davits and Cranes/02 - Production/One Offs/Job'), because OneDrive
// syncs the library to every PC under a different Windows profile. Whatever
// was pasted — a full OneDrive path, "Copy as path" output in quotes, the
// 'Stella Systems\…' form the Excel tracker used, or a path already relative —
// becomes that one form here, and anything that is not inside Stella Systems
// is refused with a sentence saying why.
//
// A browser cannot open File Explorer, so "Copy path" writes the full Windows
// path for this PC to the clipboard, to paste into Explorer's address bar.
// The part in front of Stella Systems differs per PC; it is kept per device in
// localStorage, learnt the first time a full path is pasted here, and can be
// typed under the cog.

import { ROOT_NAME, splitPath, joinPath } from './paths.js';

export const PREFIX_KEY = 'stella.design.stellaPrefix';

const store = () => { try { return window.localStorage; } catch { return null; } };

/** Strip quotes, a file:// scheme and URL escapes; '\' becomes '/'. */
function tidy(input) {
  let s = String(input ?? '').trim();
  // "Copy as path" wraps the path in double quotes; some people add single.
  s = s.replace(/^["'\u201c\u201d\u2018\u2019]+|["'\u201c\u201d\u2018\u2019]+$/g, '').trim();
  if (/^file:\/\//i.test(s)) {
    s = s.replace(/^file:\/+/i, '');
    try { s = decodeURIComponent(s); } catch { /* leave it as typed */ }
  }
  return s.replace(/\\/g, '/');
}

const isAbsolute = (s) => /^[a-z]:\//i.test(s) || s.startsWith('/') || s.startsWith('//');

/**
 * A pasted path, as a Stella Systems-relative path.
 * @returns {{path: string, prefix: string|null}|{error: string}}
 *   `prefix` is the full Windows folder in front of Stella Systems when the
 *   paste carried one ('C:\Users\x\OneDrive - …\Stella Systems'), for learning.
 */
export function normaliseFolder(input) {
  const s = tidy(input);
  if (!s) return { error: 'Paste a folder path first.' };
  const parts = splitPath(s);
  const at = parts.findIndex((p) => p.toLowerCase() === ROOT_NAME.toLowerCase());
  if (at === -1) {
    if (isAbsolute(s)) {
      return { error: `That folder is not inside ${ROOT_NAME}. Links have to live there so they work on every PC.` };
    }
    // Already relative: what the app itself stores, and what a person types
    // when they know the library. Nothing to strip.
    return { path: joinPath(parts), prefix: null };
  }
  const rest = parts.slice(at + 1);
  if (!rest.length) return { error: `That is the ${ROOT_NAME} folder itself. Choose a folder inside it.` };
  const before = parts.slice(0, at + 1);
  const prefix = isAbsolute(s) ? before.join('\\') : null;
  return { path: joinPath(rest), prefix };
}

/** This PC's folder in front of Stella Systems, or ''. */
export function getPrefix() {
  try { return store()?.getItem(PREFIX_KEY) ?? ''; } catch { return ''; }
}

/** Set (or clear, with '') this PC's prefix. Accepts a pasted path to Stella Systems or anything inside it. */
export function setPrefix(value) {
  const v = String(value ?? '').trim();
  let prefix = '';
  if (v) {
    const s = tidy(v);
    const parts = splitPath(s);
    const at = parts.findIndex((p) => p.toLowerCase() === ROOT_NAME.toLowerCase());
    if (at === -1 || !isAbsolute(s)) {
      return { error: `Paste the full path of your ${ROOT_NAME} folder, starting with the drive letter.` };
    }
    prefix = parts.slice(0, at + 1).join('\\');
  }
  try {
    if (prefix) store()?.setItem(PREFIX_KEY, prefix);
    else store()?.removeItem(PREFIX_KEY);
  } catch { /* private window: kept for nobody, and Copy path says so */ }
  return { prefix };
}

/** Learn the prefix from a pasted full path, the first time only. Returns whether it learnt. */
export function learnPrefix(prefix) {
  if (!prefix || getPrefix()) return false;
  try { store()?.setItem(PREFIX_KEY, prefix); return true; } catch { return false; }
}

/** The full Windows path on this PC, or null when this PC's prefix is not known yet. */
export function fullPath(rel, prefix = getPrefix()) {
  if (!prefix) return null;
  const tail = splitPath(rel).join('\\');
  return tail ? `${prefix}\\${tail}` : prefix;
}

/** For reading: 'A / B / C'. */
export const displayPath = (rel) => splitPath(rel).join(' / ');

/** The last folder name, which is what a person recognises a link by. */
export const leafName = (rel) => splitPath(rel).slice(-1)[0] ?? '';
