// views/panel.js — the task panel: ONE NAVIGABLE PAGE (decided 2026-11-04,
// after the owner's live test run; it supersedes the panel / "Open as page"
// split of the Task panel brief). A 560px panel beside the list when wide,
// sliding over it at half-screen, a full-screen sheet on a phone. Expand
// widens it to the whole main area for deep work; the choice is kept.
//
// Top to bottom: the breadcrumb; the title, edited in place, with the status
// and a compact row of properties; then CHILDREN FIRST - its tasks, as tiles
// or a list (remembered per node), each with the check control; then the
// review box (Approve and Send back, or the action for where it is), Brief,
// Folders and the Updates timeline.
//
// ONE KIND OF TASK (2026-11-06): inside a job everything is a task, added
// from one "Add a task" box (Enter adds, focus stays). TILES shows the direct
// children only - a section is a tile too, with how many are open, and
// opening it drills in; LIST shows the whole tree, nested, sections as
// headings. A task with nobody on it is part of its job: ticked, never
// checked; assigning someone (the lead, "Assign to…") gives it a check of
// its own.
//
// Clicking a child drills the panel into it, in the same layout. The
// breadcrumb navigates the panel; a category crumb closes it and reveals the
// category in the Tasks list. ←, Esc and browser Back go up one level, and
// the URL (?t=<id>) follows the node. A section inside a job opens here too:
// its own children, and no timeline (it has none).
//
// Enter saves a field; Esc cancels it. A field being edited is never redrawn
// under the cursor (app.js asks `panelEditing()` first).

import { el, icon, iconBtn, btn, pill, avatar, menu, toast, isPhone, canDrag, prefs, withMenu } from '../ui.js';
import { state, node, personName, realName } from '../state.js';
import * as T from '../tree.js';
import * as S from '../status.js';
import * as A from '../actions.js';
import { Store } from '../store.js';
import * as SF from '../stella-folder.js';
import { whenLabel, daysUntil, ageLabel } from '../dates.js';
import { normaliseFolder, learnPrefix, fullPath, displayPath, leafName } from '../folders.js';
import { statusMenu, taskMenu, checkBox, whoBadge, subtext, enableDrag, assignMenu } from './tile.js';
import * as BL from '../backlog.js';
import { backlogPool } from './home.js';
import { revealCategory } from './tasks.js';
import { go, route, openTask, closePanel, routeHref, upTo } from '../router.js';
import { promptDialog } from '../dialog.js';
import { shortPath } from '../paths.js';
import { photoTray, acceptPhotos, thumbRow } from './photo-ui.js';
import { jobNotesList } from './note-panel.js';
import { shareMenu, shareText, requestCallout } from './managers.js';
import * as TR from '../timer.js';
import * as TU from './timer-ui.js';

let rootEl = null;
let openId = null;
let stale = false;
let briefEditing = false;
let briefOpen = false;
const timeline = { id: null, list: [], more: false, limit: 20, unsub: null, loaded: false };
/** The open job's times, when it is tracked (timer-ui.jobTimes): the tiles and rows read their figures from it. */
let times = null;

/** Is a field in the panel being edited right now? */
export function panelEditing() {
  const a = document.activeElement;
  // An add box (data-keep) does not hold the panel back: what it adds should
  // show at once, and renderPanel puts the box, focus and all, back after.
  const busy = rootEl && rootEl.contains(a) && a.matches('textarea, input:not([type=checkbox]):not([type=date])') && !a.dataset.keep;
  if (busy) stale = true;
  return busy;
}

/** A category or product is a place in the Tasks list, not something the panel shows. */
const isPlace = (n) => T.isGroupLike(n) && !T.isSection(state.idx, n);

/**
 * May this person change what the panel shows? The same test the rules make:
 * the lead anything; a designer their own tasks, and the tasks with nobody
 * on them and the sections inside those. Anyone who can open it can still
 * post an update.
 */
const editable = (n) => A.canEdit(n);
const lead = () => state.role === 'lead';
const light = (n) => T.isLight(state.idx, n);
const derived = (n) => T.isContainer(state.idx, n);

/** One level up, if the panel can show it: null at a job. */
const upNode = (n) => { const p = T.parentOf(state.idx, n); return p && !isPlace(p) ? p : null; };

/** ←, Esc, the phone's back: up one level, or closed from a job. */
export function panelUp() {
  const n = node(state.openId);
  const up = n ? upNode(n) : null;
  if (up) upTo(up.id);
  else closePanel();
}

/** After archiving or deleting what the panel shows: up to what held it, worked out while it is still there. */
const leaveTo = (n) => { const up = upNode(n); return () => (up ? upTo(up.id) : closePanel()); };

/** Expanded to the whole main area? Never on a phone, where it is the whole screen already. */
const isWide = () => !isPhone() && prefs.get('panelWide', false);

export function renderPanel(root, id, { fresh = false } = {}) {
  rootEl = root;
  stale = false;
  const n = node(id);
  if (fresh) { briefEditing = false; briefOpen = false; }
  root.classList.toggle('wide', isWide());
  if (!n) {
    if (!state.ready) { root.textContent = ''; root.append(bar(null), el('div', { class: 'panel-body', 'aria-busy': 'true' }, el('div', { class: 'skel', style: { 'min-height': '60px' } }), el('div', { class: 'skel' }))); return; }
    root.textContent = '';
    root.append(bar(null), el('div', { class: 'panel-body' }, el('div', { class: 'state-msg' },
      el('h2', { class: 'h2' }, 'Not here any more'),
      el('p', {}, 'It was archived, deleted, or moved out of reach. The archive keeps what was archived.'),
      el('div', {}, btn('Open the archive', () => go('/archive'))))));
    return;
  }
  if (isPlace(n)) { revealCategory(n.id); return; }

  const keepScroll = !fresh && openId === id ? root.querySelector('.panel-body')?.scrollTop ?? 0 : 0;
  // An add box with focus survives the redraw: its words, caret and focus.
  const act = document.activeElement;
  const kept = !fresh && openId === id && act?.dataset?.keep && root.contains(act)
    ? { key: act.dataset.keep, value: act.value, from: act.selectionStart, to: act.selectionEnd } : null;
  openId = id;
  // A tracked job's entries are watched while it, or anything in it, is open.
  const job = T.jobOf(state.idx, n.id);
  TR.watchJob(job?.timeTracked ? job.id : null);
  times = job ? TU.jobTimes(job.id) : null;
  root.textContent = '';
  const body = el('div', { class: 'panel-body' });
  if (n.kind === T.KIND.task) {
    watchTimeline(id);
    watchJobNotes(id);
    const review = contextAction(n);
    // Native append writes a null as the word "null": the parts that may be
    // absent (a manager's request, the review) are filtered out first.
    body.append(...[top(n), requestCallout(n), childrenSection(n), review ? el('div', { class: 'panel-review' }, review) : null, briefSection(n), fromLogSection(), foldersSection(n), updatesSection(n), footer(n)].filter(Boolean));
  } else {
    stopTimeline();
    body.append(nodeTop(n), childrenSection(n));
  }
  root.append(bar(n), body, n.kind === T.KIND.task ? dock(n) : el('div', { class: 'panel-dock', hidden: true }));
  body.scrollTop = keepScroll;
  // Focus moves to the panel, not into the title: an open is for reading, and
  // a focused field would put the title in edit mode (and the keyboard up on
  // a phone). Tab reaches the title next.
  if (fresh) { root.tabIndex = -1; root.focus({ preventScroll: true }); }
  if (kept) {
    const box = root.querySelector(`[data-keep="${CSS.escape(kept.key)}"]`);
    if (box) {
      box.value = kept.value;
      box.focus({ preventScroll: true });
      try { box.setSelectionRange(kept.from, kept.to); } catch { /* not a text box */ }
    }
  }
  // A change that arrived while a field was being edited is drawn once the
  // field lets go. A real listener, once per panel element: `onfocusout` is
  // not an event-handler property in Chrome or Edge, so assigning one did
  // nothing, and the panel stayed stale after Ctrl+Enter until the next
  // change. The panel element also shows Log notes and a manager's job
  // sheet: only a task still open here is redrawn.
  if (!root.dataset.blurWired) {
    root.dataset.blurWired = '1';
    root.addEventListener('focusout', () => setTimeout(() => {
      if (stale && !panelEditing() && openId && state.openId === openId && rootEl === root) renderPanel(root, openId);
    }, 0));
  }
}

