// hub-card.js — this app's card on the Hubinator page: what is ready for check.
//
// The hub page imports this file from the site and calls `card` as the person
// looking, with a Firestore LITE handle on this project (the recipe is in the
// Stella-Hubinator repo, "The overview card"). It returns data only; the hub
// draws it. It must import nothing that loads Firebase or the store.
//
// FOR DESIGN LEADS ONLY: nobody else checks. Anyone else gets null, no card.
//
// THE APP'S OWN RULES DECIDE what is waiting (team.checkQueue) and how it is
// named, so the card cannot drift from Home. Those read the tree, so the
// groups and jobs above each waiting task are fetched too, and nothing else:
// the usual load is a handful of documents.

import { COL } from './collections.js';
import { buildIndex, isJob, jobOf, pathText } from './tree.js';
import { checkQueue, nameFor, statusSince } from './team.js';
import { ageLabel } from './dates.js';

const APP = '/design-scheduling/';
const SHOWN = 3;        // what the hub draws
const MOST = 50;        // waiting tasks read: far more than are ever waiting
const DEEPEST = 10;     // levels of groups and jobs above a task

/** The card, from the waiting tasks with everything above them. Pure. */
export function cardFrom(nodes, people = {}, now = Date.now()) {
  const idx = buildIndex(nodes);
  const queue = checkQueue(idx);
  return {
    title: 'Ready for check',
    count: queue.length,
    href: `${APP}#/home`,
    empty: 'Nothing is waiting for your check.',
    items: queue.slice(0, SHOWN).map((t) => ({
      title: t.title,
      // Who, the job when it is a task inside one ("Laser" says little alone), and where.
      sub: [nameFor(people, whoOf(t)), isJob(idx, t) ? null : jobOf(idx, t.id)?.title, pathText(idx, t.id)].filter(Boolean).join(' · '),
      when: ageLabel(statusSince(t), now),
      href: `${APP}#/home?t=${encodeURIComponent(t.id)}`,
    })),
  };
}

const whoOf = (t) => t.submittedBy ?? t.assignee ?? null;

/** Read by the hub page. Throws on failure: the hub says "not available" and carries on. */
export async function card({ db, fs, role }) {
  if (role !== 'lead') return null;
  const read = (snap) => ({ ...snap.data(), id: snap.id });
  const waiting = (await fs.getDocs(fs.query(fs.collection(db, COL.tasks),
    fs.where('status', '==', 'check'), fs.where('archivedAt', '==', null), fs.limit(MOST)))).docs.map(read);

  // Up through the parents, a level at a time, each document once.
  const byId = new Map(waiting.map((n) => [n.id, n]));
  const asked = new Set(byId.keys());
  let level = waiting;
  for (let i = 0; i < DEEPEST && level.length; i += 1) {
    const ids = [...new Set(level.map((n) => n.parentId))].filter((id) => id && !asked.has(id));
    for (const id of ids) asked.add(id);
    const snaps = await Promise.all(ids.map((id) => fs.getDoc(fs.doc(db, COL.tasks, id))));
    level = snaps.filter((s) => s.exists()).map(read).filter((n) => !n.archivedAt);
    for (const n of level) byId.set(n.id, n);
  }

  // Names, only of the people on the lines that are drawn.
  const nodes = [...byId.values()];
  const who = [...new Set(checkQueue(buildIndex(nodes)).slice(0, SHOWN).map(whoOf).filter(Boolean))];
  const people = {};
  for (const s of await Promise.all(who.map((e) => fs.getDoc(fs.doc(db, COL.people, e))))) if (s.exists()) people[s.id] = s.data();
  return cardFrom(nodes, people);
}
