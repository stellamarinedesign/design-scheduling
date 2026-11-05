// team.js — the team as data, and the pure logic behind the team views:
// Home's Ready for checking and Crew, the Team tab, and a designer's own
// action-first Tasks list (PLAN: "Home brief", "Designer view", "Designer
// Tasks list: action-first layout"). No store and no DOM, so the tests import
// it as it is.
//
// WHO IS WHOSE. A task is a person's when it is assigned to them. The lead's
// own work is also anything unassigned (state.isMine), as it was in Phase 1.
// Crew is the designers only: the lead is not one of their own lanes.
//
// "FROM DESIGNERS". A task a designer adds for themselves lands in a group
// of their own under a lead-only master category, "From designers › Alex".
// The rules let only the lead make groups outside a job, so the ids are
// fixed and worked out from the address (`inboxId`): the designer's task
// names its group before the group exists, sits at the top until the lead's
// app makes it (on its next snapshot, `inboxFixes`), and is then inside it
// with nothing moved. The lead files it into a proper category by dragging
// or Move to…; it keeps its assignee, so it stays on the designer's list.

import { KIND, ancestorChain, childrenOf, progress, stepFinished, nameOf, newOrder, ORDER_GAP } from './tree.js';
import { isOpen } from './status.js';
import { ageDays, ageLabel, dayOf, parseDay } from './dates.js';

// ---------------------------------------------------------------------------
// local mode: an invented team, so every role's screens can be checked
// ---------------------------------------------------------------------------

/**
 * LOCAL MODE has no accounts, so it has a small invented team instead (the
 * repository is public: these are not real people). The lead keeps the
 * address 'local' that local data has always used; "View as" in the
 * local-mode strip switches who this browser is.
 */
export const LOCAL_AS = {
  lead: 'local',
  designer: 'alex@local.test',
  contributor: 'riley@local.test',
  manager: 'casey@local.test',
};
export const LOCAL_PEOPLE = {
  local: { name: 'Design lead' },
  'alex@local.test': { name: 'Alex' },
  'sam@local.test': { name: 'Sam' },
  'riley@local.test': { name: 'Riley' },
  'casey@local.test': { name: 'Casey' },
};
export const LOCAL_ACCESS = {
  leads: ['local'],
  designers: ['alex@local.test', 'sam@local.test'],
  contributors: ['riley@local.test'],
  managers: ['casey@local.test'],
  masters: ['local'],
};

// ---------------------------------------------------------------------------
// people
// ---------------------------------------------------------------------------

/** Who can be given work: the leads, then the designers. */
export const assignable = (access) => [...new Set([...(access?.leads ?? []), ...(access?.designers ?? [])])];

/** Crew: the designers, in the order the access document lists them. */
export const crewOf = (access) => [...(access?.designers ?? [])];

/** A name to show for an address: the people document's, else the part before the @. */
export function nameFor(people, email) {
  if (!email) return '';
  const n = String(people?.[email]?.name ?? '').trim();
  return n || String(email).replace(/@.*/, '');
}

// ---------------------------------------------------------------------------
// "From designers"
// ---------------------------------------------------------------------------

/** The lead-only master category that holds each designer's own group. */
export const FROM_DESIGNERS = 'from-designers';

/** A designer's own group id: fixed, worked out from the address (FNV-1a), so both apps agree. */
export function inboxId(email) {
  let h = 0x811c9dc5;
  for (const ch of String(email ?? '').trim().toLowerCase()) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `fd-${h.toString(16).padStart(8, '0')}`;
}
export const isInboxId = (id) => /^fd-[0-9a-f]{8}$/.test(String(id ?? ''));

/** Is this task still where its designer put it, not yet filed by the lead? */
export const inInbox = (t) => isInboxId(t?.parentId);

/**
 * The groups the lead's app must make so designers' own tasks sit inside
 * "From designers": the master, once, and a group per designer whose tasks
 * name one that is not there. Only groups somebody's task points at are
 * made, so a designer who never adds one leaves no empty group behind.
 * @returns {object[]} whole nodes to write
 */