// ---------------------------------------------------------------------------
// the bar along the top: up, where it is, expand, ⋯, close
// ---------------------------------------------------------------------------

/** A link that also works as a link: Ctrl+click and middle-click still open a new tab. */
const plainClick = (e) => !(e.ctrlKey || e.metaKey || e.shiftKey || e.altKey || e.button);

function crumb(a) {
  // A designer has no category tree to go to: the place is named, not linked.
  if (isPlace(a) && !lead()) return el('span', {}, T.nameOf(a));
  if (isPlace(a)) {
    return el('a', {
      href: routeHref('/tasks', { c: a.id }), title: 'Show it in the Tasks list',
      onclick: (e) => { if (plainClick(e)) { e.preventDefault(); revealCategory(a.id); } },
    }, T.nameOf(a));
  }
  return el('a', {
    href: routeHref(route.path, { ...route.query, t: a.id }),
    onclick: (e) => { if (plainClick(e)) { e.preventDefault(); openTask(a.id); } },
  }, T.nameOf(a));
}

function crumbs(n) {
  const chain = n ? T.ancestorChain(state.idx, n.id) : [];
  return el('nav', { class: 'crumbs', 'aria-label': 'Where it is' },
    chain.length ? chain.flatMap((a, i) => [i ? el('span', { 'aria-hidden': 'true' }, '›') : null, crumb(a)])
      : el('span', {}, n ? 'Not in a category' : ''));
}

function toggleWide() {
  prefs.set('panelWide', !prefs.get('panelWide', false));
  renderPanel(rootEl, openId);
  rootEl.querySelector('[data-fk="wide"]')?.focus();
}

function bar(n) {
  const up = n ? upNode(n) : null;
  // On a phone the sheet's bar keeps the status and title in sight while the
  // rest scrolls (Task panel brief); the path moves into the body.
  if (isPhone()) {
    return el('div', { class: 'panel-bar' },
      iconBtn('back', up ? `Up to ${T.nameOf(up)}` : 'Close', panelUp),
      n?.kind === T.KIND.task ? statusPillOf(n) : null,
      el('span', { class: 'bar-title', 'aria-hidden': 'true' }, n ? T.nameOf(n) : ''),
      n ? iconBtn('more', 'More actions', (e) => moreMenu(e.currentTarget, n)) : null);
  }
  const wide = isWide();
  const toggle = iconBtn(wide ? 'collapse' : 'expand', wide ? 'Collapse to panel width' : 'Expand to the full width', toggleWide);
  toggle.dataset.fk = 'wide';
  return el('div', { class: 'panel-bar' },
    up ? iconBtn('back', `Up to ${T.nameOf(up)} (Esc)`, panelUp) : null,
    crumbs(n),
    n ? toggle : null,
    n ? iconBtn('more', 'More actions', (e) => moreMenu(e.currentTarget, n)) : null,
    iconBtn('close', up ? 'Close' : 'Close (Esc)', closePanel));
}

function moreMenu(anchor, n) {
  if (n.kind !== T.KIND.task) { sectionMenu(anchor, n); return; }
  const job = T.isJob(state.idx, n);
  const items = [
    lead() ? { label: 'Assign to…', icon: 'user', onSelect: () => assignMenu(anchor, n) } : null,
    lead() ? { label: 'Move to…', icon: 'move', onSelect: async () => (await import('./pickers.js')).moveDialog(n.id) } : null,
    TU.trackItem(n),
    lead() && job ? { label: 'Turn into a category', icon: 'folderPlus', onSelect: () => A.turnIntoCategory(n.id) } : null,
    lead() && n.backlogIgnored ? { label: 'Show in the Backlog again', icon: 'restore', onSelect: () => A.setBacklogIgnored(n.id, false) }
      : lead() && BL.canHideFromBacklog(state.idx, n.id, backlogPool()) ? { label: 'Hide from the Backlog', icon: 'hide', onSelect: () => A.setBacklogIgnored(n.id, true) } : null,
    'sep',
    editable(n) ? { label: 'Archive', icon: 'archive', onSelect: () => { const out = leaveTo(n); A.archive(n.id); out(); } } : null,
    lead() ? { label: 'Delete…', icon: 'trash', danger: true, onSelect: async () => { const out = leaveTo(n); if (await A.remove(n.id)) out(); } } : null,
  ].filter(Boolean);
  if (items[0] === 'sep') items.shift();
  if (items[items.length - 1] === 'sep') items.pop();
  if (!items.length) { toast('Nothing to change here: it is not yours. Post an update instead.'); return; }
  menu(anchor, items, { label: 'Task actions' });
}

// ---------------------------------------------------------------------------
// title, status and the compact properties row
// ---------------------------------------------------------------------------

/**
 * The status pill: the status menu for whoever may change it. A task part of
 * its job with tasks inside shows their state, worked out, with nothing to set.
 */
function statusPillOf(n) {
  if (derived(n)) {
    const p = T.progress(state.idx, n.id);
    const shown = pill(T.shownStatus(state.idx, n));
    shown.title = `From the tasks inside: ${p.done} of ${p.total} done`;
    return shown;
  }
  return pill(n.status, editable(n) ? { onClick: (e) => statusMenu(e.currentTarget, n) } : {});
}

/** The name, edited in place: a task's title, a section's name. */
function titleField(n) {
  const key = n.kind === T.KIND.task ? 'title' : 'name';
  const was = n[key] ?? '';
  const title = el('textarea', { class: 'title-edit', rows: '1', 'aria-label': n.kind === T.KIND.task ? 'Title' : 'Name', spellcheck: 'true', maxlength: '300', readonly: !editable(n) });
  title.value = was;
  const fit = () => { title.style.height = 'auto'; title.style.height = `${Math.min(title.scrollHeight, 3 * 1.3 * 19 + 8)}px`; };
  requestAnimationFrame(fit);
  title.addEventListener('input', fit);
  title.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); title.blur(); }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); title.value = was; title.blur(); }
  });
  title.addEventListener('blur', () => {
    const v = title.value.replace(/\s+/g, ' ').trim();
    if (!v) { title.value = was; return; }
    if (v !== was) A.updateFields(n.id, { [key]: v });
  });
  return title;
}

