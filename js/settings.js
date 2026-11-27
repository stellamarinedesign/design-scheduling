// settings.js - the cog, top right. Copied from the board and trimmed to this
// app: who is signed in, their name, password, sign out; the theme; this
// PC's Stella Systems folder; the Backlog threshold; the team's workday (lunch
// and finish, where timers pause and stop); the time export's Word template
// and default rate (views/quote-ui.js); the lead's one-off "Unassign me";
// local-mode backup; Stella Systems on the web (the lead) and whether this
// PC has the Open in Explorer helper; and, for a master, the accounts:
// their names, and their roles to read.
//
// ACCOUNTS LIVE IN ONE PLACE. Who has which role is the `settings/access`
// document, and the Firestore rules read that same document. Since the hub
// (2026-11-23) Hubinator writes it: people and roles are given there, and
// the section here only names people and shows their roles. Only a MASTER
// sees it: not hidden, not greyed, simply absent.

import { Auth } from './auth.js';
import { Store } from './store.js';
import { openDialog, confirmDialog } from './dialog.js';
import { openPasswordDialog } from './password.js';
import { ROLE_LABEL, normaliseAccess, accountRows } from './access.js';
import { el, btn, toast, prefs, isRefusal, plainWhy, plainNext, toastError, savedOn } from './ui.js';
import { getPrefix, setPrefix, parseWebRoot } from './folders.js';
import { VERSION } from './version.js';
import { go } from './router.js';
import { state, realName } from './state.js';
import { nameFor } from './team.js';
import * as TC from './timing.js';
import * as A from './actions.js';
import { quoteSettings } from './views/quote-ui.js';

const THEME_KEY = 'stella.design.theme';

// Settings is a guarded dialog (dialog.js): a click outside it does nothing,
// and Close or Esc asks before throwing away a path or an address typed and
// not yet saved. Resolves when it closes (the export box re-reads its template then).
export function openSettings() {
  return openDialog((box, close, { dismiss, markClean }) => {
    box.classList.add('settings');
    // The build sits beside the heading, so checking which one is on screen
    // needs no scroll to the foot of a long box.
    box.append(el('div', { class: 'settings-head' }, el('h3', {}, 'Settings'), el('span', { class: 'meta' }, `Build ${VERSION}`)));
    const lead = state.role === 'lead';
    const designs = lead || state.role === 'designer';
    box.append(...[account(close), yourName(markClean), appearance(), designs ? thisPc(markClean) : null, lead ? onTheWeb(markClean) : null, lead ? backlog(markClean) : null, lead ? workday(markClean) : null, lead ? quoteSettings(section, markClean) : null, lead ? tasksOnYou() : null, lead ? storage() : null, lead || Store.mode === 'local' ? data(close) : null].filter(Boolean));
    const acc = el('div', { class: 'settings-section', hidden: true });
    box.append(acc);
    if (Auth.mode === 'firebase' && Auth.isMaster) { acc.hidden = false; accounts(acc, markClean); }
    box.append(el('div', { class: 'actions' }, btn('Close', dismiss)));
  }, { label: 'Settings', wide: true, guard: true });
}

const section = (label, ...kids) => el('div', { class: 'settings-section' }, el('div', { class: 'lbl' }, label), el('div', { class: 'settings-card' }, ...kids));

function account(close) {
  const local = Auth.mode !== 'firebase';
  return section('Account', el('div', { class: 'settings-row' },
    el('div', {},
      el('div', {}, local ? `Local mode · viewing as ${realName(state.me)} (${ROLE_LABEL[state.role]})` : (Auth.user?.email ?? '')),
      // Live, the address alone: a person's role is shown only on an admin's
      // accounts pages (owner, 2026-11-27). Local mode's invented people keep theirs.
      local ? el('div', { class: 'settings-row-sub' }, 'No accounts here: everything is saved in this browser only, never the live data. "View as" in the strip under the header switches between an invented lead, designer, contributor and manager, to check their screens. Open the app with ?local=0 to use the live data.') : null),
    // Signed in through the hub, Password and Sign out are the hub's.
    local ? null : el('div', { class: 'row' },
      btn('Password', () => { close(null); if (Auth.viaHub) Auth.hub.openPassword(); else openPasswordDialog(); }, { cls: 'sm' }),
      btn('Sign out', async () => { close(null); await Auth.signOutEverywhere(); location.reload(); }, { cls: 'sm' }))));
}

