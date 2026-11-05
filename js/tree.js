// tree.js — the one tree everything lives in, and the pure helpers over it.
//
// GROUPS ANYWHERE. Every node is a `tasks` document with a `kind`:
//   group    a category: master categories at the top, categories and
//            sub-categories inside them, or sections inside a job;
//   product  a product row for the Progress page (Phase 4); its jobs are its
//            revisions;
//   task     a job (its parent is a group, a product, or nothing) or a task
//            (anything under a job, at any depth).
// Siblings of every kind share one manual `order`. Nothing here knows any
// category by name or assumes a depth: a node's category path, colour and
// tasks template are read off its group ancestors.
//
// ONE KIND OF TASK (decided 2026-11-06, Phase 2.5). Inside a job there used
// to be steps (light ticks) and subtasks (real tasks); in use the difference
// confused. Now everything inside a job is a task, and AN ASSIGNEE OF ITS OWN
// IS WHAT MAKES ONE HEAVY:
//   - a nested task with nobody on it is PART OF ITS JOB (`isLight`): one
//     tap ticks it, a designer may tick it Done, it never goes for check, and
//     it never shows on Home or anyone's lists - only its job does. With
//     tasks inside, its state is worked out from them (`shownStatus`);
//   - a nested task with an assignee is a real task, on their lists and
//     through the check. Assigning promotes; unassigning demotes.
// `step` stays in KIND only for data written before the change: the
// migration (migrate.js) turns every step into a task, and until it has run
// the app reads each one as the task it will become.
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
  const cycled = new Set();
  for (const n of nodes ?? []) byId.set(n.id, n);
  // A PARENT CYCLE (A inside B inside A) can come from two moves made at the
  // same moment on two devices: each was legal alone. Walked naively it never
  // reaches the top, so every node in it vanishes from view and any walk down
  // it never ends. A node whose chain of parents comes back to itself is put
  // at the top instead, where it can be seen and moved somewhere sensible.
  const inCycle = (n) => {
    const seen = new Set([n.id]);
    let p = n.parentId && byId.get(n.parentId);
    while (p) {
      if (seen.has(p.id)) return p.id === n.id;     // a loop above it, not through it: it stays where it is
      seen.add(p.id);
      p = p.parentId && byId.get(p.parentId);
    }
    return false;
  };
  for (const n of byId.values()) {
    // A parent that is not here (archived, deleted, or never imported) leaves
    // its child at the top, rather than hiding it where nobody can reach it.
    const looped = n.parentId && byId.has(n.parentId) && inCycle(n);
    if (looped) cycled.add(n.id);
    const key = n.parentId && byId.has(n.parentId) && !looped ? n.parentId : '';
    if (!kids.has(key)) kids.set(key, []);
    kids.get(key).push(n);
  }
  for (const list of kids.values()) list.sort(byOrder);
  return { byId, kids, cycled, nodes: [...byId.values()] };
}

/** The parent as the index sees it: null at the top, or for an orphan. */
export const parentOf = (idx, n) => (n?.parentId && !idx.cycled?.has(n.id) && idx.byId.get(n.parentId)) || null;

/** A parent's children in manual order. `null` is the top level. */
export const childrenOf = (idx, id) => idx.kids.get(id ?? '') ?? [];