function top(n) {
  const wrap = el('div', { class: 'panel-top' });
  if (isPhone()) wrap.append(crumbs(n));
  wrap.append(titleField(n));

  const can = editable(n);
  const due = daysUntil(n.due);
  const dueInput = el('input', { type: 'date', class: `pv-input${due !== null && due <= 2 && S.isOpen(n.status) ? ' warn-text' : ''}`, 'aria-label': 'Due date', value: n.due ?? '', disabled: !can });
  dueInput.addEventListener('change', () => A.updateFields(n.id, { due: dueInput.value || null }));
  const rev = el('input', { type: 'text', class: 'pv-input mono', 'aria-label': 'Revision', placeholder: 'None', value: n.revision ?? '', maxlength: '40', readonly: !can });
  rev.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); rev.blur(); }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); rev.value = n.revision ?? ''; rev.blur(); }
  });
  rev.addEventListener('blur', () => { const v = rev.value.trim(); if (v !== (n.revision ?? '')) A.updateFields(n.id, { revision: v || null }); });

  // One compact row: each value carries its own small label, and wraps on a phone.
  const pc = (label, ...v) => el('div', { class: 'pc' }, el('span', { class: 'pc-lbl', 'aria-hidden': 'true' }, label), ...v);
  // Only the lead gives work to someone; everyone sees who has it. A task
  // inside a job with nobody on it is part of the job, and says so: giving
  // it someone puts it on their list, with a check of its own.
  const part = light(n);
  const whoText = part ? 'Part of the job' : personName(n.assignee);
  const who = [n.assignee ? face(n.assignee) : null, el('span', { class: n.assignee ? '' : 'pv-muted' }, whoText)];
  const prio = { high: 'High', normal: 'Normal', low: 'Low' }[n.priority] ?? 'Normal';
  const prioText = el('span', { class: n.priority === 'high' ? 'warn-text' : n.priority === 'low' ? 'pv-muted' : '' }, prio);
  wrap.append(el('div', { class: 'props' },
    statusPillOf(n),
    pc('Who', lead()
      ? el('button', {
        class: 'pv-btn', type: 'button', 'aria-haspopup': 'menu', 'aria-label': `Assignee: ${whoText}. Change`,
        title: part ? 'Assign someone to put it on their list, with a check of its own' : null,
        onclick: (e) => assignMenu(e.currentTarget, n),
      }, ...who)
      : el('span', { class: 'pv-static' }, ...who)),
    pc('Priority', can
      ? el('button', { class: 'pv-btn', type: 'button', 'aria-haspopup': 'menu', 'aria-label': `Priority: ${prio}`, onclick: (e) => priorityMenu(e.currentTarget, n) }, prioText)
      : el('span', { class: 'pv-static' }, prioText)),
    pc('Due', dueInput),
    pc('Rev', rev),
    TU.taskTime(n) ? pc('Time', TU.taskTime(n)) : null,
    // What managers see of it: the lead's choice, here or from the category above.
    lead() && T.isJob(state.idx, n) ? pc('Managers', el('button', {
      class: 'pv-btn', type: 'button', 'aria-haspopup': 'menu', 'aria-label': `Shared with managers: ${shareText(n)}. Change`,
      onclick: (e) => shareMenu(e.currentTarget, n),
    }, el('span', { class: shareText(n) === 'Not shared' ? 'pv-muted' : '' }, shareText(n)))) : null));

  // A tracked job's timer: Start / Pause and its total, under the properties.
  if (T.isJob(state.idx, n)) { const tb = TU.timerBar(n); if (tb) wrap.append(tb); }
  const chips = blockChips(n);
  if (chips) wrap.append(chips);
  return wrap;
}

/** A section's top: its name, and what it is. */
function nodeTop(n) {
  const wrap = el('div', { class: 'panel-top' });
  if (isPhone()) wrap.append(crumbs(n));
  wrap.append(titleField(n));
  const job = T.jobOf(state.idx, n.id);
  wrap.append(el('div', { class: 'props' }, el('span', { class: 'meta wrap' }, `A section${job ? ` of ${job.title}` : ''}: a heading for its tasks.`)));
  return wrap;
}

function priorityMenu(anchor, n) {
  menu(anchor, ['high', 'normal', 'low'].map((p) => ({
    label: { high: 'High', normal: 'Normal', low: 'Low' }[p], checked: (n.priority ?? 'normal') === p,
    onSelect: () => A.updateFields(n.id, { priority: p }),
  })), { label: 'Priority' });
}

function blockChips(n) {
  const { idx } = state;
  const blockedBy = n.status === 'waiting' ? (n.waiting?.blockedBy ?? []).map((b) => idx.byId.get(b)).filter(Boolean) : [];
  const blocks = S.dependentsOf(idx, n.id);
  if (!blockedBy.length && !blocks.length) return null;
  const chip = (t) => el('button', { class: 'chip', type: 'button', onclick: () => openTask(t.id), title: `${t.title} (${personName(t.assignee)}, ${S.LABEL[t.status]})` },
    pill(t.status, { label: S.LABEL[t.status] }), el('span', {}, t.title));
  return el('div', { class: 'prop' },
    blockedBy.length ? el('span', { class: 'lbl' }, 'Blocked by') : null,
    blockedBy.length ? el('div', { class: 'chips' }, blockedBy.map(chip)) : null,
    blocks.length ? el('span', { class: 'lbl', style: { 'margin-top': blockedBy.length ? '8px' : null } }, `Blocks ${blocks.length}`) : null,
    blocks.length ? el('div', { class: 'chips' }, blocks.map(chip)) : null);
}

