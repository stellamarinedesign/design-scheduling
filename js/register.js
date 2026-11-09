// register.js — the Progress page (the design register): the Excel Progress
// sheet made live, as pure logic over the one tree. Nothing here writes.
//
// A PRODUCT is a `kind: 'product'` node in a category. Its children are its
// jobs, one per revision. The row shows the CURRENT JOB: the newest open one,
// else the newest. Its CELLS are that job's top-level tasks - the same
// documents the job holds, never a copy - so a tick in the job is a tick in
// the cell, and back.
//
// COLUMNS come from the category's tasks template (stored as
// `stepsTemplate`), top level only (owner, 2026-11-09: "template columns").
// A job's top-level tasks fill them by NAME, loosely: case, spacing and
// punctuation are ignored, so "Build form" fills "Build Form". A column the
// job has no task for is an empty slot; a task that fills no column is an
// EXTRA ("+1 more") and still counts. A category with no template takes the
// names its rows' jobs use, in the order they first appear. Nothing here
// knows a category, a column name or a depth.
//
// The DONE COUNT is over the job's top-level tasks as they show (a task with
// tasks inside shows theirs, tree.shownStatus), cancelled ones left out: the
// cells the eye counts, extras included.

import * as T from './tree.js';

const OPEN = (s) => s !== 'done' && s !== 'cancelled';

/** A name compared loosely: case, spacing and punctuation ignored ("Build form" is "Build Form"). */
export const labelKey = (s) => String(s ?? '').normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, '');

/** What a cell shows for a status (the check control's own words, tile.js BOX). */
export const CELL = { todo: 'todo', in_progress: 'doing', check: 'check', fix: 'fix', waiting: 'wait', done: 'done', cancelled: 'na' };

/** A product's jobs, its revisions. Live ones only: the tree holds nothing archived. */
export const jobsOf = (idx, productId) => T.childrenOf(idx, productId).filter((c) => c.kind === T.KIND.task);

