// views/photo-ui.js — photos on screen: a row of thumbnails, the tray that
// collects photos before something is posted, and the lightbox. Everything
// goes through photos.js; nothing here knows where a photo is kept.
//
// ADDING: on a phone, two buttons - Camera (straight to the camera: the
// input's `capture`) and Photos (the library, several at once). On a PC, Add
// photos, plus dropping files on the box and pasting a screenshot. Each photo
// is resized as it is added (a phone photo of 4-8 MB comes down to ~200 KB),
// so posting is quick and the tray shows the real result.
//
// THE LIGHTBOX opens on the thumbnail at once and swaps in the full photo
// when it arrives. ← → and a swipe move between photos; Esc closes. It fades
// in over 150ms: the only motion, and it says "a layer opened".

import { el, icon, iconBtn, btn, toast } from '../ui.js';
import * as PH from '../photos.js';

/** iOS converts HEIC to JPEG only when the input asks for images and nothing else. */
const iOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const ACCEPT = () => (iOS() ? 'image/*' : 'image/*,.heic,.heif');
const touch = () => window.matchMedia('(pointer: coarse)').matches;

/**
 * Thumbnails in a row; each opens the lightbox on itself.
 * @param {object[]} refs  {id, w, h, thumb}
 */
export function thumbRow(refs, { caption = '', cls = '' } = {}) {
  if (!refs?.length) return null;
  return el('div', { class: `thumbs ${cls}`.trim() }, refs.map((r, i) => el('button', {
    class: 'thumb', type: 'button', 'aria-label': `Photo ${i + 1} of ${refs.length}: open it larger`,
    onclick: (e) => { e.stopPropagation(); openLightbox(refs, i, { caption }); },
  }, el('img', { src: PH.thumb(r), alt: '', loading: 'lazy', decoding: 'async', width: r.w, height: r.h }))));
}

/**
 * The tray: photos gathered before a note or an update is posted.
 * @param {{existing?: object[], max?: number, onChange?: () => void, keepDraft?: boolean}} o
 *   existing   refs already on the thing being edited (kept unless taken off)
 *   keepDraft  keep each prepared photo on this device until it is posted
 * @returns {{el: Element, controls: Element, add: (files: FileList|File[]) => Promise<void>,
 *            ready: () => object[], kept: () => object[], busy: () => boolean, count: () => number,
 *            restore: (ids: string[]) => Promise<void>, ids: () => string[], clear: () => void}}
 */
export function photoTray({ existing = [], max = 12, onChange = () => {}, keepDraft = false } = {}) {
  const items = existing.map((ref) => ({ key: ref.id, ref, state: 'kept' }));
  const host = el('div', { class: 'tray', 'aria-live': 'polite' });

  const draw = () => {
    host.textContent = '';
    host.hidden = !items.length;
    items.forEach((it) => {
      const src = it.ref?.thumb ?? it.prepared?.thumb ?? '';
      const remove = iconBtn('close', 'Take this photo off', () => {
        items.splice(items.indexOf(it), 1);
        if (it.prepared && keepDraft) PH.draftDrop([it.prepared.id]);
        draw();
        onChange();
      }, 'tray-x');
      host.append(el('div', { class: `tray-item${it.state === 'preparing' ? ' busy' : ''}` },
        src ? el('img', { src, alt: '' }) : el('span', { class: 'tray-wait' }, 'Preparing…'),
        it.state === 'preparing' ? null : remove));
    });
    // Full: the add buttons say so by standing down (and the reason is their title).
    for (const b of controls?.querySelectorAll('button') ?? []) { b.disabled = items.length >= max; b.title = items.length >= max ? `${max} photos at most` : ''; }
  };

  const add = async (files) => {
    const list = [...(files ?? [])].filter(PH.looksLikePhoto);
    if (!list.length) { if (files?.length) toast('Only photos can be added here.', { warn: true }); return; }
    const room = max - items.length;
    if (room <= 0) { toast(`${max} photos at most.`, { warn: true }); return; }
    if (list.length > room) toast(`Only the first ${room} added: ${max} photos at most.`, { warn: true });
    const batch = list.slice(0, room).map((f) => ({ key: PH.newPhotoId(), file: f, state: 'preparing' }));
    items.push(...batch);
    draw();
    onChange();
    // One at a time: decoding several 12-megapixel photos at once can run a phone out of memory.
    for (const it of batch) {
      try {
        it.prepared = await PH.prepare(it.file, { id: it.key });
        it.state = 'ready';
        if (keepDraft) await PH.draftSave(it.prepared).catch(() => {});
      } catch (e) {
        items.splice(items.indexOf(it), 1);
        toast(e.message, { warn: true, ms: 9000 });
      }
      delete it.file;
      draw();
      onChange();
    }
  };

  // The controls: Camera and Photos on a touch screen, Add photos on a PC.
  const input = (capture) => {
    const i = el('input', { type: 'file', accept: ACCEPT(), multiple: capture ? null : true, capture: capture ? 'environment' : null, hidden: true, tabindex: '-1' });
    i.addEventListener('change', () => { add(i.files); i.value = ''; });
    return i;
  };
  const lib = input(false);
  const cam = input(true);
  const controls = el('div', { class: 'tray-acts' },
    touch() ? btn('Camera', () => cam.click(), { cls: 'sm', ic: 'camera' }) : null,
    btn(touch() ? 'Photos' : 'Add photos', () => lib.click(), { cls: 'sm', ic: 'image' }),
    lib, cam);

  draw();
  return {
    el: host,
    controls,
    add,
    /** Photos prepared in this tray, ready to store. */
    ready: () => items.filter((x) => x.state === 'ready').map((x) => x.prepared),
    /** Photos that were already there and stay. */
    kept: () => items.filter((x) => x.state === 'kept').map((x) => x.ref),
    busy: () => items.some((x) => x.state === 'preparing'),
    count: () => items.length,
    /** The draft's photo ids, to remember with its text. */
    ids: () => items.filter((x) => x.state === 'ready').map((x) => x.prepared.id),
    /** Bring a draft's photos back from this device. */
    async restore(ids) {
      for (const id of ids ?? []) {
        const p = await PH.draftLoad(id);
        if (p) items.push({ key: id, prepared: p, state: 'ready' });
      }
      draw();
      onChange();
    },
    clear() { items.length = 0; draw(); },
  };
}