/** The primary action for where this task is. At most one red button. */
function contextAction(n) {
  if (!A.canWrite(n)) return readOnlyAction(n);
  if (derived(n)) {
    const p = T.progress(state.idx, n.id);
    return el('div', { class: 'meta wrap' }, `Its state comes from the tasks inside it: ${p.done} of ${p.total} done. Tick those.`);
  }
  // Part of its job: ticked Done by whoever may edit the job, never submitted
  // (one left in check or sent back from before goes back to In progress).
  if (light(n) && ['in_progress', 'check', 'fix'].includes(n.status)) {
    return el('div', { class: 'acts row' },
      btn('Mark done', () => A.setStatus(n.id, 'done'), { cls: 'primary', ic: 'check' }),
      n.status === 'in_progress' ? btn('Waiting…', () => A.setStatus(n.id, 'waiting'), { cls: 'ghost' })
        : btn('Back to In progress', () => A.setStatus(n.id, 'in_progress')));
  }
  const lead = state.role === 'lead';
  const since = (iso) => (iso ? ` · ${whenLabel(iso)}` : '');
  switch (n.status) {
    case 'check': {
      // Whoever submitted it can take it back ("forgot a part"); only the lead approves or sends back.
      const mine = S.canTakeBack(n, state.me);
      const takeBack = mine ? btn('Take back', () => A.takeBack(n.id), { cls: lead ? 'ghost' : '', ic: 'undo', title: 'Back to In progress, with an optional note' }) : null;
      return el('div', { class: 'callout check' },
        el('div', { class: 'callout-head' }, `Ready for check${n.submittedBy && !mine ? ` · submitted by ${personName(n.submittedBy)}` : ''}${since(n.submittedAt ?? n.updatedAt)}`),
        lead ? el('div', { class: 'acts' },
          btn('Approve', () => A.setStatus(n.id, 'done'), { cls: 'primary', ic: 'check' }),
          btn('Send back', () => A.setStatus(n.id, 'fix')),
          takeBack)
          : el('div', { class: 'acts' }, el('span', { class: 'meta', style: { 'white-space': 'normal' } }, 'Waiting for the Design lead to check it.'), takeBack));
    }
    case 'fix':
      return el('div', { class: 'callout fix' },
        el('div', { class: 'callout-head' }, `Sent back${since(n.statusAt ?? n.updatedAt)}`),
        n.fixNote ? el('div', { class: 'callout-body' }, n.fixNote) : null,
        el('div', { class: 'acts' },
          btn('Submit for check again', () => A.setStatus(n.id, 'check'), { cls: 'primary' }),
          btn('Start fixing', () => A.setStatus(n.id, 'in_progress'))));
    case 'waiting': {
      const line = S.waitingLine(state.idx, n);
      const note = String(n.waiting?.note ?? '').trim();
      return el('div', { class: 'callout waiting' },
        el('div', { class: 'callout-head' }, `Waiting${n.waiting?.since ? ` since ${whenLabel(n.waiting.since).replace(' ago', '')}` : ''}`),
        el('div', { class: 'callout-body' }, note && !line.startsWith('Waiting:') ? `${line}\n${note}` : (note || line)),
        el('div', { class: 'acts' },
          btn(`Stop waiting · back to ${S.LABEL[n.waiting?.prevStatus ?? 'todo'] ?? 'To do'}`, () => A.setStatus(n.id, n.waiting?.prevStatus && n.waiting.prevStatus !== 'waiting' ? n.waiting.prevStatus : 'todo')),
          btn('Change', () => A.setStatus(n.id, 'waiting'), { cls: 'ghost' })));
    }
    case 'todo':
      return el('div', { class: 'acts row' },
        btn('Start', () => A.start(n.id), { cls: 'primary', ic: 'play' }),
        btn('Waiting…', () => A.setStatus(n.id, 'waiting'), { cls: 'ghost' }));
    case 'in_progress':
      // Only the lead marks work done; everyone else submits it for check.
      return el('div', { class: 'acts row' },
        lead ? btn('Mark done', () => A.setStatus(n.id, 'done'), { cls: 'primary', ic: 'check' }) : null,
        btn('Submit for check', () => A.setStatus(n.id, 'check'), { cls: lead ? '' : 'primary' }),
        btn('Waiting…', () => A.setStatus(n.id, 'waiting'), { cls: 'ghost' }));
    case 'done':
      return el('div', { class: 'row' },
        el('span', { class: 'meta' }, `Done${n.doneAt ? ` ${whenLabel(n.doneAt)}` : ''}${n.checkedBy ? ` · checked by ${personName(n.checkedBy)}` : ''}`),
        el('span', { class: 'sp' }),
        btn('Reopen', () => A.setStatus(n.id, 'in_progress'), { cls: 'sm' }));
    case 'cancelled': {
      // Recorded apart, for future reference: who, when and why.
      const why = String(n.cancelled?.reason ?? '').trim();
      return el('div', { class: 'callout' },
        el('div', { class: 'callout-head' }, `Cancelled${n.cancelled?.at ? ` ${whenLabel(n.cancelled.at)}` : ''}${n.cancelled?.by ? ` by ${personName(n.cancelled.by)}` : ''}`),
        why ? el('div', { class: 'callout-body' }, why) : null,
        el('div', { class: 'acts' }, btn(`Reopen · back to ${S.LABEL[S.reopenTo(n)]}`, () => A.reopen(n.id), { ic: 'restore' })));
    }
    default: return null;
  }
}

/**
 * Someone else's task, seen by a designer: where it stands, said plainly,
 * with nothing to press (the rules would refuse it). Updates still post.
 */
function readOnlyAction(n) {
  const head = { check: 'Ready for check', fix: 'Sent back', waiting: 'Waiting', cancelled: 'Cancelled', done: 'Done' }[n.status];
  const body = n.status === 'fix' ? n.fixNote : n.status === 'waiting' ? S.waitingLine(state.idx, n) : n.status === 'cancelled' ? n.cancelled?.reason : '';
  let whose = 'Nobody has it yet, and only the Design lead changes it.';
  const job = light(n) ? T.jobOf(state.idx, n.id) : null;
  if (job) whose = `It is part of ${job.title}: whoever has that job, or the Design lead, ticks it.`;
  else if (n.assignee) {
    whose = state.access.leads.includes(n.assignee)
      ? `${personName(n.assignee)} has it.`
      : `${personName(n.assignee)} has it. Only they or the Design lead change it.`;
  }
  return el('div', { class: `callout ${{ check: 'check', fix: 'fix', waiting: 'waiting' }[n.status] ?? ''}`.trim() },
    head ? el('div', { class: 'callout-head' }, head) : null,
    body ? el('div', { class: 'callout-body' }, body) : null,
    el('div', { class: 'meta wrap' }, `${whose} You can post an update below.`));
}

// ---------------------------------------------------------------------------
// brief
// ---------------------------------------------------------------------------

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Simple formatting: "- " bullets, **bold**, and links. Escaped first, so nothing else gets through. */
export function formatBrief(text) {
  const inline = (s) => esc(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\bhttps?:\/\/[^\s<]+[^\s<.,;:!?)]/g, (u) => `<a href="${u}" target="_blank" rel="noopener noreferrer">${u}</a>`);
  const out = [];
  let list = null;
  for (const line of String(text ?? '').split(/\r?\n/)) {
    const m = /^\s*[-*•]\s+(.*)$/.exec(line);
    if (m) { if (!list) { list = []; out.push(list); } list.push(inline(m[1])); continue; }
    list = null;
    if (line.trim()) out.push(`<p>${inline(line)}</p>`);
  }
  return out.map((x) => (Array.isArray(x) ? `<ul>${x.map((li) => `<li>${li}</li>`).join('')}</ul>` : x)).join('');
}

