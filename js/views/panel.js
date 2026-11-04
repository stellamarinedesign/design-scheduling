// views/panel.js — the task panel (Task panel brief + combined steps,
// 2026-11-04). A 560px panel beside the list when wide, sliding over it at
// half-screen, a full-screen sheet on a phone. Clicking a task opens it; no
// modal in front of anything.
//
// Top: the group path · Open as page · ⋯ · close. The title, edited in place.
// Properties: status (one tap), assignee, priority, due, revision; Blocked by
// and Blocks chips. Then the one context action — Approve (the one Upsdell Red
// button) and Send back on work waiting for check; the send-back comment
// highlighted on a job that came back. Then Brief, Steps (ticks, sub-steps
// and real subtasks in one list), Folders, and the Updates timeline.
//
// Enter saves a field; Esc cancels it. A field being edited is never redrawn
// under the cursor (app.js asks `panelEditing()` first).

import { el, icon, iconBtn, btn, pill, dot, avatar, menu, toast, isPhone, canDrag } from '../ui.js';
import { state, node, personName } from '../state.js';
import * as T from '../tree.js';
import * as S from '../status.js';
import * as A from '../actions.js';
import { Store } from '../store.js';
import { whenLabel, dayLabel, daysUntil, ageLabel } from '../dates.js';
import { normaliseFolder, learnPrefix, fullPath, getPrefix, displayPath, leafName } from '../folders.js';
import { statusMenu } from './tile.js';
import { go, openTask, closePanel, routeHref } from '../router.js';
import { promptDialog } from '../dialog.js';
import { shortPath } from '../paths.js';

let rootEl = null;
let openId = null;
let stale = false;
let briefEditing = false;
let briefOpen = false;
const timeline = { id: null, list: [], more: false, limit: 20, unsub: null, loaded: false };

/** Is a field in the panel being edited right now? */
export function panelEditing() {
  const a = document.activeElement;
  const busy = rootEl && rootEl.contains(a) && a.matches('textarea, input:not([type=checkbox]):not([type=date])');
  if (busy) stale = true;
  return busy;
}

export function renderPanel(root, id, { fresh = false } = {}) {
  rootEl = root;
  stale = false;
  const n = node(id);
  if (fresh) { briefEditing = false; briefOpen = false; }
  if (!n) {
    if (!state.ready) { root.textContent = ''; root.append(bar(null), el('div', { class: 'panel-body', 'aria-busy': 'true' }, el('div', { class: 'skel', style: { 'min-height': '60px' } }), el('div', { class: 'skel' }))); return; }
    root.textContent = '';
    root.append(bar(null), el('div', { class: 'panel-body' }, el('div', { class: 'state-msg' },
      el('h2', { class: 'h2' }, 'Not here any more'),
      el('p', {}, 'It was archived, deleted, or moved out of reach. The archive keeps what was archived.'),
      el('div', {}, btn('Open the archive', () => go('/archive'))))));
    return;
  }
  if (T.isGroupLike(n)) { go(`/tasks/${n.id}`); return; }
  if (n.kind === T.KIND.step) { openTask(T.jobOf(state.idx, n.id)?.id ?? n.parentId); return; }

  const keepScroll = !fresh && openId === id ? root.querySelector('.panel-body')?.scrollTop ?? 0 : 0;
  openId = id;
  watchTimeline(id);
  root.textContent = '';
  const body = el('div', { class: 'panel-body' });
  body.append(top(n), briefSection(n), stepsSection(n), foldersSection(n), updatesSection(n), footer(n));
  root.append(bar(n), body, dock(n));
  body.scrollTop = keepScroll;
  // Focus moves to the panel, not into the title: an open is for reading, and
  // a focused field would put the title in edit mode (and the keyboard up on
  // a phone). Tab reaches the title next.
  if (fresh) { root.tabIndex = -1; root.focus({ preventScroll: true }); }
  root.onfocusout = () => setTimeout(() => {
    if (stale && !panelEditing() && openId === id) renderPanel(root, id);
  }, 0);
}

// ---------------------------------------------------------------------------
// the bar along the top
// ---------------------------------------------------------------------------