/** Your name as the team sees it: on tiles, lanes and the timeline. people/{you}. */
function yourName(markClean) {
  const input = el('input', { class: 'input', type: 'text', value: state.people[state.me]?.name ?? '', placeholder: nameFor({}, state.me), maxlength: '60', 'aria-label': 'Your name', autocomplete: 'name', style: { 'max-width': '280px' } });
  const save = async () => {
    const v = input.value.trim();
    if (v === (state.people[state.me]?.name ?? '')) return;
    try { await Store.savePerson(state.me, { name: v }); markClean(); toast(v ? `Saved: the team sees you as ${v}` : 'Name cleared'); }
    catch (e) { toastError(e, 'Your name did not save'); }
  };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); save(); } });
  input.addEventListener('change', save);
  return section('Your name', el('div', { class: 'settings-row' },
    el('div', { class: 'settings-row-sub' }, 'How the team sees you: your initials on tiles, your name on updates.'), input));
}

function appearance() {
  const current = document.documentElement.dataset.theme ?? 'stella';
  const seg = el('div', { class: 'seg', role: 'group', 'aria-label': 'Theme' });
  for (const [v, label] of [['stella', 'Stella (dark)'], ['workshop', 'Workshop (light)']]) {
    seg.append(el('button', {
      type: 'button', 'aria-pressed': String(current === v),
      onclick: () => {
        // Every colour changes at once, none fading on its own (css .theme-switching):
        // the new theme's styles are worked out with transitions off, which come
        // back on the next frame.
        const root = document.documentElement;
        root.classList.add('theme-switching');
        if (v === 'stella') delete root.dataset.theme; else root.dataset.theme = v;
        void root.offsetWidth;
        requestAnimationFrame(() => root.classList.remove('theme-switching'));
        try { localStorage.setItem(THEME_KEY, v); } catch { /* this session only */ }
        for (const b of seg.children) b.setAttribute('aria-pressed', String(b === seg.querySelector(`button:nth-child(${v === 'stella' ? 1 : 2})`)));
      },
    }, label));
  }
  return section('Theme', el('div', { class: 'settings-row' }, el('div', { class: 'settings-row-sub' }, 'Workshop is for bright offices and the workshop floor. Per device.'), seg));
}

function thisPc(markClean) {
  const input = el('input', { class: 'input mono', type: 'text', value: getPrefix(), placeholder: 'C:\\Users\\you\\OneDrive - …\\Stella Systems', 'aria-label': 'This PC\'s Stella Systems folder', spellcheck: 'false' });
  const err = el('div', { class: 'form-err', role: 'alert' });
  const save = () => {
    const r = setPrefix(input.value);
    if (r.error) { err.textContent = r.error; return; }
    err.textContent = '';
    input.value = r.prefix;
    markClean();
    savedOn(savePath, r.prefix ? 'Saved' : 'Cleared');
  };
  const savePath = btn('Save path', () => save(), { cls: 'sm' });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); save(); } });
  const status = el('span', { class: 'settings-row-sub' }, 'Checking…');
  const connect = btn('Connect Stella Systems', async () => {
    const sf = await import('./stella-folder.js');
    try { await sf.chooseRoot(); status.textContent = 'Connected: folders dragged in from File Explorer are placed automatically.'; }
    catch (e) { if (e?.name !== 'AbortError') status.textContent = `That folder was not connected: ${plainWhy(e)}.`; }
  }, { cls: 'sm' });
  import('./stella-folder.js').then(async (sf) => {
    if (!sf.supported()) { status.textContent = 'This browser cannot connect a folder (Edge or Chrome on a PC can). Paste paths instead.'; connect.disabled = true; return; }
    const { state: s } = await sf.rootState();
    status.textContent = s === 'none' ? 'Not connected. Connect it once per PC to drag folders in from File Explorer.'
      : s === 'granted' ? 'Connected.' : 'Connected; the browser will ask again before reading it.';
  });
  // The Open in Explorer helper (tools/pc-helper): nothing the browser can
  // check, so the person says so, per device.
  const helper = el('input', { type: 'checkbox', id: 'pcHelper', checked: prefs.get('pcHelper', false) });
  helper.addEventListener('change', () => {
    prefs.set('pcHelper', helper.checked);
    toast(helper.checked ? 'Folder links now open in File Explorer on this PC. The browser asks once first; tick "Always allow".' : 'Folder links copy their path again on this PC');
  });
  return section('This PC',
    el('div', { class: 'field' }, el('label', {}, 'Where Stella Systems is on this PC'), input, err,
      el('div', { class: 'hint' }, 'Learnt automatically the first time you paste a full folder path. Copy path uses it to give the whole Windows path for this PC.'),
      el('div', {}, savePath)),
    el('div', { class: 'settings-row' }, status, connect),
    el('div', { class: 'settings-row' },
      el('label', { class: 'check-line', for: 'pcHelper' }, helper, 'Open in Explorer is set up on this PC'),
      el('div', { class: 'settings-row-sub' }, 'Folder links get an Open button that opens them in File Explorer. Set it up once per PC with the Design Scheduling helper\'s Install, then tick this. It also adds Ctrl+Alt+N for a new job from anywhere.')));
}