function briefSection(n) {
  const sec = el('section', { class: 'psec', 'aria-label': 'Brief' });
  const head = el('div', { class: 'psec-head' }, el('h2', { class: 'lbl' }, 'Brief'), el('span', { class: 'sp' }));
  sec.append(head);
  if (briefEditing) {
    const ta = el('textarea', { class: 'textarea', rows: '6', 'aria-label': 'Brief', placeholder: 'What needs doing, and any instructions. "- " starts a bullet; **bold**.' });
    ta.value = n.brief ?? '';
    const save = () => { briefEditing = false; const v = ta.value.trim(); if (v !== (n.brief ?? '')) A.updateFields(n.id, { brief: v }); else renderPanel(rootEl, n.id); };
    const cancel = () => { briefEditing = false; renderPanel(rootEl, n.id); };
    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cancel(); }
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); save(); }
    });
    sec.append(ta, el('div', { class: 'compose-acts' }, btn('Save', save, { cls: 'sm' }), btn('Cancel', cancel, { cls: 'sm ghost' }), el('span', { class: 'hint' }, 'Ctrl+Enter saves · Esc cancels')));
    requestAnimationFrame(() => { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); });
    return sec;
  }
  if (!editable(n)) {
    if (!String(n.brief ?? '').trim()) { sec.append(el('p', { class: 'meta' }, 'No brief.')); return sec; }
  } else head.append(btn('Edit', () => { briefEditing = true; renderPanel(rootEl, n.id); }, { cls: 'sm ghost', ic: 'edit' }));
  if (!String(n.brief ?? '').trim()) {
    sec.append(el('button', { class: 'brief-empty', type: 'button', onclick: () => { briefEditing = true; renderPanel(rootEl, n.id); } }, 'What needs doing, and any instructions'));
    return sec;
  }
  const lines = String(n.brief).split(/\r?\n/).length;
  const long = lines > 12 || String(n.brief).length > 900;
  const b = el('div', { class: `brief${long && !briefOpen ? ' folded' : ''}`, html: formatBrief(n.brief) });
  sec.append(b);
  if (long) sec.append(btn(briefOpen ? 'Show less' : 'Show all', () => { briefOpen = !briefOpen; renderPanel(rootEl, n.id); }, { cls: 'sm ghost' }));
  return sec;
}

// ---------------------------------------------------------------------------
// children first: tasks as tiles or a list
// ---------------------------------------------------------------------------

/** What sits inside a node, in its manual order. */
const kidsOf = (id) => T.childrenOf(state.idx, id).filter((c) => c.kind !== T.KIND.product);

/** A task's status as shown: its own, or its insides' for one part of its job with tasks inside. */
const shownOf = (c) => T.shownStatus(state.idx, c);

const viewOf = (n) => (prefs.get(`panelView.${n.id}`, 'tiles') === 'list' ? 'list' : 'tiles');

function childrenSection(n) {
  const { idx } = state;
  const prog = T.progress(idx, n.id);
  const mode = viewOf(n);
  const kids = kidsOf(n.id);
  const set = (v) => { prefs.set(`panelView.${n.id}`, v); renderPanel(rootEl, n.id); rootEl.querySelector(`[data-fk="view-${v}"]`)?.focus(); };
  const segBtn = (v, text, ic) => el('button', { type: 'button', 'aria-pressed': String(mode === v), title: text, dataset: { fk: `view-${v}` }, onclick: () => set(v) }, icon(ic, 14), el('span', {}, text));
  const word = n.kind === T.KIND.task ? 'Tasks' : 'In this section';
  const sec = el('section', { class: 'psec kids', 'aria-label': word });
  sec.append(el('div', { class: 'psec-head' },
    el('h2', { class: 'lbl' }, word),
    prog.total ? el('span', { class: 'meta' }, `${prog.done} of ${prog.total} done`) : null,
    el('span', { class: 'sp' }),
    kids.length ? el('div', { class: 'seg', role: 'group', 'aria-label': 'Show as' }, segBtn('tiles', 'Tiles', 'grid'), segBtn('list', 'List', 'list')) : null));

  if (!kids.length) {
    const tpl = n.kind === T.KIND.task && T.isJob(idx, n) && editable(n) ? T.stepsTemplateOf(idx, n.id) : null;
    sec.append(el('div', { class: 'empty' },
      el('span', {}, 'Nothing inside yet.'),
      tpl ? btn(`Add the ${T.nameOf(tpl.from)} tasks`, () => A.applyTemplate(n.id), { cls: 'sm' }) : null));
  } else {
    const holder = mode === 'list' ? el('div', { class: 'steps' }) : tilesOf(n.id);
    if (mode === 'list') listInto(holder, n.id, 0);
    sec.append(holder);
    // Reorder by dragging, as in the Tasks list; Move to… is the touch path.
    enableDrag(holder, {
      onDrop: (dragId, targetId, where) => A.moveNextTo(dragId, targetId, where),
      onDropInto: (dragId, groupId) => A.moveInto(dragId, groupId),
    });
  }
  if (editable(n)) sec.append(addControls(n));
  return sec;
}

/** Tiles: the direct children only, one tile each - a section's tile drills into it. */
function tilesOf(parentId) {
  const grid = el('div', { class: 'kgrid' });
  for (const c of kidsOf(parentId)) grid.append(T.isGroupLike(c) ? sectionTile(c) : kidTile(c));
  return grid;
}

/** The tasks inside a section, through the sections in it: how many are still open. */
function openIn(id) {
  let open = 0;
  for (const c of T.childrenOf(state.idx, id)) {
    if (c.kind === T.KIND.task) open += S.isOpen(shownOf(c)) ? 1 : 0;
    else if (c.kind === T.KIND.group) open += openIn(c.id);
  }
  return open;
}

/** A section as a tile: its name and how many are open; opening it drills in, and things drag into it. */
function sectionTile(g) {
  const name = T.nameOf(g);
  const open = openIn(g.id);
  const prog = T.progress(state.idx, g.id);
  const a = el('article', {
    class: `ktile section${prog.total && !open ? ' finished' : ''}`,
    dataset: { id: g.id, dropInto: g.id }, draggable: canDrag() ? 'true' : null,
  },
  el('button', { class: 'open-link', type: 'button', dataset: { fk: `open-${g.id}` }, 'aria-label': `Open the section ${name}`, title: name, onclick: () => openTask(g.id) }),
  el('div', { class: 'ktile-top' },
    el('span', { class: 'ktile-ic', 'aria-hidden': 'true' }, icon('folder', 16)),
    el('div', { class: 'ktile-title' }, name),
    iconBtn('more', `${name} actions`, (e) => { e.stopPropagation(); sectionMenu(e.currentTarget, g); }, 'sm')),
  el('div', { class: 'ktile-foot' },
    el('span', { class: 'meta' }, prog.total ? (open ? `${open} open` : 'All done') : 'Empty'),
    prog.total ? el('span', { class: 'meta' }, `${prog.done}/${prog.total}`) : null,
    TU.figure(times, g.id)));
  return withMenu(a, (at) => sectionMenu(a.querySelector('.ktile-top .ib') ?? a, g, { at }));
}

