// import/progress.js — the Drafting Progress Tracker's Progress sheet into
// the register (PLAN, "Progress page build", milestone 3). Read in the
// browser with SheetJS like the Todo sheet (import/excel.js); from the rows
// on, everything here is pure and tested against invented rows.
//
// THE SHEET'S SHAPE, as the tracker keeps it:
//   - a FAMILY ("Davits") is a lone name on the first row after a "Date:" row;
//   - each SECTION inside it is a header row: the section's name in its first
//     cell ("Single Stage", or a plain word such as "Lifter", or nothing),
//     then the step columns, then "Comments/ File Path" and sometimes
//     "Revision No.". Columns are found by their header text, never by
//     position; a blank header cell is a column nobody uses, and anything
//     past the comments and revision (the legend down the side) is not read;
//   - every row under a header is a PRODUCT: its name, one value per step
//     (Done, In Progress, Fix, N/a, Cancelled, or blank), the comments and
//     the revision. A row may hold only a name.
// A sheet with no "Date:" rows falls back to a lone name just above a header.
//
// WHAT IT BECOMES:
//   family   → a category, under the place the lead picks (the one already
//              there by that name is used);
//   section  → a category inside it, when the family has more than one
//              (the family itself when it has one), with the step columns as
//              its tasks template;
//   row      → a product, holding one job: its revision ("R4") in the title
//              and the revision field, its cells as tasks with nobody on them
//              (part of the job), in column order.
//   blank → To do · Done → Done · In Progress → In progress · N/a and
//   Cancelled → Cancelled · Fix → In progress (a task inside a job is never
//   sent back on its own; the brief says it was Fix) · anything else typed in
//   a cell → To do, and the words go in the brief.
//   A row whose cells stop at a Cancelled is a cancelled job: its comments
//   are the reason, and the day in them its date.
//   Comments that are a Stella Systems path become a folder link; any other
//   comments are the job's brief.
// Nothing is archived: a product's job is its row on the Progress page.

import { normaliseFolder } from '../folders.js';
import { ORDER_GAP, newOrder, KIND, childrenOf, nameOf, isSection, blankTask } from '../tree.js';
import { labelKey } from '../register.js';
import { noteDate } from './excel.js';

const norm = (v) => String(v ?? '').trim();
const low = (v) => norm(v).toLowerCase();
const blank = (row) => !(row ?? []).some((c) => norm(c));
const isDateRow = (row) => /^date\b/i.test(norm(row?.[0]));

const COMMENTS = /^(comments?|file ?path)\b/i;   // "Comments/ File Path"
const REVISION = /^rev(ision)?\b/i;              // "Revision No."

/** A header row's columns: the steps up to the comments (or revision) column. Null when it is no header. */
export function headerOf(row) {
  const cells = (row ?? []).map(norm);
  let comments = -1;
  let revision = -1;
  cells.forEach((c, j) => {
    if (j === 0 || !c) return;
    if (comments < 0 && COMMENTS.test(c)) comments = j;
    else if (revision < 0 && REVISION.test(c)) revision = j;
  });
  const ends = [comments, revision].filter((x) => x > 0);
  if (!ends.length) return null;
  const end = Math.min(...ends);
  const steps = [];
  for (let j = 1; j < end; j++) if (cells[j]) steps.push({ j, label: cells[j] });
  return steps.length ? { name: cells[0], steps, comments, revision } : null;
}

/** Within a few rows, is there a header (blank rows and rows with no name in between are fine)? */
function headerSoon(rows, i) {
  for (let k = i + 1; k < Math.min(rows.length, i + 5); k++) {
    if (headerOf(rows[k])) return true;
    if (!blank(rows[k]) && norm(rows[k][0])) return false;
  }
  return false;
}

/**
 * Families, sections and rows.
 * @param {Array<Array<any>>} rows  SheetJS `sheet_to_json(ws, {header: 1})`
 * @returns {{families: Array<{title: string, sections: Array<{name: string, line: number, columns: string[], rows: object[]}>}>}}
 */
