// views/note-panel.js — a Log note, in the same side panel (a full-screen
// sheet on a phone) as a task (Log brief, "Detail"). The panel is the note's
// one page: its full text and photos, its kind, state and category, the jobs
// it is linked to, and what can be done with it.
//
// TRIAGE (the lead and designers), for an issue or idea:
//   Open        Make job (the note becomes a job's brief, in a chosen
//               category, linked both ways; the note is Actioned) ·
//               Link to a job · Dismiss, with a reason
//   Actioned    the jobs, live; Link another
//   Resolved    every linked job finished (the lead's app marks it)
//   Dismissed   who and why; Reopen
// A reference note is kept as it is; the lead may archive it.
//
// The author and the lead edit it (Edit in ⋯) and may delete it.
// Contributors read no tasks: their linked jobs are the titles the note
// keeps, not links.

import { el, icon, iconBtn, btn, dot, avatar, menu, isPhone, pill } from '../ui.js';
import { state, node, noteOf, personName, realName, setLog } from '../state.js';
import * as T from '../tree.js';
import * as NT from '../notes.js';
import * as A from '../actions.js';
import { Store } from '../store.js';
import { whenLabel } from '../dates.js';
import { assignable } from '../team.js';
import { openDialog } from '../dialog.js';
import { closePanel, openTask, openNote, routeHref } from '../router.js';
import { formatBrief } from './panel.js';
import { thumbRow } from './photo-ui.js';
import { kindChip, statePill, linkTitle } from './log.js';
import { openComposer } from './composer.js';
import { jobDialog, placeDialog } from './pickers.js';

let rootEl = null;
let shownId = null;
let textOpen = false;
// A note older than the loaded page (opened from a job's panel or a link) is watched on its own.
const solo = { id: null, unsub: null, arrived: false };

function watchSolo(id) {
  if (solo.id === id) return;
  solo.unsub?.();
  Object.assign(solo, { id, arrived: false });
  solo.unsub = Store.watchNote(id, (n) => {
    solo.arrived = true;
    setLog({ solo: n });
  });
}

const canEdit = (n) => A.canEditNote(n);

export function renderNotePanel(root, id, { fresh = false } = {}) {
  rootEl = root;
  if (fresh || shownId !== id) textOpen = false;
  const keepScroll = !fresh && shownId === id ? root.querySelector('.panel-body')?.scrollTop ?? 0 : 0;
  shownId = id;
  root.classList.remove('wide');
  root.setAttribute('aria-label', 'Note');
  let n = noteOf(id);
  if (!n && state.log.loaded) watchSolo(id);
  root.textContent = '';
  if (!n) {
    const waiting = !state.log.loaded || (solo.id === id && !solo.arrived);
    root.append(bar(null), el('div', { class: 'panel-body', 'aria-busy': waiting ? 'true' : null },
      waiting ? [el('div', { class: 'skel', style: { 'min-height': '60px' } }), el('div', { class: 'skel' })]
        : el('div', { class: 'state-msg' }, el('h2', { class: 'h2' }, 'Not here any more'), el('p', {}, 'This note was deleted.'))));
    return;
  }
  if (solo.id && solo.id !== id) { solo.unsub?.(); Object.assign(solo, { id: null, unsub: null, arrived: false }); }

  const body = el('div', { class: 'panel-body note-body' }, top(n), photos(n), text(n), linkedJobs(n), triage(n), footer(n));
  root.append(bar(n), body, dock(n));
  body.scrollTop = keepScroll;
  if (fresh) { root.tabIndex = -1; root.focus({ preventScroll: true }); }
}

// ---------------------------------------------------------------------------

function bar(n) {
  const more = n ? iconBtn('more', 'More actions', (e) => moreMenu(e.currentTarget, n)) : null;
  if (isPhone()) {
    return el('div', { class: 'panel-bar' },
      iconBtn('back', 'Close', closePanel),
      n ? statePill(n) ?? kindChip(n) : null,
      el('span', { class: 'bar-title', 'aria-hidden': 'true' }, n ? NT.titleOf(n) : ''),
      more);
  }
  const place = n?.groupId && state.idx.byId.get(n.groupId) ? n.groupId : null;
  return el('div', { class: 'panel-bar' },
    el('nav', { class: 'crumbs', 'aria-label': 'Where it is' },
      el('a', { href: routeHref('/log') }, 'Log'),
      place ? el('span', { 'aria-hidden': 'true' }, '›') : null,
      place ? el('a', { href: routeHref('/log', { c: place }) }, NT.placeText(state.idx, place)) : null),
    more && moreItems(n).length ? more : null,
    iconBtn('close', 'Close (Esc)', closePanel));
}