/** A child task as a tile: the check control, the name, and the facts that matter. */
function kidTile(c) {
  const name = T.nameOf(c);
  const shown = shownOf(c);
  const prog = T.progress(state.idx, c.id);
  const sub = subtext(c);
  // The pill only when the status says something the tile does not already:
  // a cancelled one's subtext says "Cancelled 4 Nov · why".
  const facts = [
    !['todo', 'done', 'cancelled'].includes(shown) ? pill(shown, derived(c) || !editable(c) ? {} : { onClick: (e) => { e.stopPropagation(); statusMenu(e.currentTarget, c); } }) : null,
    prog.total ? el('span', { class: 'meta' }, `${prog.done}/${prog.total}`) : null,
    TU.figure(times, c.id),
    whoBadge(c.assignee),
  ].filter(Boolean);
  const a = el('article', {
    class: `ktile${S.isOpen(shown) ? '' : ' finished'}${shown === 'cancelled' ? ' struck' : ''}`,
    dataset: { id: c.id }, draggable: canDrag() ? 'true' : null,
  },
  el('button', { class: 'open-link', type: 'button', dataset: { fk: `open-${c.id}` }, 'aria-label': `Open ${name}`, title: name, onclick: () => openTask(c.id) }),
  el('div', { class: 'ktile-top' },
    checkBox(c),
    el('div', { class: 'ktile-title' }, name),
    iconBtn('more', `More actions for ${name}`, (e) => { e.stopPropagation(); taskMenu(e.currentTarget, c); }, 'sm')),
  sub ? el('div', { class: `ktile-sub ${sub.cls}`.trim() }, sub.text) : null,
  facts.length ? el('div', { class: 'ktile-foot' }, ...facts) : null);
  return withMenu(a, (at) => taskMenu(a.querySelector('.ktile-top .ib') ?? a, c, { at }));
}

/** The list: the whole tree, one row each, the tasks inside tasks nested in place and sections as headings. */
function listInto(list, pid, depth) {
  for (const c of kidsOf(pid)) {
    const name = T.nameOf(c);
    if (c.kind === T.KIND.task) {
      const p = T.progress(state.idx, c.id);
      const shown = shownOf(c);
      const inside = p.total > 0;
      const r = el('div', { class: `srow${shown === 'cancelled' ? ' muted' : ''}`, style: { '--depth': depth }, dataset: { id: c.id }, draggable: canDrag() ? 'true' : null },
        checkBox(c),
        el('span', { class: 'srow-main' },
          c.assignee ? face(c.assignee) : null,
          el('button', { class: `srow-label${inside ? ' parent' : ''}${S.isOpen(shown) ? '' : ' done'}`, type: 'button', onclick: () => openTask(c.id), dataset: { fk: `open-${c.id}` } }, name)),
        el('span', { class: 'srow-end' },
          TU.figure(times, c.id),
          inside ? el('span', { class: 'meta' }, `${p.done}/${p.total}`) : null,
          shown !== 'todo' && shown !== 'done' ? pill(shown, derived(c) || !editable(c) ? {} : { onClick: (e) => statusMenu(e.currentTarget, c) }) : null,
          iconBtn('more', `More actions for ${name}`, (e) => taskMenu(e.currentTarget, c), 'sm')));
      list.append(withMenu(r, (at) => taskMenu(r.querySelector('.srow-end .ib:last-child') ?? r, c, { at })));
      if (T.childrenOf(state.idx, c.id).length) listInto(list, c.id, depth + 1);
    } else if (c.kind === T.KIND.group) {
      const r = el('div', { class: 'srow section', style: { '--depth': depth }, dataset: { id: c.id, dropInto: c.id }, draggable: canDrag() ? 'true' : null },
        el('span', { class: 'srow-ic' }, icon('folder', 16)),
        el('button', { class: 'srow-label', type: 'button', onclick: () => openTask(c.id), dataset: { fk: `open-${c.id}` } }, name),
        el('span', { class: 'srow-end' }, iconBtn('more', `${name} actions`, (e) => sectionMenu(e.currentTarget, c), 'sm')));
      list.append(withMenu(r, (at) => sectionMenu(r.querySelector('.srow-end .ib') ?? r, c, { at })));
      listInto(list, c.id, depth + 1);
    }
  }
}

/**
 * One box: "Add a task", typed straight in. Enter adds it and the box keeps
 * focus for the next (data-keep: renderPanel puts it back after the redraw
 * the write brings). Inside a job a new task has nobody on it - part of the
 * job, until someone is assigned. "Section" adds a heading.
 */
function addControls(n) {
  const input = el('input', { class: 'input', type: 'text', placeholder: 'Add a task', 'aria-label': 'Add a task', maxlength: '200', dataset: { keep: `add-${n.id}` } });
  // Cleared before the write: the redraw it brings may come at once, and the
  // box it puts back must be empty, ready for the next task.
  const add = () => {
    const v = input.value.trim();
    if (!v) return;
    input.value = '';
    // Refused: the name goes back in the box (the one on screen now, after
    // any redraw), unless something else has been typed there since.
    const putBack = () => {
      const box = rootEl.querySelector(`[data-keep="add-${n.id}"]`);
      if (box && !box.value) box.value = v;
    };
    A.createTask({ title: v, parentId: n.id, useTemplate: false, onFail: putBack });
    requestAnimationFrame(() => rootEl.querySelector('.kids .add-line .input')?.focus());
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); add(); }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); input.value = ''; input.blur(); }
  });
  const sections = n.kind === T.KIND.task || T.isSection(state.idx, n);
  return el('div', { class: 'add-wrap' },
    el('div', { class: 'add-line' }, input, btn('Add', add, { cls: 'sm' })),
    sections ? el('div', { class: 'row' },
      btn('Section', async () => {
        const name = await promptDialog({ title: 'New section', label: 'Name', ok: 'Add', placeholder: 'e.g. Laser', body: 'A heading inside the job, to group its tasks.' });
        if (name) A.createGroup({ name, parentId: n.id });
      }, { cls: 'sm ghost', ic: 'folderPlus', title: 'A heading to group tasks' })) : null);
}

function sectionMenu(anchor, g, { at = null } = {}) {
  const can = editable(g);
  menu(anchor, [
    { label: 'Open', icon: 'open', onSelect: () => openTask(g.id) },
    can ? { label: 'Rename', icon: 'edit', onSelect: () => A.rename(g.id) } : null,
    lead() ? { label: 'Move to…', icon: 'move', onSelect: async () => (await import('./pickers.js')).moveDialog(g.id) } : null,
    lead() ? 'sep' : null,
    lead() ? { label: 'Delete…', icon: 'trash', danger: true, onSelect: async () => { const out = openId === g.id ? leaveTo(g) : null; if (await A.remove(g.id)) out?.(); } } : null,
  ], { label: `${T.nameOf(g)} actions`, at });
}

// ---------------------------------------------------------------------------
// folders
// ---------------------------------------------------------------------------

