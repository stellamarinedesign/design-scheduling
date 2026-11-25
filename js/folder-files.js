// folder-files.js — what is in a linked folder, for the task panel (Phase 4,
// 2026-11-26): the newest PDFs, drawings and checklists, with their dates.
//
// It reads this PC's Stella Systems folder through the browser (Edge or
// Chrome: stella-folder.js), so it needs the folder connected once per PC and
// the browser's OK to read it. Nothing leaves the PC.
//
// NEAREST FIRST, WITHIN A BUDGET. A job folder usually holds a few dozen
// files; a category folder linked by mistake can hold thousands, and OneDrive
// answers each folder in its own time. So the walk goes level by level (the
// files in the folder itself before those in its sub-folders) and stops after
// BUDGET entries, saying so, rather than holding the panel up. Archive and
// superseded folders are not entered (paths.isArchiveName), nor an "Old" one.
//
// Pure apart from the handles it is given, so the tests walk stand-ins.

import { docKind, isArchiveName } from './paths.js';

export const BUDGET = 1500;      // entries looked at, files and folders alike
export const DEPTH = 3;          // sub-folder levels below the linked folder
export const SHOWN = 5;          // the newest, before "Show all"

/** What a file is, in a word for its row. */
export const KIND_WORD = { pdf: 'PDF', drawings: 'Drawings', checklistPdf: 'Checklist', checklist: 'Checklist', word: 'Word' };

/** A PDF opens in a browser tab; a Word document cannot, so it is shown in File Explorer or its path copied. */
export const opensInTab = (kind) => kind === 'pdf' || kind === 'drawings' || kind === 'checklistPdf';

const skipDir = (name) => isArchiveName(name) || /^old$/i.test(name) || name.startsWith('.') || name.startsWith('~');

/**
 * The documents under a folder, newest first.
 * @param {FileSystemDirectoryHandle} dir
 * @returns {Promise<{files: Array<{name, dirs: string[], kind, lastModified, handle}>, cut: boolean}>}
 */
export async function walkDocs(dir, { depth = DEPTH, budget = BUDGET } = {}) {
  const files = [];
  let seen = 0;
  let cut = false;
  let level = [{ h: dir, dirs: [] }];
  for (let d = 0; d <= depth && level.length && !cut; d++) {
    const next = [];
    for (const { h, dirs } of level) {
      for await (const [name, e] of h.entries()) {
        if (++seen > budget) { cut = true; break; }
        if (e.kind === 'directory') {
          if (d < depth && !skipDir(name)) next.push({ h: e, dirs: [...dirs, name] });
          continue;
        }
        const kind = docKind(name);
        if (!kind) continue;
        const f = await e.getFile();
        files.push({ name, dirs, kind, lastModified: f.lastModified, handle: e });
      }
      if (cut) break;
    }
    level = next;
  }
  files.sort((a, b) => b.lastModified - a.lastModified || a.name.localeCompare(b.name));
  return { files, cut };
}