const newestFirst = (a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')) || (b.order ?? 0) - (a.order ?? 0);

/**
 * The job a product's row shows: its newest open job, else its newest. A
 * second open job (made from Tasks) is allowed; `moreOpen` says how many.
 * @returns {{job: object|null, moreOpen: number, jobs: object[]}}
 */
export function currentJob(idx, productId) {
  const jobs = jobsOf(idx, productId);
  const open = jobs.filter((j) => OPEN(j.status)).sort(newestFirst);
  const job = open[0] ?? [...jobs].sort(newestFirst)[0] ?? null;
  return { job, moreOpen: Math.max(0, open.length - 1), jobs };
}

/** A job's top-level tasks: those directly in it and those in its sections (a section only groups). */
export function topTasks(idx, jobId) {
  const out = [];
  const walk = (pid) => {
    for (const c of T.childrenOf(idx, pid)) {
      if (c.kind === T.KIND.task) out.push(c);
      else if (c.kind === T.KIND.group) walk(c.id);
    }
  };
  walk(jobId);
  return out;
}

/**
 * A section's columns: the tasks template's top level (from the category or
 * the nearest group above it that has one), or, with none, the top-level
 * task names its jobs use, first seen first. Repeated names make one column.
 * @returns {{columns: Array<{key: string, label: string}>, fromTemplate: boolean, templateFrom: object|null}}
 */
export function columnsFor(idx, groupId, jobs = []) {
  const columns = [];
  const seen = new Set();
  const add = (label) => {
    const key = labelKey(label);
    if (!key || seen.has(key)) return;
    seen.add(key);
    columns.push({ key, label: String(label).trim() });
  };
  const t = groupId ? T.stepsTemplateOf(idx, groupId) : null;
  if (t) {
    for (const item of t.template) add(typeof item === 'string' ? item : item?.label);
    return { columns, fromTemplate: true, templateFrom: t.from };
  }
  for (const j of jobs) for (const task of topTasks(idx, j.id)) add(T.nameOf(task));
  return { columns, fromTemplate: false, templateFrom: null };
}

/**
 * One product's row against its section's columns.
 * Each cell: `state` is a CELL word, 'none' when the job has no task for the
 * column, or 'nojob' when the product has no job at all; `inner` is the
 * "2/4" of a task with tasks inside.
 */
export function rowOf(idx, product, columns) {
  const { job, moreOpen } = currentJob(idx, product.id);
  if (!job) {
    return {
      product, job: null, moreOpen: 0, extras: [], done: 0, total: 0,
      cells: columns.map((col) => ({ col, task: null, state: 'nojob', inner: null })),
      complete: false, cancelled: false, open: false,
    };
  }
  const tasks = topTasks(idx, job.id);
  const pool = tasks.map((t) => ({ t, key: labelKey(T.nameOf(t)), used: false }));
  const cells = columns.map((col) => {
    const m = pool.find((p) => !p.used && p.key === col.key);
    if (m) m.used = true;
    const task = m?.t ?? null;
    return {
      col, task,
      state: task ? (CELL[T.shownStatus(idx, task)] ?? 'todo') : 'none',
      inner: task && T.isContainer(idx, task) ? T.progress(idx, task.id) : null,
    };
  });
  const extras = pool.filter((p) => !p.used).map((p) => p.t);
  const shown = tasks.map((t) => T.shownStatus(idx, t)).filter((s) => s !== 'cancelled');
  const done = shown.filter((s) => s === 'done').length;
  const total = shown.length;
  const cancelled = job.status === 'cancelled';
  return {
    product, job, moreOpen, cells, extras, done, total,
    // Complete is the cells, all done; a job with no tasks at all, its own status.
    complete: !cancelled && (total ? done === total : job.status === 'done'),
    cancelled,
    open: OPEN(job.status),
  };
}

/** The filters (remembered per device by the view). */
export const FILTERS = [
  { key: 'all', label: 'All', test: () => true },
  { key: 'incomplete', label: 'Incomplete', test: (r) => !r.complete && !r.cancelled },
  { key: 'open', label: 'Has an open job', test: (r) => r.open },
];
const filterTest = (key) => (FILTERS.find((f) => f.key === key) ?? FILTERS[0]).test;

/**
 * Where the products are: every category holding products directly, in tree
 * order (a category before the ones inside it), each with its products in
 * manual order. Products at the top level, in no category, come first under
 * `group: null`.
 */
export function productGroups(idx) {
  const out = [];
  const walk = (pid) => {
    const kids = T.childrenOf(idx, pid);
    const products = kids.filter((k) => k.kind === T.KIND.product);
    if (products.length) out.push({ group: pid ? idx.byId.get(pid) : null, products });
    for (const k of kids) if (k.kind === T.KIND.group) walk(k.id);
  };
  walk(null);
  return out;
}

/** A section's heading: its categories below the master, down to itself ("Davits › Single stage"). */
export function sectionTitle(idx, group) {
  if (!group) return 'Not in a category';
  const above = T.categoryPath(idx, group.id).slice(1);
  return [...above, group].map(T.nameOf).join(' › ');
}

/**
 * The whole register: sections with their columns and rows, the rows
 * filtered. A section left with no rows by the filter still comes back
 * (`rows` empty, `all` its count), so the page can say so.
 */
export function register(idx, { filter = 'all' } = {}) {
  const keep = filterTest(filter);
  let products = 0;
  let complete = 0;
  const sections = productGroups(idx).map(({ group, products: list }) => {
    const jobs = list.map((p) => currentJob(idx, p.id).job).filter(Boolean);
    const cols = columnsFor(idx, group?.id ?? null, jobs);
    const all = list.map((p) => rowOf(idx, p, cols.columns));
    products += all.length;
    const done = all.filter((r) => r.complete).length;
    complete += done;
    return {
      group, id: group?.id ?? 'top', title: sectionTitle(idx, group), ...cols,
      rows: all.filter(keep), all: all.length, complete: done,
    };
  });
  return { sections, products, complete };
}

/** How many rows each filter keeps, for the filter buttons. */
export function filterCounts(idx) {
  const rows = register(idx).sections.flatMap((s) => s.rows);
  return Object.fromEntries(FILTERS.map((f) => [f.key, rows.filter(f.test).length]));
}

/**
 * The next revision after a product's jobs: one more than the highest number
 * any of them carries, keeping its letters ("R4" → "R5", "Rev 2" → "Rev 3",
 * "R1-->R2" → "R3"); "R1" when none has one.
 */
export function nextRevision(jobs) {
  let best = -1;
  let shape = { letters: 'R', gap: '' };
  for (const j of jobs ?? []) {
    const m = /([A-Za-z]*)(\s*)(\d+)\D*$/.exec(String(j?.revision ?? '').trim());
    if (!m) continue;
    const n = Number(m[3]);
    if (n > best) { best = n; shape = { letters: m[1] || 'R', gap: m[1] ? m[2] : '' }; }
  }
  return `${shape.letters}${shape.gap}${best < 0 ? 1 : best + 1}`;
}

/** The title Start revision offers: the product's name and the revision ("450kg R5"). */
export const revisionTitle = (product, revision) => `${T.nameOf(product)} ${revision}`.trim();

/**
 * Where a task added for an empty column goes among the job's own children:
 * after the task filling the column before it, else before the one filling
 * the column after it, else at the end. Returns the `order` to give it.
 */
export function insertOrder(idx, jobId, cells, colIndex) {
  const siblings = T.childrenOf(idx, jobId);
  const own = (c) => (c?.task && c.task.parentId === jobId ? c.task : null);
  let at = -1;
  for (let i = colIndex - 1; i >= 0 && at < 0; i--) { const t = own(cells[i]); if (t) at = siblings.indexOf(t) + 1; }
  for (let i = colIndex + 1; i < cells.length && at < 0; i++) { const t = own(cells[i]); if (t) at = siblings.indexOf(t); }
  if (at < 0) at = siblings.length;
  const prev = siblings[at - 1];
  const next = siblings[at];
  if (!prev && !next) return T.ORDER_GAP;
  if (!prev) return next.order - T.ORDER_GAP;
  if (!next) return prev.order + T.ORDER_GAP;
  return (prev.order + next.order) / 2;
}
