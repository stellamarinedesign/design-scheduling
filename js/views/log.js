// views/log.js — the Log (Log brief, confirmed 2026-11-04): where design
// documentation lives, and where the workshop and sales post what they see.
// It replaces the shared Apple Notes.
//
// A FEED, newest first, of even-height cards: the first photo large ("+N"
// for more) or, with no photo, a text card; the first line as the title and
// a few lines of the rest; the kind and state; the category; who and when;
// and the job, once one is linked. Open issues and ideas carry the amber
// Open pill (waiting on the lead, as a wait is amber); reference notes stay
// quiet.
//
// FILTERS: All · Open issues & ideas · Reference; the category (the lead's
// sidebar, or the Category button for everyone else); who posted; and a
// search across the text, the category and the author. The feed holds the
// newest 40 and "Show older" fetches more; Open is never paged (every open
// note is always here).
//
// Wide: 3-4 columns, the sidebar pinned. Half-screen: 2. Phone: 1, with the
// floating + for a new note.

import { el, icon, btn, dot, avatar, menu, isPhone, prefs, pill, loadProblem } from '../ui.js';
import { state, node, personName, realName, allNotes } from '../state.js';
import * as T from '../tree.js';
import * as NT from '../notes.js';
import * as PH from '../photos.js';
import * as A from '../actions.js';
import { ageLabel } from '../dates.js';
import { route, routeHref, openNote, redraw } from '../router.js';
import { openComposer, hasDraft } from './composer.js';
import { categoryDialog } from './pickers.js';

let query = '';
let author = null;

const pillOf = () => { const p = prefs.get('logPill', 'all'); return NT.PILLS.some((x) => x.key === p) ? p : 'all'; };
const categoryOf = () => {
  const c = route.query.c ?? null;
  return c && state.idx.byId.has(c) ? c : null;
};
const setCategory = (id) => { location.hash = routeHref('/log', id ? { c: id } : null); };

export function renderLog(root) {
  const inner = el('div', { class: 'view-inner log' });
  root.append(inner);
  const pillKey = pillOf();
  const cat = categoryOf();
  const notes = allNotes();
  const who = (e) => realName(e);
  const openCount = notes.filter((n) => NT.isTriage(n) && n.state === 'open').length;

  // ── header ──
  const search = el('input', {
    class: 'input log-search', type: 'search', placeholder: 'Search the Log', 'aria-label': 'Search the Log', value: query, dataset: { fk: 'log-search' },
  });
  search.addEventListener('input', () => { query = search.value; redraw(); });
  const pills = el('div', { class: 'filters', role: 'group', 'aria-label': 'Show' },
    NT.PILLS.map((p) => el('button', {
      class: 'fp', type: 'button', 'aria-pressed': String(p.key === pillKey),
      onclick: () => { prefs.set('logPill', p.key); redraw(); },
    }, p.label, p.key === 'open' && state.log.loaded ? el('b', {}, String(openCount)) : null)));

  // The category: a chip to clear it; for those without the sidebar, a button to choose one.
  const catChip = cat ? el('button', {
    class: 'chip on', type: 'button', title: 'Show every category', 'aria-label': `Category: ${NT.placeText(state.idx, cat)}. Show every category`, onclick: () => setCategory(null),
  }, dot(T.colourOf(state.idx, cat)), el('span', {}, NT.placeText(state.idx, cat)), icon('close', 14)) : null;
  const catBtn = state.role !== 'lead' || !cat ? btn(cat ? 'Change' : 'Category', async () => {
    const r = await categoryDialog({ title: 'Show one category', current: cat, recent: prefs.get('noteRecentCats', []), noneLabel: 'Every category' });
    if (r) setCategory(r.id);
  }, { cls: 'sm ghost', ic: 'filter', attrs: { 'aria-label': 'Show one category' } }) : null;

  const authors = NT.authorsOf(notes);
  const authorBtn = authors.length > 1 || author ? btn(author ? personName(author) : 'Anyone', (e) => menu(e.currentTarget, [
    { heading: 'Posted by' },
    { label: 'Anyone', checked: !author, onSelect: () => { author = null; redraw(); } },
    ...authors.map((a) => ({ label: personName(a), checked: a === author, onSelect: () => { author = a; redraw(); } })),
  ], { label: 'Posted by' }), { cls: 'sm ghost', ic: 'user', attrs: { 'aria-haspopup': 'menu', 'aria-label': `Posted by: ${author ? personName(author) : 'anyone'}` } }) : null;

  // Outlined, like New job: the one red button in view is the panel's (Make job), or the composer's Post.
  const add = isPhone() ? null : btn(hasDraft() ? 'Note (draft)' : 'Note', () => openComposer(), { cls: 'sm', ic: 'plus', title: 'A new note (N)' });

  inner.append(el('div', { class: 'view-head log-head' },
    el('h1', { class: 'h1' }, 'Log'),
    pills,
    el('span', { class: 'sp' }),
    search,
    add));
  const sub = el('div', { class: 'log-sub' }, catChip, catBtn, authorBtn);
  if (sub.childNodes.length) inner.append(sub);

  // ── states ──
  if (state.log.error && !state.log.loaded) {
    inner.append(el('div', { class: 'state-msg', role: 'alert' },
      el('h2', { class: 'h2' }, 'The Log did not load'),
      ...loadProblem(state.log.error).map((line) => el('p', {}, line)),
      el('div', {}, btn('Reload', () => location.reload()))));
    return;
  }
  if (!state.log.loaded || !state.ready) {
    inner.append(el('div', { class: 'ncards', 'aria-busy': 'true', 'aria-label': 'Loading the Log' }, [1, 2, 3, 4, 5, 6].map(() => el('div', { class: 'skel ncard-skel' }))));
    return;
  }
  if (!notes.length) {
    inner.append(el('section', { class: 'welcome log-empty' },
      el('h2', { class: 'h2' }, 'Post the first improvement or issue'),
      el('p', {}, 'Something on the floor that could be better, an idea, or a photo worth keeping as reference: give it a title, add a photo if it helps, and post. Everyone listed sees it.'),
      el('div', { class: 'acts' }, btn('New note', () => openComposer(), { cls: 'primary', ic: 'plus' }))));
    return;
  }

  const list = NT.filterNotes(notes, { pill: pillKey, groupId: cat, author, query, idx: state.idx, who });
  // Archived reference notes sit apart, at the end of Reference, folded.
  const archived = pillKey === 'reference' ? list.filter((n) => n.state === 'archived') : [];
  const shown = pillKey === 'reference' ? list.filter((n) => n.state !== 'archived') : list;

  if (!shown.length && !archived.length) {
    const filtered = query || author || cat;
    inner.append(el('div', { class: 'empty' },
      el('span', {}, el('strong', {}, filtered ? 'No notes match. ' : pillKey === 'open' ? 'No open issues or ideas. ' : 'No reference notes yet. '),
        filtered ? 'Try fewer words, or clear the filters.' : pillKey === 'open' ? 'Every issue and idea has a job or was dismissed.' : 'Post as-built photos, how-tos and decisions as Reference.'),
      filtered ? btn('Clear filters', () => { query = ''; author = null; if (cat) setCategory(null); else redraw(); }, { cls: 'sm' }) : null));
  } else {
    const grid = el('div', { class: 'ncards' });
    for (const n of shown) grid.append(card(n));
    inner.append(grid);
  }
  if (archived.length) {
    const open = prefs.get('logArchivedOpen', false);
    inner.append(el('div', { class: 'done-fold' },
      btn(`${open ? 'Hide' : 'Show'} archived (${archived.length})`, () => { prefs.set('logArchivedOpen', !open); redraw(); }, { cls: 'ghost sm', ic: open ? 'chevDown' : 'chevRight', attrs: { 'aria-expanded': String(open) } }),
      open ? el('div', { class: 'ncards' }, archived.map(card)) : null));
  }
  // More: the newest page grows. Open notes are all here already.
  if (state.log.more && pillKey !== 'open') {
    inner.append(el('div', { class: 'more-row' }, btn(query || author || cat ? 'Search older notes too' : 'Show older', () => A.olderNotes(), { cls: 'ghost sm' })));
  }
}

