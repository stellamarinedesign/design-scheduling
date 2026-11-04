// views/jobs.js — a manager contributor's Jobs tab (PLAN, "Contributors, and
// a 'manager contributor' role", 2026-11-04): a lesser, read-only list of the
// jobs the Design lead has shared, and a sheet for one job.
//
// THE LIST, grouped by the lead's categories by default (a collapsible
// section per category, with its dot, name and count; deeper groups under
// the job's title), or a Full list. Filters: All · In progress · Waiting ·
// Being checked · Done this month - "Being checked" is the outside word for
// Ready for check. A row: status, title, the latest update, the stage (when
// the lead shared it: the current step and a strip, else "Stage not
// shared"), who has it, and how long since anything happened.
//
// THE SHEET (the side panel, a full-screen sheet on a phone): where the job
// stands, its stage step by step, and the thread - the team's updates and
// the managers' notes - with a box to add a note: a Question, an Update from
// customer (with "The customer has cancelled", which gives the lead a
// one-tap Cancel job), or a Request. Nothing here changes the job itself.

import { el, btn, icon, iconBtn, dot, avatar, pill, prefs, isPhone } from '../ui.js';
import { state, node, personName, realName } from '../state.js';
import * as T from '../tree.js';
import * as SH from '../sharing.js';
import * as A from '../actions.js';
import { Store } from '../store.js';
import { ageLabel, whenLabel, dayLabel } from '../dates.js';
import { openTask, closePanel, redraw } from '../router.js';
import { thumbRow } from './photo-ui.js';

let query = '';
const filterOf = () => { const f = prefs.get('jobsFilter', 'all'); return SH.JOB_FILTERS.some((x) => x.key === f) ? f : 'all'; };
const viewOf = () => (prefs.get('jobsView', 'category') === 'list' ? 'list' : 'category');
const folded = () => new Set(prefs.get('jobsFolded', []));

export function renderJobs(root) {
  const inner = el('div', { class: 'view-inner jobs' });
  root.append(inner);
  const filter = filterOf();
  const view = viewOf();
  const counts = state.ready ? SH.filterCounts(state.idx) : {};

  const search = el('input', { class: 'input jobs-search', type: 'search', placeholder: 'Search jobs', 'aria-label': 'Search jobs', value: query, dataset: { fk: 'jobs-search' } });
  search.addEventListener('input', () => { query = search.value; redraw(); });
  const seg = el('div', { class: 'seg', role: 'group', 'aria-label': 'Show the jobs' },
    el('button', { type: 'button', 'aria-pressed': String(view === 'category'), onclick: () => { prefs.set('jobsView', 'category'); redraw(); } }, 'By category'),
    el('button', { type: 'button', 'aria-pressed': String(view === 'list'), onclick: () => { prefs.set('jobsView', 'list'); redraw(); } }, 'Full list'));
  // Nothing shared: no filters to offer, only the heading and the reason.
  if (state.ready && !SH.sharedJobs(state.idx).length) {
    inner.append(el('div', { class: 'view-head jobs-head' }, el('h1', { class: 'h1' }, 'Jobs')),
      el('section', { class: 'welcome' },
        el('h2', { class: 'h2' }, 'Nothing shared yet'),
        el('p', {}, 'The Design lead chooses which jobs show here. When they share one, you see where it stands and can ask about it. The Log is open to you meanwhile.')));
    return;
  }
  inner.append(el('div', { class: 'view-head jobs-head' },
    el('h1', { class: 'h1' }, 'Jobs'),
    el('div', { class: 'filters', role: 'group', 'aria-label': 'Filter the jobs' },
      SH.JOB_FILTERS.map((f) => el('button', {
        class: 'fp', type: 'button', 'aria-pressed': String(f.key === filter),
        onclick: () => { prefs.set('jobsFilter', f.key); redraw(); },
      }, f.label, state.ready ? el('b', {}, String(counts[f.key] ?? 0)) : null))),
    el('span', { class: 'sp' }),
    search,
    seg));

  if (state.error && !state.ready) {
    inner.append(el('div', { class: 'state-msg', role: 'alert' },
      el('h2', { class: 'h2' }, 'The jobs did not load'),
      el('p', {}, String(state.error?.message ?? state.error)),
      el('p', {}, 'If you are offline, they load when the connection is back. Otherwise reload the page.'),
      el('div', {}, btn('Reload', () => location.reload()))));
    return;
  }
  if (!state.ready) {
    inner.append(el('div', { class: 'rows', 'aria-busy': 'true', 'aria-label': 'Loading the jobs' }, [1, 2, 3, 4].map(() => el('div', { class: 'skel mj-skel' }))));
    return;
  }
  const jobs = SH.jobsList(state.idx, { filter, query });
  if (!jobs.length) {
    inner.append(el('div', { class: 'empty' },
      el('span', {}, el('strong', {}, query ? 'No job matches. ' : `Nothing ${SH.JOB_FILTERS.find((f) => f.key === filter).label.toLowerCase()} right now. `),
        query ? 'Try fewer words.' : 'All shows everything shared.'),
      query || filter !== 'all' ? btn('Show all', () => { query = ''; prefs.set('jobsFilter', 'all'); redraw(); }, { cls: 'sm' }) : null));
    return;
  }
  if (view === 'list') {
    inner.append(el('div', { class: 'rows mj-list' }, jobs.map((j) => jobRow(j, T.pathText(state.idx, j.id)))));
    return;
  }
  const shut = folded();
  for (const sec of SH.byCategory(state.idx, jobs)) {
    const key = sec.id ?? 'top';
    const open = !shut.has(key);
    const name = sec.group ? T.nameOf(sec.group) : 'Not in a category';
    const toggle = () => {
      const s = folded();
      if (s.has(key)) s.delete(key); else s.add(key);
      prefs.set('jobsFolded', [...s]);
      redraw();
    };
    inner.append(el('section', { class: 'mj-sec', 'aria-label': name },
      el('h2', { class: 'mj-sec-head' },
        el('button', { type: 'button', class: 'mj-toggle', 'aria-expanded': String(open), onclick: toggle },
          icon(open ? 'chevDown' : 'chevRight', 16),
          sec.group ? dot(T.colourOf(state.idx, sec.group.id)) : dot(null),
          el('span', { class: 'mj-sec-name' }, name),
          el('span', { class: 'meta' }, String(sec.items.length)))),
      open ? el('div', { class: 'rows mj-list' }, sec.items.map((x) => jobRow(x.job, x.sub))) : null));
  }
}