function crumbs(n) {
  const chain = n ? T.ancestorChain(state.idx, n.id) : [];
  return el('nav', { class: 'crumbs', 'aria-label': 'Where it is' },
    chain.length ? chain.flatMap((a, i) => [i ? el('span', { 'aria-hidden': 'true' }, '›') : null,
      el('a', { href: routeHref(`/tasks/${a.id}`) }, T.nameOf(a))]) : el('span', {}, n ? 'Not in a category' : ''));
}

function bar(n) {
  // On a phone the sheet's bar keeps the status and title in sight while the
  // rest scrolls (Task panel brief); the path moves into the body.
  if (isPhone()) {
    return el('div', { class: 'panel-bar' },
      iconBtn('back', 'Close', closePanel),
      n ? pill(n.status, { onClick: (e) => statusMenu(e.currentTarget, n) }) : null,
      el('span', { class: 'bar-title', 'aria-hidden': 'true' }, n?.title ?? ''),
      n ? iconBtn('more', 'More actions', (e) => moreMenu(e.currentTarget, n)) : null);
  }
  return el('div', { class: 'panel-bar' },
    crumbs(n),
    n ? btn('Open as page', () => go(`/tasks/${n.id}`), { cls: 'ghost sm', title: 'Its tasks and sections as tiles or a list' }) : null,
    n ? iconBtn('more', 'More actions', (e) => moreMenu(e.currentTarget, n)) : null,
    iconBtn('close', 'Close (Esc)', closePanel));
}

function moreMenu(anchor, n) {
  const job = T.isJob(state.idx, n);
  menu(anchor, [
    { label: 'Move to…', icon: 'move', onSelect: async () => (await import('./pickers.js')).moveDialog(n.id) },
    !job ? { label: 'Make it a step', icon: 'tasks', onSelect: () => A.demoteTask(n.id) } : null,
    job || T.hasTaskChildren(state.idx, n.id) ? (n.backlogIgnored
      ? { label: 'Show in the Backlog again', icon: 'restore', onSelect: () => A.setBacklogIgnored(n.id, false) }
      : { label: 'Hide from the Backlog', icon: 'hide', onSelect: () => A.setBacklogIgnored(n.id, true) }) : null,
    'sep',
    { label: 'Archive', icon: 'archive', onSelect: () => { A.archive(n.id); closePanel(); } },
    { label: 'Delete…', icon: 'trash', danger: true, onSelect: async () => { if (await A.remove(n.id)) closePanel(); } },
  ], { label: 'Task actions' });
}

// ---------------------------------------------------------------------------
// title, properties, the context action
// ---------------------------------------------------------------------------

function top(n) {
  const wrap = el('div', { class: 'panel-top' });
  if (isPhone()) wrap.append(el('div', { class: 'row' }, crumbs(n), el('span', { class: 'sp' }), btn('Open as page', () => go(`/tasks/${n.id}`), { cls: 'ghost sm' })));
  const title = el('textarea', { class: 'title-edit', rows: '1', 'aria-label': 'Title', spellcheck: 'true', maxlength: '300' });
  title.value = n.title;
  const fit = () => { title.style.height = 'auto'; title.style.height = `${Math.min(title.scrollHeight, 3 * 1.3 * 19 + 8)}px`; };
  requestAnimationFrame(fit);
  title.addEventListener('input', fit);
  title.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); title.blur(); }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); title.value = n.title; title.blur(); }
  });
  title.addEventListener('blur', () => {
    const v = title.value.replace(/\s+/g, ' ').trim();
    if (!v) { title.value = n.title; return; }
    if (v !== n.title) A.updateFields(n.id, { title: v });
  });
  wrap.append(title);

  const due = daysUntil(n.due);
  const dueInput = el('input', { type: 'date', class: `pv-input${due !== null && due <= 2 && S.isOpen(n.status) ? ' warn-text' : ''}`, 'aria-label': 'Due date', value: n.due ?? '' });
  dueInput.addEventListener('change', () => A.updateFields(n.id, { due: dueInput.value || null }));
  const rev = el('input', { type: 'text', class: 'pv-input mono', 'aria-label': 'Revision', placeholder: 'None', value: n.revision ?? '', maxlength: '40' });
  rev.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); rev.blur(); }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); rev.value = n.revision ?? ''; rev.blur(); }
  });
  rev.addEventListener('blur', () => { const v = rev.value.trim(); if (v !== (n.revision ?? '')) A.updateFields(n.id, { revision: v || null }); });

  const prop = (label, ...v) => el('div', { class: 'prop' }, el('span', { class: 'lbl' }, label), el('div', { class: 'pv' }, ...v));
  wrap.append(el('div', { class: 'props' },
    prop('Status', pill(n.status, { onClick: (e) => statusMenu(e.currentTarget, n) })),
    prop('Assignee', el('button', { class: 'pv-btn', type: 'button', 'aria-haspopup': 'menu', onclick: (e) => assigneeMenu(e.currentTarget, n) },
      n.assignee ? face(n.assignee) : null, el('span', { class: n.assignee ? '' : 'pv-muted' }, personName(n.assignee)))),
    prop('Priority', el('button', { class: 'pv-btn', type: 'button', 'aria-haspopup': 'menu', onclick: (e) => priorityMenu(e.currentTarget, n) },
      el('span', { class: n.priority === 'high' ? 'warn-text' : n.priority === 'low' ? 'pv-muted' : '' }, { high: 'High', normal: 'Normal', low: 'Low' }[n.priority] ?? 'Normal'))),
    prop('Due', dueInput),
    prop('Revision', rev)));

  const chips = blockChips(n);
  if (chips) wrap.append(chips);
  const act = contextAction(n);
  if (act) wrap.append(act);
  return wrap;
}

