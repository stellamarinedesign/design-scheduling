// views/composer.js — + Note: the Log's composer, TEXT FIRST (Log brief,
// 2026-11-04). Someone on the workshop floor with a phone in one hand types
// what they saw; the first line becomes the title. Then, all optional: the
// kind (Issue · Idea · Reference), the category (their recent ones first),
// a job (the lead and designers), and photos.
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
import { route } from '../router.js';

const DRAFT = 'stella.design.noteDraft';
const loadDraft = () => { try { return JSON.parse(localStorage.getItem(DRAFT) ?? 'null'); } catch { return null; } };
const saveDraft = (d) => { try { localStorage.setItem(DRAFT, JSON.stringify(d)); } catch { /* private window: no draft */ } };
const dropDraft = () => { try { localStorage.removeItem(DRAFT); } catch { /* nothing kept */ } };

/** Is there a draft waiting? (+ Note says "Draft".) */
export const hasDraft = () => { const d = loadDraft(); return Boolean(d && (String(d.text ?? '').trim() || d.photoIds?.length)); };

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

    const text = el('textarea', {
      class: 'textarea composer-text', id: 'ncText', rows: isPhone() ? '5' : '6', maxlength: String(NT.TEXT_MAX), 'data-autofocus': '',
      placeholder: 'What did you notice? The first line is the title.\nThen as much detail as helps.', 'aria-label': 'The note: its first line is the title',
    });
    text.value = editing?.text ?? draft?.text ?? '';
    box.append(text);

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
    function persist() {
      if (editing) return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        const empty = !text.value.trim() && !tray.count();
        if (empty) dropDraft();
        else saveDraft({ text: text.value, kind: pick.kind, groupId: pick.groupId, jobId: pick.jobId, photoIds: tray.ids(), at: new Date().toISOString() });
        status.textContent = empty ? '' : 'Draft kept on this device';
        markClean();
      }, 250);
    }
    text.addEventListener('input', persist);

    const post = async () => {
      err.textContent = '';
      if (tray.busy()) { err.textContent = 'A photo is still being prepared. A moment.'; return; }
      if (!text.value.trim() && !tray.count()) { err.textContent = 'Write something first: the first line is the title.'; text.focus(); return; }
      if (editing) {
        markClean();
        const okd = await A.editNote(editing.id, { text: text.value, kind: pick.kind, groupId: pick.groupId, keep: tray.kept(), added: tray.ready() });
        if (okd) close(editing.id);
        return;
      }
      clearTimeout(timer);
      const ids = tray.ids();
      const id = await A.postNote({ text: text.value, kind: pick.kind, groupId: pick.groupId, jobIds: pick.jobId ? [pick.jobId] : [], photos: tray.ready() });
      if (!id) return;
      prefs.set('noteKind', pick.kind);
      if (pick.groupId) prefs.set('noteRecentCats', NT.pushRecent(prefs.get('noteRecentCats', []), pick.groupId));
      dropDraft();
      PH.draftDrop(ids);
      markClean();
      close(id);
    };
    text.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); post(); } });

    const leave = () => {
      if (!editing) {
        clearTimeout(timer);
        const empty = !text.value.trim() && !tray.count();
        if (!empty) {
          saveDraft({ text: text.value, kind: pick.kind, groupId: pick.groupId, jobId: pick.jobId, photoIds: tray.ids(), at: new Date().toISOString() });
          toast('Draft kept: + Note brings it back');
        } else dropDraft();
        markClean();
      }
      dismiss();
    };
    const discard = editing ? null : btn('Discard draft', () => {
      PH.draftDrop(tray.ids());
      dropDraft();
      markClean();
      close(null);
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
    if (draft && (draft.text || draft.photoIds?.length)) status.textContent = 'Draft from earlier, kept on this device';
    requestAnimationFrame(() => { text.setSelectionRange(text.value.length, text.value.length); });
    // Esc closes the same way as Close: the draft is kept, nothing asked.
    if (!editing) onEscape(leave);
  }, { label: editing ? 'Edit note' : 'New note', wide: true, guard: true });
}
