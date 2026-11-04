// import/excel.js — the Drafting Progress Tracker's Todo sheet into the tree.
//
// The sheet is read in the browser with SheetJS (loaded from the CDN only when
// an import starts, as the board does) and turned into rows of cells; from
// there everything is pure and tested against invented rows. Nothing is
// uploaded anywhere but the app's own data, and only on Apply.
//
// The sheet's shape: a title, then sections. Each section is a title row (one
// cell) and a header row (Model | Status | Status Notes | Notes | Checked, or
// Path in place of Checked in the handover section), then its rows. Columns
// are found by their header text, never by position, so a moved column still
// imports.
//
//   Model         → title
//   Status        → status
//   Notes         → brief (the lead's instructions)
//   Status Notes  → the first update (the drafter's progress note)
//   Path          → a folder link, normalised to Stella Systems-relative
//   Checked=Done  → done, checked by the importer
//   Checked=Fix   → fix

import { normaliseFolder } from '../folders.js';
import { ORDER_GAP, newOrder, KIND } from '../tree.js';

const norm = (v) => String(v ?? '').trim();
const low = (v) => norm(v).toLowerCase();

const HEAD = { model: 'model', status: 'status', 'status notes': 'statusNotes', notes: 'notes', checked: 'checked', path: 'path', 'onedrive path': 'path' };

const isHeader = (row) => {
  const cells = (row ?? []).map(low);
  return cells.includes('model') && cells.includes('status');
};
const filled = (row) => (row ?? []).filter((c) => norm(c) !== '');
const isBlank = (row) => filled(row).length === 0;

/**
 * Sections of data rows.
 * @param {Array<Array<any>>} rows  SheetJS `sheet_to_json(ws, {header: 1})`
 * @returns {{sections: Array<{title: string, rows: object[]}>}}
 */
export function parseTodoRows(rows) {
  const sections = [];
  let cols = null;
  let current = null;
  let lastTitle = '';
  const headerSoon = (i) => {
    // Blank rows between a section's title and its header are common; any
    // other filled row in between means this one was data, not a title.
    for (let k = i + 1; k < Math.min(rows.length, i + 8); k++) {
      if (isHeader(rows[k])) return true;
      if (!isBlank(rows[k])) return false;
    }
    return false;
  };
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] ?? [];
    if (isBlank(row)) continue;
    if (isHeader(row)) {
      cols = {};
      row.forEach((c, j) => { const k = HEAD[low(c)]; if (k && cols[k] === undefined) cols[k] = j; });
      current = { title: lastTitle || `Section ${sections.length + 1}`, rows: [] };
      sections.push(current);
      lastTitle = '';
      continue;
    }
    // A single-cell row just above a header is that section's title.
    if (filled(row).length === 1 && norm(row[0]) && headerSoon(i)) { lastTitle = norm(row[0]); continue; }
    if (!cols || !current) { lastTitle = norm(row[0]) || lastTitle; continue; }
    const get = (k) => (cols[k] === undefined ? '' : norm(row[cols[k]]));
    const model = get('model');
    if (!model) continue;
    current.rows.push({
      key: `${sections.length - 1}:${current.rows.length}`,
      line: i + 1,
      model,
      status: get('status'),
      statusNotes: get('statusNotes'),
      notes: get('notes'),
      checked: get('checked'),
      path: get('path'),
    });
  }
  return { sections };
}

/**
 * One row's meaning.
 * @returns {{title, status, brief, firstUpdate, checked: boolean, folders: object[], folderError: string|null}}
 */
export function mapRow(r) {
  const s = low(r.status);
  const c = low(r.checked);
  let status = 'todo';
  if (s === 'done' || s === 'complete' || s === 'completed') status = 'done';
  else if (s === 'in progress' || s === 'in-progress' || s === 'started') status = 'in_progress';
  else if (s === 'waiting' || s === 'on hold' || s === 'blocked') status = 'waiting';
  else if (s === 'n/a' || s === 'na' || s === 'cancelled' || s === 'canceled') status = 'cancelled';
  let checked = false;
  if (c === 'done' || c === 'checked' || c === 'yes') { status = 'done'; checked = true; }
  else if (c === 'fix') status = 'fix';
  else if (c === 'in progress' && status !== 'cancelled') status = 'check';
  const folders = [];
  let folderError = null;
  if (r.path) {
    const n = normaliseFolder(r.path);
    if (n.error) folderError = n.error;
    else folders.push({ path: n.path, label: '' });
  }
  return { title: r.model, status, brief: r.notes, firstUpdate: r.statusNotes, checked, folders, folderError };
}

/**
 * The nodes and updates to write.
 * @param {object} parsed   parseTodoRows output
 * @param {object} plan     { into: {sectionIndex: groupId|null|'new'}, skip: Set<rowKey> }
 * @param {object} o        { idx, by, at, newId, archiveDone }
 */
export function buildExcel(parsed, plan, { idx, by, at, newId, archiveDone = true }) {
  const nodes = [];
  const updates = [];
  const stats = { groups: 0, jobs: 0, archived: 0, skipped: 0, folderErrors: 0 };
  const nextOrder = new Map();
  const orderFor = (parentId) => {
    const key = parentId ?? '';
    const o = nextOrder.has(key) ? nextOrder.get(key) : newOrder(idx, parentId, 'end');
    nextOrder.set(key, o + ORDER_GAP);
    return o;
  };
  parsed.sections.forEach((sec, si) => {
    const live = sec.rows.filter((r) => !plan.skip?.has(r.key));
    stats.skipped += sec.rows.length - live.length;
    if (!live.length) return;
    let parentId = plan.into?.[si] ?? null;
    if (parentId === 'new') {
      const g = { id: newId(), kind: KIND.group, parentId: null, order: orderFor(null), name: sec.title, createdAt: at, updatedAt: at, archivedAt: null };
      nodes.push(g);
      stats.groups += 1;
      parentId = g.id;
    }
    for (const r of live) {
      const m = mapRow(r);
      const id = newId();
      const arch = archiveDone && (m.status === 'done' || m.status === 'cancelled') ? at : null;
      if (m.folderError) stats.folderErrors += 1;
      nodes.push({
        id, kind: KIND.task, parentId, order: orderFor(parentId),
        title: m.title, brief: m.brief, status: m.status,
        priority: 'normal', assignee: by, createdBy: by,
        createdAt: at, updatedAt: at, lastActivityAt: at,
        due: null, revision: null, folders: m.folders,
        waiting: m.status === 'waiting' ? { note: m.firstUpdate || 'Imported as waiting', since: at, prevStatus: 'todo', blockedBy: [] } : null,
        doneAt: m.status === 'done' ? at : null,
        checkedBy: m.checked ? by : null, checkedAt: m.checked ? at : null,
        homeOrder: null, backlogIgnored: false, archivedAt: arch,
      });
      stats.jobs += 1;
      if (arch) stats.archived += 1;
      if (m.firstUpdate) updates.push({ taskId: id, at, by, kind: 'comment', text: m.firstUpdate });
    }
  });
  return { nodes, updates, stats };
}