/** The stage, as a strip and a line; or why there is none. */
function stageCell(job) {
  if (job.shareLevel !== 'stage') return el('span', { class: 'mj-stage meta' }, 'Stage not shared');
  const st = SH.stageOf(state.idx, job);
  if (!st) return el('span', { class: 'mj-stage meta' }, 'No steps yet');
  return el('span', { class: 'mj-stage' },
    el('span', { class: 'strip', role: 'img', 'aria-label': `${st.done} of ${st.total} steps done` }, st.strip.slice(0, 14).map((s) => el('i', { class: `s-${s}` }))),
    el('span', { class: 'meta mj-stage-line' }, st.line));
}

function latest(job) {
  const n = job.lastNote;
  if (job.status === 'cancelled') return `Cancelled${job.cancelled?.reason ? `: ${job.cancelled.reason}` : ''}`;
  return n?.text ? `${personName(n.by)}: ${n.text}` : 'No updates yet';
}

function jobRow(job, sub) {
  const st = SH.outsideStatus(job.status);
  const finished = job.status === 'done' || job.status === 'cancelled';
  return el('div', { class: `mj-row${finished ? ' finished' : ''}`, 'aria-current': state.openId === job.id ? 'true' : null },
    el('button', { class: 'open-link', type: 'button', onclick: () => openTask(job.id), 'aria-label': `${job.title}, ${st.label}. Open it` }),
    el('span', { class: 'mj-pill' }, pill(st.pill, { label: st.label })),
    el('div', { class: 'mj-main' },
      el('div', { class: 'mj-title' }, job.title),
      sub ? el('div', { class: 'meta mj-sub' }, sub) : null,
      el('div', { class: 'mj-latest' }, latest(job)),
      job.requestOpen > 0 ? el('div', { class: 'meta mj-asked' }, `${job.requestOpen === 1 ? 'A note' : `${job.requestOpen} notes`} waiting for an answer`) : null),
    stageCell(job),
    el('span', { class: 'mj-who' }, job.assignee ? avatar(realName(job.assignee) || job.assignee, personName(job.assignee)) : null,
      el('span', { class: job.assignee ? '' : 'pv-muted' }, job.assignee ? personName(job.assignee) : 'Nobody yet')),
    el('span', { class: 'meta mj-age', title: 'Since anything last happened' }, ageLabel(job.lastActivityAt)));
}

// ---------------------------------------------------------------------------
// the sheet: one shared job
// ---------------------------------------------------------------------------

const thread = { id: null, list: [], loaded: false, unsub: null, limit: 30, more: false };
/** The note being written, per job, kept across redraws. */
const draft = { id: null, kind: 'question', text: '', cancels: false };

function watchThread(id) {
  if (thread.id === id && thread.unsub) return;
  thread.unsub?.();
  Object.assign(thread, { id, list: [], loaded: false, more: false });
  thread.unsub = Store.watchUpdates(id, thread.limit, (list, more) => {
    Object.assign(thread, { list, more, loaded: true });
    drawThread();
  });
}

