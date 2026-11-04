// import/tiledo.js — TileDo's data.json (+ archive.json) into the tree.
//
// Staged, like the board's import: parse, show a preview, write nothing until
// Apply. Everything here is pure; views/import.js draws the preview and the
// store writes the result. The files are read in the browser and go straight
// to the app's own data: never uploaded anywhere else, never committed.
//
// TileDo's roots ("Current Jobs", "Production", "Misc"…) were workarounds for
// having no overview, not categories. So every node can be mapped in the
// preview: kept as a GROUP, imported as a JOB (its subtree becomes its tasks),
// DISSOLVED (its children lift up a level) or SKIPPED. Whatever lands at the
// top can be put into an existing category, with a suggestion made from the
// words in the categories that exist (never from a list in this file: the
// categories are the owner's to build).

import { ORDER_GAP, newOrder, KIND } from '../tree.js';

/** TileDo stage → status. `completed` wins over any stage. */
export const STAGE_MAP = { todo: 'todo', in_progress: 'in_progress', blocked: 'waiting', waiting: 'waiting', review: 'check' };

const PRIORITY = { high: 'high', low: 'low' };

/** TileDo writes local times with microseconds and no zone; read them as local, as TileDo meant. */
export function tiledoInstant(s) {
  const m = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(\.\d{1,3})?/.exec(String(s ?? ''));
  if (!m) return null;
  const d = new Date(m[1] + (m[2] ?? ''));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

const asJson = (x) => (typeof x === 'string' ? JSON.parse(x) : x);

/**
 * Both files, as one list of TileDo items with their tree.
 * @returns {{items: object[], byId: Map, kids: Map, stats: {total, open, done, archived}}}
 */
export function parseTiledo(data, archive = null) {
  const d = asJson(data);
  const a = archive ? asJson(archive) : null;
  const list = Array.isArray(d) ? d : d?.tasks;
  if (!Array.isArray(list)) throw new Error('That is not a TileDo data file: it has no task list.');
  const items = [];
  const add = (t, archived) => {
    if (!t?.id || typeof t.title !== 'string') return;
    const status = t.completed ? 'done' : (STAGE_MAP[t.stage] ?? 'todo');
    items.push({
      id: t.id,
      parentId: t.parent_id ?? null,
      title: t.title.trim() || '(untitled)',
      notes: String(t.notes ?? ''),
      priority: PRIORITY[t.priority] ?? 'normal',
      status,
      order: Number(t.order) || 0,
      created: tiledoInstant(t.created),
      waiting: t.waiting ?? null,
      view: t.view === 'list' || t.view === 'tiles' ? t.view : null,
      archived: Boolean(archived),
      archivedAt: archived ? tiledoInstant(t.archived_at) : null,
    });
  };
  for (const t of list) add(t, false);
  const seen = new Set(items.map((i) => i.id));
  for (const t of (Array.isArray(a) ? a : a?.tasks) ?? []) if (!seen.has(t?.id)) add(t, true);

  const byId = new Map(items.map((i) => [i.id, i]));
  const kids = new Map();
  for (const i of items) {
    const key = i.parentId && byId.has(i.parentId) ? i.parentId : '';
    if (!kids.has(key)) kids.set(key, []);
    kids.get(key).push(i);
  }
  for (const k of kids.values()) k.sort((x, y) => x.order - y.order);
  const live = items.filter((i) => !i.archived);
  return {
    items, byId, kids,
    stats: {
      total: live.length,
      open: live.filter((i) => i.status !== 'done').length,
      done: live.filter((i) => i.status === 'done').length,
      archived: items.length - live.length,
    },
  };
}

export const rootsOf = (p) => p.kids.get('') ?? [];
export const childrenOfItem = (p, id) => p.kids.get(id) ?? [];

/** Words a category is known by: 'Cylinder Lifters' → lifter, cylinder. */
const words = (s) => String(s ?? '').toLowerCase().split(/[^a-z]+/)
  .filter((w) => w.length >= 4).map((w) => w.replace(/(es|s)$/, ''));

/**
 * The existing category a title most likely belongs in, by shared words, or
 * null. Ties go to the deeper (more specific) category.
 * @param {Array<{id, name, depth}>} groups
 */
export function suggestGroup(title, groups) {
  const t = new Set(words(title));
  if (!t.size) return null;
  let best = null;
  let bestScore = 0;
  for (const g of groups ?? []) {
    const score = words(g.name).filter((w) => t.has(w)).length;
    if (score > bestScore || (score && score === bestScore && (g.depth ?? 0) > (best?.depth ?? 0))) {
      best = g;
      bestScore = score;
    }
  }
  return best?.id ?? null;
}

/**
 * The preview's starting point. Roots are kept as groups (a faithful import;
 * dissolve is one click), everything below them is a job. A node that lands at
 * the top gets a suggested category.
 * @returns {Object<string, {as: 'group'|'job'|'dissolve'|'skip', into: string|null}>}
 */
export function defaultPlan(p, groups = []) {
  const plan = {};
  for (const r of rootsOf(p)) {
    plan[r.id] = { as: childrenOfItem(p, r.id).length ? 'group' : 'job', into: suggestGroup(r.title, groups) };
    for (const c of childrenOfItem(p, r.id)) plan[c.id] = { as: 'job', into: suggestGroup(c.title, groups) };
  }
  return plan;
}

/** How an item is treated under a plan: its own choice, 'task' inside a job, or 'job' by default. */
export function modeOf(p, plan, id) {
  const chain = [];
  let cur = p.byId.get(id);
  while (cur) { chain.unshift(cur); cur = cur.parentId ? p.byId.get(cur.parentId) : null; }
  for (let i = 0; i < chain.length - 1; i++) {
    const as = plan[chain[i].id]?.as ?? 'job';
    if (as === 'skip') return 'skip';
    if (as === 'job') return 'task';
  }
  return plan[id]?.as ?? 'job';
}

/** Does this item land at the top level (all its ancestors dissolved), so it can be put into a category? */
export function landsAtTop(p, plan, id) {
  let cur = p.byId.get(id);
  while (cur?.parentId && p.byId.has(cur.parentId)) {
    cur = p.byId.get(cur.parentId);
    if ((plan[cur.id]?.as ?? 'job') !== 'dissolve') return false;
  }
  return true;
}

/**
 * The nodes to write.
 * @param {object} p           parseTiledo output
 * @param {object} plan        id → {as, into}
 * @param {object} o
 * @param {object} o.idx       the current tree index (for orders and colours)
 * @param {string} o.by        who is importing
 * @param {string} o.at        now
 * @param {() => string} o.newId
 * @param {boolean} o.archiveDone  send finished jobs straight to the archive
 * @returns {{nodes: object[], views: Object<string,string>, stats: object}}
 */
export function buildTiledo(p, plan, { idx, by, at, newId, archiveDone = true }) {
  const nodes = [];
  const views = {};
  const stats = { groups: 0, jobs: 0, tasks: 0, archived: 0, skipped: 0 };
  const nextOrder = new Map();
  const orderFor = (parentId) => {
    const key = parentId ?? '';
    const o = nextOrder.has(key) ? nextOrder.get(key) : newOrder(idx, parentId, 'end');
    nextOrder.set(key, o + ORDER_GAP);
    return o;
  };
  const usedColours = idx.nodes.filter((n) => n.kind === KIND.group && n.colour).length;
  let colourTurn = usedColours;
  const parentKind = new Map(idx.nodes.map((n) => [n.id, n]));

  const count = (item) => 1 + childrenOfItem(p, item.id).reduce((s, c) => s + count(c), 0);

  const place = (item, parentId, mode, archivedAt) => {
    if (mode === 'skip') { stats.skipped += count(item); return; }
    if (mode === 'dissolve') {
      for (const c of childrenOfItem(p, item.id)) {
        const into = landsAtTop(p, plan, c.id) ? (plan[c.id]?.into ?? null) : parentId;
        place(c, parentId ?? into, modeOf(p, plan, c.id), archivedAt);
      }
      return;
    }
    const id = newId();
    const base = { id, parentId: parentId ?? null, order: orderFor(parentId), createdAt: item.created ?? at, updatedAt: at, archivedAt: archivedAt ?? null };
    if (mode === 'group') {
      const parent = parentId ? (parentKind.get(parentId) ?? nodes.find((n) => n.id === parentId)) : null;
      const isCategory = parent && !parent.parentId && parent.kind === KIND.group;
      const node = { ...base, kind: KIND.group, name: item.title };
      if (isCategory) node.colour = (colourTurn++ % 10) + 1;
      nodes.push(node);
      parentKind.set(id, node);
      stats.groups += 1;
      for (const c of childrenOfItem(p, item.id)) place(c, id, modeOf(p, plan, c.id), archivedAt);
      return;
    }
    // A job, or a task inside one.
    const asJob = mode !== 'task';
    let arch = archivedAt ?? (item.archived ? (item.archivedAt ?? at) : null);
    if (!arch && asJob && archiveDone && item.status === 'done') arch = at;
    const w = item.waiting;
    const node = {
      ...base,
      archivedAt: arch,
      kind: KIND.task,
      title: item.title,
      brief: item.notes.trim(),
      status: item.status,
      priority: item.priority,
      assignee: by,
      createdBy: by,
      lastActivityAt: item.created ?? at,
      due: null,
      revision: null,
      folders: [],
      waiting: item.status === 'waiting' ? {
        note: String(w?.note ?? '').trim(),
        since: tiledoInstant(w?.since) ?? item.created ?? at,
        prevStatus: STAGE_MAP[w?.prev_stage] && STAGE_MAP[w?.prev_stage] !== 'waiting' ? STAGE_MAP[w.prev_stage] : 'todo',
        blockedBy: [],
      } : null,
      doneAt: item.status === 'done' ? at : null,
      checkedBy: null,
      checkedAt: null,
      homeOrder: null,
      backlogIgnored: false,
    };
    nodes.push(node);
    parentKind.set(id, node);
    if (item.view) views[id] = item.view;
    if (asJob) stats.jobs += 1; else stats.tasks += 1;
    if (arch) stats.archived += 1;
    for (const c of childrenOfItem(p, item.id)) place(c, id, 'task', arch);
  };

  for (const r of rootsOf(p)) {
    place(r, plan[r.id]?.into ?? null, modeOf(p, plan, r.id), null);
  }
  return { nodes, views, stats };
}
