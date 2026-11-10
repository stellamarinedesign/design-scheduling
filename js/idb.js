// idb.js — the smallest IndexedDB wrapper the app needs: key → value, per
// store. Photos are too big for localStorage (5 MB for everything), so local
// mode keeps its photos here, and the Log keeps a half-written note's photos
// here on every device until it is posted.
//
// Each database is opened once. A browser that refuses IndexedDB (some
// private windows) rejects every call; callers say so rather than lose a
// photo silently.
//
// A NEW STORE GETS A NEW DATABASE, never a version bump of an old one: an
// upgrade waits until every other tab holding the old version lets go, and
// tabs running an older build never do, so a photo draft saved in a fresh tab
// would hang. `stella.design.files` holds local mode's Word template for the
// time export (quote.js).

const DBS = { 'stella.design': ['images', 'drafts'], 'stella.design.files': ['files'] };
const opening = new Map();

function open(db) {
  if (opening.has(db)) return opening.get(db);
  const p = new Promise((resolve, reject) => {
    let req;
    try { req = indexedDB.open(db, 1); } catch (e) { reject(e); return; }
    req.onupgradeneeded = () => {
      for (const s of DBS[db]) if (!req.result.objectStoreNames.contains(s)) req.result.createObjectStore(s);
    };
    req.onsuccess = () => {
      // A later build that upgrades this database is not held up by this tab.
      req.result.onversionchange = () => { req.result.close(); opening.delete(db); };
      resolve(req.result);
    };
    req.onerror = () => reject(req.error ?? new Error('This browser would not open its photo store.'));
  });
  p.catch(() => opening.delete(db));
  opening.set(db, p);
  return p;
}

const done = (req) => new Promise((resolve, reject) => {
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

/** A store: get, put, del, keys. */
export function idb(name) {
  const db = Object.keys(DBS).find((k) => DBS[k].includes(name));
  const tx = async (mode) => (await open(db)).transaction(name, mode).objectStore(name);
  return {
    async get(key) { return done((await tx('readonly')).get(key)); },
    async put(key, value) { return done((await tx('readwrite')).put(value, key)); },
    async del(key) { return done((await tx('readwrite')).delete(key)); },
    async keys() { return done((await tx('readonly')).getAllKeys()); },
    async all() { return done((await tx('readonly')).getAll()); },
  };
}
