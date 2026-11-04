// tree.js — the one tree everything lives in, and the pure helpers over it.
//
// GROUPS ANYWHERE. Every node is a `tasks` document with a `kind`:
//   group    a category: master categories at the top, categories and
//            sub-categories inside them, or sections inside a job;
//   product  a product row for the Progress page (Phase 4); its jobs are its
//            revisions;
//   task     a job (its parent is a group, a product, or nothing) or a task
//            (anything under a job);
//   step     a light tick inside a job: To do / Doing / Done / N/a. Steps can
//            nest and sit among real subtasks.
// Siblings of every kind share one manual `order`. Nothing here knows any
// category by name or assumes a depth: a node's category path, colour and
// steps template are read off its group ancestors.
//
// The helpers are ported from TileDo (children_of, descendant_ids,
// ancestor_chain, insert_relative, nest_under, renumber, cascade_complete) and
// stay pure: they take an index and return patches, and the store writes them.

export const KIND = { group: 'group', product: 'product', task: 'task', step: 'step' };

const OPEN = (s) => s !== 'done' && s !== 'cancelled';

/** Gap between renumbered siblings, so most inserts fit between two without touching the rest. */
export const ORDER_GAP = 1024;

const byOrder = (a, b) => (a.order ?? 0) - (b.order ?? 0) || String(a.id).localeCompare(String(b.id));

/**
 * Every node by id, and every parent's children in manual order.
 * @param {Array<object>} nodes
 * @returns {{byId: Map<string, object>, kids: Map<string, object[]>, nodes: object[]}}
 */
export function buildIndex(nodes) {
  const byId = new Map();
  const kids = new Map();
  for (const n of nodes ?? []) byId.set(n.id, n);
  for (const n of byId.values()) {
    // A parent that is not here (archived, deleted, or never imported) leaves
    // its child at the top, rather than hiding it where nobody can reach it.
    const key = n.parentId && byId.has(n.parentId) ? n.parentId : '';
    if (!kids.has(key)) kids.set(key, []);
    kids.get(key).push(n);
  }
  for (const list of kids.values()) list.sort(byOrder);
  return { byId, kids, nodes: [...byId.values()] };
}

/** The parent as the index sees it: null at the top, or for an orphan. */
export const parentOf = (idx, n) => (n?.parentId && idx.byId.get(n.parentId)) || null;

/** A parent's children in manual order. `null` is the top level. */
export const childrenOf = (idx, id) => idx.kids.get(id ?? '') ?? [];

/** Every node below one, depth first, in order. */
export function descendantIds(idx, id) {
  const out = [];
  const walk = (pid) => {
    for (const c of childrenOf(idx, pid)) { out.push(c.id); walk(c.id); }
  };
  walk(id);
  return out;
}

/** The nodes above one, top first. A cycle in bad data stops rather than loops. */
export function ancestorChain(idx, id) {
  const out = [];
  const seen = new Set([id]);
  let n = parentOf(idx, idx.byId.get(id));
  while (n && !seen.has(n.id)) { out.unshift(n); seen.add(n.id); n = parentOf(idx, n); }
  return out;
}

export const isGroupLike = (n) => n?.kind === KIND.group || n?.kind === KIND.product;

/** What a node is called on screen, whatever its kind. */
export const nameOf = (n) => (n ? (n.kind === KIND.step ? n.label : n.kind === KIND.task ? n.title : n.name) ?? '' : '');

/**
 * A job: a task whose parent is a category (a group or product in the tree of
 * categories), or nothing. A task in a SECTION — a group inside a job — is
 * still that job's task.
 */
export function isJob(idx, n) {
  if (n?.kind !== KIND.task) return false;
  const p = parentOf(idx, n);
  return !p || (isGroupLike(p) && !isSection(idx, p));
}

/** Does a node have real tasks among its children (directly, or inside its sections)? */
export function hasTaskChildren(idx, id) {
  return childrenOf(idx, id).some((c) => c.kind === KIND.task
    || (c.kind === KIND.group && hasTaskChildren(idx, c.id)));
}