/**
 * Stella Systems on the web (the lead, team-wide): a folder link then opens
 * in OneDrive on a phone, and from a link's ⋯ on a PC. settings/library.
 */
function onTheWeb(markClean) {
  const input = el('input', { class: 'input mono', type: 'url', value: state.library ?? '', placeholder: 'https://…sharepoint.com/…/Stella Systems', 'aria-label': 'Stella Systems on the web', spellcheck: 'false', autocomplete: 'off' });
  const err = el('div', { class: 'form-err', role: 'alert', id: 'web-err' });
  const said = el('div', { class: 'hint' }, state.library ? `Set: ${state.library}` : 'Not set: on a phone, folder links only copy their path.');
  input.addEventListener('input', () => { err.textContent = ''; input.removeAttribute('aria-invalid'); });
  const save = async () => {
    const r = parseWebRoot(input.value);
    if (r.error) { err.textContent = r.error; input.setAttribute('aria-invalid', 'true'); input.setAttribute('aria-describedby', 'web-err'); input.focus(); return; }
    const address = r.root?.address ?? null;
    try {
      const p = Store.saveLibrary(address);
      if (!Store.offline()) await p;
      input.value = address ?? '';
      said.textContent = address ? `Set: ${address}` : 'Not set: on a phone, folder links only copy their path.';
      markClean();
      savedOn(saveAddress, address ? 'Saved' : 'Cleared');
    } catch (e) { toast(isRefusal(e) ? 'Could not save: only the Design lead sets this.' : `It did not save: ${plainWhy(e)}. ${plainNext(e)}`, { warn: true }); }
  };
  const saveAddress = btn('Save address', () => save(), { cls: 'sm' });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); save(); } });
  return section('Stella Systems on the web',
    el('div', { class: 'settings-row-sub' }, 'Lets a folder link open in OneDrive on a phone. Open Stella Systems in OneDrive on the web, copy the address bar and paste it here. Team-wide.'),
    el('div', { class: 'field' }, input, err, said, el('div', {}, saveAddress)));
}

function backlog(markClean) {
  const days = prefs.get('backlogDays', 14);
  const input = el('input', { class: 'input', type: 'number', min: '1', max: '365', value: String(days), style: { width: '96px' }, 'aria-label': 'Days untouched before a job joins the Backlog' });
  input.addEventListener('change', () => {
    const v = Math.max(1, Math.min(365, Math.round(Number(input.value) || 14)));
    input.value = String(v);
    prefs.set('backlogDays', v);
    markClean();
    toast(`Backlog: jobs untouched ${v} days or more`);
  });
  return section('Backlog', el('div', { class: 'settings-row' },
    el('div', { class: 'settings-row-sub' }, 'Days untouched before a To-do job joins Home\'s Backlog rotation.'), input));
}

/**
 * The team's day (lead, team-wide): lunch start and end, and finish. A
 * running timer pauses at lunch (and restarts after it) and stops at finish;
 * the five-minute warning names these times. settings/workday.
 */
