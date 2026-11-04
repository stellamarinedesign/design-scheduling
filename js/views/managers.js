// views/managers.js — the Design lead's side of manager contributors: what
// is shared with them (sharing.js), and what they have asked.
//
//   shareMenu       on a job or a group: as the group above · Not shared ·
//                   Status only · Status + stage
//   shareText       how a node is shared, for the panel's properties row
//   requestsSection Home's "Questions & requests", above Ready for checking,
//                   shown only when there are any (PLAN proposal)
//   requestCallout  the same note on the job itself, in the task panel
//
// A customer's "cancelled" gives a one-tap Cancel job: the job is cancelled
// with the note's words as the reason, the note is answered by it, and the
// toast offers Undo - a status change, like any other.

import { el, btn, menu, isPhone } from '../ui.js';
import { state, personName } from '../state.js';
import * as T from '../tree.js';
import * as S from '../status.js';
import * as SH from '../sharing.js';
import * as A from '../actions.js';
import { ageLabel, whenLabel } from '../dates.js';
import { openTask } from '../router.js';

/** Share a job or a group with managers. */
export function shareMenu(anchor, n, { at = null } = {}) {
  const own = SH.choiceOf(n);
  const above = SH.inherited(state.idx, n.id);
  const items = [{ heading: 'Share with managers' }];
  if (above.from) {
    items.push({ label: `As ${T.nameOf(above.from)}`, hint: above.level ? SH.SHARE_LABEL[above.level] : 'Not shared', checked: own === null, onSelect: () => A.setShare(n.id, null) });
  }
  items.push(
    { label: 'Not shared', checked: own === 'off' || (own === null && !above.from), onSelect: () => A.setShare(n.id, above.from ? 'off' : null) },
    { label: 'Status only', hint: 'status, latest update, who, age', checked: own === 'status', onSelect: () => A.setShare(n.id, 'status') },
    { label: 'Status + stage', hint: 'and its steps', checked: own === 'stage', onSelect: () => A.setShare(n.id, 'stage') },
  );
  menu(anchor, items, { label: 'Share with managers', at });
}

/** "Status only", "Status + stage · from Davits", or "Not shared". */
export function shareText(n) {
  const { level, from } = SH.shareOf(state.idx, n.id);
  if (!level) return 'Not shared';
  return `${SH.SHARE_LABEL[level]}${from && from.id !== n.id ? ` · from ${T.nameOf(from)}` : ''}`;
}

/** The panel's update box, focused: where a reply goes. */
function reply(id) {
  openTask(id);
  const ta = document.querySelector('#panel .compose-input');
  ta?.scrollIntoView({ block: 'center' });
  ta?.focus();
}

const kindWord = (r) => SH.REQUEST_KINDS[r?.kind] ?? 'Request';

/** Home: the jobs with managers' notes waiting, the longest waiting first. Null when there are none. */
export function requestsSection() {
  if (state.role !== 'lead') return null;
  const jobs = SH.requestQueue(state.idx);
  if (!jobs.length) return null;
  const total = jobs.reduce((s, j) => s + (j.requestOpen ?? 0), 0);
  return el('section', { class: 'sec', 'aria-label': 'Questions and requests' },
    el('div', { class: 'sec-head' },
      el('h2', { class: 'h2' }, 'Questions & requests'),
      el('span', { class: 'count', 'aria-label': `${total} open` }, String(total)),
      el('span', { class: 'meta' }, isPhone() ? '' : 'From managers, on shared jobs')),
    el('div', { class: 'rows rq-list' }, jobs.map(requestRow)));
}

function requestRow(job) {
  const r = job.request ?? {};
  const more = (job.requestOpen ?? 0) - 1;
  const cancel = r.cancels && S.isOpen(job.status);
  return el('div', { class: 'rq-row', 'aria-current': state.openId === job.id ? 'true' : null },
    el('button', { class: 'open-link', type: 'button', 'aria-label': `Open ${job.title}: ${kindWord(r)} from ${personName(r.by)}`, onclick: () => openTask(job.id) }),
    el('span', { class: 'rq-kind' }, el('span', { class: `kchip${r.cancels ? ' warn' : ''}` }, r.cancels ? 'Customer cancelled' : kindWord(r))),
    el('div', { class: 'rq-main' },
      el('div', { class: 'rq-title' }, job.title),
      el('div', { class: 'rq-text' }, `${personName(r.by)}: ${r.text ?? ''}`)),
    el('span', { class: 'meta rq-age' }, `${ageLabel(r.at)}${more > 0 ? ` · +${more}` : ''}`),
    el('div', { class: 'rq-acts' },
      cancel ? btn('Cancel job', () => A.cancelFromRequest(job.id), { cls: 'sm danger', title: 'Cancelled, with the note as the reason (Undo in the toast)' }) : null,
      btn('Reply', () => reply(job.id), { cls: 'sm' }),
      btn('Answered', () => A.answerRequests(job.id), { cls: 'sm ghost', title: 'Mark the note answered without replying' })));
}

/** On the job, in the task panel: the latest open note, and what to do about it. */
export function requestCallout(n) {
  if (!((n.requestOpen ?? 0) > 0)) return null;
  const r = n.request ?? {};
  const lead = state.role === 'lead';
  const focus = () => { const ta = document.querySelector('#panel .compose-input'); ta?.scrollIntoView({ block: 'center' }); ta?.focus(); };
  return el('div', { class: 'callout request' },
    el('div', { class: 'callout-head' }, `${r.cancels ? 'Customer cancelled' : kindWord(r)} from ${personName(r.by)} · ${whenLabel(r.at)}${n.requestOpen > 1 ? ` · ${n.requestOpen} open` : ''}`),
    r.text ? el('div', { class: 'callout-body' }, r.text) : null,
    el('div', { class: 'acts' },
      lead && r.cancels && S.isOpen(n.status) ? btn('Cancel job', () => A.cancelFromRequest(n.id), { cls: 'danger', title: 'Cancelled, with the note as the reason (Undo in the toast)' }) : null,
      btn('Reply', focus),
      lead ? btn('Mark answered', () => A.answerRequests(n.id), { cls: 'ghost' }) : null));
}