export function parseProgressRows(rows) {
  const families = [];
  const dated = (rows ?? []).some(isDateRow);
  let family = null;
  let section = null;
  let afterDate = false;
  let title = '';
  (rows ?? []).forEach((row, i) => {
    if (blank(row)) return;
    const cells = row.map(norm);
    if (isDateRow(row)) { afterDate = true; section = null; return; }
    const h = headerOf(row);
    if (h) {
      if (!family || title) {
        family = { title: title || h.name || `Family ${families.length + 1}`, sections: [] };
        families.push(family);
        title = '';
      }
      section = { name: h.name, line: i + 1, columns: h.steps.map((s) => s.label), head: h, rows: [] };
      family.sections.push(section);
      afterDate = false;
      return;
    }
    // A family's name: the first named row after a Date row; or, with no
    // Date rows at all, a lone name just above a header.
    if (afterDate && cells[0]) { title = cells[0]; afterDate = false; section = null; return; }
    if (!dated && cells[0] && cells.filter(Boolean).length === 1 && headerSoon(rows, i)) { title = cells[0]; section = null; return; }
    if (!section) return;   // a stray note between a family's name and its first header
    const at = (j) => (j > 0 ? cells[j] ?? '' : '');
    section.rows.push({
      key: `${families.length - 1}:${family.sections.length - 1}:${section.rows.length}`,
      line: i + 1,
      name: cells[0],
      values: section.head.steps.map((s) => cells[s.j] ?? ''),
      comments: at(section.head.comments),
      revision: at(section.head.revision),
    });
  });
  for (const f of families) for (const s of f.sections) delete s.head;
  return { families };
}

/** One cell's value as a task status (and what to say about it). */
export function mapCell(value) {
  const s = low(value);
  if (!s) return { status: 'todo' };
  if (['done', 'complete', 'completed', 'yes'].includes(s)) return { status: 'done' };
  if (['in progress', 'in-progress', 'started', 'doing'].includes(s)) return { status: 'in_progress' };
  if (s === 'fix') return { status: 'in_progress', note: 'Fix in the tracker' };
  if (['waiting', 'on hold'].includes(s)) return { status: 'waiting' };
  if (['n/a', 'na', 'n.a.'].includes(s)) return { status: 'cancelled', reason: 'Was N/a' };
  if (['cancelled', 'canceled'].includes(s)) return { status: 'cancelled', reason: 'Cancelled in the tracker', stops: true };
  return { status: 'todo', note: norm(value) };
}

