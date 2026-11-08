// store.js — persistence: the task tree, its updates, and the access list.
//
// TWO BACKENDS, ONE INTERFACE (the board's pattern).
//
// Firestore is the destination, but the app has to be buildable and usable
// before the Firebase project exists. So with no config the store keeps
// everything in localStorage, and the UI says plainly which mode it is in. An
// app that silently stops persisting is worse than one that says it is local.
//
// COLLECTION NAMES COME FROM `COL` AND NOWHERE ELSE. At hub time (PLAN, Phase
// 4) this app moves into a shared project; a prefix or a named database is
// then a one-line change here.
//
// THE CLIENT MODEL: one live query on `tasks where archivedAt == null`, and
// every view derived from it in memory (as TileDo held data["tasks"]). That is
// why every node is written with `archivedAt: null` explicitly — Firestore's
// `== null` matches a stored null, never a missing field. Updates live under
// each task (tasks/{id}/updates/{id}) and are read when its panel opens.
//
// THE ECHO OF YOUR OWN WRITES. Firestore applies a write to the local cache at
// once and the live query fires straight away with `hasPendingWrites`; the
// callback passes that on as `fromSelf`, so a view can tell "I just did this"
// from "someone else did" (the panel uses it to avoid clobbering a field
// being edited, and Phase 2 uses it for "Updated by Alex just now").
//
// THE LOG (Phase 2) is its own collection, `notes`, read in two live
// windows: the newest page (more on "Show older"), and every note still open
// or actioned (the triage queue is never paged away). Photos are `images`
// documents (photos.js says why); local mode keeps them in IndexedDB, since
// localStorage holds 5 MB in all.

import { getFirebase, failureReason, isConfigured, localForced } from './firebase.js';
import { LOCAL_ACCESS, LOCAL_PEOPLE } from './team.js';
import { idb } from './idb.js';

export const COL = {
  settings: 'settings',     // settings/access: who is what (the rules read it)
  people: 'people',         // people/{email}: display name, initials
  tasks: 'tasks',           // every node: group | product | task (and step, until converted)
  updates: 'updates',       // tasks/{id}/updates/{id}: the timeline
  images: 'images',         // photos as Bytes, one per document (photos.js)
  notes: 'notes',           // the Log
  time: 'time',             // time tracking: one stretch of work per document (timing.js)
};

/** settings/workday: the team's lunch and finish times (timing.js). */
const WORKDAY_DOC = 'workday';

