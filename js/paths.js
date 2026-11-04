// paths.js — the path helpers from the production board's packages.js.
//
// Copied, not imported (CLAUDE.md, "Modules copied from the board"): the board
// is a different repository and a different Firebase project, and this app
// moves into the hub on its own timetable. Only the path half of packages.js
// came across; the package fill (checklists, drawing sets) is the board's
// business and stays there.
//
// Paths are kept as 'A/B/C' below the Stella Systems folder, never as a full
// Windows path. OneDrive syncs Stella Systems to every PC under a different
// Windows profile, so a full path is right on one machine only; a relative one
// is right on all of them. folders.js turns a pasted path into this form.

export const ROOT_NAME = 'Stella Systems';

/** Paths are kept as 'A/B/C' under the Stella Systems folder. */
export const splitPath = (p) => String(p ?? '').split('/').filter(Boolean);
export const joinPath = (parts) => parts.filter(Boolean).join('/');
export const parentPath = (p) => joinPath(splitPath(p).slice(0, -1));

/** The end of a path, which is the part anybody recognises. */
export function shortPath(p, keep = 2) {
  const parts = splitPath(p);
  const tail = parts.slice(-keep).join(' › ');
  return parts.length > keep ? `… › ${tail}` : tail;
}

/** A folder of old revisions, never the current paperwork. */
export const isArchiveName = (name) => /archiv|supersed/i.test(String(name ?? ''));

/**
 * What a file is, for a folder listing: a Word document or a PDF, which are
 * the paperwork drafting produces, or nothing. Kept from the board so
 * stella-folder.js's listFiles() works unchanged for the Phase 4 folder
 * contents in the task panel.
 * @returns {'checklist'|'checklistPdf'|'word'|'drawings'|'pdf'|null}
 */
export function docKind(name) {
  const n = String(name ?? '');
  if (/^~\$/.test(n)) return null;                    // Word's lock file for an open document
  const checklist = /check\s*-?\s*list/i.test(n);
  if (/\.docx$/i.test(n)) return checklist ? 'checklist' : 'word';
  if (/\.pdf$/i.test(n)) {
    if (isArchiveName(n)) return null;
    if (checklist) return 'checklistPdf';
    return /combined/i.test(n) ? 'drawings' : 'pdf';
  }
  return null;
}