function workday(markClean) {
  const w = state.time.workday ?? TC.DEFAULT_WORKDAY;
  const field = (key, label) => {
    const input = el('input', { class: 'input', type: 'time', value: w[key], 'aria-label': label, dataset: { key }, style: { width: '128px' } });
    return el('label', { class: 'field workday-field' }, el('span', { class: 'lbl' }, label), input);
  };
  const fields = [field('lunchStart', 'Lunch starts'), field('lunchEnd', 'Lunch ends'), field('finish', 'Finish')];
  const inputs = fields.map((f) => f.querySelector('input'));
  const err = el('div', { class: 'form-err', role: 'alert', id: 'workday-err' });
  const flag = (bad) => {
    for (const i of inputs) {
      if (i === bad) { i.setAttribute('aria-invalid', 'true'); i.setAttribute('aria-describedby', 'workday-err'); }
      else { i.removeAttribute('aria-invalid'); i.removeAttribute('aria-describedby'); }
    }
  };
  for (const i of inputs) i.addEventListener('input', () => { err.textContent = ''; flag(null); });
  const save = async () => {
    const next = Object.fromEntries(inputs.map((i) => [i.dataset.key, i.value]));
    const problem = TC.workdayProblem(next);
    if (problem) {
      // The time that breaks the order is marked and focused: an empty one,
      // else lunch's end when it is not after its start, else finish.
      const [ls, le, fi] = inputs;
      const bad = inputs.find((i) => !TC.isHM(i.value)) ?? (!(ls.value < le.value) ? le : fi);
      err.textContent = problem;
      flag(bad);
      bad.focus();
      return;
    }
    err.textContent = '';
    flag(null);
    const said = `lunch ${TC.clock(TC.onDay(new Date().toISOString(), next.lunchStart))} to ${TC.clock(TC.onDay(new Date().toISOString(), next.lunchEnd))}, finish ${TC.clock(TC.onDay(new Date().toISOString(), next.finish))}`;
    const p = Store.saveWorkday(next);
    // Offline the save waits for the connection: say so now rather than hang.
    if (Store.offline()) {
      markClean();
      toast(`Workday kept on this device (${said}): it reaches the team when back online`);
      p.catch((e) => toast(isRefusal(e) ? 'The workday did not save: only the Design lead sets it.' : `The workday did not save: ${plainWhy(e)}.`, { warn: true }));
      return;
    }
    try {
      await p;
      markClean();
      savedOn(saveDay);
    } catch (e) { toast(isRefusal(e) ? 'Could not save: only the Design lead sets the workday.' : `The workday did not save: ${plainWhy(e)}. ${plainNext(e)}`, { warn: true }); }
  };
  const saveDay = btn('Save workday', () => save(), { cls: 'sm' });
  return section('Workday',
    el('div', { class: 'settings-row-sub' }, 'For time tracking, team-wide: a running timer pauses at lunch, restarts after it, and stops at finish. Each person gets a warning five minutes before.'),
    el('div', { class: 'row workday-row' }, ...fields),
    err,
    el('div', {}, saveDay));
}

/**
 * One-off (owner, 2026-11-09): the first imports put the lead on every task
 * inside a job, so each sat on the lists and went for check. Unassign me
 * takes the lead off them all at once (actions.js unassignAllMine). Shown
 * while any are left, until it has run once on this device (Undo brings it
 * back); local mode and the live data are remembered apart.
 */
function tasksOnYou() {
  const key = `unassignedAllMine.${Store.mode}`;
  const n = A.tasksOnMe();
  if (!n || prefs.get(key, false)) return null;
  const words = `${n} task${n === 1 ? '' : 's'}`;
  const sub = el('div', { class: 'settings-row-sub', role: 'status' }, `${words} inside jobs have you on them, most from the first imports.`);
  const run = btn('Unassign me', async () => {
    const ok = await confirmDialog({
      title: `Unassign you from ${words}?`,
      body: 'Each becomes part of its job again: ticked with the job, off Home and the lists, never sent for check. Ready for check and Sent back go back to In progress. Jobs keep you. Undo is on the message after.',
      ok: 'Unassign me', cancel: 'Keep them',
    });
    if (!ok) return;
    const done = A.unassignAllMine({ onUndo: () => prefs.set(key, false) });
    if (!done) return;
    prefs.set(key, true);
    run.remove();
    sub.textContent = `Done: you are off ${done} task${done === 1 ? '' : 's'} inside jobs.`;
  }, { cls: 'sm' });
  return section('Tasks on you', el('div', { class: 'settings-row' }, sub, run));
}

/**
 * Photos live in Firestore (no Storage on the free plan), whose free tier
 * holds 1 GiB for everything: the lead sees roughly how much is used (PLAN,
 * "Photo storage"). Counted by the server, not read; local mode counts this
 * browser's own.
 */
const GIB = 1024 ** 3;
const mb = (b) => (b >= 1024 ** 3 ? `${(b / GIB).toFixed(2)} GB` : `${Math.max(0.1, b / 1024 ** 2).toFixed(1)} MB`);
function storage() {
  const line = el('div', { class: 'settings-row-sub', role: 'status' }, 'Counting…');
  const barEl = el('span', { class: 'bar', role: 'progressbar', 'aria-label': 'Photo storage used', 'aria-valuemin': '0', 'aria-valuemax': '100' }, el('i', { style: { width: '0%' } }));
  Store.storageEstimate().then(({ photos, bytes, notes }) => {
    const pct = Math.min(100, (bytes / GIB) * 100);
    barEl.setAttribute('aria-valuenow', pct.toFixed(1));
    barEl.firstChild.style.width = `${Math.max(pct, photos ? 1 : 0)}%`;
    line.textContent = `${photos} photo${photos === 1 ? '' : 's'}, about ${mb(bytes)}, across ${notes} Log note${notes === 1 ? '' : 's'} and task updates. `
      + (Store.mode === 'local' ? 'In this browser only.' : `The free plan holds ${mb(GIB)} for everything; photos use about ${pct < 0.1 ? 'under 0.1' : pct.toFixed(1)}% of it.`);
  }).catch((e) => { line.textContent = isRefusal(e) ? 'Could not count the photos: this account is not allowed to.' : `Could not count the photos just now: ${plainWhy(e)}. Open Settings again to retry.`; });
  return section('Photo storage', el('div', { class: 'storage' }, line, barEl));
}