let sheetRoot = null;

export function renderJobSheet(root, id, { fresh = false } = {}) {
  sheetRoot = root;
  root.classList.remove('wide');
  root.setAttribute('aria-label', 'Job');
  const job = node(id);
  const keep = !fresh ? root.querySelector('.panel-body')?.scrollTop ?? 0 : 0;
  root.textContent = '';
  const bar = el('div', { class: 'panel-bar' },
    isPhone() ? iconBtn('back', 'Close', closePanel) : null,
    el('span', { class: 'bar-title' }, job ? job.title : 'Job'),
    isPhone() ? null : iconBtn('close', 'Close (Esc)', closePanel));
  if (!job || job.sharedEffective !== true) {
    root.append(bar, el('div', { class: 'panel-body' }, !state.ready
      ? [el('div', { class: 'skel', style: { 'min-height': '60px' } }), el('div', { class: 'skel' })]
      : el('div', { class: 'state-msg' }, el('h2', { class: 'h2' }, 'Not shared any more'), el('p', {}, 'The Design lead has stopped sharing this job, or it was archived.'))));
    return;
  }
  watchThread(id);
  if (draft.id !== id) Object.assign(draft, { id, kind: 'question', text: '', cancels: false });
  const st = SH.outsideStatus(job.status);
  const body = el('div', { class: 'panel-body' },
    el('div', { class: 'panel-top' },
      el('div', { class: 'crumbs' }, T.pathText(state.idx, job.id, { skipMaster: false }) || 'Not in a category'),
      el('h1', { class: 'h1 plain' }, job.title),
      el('div', { class: 'props' },
        pill(st.pill, { label: st.label }),
        prop('Who', job.assignee ? [avatar(realName(job.assignee) || job.assignee, personName(job.assignee)), el('span', {}, personName(job.assignee))] : [el('span', { class: 'pv-muted' }, 'Nobody yet')]),
        job.due ? prop('Due', [el('span', {}, dayLabel(job.due))]) : null,
        job.revision ? prop('Rev', [el('span', { class: 'mono' }, job.revision)]) : null,
        prop('Last activity', [el('span', {}, `${ageLabel(job.lastActivityAt)} ago`)])),
      job.status === 'cancelled' && job.cancelled?.reason ? el('div', { class: 'callout' }, el('div', { class: 'callout-head' }, `Cancelled ${whenLabel(job.cancelled.at)}`), el('div', { class: 'callout-body' }, job.cancelled.reason)) : null),
    stageSection(job),
    noteBox(job),
    el('section', { class: 'psec', 'aria-label': 'Updates' }, el('div', { class: 'psec-head' }, el('h2', { class: 'lbl' }, 'Updates and notes')), el('div', { class: 'timeline', 'aria-live': 'polite' })));
  root.append(bar, body);
  body.scrollTop = keep;
  queueMicrotask(drawThread);
  if (fresh) { root.tabIndex = -1; root.focus({ preventScroll: true }); }
}

const prop = (label, kids) => el('div', { class: 'pc' }, el('span', { class: 'pc-lbl' }, label), el('span', { class: 'pv-static' }, ...kids));

/** The stage, step by step: what the lead shared of it. */
function stageSection(job) {
  const sec = el('section', { class: 'psec', 'aria-label': 'Stage' }, el('div', { class: 'psec-head' }, el('h2', { class: 'lbl' }, 'Stage')));
  if (job.shareLevel !== 'stage') { sec.append(el('p', { class: 'meta wrap' }, 'Stage not shared: the Design lead shares this job\'s status only.')); return sec; }
  const st = SH.stageOf(state.idx, job);
  if (!st) { sec.append(el('p', { class: 'meta wrap' }, 'No steps yet.')); return sec; }
  sec.append(el('div', { class: 'mj-stage big' },
    el('span', { class: 'strip', role: 'img', 'aria-label': `${st.done} of ${st.total} steps done` }, st.strip.map((s) => el('i', { class: `s-${s}` }))),
    el('span', { class: 'meta wrap' }, st.line)));
  const word = { done: 'Done', doing: 'Under way', todo: 'To do', na: 'Not needed' };
  const list = el('ol', { class: 'mj-steps' });
  for (const c of T.childrenOf(state.idx, job.id)) {
    if (c.kind !== T.KIND.step) continue;
    const kids = T.childrenOf(state.idx, c.id).filter((k) => k.kind === T.KIND.step);
    const s = kids.length ? (T.stepFinished(state.idx, c) ? 'done' : T.progress(state.idx, c.id).done ? 'doing' : 'todo') : (c.state ?? 'todo');
    list.append(el('li', { class: `mj-step s-${s}` }, el('span', { class: 'mj-step-mark', 'aria-hidden': 'true' }, s === 'done' ? icon('check', 14) : null), el('span', {}, c.label), el('span', { class: 'meta' }, word[s] ?? '')));
  }
  if (list.childNodes.length) sec.append(list);
  return sec;
}

