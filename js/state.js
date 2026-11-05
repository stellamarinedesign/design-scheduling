// state.js — what the app holds in memory: the live tree and who is looking.
//
// One live query fills `nodes`; the index is rebuilt from it on every change
// (a few hundred nodes is nothing) and every view is derived from it.

import { buildIndex, isJob } from './tree.js';
import { nameFor } from './team.js';
import { mergeNotes } from './notes.js';
import { readNode, isStep } from './migrate.js';

export const state = {
  nodes: [],
  // The live nodes as they are stored, and the steps among them not yet
  // converted into tasks (migrate.js): the lead's app counts them and offers
  // to convert them, with a backup of `raw` first. `nodes` and the tree read
  // each step as the task it will become.
  raw: [],
  rawSteps: [],
  idx: buildIndex([]),
  ready: false,       // the first snapshot has arrived
  error: null,        // the live query failed (offline first load, permissions)
  me: 'local',        // the address that goes in createdBy / assignee / by
  role: 'lead',
  mode: 'local',      // 'local' | 'firestore'
  people: {},         // email → {name}: people/{email}, live
  access: { leads: [], designers: [], contributors: [], managers: [], masters: [] },
  noteId: null,       // the note open in the panel (?n=)
  // The Log: the newest page of notes, and every open or actioned note (the
  // triage queue, never paged away). `limit` grows with "Show older".
  // `solo` is a note opened from a link that is older than the page.
  log: { feed: [], triage: [], more: false, limit: 40, loaded: false, error: null, solo: null },
};

const subs = new Set();
export const subscribe = (fn) => { subs.add(fn); return () => subs.delete(fn); };

export function setNodes(nodes, meta = {}) {
  state.raw = nodes;
  state.rawSteps = nodes.filter(isStep);
  state.nodes = state.rawSteps.length ? nodes.map(readNode) : nodes;
  state.idx = buildIndex(state.nodes);
  state.ready = true;
  state.error = null;
  for (const fn of subs) fn(meta);
}

export function setError(e) {
  state.error = e;
  for (const fn of subs) fn({ error: e });
}

export const node = (id) => state.idx.byId.get(id) ?? null;

/** A change to the Log's live windows; everything redraws, as for the tree. */
export function setLog(fields) {
  Object.assign(state.log, fields);
  for (const fn of subs) fn({ log: true });
}

/** Every note in hand, newest first, each once. */
export const allNotes = () => mergeNotes(state.log.triage, state.log.feed);

/** A note, if it is in one of the live windows. */
export const noteOf = (id) => state.log.feed.find((n) => n.id === id) ?? state.log.triage.find((n) => n.id === id)
  ?? (state.log.solo?.id === id ? state.log.solo : null);

/** How a person is named on screen. You are "You". */
export function personName(email) {
  if (!email) return 'Unassigned';
  if (email === state.me) return 'You';
  return nameFor(state.people, email);
}

/** A person's own name, never "You": for text that others read too. */
export const realName = (email) => nameFor(state.people, email);

/**
 * Is this mine? Assigned to me; for the lead, also a JOB assigned to nobody
 * (the lead's own work, as in Phase 1). A task inside a job with nobody on it
 * is part of that job, not anyone's on its own. A designer's work is only
 * what is theirs.
 */
export const isMine = (n) => n.assignee === state.me || (!n.assignee && state.role === 'lead' && isJob(state.idx, n));

export const isLead = () => state.role === 'lead';