export function inboxFixes(idx, { designers = [], people = {}, by, at }) {
  const wanted = new Set();
  for (const n of idx.nodes) if (isInboxId(n.parentId) && !idx.byId.has(n.parentId)) wanted.add(n.parentId);
  if (!wanted.size) return [];
  const out = [];
  if (!idx.byId.has(FROM_DESIGNERS)) {
    out.push({
      id: FROM_DESIGNERS, kind: KIND.group, parentId: null, order: newOrder(idx, null, 'end'),
      name: 'From designers', colour: 10, createdBy: by, createdAt: at, updatedAt: at, archivedAt: null,
    });
  }
  let order = newOrder(idx, FROM_DESIGNERS, 'end');
  for (const id of [...wanted].sort()) {
    const who = inboxOwner(idx, id, designers);
    out.push({
      id, kind: KIND.group, parentId: FROM_DESIGNERS, order, inboxOf: who,
      name: who ? nameFor(people, who) : FORMER, createdBy: by, createdAt: at, updatedAt: at, archivedAt: null,
    });
    order += ORDER_GAP;
  }
  return out;
}

/** The name a designer's group gets when nobody can be found for it. */
const FORMER = 'A former designer';

/**
 * Whose group is this? The access list says, when the designer is on it.
 * The tasks inside say too - a designer's own task is made by and assigned
 * to them - so a list that is out of date (an account added in Settings
 * after this app loaded it) still finds them.
 */
function inboxOwner(idx, id, designers) {
  for (const d of designers) if (inboxId(d) === id) return d;
  for (const n of idx.nodes) {
    if (n.parentId !== id) continue;
    for (const a of [n.createdBy, n.assignee]) if (a && inboxId(a) === id) return a;
  }
  return null;
}

/**
 * Designers' groups whose name is a stand-in, put right: one made before its
 * designer could be found ("A former designer"), or named from the address
 * before the person's name had loaded. A name the lead typed is kept.
 * @returns {object[]} patches
 */
export function inboxRepairs(idx, { designers = [], people = {}, at }) {
  const out = [];
  for (const g of idx.nodes) {
    if (g.kind !== KIND.group || !isInboxId(g.id)) continue;
    const who = g.inboxOf ?? inboxOwner(idx, g.id, designers);
    if (!who) continue;
    const name = nameFor(people, who);
    const standIn = g.name === FORMER || g.name === String(who).replace(/@.*/, '');
    if ((g.inboxOf ?? null) === who && (!standIn || g.name === name)) continue;
    out.push({ id: g.id, inboxOf: who, ...(standIn && g.name !== name ? { name } : {}), updatedAt: at });
  }
  return out;
}

// ---------------------------------------------------------------------------
// time in a status
// ---------------------------------------------------------------------------

/** When a task reached the status it is in. Older tasks (before statusAt) use the best stamp they have. */
export function statusSince(t) {
  if (t?.statusAt) return t.statusAt;
  if (t?.status === 'waiting' && t.waiting?.since) return t.waiting.since;
  if (t?.status === 'check' && t.submittedAt) return t.submittedAt;
  if (t?.status === 'done' && t.doneAt) return t.doneAt;
  return t?.lastActivityAt ?? t?.updatedAt ?? t?.createdAt ?? null;
}

/** The Crew bar: time in the status as a share of two weeks, never empty, never over. */
export function sinceShare(t, now = Date.now()) {
  const d = ageDays(statusSince(t), now);
  return Math.max(0.04, Math.min(1, d / 14));
}

// ---------------------------------------------------------------------------
// Ready for checking, Crew and the Team tab
// ---------------------------------------------------------------------------

const ACTIVE = ['fix', 'check', 'in_progress', 'waiting'];
const tasks = (idx) => idx.nodes.filter((n) => n.kind === KIND.task);

