// idb.js — the smallest IndexedDB wrapper the app needs: key → value, per
// store. Photos are too big for localStorage (5 MB for everything), so local
// mode keeps its photos here, and the Log keeps a half-written note's photos
// here on every device until it is posted.
//
// One database, `stella.design`, opened once. A browser that refuses
// IndexedDB (some private windows) rejects every call; callers say so rather
// than lose a photo silently.

const DB = 'stella.design';
const STORES = ['images', 'drafts'];
let opening = null;

function open() {
  if (opening) return opening;
  opening = new Promise((resolve, reject) => {
    let req;
    try { req = indexedDB.open(DB, 1); } catch (e) { reject(e); return; }
    req.onupgradeneeded = () => {
      for (const s of STORES) if (!req.result.objectStoreNames.contains(s)) req.result.createObjectStore(s);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('This browser would not open its photo store.'));
  });
  opening.catch(() => { opening = null; });
  return opening;
}

const done = (req) => new Promise((resolve, reject) => {
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

/** A store: get, put, del, keys. */
export function idb(name) {
  const tx = async (mode) => (await open()).transaction(name, mode).objectStore(name);
  return {
    async get(key) { return done((await tx('readonly')).get(key)); },
    async put(key, value) { return done((await tx('readwrite')).put(value, key)); },
    async del(key) { return done((await tx('readwrite')).delete(key)); },
    async keys() { return done((await tx('readonly')).getAllKeys()); },
    async all() { return done((await tx('readonly')).getAll()); },
  };
}