/** Every node below one, depth first, in order. Never visits a node twice, whatever the data. */
export function descendantIds(idx, id) {
  const out = [];
  const seen = new Set([id ?? '']);
  const walk = (pid) => {
    for (const c of childrenOf(idx, pid)) {
      if (seen.has(c.id)) continue;
      seen.add(c.id);
      out.push(c.id);
      walk(c.id);
    }
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

/** What a node is called on screen, whatever its kind (a step not yet converted has a label). */
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

/**
 * PART OF ITS JOB: a task inside a job with no assignee of its own (what a
 * step was). It is ticked, not checked, and lists show its job instead.
 */
export const isLight = (idx, n) => n?.kind === KIND.task && !n.assignee && !isJob(idx, n);

/** Does a node have tasks among its children (directly, or inside its sections)? */
export function hasTaskChildren(idx, id) {
  return childrenOf(idx, id).some((c) => c.kind === KIND.task
    || (c.kind === KIND.group && hasTaskChildren(idx, c.id)));
}

/** A light task with tasks inside: its state is theirs, worked out (`shownStatus`), never ticked itself. */
export const isContainer = (idx, n) => isLight(idx, n) && hasTaskChildren(idx, n.id);

/** The tasks inside a node, through its sections, one level down. */
function innerTasks(idx, id) {
  const out = [];
  for (const c of childrenOf(idx, id)) {
    if (c.kind === KIND.task) out.push(c);
    else if (c.kind === KIND.group) out.push(...innerTasks(idx, c.id));
  }
  return out;
}

/**
 * The status a task shows. Its own, except a light task with tasks inside:
 * Done when everything inside is done or cancelled (Cancelled when all of it
 * was cancelled), In progress when anything inside is under way or done, else
 * To do. Its own Cancelled stands.
 */
export function shownStatus(idx, n) {
  if (!isContainer(idx, n) || n.status === 'cancelled') return n?.status ?? 'todo';
  const inner = innerTasks(idx, n.id).map((c) => shownStatus(idx, c));
  if (inner.every((s) => !OPEN(s))) return inner.every((s) => s === 'cancelled') ? 'cancelled' : 'done';
  return inner.some((s) => s !== 'todo' && s !== 'cancelled') ? 'in_progress' : 'todo';
}

/** Finished for its parent's sake: done or cancelled, as it shows. */
export const isFinishedNode = (idx, n) => !OPEN(shownStatus(idx, n));

/**
 * The task a node belongs to: itself when it is a task, else the nearest task
 * above it, through sections.
 */
export function ownerTask(idx, id) {
  const n = idx.byId.get(id);
  if (!n) return null;
  if (n.kind === KIND.task) return n;
  const chain = ancestorChain(idx, id);
  for (let i = chain.length - 1; i >= 0; i--) {
    const a = chain[i];
    if (a.kind === KIND.task) return a;
    if (a.kind !== KIND.step && a.kind !== KIND.group) return null;
  }
  return null;
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

/**
 * The tasks whose "last activity" moves when something happens at a node:
 * the node itself when it is a task, and every task above it - the sub-job it
 * sits in as well as the job. The Backlog reads lastActivityAt, and its pool
 * holds sub-jobs too. A task above it that is part of its job is passed over:
 * nothing reads its activity, and every tick would write it.
 */
export function activityTargets(idx, id) {
  const self = idx.byId.get(id);
  const out = ancestorChain(idx, id).filter((a) => a.kind === KIND.task && !isLight(idx, a)).map((a) => a.id);
  if (self?.kind === KIND.task) out.push(self.id);
  return out;
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

/**
 * The tasks template of the nearest group that has one, the node itself
 * included. Stored as `stepsTemplate` (its shape, [{label, children?}], is
 * unchanged since steps merged into tasks); on screen it is the tasks template.
 */
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
 * A tasks template as text, one task a line, the tasks inside one indented by
 * two spaces or a tab; and back. The template is stored as [{label, children?}].
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

/**
 * A task node with every field written, so queries and rules see real values
 * (Firestore's `== null` matches a stored null, never a missing field).
 */
export function blankTask({ id, parentId = null, order, title, brief = '', at, by, status = 'todo', assignee = null }) {
  return {
    id, kind: KIND.task, parentId, order,
    title: String(title ?? '').trim(), brief: String(brief ?? '').trim(),
    status, waiting: null, priority: 'normal',
    assignee: assignee ?? null, createdBy: by,
    createdAt: at, updatedAt: at, lastActivityAt: at, statusAt: at,
    due: null, revision: null, folders: [],
    checkedBy: null, checkedAt: null, doneAt: null, cancelled: null,
    homeOrder: null, backlogIgnored: false, archivedAt: null,
  };
}

/**
 * Tasks from a tasks template, under a parent: unassigned, so each is part of
 * its job, as a template's steps were. Pure: the caller hands in who and when,
 * and how ids are made. Each carries createdBy.
 */
export function tasksFromTemplate(template, parentId, { at, by, newId }) {
  const out = [];
  const walk = (list, pid) => list.forEach((t, i) => {
    const item = typeof t === 'string' ? { label: t } : t;
    const id = newId();
    out.push(blankTask({ id, parentId: pid, order: (i + 1) * ORDER_GAP, title: item.label, at, by }));
    if (item.children?.length) walk(item.children, id);
  });
  walk(template ?? [], parentId);
  return out;
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
 * Progress of a job or task: the tasks inside it, cancelled ones left out. A
 * light task with tasks inside counts through them (its state is theirs); a
 * task with an assignee counts once, by its own status, whatever it holds
 * (it has its own progress); a section counts through what it holds. So the
 * numbers are the ones the steps gave before they merged into tasks. The tile
 * bars, the panel header, the Progress page and the stage read the same.
 * @returns {{done: number, total: number}}
 */
export function progress(idx, id) {
  let done = 0;
  let total = 0;
  const walk = (pid) => {
    for (const c of childrenOf(idx, pid)) {
      if (c.kind === KIND.task) {
        if (isContainer(idx, c) && c.status !== 'cancelled') { walk(c.id); continue; }
        if (c.status === 'cancelled') continue;
        total += 1;
        if (c.status === 'done') done += 1;
      } else if (c.kind === KIND.group) {
        walk(c.id);
      }
    }
  };
  walk(id);
  return { done, total };
}

/**
 * The first task still open, depth first, looking inside light tasks (whose
 * state is their insides') and sections: the tile's "Next:" line, and the
 * stage a manager sees.
 */
export function nextTask(idx, id) {
  for (const c of childrenOf(idx, id)) {
    if (c.kind === KIND.task) {
      if (isContainer(idx, c)) {
        if (c.status === 'cancelled') continue;
        const n = nextTask(idx, c.id);
        if (n) return n;
      } else if (OPEN(c.status)) return c;
    } else if (c.kind === KIND.group) {
      const n = nextTask(idx, c.id);
      if (n) return n;
    }
  }
  return null;
}

/**
 * TileDo's cascade_complete, as a question rather than an act: what is still
 * open inside a task that is being marked done. The caller asks the person
 * before closing them (decided 2026-11-04).
 * @returns {{tasks: string[]}}
 */
export function cascadeTargets(idx, id) {
  const tasks = [];
  for (const d of descendantIds(idx, id)) {
    const n = idx.byId.get(d);
    if (n.kind === KIND.task && OPEN(n.status)) tasks.push(d);
  }
  return { tasks };
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

/** Every task below a node at any depth (jobs and the tasks inside them). */
export function tasksUnder(idx, id) {
  return descendantIds(idx, id).map((d) => idx.byId.get(d)).filter((n) => n.kind === KIND.task);
}

/**
 * What comes back when one archived item is restored: it, everything below it
 * that was archived in the same act (same archivedAt), and any archived
 * ancestors, so it does not land orphaned at the top. Nothing else archived
 * at that moment - "Archive all done" archives many jobs with one stamp, and
 * restoring one must not bring back (or hide) the rest.
 */
export function restoreSet(item, archived) {
  const byId = new Map(archived.map((n) => [n.id, n]));
  const kids = new Map();
  for (const n of archived) { if (!kids.has(n.parentId)) kids.set(n.parentId, []); kids.get(n.parentId).push(n); }
  const ids = new Set([item.id]);
  const walk = (id) => {
    for (const c of kids.get(id) ?? []) {
      if (c.archivedAt !== item.archivedAt || ids.has(c.id)) continue;
      ids.add(c.id);
      walk(c.id);
    }
  };
  walk(item.id);
  let p = byId.get(item.parentId);
  while (p && !ids.has(p.id)) { ids.add(p.id); p = byId.get(p.parentId); }
  return ids;
}
