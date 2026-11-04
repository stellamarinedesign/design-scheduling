// notes.js — the Log's rules, pure (no store, no DOM), so the tests can hold
// them still. The Log brief (PLAN, confirmed 2026-11-04) is the source.
//
// A NOTE IS TEXT FIRST. Its first line is its title; there is no separate
// title field to fill in on a phone on the workshop floor. Photos, a kind and
// a category come after.
//
// KINDS AND THEIR LIFECYCLE:
//   Issue / Idea   open -> actioned (a job is linked) -> resolved (every
//                  linked job finished, at least one done) - or dismissed,
//                  with a reason. Open is what needs the lead.
//   Reference      filed: permanent documentation (as-built photos, how-tos,
//                  decisions). Quiet. The lead may archive one.
// A note keeps `jobIds` (for the "notes linked to this job" query) and
// `links` [{id, title}] beside it: contributors read no tasks, so the title a
// card shows them has to travel on the note.

import * as T from './tree.js';
import { FROM_DESIGNERS } from './team.js';

export const KINDS = ['issue', 'idea', 'reference'];
export const KIND_LABEL = { issue: 'Issue', idea: 'Idea', reference: 'Reference' };
export const STATES = ['open', 'actioned', 'resolved', 'dismissed', 'filed', 'archived'];

/** The word and tone for a note's state; null for a filed reference, which stays quiet. */
export const STATE_LOOK = {
  open: { word: 'Open', tone: 'waiting' },        // waiting on the lead: amber, as a wait is
  actioned: { word: 'Actioned', tone: 'in_progress' },
  resolved: { word: 'Resolved', tone: 'done' },
  dismissed: { word: 'Dismissed', tone: 'cancelled' },
  archived: { word: 'Archived', tone: 'cancelled' },
  filed: null,
};

export const TEXT_MAX = 20000;
export const TITLE_MAX = 140;
export const PHOTOS_MAX = 12;

/** Where a new note of this kind starts. */
export const initialState = (kind) => (kind === 'reference' ? 'filed' : 'open');

/** Strip the light formatting a title line might carry: a bullet, **bold**. */
const plainLine = (s) => String(s ?? '').replace(/^\s*[-*•]\s+/, '').replace(/\*\*(.+?)\*\*/g, '$1').trim();

/**
 * The first line that has something on it, as the title: cut for a card or a
 * dialog; whole (`max` Infinity) in the note's own panel, where nothing else
 * shows the rest of it.
 */
export function titleOf(note, max = TITLE_MAX) {
  const line = String(note?.text ?? '').split(/\r?\n/).map(plainLine).find(Boolean) ?? '';
  return line.length > max ? `${line.slice(0, max - 1).trimEnd()}…` : line;
}

/** Everything after the title line. */
export function bodyOf(note) {
  const lines = String(note?.text ?? '').split(/\r?\n/);
  const i = lines.findIndex((l) => plainLine(l));
  return i < 0 ? '' : lines.slice(i + 1).join('\n').replace(/^\s*\n/, '').trimEnd();
}

/** A short plain excerpt of the body, for a card. */
export function excerptOf(note, max = 320) {
  const s = bodyOf(note).split(/\r?\n/).map(plainLine).filter(Boolean).join(' · ');
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
}

export const isTriage = (n) => n?.kind === 'issue' || n?.kind === 'idea';
export const isOpen = (n) => n?.state === 'open';
export const isLive = (n) => n?.state !== 'archived';

/**
 * The kind changed while editing: an untriaged note moves between open and
 * filed with it; one already actioned, resolved or dismissed keeps its state.
 */
export function stateForKind(note, kind) {
  return ['open', 'filed'].includes(note?.state ?? 'open') ? initialState(kind) : note.state;
}