function assigneeMenu(anchor, n) {
  const people = [state.me, ...Object.keys(state.people).filter((p) => p !== state.me)];
  menu(anchor, [
    { heading: 'Assign to' },
    ...people.map((p) => ({ label: personName(p), checked: n.assignee === p, onSelect: () => assign(n, p) })),
    { label: 'Unassigned', checked: !n.assignee, onSelect: () => assign(n, null) },
  ], { label: 'Assign to' });
}

function assign(n, who) {
  if ((n.assignee ?? null) === who) return;
  A.updateFields(n.id, { assignee: who });
  A.write({ updates: [{ taskId: n.id, at: new Date().toISOString(), by: state.me, kind: 'assign', text: who ? `Assigned to ${personName(who)}` : 'Unassigned' }] });
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
  const lead = state.role === 'lead';
  const since = (iso) => (iso ? ` · ${whenLabel(iso)}` : '');
  switch (n.status) {
    case 'check':
      return el('div', { class: 'callout check' },
        el('div', { class: 'callout-head' }, `Ready for check${since(n.updatedAt)}`),
        lead ? el('div', { class: 'acts' },
          btn('Approve', () => A.setStatus(n.id, 'done'), { cls: 'primary', ic: 'check' }),
          btn('Send back', () => A.setStatus(n.id, 'fix'))) : el('div', { class: 'meta' }, 'Waiting for the Design lead to check it.'));
    case 'fix':
      return el('div', { class: 'callout fix' },
        el('div', { class: 'callout-head' }, `Sent back${n.checkedBy ? '' : ''}${since(n.updatedAt)}`),
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
      return el('div', { class: 'acts row' },
        btn('Mark done', () => A.setStatus(n.id, 'done'), { cls: 'primary', ic: 'check' }),
        btn('Submit for check', () => A.setStatus(n.id, 'check')),
        btn('Waiting…', () => A.setStatus(n.id, 'waiting'), { cls: 'ghost' }));
    case 'done':
    case 'cancelled':
      return el('div', { class: 'row' },
        el('span', { class: 'meta' }, n.status === 'done'
          ? `Done${n.doneAt ? ` ${whenLabel(n.doneAt)}` : ''}${n.checkedBy ? ` · checked by ${personName(n.checkedBy)}` : ''}`
          : 'Cancelled'),
        el('span', { class: 'sp' }),
        btn('Reopen', () => A.setStatus(n.id, 'in_progress'), { cls: 'sm' }));
    default: return null;
  }
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
  const head = el('div', { class: 'psec-head' }, el('span', { class: 'lbl' }, 'Brief'), el('span', { class: 'sp' }));
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
  head.append(btn('Edit', () => { briefEditing = true; renderPanel(rootEl, n.id); }, { cls: 'sm ghost', ic: 'edit' }));
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
// steps: ticks, sub-steps, subtasks and sections in one list
// ---------------------------------------------------------------------------

export function stepsSection(n) {
  const { idx } = state;
  const prog = T.progress(idx, n.id);
  const sec = el('section', { class: 'psec', 'aria-label': 'Steps' });
  sec.append(el('div', { class: 'psec-head' },
    el('span', { class: 'lbl' }, 'Steps'),
    prog.total ? el('span', { class: 'meta' }, `${prog.done}/${prog.total}`) : null,
    el('span', { class: 'sp' }),
    btn('Task', async () => {
      const t = await promptDialog({ title: 'New task', label: 'Title', ok: 'Add', body: 'A real task: its own status, assignee and updates.' });
      if (t) A.createTask({ title: t, parentId: n.id });
    }, { cls: 'sm ghost', ic: 'plus', title: 'A real subtask, with its own status and updates' })));

  const list = el('div', { class: 'steps' });
  const kids = T.childrenOf(idx, n.id).filter((c) => c.kind !== T.KIND.product);
  if (!kids.length) {
    const tpl = T.stepsTemplateOf(idx, n.id);
    if (tpl && T.isJob(idx, n)) {
      sec.append(el('div', { class: 'empty' }, el('span', {}, `No steps yet.`), btn(`Add the ${T.nameOf(tpl.from)} steps`, () => A.applyTemplate(n.id), { cls: 'sm' })));
    }
  }
  const walk = (pid, depth) => {
    for (const c of T.childrenOf(idx, pid)) {
      if (c.kind === T.KIND.step) {
        const sub = T.childrenOf(idx, c.id).filter((k) => k.kind === T.KIND.step || k.kind === T.KIND.task);
        const parent = sub.length > 0;
        const p = parent ? T.progress(idx, c.id) : null;
        const st = parent ? (T.stepFinished(idx, c) ? 'done' : p.done ? 'doing' : 'todo') : (c.state ?? 'todo');
        list.append(el('div', { class: 'srow', style: { '--depth': depth } },
          el('button', {
            class: `tick ${st}`, type: 'button', disabled: parent,
            'aria-label': parent ? `${c.label}: ${p.done} of ${p.total} done` : `${c.label}: ${S.STEP_LABEL[st]}. Tap for ${S.STEP_LABEL[S.nextStepState(st)]}`,
            onclick: () => A.cycleStep(c.id),
          }, el('i', {}, st === 'done' ? icon('check', 14) : null)),
          el('span', { class: `srow-label ${parent ? 'parent' : ''} ${st}`.trim() }, c.label),
          el('span', { class: 'srow-end' },
            parent ? el('span', { class: 'meta' }, `${p.done} of ${p.total}`) : null,
            !parent && st === 'doing' ? pill('in_progress', { label: 'Doing' }) : null,
            !parent && st === 'na' ? el('span', { class: 'pill na' }, 'N/a') : null,
            iconBtn('more', `${c.label} actions`, (e) => stepMenu(e.currentTarget, c), 'sm'))));
        if (parent) walk(c.id, depth + 1);
      } else if (c.kind === T.KIND.task) {
        list.append(el('div', { class: 'srow', style: { '--depth': depth } },
          face(c.assignee || state.me),
          el('button', { class: 'srow-label task', type: 'button', onclick: () => openTask(c.id), title: 'Open this task' }, c.title),
          el('span', { class: 'srow-end' },
            T.progress(idx, c.id).total ? el('span', { class: 'meta' }, `${T.progress(idx, c.id).done}/${T.progress(idx, c.id).total}`) : null,
            pill(c.status, { onClick: (e) => statusMenu(e.currentTarget, c) }))));
      } else if (c.kind === T.KIND.group) {
        list.append(el('div', { class: 'srow section', style: { '--depth': depth } },
          icon('folder', 16), el('span', { class: 'srow-label' }, c.name),
          el('span', { class: 'srow-end' }, iconBtn('more', `${c.name} actions`, (e) => menu(e.currentTarget, [
            { label: 'Rename', icon: 'edit', onSelect: () => A.rename(c.id) },
            { label: 'Open as page', icon: 'page', onSelect: () => go(`/tasks/${c.id}`) },
            { label: 'Delete…', icon: 'trash', danger: true, onSelect: () => A.remove(c.id) },
          ]), 'sm'))));
        walk(c.id, depth + 1);
      }
    }
  };
  walk(n.id, 0);
  if (list.childNodes.length) sec.append(list);

  const input = el('input', { class: 'input', type: 'text', placeholder: 'Add a step', 'aria-label': 'Add a step', maxlength: '200' });
  const add = () => { const v = input.value.trim(); if (!v) return; A.addStep(n.id, v); input.value = ''; requestAnimationFrame(() => rootEl.querySelector('.add-line .input')?.focus()); };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); add(); }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); input.value = ''; input.blur(); }
  });
  sec.append(el('div', { class: 'add-line' }, input, btn('Add', add, { cls: 'sm' })));
  return sec;
}