function foldersSection(n) {
  const sec = el('section', { class: 'psec', 'aria-label': 'Folders' });
  sec.append(el('div', { class: 'psec-head' }, el('h2', { class: 'lbl' }, 'Folders')));
  const folders = Array.isArray(n.folders) ? n.folders : [];
  const can = editable(n);
  if (!can && !folders.length) { sec.append(el('p', { class: 'meta' }, 'No folders linked.')); return sec; }
  for (const f of folders) {
    sec.append(el('div', { class: 'fold' },
      icon('folder', 16),
      f.label ? el('span', { class: 'fold-label' }, f.label) : null,
      el('span', { class: 'fold-path', title: displayPath(f.path) }, el('bdi', {}, isPhone() ? shortPath(f.path, 3) : displayPath(f.path))),
      btn(isPhone() ? 'Copy' : 'Copy path', () => copyPath(f.path), { cls: 'sm', ic: 'copy', title: 'Copies the full path for this PC: paste it into the File Explorer address bar' }),
      !can ? null : iconBtn('more', `${leafName(f.path)} actions`, (e) => menu(e.currentTarget, [
        { label: f.label ? 'Change label' : 'Add a label', icon: 'edit', onSelect: async () => {
          const v = await promptDialog({ title: 'Label', value: f.label ?? '', placeholder: 'GA, Laser, Vessel files', required: false });
          if (v !== null) A.updateFields(n.id, { folders: folders.map((x) => (x === f ? { ...x, label: v } : x)) });
        } },
        { label: 'Remove link', icon: 'trash', danger: true, onSelect: () => A.updateFields(n.id, { folders: folders.filter((x) => x !== f) }, { message: 'Folder link removed', undo: true }) },
      ]), 'sm')));
  }
  if (!can) return sec;
  const err = el('div', { class: 'form-err', role: 'alert' });
  const input = el('input', { class: 'input', type: 'text', placeholder: 'Paste a folder path', 'aria-label': 'Paste a folder path', spellcheck: 'false' });
  const add = (raw) => {
    const r = normaliseFolder(raw ?? input.value);
    if (r.error) { err.textContent = r.error; return; }
    err.textContent = '';
    if (folders.some((f) => f.path.toLowerCase() === r.path.toLowerCase())) { err.textContent = 'That folder is linked already.'; return; }
    if (learnPrefix(r.prefix)) toast('This PC\'s Stella Systems location learnt: Copy path now gives the full path here.');
    input.value = '';
    A.updateFields(n.id, { folders: [...folders, { path: r.path, label: '' }] });
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); add(); }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); input.value = ''; err.textContent = ''; input.blur(); }
  });
  sec.append(el('div', { class: 'add-line' }, input, btn('Add', () => add(), { cls: 'sm' })), err);

  if (canDrag()) {
    const zone = el('div', { class: 'drop-zone' }, 'Or drag a folder here from File Explorer');
    const note = el('div', { class: 'drop-note', role: 'status' });
    zone.addEventListener('dragover', (e) => { if ([...(e.dataTransfer?.items ?? [])].some((i) => i.kind === 'file')) { e.preventDefault(); zone.classList.add('over'); } });
    zone.addEventListener('dragleave', () => zone.classList.remove('over'));
    zone.addEventListener('drop', (e) => {
      e.preventDefault();
      zone.classList.remove('over');
      // Ask for the handles NOW, inside the drop event: the browser empties a
      // drop's items as soon as this handler returns. Loading the folder
      // module first, behind an await, is why every drop from Explorer came
      // through as "Nothing usable" (owner's live test, 2026-11-04).
      const pending = SF.supported() ? SF.droppedHandles(e) : null;
      placeDropped(pending, n.id, note);
    });
    sec.append(zone, note);
  }
  return sec;
}

/**
 * Link what was dropped, once the Stella Systems folder is readable. When this
 * PC has not connected it, or the browser wants a fresh OK (after a restart),
 * say so and offer the one button that fixes it - asking needs a click, which
 * a drop is not - then place the folders that were dropped.
 */
async function placeDropped(pending, id, note) {
  const say = (msg, { action = null, warn = true } = {}) => {
    note.textContent = '';
    note.classList.toggle('warn', warn);
    if (msg) note.append(el('span', {}, msg));
    if (action) note.append(action);
  };
  if (!pending) { say('This browser cannot place a dropped folder. Use Edge or Chrome, or paste the path.'); return; }
  let handles = [];
  try { handles = (await pending).filter(Boolean); } catch { handles = []; }
  if (!handles.length) { say('No folder came through with that drop. Drag the folder itself from File Explorer, or paste its path.'); return; }

  const place = async (root) => {
    const folders = Array.isArray(node(id)?.folders) ? node(id).folders : [];
    const added = [];
    const problems = [];
    for (const h of handles) {
      let p = null;
      try { p = await SF.pathWithin(root, h); } catch { p = null; }
      if (p !== null && h.kind === 'file') p = p.split('/').slice(0, -1).join('/');   // a file: link the folder it is in
      if (p === null) { problems.push(`${h.name} is not inside Stella Systems.`); continue; }
      if (!p) { problems.push('That is the Stella Systems folder itself. Drop a folder inside it.'); continue; }
      if (![...folders, ...added].some((f) => f.path.toLowerCase() === p.toLowerCase())) added.push({ path: p, label: '' });
      else problems.push(`${leafName(p)} is linked already.`);
    }
    say(problems.join(' '));
    if (added.length) A.updateFields(id, { folders: [...folders, ...added] }, { message: added.length === 1 ? `Linked ${leafName(added[0].path)}` : `Linked ${added.length} folders`, undo: true });
  };

  const { handle: root, state: st } = await SF.rootState();
  if (st === 'granted') { await place(root); return; }
  if (st === 'none') {
    say('This PC\'s Stella Systems folder is not connected yet, so a dropped folder cannot be placed. Connect it once and the drop goes through.', {
      warn: false,
      action: btn('Connect Stella Systems folder', async () => {
        try { await place(await SF.chooseRoot()); }
        catch (e) { if (e?.name !== 'AbortError') say(e?.message ?? 'That folder could not be connected.'); }
      }, { cls: 'sm' }),
    });
    return;
  }
  say('The browser needs your OK to read the Stella Systems folder again.', {
    warn: false,
    action: btn('Allow access', async () => {
      let ok = false;
      try { ok = await SF.allowRoot(root); } catch { ok = false; }
      if (ok) await place(root);
      else say('Access was not allowed, so the folder cannot be placed. Paste its path instead.');
    }, { cls: 'sm' }),
  });
}

async function copyPath(rel) {
  const full = fullPath(rel);
  const text = full ?? `Stella Systems\\${rel.split('/').join('\\')}`;
  try {
    await navigator.clipboard.writeText(text);
    toast(full ? 'Copied: paste it into the File Explorer address bar' : 'Copied the path inside Stella Systems. Paste a full path once (or set it under the cog) so Copy path gives the whole path on this PC.');
  } catch {
    toast(`Could not reach the clipboard. The path is: ${text}`, { warn: true, ms: 12000 });
  }
}

// ---------------------------------------------------------------------------
// updates
// ---------------------------------------------------------------------------

/** A step or a section has no timeline: stop listening for one. */
function stopTimeline() {
  timeline.unsub?.();
  Object.assign(timeline, { id: null, list: [], more: false, limit: 20, unsub: null, loaded: false });
  jobNotes.unsub?.();
  Object.assign(jobNotes, { id: null, list: [], unsub: null });
}

// ---------------------------------------------------------------------------
// from the Log: the notes linked to this job (their side of the link)
// ---------------------------------------------------------------------------

const jobNotes = { id: null, list: [], unsub: null };

