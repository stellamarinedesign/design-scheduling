// register.js — the Progress page (the design register) as pure logic over
// the one tree. Nothing here writes; it says what to write.
//
// PRODUCT LINES, JOBS AS ROWS (owner, 2026-11-19; it replaced products and
// their revision jobs, which confused). As the Excel Progress sheet has it:
//   CATEGORY      a red header line ("Lifters"): an ordinary group;
//   PRODUCT LINE  the bold title of a table ("Custom Lifters"): a category
//                 marked `line: true`. Its tasks template is the columns; it
//                 has no stages or status of its own;
//   ROW           a job directly in the line ("Custom 45"). Its own tasks are
//                 its stages, so a cell IS the job's task - never a copy.
//
// COLUMNS are the template two levels deep: a stage, or a stage's sub-steps
// as narrow columns under it (Engineering over 3D Model · Drawing · Laser ·
// PDF; owner, 2026-11-19). Anything nested deeper is rolled up into its
// sub-step's cell (tree.shownStatus). A line with no template takes the
// names its rows use. Cells are found by NAME, loosely: case, spacing,
// punctuation and accents ignored. A column a row has no task for is an
// empty slot; a task that fills no column is an EXTRA ("+1") and still
// counts. Nothing here knows a category, a column or a depth.

import * as T from './tree.js';
import { LABEL } from './status.js';

const OPEN = (s) => s !== 'done' && s !== 'cancelled';

/**
 * A name compared loosely: case, spacing, punctuation and accents ignored
 * ("Build form" is "Build Form", "Écran" is "ecran"). Letters of any
 * script count, so a name in other letters is still a name.
 */