function moreItems(n) {
  const items = [];
  if (canEdit(n)) items.push({ label: 'Edit', icon: 'edit', onSelect: () => openComposer({ noteId: n.id }) });
  if (state.role === 'lead' && n.kind === 'reference') {
    items.push(n.state === 'archived'
      ? { label: 'Put back in the Log', icon: 'restore', onSelect: () => A.archiveNote(n.id, false) }
      : { label: 'Archive', icon: 'archive', onSelect: () => A.archiveNote(n.id, true) });
  }
  if (A.canTriage() && n.state === 'dismissed') items.push({ label: 'Reopen', icon: 'undo', onSelect: () => A.reopenNote(n.id) });
  if (canEdit(n)) items.push('sep', { label: 'Delete…', icon: 'trash', danger: true, onSelect: async () => { if (await A.deleteNote(n.id)) closePanel(); } });
  while (items.at(-1) === 'sep') items.pop();
  return items;
}

const moreMenu = (anchor, n) => { const items = moreItems(n); if (items.length) menu(anchor, items, { label: 'Note actions' }); };

function top(n) {
  return el('div', { class: 'panel-top' },
    el('div', { class: 'ncard-chips' }, kindChip(n), statePill(n),
      n.pending ? el('span', { class: 'meta warn' }, 'Waiting to send: saved on this device') : null),
    el('h1', { class: 'h1 plain note-title' }, NT.titleOf(n, Infinity) || 'Untitled note'),
    el('div', { class: 'note-by' },
      avatar(realName(n.by) || n.by, personName(n.by)),
      el('span', {}, personName(n.by)),
      el('span', { class: 'meta' }, `${whenLabel(n.at)}${n.editedAt ? ' · edited' : ''}`)),
    el('div', { class: 'props' },
      el('span', { class: 'pc' }, el('span', { class: 'pc-lbl' }, 'Category'),
        n.groupId && state.idx.byId.get(n.groupId)
          ? el('span', { class: 'pv-static' }, dot(T.colourOf(state.idx, n.groupId)), el('span', {}, NT.placeText(state.idx, n.groupId)))
          : el('span', { class: 'pv-static pv-muted' }, 'None'))));
}

function photos(n) {
  if (!n.photos?.length) return null;
  return el('section', { class: 'psec', 'aria-label': 'Photos' }, thumbRow(n.photos, { caption: NT.titleOf(n), cls: 'big' }));
}

function text(n) {
  const rest = NT.bodyOf(n);
  if (!rest.trim()) return null;
  const long = rest.split(/\r?\n/).length > 14 || rest.length > 1200;
  const sec = el('section', { class: 'psec', 'aria-label': 'The note' },
    el('div', { class: `brief note-text${long && !textOpen ? ' folded' : ''}`, html: formatBrief(rest) }));
  if (long) sec.append(btn(textOpen ? 'Show less' : 'Show all', () => { textOpen = !textOpen; renderNotePanel(rootEl, n.id); }, { cls: 'sm ghost' }));
  return sec;
}

