// views/composer.js — + Note: the Log's composer, TEXT FIRST (Log brief,
// 2026-11-04). Someone on the workshop floor with a phone in one hand types
// what they saw: a Title box, then a Detail box. Then, all optional: the
// kind (Issue · Idea · Reference), the category (their recent ones first),
// a job (the lead and designers), and photos.
//
// TWO BOXES, ONE TEXT. A note is still stored as one text whose first line is
// its title (notes.js reads it that way). With a single box, contributors
// would write a whole paragraph as the "first line" (owner, 2026-11-05), so
// the composer asks for the two apart and joins them on Post.
//
// THE DRAFT IS KEPT. Every keystroke and every photo is saved on this device
// (the text in localStorage, the photos in IndexedDB), so a call, a closed
// tab or a dead battery loses nothing: + Note brings it back. Closing does
// not ask "Discard?" - nothing is lost - and Discard draft is a button of its
// own. Editing a note that is already posted is different: that is a guarded
// dialog, as every dialog holding typed input is.
//
// OFFLINE, Post still posts: Firestore keeps the note and its photos and
// sends them when the connection is back, and the toast says so.

import { el, btn, dot, toast, prefs, isPhone } from '../ui.js';
import { state, node, noteOf } from '../state.js';
import * as T from '../tree.js';
import * as A from '../actions.js';
import * as NT from '../notes.js';
import * as PH from '../photos.js';
import { openDialog } from '../dialog.js';
import { photoTray, acceptPhotos } from './photo-ui.js';
import { categoryDialog, jobDialog } from './pickers.js';
import { route, redraw } from '../router.js';

const DRAFT = 'stella.design.noteDraft';
const loadDraft = () => { try { return JSON.parse(localStorage.getItem(DRAFT) ?? 'null'); } catch { return null; } };
const saveDraft = (d) => { try { localStorage.setItem(DRAFT, JSON.stringify(d)); } catch { /* private window: no draft */ } };
const dropDraft = () => { try { localStorage.removeItem(DRAFT); } catch { /* nothing kept */ } };

/** A stored text as its title line and the detail below it. */
const splitText = (text) => {
  const s = String(text ?? '');
  const lines = s.split(/\r?\n/);
  const i = lines.findIndex((l) => l.trim());
  return i < 0 ? { title: '', detail: '' } : { title: lines[i].trim(), detail: NT.bodyOf({ text: s }) };
};
/** The two boxes as one stored text: the title line, then the detail. */
const joinText = (title, detail) => {
  const t = String(title ?? '').trim();
  const d = String(detail ?? '').replace(/^\s*\n/, '').trimEnd();
  return d ? `${t}\n${d}` : t;
};
/** A draft's two parts; a draft kept before the split holds one `text`. */
const draftParts = (d) => (d?.title !== undefined ? { title: String(d.title ?? ''), detail: String(d.detail ?? '') } : splitText(d?.text));

/** Is there a draft waiting? (+ Note says "Draft".) */
export const hasDraft = () => {
  const d = loadDraft();
  if (!d) return false;
  const { title, detail } = draftParts(d);
  return Boolean(title.trim() || detail.trim() || d.photoIds?.length);
};

/** The kind a new note starts as: the last one this device used; else by role. */
const defaultKind = () => prefs.get('noteKind', state.role === 'designer' ? 'reference' : 'issue');

/**
 * Open the composer: a new note (the draft, if any), or `noteId` to edit.
 * `groupId` and `jobId` preset a new note's category and job.
 */