/** Add a note: a question, an update from the customer, or a request. */
function noteBox(job) {
  const sec = el('section', { class: 'psec', 'aria-label': 'Add a note' }, el('div', { class: 'psec-head' }, el('h2', { class: 'lbl' }, 'Ask or tell the design team')));
  const seg = el('div', { class: 'seg kind-seg', role: 'group', 'aria-label': 'Kind of note' });
  const ta = el('textarea', { class: 'textarea compose-input', rows: '3', maxlength: String(SH.REQUEST_TEXT_MAX), 'aria-label': 'Your note' });
  const cancelLine = el('label', { class: 'check-line' });
  const cancelBox = el('input', { type: 'checkbox' });
  const PLACE = { question: 'What would you like to know?', customer: 'What did the customer say?', request: 'What would you like done?' };
  const draw = () => {
    seg.textContent = '';
    for (const [k, label] of Object.entries(SH.REQUEST_KINDS)) {
      seg.append(el('button', { type: 'button', 'aria-pressed': String(draft.kind === k), onclick: () => { draft.kind = k; draw(); } }, label));
    }
    ta.placeholder = PLACE[draft.kind];
    cancelLine.hidden = draft.kind !== 'customer' || job.status === 'cancelled' || job.status === 'done';
  };
  ta.value = draft.text;
  ta.addEventListener('input', () => { draft.text = ta.value; });
  cancelBox.checked = draft.cancels;
  cancelBox.addEventListener('change', () => { draft.cancels = cancelBox.checked; });
  cancelLine.append(cancelBox, el('span', {}, 'The customer has cancelled this job'));
  draw();
  const send = () => {
    if (A.postRequest(job.id, { kind: draft.kind, text: ta.value, cancels: draft.kind === 'customer' && draft.cancels })) {
      Object.assign(draft, { text: '', cancels: false });
      ta.value = '';
      cancelBox.checked = false;
      ta.blur();
    }
  };
  ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); send(); } });
  sec.append(seg, el('div', { class: 'compose' }, ta, cancelLine,
    el('div', { class: 'compose-acts' }, btn('Send', send, { cls: 'primary sm' }), isPhone() ? null : el('span', { class: 'hint' }, 'Ctrl+Enter sends · the Design lead sees it on Home'))));
  return sec;
}

/**
 * The thread, as a manager reads it: notes and updates in full; the team's
 * own check loop as outside words, without its comments; the rest left out.
 */
const OUTSIDE = {
  submit: () => 'Sent for checking',
  approve: () => 'Done',
  sendback: () => 'Back in progress',
  cancel: () => 'Cancelled',
  reopen: () => 'Reopened',
  create: () => 'Started on the list',
  status: (u) => (u.to ? SH.outsideStatus(u.to).label : 'Status changed'),
};
function drawThread() {
  const host = sheetRoot?.querySelector('.timeline');
  if (!host) return;
  host.textContent = '';
  if (!thread.loaded) { host.append(el('div', { class: 'meta', 'aria-busy': 'true' }, 'Loading…')); return; }
  const shown = thread.list.filter((u) => u.kind === 'request' || u.kind === 'comment' || OUTSIDE[u.kind]);
  if (!shown.length) { host.append(el('p', { class: 'meta', style: { padding: '8px 0' } }, 'Nothing yet. A note you add shows here, with the team\'s replies.')); return; }
  for (const u of shown) {
    const words = u.kind === 'request' ? SH.requestLabel(u) : u.kind === 'comment' ? 'Update' : OUTSIDE[u.kind](u);
    const text = u.kind === 'request' || u.kind === 'comment' ? u.text : u.kind === 'cancel' ? u.text : '';
    host.append(el('div', { class: `ev ${u.kind === 'request' ? 'request' : ''}` },
      avatar(realName(u.by) || u.by, personName(u.by)),
      el('div', { style: { 'min-width': '0' } },
        el('div', { class: 'ev-head' }, el('span', { class: 'ev-who' }, personName(u.by)), el('span', { class: 'meta' }, `${words} · ${whenLabel(u.at)}`)),
        text ? el('div', { class: 'ev-text' }, text) : null,
        thumbRow(u.photos, { caption: `${personName(u.by)}, ${whenLabel(u.at)}` }))));
  }
  if (thread.more) {
    host.append(btn('Older', () => {
      thread.limit += 30;
      const id = thread.id;
      thread.unsub?.();
      thread.unsub = null;
      thread.id = null;
      watchThread(id);
    }, { cls: 'sm ghost' }));
  }
}