function linkedJobs(n) {
  const links = n.links ?? [];
  if (!links.length) return null;
  const sec = el('section', { class: 'psec', 'aria-label': 'Jobs' }, el('div', { class: 'psec-head' }, el('h2', { class: 'lbl' }, links.length > 1 ? 'Jobs' : 'Job')));
  const rows = el('div', { class: 'rows' });
  for (const l of links) {
    const j = node(l.id);
    // Someone who reads no tasks (or a job archived since) sees the title the note kept.
    if (!j) {
      const team = state.role === 'lead' || state.role === 'designer';
      rows.append(el('div', { class: 'jrow static' },
        el('span', { class: 'jrow-main' }, el('span', { class: 'jrow-title' }, l.title || 'A job'), team ? el('span', { class: 'meta' }, 'Archived or deleted') : null),
        A.canTriage() ? iconBtn('close', `Unlink ${l.title || 'this job'}`, () => A.unlinkNote(n.id, l.id), 'sm') : null));
      continue;
    }
    rows.append(el('div', { class: 'jrow' },
      el('button', { class: 'open-link', type: 'button', 'aria-label': `Open ${j.title}`, onclick: () => openTask(j.id) }),
      pill(j.status),
      el('span', { class: 'jrow-main' }, el('span', { class: 'jrow-title' }, linkTitle(l)), el('span', { class: 'meta' }, T.pathText(state.idx, j.id))),
      A.canTriage() ? iconBtn('close', `Unlink ${j.title}`, () => A.unlinkNote(n.id, j.id), 'sm') : null));
  }
  sec.append(rows);
  return sec;
}

/** What can be done with it: the lead's and designers' triage. */
function triage(n) {
  if (!A.canTriage()) return null;
  if (n.state === 'dismissed') {
    const d = n.dismissed ?? {};
    return el('div', { class: 'callout' },
      el('div', {}, el('strong', {}, `Dismissed by ${personName(d.by)}`), el('span', { class: 'meta' }, ` · ${whenLabel(d.at)}`)),
      d.reason ? el('div', { class: 'note-reason' }, d.reason) : null,
      el('div', {}, btn('Reopen', () => A.reopenNote(n.id), { cls: 'sm', ic: 'undo' })));
  }
  if (n.state === 'archived') return el('div', { class: 'callout' }, el('div', {}, 'Archived: kept, out of the feed.'));
  if (!NT.isTriage(n)) {
    return el('div', { class: 'note-acts' }, btn('Link to a job', () => linkJob(n), { cls: 'sm', ic: 'link' }));
  }
  if (n.state === 'open') {
    return el('div', { class: 'callout note-triage' },
      el('div', {}, el('strong', {}, `Open ${NT.KIND_LABEL[n.kind].toLowerCase()}. `), 'Make it a job, link it to one already under way, or dismiss it with a reason.'),
      // On a phone Make job and Link sit in the dock at the bottom: one red button in view.
      el('div', { class: 'note-acts' },
        isPhone() ? null : btn('Make job', () => makeJob(n), { cls: 'primary sm', ic: 'plus' }),
        isPhone() ? null : btn('Link to a job', () => linkJob(n), { cls: 'sm', ic: 'link' }),
        btn('Dismiss', () => A.dismissNote(n.id), { cls: 'sm ghost' })));
  }
  return el('div', { class: 'note-acts' },
    n.state === 'resolved' ? el('span', { class: 'meta wrap' }, 'Resolved: every job it is linked to is finished.') : null,
    btn('Link another job', () => linkJob(n), { cls: 'sm', ic: 'link' }));
}

function footer(n) {
  const a = n.actioned;
  return el('div', { class: 'meta wrap' },
    `Posted ${whenLabel(n.at)} by ${personName(n.by)}`,
    a?.by && n.state !== 'open' ? ` · actioned by ${personName(a.by)} ${whenLabel(a.at)}` : '');
}

/** Phone: the one action pinned at the bottom. */
function dock(n) {
  if (!isPhone() || !A.canTriage() || !NT.isTriage(n) || n.state !== 'open') return el('div', { class: 'panel-dock', hidden: true });
  return el('div', { class: 'panel-dock' },
    btn('Link to a job', () => linkJob(n)),
    btn('Make job', () => makeJob(n), { cls: 'primary' }));
}

// ---------------------------------------------------------------------------

async function linkJob(n) {
  const id = await jobDialog({ title: 'Link this note to a job', exclude: n.jobIds ?? [] });
  if (id) A.linkNote(n.id, id);
}

/**
 * Make job from note: the title (the note's first line), where it goes (the
 * note's category to start with), who has it, and the category's steps.
 */