export function openComposer({ noteId = null, groupId, jobId } = {}) {
  const editing = noteId ? noteOf(noteId) : null;
  if (noteId && !editing) { toast('That note is not here any more.', { warn: true }); return Promise.resolve(null); }
  const draft = editing ? null : loadDraft();
  const triage = A.canTriage();
  // What is chosen. A filtered Log presets its category for a new note.
  const pick = {
    kind: editing?.kind ?? draft?.kind ?? defaultKind(),
    groupId: editing ? editing.groupId ?? null : draft?.groupId !== undefined ? draft.groupId : (groupId ?? (route.parts[0] === 'log' ? route.query.c ?? null : null)),
    jobId: editing ? null : draft?.jobId ?? jobId ?? null,
  };

  return openDialog((box, close, { dismiss, markClean, onEscape }) => {
    box.classList.add('composer');
    box.append(el('h3', {}, editing ? 'Edit note' : 'New note'));

    // A card shows TITLE_MAX characters of the title, so the box stops there.
    const start = editing ? splitText(editing.text) : draft ? draftParts(draft) : { title: '', detail: '' };
    const title = el('input', {
      class: 'input composer-title', id: 'ncTitle', type: 'text', maxlength: String(NT.TITLE_MAX), 'data-autofocus': '',
      autocomplete: 'off', placeholder: 'Title', 'aria-label': 'Title',
    });
    const text = el('textarea', {
      class: 'textarea composer-text', id: 'ncText', rows: isPhone() ? '5' : '6', maxlength: String(NT.TEXT_MAX - NT.TITLE_MAX - 1),
      placeholder: 'Detail', 'aria-label': 'Detail',
    });
    title.value = start.title;
    text.value = start.detail;
    box.append(title, text);

    // Kind
    const seg = el('div', { class: 'seg kind-seg', role: 'group', 'aria-label': 'Kind' });
    const drawKind = () => {
      seg.textContent = '';
      for (const k of NT.KINDS) {
        seg.append(el('button', { type: 'button', 'aria-pressed': String(pick.kind === k), onclick: () => { pick.kind = k; drawKind(); persist(); } }, NT.KIND_LABEL[k]));
      }
    };
    drawKind();

    // Category
    const catBtn = el('button', { class: 'pv-btn pick-btn', type: 'button', id: 'ncCat' });
    const drawCat = () => {
      catBtn.textContent = '';
      const g = pick.groupId ? node(pick.groupId) : null;
      catBtn.append(dot(g ? T.colourOf(state.idx, g.id) : null), el('span', {}, g ? NT.placeText(state.idx, g.id) : 'None'));
    };
    catBtn.addEventListener('click', async () => {
      const r = await categoryDialog({ title: 'Which category?', current: pick.groupId, recent: prefs.get('noteRecentCats', []) });
      if (r) { pick.groupId = r.id; drawCat(); persist(); }
    });
    drawCat();

    // Job (the lead and designers; contributors cannot see jobs)
    const jobBtn = triage && !editing ? el('button', { class: 'pv-btn pick-btn', type: 'button', id: 'ncJob' }) : null;
    const drawJob = () => {
      if (!jobBtn) return;
      jobBtn.textContent = '';
      const j = pick.jobId ? node(pick.jobId) : null;
      jobBtn.append(el('span', {}, j ? j.title : 'None (optional)'));
    };
    jobBtn?.addEventListener('click', async () => {
      const id = await jobDialog({ title: 'Link this note to a job' });
      if (id !== null) { pick.jobId = id; drawJob(); persist(); }
    });
    drawJob();

    box.append(el('div', { class: 'composer-props' },
      el('div', { class: 'field' }, el('span', { class: 'lbl', id: 'ncKindLbl' }, 'Kind'), seg),
      el('div', { class: 'field' }, el('label', { for: 'ncCat' }, 'Category'), catBtn),
      jobBtn ? el('div', { class: 'field' }, el('label', { for: 'ncJob' }, 'Job'), jobBtn) : null));
    seg.setAttribute('aria-labelledby', 'ncKindLbl');

    // Photos
    const tray = photoTray({ existing: editing?.photos ?? [], keepDraft: !editing, onChange: () => persist() });
    box.append(el('div', { class: 'field composer-photos' }, el('span', { class: 'lbl' }, 'Photos'), tray.el, tray.controls));
    acceptPhotos(box, tray);

    const status = el('div', { class: 'meta composer-status', role: 'status' });
    const err = el('div', { class: 'form-err', role: 'alert' });
    box.append(err);

    // The draft: saved as it changes. Typing it is never "unsaved", so
    // closing never asks.
    let timer = null;
    const isEmpty = () => !title.value.trim() && !text.value.trim() && !tray.count();
    const draftNow = () => ({ title: title.value, detail: text.value, kind: pick.kind, groupId: pick.groupId, jobId: pick.jobId, photoIds: tray.ids(), at: new Date().toISOString() });
    function persist() {
      if (editing) return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        const empty = isEmpty();
        if (empty) dropDraft();
        else saveDraft(draftNow());
        status.textContent = empty ? '' : 'Draft kept on this device';
        markClean();
      }, 250);
    }
    title.addEventListener('input', persist);
    text.addEventListener('input', persist);

    const post = async () => {
      err.textContent = '';
      if (tray.busy()) { err.textContent = 'A photo is still being prepared. A moment.'; return; }
      // A title always: it is what the card, the panel and a job's brief show.
      if (!title.value.trim()) { err.textContent = isEmpty() ? 'Write a title first.' : 'Add a title: a few words for the card.'; title.focus(); return; }
      const body = joinText(title.value, text.value);
      if (editing) {
        markClean();
        const okd = await A.editNote(editing.id, { text: body, kind: pick.kind, groupId: pick.groupId, keep: tray.kept(), added: tray.ready() });
        if (okd) close(editing.id);
        return;
      }
      clearTimeout(timer);
      const ids = tray.ids();
      const id = await A.postNote({ text: body, kind: pick.kind, groupId: pick.groupId, jobIds: pick.jobId ? [pick.jobId] : [], photos: tray.ready() });
      if (!id) return;
      prefs.set('noteKind', pick.kind);
      if (pick.groupId) prefs.set('noteRecentCats', NT.pushRecent(prefs.get('noteRecentCats', []), pick.groupId));
      dropDraft();
      PH.draftDrop(ids);
      markClean();
      close(id);
      // The Log redrew when the note landed, while the draft was still kept, so
      // its + Note still said "(draft)". Draw it again now the draft is gone.
      redraw();
    };
    // Ctrl+Enter posts from either box; Enter in the title goes on to the detail.
    for (const f of [title, text]) f.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); post(); } });
    title.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey && !e.isComposing) { e.preventDefault(); text.focus(); } });

    const leave = () => {
      if (!editing) {
        clearTimeout(timer);
        const empty = isEmpty();
        if (!empty) {
          saveDraft(draftNow());
          toast('Draft kept: + Note brings it back');
        } else dropDraft();
        markClean();
      }
      dismiss();
      if (!editing) redraw();   // + Note shows whether a draft is waiting
    };
    const discard = editing ? null : btn('Discard draft', () => {
      PH.draftDrop(tray.ids());
      dropDraft();
      markClean();
      close(null);
      redraw();
      toast('Draft discarded');
    }, { cls: 'ghost' });

    box.append(el('div', { class: 'actions' },
      btn(editing ? 'Save' : 'Post', post, { cls: 'primary' }),
      btn(editing ? 'Cancel' : 'Close', leave),
      el('span', { class: 'sp' }),
      status,
      hasDraft() || draft ? discard : null));

    // A draft's photos come back from this device.
    if (draft?.photoIds?.length) tray.restore(draft.photoIds);
    if (draft && (start.title || start.detail || draft.photoIds?.length)) status.textContent = 'Draft from earlier, kept on this device';
    requestAnimationFrame(() => { title.setSelectionRange(title.value.length, title.value.length); });
    // Esc closes the same way as Close: the draft is kept, nothing asked.
    if (!editing) onEscape(leave);
  }, { label: editing ? 'Edit note' : 'New note', wide: true, guard: true });
}