/** Let a box take photos dropped on it, or pasted into it. */
export function acceptPhotos(box, tray) {
  box.addEventListener('dragover', (e) => {
    if ([...(e.dataTransfer?.types ?? [])].includes('Files')) { e.preventDefault(); box.classList.add('photo-over'); }
  });
  box.addEventListener('dragleave', (e) => { if (!box.contains(e.relatedTarget)) box.classList.remove('photo-over'); });
  box.addEventListener('drop', (e) => {
    if (!e.dataTransfer?.files?.length) return;
    e.preventDefault();
    box.classList.remove('photo-over');
    tray.add(e.dataTransfer.files);
  });
  box.addEventListener('paste', (e) => {
    const files = [...(e.clipboardData?.files ?? [])].filter(PH.looksLikePhoto);
    if (!files.length) return;
    e.preventDefault();
    tray.add(files);
  });
}

// ---------------------------------------------------------------------------
// the lightbox
// ---------------------------------------------------------------------------

/** Show photos large, starting at `start`. */
export function openLightbox(refs, start = 0, { caption = '' } = {}) {
  if (!refs?.length) return;
  const lastFocus = document.activeElement;
  let i = Math.min(Math.max(0, start), refs.length - 1);
  const img = el('img', { class: 'lb-img', alt: '' });
  const msg = el('div', { class: 'lb-msg', role: 'status' });
  const count = el('span', { class: 'lb-count' });
  const many = refs.length > 1;
  const prev = many ? el('button', { class: 'lb-nav lb-prev', type: 'button', 'aria-label': 'Previous photo', onclick: () => show(i - 1) }, icon('prev', 28)) : null;
  const next = many ? el('button', { class: 'lb-nav lb-next', type: 'button', 'aria-label': 'Next photo', onclick: () => show(i + 1) }, icon('next', 28)) : null;
  const close = iconBtn('close', 'Close (Esc)', () => done(), 'lb-close');
  const box = el('div', { class: 'lightbox', role: 'dialog', 'aria-modal': 'true', 'aria-label': caption ? `Photos: ${caption}` : 'Photos' },
    el('div', { class: 'lb-bar' }, count, el('span', { class: 'lb-cap' }, caption), close),
    el('div', { class: 'lb-stage' }, img, msg), prev, next);

  let shown = 0;
  function show(k) {
    i = (k + refs.length) % refs.length;
    const ref = refs[i];
    const me = ++shown;
    count.textContent = many ? `${i + 1} / ${refs.length}` : '';
    msg.classList.remove('wait');
    // Said only if the full photo takes a moment (a phone on a slow line).
    const slow = setTimeout(() => { if (me === shown) { msg.textContent = 'Loading the full photo…'; msg.classList.add('wait'); } }, 500);
    img.src = PH.thumb(ref);
    img.alt = `Photo ${i + 1} of ${refs.length}${caption ? `: ${caption}` : ''}`;
    img.classList.add('soft');
    msg.textContent = '';
    PH.url(ref).then((u) => { clearTimeout(slow); if (me === shown) { img.src = u; img.classList.remove('soft'); msg.textContent = ''; } })
      .catch((e) => {
        clearTimeout(slow);
        if (me !== shown) return;
        // The small copy is all there is: shown sharp, and said why.
        img.classList.remove('soft');
        msg.classList.remove('wait');
        msg.textContent = e?.code === 'missing' ? 'The full-size photo is missing; this is the small copy.' : 'The full-size photo did not load (offline?); this is the small copy.';
      });
  }
  const onKey = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(); }
    else if (e.key === 'ArrowLeft' && many) { e.preventDefault(); show(i - 1); }
    else if (e.key === 'ArrowRight' && many) { e.preventDefault(); show(i + 1); }
    else if (e.key === 'Tab') {
      const f = [...box.querySelectorAll('button')];
      const at = f.indexOf(document.activeElement);
      e.preventDefault();
      f[(at + (e.shiftKey ? -1 : 1) + f.length) % f.length]?.focus();
    }
  };
  // A swipe sideways moves; a tap on the dark around the photo closes.
  let x0 = null;
  box.addEventListener('pointerdown', (e) => { x0 = e.clientX; });
  box.addEventListener('pointerup', (e) => {
    if (x0 === null) return;
    const dx = e.clientX - x0;
    x0 = null;
    if (many && Math.abs(dx) > 50) show(i + (dx < 0 ? 1 : -1));
    else if (Math.abs(dx) < 6 && e.target.classList.contains('lb-stage')) done();
  });
  function done() {
    document.removeEventListener('keydown', onKey, true);
    box.remove();
    if (lastFocus?.isConnected) lastFocus.focus?.();
  }
  document.addEventListener('keydown', onKey, true);
  document.body.append(box);
  show(i);
  close.focus();
}