/** Everything waiting for the lead's check, at any depth: the oldest waits first. */
export function checkQueue(idx) {
  return tasks(idx).filter((t) => t.status === 'check')
    .sort((a, b) => String(statusSince(a)).localeCompare(String(statusSince(b))));
}

/** A person's last activity: the newest thing they did, else the newest on their work. */
export function lastSeen(idx, email) {
  let best = null;
  for (const n of idx.nodes) if (n.lastBy === email && n.lastActivityAt && (!best || n.lastActivityAt > best)) best = n.lastActivityAt;
  if (best) return best;
  for (const n of tasks(idx)) if (n.assignee === email && n.lastActivityAt && (!best || n.lastActivityAt > best)) best = n.lastActivityAt;
  return best;
}

/** A Crew lane is quiet after this many days with nothing from them. */
export const QUIET_DAYS = 5;

/**
 * A designer's Crew lane: their active work (sent back, for check, in
 * progress, waiting) with the oldest-sitting first in each, the counts for
 * the lane's heading, and when they were last heard from.
 */
export function crewLane(idx, email, { now = Date.now() } = {}) {
  const mine = tasks(idx).filter((t) => t.assignee === email);
  const rows = mine.filter((t) => ACTIVE.includes(t.status))
    .sort((a, b) => ACTIVE.indexOf(a.status) - ACTIVE.indexOf(b.status) || String(statusSince(a)).localeCompare(String(statusSince(b))));
  const count = (s) => mine.filter((t) => t.status === s).length;
  const seen = lastSeen(idx, email);
  const quietFor = seen ? ageDays(seen, now) : null;
  return {
    email, rows,
    counts: { active: rows.length, check: count('check'), fix: count('fix'), waiting: count('waiting'), todo: count('todo') },
    seen, quiet: quietFor !== null && quietFor >= QUIET_DAYS, quietFor,
  };
}

/** The local week (Monday first) and month an instant falls in, as calendar days. */
function weekStart(now) {
  const d = new Date(now);
  const back = (d.getDay() + 6) % 7;
  return dayOf(new Date(d.getFullYear(), d.getMonth(), d.getDate() - back));
}
const dayOfInstant = (iso) => (iso ? dayOf(new Date(iso)) : null);

/** Done this week and this month (approved work, never cancelled), for a person. */
export function doneCounts(idx, email, now = Date.now()) {
  const wk = weekStart(now);
  const mo = dayOf(new Date(now)).slice(0, 7);
  let week = 0;
  let month = 0;
  for (const t of tasks(idx)) {
    if (t.status !== 'done' || t.assignee !== email) continue;
    const d = dayOfInstant(t.doneAt);
    if (!d) continue;
    if (d >= wk) week += 1;
    if (d.slice(0, 7) === mo) month += 1;
  }
  return { week, month };
}

/** Is a task done this month (local time)? */
export const doneThisMonth = (t, now = Date.now()) => t?.status === 'done' && dayOfInstant(t.doneAt)?.slice(0, 7) === dayOf(new Date(now)).slice(0, 7);

/**
 * A person's open work for a Team column, grouped as they act on it. To do
 * comes last and starts folded (the lead's own list runs long).
 */
export const TEAM_GROUPS = [
  { key: 'fix', statuses: ['fix'] },
  { key: 'check', statuses: ['check'] },
  { key: 'in_progress', statuses: ['in_progress'] },
  { key: 'waiting', statuses: ['waiting'] },
  { key: 'todo', statuses: ['todo'] },
];
export function teamColumn(idx, email, { includeUnassigned = false } = {}) {
  const mine = tasks(idx).filter((t) => t.assignee === email || (includeUnassigned && !t.assignee));
  return TEAM_GROUPS.map((g) => ({
    key: g.key,
    rows: mine.filter((t) => g.statuses.includes(t.status))
      .sort((a, b) => String(statusSince(a)).localeCompare(String(statusSince(b)))),
  }));
}