function watchJobNotes(id) {
  if (jobNotes.id === id && jobNotes.unsub) return;
  jobNotes.unsub?.();
  Object.assign(jobNotes, { id, list: [] });
  jobNotes.unsub = Store.watchJobNotes(id, (list) => {
    jobNotes.list = list ?? [];
    drawJobNotes();
  });
}

function drawJobNotes() {
  const host = rootEl?.querySelector('.from-log');
  if (!host) return;
  host.textContent = '';
  host.hidden = !jobNotes.list.length;
  if (!jobNotes.list.length) return;
  host.append(el('div', { class: 'psec-head' }, el('h2', { class: 'lbl' }, 'From the Log')), jobNotesList(jobNotes.list));
}

function fromLogSection() {
  const sec = el('section', { class: 'psec from-log', 'aria-label': 'From the Log', hidden: true });
  queueMicrotask(drawJobNotes);
  return sec;
}

function watchTimeline(id) {
  if (timeline.id === id && timeline.unsub) return;
  timeline.unsub?.();
  Object.assign(timeline, { id, list: [], more: false, limit: 20, loaded: false });
  timeline.unsub = Store.watchUpdates(id, timeline.limit, (list, more) => {
    Object.assign(timeline, { list, more, loaded: true });
    drawTimeline();
  });
}

function drawTimeline() {
  const host = rootEl?.querySelector('.timeline');
  if (!host) return;
  host.textContent = '';
  if (!timeline.loaded) { host.append(el('div', { class: 'meta', 'aria-busy': 'true' }, 'Loading updates…')); return; }
  if (!timeline.list.length) { host.append(el('p', { class: 'meta', style: { padding: '8px 0' } }, 'Post the first update.')); return; }
  for (const u of timeline.list) {
    // An assignment names the person as this reader knows them ("You").
    const assignText = u.kind === 'assign' && u.to !== undefined ? (u.to ? `To ${personName(u.to)}` : 'Unassigned') : null;
    host.append(el('div', { class: `ev ${u.kind}` },
      face(u.by),
      el('div', { style: { 'min-width': '0' } },
        el('div', { class: 'ev-head' }, el('span', { class: 'ev-who' }, personName(u.by)), el('span', { class: 'meta' }, `${S.eventLabel(u)} · ${whenLabel(u.at)}`)),
        assignText ?? u.text ? el('div', { class: 'ev-text' }, assignText ?? u.text) : null,
        thumbRow(u.photos, { caption: `${personName(u.by)}, ${whenLabel(u.at)}` }))));
  }
  if (timeline.more) {
    host.append(btn('Older', () => {
      timeline.limit += 20;
      const id = timeline.id;
      timeline.unsub?.();
      timeline.unsub = Store.watchUpdates(id, timeline.limit, (list, more) => { Object.assign(timeline, { list, more, loaded: true }); drawTimeline(); });
    }, { cls: 'sm ghost' }));
  }
}

/**
 * What is being written in the update box, and its photos, kept per task
 * across redraws: the live query redraws the panel on every write, and a
 * photo being prepared, or words typed before a tap on Add photos, must not
 * vanish with it.
 */
const compose = { id: null, text: '', tray: null };

function updatesSection(n) {
  const sec = el('section', { class: 'psec', 'aria-label': 'Updates' });
  sec.append(el('div', { class: 'psec-head' }, el('h2', { class: 'lbl' }, 'Updates')));
  if (compose.id !== n.id) Object.assign(compose, { id: n.id, text: '', tray: photoTray({ max: 8 }) });
  const tray = compose.tray;
  const ta = el('textarea', { class: 'textarea compose-input', rows: '2', placeholder: n.status === 'todo' && A.canWrite(n) ? 'Post an update (it starts the task)…' : 'Post an update…', 'aria-label': 'Post an update' });
  ta.value = compose.text;
  ta.addEventListener('input', () => { compose.text = ta.value; });
  const post = () => {
    if (tray.busy()) { toast('A photo is still being prepared. A moment.', { warn: true }); return; }
    const said = ta.value;
    // Refused: the words go back in the box (the photos have to be added again).
    const onFail = () => { if (compose.id === n.id && !compose.text) { compose.text = said; const box = rootEl?.querySelector('.compose-input'); if (box && !box.value) box.value = said; } };
    if (A.postUpdate(n.id, ta.value, tray.ready(), { onFail })) { ta.value = ''; compose.text = ''; tray.clear(); ta.blur(); }
  };
  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); post(); }
    if (e.key === 'Escape' && !ta.value) { e.preventDefault(); e.stopPropagation(); ta.blur(); }
  });
  const box = el('div', { class: 'compose' }, ta, tray.el, el('div', { class: 'compose-acts' }, btn('Post', post, { cls: 'sm' }), tray.controls, isPhone() ? null : el('span', { class: 'hint' }, 'Ctrl+Enter posts')));
  acceptPhotos(box, tray);
  sec.append(box);
  const tl = el('div', { class: 'timeline', 'aria-live': 'polite' });
  sec.append(tl);
  queueMicrotask(drawTimeline);
  return sec;
}

function footer(n) {
  return el('div', { class: 'meta', style: { 'white-space': 'normal', display: 'flex', gap: '8px', 'flex-wrap': 'wrap', 'align-items': 'center' } },
    `Created ${whenLabel(n.createdAt)}${n.createdBy ? ` by ${personName(n.createdBy)}` : ''} · last activity ${ageLabel(n.lastActivityAt)} ago`,
    n.backlogIgnored && lead() ? btn('Hidden from the Backlog · show it again', () => A.setBacklogIgnored(n.id, false), { cls: 'sm ghost' }) : null);
}

/** Phone: the primary action and Post update pinned at the bottom. */
function dock(n) {
  if (!isPhone()) return el('div', { class: 'panel-dock', hidden: true });
  const focusCompose = () => { const ta = rootEl.querySelector('.compose-input'); ta?.scrollIntoView({ block: 'center' }); ta?.focus(); };
  // Part of its job: ticked Done by whoever may edit the job, never submitted.
  const closes = state.role === 'lead' || light(n);
  const primary = !A.canWrite(n) || derived(n) ? null : {
    todo: ['Start', () => A.start(n.id)],
    in_progress: closes ? ['Mark done', () => A.setStatus(n.id, 'done')] : ['Submit for check', () => A.setStatus(n.id, 'check')],
    check: state.role === 'lead' ? ['Approve', () => A.setStatus(n.id, 'done')]
      : S.canTakeBack(n, state.me) ? ['Take back', () => A.takeBack(n.id), 'secondary'] : null,
    fix: ['Submit for check', () => A.setStatus(n.id, 'check')],
    waiting: ['Stop waiting', () => A.setStatus(n.id, n.waiting?.prevStatus && n.waiting.prevStatus !== 'waiting' ? n.waiting.prevStatus : 'todo')],
  }[n.status];
  return el('div', { class: 'panel-dock' },
    btn('Post update', focusCompose),
    primary ? btn(primary[0], primary[1], { cls: n.status === 'waiting' || primary[2] === 'secondary' ? '' : 'primary' }) : null);
}

/** A person's initials, from their name (people/{email}), else their address. */
function face(email) {
  return avatar(realName(email) || email, personName(email));
}