/** A whole new note, every field written (the rules check its shape). */
export function noteNode({ id, text, kind = 'issue', groupId = null, jobs = [], photos = [], by, at }) {
  const k = KINDS.includes(kind) ? kind : 'issue';
  const linked = jobs.filter((j) => j?.id).slice(0, 20);
  return {
    id,
    text: String(text ?? '').slice(0, TEXT_MAX),
    kind: k,
    state: linked.length && k !== 'reference' ? 'actioned' : initialState(k),
    groupId: groupId ?? null,
    jobIds: linked.map((j) => j.id),
    links: linked.map((j) => ({ id: j.id, title: String(j.title ?? '').slice(0, 200) })),
    photos: photos.slice(0, PHOTOS_MAX),
    by, at, updatedAt: at, editedAt: null,
    actioned: linked.length ? { by, at } : null,
    dismissed: null,
    archivedAt: null,
  };
}

/**
 * Link a job to a note: an open issue or idea becomes Actioned. Linking twice
 * changes nothing.
 * @returns {object|null} the patch, or null when it is linked already
 */
export function linkPatch(note, job, { by, at }) {
  if (!note || !job?.id || (note.jobIds ?? []).includes(job.id)) return null;
  const p = {
    id: note.id,
    jobIds: [...(note.jobIds ?? []), job.id],
    links: [...(note.links ?? []), { id: job.id, title: String(job.title ?? '').slice(0, 200) }],
    updatedAt: at, lastBy: by,
  };
  if (isTriage(note) && ['open', 'dismissed'].includes(note.state)) {
    p.state = 'actioned';
    p.actioned = { by, at };
    p.dismissed = null;
  }
  return p;
}

/**
 * Unlink a job. An Actioned issue or idea with nothing linked any more goes
 * back to Open; a Resolved one stays resolved (its work was done).
 */
export function unlinkPatch(note, jobId, { by, at }) {
  if (!note || !(note.jobIds ?? []).includes(jobId)) return null;
  const jobIds = note.jobIds.filter((x) => x !== jobId);
  const p = { id: note.id, jobIds, links: (note.links ?? []).filter((l) => l.id !== jobId), updatedAt: at, lastBy: by };
  if (!jobIds.length && isTriage(note) && note.state === 'actioned') {
    p.state = 'open';
    p.actioned = null;
  }
  return p;
}

/** Dismiss an issue or idea, with the reason. */
export function dismissPatch(note, reason, { by, at }) {
  if (!note || !isTriage(note)) return null;
  return { id: note.id, state: 'dismissed', dismissed: { by, at, reason: String(reason ?? '').trim().slice(0, 500) }, updatedAt: at, lastBy: by };
}

/** Undo a dismissal: back to open, or actioned if a job is still linked. */
export function reopenPatch(note, { by, at }) {
  if (!note || note.state !== 'dismissed') return null;
  return { id: note.id, state: (note.jobIds ?? []).length ? 'actioned' : 'open', dismissed: null, updatedAt: at, lastBy: by };
}

/**
 * Is a linked job finished? Done or cancelled. `null` when this reader cannot
 * see it (archived, deleted, or not readable): no conclusion is drawn.
 */
const jobFinished = (idx, id) => {
  const j = idx.byId.get(id);
  if (!j) return null;
  return j.status === 'done' || j.status === 'cancelled';
};

/**
 * Notes whose state their jobs have overtaken: actioned with every linked
 * job finished and at least one done becomes Resolved. Run by the lead's app
 * (only a lead marks anything done). A job it cannot see draws no conclusion.
 * @returns {object[]} patches
 */