/** The job a node belongs to (itself when it is one), or null. */
export function jobOf(idx, id) {
  const n = idx.byId.get(id);
  if (!n) return null;
  if (isJob(idx, n)) return n;
  const chain = ancestorChain(idx, id);
  for (let i = chain.length - 1; i >= 0; i--) if (isJob(idx, chain[i])) return chain[i];
  return null;
}

/** Is this group a category (in the tree of categories) or a section inside a job? */
export const isSection = (idx, n) => n?.kind === KIND.group && ancestorChain(idx, n.id).some((a) => a.kind === KIND.task);

/** The category path: the group and product ancestors that are not inside a job. */
export function categoryPath(idx, id) {
  const out = [];
  for (const a of ancestorChain(idx, id)) {
    if (a.kind === KIND.task || a.kind === KIND.step) break;
    if (isGroupLike(a)) out.push(a);
  }
  return out;
}

/** 'Davits › Single stage'. Drops the master category when `skipMaster` and there is more. */
export function pathText(idx, id, { skipMaster = true, sep = ' › ' } = {}) {
  let path = categoryPath(idx, id);
  if (skipMaster && path.length > 1) path = path.slice(1);
  return path.map(nameOf).join(sep);
}

/** The colour (1–10, a category token) of the nearest group that has one, the node itself included. */
export function colourOf(idx, id) {
  const self = idx.byId.get(id);
  if (isGroupLike(self) && self.colour) return self.colour;
  const chain = ancestorChain(idx, id);
  for (let i = chain.length - 1; i >= 0; i--) if (isGroupLike(chain[i]) && chain[i].colour) return chain[i].colour;
  return null;
}

/** The steps template of the nearest group that has one, the node itself included. */
export function stepsTemplateOf(idx, id) {
  const self = idx.byId.get(id);
  if (isGroupLike(self) && self.stepsTemplate?.length) return { from: self, template: self.stepsTemplate };
  const chain = ancestorChain(idx, id);
  for (let i = chain.length - 1; i >= 0; i--) {
    const a = chain[i];
    if (isGroupLike(a) && a.stepsTemplate?.length) return { from: a, template: a.stepsTemplate };
  }
  return null;
}

/**
 * A steps template as text, one step a line, sub-steps indented by two spaces
 * or a tab; and back. The template is stored as [{label, children?}].
 */
export function templateFromText(text) {
  const root = [];
  const stack = [{ depth: -1, children: root }];
  for (const raw of String(text ?? '').split(/\r?\n/)) {
    if (!raw.trim()) continue;
    const lead = /^[\t ]*/.exec(raw)[0].replace(/\t/g, '  ').length;
    const depth = Math.floor(lead / 2);
    const label = raw.trim().replace(/^[-*•]\s*/, '');
    while (stack.length > 1 && stack[stack.length - 1].depth >= depth) stack.pop();
    const item = { label };
    const parent = stack[stack.length - 1];
    (parent.children).push(item);
    stack.push({ depth, children: (item.children = []) });
  }
  const prune = (list) => list.map((i) => (i.children?.length ? { label: i.label, children: prune(i.children) } : { label: i.label }));
  return prune(root);
}

export function templateToText(template, depth = 0) {
  return (template ?? []).map((t) => {
    const item = typeof t === 'string' ? { label: t } : t;
    const line = `${'  '.repeat(depth)}${item.label}`;
    return item.children?.length ? `${line}\n${templateToText(item.children, depth + 1)}` : line;
  }).join('\n');
}

// ---------------------------------------------------------------------------
// order
// ---------------------------------------------------------------------------

/**
 * TileDo's renumber: siblings in the given order, evenly spaced again. Only
 * the nodes whose order actually changes come back as patches.
 */
export function renumber(list) {
  return list.map((n, i) => ({ id: n.id, order: (i + 1) * ORDER_GAP }))
    .filter((p, i) => list[i].order !== p.order);
}

/**
 * Patches that put `movingId` at position `index` among `parentId`'s children
 * (counted without the moving node). Between two neighbours when there is room,
 * a renumber of the siblings when there is not.
 */