/**
 * Assigning a task: it, and the open tasks inside it that were following
 * it (same person as it had, or nobody), go to the new person. Tasks inside
 * that somebody else holds keep their person.
 * @returns {object[]} patches
 */
export function reassignPatches(idx, id, to, { at }) {
  const t = idx.byId.get(id);
  if (!t || t.kind !== KIND.task) return [];
  const from = t.assignee ?? null;
  const out = [{ id, assignee: to ?? null, updatedAt: at, lastActivityAt: at }];
  const walk = (pid) => {
    for (const c of childrenOf(idx, pid)) {
      if (c.kind === KIND.task) {
        if (isOpen(c.status) && (c.assignee ?? null) === from && (c.assignee ?? null) !== (to ?? null)) {
          out.push({ id: c.id, assignee: to ?? null, updatedAt: at });
        }
      }
      walk(c.id);
    }
  };
  walk(id);
  return out;
}

// ---------------------------------------------------------------------------
// a designer's own Tasks list
// ---------------------------------------------------------------------------

/** The groups, in the order a designer acts on them. Ready for check sits under In progress. */
export const MY_GROUPS = [
  { key: 'fix', label: 'Sent back to you', hint: 'Fix these first' },
  { key: 'progress', label: 'In progress' },
  { key: 'waiting', label: 'Waiting' },
  { key: 'todo', label: 'To do' },
  { key: 'done', label: 'Done this month' },
];
const groupKey = (s) => ({ fix: 'fix', in_progress: 'progress', check: 'progress', waiting: 'waiting', todo: 'todo', done: 'done' }[s] ?? null);

export const MY_SORTS = {
  due: 'Due',
  age: 'Age',
  updated: 'Last update',
  manual: 'Manual',
};

const byDue = (a, b) => {
  const da = parseDay(a.due) ? a.due : '9999';
  const db = parseDay(b.due) ? b.due : '9999';
  return da.localeCompare(db) || String(b.lastActivityAt).localeCompare(String(a.lastActivityAt));
};
const CMP = {
  due: byDue,
  age: (a, b) => String(a.createdAt).localeCompare(String(b.createdAt)),
  updated: (a, b) => String(b.lastActivityAt).localeCompare(String(a.lastActivityAt)),
  // Their own order (homeOrder, the same field Home's drag writes); unplaced first, newest first.
  manual: (a, b) => (a.homeOrder == null) - (b.homeOrder == null) || (a.homeOrder ?? 0) - (b.homeOrder ?? 0)
    || String(b.lastActivityAt).localeCompare(String(a.lastActivityAt)),
};

const norm = (s) => String(s ?? '').toLowerCase();

/**
 * A designer's list: every task assigned to them, at any depth, grouped by
 * what to do next. `query` filters on title, category and brief.
 * @returns {{key, label, hint?, rows: object[]}[]}
 */
export function myTaskGroups(idx, me, { now = Date.now(), sort = 'due', query = '', pathOf = () => '' } = {}) {
  const words = norm(query).split(/\s+/).filter(Boolean);
  const mine = tasks(idx).filter((t) => t.assignee === me
    && (t.status !== 'done' || doneThisMonth(t, now))
    && (!words.length || words.every((w) => `${norm(t.title)} ${norm(pathOf(t))} ${norm(t.brief)}`.includes(w))));
  const cmp = CMP[sort] ?? CMP.due;
  return MY_GROUPS.map((g) => ({
    ...g,
    rows: mine.filter((t) => groupKey(t.status) === g.key)
      .sort(g.key === 'done' ? (a, b) => String(b.doneAt).localeCompare(String(a.doneAt)) : cmp),
  }));
}

/**
 * The one "next" line under a row in a designer's list: the send-back
 * comment, what it waits on, the latest update, the brief's first line, or
 * the next step. `who(email)` names a person.
 * @returns {{text: string, cls: string}|null}
 */