function makeJob(n) {
  let place = n.groupId && state.idx.byId.get(n.groupId) ? n.groupId : null;
  return openDialog((box, close, { dismiss }) => {
    box.append(el('h3', {}, 'Make a job from this note'));
    const title = el('input', { class: 'input', id: 'mjTitle', type: 'text', maxlength: '300', autocomplete: 'off', 'data-autofocus': '' });
    title.value = NT.titleOf(n);
    box.append(el('div', { class: 'field' }, el('label', { for: 'mjTitle' }, 'Title'), title));

    const placeBtn = el('button', { class: 'pv-btn pick-btn', type: 'button', id: 'mjPlace' });
    const tplBox = el('input', { type: 'checkbox', checked: true });
    const tplLine = el('label', { class: 'check-line' });
    const drawPlace = () => {
      placeBtn.textContent = '';
      const p = place ? node(place) : null;
      placeBtn.append(dot(p ? T.colourOf(state.idx, p.id) : null), el('span', {}, p ? T.ancestorChain(state.idx, p.id).concat(p).map(T.nameOf).join(' › ') : 'Not in a category'));
      const tpl = p ? T.stepsTemplateOf(state.idx, p.id) : null;
      tplLine.hidden = !tpl;
      tplLine.textContent = '';
      if (tpl) tplLine.append(tplBox, el('span', {}, `Take the steps from ${T.nameOf(tpl.from)} (${tpl.template.length})`));
    };
    placeBtn.addEventListener('click', async () => {
      const dest = await placeDialog({
        title: 'Put the job in…', current: place,
        allow: (p) => (!p || (T.isGroupLike(p) && NT.isNoteCategory(state.idx, p)) ? null : 'Not a category'),
      });
      if (dest !== undefined) { place = dest; drawPlace(); }
    });
    drawPlace();
    box.append(el('div', { class: 'field' }, el('label', { for: 'mjPlace' }, 'Category'), placeBtn, tplLine));

    // Who has it: the lead picks anyone; a designer takes it, or leaves it for the lead to give out.
    const lead = state.role === 'lead';
    const people = lead ? assignable(state.access) : [state.me];
    const forSel = el('select', { class: 'sel', id: 'mjFor' },
      [state.me, ...people.filter((p) => p !== state.me)].map((p) => el('option', { value: p }, personName(p))),
      el('option', { value: '' }, lead ? 'Nobody yet' : 'Nobody yet (the Design lead gives it out)'));
    box.append(el('div', { class: 'field' }, el('label', { for: 'mjFor' }, 'For'), forSel));
    box.append(el('p', { class: 'meta wrap' }, 'The rest of the note becomes the brief. The job and the note link to each other, and the note is marked Actioned.'));

    const err = el('div', { class: 'form-err', role: 'alert' });
    const make = () => {
      if (!title.value.trim()) { err.textContent = 'The job needs a title.'; title.focus(); return; }
      const id = A.makeJobFromNote(n.id, { title: title.value.trim(), parentId: place, assignee: forSel.value || null, useTemplate: !tplLine.hidden && tplBox.checked });
      close(id);
    };
    title.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); make(); } });
    box.append(err, el('div', { class: 'actions' }, btn('Make job', make, { cls: 'primary' }), btn('Cancel', dismiss)));
  }, { label: 'Make a job from this note', guard: true });
}

/**
 * A job's side of the link: the notes that point at it, for the task panel
 * ("From the Log"). Live; null until it has something to show.
 */
export function jobNotesList(notes) {
  if (!notes?.length) return null;
  return el('div', { class: 'rows' }, notes.map((n) => el('div', { class: 'jrow' },
    el('button', { class: 'open-link', type: 'button', 'aria-label': `Open the note: ${NT.titleOf(n)}`, onclick: () => openNote(n.id) }),
    n.photos?.length ? el('img', { class: 'jrow-thumb', src: n.photos[0].thumb, alt: '' }) : el('span', { class: 'jrow-ic' }, icon('log', 16)),
    el('span', { class: 'jrow-main' }, el('span', { class: 'jrow-title' }, NT.titleOf(n) || 'Note'),
      el('span', { class: 'meta' }, `${NT.KIND_LABEL[n.kind]} · ${personName(n.by)} · ${whenLabel(n.at)}`)),
    statePill(n))));
}