export function placeAt(idx, movingId, parentId, index) {
  const siblings = childrenOf(idx, parentId).filter((c) => c.id !== movingId);
  const i = Math.max(0, Math.min(index, siblings.length));
  const prev = siblings[i - 1];
  const next = siblings[i];
  const moving = idx.byId.get(movingId);
  const parentChange = (moving?.parentId ?? null) !== (parentId ?? null) ? { parentId: parentId ?? null } : {};
  let order;
  if (!prev && !next) order = ORDER_GAP;
  else if (!prev) order = next.order - ORDER_GAP;
  else if (!next) order = prev.order + ORDER_GAP;
  else if (next.order - prev.order > 1e-6) order = (prev.order + next.order) / 2;
  if (order !== undefined && Number.isFinite(order)) return [{ id: movingId, ...parentChange, order }];
  // No room left between the two: lay the whole sibling list out again.
  const list = [...siblings.slice(0, i), { ...moving, id: movingId }, ...siblings.slice(i)];
  return list.map((n, k) => ({ id: n.id, order: (k + 1) * ORDER_GAP }))
    .filter((p) => p.id === movingId || idx.byId.get(p.id)?.order !== p.order)
    .map((p) => (p.id === movingId ? { ...p, ...parentChange } : p));
}

/**
 * Can `movingId` go under `parentId` (null is the top level)? Null when it
 * can, a sentence when it cannot.
 */
export function nestProblem(idx, movingId, parentId) {
  const moving = idx.byId.get(movingId);
  if (!moving) return 'That item has gone.';
  const parent = parentId ? idx.byId.get(parentId) : null;
  if (parentId && !parent) return 'That destination has gone.';
  if (parentId === movingId) return 'Something cannot go inside itself.';
  if (parentId && descendantIds(idx, movingId).includes(parentId)) return 'Something cannot go inside one of its own tasks or groups.';
  const insideJob = parent && (parent.kind === KIND.task || parent.kind === KIND.step || isSection(idx, parent));
  switch (moving.kind) {
    case KIND.step:
      if (!insideJob) return 'Steps live inside a job.';
      return null;
    case KIND.product:
      if (parent && parent.kind !== KIND.group) return 'A product goes in a category.';
      if (insideJob) return 'A product goes in a category, not inside a job.';
      return null;
    case KIND.group:
      if (parent?.kind === KIND.step) return 'A group cannot go inside a step.';
      if (parent?.kind === KIND.product) return 'Products hold jobs, not groups.';
      return null;
    case KIND.task:
    default:
      return null;
  }
}

/**
 * TileDo's nest_under: move a node into a new parent. `position` is 'end',
 * 'start', or 'beforeGroups' (a new job sits above its siblings' sub-groups).
 * @returns {{patches?: object[], error?: string}}
 */
export function nestUnder(idx, movingId, parentId, position = 'end') {
  const problem = nestProblem(idx, movingId, parentId);
  if (problem) return { error: problem };
  const siblings = childrenOf(idx, parentId).filter((c) => c.id !== movingId);
  let index = siblings.length;
  if (position === 'start') index = 0;
  if (position === 'beforeGroups') {
    const g = siblings.findIndex((c) => c.kind === KIND.group || c.kind === KIND.product);
    index = g === -1 ? siblings.length : g;
  }
  return { patches: placeAt(idx, movingId, parentId ?? null, index) };
}

/**
 * TileDo's insert_relative: put `movingId` just before or after `targetId`,
 * under the target's parent.
 * @returns {{patches?: object[], error?: string}}
 */
export function insertRelative(idx, movingId, targetId, where = 'before') {
  const target = idx.byId.get(targetId);
  if (!target) return { error: 'That item has gone.' };
  if (movingId === targetId) return { patches: [] };
  const parentId = parentOf(idx, target)?.id ?? null;
  const problem = nestProblem(idx, movingId, parentId);
  if (problem) return { error: problem };
  const siblings = childrenOf(idx, parentId).filter((c) => c.id !== movingId);
  const at = siblings.findIndex((c) => c.id === targetId);
  return { patches: placeAt(idx, movingId, parentId, where === 'after' ? at + 1 : at) };
}