export const labelKey = (s) => String(s ?? '').normalize('NFKD').replace(/\p{M}+/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

/** What a cell shows for a status (the check control's own words, tile.js BOX). */
export const CELL = { todo: 'todo', in_progress: 'doing', check: 'check', fix: 'fix', waiting: 'wait', done: 'done', cancelled: 'na' };

/** A line's rows: its jobs, in their manual order. */
export const rowsOf = (idx, lineId) => T.childrenOf(idx, lineId).filter((c) => c.kind === T.KIND.task);

/** The tasks directly inside a job or task, and those in its sections (a section only groups). */
export function topTasks(idx, id) {
  const out = [];
  const walk = (pid) => {
    for (const c of T.childrenOf(idx, pid)) {
      if (c.kind === T.KIND.task) out.push(c);
      else if (c.kind === T.KIND.group) walk(c.id);
    }
  };
  walk(id);
  return out;
}

/** One list of names, each once, in order. */
function named(labels) {
  const out = [];
  const seen = new Set();
  for (const label of labels) {
    const key = labelKey(label);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({ key, label: String(label).trim() });
  }
  return out;
}

/**
 * A line's columns: its tasks template, stages and their sub-steps, or with
 * no template the names its rows' tasks use, first seen first.
 * @returns {{stages: Array<{key, label, waits, subs: Array<{key, label}>}>, cols: Array<{key, label, stage, sub, waits}>, fromTemplate: boolean, templateFrom: object|null}}
 */
export function columnsFor(idx, lineId, rows = []) {
  const t = lineId ? T.stepsTemplateOf(idx, lineId) : null;
  let stages;
  if (t) {
    const items = t.template.map((i) => (typeof i === 'string' ? { label: i } : i)).filter(Boolean);
    const firsts = new Map();
    for (const i of items) { const k = labelKey(i.label); if (k && !firsts.has(k)) firsts.set(k, i); }
    stages = named(items.map((i) => i.label)).map((s) => {
      const item = firsts.get(s.key);
      return { ...s, waits: Boolean(item?.waits), subs: named((item?.children ?? []).map((c) => (typeof c === 'string' ? c : c?.label))) };
    });
  } else {
    stages = named(rows.flatMap((r) => topTasks(idx, r.id).map(T.nameOf))).map((s) => ({ ...s, waits: false, subs: [] }));
  }
  const cols = stages.flatMap((s) => (s.subs.length
    ? s.subs.map((c) => ({ key: `${s.key}/${c.key}`, label: c.label, stage: s, sub: c, waits: false }))
    : [{ key: s.key, label: s.label, stage: s, sub: null, waits: s.waits }]));
  return { stages, cols, fromTemplate: Boolean(t), templateFrom: t?.from ?? null };
}

/** Take the first task not yet used whose name is `key`. */
function take(pool, key) {
  const m = pool.find((p) => !p.used && p.key === key);
  if (m) m.used = true;
  return m?.t ?? null;
}
const poolOf = (tasks) => tasks.map((t) => ({ t, key: labelKey(T.nameOf(t)), used: false }));

/**
 * One row against its line's columns. Each cell: the task it is (or null),
 * its `state` (a CELL word, or 'none' when the row has no task for it), the
 * "2/4" of a task with tasks inside, and for a sub-step the stage task it
 * would go under.
 */
export function rowOf(idx, job, columns) {
  const tops = poolOf(topTasks(idx, job.id));
  const cells = [];
  const extras = [];
  const cell = (col, task, stageTask = null) => cells.push({
    col, task, stageTask,
    state: task ? (CELL[T.shownStatus(idx, task)] ?? 'todo') : 'none',
    inner: task && T.isContainer(idx, task) ? T.progress(idx, task.id) : null,
  });
  for (const stage of columns.stages) {
    const s = take(tops, stage.key);
    if (!stage.subs.length) { cell(columns.cols.find((c) => c.stage === stage), s); continue; }
    const kids = s ? poolOf(topTasks(idx, s.id)) : [];
    for (const sub of stage.subs) cell(columns.cols.find((c) => c.stage === stage && c.sub === sub), take(kids, sub.key), s);
    extras.push(...kids.filter((k) => !k.used).map((k) => k.t));
  }
  extras.unshift(...tops.filter((p) => !p.used).map((p) => p.t));
  const shown = [...cells.filter((c) => c.task).map((c) => T.shownStatus(idx, c.task)), ...extras.map((t) => T.shownStatus(idx, t))]
    .filter((s) => s !== 'cancelled');
  const done = shown.filter((s) => s === 'done').length;
  const total = shown.length;
  const cancelled = job.status === 'cancelled';
  return {
    job, cells, extras, done, total,
    // Complete is the cells all done; a row with no tasks at all, its own status.
    complete: !cancelled && (total ? done === total : job.status === 'done'),
    cancelled,
    open: OPEN(job.status),
    waiting: job.status === 'waiting',
    listed: T.rowListed(idx, job),
  };
}

/** The filters (remembered per device by the view). */
export const FILTERS = [
  { key: 'all', label: 'All', test: () => true },
  { key: 'open', label: 'Open', test: (r) => r.open },
  { key: 'waiting', label: 'Waiting', test: (r) => r.waiting },
];
export const filterTest = (key) => (FILTERS.find((f) => f.key === key) ?? FILTERS[0]).test;

/** A category's heading: its categories below the master, down to itself ("Davits › Single stage"). */
export function categoryTitle(idx, group) {
  if (!group) return 'Not in a category';
  const above = T.categoryPath(idx, group.id).slice(1);
  return [...above, group].map(T.nameOf).join(' › ');
}

/**
 * The whole register: every product line, under its category, in tree order
 * (a category's lines before the categories inside it), each with its
 * columns and rows. Lines are not looked inside for more lines: a line holds
 * rows.
 */
export function register(idx, { filter = 'all' } = {}) {
  const keep = filterTest(filter);
  const groups = [];
  const byCat = new Map();
  let rowsAll = 0;
  let complete = 0;
  let lines = 0;
  const walk = (pid) => {
    for (const g of T.childrenOf(idx, pid)) {
      if (g.kind !== T.KIND.group && g.kind !== T.KIND.product) continue;
      if (T.isLine(g)) {
        const key = pid ?? '';
        if (!byCat.has(key)) {
          const category = pid ? idx.byId.get(pid) : null;
          const entry = { category, id: pid ?? 'top', title: categoryTitle(idx, category), lines: [] };
          byCat.set(key, entry);
          groups.push(entry);
        }
        const rows = rowsOf(idx, g.id);
        const columns = columnsFor(idx, g.id, rows);
        const all = rows.map((r) => rowOf(idx, r, columns));
        const done = all.filter((r) => r.complete).length;
        rowsAll += all.length;
        complete += done;
        lines += 1;
        byCat.get(key).lines.push({
          line: g, id: g.id, title: T.nameOf(g), columns, rows: all.filter(keep), all: all.length, complete: done,
          listed: g.listed !== false,
        });
        continue;
      }
      walk(g.id);
    }
  };
  walk(null);
  return { groups, rows: rowsAll, complete, lines };
}

/** How many rows each filter keeps, for the filter buttons. */
export function filterCounts(idx) {
  const rows = register(idx).groups.flatMap((g) => g.lines.flatMap((l) => l.rows));
  return Object.fromEntries(FILTERS.map((f) => [f.key, rows.filter(f.test).length]));
}

/**
 * The next revision after what a row carries: one more than its number,
 * keeping its letters ("R4" → "R5", "Rev 2" → "Rev 3", "R1-->R2" → "R3");
 * "R1" when it has none.
 */
export function nextRevision(revision) {
  const m = /([A-Za-z]*)(\s*)(\d+)\D*$/.exec(String(revision ?? '').trim());
  if (!m) return 'R1';
  return `${m[1] || 'R'}${m[1] ? m[2] : ''}${Number(m[3]) + 1}`;
}

/** The order that puts a new task between two of its siblings (either may be missing). */
function orderBetween(idx, parentId, prev, next) {
  const siblings = T.childrenOf(idx, parentId);
  const p = prev && prev.parentId === parentId ? prev : null;
  const n = next && next.parentId === parentId ? next : null;
  let before = p;
  let after = n;
  if (p && !n) after = siblings[siblings.indexOf(p) + 1] ?? null;
  if (n && !p) before = siblings[siblings.indexOf(n) - 1] ?? null;
  if (!p && !n) before = siblings[siblings.length - 1] ?? null;
  if (!before && !after) return T.ORDER_GAP;
  if (!before) return after.order - T.ORDER_GAP;
  if (!after) return before.order + T.ORDER_GAP;
  return (before.order + after.order) / 2;
}

/**
 * What adding the task for an empty cell writes: the task, under its stage
 * (made too when the row has no task for the stage either), in its column's
 * place. Pure: the caller hands in ids and the new-task maker.
 * @returns {{set: object[]}}
 */
export function missingCell(idx, row, colIndex, { newId, make }) {
  const c = row.cells[colIndex];
  if (!c || c.task) return { set: [] };
  const jobId = row.job.id;
  const nearby = (pred) => {
    let prev = null;
    let next = null;
    for (let i = colIndex - 1; i >= 0 && !prev; i--) if (pred(row.cells[i])) prev = row.cells[i];
    for (let i = colIndex + 1; i < row.cells.length && !next; i++) if (pred(row.cells[i])) next = row.cells[i];
    return [prev, next];
  };
  const set = [];
  let parentId = jobId;
  let stageTask = c.stageTask;
  if (c.col.sub) {
    if (!stageTask) {
      // The stage itself is missing: make it, between the stages either side.
      const [p, n] = nearby((x) => x.col.stage !== c.col.stage && (x.stageTask ?? (x.col.sub ? null : x.task)));
      const pt = p ? (p.stageTask ?? p.task) : null;
      const nt = n ? (n.stageTask ?? n.task) : null;
      stageTask = make({ id: newId(), parentId: jobId, order: orderBetween(idx, jobId, pt, nt), title: c.col.stage.label });
      set.push(stageTask);
    }
    parentId = stageTask.id;
    const [p, n] = nearby((x) => x.col.stage === c.col.stage && x.task);
    set.push(make({ id: newId(), parentId, order: set.length ? T.ORDER_GAP * (c.col.stage.subs.indexOf(c.col.sub) + 1) : orderBetween(idx, parentId, p?.task, n?.task), title: c.col.label }));
    return { set };
  }
  const [p, n] = nearby((x) => (x.col.sub ? x.stageTask : x.task));
  const t = make({ id: newId(), parentId, order: orderBetween(idx, jobId, p ? (p.stageTask ?? p.task) : null, n ? (n.stageTask ?? n.task) : null), title: c.col.label });
  if (c.col.waits) t.waits = true;
  return { set: [t] };
}

/**
 * START A REVISION IN PLACE (owner, 2026-11-19): the row's revision moves on,
 * every task inside it goes back to To do, and the job reopens. It is the
 * same job, so its timeline and time stay with it; how the old stages stood
 * is said in one timeline entry.
 * @returns {{patches: object[], update: object}}
 */
export function resetRow(idx, jobId, { revision, at, by, assignee }) {
  const job = idx.byId.get(jobId);
  const columns = columnsFor(idx, T.parentOf(idx, job)?.id ?? null, [job]);
  const row = rowOf(idx, job, columns);
  const was = row.cells.filter((c) => c.task).map((c) => `${c.col.sub ? `${c.col.stage.label} › ` : ''}${c.col.label} ${(LABEL[T.shownStatus(idx, c.task)] ?? '').toLowerCase()}`);
  const clean = { status: 'todo', waiting: null, doneAt: null, cancelled: null, fixNote: null, checkedBy: null, checkedAt: null, statusAt: at, updatedAt: at };
  const patches = [{ id: jobId, ...clean, revision: revision || null, lastActivityAt: at, ...(assignee !== undefined ? { assignee } : {}) }];
  for (const d of T.descendantIds(idx, jobId)) {
    const n = idx.byId.get(d);
    if (n?.kind === T.KIND.task) patches.push({ id: d, ...clean });
  }
  const text = `${job.revision ? `${job.revision} stood` : 'Before'}: ${was.length ? was.join(' · ') : 'no tasks'}`;
  return { patches, update: { taskId: jobId, at, by, kind: 'revision', from: job.revision ?? null, to: revision || null, text } };
}

// ---------------------------------------------------------------------------
// bringing an existing job in as a row
// ---------------------------------------------------------------------------

/**
 * The default match of a job's tasks to a line's stages and sub-steps, by
 * name: a stage takes the job's top task of its name first, else one of that
 * name anywhere in it; a sub-step looks inside its stage's task first. Each
 * task is used once. What is left at the top is offered as extras.
 * @returns {{stages: Array<{stage, task, subs: Array<{sub, task}>}>, leftovers: object[], all: object[]}}
 */
export function conversionPlan(idx, jobId, columns) {
  const all = T.tasksUnder(idx, jobId);
  const used = new Set();
  const find = (key, inside = null) => {
    const look = (list) => list.find((t) => !used.has(t.id) && labelKey(T.nameOf(t)) === key) ?? null;
    const hit = (inside ? look(T.tasksUnder(idx, inside)) : look(topTasks(idx, jobId))) ?? look(all);
    if (hit) used.add(hit.id);
    return hit;
  };
  const stages = columns.stages.map((stage) => {
    const task = find(stage.key);
    return { stage, task, subs: stage.subs.map((sub) => ({ sub, task: find(sub.key, task?.id ?? null) })) };
  });
  // A leftover is a top task not used, and not holding one that is.
  const leftovers = topTasks(idx, jobId).filter((t) => !used.has(t.id));
  return { stages, leftovers, all };
}

/**
 * The writes that bring a job in as a row of a line. The job keeps its id,
 * status, Waiting (since, prevStatus, blockedBy), timeline and time: it only
 * moves, and is listed (a job brought in from Tasks stays on the lists).
 * With `switchTasks`, each stage and sub-step is the task the plan matched -
 * renamed and put in its place, so its own history and time stay - or a new
 * To-do one; the leftovers stay as extras after the stages, or are archived
 * (with what is inside them that nothing took).
 * @param {object} plan  conversionPlan output, its `task`s possibly changed by the person
 * @returns {{set: object[], patch: object[]}}
 */
export function conversionWrites(idx, jobId, lineId, plan, { switchTasks = true, archive = new Set(), at, newId, make }) {
  const set = [];
  const patch = [{ id: jobId, parentId: lineId, order: T.newOrder(idx, lineId, 'end'), listed: true, updatedAt: at }];
  if (!switchTasks) return { set, patch };
  const moved = new Set();
  plan.stages.forEach(({ stage, task, subs }, i) => {
    const order = (i + 1) * T.ORDER_GAP;
    let stageId;
    if (task) {
      patch.push({ id: task.id, parentId: jobId, order, title: stage.label, waits: stage.waits ? true : null, updatedAt: at });
      moved.add(task.id);
      stageId = task.id;
    } else {
      const t = make({ id: newId(), parentId: jobId, order, title: stage.label });
      if (stage.waits) t.waits = true;
      set.push(t);
      stageId = t.id;
    }
    subs.forEach(({ sub, task: st }, j) => {
      if (st) { patch.push({ id: st.id, parentId: stageId, order: (j + 1) * T.ORDER_GAP, title: sub.label, updatedAt: at }); moved.add(st.id); }
      else set.push(make({ id: newId(), parentId: stageId, order: (j + 1) * T.ORDER_GAP, title: sub.label }));
    });
  });
  let k = plan.stages.length + 1;
  for (const t of plan.leftovers) {
    if (moved.has(t.id)) continue;
    if (archive.has(t.id)) {
      // Archived with what is inside it, except what a stage took out of it.
      const ids = [t.id, ...T.descendantIds(idx, t.id)].filter((d) => !moved.has(d));
      for (const d of ids) patch.push({ id: d, archivedAt: at });
      continue;
    }
    patch.push({ id: t.id, order: (k += 1) * T.ORDER_GAP, updatedAt: at });
  }
  return { set, patch };
}