function stepMenu(anchor, s) {
  menu(anchor, [
    { heading: 'Step' },
    ...S.STEP_STATES.map((v) => ({ label: S.STEP_LABEL[v], checked: (s.state ?? 'todo') === v, onSelect: () => A.setStepState(s.id, v) })),
    'sep',
    { label: 'Add sub-steps', icon: 'plus', onSelect: async () => {
      const v = await promptDialog({ title: `Sub-steps of ${s.label}`, label: 'One a line', multiline: true, ok: 'Add', placeholder: 'Body\nExtension\nHead' });
      if (v) for (const line of v.split(/\r?\n/).map((x) => x.trim()).filter(Boolean)) A.addStep(s.id, line);
    } },
    { label: 'Make it a task', icon: 'tasks', onSelect: () => A.promoteStep(s.id) },
    { label: 'Rename', icon: 'edit', onSelect: () => A.rename(s.id) },
    { label: 'Delete…', icon: 'trash', danger: true, onSelect: () => A.remove(s.id) },
  ], { label: `${s.label} actions` });
}

// ---------------------------------------------------------------------------
// folders
// ---------------------------------------------------------------------------

function foldersSection(n) {
  const sec = el('section', { class: 'psec', 'aria-label': 'Folders' });
  sec.append(el('div', { class: 'psec-head' }, el('span', { class: 'lbl' }, 'Folders')));
  const folders = Array.isArray(n.folders) ? n.folders : [];
  for (const f of folders) {
    sec.append(el('div', { class: 'fold' },
      icon('folder', 16),
      f.label ? el('span', { class: 'fold-label' }, f.label) : null,
      el('span', { class: 'fold-path', title: displayPath(f.path) }, el('bdi', {}, isPhone() ? shortPath(f.path, 3) : displayPath(f.path))),
      btn(isPhone() ? 'Copy' : 'Copy path', () => copyPath(f.path), { cls: 'sm', ic: 'copy', title: 'Copies the full path for this PC: paste it into the File Explorer address bar' }),
      iconBtn('more', `${leafName(f.path)} actions`, (e) => menu(e.currentTarget, [
        { label: f.label ? 'Change label' : 'Add a label', icon: 'edit', onSelect: async () => {
          const v = await promptDialog({ title: 'Label', value: f.label ?? '', placeholder: 'GA, Laser, Vessel files', required: false });
          if (v !== null) A.updateFields(n.id, { folders: folders.map((x) => (x === f ? { ...x, label: v } : x)) });
        } },
        { label: 'Remove link', icon: 'trash', danger: true, onSelect: () => A.updateFields(n.id, { folders: folders.filter((x) => x !== f) }, { message: 'Folder link removed', undo: true }) },
      ]), 'sm')));
  }
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
    zone.addEventListener('dragover', (e) => { if ([...(e.dataTransfer?.items ?? [])].some((i) => i.kind === 'file')) { e.preventDefault(); zone.classList.add('over'); } });
    zone.addEventListener('dragleave', () => zone.classList.remove('over'));
    zone.addEventListener('drop', (e) => {
      e.preventDefault();
      zone.classList.remove('over');
      dropFolder(e, n, folders, err);
    });
    sec.append(zone);
  }
  return sec;
}