/** Where a new child goes so it lands at the end, or before the sub-groups. */
export function newOrder(idx, parentId, position = 'end') {
  const siblings = childrenOf(idx, parentId);
  if (position === 'beforeGroups') {
    const g = siblings.findIndex((c) => c.kind === KIND.group || c.kind === KIND.product);
    if (g !== -1) {
      const prev = siblings[g - 1];
      const next = siblings[g];
      return prev ? (prev.order + next.order) / 2 : next.order - ORDER_GAP;
    }
  }
  if (position === 'start') return siblings.length ? siblings[0].order - ORDER_GAP : ORDER_GAP;
  return siblings.length ? siblings[siblings.length - 1].order + ORDER_GAP : ORDER_GAP;
}

// ---------------------------------------------------------------------------
// progress and completion
// ---------------------------------------------------------------------------

/**
 * Progress of a job or task: leaf steps plus subtasks, N/a and cancelled
 * left out. A step with sub-steps counts through them; a subtask counts once,
 * whatever it holds (it has its own progress); a section counts through what
 * it holds. The tile bars and the panel header read the same number.
 * @returns {{done: number, total: number}}
 */
export function progress(idx, id) {
  let done = 0;
  let total = 0;
  const walk = (pid) => {
    for (const c of childrenOf(idx, pid)) {
      if (c.kind === KIND.task) {
        if (c.status === 'cancelled') continue;
        total += 1;
        if (c.status === 'done') done += 1;
      } else if (c.kind === KIND.step) {
        const kids = childrenOf(idx, c.id).filter((k) => k.kind === KIND.step || k.kind === KIND.task);
        if (kids.length) { walk(c.id); continue; }
        if (c.state === 'na') continue;
        total += 1;
        if (c.state === 'done') done += 1;
      } else if (c.kind === KIND.group) {
        walk(c.id);
      }
    }
  };
  walk(id);
  return { done, total };
}

/** Is a step done for its parent's sake: done or N/a, or all its sub-steps are? */
export function stepFinished(idx, step) {
  const kids = childrenOf(idx, step.id).filter((k) => k.kind === KIND.step || k.kind === KIND.task);
  if (!kids.length) return step.state === 'done' || step.state === 'na';
  return kids.every((k) => (k.kind === KIND.task ? !OPEN(k.status) : stepFinished(idx, k)));
}

/** The first step or subtask still open, depth first: the tile's "Next:" line. */
export function nextStep(idx, id) {
  for (const c of childrenOf(idx, id)) {
    if (c.kind === KIND.task) {
      if (OPEN(c.status)) return c;
    } else if (c.kind === KIND.step) {
      const kids = childrenOf(idx, c.id).filter((k) => k.kind === KIND.step || k.kind === KIND.task);
      if (kids.length) { const n = nextStep(idx, c.id); if (n) return n; }
      else if (c.state !== 'done' && c.state !== 'na') return c;
    } else if (c.kind === KIND.group) {
      const n = nextStep(idx, c.id);
      if (n) return n;
    }
  }
  return null;
}

/**
 * TileDo's cascade_complete, as a question rather than an act: what is still
 * open inside a task that is being marked done. The caller asks the person
 * before closing them (decided 2026-11-04).
 * @returns {{tasks: string[], steps: string[]}}
 */
export function cascadeTargets(idx, id) {
  const tasks = [];
  const steps = [];
  for (const d of descendantIds(idx, id)) {
    const n = idx.byId.get(d);
    if (n.kind === KIND.task && OPEN(n.status)) tasks.push(d);
    if (n.kind === KIND.step && n.state !== 'done' && n.state !== 'na'
      && !childrenOf(idx, d).some((k) => k.kind === KIND.step || k.kind === KIND.task)) steps.push(d);
  }
  return { tasks, steps };
}

/** Every job under a group (or the top), at any depth, outside other jobs. */
export function jobsUnder(idx, groupId) {
  const out = [];
  const walk = (pid) => {
    for (const c of childrenOf(idx, pid)) {
      if (c.kind === KIND.task) out.push(c);
      else if (isGroupLike(c)) walk(c.id);
    }
  };
  walk(groupId);
  return out;
}

/** Open jobs under a group: the sidebar's count. */
export const openJobCount = (idx, groupId) => jobsUnder(idx, groupId).filter((j) => OPEN(j.status)).length;

/** Every task below a node at any depth (jobs, sub-jobs and tasks; never steps). */
export function tasksUnder(idx, id) {
  return descendantIds(idx, id).map((d) => idx.byId.get(d)).filter((n) => n.kind === KIND.task);
}
