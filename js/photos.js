// photos.js — THE ADAPTER BOUNDARY for photos (PLAN, "Photo storage
// (decided)"). Views call this and nothing else, so the backend can move to
// OneDrive later without touching them.
//
//   prepare(file) -> a resized JPEG, its size, and a small thumbnail
//   refOf(p)      -> what a note or update stores: {id, w, h, thumb}
//   thumb(ref)    -> the thumbnail, to draw at once (it rides on the note)
//   url(ref)      -> the full photo, fetched once and kept for the session
//
// WHY THIS SHAPE. There is no Firebase Storage (no Blaze plan), so a photo is
// a Firestore document of its own (`images/{id}`, the JPEG as Bytes, not
// base64: a third smaller) under the 1 MiB document limit. Resizing in the
// browser to ~1280px on the long edge brings a phone photo to 150-250 KB. A
// ~20 KB thumbnail sits on the note itself, so the feed costs one read per
// note and the full photo is read only when someone opens it.
//
// HEIC (iPhone photos). Safari hands a file input a JPEG unless told
// otherwise, and newer Safari opens HEIC itself; a HEIC that reaches Chrome
// or Edge on Windows (copied off a phone) cannot be decoded natively, so a
// converter (heic2any, from the CDN) is fetched then, and only then. The
// file is sniffed by its header, as upload/warranty_upload.py does, because
// the name and type are often missing or wrong.

import { idb } from './idb.js';

export const MAX_EDGE = 1280;
export const TARGET_BYTES = 250 * 1024;
export const HARD_MAX_BYTES = 900 * 1024;      // under Firestore's 1 MiB, with room for the fields
export const THUMB_EDGE = 400;
export const THUMB_TARGET = 20 * 1024;
const HEIC2ANY = 'https://cdn.jsdelivr.net/npm/heic2any@0.0.4/dist/heic2any.min.js';

/** The HEIF brands at bytes 8-12, after `ftyp` at 4-8 (warranty_upload.py HEIF_BRANDS). */
const HEIF_BRANDS = ['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'mif1', 'msf1'];

/** Is this a HEIC/HEIF file, by its first 12 bytes? */
export function isHeic(head) {
  if (!head || head.length < 12) return false;
  const s = (a, b) => String.fromCharCode(...head.slice(a, b));
  return s(4, 8) === 'ftyp' && HEIF_BRANDS.includes(s(8, 12));
}

/** The size to draw at: within `max` on the long edge, never enlarged. */
export function fitWithin(w, h, max) {
  if (!(w > 0 && h > 0)) return { w: 0, h: 0 };
  const k = Math.min(1, max / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
}

/** How many bytes a base64 data URL holds. */
export function dataUrlBytes(url) {
  const b64 = String(url ?? '').split(',')[1] ?? '';
  return Math.floor((b64.length * 3) / 4) - (b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0);
}

/** Is this file something to try as a photo? Images, and HEIC that arrives untyped. */
export const looksLikePhoto = (f) => /^image\//.test(f?.type ?? '') || /\.(jpe?g|png|webp|gif|heic|heif|avif|bmp)$/i.test(f?.name ?? '');

// ---------------------------------------------------------------------------
// decoding and encoding
// ---------------------------------------------------------------------------

let heicLoading = null;
function loadHeic2any() {
  if (window.heic2any) return Promise.resolve(window.heic2any);
  if (heicLoading) return heicLoading;
  heicLoading = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = HEIC2ANY;
    s.onload = () => (window.heic2any ? resolve(window.heic2any) : reject(new Error('The HEIC converter did not load.')));
    s.onerror = () => reject(new Error('The HEIC converter could not be fetched (offline?).'));
    document.head.append(s);
  });
  heicLoading.catch(() => { heicLoading = null; });
  return heicLoading;
}

/** Through an <img>: older Safari has no createImageBitmap for blobs. EXIF orientation applies. */
function viaImg(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => { resolve(img); setTimeout(() => URL.revokeObjectURL(url), 0); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('not decodable')); };
    img.src = url;
  });
}

const dims = (src) => ({ w: src.naturalWidth ?? src.width, h: src.naturalHeight ?? src.height });