export function resolveFixes(notes, idx, { at }) {
  const out = [];
  for (const n of notes) {
    if (n.state !== 'actioned' || !n.jobIds?.length || !isTriage(n)) continue;
    const fin = n.jobIds.map((id) => jobFinished(idx, id));
    if (fin.some((f) => f === null)) continue;
    if (fin.every(Boolean) && n.jobIds.some((id) => idx.byId.get(id)?.status === 'done')) {
      out.push({ id: n.id, state: 'resolved', updatedAt: at });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// categories: the group tree, as the Log uses it
// ---------------------------------------------------------------------------

/**
 * A category is a group outside any job, and outside "From designers" (a
 * note does not belong in someone's inbox).
 */
export function isNoteCategory(idx, n) {
  if (!T.isGroupLike(n) || n.id === FROM_DESIGNERS) return false;
  const chain = T.ancestorChain(idx, n.id);
  return !chain.some((a) => a.kind === T.KIND.task || a.kind === T.KIND.step || a.id === FROM_DESIGNERS);
}

/** A category and everything inside it, as a set of ids, for filtering. */
export function scopeOf(idx, groupId) {
  if (!groupId) return null;
  const ids = new Set([groupId]);
  for (const id of T.descendantIds(idx, groupId)) ids.add(id);
  return ids;
}

/**
 * The categories, in tree order, with their depth: what the composer and the
 * filter pick from. Recent ones (this person's last used) come first when
 * asked.
 */
export function categoryList(idx, { recent = [] } = {}) {
  const out = [];
  const walk = (pid, depth) => {
    for (const c of T.childrenOf(idx, pid)) {
      if (!isNoteCategory(idx, c)) continue;
      out.push({ node: c, depth });
      walk(c.id, depth + 1);
    }
  };
  walk(null, 0);
  const fresh = recent.map((id) => out.find((x) => x.node.id === id)).filter(Boolean);
  return { recent: fresh, all: out };
}

/** Remember a category as used, most recent first, a handful kept. */
export const pushRecent = (list, id, keep = 5) => (id ? [id, ...(list ?? []).filter((x) => x !== id)].slice(0, keep) : list ?? []);

// ---------------------------------------------------------------------------
// the feed: which notes show
// ---------------------------------------------------------------------------

export const PILLS = [
  { key: 'all', label: 'All' },
  { key: 'open', label: 'Open issues & ideas' },
  { key: 'reference', label: 'Reference' },
];

/** Merge the live windows (the newest page, and every open or actioned note) by id. */
export function mergeNotes(...lists) {
  const m = new Map();
  for (const list of lists) for (const n of list ?? []) m.set(n.id, n);
  return [...m.values()].sort((a, b) => String(b.at).localeCompare(String(a.at)));
}

const norm = (s) => String(s ?? '').toLowerCase();

/**
 * The notes to show, newest first.
 * @param {object[]} notes
 * @param {{pill?: string, groupId?: string|null, author?: string|null,
 *          query?: string, idx?: object, who?: (email: string) => string}} f
 */
export function filterNotes(notes, { pill = 'all', groupId = null, author = null, query = '', idx = null, who = (e) => e } = {}) {
  const scope = idx && groupId ? scopeOf(idx, groupId) : null;
  const q = norm(query).trim();
  return notes.filter((n) => {
    if (pill === 'open') { if (!(isTriage(n) && n.state === 'open')) return false; }
    else if (pill === 'reference') { if (n.kind !== 'reference') return false; }
    else if (n.state === 'archived') return false;
    if (scope && !scope.has(n.groupId)) return false;
    if (author && n.by !== author) return false;
    if (q) {
      const path = idx && n.groupId && idx.byId.get(n.groupId) ? T.categoryPath(idx, n.groupId).concat(idx.byId.get(n.groupId)).map(T.nameOf).join(' ') : '';
      const hay = `${n.text} ${path} ${who(n.by)} ${(n.links ?? []).map((l) => l.title).join(' ')}`;
      if (!q.split(/\s+/).every((w) => norm(hay).includes(w))) return false;
    }
    return true;
  });
}

/** The category path a card shows: 'Davits › Single stage', the group itself included. */
export function placeText(idx, groupId) {
  const g = groupId ? idx.byId.get(groupId) : null;
  if (!g) return '';
  const path = T.categoryPath(idx, groupId).concat(g);
  return (path.length > 1 ? path.slice(1) : path).map(T.nameOf).join(' › ');
}

/** Everyone who has posted in these notes, most posts first. */
export function authorsOf(notes) {
  const c = new Map();
  for (const n of notes) c.set(n.by, (c.get(n.by) ?? 0) + 1);
  return [...c.entries()].sort((a, b) => b[1] - a[1]).map(([e]) => e);
}