async function dropFolder(e, n, folders, err) {
  const sf = await import('../stella-folder.js');
  // The handles have to be asked for inside the drop event, before any await.
  const pending = sf.droppedHandles(e);
  if (!sf.supported()) { err.textContent = 'This browser cannot place a dropped folder. Use Edge or Chrome, or paste the path.'; return; }
  const handles = (await pending).filter(Boolean);
  if (!handles.length) { err.textContent = 'Nothing usable was dropped. Paste the folder path instead.'; return; }
  let { handle: root, state: st } = await sf.rootState();
  if (st === 'none') { err.textContent = 'Connect this PC\'s Stella Systems folder under the cog first (one-off per PC), or paste the path.'; return; }
  if (st !== 'granted') {
    try { if (!await sf.allowRoot(root)) { err.textContent = 'The browser was not allowed to read Stella Systems. Paste the path instead.'; return; } }
    catch { err.textContent = 'Allow access to Stella Systems under the cog, then drop again.'; return; }
  }
  const added = [];
  for (const h of handles) {
    const p = await sf.pathWithin(root, h);
    if (p === null) { err.textContent = `${h.name} is not inside Stella Systems.`; continue; }
    if (!p) { err.textContent = 'That is the Stella Systems folder itself. Drop a folder inside it.'; continue; }
    if (![...folders, ...added].some((f) => f.path.toLowerCase() === p.toLowerCase())) added.push({ path: p, label: '' });
  }
  if (added.length) { err.textContent = ''; A.updateFields(n.id, { folders: [...folders, ...added] }); }
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
    host.append(el('div', { class: `ev ${u.kind}` },
      face(u.by),
      el('div', { style: { 'min-width': '0' } },
        el('div', { class: 'ev-head' }, el('span', { class: 'ev-who' }, personName(u.by)), el('span', { class: 'meta' }, `${S.eventLabel(u)} · ${whenLabel(u.at)}`)),
        u.text ? el('div', { class: 'ev-text' }, u.text) : null)));
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

function updatesSection(n) {
  const sec = el('section', { class: 'psec', 'aria-label': 'Updates' });
  sec.append(el('div', { class: 'psec-head' }, el('span', { class: 'lbl' }, 'Updates')));
  const ta = el('textarea', { class: 'textarea compose-input', rows: '2', placeholder: n.status === 'todo' ? 'Post an update (it starts the task)…' : 'Post an update…', 'aria-label': 'Post an update' });
  const post = () => {
    if (A.postUpdate(n.id, ta.value)) { ta.value = ''; ta.blur(); }
  };
  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); post(); }
    if (e.key === 'Escape' && !ta.value) { e.preventDefault(); e.stopPropagation(); ta.blur(); }
  });
  sec.append(el('div', { class: 'compose' }, ta, el('div', { class: 'compose-acts' }, btn('Post', post, { cls: 'sm' }), isPhone() ? null : el('span', { class: 'hint' }, 'Ctrl+Enter posts'))));
  const tl = el('div', { class: 'timeline', 'aria-live': 'polite' });
  sec.append(tl);
  queueMicrotask(drawTimeline);
  return sec;
}