export function nextLine(idx, t, { now = Date.now(), who = (e) => e, waitingLine = () => '' } = {}) {
  if (t.status === 'fix') return { text: t.fixNote ? `Sent back: ${t.fixNote}` : 'Sent back', cls: 'back' };
  if (t.status === 'waiting') {
    const since = t.waiting?.since ? ` · ${ageLabel(t.waiting.since, now)}` : '';
    const line = waitingLine(t).replace(/^Waiting: /, '').replace(/^Blocked by: /, '');
    return { text: `Waiting on: ${line || 'something'}${since}`, cls: 'wait' };
  }
  if (t.status === 'check') {
    return { text: `With the Design lead for check${t.submittedAt ? ` · ${ageLabel(t.submittedAt, now)}` : ''}`, cls: '' };
  }
  if (t.lastNote?.text && t.status !== 'todo') return { text: `${who(t.lastNote.by)}: ${t.lastNote.text}`, cls: '' };
  if (t.status === 'todo') {
    const first = String(t.brief ?? '').split(/\r?\n/).map((l) => l.replace(/^\s*[-*•]\s*/, '').replace(/\*\*/g, '').trim()).find(Boolean);
    if (first) return { text: `Brief: ${first}`, cls: '' };
    if (inInbox(t)) return { text: 'Added by you · not filed yet', cls: '' };
  }
  const step = firstOpenStep(idx, t.id);
  return step ? { text: `Next: ${nameOf(step)}`, cls: '' } : null;
}

function firstOpenStep(idx, id) {
  for (const c of childrenOf(idx, id)) {
    if (c.kind === KIND.task && isOpen(c.status)) return c;
    if (c.kind === KIND.step) {
      const kids = childrenOf(idx, c.id).filter((k) => k.kind === KIND.step || k.kind === KIND.task);
      if (kids.length) { const n = firstOpenStep(idx, c.id); if (n) return n; } else if (c.state !== 'done' && c.state !== 'na') return c;
    } else if (c.kind === KIND.group) {
      const n = firstOpenStep(idx, c.id);
      if (n) return n;
    }
  }
  return null;
}

const TASK_SEG = { todo: 'todo', in_progress: 'doing', check: 'doing', fix: 'fix', waiting: 'wait', done: 'done', cancelled: 'na' };

/**
 * The steps strip: one segment per top-level step or subtask (inside
 * sections too), as done / doing / fix / wait / todo / na. A step with steps
 * inside shows how they stand.
 * @returns {string[]}
 */
export function stepStrip(idx, id) {
  const out = [];
  const walk = (pid) => {
    for (const c of childrenOf(idx, pid)) {
      if (c.kind === KIND.task) out.push(TASK_SEG[c.status] ?? 'todo');
      else if (c.kind === KIND.step) {
        const kids = childrenOf(idx, c.id).filter((k) => k.kind === KIND.step || k.kind === KIND.task);
        if (!kids.length) out.push({ doing: 'doing', done: 'done', na: 'na' }[c.state] ?? 'todo');
        else if (stepFinished(idx, c)) out.push('done');
        else out.push(progress(idx, c.id).done ? 'doing' : 'todo');
      } else if (c.kind === KIND.group) walk(c.id);
    }
  };
  walk(id);
  return out;
}

/**
 * The one action a designer's row offers: Start a To-do, Submit when every
 * step is done, Post update while it is under way, else Open.
 * @returns {'start'|'submit'|'update'|'open'}
 */
export function rowAction(idx, t) {
  if (t.status === 'todo') return 'start';
  if (t.status === 'in_progress') {
    const p = progress(idx, t.id);
    return p.total && p.done === p.total ? 'submit' : 'update';
  }
  return 'open';
}

/** Where a task sits, for a row: its category path, or "Not filed yet" in its designer's group. */
export function placeOf(idx, t, pathText) {
  if (inInbox(t)) return 'Not filed yet';
  const chain = ancestorChain(idx, t.id);
  if (chain.some((a) => a.id === FROM_DESIGNERS)) return 'Not filed yet';
  return pathText(t.id) || '';
}
