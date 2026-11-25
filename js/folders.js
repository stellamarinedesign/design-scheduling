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

// ---------------------------------------------------------------------------
// "Open in Explorer": the PC helper (tools/pc-helper, Phase 4, 2026-11-26)
// ---------------------------------------------------------------------------

/**
 * The address the PC helper answers: `stella-open:` and the path below
 * Stella Systems, escaped whole. The helper, not this, is what keeps it safe:
 * it opens only a folder that is really inside this PC's Stella Systems, and
 * hands it to File Explorer without a shell (tools/pc-helper/StellaHelper.cs).
 */
export const explorerUrl = (rel) => `stella-open:${encodeURIComponent(joinPath(splitPath(rel)))}`;

// ---------------------------------------------------------------------------
// Stella Systems on the web (Phase 4, 2026-11-26): a folder link that opens
// in OneDrive on a phone, which has no File Explorer and no synced folder.
// ---------------------------------------------------------------------------

const WEB_HOW = `Open ${ROOT_NAME} in OneDrive on the web, then copy the address bar.`;

/**
 * Stella Systems on the web, from an address copied out of OneDrive or
 * SharePoint in a browser: a library view (…/onedrive.aspx?id=…,
 * …/AllItems.aspx?id=…) or the folder's own address. A folder deeper inside is
 * cut back to Stella Systems. Kept as `origin` and `path`; `view` is the page
 * a browser opens it through, worked out from the path, so a "Shared with me"
 * address (which goes through the paster's own site) still opens for everyone.
 * @returns {{root: {origin, path, view, address}|null}|{error: string}}
 */
export function parseWebRoot(input) {
  const s = String(input ?? '').trim();
  if (!s) return { root: null };
  let u;
  try { u = new URL(s); } catch { return { error: `That is not a web address. ${WEB_HOW}` }; }
  if (u.protocol !== 'https:' || !/(^|\.)sharepoint\.com$/i.test(u.hostname)) {
    return { error: `That is not a OneDrive or SharePoint address (those end in sharepoint.com). ${WEB_HOW}` };
  }
  if (/^\/:[a-z]:\//i.test(u.pathname)) return { error: `That is a sharing link, which can stop working. ${WEB_HOW}` };
  let raw = u.searchParams.get('id') ?? u.searchParams.get('RootFolder');
  if (!raw) { try { raw = decodeURIComponent(u.pathname); } catch { raw = u.pathname; } }
  const parts = splitPath(raw);
  const at = parts.findIndex((p) => p.toLowerCase() === ROOT_NAME.toLowerCase());
  if (at === -1) return { error: `That address is not the ${ROOT_NAME} folder. ${WEB_HOW}` };
  // The document library the folder is in: a person's OneDrive, or a site's library.
  let view;
  if (parts[0].toLowerCase() === 'personal' && at >= 2) view = `/personal/${parts[1]}/_layouts/15/onedrive.aspx`;
  else if (/^(sites|teams)$/i.test(parts[0]) && at >= 2) view = `/${parts.slice(0, 3).join('/')}/Forms/AllItems.aspx`;
  else if (at >= 0 && !/^(sites|teams|personal)$/i.test(parts[0])) view = `/${parts[0]}/Forms/AllItems.aspx`;
  else return { error: `That address is not the ${ROOT_NAME} folder. ${WEB_HOW}` };
  const path = `/${parts.slice(0, at + 1).join('/')}`;
  const origin = u.origin.toLowerCase();
  return { root: { origin, path, view, address: `${origin}${path}` } };
}

/** A folder's address in OneDrive on the web, or null when Stella Systems on the web is not set. */
export function webLink(address, rel) {
  const r = address ? parseWebRoot(address).root : null;
  if (!r) return null;
  const tail = joinPath(splitPath(rel));
  return `${r.origin}${encodeURI(r.view)}?id=${encodeURIComponent(tail ? `${r.path}/${tail}` : r.path)}`;
}
