// state.js — what the app holds in memory: the live tree and who is looking.
//
// One live query fills `nodes`; the index is rebuilt from it on every change
// (a few hundred nodes is nothing) and every view is derived from it.

import { buildIndex } from './tree.js';
import { nameFor } from './team.js';

export const state = {
  nodes: [],
  idx: buildIndex([]),
  ready: false,       // the first snapshot has arrived
  error: null,        // the live query failed (offline first load, permissions)
  me: 'local',        // the address that goes in createdBy / assignee / by
  role: 'lead',
  mode: 'local',      // 'local' | 'firestore'
  people: {},         // email → {name}: people/{email}, live
  access: { leads: [], designers: [], contributors: [], managers: [], masters: [] },
};

const subs = new Set();
export const subscribe = (fn) => { subs.add(fn); return () => subs.delete(fn); };

export function setNodes(nodes, meta = {}) {
  state.nodes = nodes;
  state.idx = buildIndex(nodes);
  state.ready = true;
  state.error = null;
  for (const fn of subs) fn(meta);
}

export function setError(e) {
  state.error = e;
  for (const fn of subs) fn({ error: e });
}

export const node = (id) => state.idx.byId.get(id) ?? null;

/** How a person is named on screen. You are "You". */
export function personName(email) {
  if (!email) return 'Unassigned';
  if (email === state.me) return 'You';
  return nameFor(state.people, email);
}

/** A person's own name, never "You": for text that others read too. */
export const realName = (email) => nameFor(state.people, email);

/**
 * Is this mine? Assigned to me; for the lead, also assigned to nobody (the
 * lead's own work, as in Phase 1). A designer's work is only what is theirs.
 */
export const isMine = (n) => n.assignee === state.me || (!n.assignee && state.role === 'lead');

export const isLead = () => state.role === 'lead';