/** Comments that name a place in Stella Systems (or any full path), as against plain words. */
const looksLikePath = (c) => /stella systems/i.test(c) || /^["']?[a-z]:[\\/]/i.test(c) || /^["']?\\\\/.test(c);

/** The last revision in what the sheet holds, for a title: "R1-->R2" → "R2". */
const lastRevision = (rev) => /([A-Za-z]*\s*\d+)\D*$/.exec(norm(rev))?.[1]?.replace(/\s+/g, ' ') ?? norm(rev);

/**
 * One row's meaning: its cells as tasks, the job's status, title, brief,
 * folder and revision.
 */
export function mapProgressRow(row, columns) {
  const cells = columns.map((label, k) => ({ label, ...mapCell(row.values[k]) }));
  // Cancelled, and nothing after it but blanks or more cancelled: the job
  // was cancelled there, and what it never reached goes with it.
  const stop = cells.findIndex((c) => c.stops);
  const jobCancelled = stop >= 0 && cells.slice(stop + 1).every((c) => (c.status === 'todo' && !c.note) || c.status === 'cancelled');
  const comments = norm(row.comments);
  if (jobCancelled) {
    for (let k = stop + 1; k < cells.length; k++) {
      if (cells[k].status === 'todo') Object.assign(cells[k], { status: 'cancelled', reason: 'Cancelled with its job' });
    }
  }
  const folders = [];
  let folderError = null;
  const briefLines = [];
  if (comments) {
    const f = looksLikePath(comments) ? normaliseFolder(comments) : null;
    if (f && !f.error) folders.push({ path: f.path, label: '' });
    else { if (f?.error) folderError = f.error; briefLines.push(comments); }
  }
  for (const c of cells) if (c.note) briefLines.push(`${c.label}: ${c.note}`);
  const statuses = cells.map((c) => c.status);
  let status;
  if (jobCancelled || (statuses.length && statuses.every((s) => s === 'cancelled'))) status = 'cancelled';
  else if (statuses.length && statuses.every((s) => s === 'done' || s === 'cancelled')) status = 'done';
  else if (statuses.some((s) => s !== 'todo' && s !== 'cancelled')) status = 'in_progress';
  else status = 'todo';
  const revision = norm(row.revision) || null;
  return {
    name: norm(row.name),
    title: revision ? `${norm(row.name)} ${lastRevision(revision)}` : norm(row.name),
    revision, status, cells, folders, folderError,
    brief: briefLines.join('\n'),
    cancelReason: status === 'cancelled' ? (comments || 'Cancelled in the tracker') : '',
    cancelledAt: status === 'cancelled' ? noteDate(comments) : null,
  };
}

/** A category already in the tree under `parentId` by this name (not a section, not a product). */
function groupNamed(idx, parentId, name) {
  const key = labelKey(name);
  return childrenOf(idx, parentId).find((c) => c.kind === KIND.group && !isSection(idx, c) && labelKey(nameOf(c)) === key) ?? null;
}

/** Where a family goes unless the lead says otherwise: beside the category of its name, else into the first master category. */
export function defaultPlan(parsed, idx) {
  const cats = idx.nodes.filter((n) => n.kind === KIND.group && !isSection(idx, n));
  const firstMaster = childrenOf(idx, null).find((n) => n.kind === KIND.group) ?? null;
  const families = {};
  parsed.families.forEach((f, fi) => {
    const same = cats.find((c) => labelKey(nameOf(c)) === labelKey(f.title));
    families[fi] = { parentId: same ? (same.parentId ?? null) : (firstMaster?.id ?? null) };
  });
  return { families, skip: new Set() };
}

/** Section names as categories: a blank one is numbered. */
const sectionName = (s, si) => s.name || `Section ${si + 1}`;

/**
 * What each family and section lands in, and which rows are left out (no
 * name, or a product of that name already there). Pure: the preview and the
 * build both read it.
 */
export function resolvePlan(parsed, plan, idx) {
  return parsed.families.map((f, fi) => {
    const parentId = plan.families?.[fi]?.parentId ?? null;
    const famExisting = groupNamed(idx, parentId, f.title);
    const single = f.sections.length === 1;
    const seen = new Set();
    return {
      parentId, famExisting,
      sections: f.sections.map((s, si) => {
        const holderExisting = single ? famExisting : (famExisting ? groupNamed(idx, famExisting.id, sectionName(s, si)) : null);
        const have = new Set(holderExisting ? childrenOf(idx, holderExisting.id).filter((c) => c.kind === KIND.product).map((c) => labelKey(nameOf(c))) : []);
        // A section that adds to the same holder as another (one family, several
        // sections of the same name) shares its names too.
        const scope = single ? 'f' : labelKey(sectionName(s, si));
        return {
          name: single ? f.title : sectionName(s, si),
          holderExisting,
          keepsTemplate: Boolean(holderExisting?.stepsTemplate?.length),
          rows: s.rows.map((r) => {
            const key = `${scope}|${labelKey(r.name)}`;
            let why = null;
            if (!norm(r.name)) why = 'No name';
            else if (have.has(labelKey(r.name)) || seen.has(key)) why = 'Already here';
            else if (plan.skip?.has(r.key)) why = 'Left out';
            if (!why) seen.add(key);
            return { row: r, why };
          }),
        };
      }),
    };
  });
}

/** The least-used category colour, so new categories spread across the ten. */
function leastColour(nodes) {
  const count = new Array(11).fill(0);
  for (const n of nodes) if (n.kind === KIND.group && n.colour) count[n.colour] += 1;
  let best = 1;
  for (let c = 2; c <= 10; c++) if (count[c] < count[best]) best = c;
  return best;
}

/**
 * The nodes, patches and updates to write.
 * @param {object} parsed  parseProgressRows output
 * @param {object} plan    { families: {i: {parentId}}, skip: Set<rowKey> }
 * @param {object} o       { idx, by, at, newId }
 */
export function buildProgress(parsed, plan, { idx, by, at, newId }) {
  const nodes = [];
  const patches = [];
  const updates = [];
  const stats = { categories: 0, products: 0, jobs: 0, tasks: 0, templates: 0, keptTemplates: 0, skipped: 0, folderErrors: 0 };
  const nextOrder = new Map();
  const orderFor = (parentId) => {
    const key = parentId ?? '';
    const o = nextOrder.has(key) ? nextOrder.get(key) : newOrder(idx, parentId, 'end');
    nextOrder.set(key, o + ORDER_GAP);
    return o;
  };
  const group = (name, parentId) => {
    const parent = parentId ? idx.byId.get(parentId) ?? nodes.find((n) => n.id === parentId) : null;
    const g = { id: newId(), kind: KIND.group, parentId, order: orderFor(parentId), name, createdBy: by, createdAt: at, updatedAt: at, archivedAt: null };
    // A category straight inside a master category gets a colour of its own, as one made by hand does.
    if (parent && parent.kind === KIND.group && !parent.parentId) g.colour = leastColour([...idx.nodes, ...nodes]);
    nodes.push(g);
    stats.categories += 1;
    return g;
  };
  const template = (columns) => columns.map((label) => ({ label }));
  resolvePlan(parsed, plan, idx).forEach((fam, fi) => {
    const f = parsed.families[fi];
    const live = fam.sections.some((s) => s.rows.some((r) => !r.why));
    stats.skipped += fam.sections.reduce((n, s) => n + s.rows.filter((r) => r.why).length, 0);
    if (!live) return;
    const famNode = fam.famExisting ?? group(f.title, fam.parentId);
    fam.sections.forEach((sec, si) => {
      const rows = sec.rows.filter((r) => !r.why);
      if (!rows.length) return;
      const columns = f.sections[si].columns;
      let holder = sec.holderExisting;
      if (!holder) {
        holder = f.sections.length === 1 ? famNode : (nodes.find((n) => n.parentId === famNode.id && n.kind === KIND.group && labelKey(n.name) === labelKey(sec.name)) ?? group(sec.name, famNode.id));
      }
      // The step columns are the category's tasks template, unless it has one already.
      if (holder.stepsTemplate?.length) { if (sec.holderExisting) stats.keptTemplates += 1; }
      else if (idx.byId.has(holder.id)) { patches.push({ id: holder.id, stepsTemplate: template(columns), updatedAt: at }); holder = { ...holder, stepsTemplate: template(columns) }; stats.templates += 1; }
      else { holder.stepsTemplate = template(columns); stats.templates += 1; }
      for (const { row } of rows) {
        const m = mapProgressRow(row, columns);
        if (m.folderError) stats.folderErrors += 1;
        const product = { id: newId(), kind: KIND.product, parentId: holder.id, order: orderFor(holder.id), name: m.name, createdBy: by, createdAt: at, updatedAt: at, archivedAt: null };
        const jobId = newId();
        const job = {
          ...blankTask({ id: jobId, parentId: product.id, order: ORDER_GAP, title: m.title, brief: m.brief, at, by, status: m.status, assignee: by }),
          revision: m.revision, folders: m.folders,
          doneAt: m.status === 'done' ? at : null,
          cancelled: m.status === 'cancelled' ? { by, at: m.cancelledAt ?? at, reason: m.cancelReason, prevStatus: 'todo' } : null,
        };
        nodes.push(product, job);
        m.cells.forEach((c, k) => {
          nodes.push({
            ...blankTask({ id: newId(), parentId: jobId, order: (k + 1) * ORDER_GAP, title: c.label, at, by, status: c.status, assignee: null }),
            waiting: c.status === 'waiting' ? { note: 'Waiting in the tracker', since: at, prevStatus: 'todo', blockedBy: [] } : null,
            doneAt: c.status === 'done' ? at : null,
            cancelled: c.status === 'cancelled' ? { by, at, reason: c.reason ?? 'Was N/a', prevStatus: 'todo' } : null,
          });
          stats.tasks += 1;
        });
        if (m.status === 'cancelled') updates.push({ taskId: jobId, at: m.cancelledAt ?? at, by, kind: 'cancel', from: 'todo', to: 'cancelled', text: m.cancelReason });
        stats.products += 1;
        stats.jobs += 1;
      }
    });
  });
  return { nodes, patches, updates, stats };
}