async function decode(file) {
  try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch { /* try the next way */ }
  try { return await viaImg(file); } catch { /* perhaps HEIC */ }
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  if (isHeic(head) || /\.hei[cf]$/i.test(file.name ?? '') || /hei[cf]/i.test(file.type ?? '')) {
    let jpeg;
    try {
      const conv = await loadHeic2any();
      const out = await conv({ blob: file, toType: 'image/jpeg', quality: 0.9 });
      jpeg = Array.isArray(out) ? out[0] : out;
    } catch (e) {
      throw new Error(`${file.name || 'This photo'} is HEIC, which this browser cannot open (${e.message}). Send it from the iPhone as JPEG (Settings › Camera › Formats › Most Compatible), or add it from the phone itself.`);
    }
    try { return await createImageBitmap(jpeg); } catch { return viaImg(jpeg); }
  }
  throw new Error(`${file.name || 'That file'} is not a photo this browser can open.`);
}

function canvasOf(src, w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';
  // A transparent PNG would turn black as JPEG: white behind it.
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, w, h);
  g.drawImage(src, 0, 0, w, h);
  return c;
}

const toBlob = (c, q) => new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('This browser would not encode the photo.'))), 'image/jpeg', q));

/** JPEG at the highest quality on the ladder that fits `target`; the lowest if none does. */
async function encode(c, target) {
  let last = null;
  for (const q of [0.82, 0.74, 0.66, 0.58, 0.5, 0.42]) {
    last = await toBlob(c, q);
    if (last.size <= target) return last;
  }
  return last;
}

const blobToDataUrl = (b) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result));
  r.onerror = () => reject(r.error);
  r.readAsDataURL(b);
});

/**
 * A file, ready to store: resized and re-encoded (which also drops its EXIF,
 * GPS included), with a thumbnail.
 * @returns {Promise<{id: string, blob: Blob, type: string, w: number, h: number, size: number, thumb: string}>}
 */
export async function prepare(file, { id = newPhotoId() } = {}) {
  const src = await decode(file);
  const { w: sw, h: sh } = dims(src);
  let edge = MAX_EDGE;
  let blob = null;
  let size = fitWithin(sw, sh, edge);
  // Too big even at the lowest quality (a detailed panorama): smaller, again.
  for (let i = 0; i < 4; i++) {
    size = fitWithin(sw, sh, edge);
    blob = await encode(canvasOf(src, size.w, size.h), TARGET_BYTES);
    if (blob.size <= HARD_MAX_BYTES) break;
    edge = Math.round(edge * 0.75);
  }
  if (blob.size > HARD_MAX_BYTES) throw new Error(`${file.name || 'That photo'} would not come down below 900 KB.`);
  const t = fitWithin(sw, sh, THUMB_EDGE);
  const thumb = await blobToDataUrl(await encode(canvasOf(src, t.w, t.h), THUMB_TARGET));
  src.close?.();
  return { id, blob, type: 'image/jpeg', w: size.w, h: size.h, size: blob.size, thumb };
}

/** What a note or update keeps: the id of the full photo, its size, and the thumbnail. */
export const refOf = (p) => ({ id: p.id, w: p.w, h: p.h, thumb: p.thumb });

/** A photo id, the same shape as a Firestore document id. */
export function newPhotoId() {
  const a = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from(crypto.getRandomValues(new Uint8Array(20)), (b) => a[b % a.length]).join('');
}

// ---------------------------------------------------------------------------
// showing
// ---------------------------------------------------------------------------

/** The thumbnail, drawn at once: it is on the note. */
export const thumb = (ref) => ref?.thumb ?? '';

const full = new Map();     // id -> Promise<object URL>

/**
 * The full photo as an object URL, read once per session. The store is
 * imported here, not at the top, so the tests (pure functions only) never
 * load it.
 */
export function url(ref) {
  if (!ref?.id) return Promise.reject(new Error('No photo.'));
  if (!full.has(ref.id)) {
    const p = import('./store.js').then(({ Store }) => Store.getImage(ref.id)).then((blob) => {
      if (!blob) throw Object.assign(new Error('That photo is not there any more.'), { code: 'missing' });
      return URL.createObjectURL(blob);
    });
    p.catch(() => full.delete(ref.id));
    full.set(ref.id, p);
  }
  return full.get(ref.id);
}

// ---------------------------------------------------------------------------
// drafts: a note's photos before it is posted, kept on this device
// ---------------------------------------------------------------------------

const drafts = idb('drafts');

/** Keep a prepared photo with the draft. */
export const draftSave = (p) => drafts.put(p.id, { blob: p.blob, type: p.type, w: p.w, h: p.h, size: p.size, thumb: p.thumb });

/** A draft photo, prepared, or null when this device no longer has it. */
export async function draftLoad(id) {
  const v = await drafts.get(id).catch(() => null);
  return v ? { id, ...v } : null;
}

export const draftDrop = (ids) => Promise.all((ids ?? []).map((id) => drafts.del(id).catch(() => {})));