const LS = 'stella.design.';
const lsGet = (k, fallback) => {
  try { const v = localStorage.getItem(LS + k); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
};
const lsSet = (k, v) => {
  try { localStorage.setItem(LS + k, JSON.stringify(v)); return true; }
  catch (e) { console.error('[store] local save failed', e); return false; }
};

/** Firestore's ceiling on writes in one batch, less some room. */
export const BATCH_SIZE = 450;

export const chunk = (list, size) => {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
};

/** A Firestore-style id: 20 letters and digits. */
export function newId() {
  const a = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from(crypto.getRandomValues(new Uint8Array(20)), (b) => a[b % a.length]).join('');
}

const strip = ({ id, ...rest }) => rest;

/** Local mode's photos (IndexedDB: localStorage is far too small). */
const localImages = idb('images');

const byNewest = (a, b) => String(b.at).localeCompare(String(a.at));

export const Store = {
  mode: 'local',          // 'firestore' | 'local'
  reason: '',             // why local, when local
  _db: null,
  _fs: null,
  _watchers: new Set(),
  _local: null,           // local mode: every node, archived ones included
  newId,

  async init() {
    const fb = await getFirebase();
    if (!fb) {
      this.mode = 'local';
      this.reason = localForced
        ? 'Local mode on this device: saved in this browser only, never the live data. Open with ?local=0 to go live.'
        : isConfigured()
          ? `Firebase unreachable (${failureReason()}). Saved on this device only.`
          : 'Local mode. Saved on this device only.';
      this._local = lsGet('tasks', []);
      // Another tab of the app on this machine: pick its writes up.
      window.addEventListener('storage', (e) => {
        if (e.key === `${LS}tasks`) { this._local = lsGet('tasks', []); this._notify(false); }
        if (e.key === `${LS}updates`) this._notifyUpdates();
        if (e.key === `${LS}notes`) this._notifyNotes();
        if (e.key === `${LS}time`) this._notifyTime();
        if (e.key === `${LS}workday`) for (const f of this._workdayWatchers ?? []) f();
      });
      return this.mode;
    }
    this._db = fb.db;
    this._fs = fb.fs;
    this.mode = 'firestore';
    this.reason = '';
    return this.mode;
  },

  // ---- the tree ------------------------------------------------------------

  /**
   * Every live node, now and on every change.
   * @param {(nodes: object[], meta: {fromSelf: boolean}) => void} cb
   * @param {(e: Error) => void} [onError]
   * @returns {() => void} stop watching
   */
  watchTasks(cb, onError) {
    if (this.mode === 'local') {
      const w = { cb };
      this._watchers.add(w);
      queueMicrotask(() => cb(this._live(), { fromSelf: false }));
      return () => this._watchers.delete(w);
    }
    const { collection, query, where, onSnapshot } = this._fs;
    return onSnapshot(
      query(collection(this._db, COL.tasks), where('archivedAt', '==', null)),
      (snap) => cb(snap.docs.map((d) => ({ ...d.data(), id: d.id })), { fromSelf: snap.metadata.hasPendingWrites }),
      (e) => onError?.(e),
    );
  },

  _live() { return (this._local ?? []).filter((n) => !n.archivedAt); },

  _notify(fromSelf) {
    const nodes = this._live();
    for (const w of this._watchers) w.cb(nodes, { fromSelf });
  },

  /** The archive: every archived node. Read on demand, not watched. */
  async loadArchived() {
    if (this.mode === 'local') return (this._local ?? []).filter((n) => n.archivedAt);
    const { collection, query, where, getDocs } = this._fs;
    const snap = await getDocs(query(collection(this._db, COL.tasks), where('archivedAt', '!=', null)));
    return snap.docs.map((d) => ({ ...d.data(), id: d.id }));
  },

  /**
   * One change, written together: whole nodes (`set`), field changes
   * (`patch`, each {id, ...fields}), deletions (`remove`, ids), and timeline
   * entries (`updates`, each {taskId, ...}); and for the Log, whole notes
   * (`noteSet`), note changes (`notes`, each {id, ...fields}), deleted notes
   * (`noteRemove`), photos (`images`, each a prepared photo from photos.js)
   * and deleted photos (`imageRemove`); and time entries, whole (`timeSet`),
   * changed (`timePatch`) or deleted (`timeRemove`). Local mode applies it at
   * once; Firestore applies it to its cache at once and to the server in
   * batches of BATCH_SIZE (one atomic batch for any ordinary change), so a
   * note and its photos - or a job's change and the timer it stops - arrive
   * together or not at all.
   */
  async commit({ set = [], patch = [], remove = [], updates = [], noteSet = [], notes = [], noteRemove = [], images = [], imageRemove = [], timeSet = [], timePatch = [], timeRemove = [] } = {}) {
    const log = noteSet.length || notes.length || noteRemove.length || images.length || imageRemove.length;
    const time = timeSet.length || timePatch.length || timeRemove.length;
    if (!set.length && !patch.length && !remove.length && !updates.length && !log && !time) return;
    if (this.mode === 'local') {
      if (log) await this._commitLocalLog({ noteSet, notes, noteRemove, images, imageRemove });
      if (time) this._commitLocalTime({ timeSet, timePatch, timeRemove });
      if (!set.length && !patch.length && !remove.length && !updates.length) return;
      const byId = new Map((this._local ?? []).map((n) => [n.id, n]));
      for (const n of set) byId.set(n.id, { ...n });
      for (const p of patch) { const cur = byId.get(p.id); if (cur) byId.set(p.id, { ...cur, ...p }); }
      for (const id of remove) byId.delete(id);
      const next = [...byId.values()];
      if (!lsSet('tasks', next)) throw new Error('This browser would not save it: its local storage is full or switched off.');
      this._local = next;
      if (updates.length || remove.length) {
        const all = lsGet('updates', {});
        for (const u of updates) {
          const list = all[u.taskId] ?? (all[u.taskId] = []);
          list.push({ ...u, id: newId() });
        }
        // A deleted task takes its timeline with it, and the photos on it.
        const gone = remove.flatMap((id) => (all[id] ?? []).flatMap((u) => (u.photos ?? []).map((ph) => ph.id)));
        for (const id of remove) delete all[id];
        lsSet('updates', all);
        if (gone.length) await Promise.all(gone.map((id) => localImages.del(id).catch(() => {})));
      }
      this._notify(true);
      if (updates.length) this._notifyUpdates();
      return;
    }
    const { doc, collection, writeBatch, Bytes } = this._fs;
    // A photo's bytes are read before the batch is made (a local read, quick).
    const imageDocs = await Promise.all(images.map(async (p) => ({
      id: p.id,
      data: { data: Bytes.fromUint8Array(new Uint8Array(await p.blob.arrayBuffer())), type: p.type, w: p.w, h: p.h, size: p.size, by: p.by, at: p.at },
    })));
    const ops = [
      ...imageDocs.map((d) => (b) => b.set(doc(this._db, COL.images, d.id), d.data)),
      ...set.map((n) => (b) => b.set(doc(this._db, COL.tasks, n.id), strip(n))),
      ...patch.map((p) => (b) => b.update(doc(this._db, COL.tasks, p.id), strip(p))),
      ...remove.map((id) => (b) => b.delete(doc(this._db, COL.tasks, id))),
      ...updates.map((u) => (b) => b.set(doc(collection(this._db, COL.tasks, u.taskId, COL.updates)), u)),
      ...noteSet.map((n) => (b) => b.set(doc(this._db, COL.notes, n.id), strip(n))),
      ...notes.map((p) => (b) => b.update(doc(this._db, COL.notes, p.id), strip(p))),
      ...noteRemove.map((id) => (b) => b.delete(doc(this._db, COL.notes, id))),
      ...imageRemove.map((id) => (b) => b.delete(doc(this._db, COL.images, id))),
      ...timeSet.map((n) => (b) => b.set(doc(this._db, COL.time, n.id), strip(n))),
      ...timePatch.map((p) => (b) => b.update(doc(this._db, COL.time, p.id), strip(p))),
      ...timeRemove.map((id) => (b) => b.delete(doc(this._db, COL.time, id))),
    ];
    // Every batch is handed to Firestore at once and only then awaited.
    // Awaiting each in turn waited for the SERVER between batches, so an
    // import of more than one batch stalled while offline; handed over
    // together, they all land in the local cache now and sync when they can.
    const commits = chunk(ops, BATCH_SIZE).map((part) => {
      const b = writeBatch(this._db);
      for (const op of part) op(b);
      return b.commit();
    });
    // A deleted task takes its timeline with it (subcollections outlive their
    // parent document otherwise).
    if (remove.length) commits.push(this._deleteTimelines(remove));
    await Promise.all(commits);
  },

  /** Delete every update under these tasks, and the photos they carried, in batches. */
  async _deleteTimelines(taskIds) {
    const { collection, getDocs, writeBatch, doc } = this._fs;
    const refs = [];
    for (const id of taskIds) {
      const snap = await getDocs(collection(this._db, COL.tasks, id, COL.updates));
      snap.forEach((d) => {
        refs.push(d.ref);
        for (const ph of d.data().photos ?? []) if (ph?.id) refs.push(doc(this._db, COL.images, ph.id));
      });
    }
    await Promise.all(chunk(refs, BATCH_SIZE).map((part) => {
      const b = writeBatch(this._db);
      for (const r of part) b.delete(r);
      return b.commit();
    }));
  },

  // ---- updates (the timeline) ---------------------------------------------

  _updWatchers: new Set(),
  _notifyUpdates() { for (const w of this._updWatchers) w(); },

  /**
   * A task's timeline, newest first, live.
   * @returns {() => void} stop watching
   */
  watchUpdates(taskId, limitTo, cb) {
    if (this.mode === 'local') {
      const send = () => {
        const list = [...(lsGet('updates', {})[taskId] ?? [])].sort((a, b) => String(b.at).localeCompare(String(a.at)));
        cb(list.slice(0, limitTo), list.length > limitTo);
      };
      this._updWatchers.add(send);
      queueMicrotask(send);
      return () => this._updWatchers.delete(send);
    }
    const { collection, query, orderBy, limit, onSnapshot } = this._fs;
    return onSnapshot(
      query(collection(this._db, COL.tasks, taskId, COL.updates), orderBy('at', 'desc'), limit(limitTo + 1)),
      (snap) => {
        const list = snap.docs.map((d) => ({ ...d.data(), id: d.id }));
        cb(list.slice(0, limitTo), list.length > limitTo);
      },
      (e) => console.warn('[updates]', e.message),
    );
  },

  // ---- the Log --------------------------------------------------------------

  _noteWatchers: new Set(),
  _notifyNotes() { for (const w of this._noteWatchers) w(); },

  /** Local mode: every note in this browser. */
  _localNotes() { return lsGet('notes', []); },

  async _commitLocalLog({ noteSet, notes, noteRemove, images, imageRemove }) {
    // Photos first: a note must never point at a photo that was not kept.
    for (const p of images) {
      await localImages.put(p.id, { blob: p.blob, type: p.type, w: p.w, h: p.h, size: p.size, by: p.by, at: p.at });
    }
    const byId = new Map(this._localNotes().map((n) => [n.id, n]));
    for (const n of noteSet) byId.set(n.id, { ...n });
    for (const p of notes) { const cur = byId.get(p.id); if (cur) byId.set(p.id, { ...cur, ...p }); }
    for (const id of noteRemove) byId.delete(id);
    if (noteSet.length || notes.length || noteRemove.length) {
      if (!lsSet('notes', [...byId.values()])) throw new Error('This browser would not save it: its local storage is full or switched off.');
    }
    for (const id of imageRemove) await localImages.del(id).catch(() => {});
    this._notifyNotes();
  },

  /**
   * A live query on notes, the same shape in both modes: `cb(list, {more})`,
   * each note with `pending` true while it waits to reach the server (the
   * offline queue: Firestore keeps the write and sends it when it can).
   */
  _watchNoteQuery(build, localFilter, limitTo, cb) {
    if (this.mode === 'local') {
      const send = () => {
        const list = this._localNotes().filter(localFilter).sort(byNewest);
        cb(limitTo ? list.slice(0, limitTo) : list, { more: Boolean(limitTo) && list.length > limitTo });
      };
      this._noteWatchers.add(send);
      queueMicrotask(send);
      return () => this._noteWatchers.delete(send);
    }
    const { onSnapshot } = this._fs;
    return onSnapshot(build(), { includeMetadataChanges: true }, (snap) => {
      const list = snap.docs.map((d) => ({ ...d.data(), id: d.id, pending: d.metadata.hasPendingWrites })).sort(byNewest);
      cb(limitTo ? list.slice(0, limitTo) : list, { more: Boolean(limitTo) && list.length > limitTo });
    }, (e) => { console.warn('[notes]', e.message); cb(null, { error: e }); });
  },

  /** The newest `limitTo` notes, live. */
  watchNotes(limitTo, cb) {
    return this._watchNoteQuery(() => {
      const { collection, query, orderBy, limit } = this._fs;
      return query(collection(this._db, COL.notes), orderBy('at', 'desc'), limit(limitTo + 1));
    }, () => true, limitTo, cb);
  },

  /** Every note still to be dealt with (open) or in hand (actioned), live: never paged. */
  watchTriage(cb) {
    return this._watchNoteQuery(() => {
      const { collection, query, where } = this._fs;
      return query(collection(this._db, COL.notes), where('state', 'in', ['open', 'actioned']));
    }, (n) => n.state === 'open' || n.state === 'actioned', 0, cb);
  },

  /** The notes linked to one job, live: the job's side of the link. */
  watchJobNotes(jobId, cb) {
    return this._watchNoteQuery(() => {
      const { collection, query, where } = this._fs;
      return query(collection(this._db, COL.notes), where('jobIds', 'array-contains', jobId));
    }, (n) => (n.jobIds ?? []).includes(jobId), 0, cb);
  },

  /** One note, live (a link to a note older than the loaded page). */
  watchNote(id, cb) {
    if (this.mode === 'local') {
      const send = () => cb(this._localNotes().find((n) => n.id === id) ?? null);
      this._noteWatchers.add(send);
      queueMicrotask(send);
      return () => this._noteWatchers.delete(send);
    }
    const { doc, onSnapshot } = this._fs;
    return onSnapshot(doc(this._db, COL.notes, id), { includeMetadataChanges: true },
      (d) => cb(d.exists() ? { ...d.data(), id: d.id, pending: d.metadata.hasPendingWrites } : null),
      (e) => { console.warn('[note]', e.message); cb(null); });
  },

  /**
   * The categories alone, for someone who reads no tasks (a contributor):
   * groups and products, live. The rules let them read those and nothing
   * else in `tasks`; the query has to ask for exactly that or it is refused.
   */
  watchGroups(cb, onError) {
    if (this.mode === 'local') {
      const w = { cb: (nodes, meta) => cb(nodes.filter((n) => n.kind === 'group' || n.kind === 'product'), meta) };
      this._watchers.add(w);
      queueMicrotask(() => w.cb(this._live(), { fromSelf: false }));
      return () => this._watchers.delete(w);
    }
    const { collection, query, where, onSnapshot } = this._fs;
    return onSnapshot(
      query(collection(this._db, COL.tasks), where('kind', 'in', ['group', 'product']), where('archivedAt', '==', null)),
      (snap) => cb(snap.docs.map((d) => ({ ...d.data(), id: d.id })), { fromSelf: snap.metadata.hasPendingWrites }),
      (e) => onError?.(e),
    );
  },

  /**
   * A manager's tree: the categories, and the jobs (with, for a job shared
   * with its stage, its stage tasks) that the lead has shared - two live queries,
   * one list. A shared node is one with `sharedEffective == true`, which is
   * what the rules test, so the query must ask for it.
   */
  watchShared(cb, onError) {
    if (this.mode === 'local') {
      const keep = (n) => n.kind === 'group' || n.kind === 'product' || n.sharedEffective === true;
      const w = { cb: (nodes, meta) => cb(nodes.filter(keep), meta) };
      this._watchers.add(w);
      queueMicrotask(() => w.cb(this._live(), { fromSelf: false }));
      return () => this._watchers.delete(w);
    }
    const parts = { groups: null, shared: null };
    const send = (meta) => { if (parts.groups && parts.shared) cb([...parts.groups, ...parts.shared], meta); };
    const stopGroups = this.watchGroups((nodes, meta) => { parts.groups = nodes; send(meta); }, onError);
    const { collection, query, where, onSnapshot } = this._fs;
    const stopShared = onSnapshot(
      query(collection(this._db, COL.tasks), where('sharedEffective', '==', true), where('archivedAt', '==', null)),
      (snap) => { parts.shared = snap.docs.map((d) => ({ ...d.data(), id: d.id })); send({ fromSelf: snap.metadata.hasPendingWrites }); },
      (e) => onError?.(e),
    );
    return () => { stopGroups(); stopShared(); };
  },

  // ---- time tracking ------------------------------------------------------

  _timeWatchers: new Set(),
  _notifyTime() { for (const w of this._timeWatchers) w(); },
  _localTime() { return lsGet('time', []); },

  _commitLocalTime({ timeSet, timePatch, timeRemove }) {
    const byId = new Map(this._localTime().map((e) => [e.id, e]));
    for (const e of timeSet) byId.set(e.id, { ...e });
    for (const p of timePatch) { const cur = byId.get(p.id); if (cur) byId.set(p.id, { ...cur, ...p }); }
    for (const id of timeRemove) byId.delete(id);
    if (!lsSet('time', [...byId.values()])) throw new Error('This browser would not save it: its local storage is full or switched off.');
    this._notifyTime();
  },

  /**
   * Time entries matching equality filters - {by, end: null, day, jobId} -
   * live. Equality alone, so Firestore needs no composite index for any of
   * them. `cb(list, {error?})`.
   * @returns {() => void} stop watching
   */
  watchTime(match, cb) {
    const keys = Object.keys(match);
    if (this.mode === 'local') {
      const send = () => cb(this._localTime().filter((e) => keys.every((k) => (e[k] ?? null) === match[k])), {});
      this._timeWatchers.add(send);
      queueMicrotask(send);
      return () => this._timeWatchers.delete(send);
    }
    const { collection, query, where, onSnapshot } = this._fs;
    return onSnapshot(
      query(collection(this._db, COL.time), ...keys.map((k) => where(k, '==', match[k]))),
      (snap) => cb(snap.docs.map((d) => ({ ...d.data(), id: d.id })), {}),
      (e) => { console.warn('[time]', e.message); cb(null, { error: e }); },
    );
  },

  /** The same, read once. */
  async getTime(match) {
    const keys = Object.keys(match);
    if (this.mode === 'local') return this._localTime().filter((e) => keys.every((k) => (e[k] ?? null) === match[k]));
    const { collection, query, where, getDocs } = this._fs;
    const snap = await getDocs(query(collection(this._db, COL.time), ...keys.map((k) => where(k, '==', match[k]))));
    return snap.docs.map((d) => ({ ...d.data(), id: d.id }));
  },

  /** settings/workday, live: {lunchStart, lunchEnd, finish} as 'HH:MM', or null when never set. */
  watchWorkday(cb) {
    if (this.mode === 'local') {
      const send = () => cb(lsGet('workday', null));
      this._workdayWatchers = (this._workdayWatchers ?? new Set()).add(send);
      queueMicrotask(send);
      return () => this._workdayWatchers.delete(send);
    }
    const { doc, onSnapshot } = this._fs;
    return onSnapshot(doc(this._db, COL.settings, WORKDAY_DOC),
      (d) => cb(d.exists() ? d.data() : null),
      (e) => { console.warn('[workday]', e.message); cb(null); });
  },

  /** The lead sets the team's day. */
  async saveWorkday({ lunchStart, lunchEnd, finish }) {
    const w = { lunchStart, lunchEnd, finish };
    if (this.mode === 'local') {
      lsSet('workday', w);
      for (const f of this._workdayWatchers ?? []) f();
      return;
    }
    const { doc, setDoc } = this._fs;
    await setDoc(doc(this._db, COL.settings, WORKDAY_DOC), w);
  },

  /** A photo's full image, as a Blob; null when it is not there. */
  async getImage(id) {
    if (this.mode === 'local') {
      const v = await localImages.get(id).catch(() => null);
      return v?.blob ?? null;
    }
    const { doc, getDoc } = this._fs;
    const d = await getDoc(doc(this._db, COL.images, id));
    if (!d.exists()) return null;
    const { data, type } = d.data();
    return new Blob([data.toUint8Array()], { type: type || 'image/jpeg' });
  },

  /**
   * Roughly how much the photos take up (Settings): their count and bytes,
   * worked out by the server without reading them (aggregate queries).
   * @returns {Promise<{photos: number, bytes: number, notes: number}>}
   */
  async storageEstimate() {
    if (this.mode === 'local') {
      const all = await localImages.all().catch(() => []);
      return { photos: all.length, bytes: all.reduce((s, v) => s + (v?.size ?? v?.blob?.size ?? 0), 0), notes: this._localNotes().length };
    }
    const { collection, getAggregateFromServer, count, sum } = this._fs;
    const [img, notes] = await Promise.all([
      getAggregateFromServer(collection(this._db, COL.images), { n: count(), bytes: sum('size') }),
      getAggregateFromServer(collection(this._db, COL.notes), { n: count() }),
    ]);
    return { photos: img.data().n, bytes: img.data().bytes ?? 0, notes: notes.data().n };
  },

  // ---- access --------------------------------------------------------------

  /** settings/access. Unreadable fails closed: empty lists promote nobody. */
  async loadAccess() {
    // Local mode's invented team (team.js), so "View as" has people to be.
    if (this.mode === 'local') return structuredClone(LOCAL_ACCESS);
    try {
      const { doc, getDoc } = this._fs;
      const snap = await getDoc(doc(this._db, COL.settings, 'access'));
      // Missing means a brand-new project: the first person in may claim it.
      this.accessMissing = !snap.exists();
      return snap.exists() ? snap.data() : {};
    } catch (e) {
      // Unreadable is not missing: an unlisted account cannot read an
      // existing document, and must not be offered the claim.
      this.accessMissing = false;
      console.error('[access]', e.message);
      return {};
    }
  },

  async saveAccess(a) {
    if (this.mode === 'local') throw new Error('Local mode has no accounts.');
    const { doc, setDoc } = this._fs;
    await setDoc(doc(this._db, COL.settings, 'access'), {
      leads: a.leads ?? [], designers: a.designers ?? [], contributors: a.contributors ?? [],
      managers: a.managers ?? [], masters: a.masters ?? [],
    });
  },

  // ---- people: display names ----------------------------------------------

  /**
   * people/{email}: {name}, live. Local mode has its invented team, with any
   * names changed in this browser on top.
   * @returns {() => void} stop watching
   */
  watchPeople(cb) {
    if (this.mode === 'local') {
      const send = () => cb({ ...structuredClone(LOCAL_PEOPLE), ...lsGet('people', {}) });
      this._peopleWatchers = (this._peopleWatchers ?? new Set()).add(send);
      queueMicrotask(send);
      return () => this._peopleWatchers.delete(send);
    }
    const { collection, onSnapshot } = this._fs;
    return onSnapshot(collection(this._db, COL.people),
      (snap) => cb(Object.fromEntries(snap.docs.map((d) => [d.id, d.data()]))),
      (e) => console.warn('[people]', e.message));
  },

  /** A person's display name. Their own, or (the lead, a master) anyone's. */
  async savePerson(email, { name }) {
    const doc = { name: String(name ?? '').trim().slice(0, 60) };
    if (this.mode === 'local') {
      const all = lsGet('people', {});
      all[email] = doc;
      lsSet('people', all);
      for (const w of this._peopleWatchers ?? []) w();
      return;
    }
    const { doc: ref, setDoc } = this._fs;
    await setDoc(ref(this._db, COL.people, email), doc, { merge: true });
  },

  // ---- local mode housekeeping --------------------------------------------

  /** Everything this device holds, as one JSON object (Settings → Back up). Photos stay behind: thumbnails only. */
  exportLocal() {
    return { exportedAt: new Date().toISOString(), tasks: lsGet('tasks', []), updates: lsGet('updates', {}), notes: lsGet('notes', []), time: lsGet('time', []) };
  },

  /** Replace this device's local data. */
  replaceLocal({ tasks = [], updates = {}, notes = [], time = [] }) {
    if (this.mode !== 'local') throw new Error('Only in local mode.');
    lsSet('tasks', tasks);
    lsSet('updates', updates);
    lsSet('notes', notes);
    lsSet('time', time);
    this._local = tasks;
    this._notify(true);
    this._notifyUpdates();
    this._notifyNotes();
    this._notifyTime();
  },
};