function footer(n) {
  return el('div', { class: 'meta', style: { 'white-space': 'normal', display: 'flex', gap: '8px', 'flex-wrap': 'wrap', 'align-items': 'center' } },
    `Created ${whenLabel(n.createdAt)}${n.createdBy ? ` by ${personName(n.createdBy)}` : ''} · last activity ${ageLabel(n.lastActivityAt)} ago`,
    n.backlogIgnored ? btn('Hidden from the Backlog · show it again', () => A.setBacklogIgnored(n.id, false), { cls: 'sm ghost' }) : null);
}

/** Phone: the primary action and Post update pinned at the bottom. */
function dock(n) {
  if (!isPhone()) return el('div', { class: 'panel-dock', hidden: true });
  const focusCompose = () => { const ta = rootEl.querySelector('.compose-input'); ta?.scrollIntoView({ block: 'center' }); ta?.focus(); };
  const primary = {
    todo: ['Start', () => A.start(n.id)],
    in_progress: ['Mark done', () => A.setStatus(n.id, 'done')],
    check: state.role === 'lead' ? ['Approve', () => A.setStatus(n.id, 'done')] : null,
    fix: ['Submit for check', () => A.setStatus(n.id, 'check')],
    waiting: ['Stop waiting', () => A.setStatus(n.id, n.waiting?.prevStatus && n.waiting.prevStatus !== 'waiting' ? n.waiting.prevStatus : 'todo')],
  }[n.status];
  return el('div', { class: 'panel-dock' },
    btn('Post update', focusCompose),
    primary ? btn(primary[0], primary[1], { cls: n.status === 'waiting' ? '' : 'primary' }) : null);
}

export { dot, dayLabel };

/**
 * A person's initials. You are "Me" in local mode, where there is no name to
 * take initials from; with accounts, initials come from the person's name.
 */
function face(email) {
  if (email === state.me) return avatar(state.mode === 'local' ? 'Me' : (state.people[email]?.name ?? email), 'You');
  return avatar(personName(email), personName(email));
}