/** The kind, as a quiet chip. */
export const kindChip = (n) => el('span', { class: 'kchip' }, NT.KIND_LABEL[n.kind] ?? 'Note');

/** The state, as a status pill with its word; nothing for a filed reference. */
export function statePill(n) {
  const look = NT.STATE_LOOK[n.state];
  return look ? pill(look.tone, { label: look.word }) : null;
}

/** A linked job's title: live from the tree when this person can see it, else as noted. */
export const linkTitle = (l) => node(l.id)?.title ?? l.title ?? 'A job';

function card(n) {
  const photos = n.photos ?? [];
  const title = NT.titleOf(n) || (photos.length ? 'Photo' : 'Untitled note');
  const ex = NT.excerptOf(n, photos.length ? 180 : 420);
  const place = n.groupId ? NT.placeText(state.idx, n.groupId) : '';
  const quiet = n.state === 'dismissed' || n.state === 'archived';
  const look = NT.STATE_LOOK[n.state];
  const links = n.links ?? [];
  return el('article', {
    class: `ncard${photos.length ? ' has-photo' : ''}${quiet ? ' muted' : ''}`,
    'aria-current': state.noteId === n.id ? 'true' : null,
  },
  el('button', {
    class: 'open-link', type: 'button', onclick: () => openNote(n.id),
    'aria-label': `${NT.KIND_LABEL[n.kind]}${look ? `, ${look.word}` : ''}: ${title}. By ${personName(n.by)}, ${ageLabel(n.at)} ago`,
  }),
  photos.length ? el('div', { class: 'ncard-photo' },
    el('img', { src: PH.thumb(photos[0]), alt: '', loading: 'lazy', decoding: 'async' }),
    photos.length > 1 ? el('span', { class: 'ncard-more' }, `+${photos.length - 1}`) : null) : null,
  el('div', { class: 'ncard-body' },
    el('div', { class: 'ncard-chips' }, kindChip(n), statePill(n),
      n.pending ? el('span', { class: 'meta warn', title: 'Saved on this device; it goes when the connection is back' }, 'Waiting to send') : null),
    el('h2', { class: 'ncard-title' }, title),
    ex ? el('p', { class: 'ncard-ex' }, ex) : null,
    links.length ? el('div', { class: 'ncard-job' }, icon('link', 14), el('span', {}, linkTitle(links[0]), links.length > 1 ? ` +${links.length - 1}` : '')) : null,
    el('div', { class: 'ncard-foot' },
      avatar(realName(n.by) || n.by, personName(n.by)),
      el('span', { class: 'ncard-who' }, personName(n.by)),
      el('span', { class: 'meta' }, ageLabel(n.at)),
      place ? el('span', { class: 'ncard-place' }, dot(T.colourOf(state.idx, n.groupId)), el('span', {}, place)) : null)));
}