function data(close) {
  const local = Store.mode === 'local';
  const file = el('input', { type: 'file', accept: '.json,application/json', hidden: true });
  file.addEventListener('change', async () => {
    const f = file.files?.[0];
    if (!f) return;
    try {
      const d = JSON.parse(await f.text());
      if (!Array.isArray(d.tasks)) throw new Error('no task list in it');
      const { confirmDialog } = await import('./dialog.js');
      if (!await confirmDialog({ title: 'Replace this browser\'s data?', body: `The backup holds ${d.tasks.length} items. Everything here now is replaced. This cannot be undone.`, ok: 'Replace the data', cancel: 'Keep what is here', destructive: true })) return;
      Store.replaceLocal(d);
      toast('Backup restored');
    } catch (e) { toast(e instanceof SyntaxError || /no task list/.test(e?.message ?? '') ? 'That file is not a backup from this app. Choose the .json file that "Back up to a file" made.' : `The backup was not restored: ${plainWhy(e)}.`, { warn: true }); }
  });
  return section('Data',
    el('div', { class: 'row', style: { 'flex-wrap': 'wrap' } },
      state.role === 'lead' ? btn('Import TileDo or Excel', () => { close(null); go('/import'); }, { cls: 'sm', ic: 'upload' }) : null,
      state.role === 'lead' ? btn('Archive', () => { close(null); go('/archive'); }, { cls: 'sm', ic: 'archive' }) : null,
      local ? btn('Back up to a file', () => {
        const blob = new Blob([JSON.stringify(Store.exportLocal(), null, 1)], { type: 'application/json' });
        const a = el('a', { href: URL.createObjectURL(blob), download: `design-scheduling-backup-${new Date().toISOString().slice(0, 10)}.json` });
        document.body.append(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      }, { cls: 'sm' }) : null,
      local ? btn('Restore a backup…', () => file.click(), { cls: 'sm' }) : null,
      file),
    local ? el('div', { class: 'hint' }, 'Local mode keeps everything in this browser. Back up before clearing browser data.') : null);
}

// ---------------------------------------------------------------------------
// accounts (a master, signed in to Firebase)
// ---------------------------------------------------------------------------

// READ-ONLY SINCE THE HUB (2026-11-23). People and roles are given in
// Hubinator, which writes this app's settings/access. Store.saveAccess
// rewrites that whole document, so a role editor left here would erase the
// hub's lists with one stale press: there is none. The names the team sees
// (people/{email}) are still this app's, and still edited here.
const HUB_ACCOUNTS = '/#/accounts';

async function accounts(host, markClean) {
  host.textContent = '';
  host.append(el('div', { class: 'lbl' }, 'Accounts'));
  const card = el('div', { class: 'settings-card' }, 'Loading…');
  host.append(card);
  const access = normaliseAccess(await Store.loadAccess());
  card.textContent = '';
  card.append(el('div', { class: 'settings-row-sub' }, 'Roles and new people are set in the hub, under ',
    el('a', { href: HUB_ACCOUNTS, target: '_blank', rel: 'noopener' }, 'Accounts'), '.'));
  const table = el('div', { class: 'acct-table' });
  for (const r of accountRows(access)) {
    // The name the team sees (people/{email}); saved as soon as it is left.
    const nm = el('input', { class: 'input acct-name', type: 'text', value: state.people[r.email]?.name ?? '', placeholder: 'Name', maxlength: '60', 'aria-label': `Name for ${r.email}` });
    nm.addEventListener('change', async () => {
      try { await Store.savePerson(r.email, { name: nm.value }); markClean(); toast(`Saved the name for ${r.email}`); }
      catch (e) { toastError(e, `The name for ${r.email} did not save`); }
    });
    table.append(el('div', { class: 'acct-row' },
      el('div', { class: 'acct-id' }, nm, el('span', { class: 'settings-row-sub', style: { 'overflow-wrap': 'anywhere' } }, r.email)),
      el('span', { class: 'acct-role' }, ROLE_LABEL[r.role] ?? r.role)));
  }
  card.append(table);
}
