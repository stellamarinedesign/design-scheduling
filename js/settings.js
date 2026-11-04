// settings.js - the cog, top right. Copied from the board and trimmed to this
// app: who is signed in, their password, sign out; the theme; this PC's
// Stella Systems folder; the Backlog threshold; local-mode backup; and, for a
// master, the accounts and their roles.
//
// ACCOUNTS LIVE IN ONE PLACE. Who has which role is the `settings/access`
// document, and the Firestore rules read that same document, so setting a
// role here is the whole of giving it. Add makes the Firebase user too, with a
// temporary password shown once. Only a MASTER sees the accounts section: not
// hidden, not greyed, simply absent.

import { Auth, setAccess, tidyEmail, isEmail, friendlyAuthError } from './auth.js';
import { Store } from './store.js';
import { openDialog } from './dialog.js';
import { openPasswordDialog } from './password.js';
import { ROLES, ROLE_LABEL, ROLE_WORDS, normaliseAccess, accountRows, withRole, withoutAccount, withMaster, roleOf, tempPassword } from './access.js';
import { el, btn, toast, prefs } from './ui.js';
import { getPrefix, setPrefix } from './folders.js';
import { VERSION } from './version.js';
import { go } from './router.js';
import { state } from './state.js';

const THEME_KEY = 'stella.design.theme';

// Settings is a guarded dialog (dialog.js): a click outside it does nothing,
// and Close or Esc asks before throwing away a path or an address typed and
// not yet saved.
export function openSettings() {
  openDialog((box, close, { dismiss, markClean }) => {
    box.classList.add('settings');
    box.append(el('h3', {}, 'Settings'));
    box.append(account(close), appearance(), thisPc(markClean), backlog(markClean), data(close));
    const acc = el('div', { class: 'settings-section', hidden: true });
    box.append(acc);
    if (Auth.mode === 'firebase' && Auth.isMaster) { acc.hidden = false; accounts(acc, markClean); }
    box.append(el('div', { class: 'actions' }, btn('Close', dismiss), el('span', { class: 'sp' }), el('span', { class: 'meta' }, `Build ${VERSION}`)));
  }, { label: 'Settings', wide: true, guard: true });
}

const section = (label, ...kids) => el('div', { class: 'settings-section' }, el('div', { class: 'lbl' }, label), el('div', { class: 'settings-card' }, ...kids));

function account(close) {
  const local = Auth.mode !== 'firebase';
  return section('Account', el('div', { class: 'settings-row' },
    el('div', {},
      el('div', {}, local ? 'Local mode' : (Auth.user?.email ?? '')),
      el('div', { class: 'settings-row-sub' }, local
        ? 'No accounts here: everything is saved in this browser only, never the live data. Open the app with ?local=0 to use the live data.'
        : `${ROLE_LABEL[Auth.role] ?? 'Not listed'}${Auth.isMaster ? ' · master (may change the accounts)' : ''}`)),
    local ? null : el('div', { class: 'row' },
      btn('Password', () => { close(null); openPasswordDialog(); }, { cls: 'sm' }),
      btn('Sign out', async () => { close(null); await Auth.signOut(); location.reload(); }, { cls: 'sm' }))));
}

function appearance() {
  const current = document.documentElement.dataset.theme ?? 'stella';
  const seg = el('div', { class: 'seg', role: 'group', 'aria-label': 'Theme' });
  for (const [v, label] of [['stella', 'Stella (dark)'], ['workshop', 'Workshop (light)']]) {
    seg.append(el('button', {
      type: 'button', 'aria-pressed': String(current === v),
      onclick: () => {
        if (v === 'stella') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = v;
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
    toast(r.prefix ? 'Saved: Copy path now gives full paths on this PC' : 'Cleared');
  };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); save(); } });
  const status = el('span', { class: 'settings-row-sub' }, 'Checking…');
  const connect = btn('Connect Stella Systems', async () => {
    const sf = await import('./stella-folder.js');
    try { await sf.chooseRoot(); status.textContent = 'Connected: folders dragged in from File Explorer are placed automatically.'; }
    catch (e) { if (e?.name !== 'AbortError') status.textContent = e.message; }
  }, { cls: 'sm' });
  import('./stella-folder.js').then(async (sf) => {
    if (!sf.supported()) { status.textContent = 'This browser cannot connect a folder (Edge or Chrome on a PC can). Paste paths instead.'; connect.disabled = true; return; }
    const { state: s } = await sf.rootState();
    status.textContent = s === 'none' ? 'Not connected. Connect it once per PC to drag folders in from File Explorer.'
      : s === 'granted' ? 'Connected.' : 'Connected; the browser will ask again before reading it.';
  });
  return section('This PC',
    el('div', { class: 'field' }, el('label', {}, 'Where Stella Systems is on this PC'), input, err,
      el('div', { class: 'hint' }, 'Learnt automatically the first time you paste a full folder path. Copy path uses it to give the whole Windows path for this PC.'),
      el('div', {}, btn('Save', save, { cls: 'sm' }))),
    el('div', { class: 'settings-row' }, status, connect));
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
      if (!await confirmDialog({ title: 'Replace this browser\'s data?', body: `The backup holds ${d.tasks.length} items. Everything here now is replaced. This cannot be undone.`, ok: 'Replace', destructive: true })) return;
      Store.replaceLocal(d);
      toast('Backup restored');
    } catch (e) { toast(`That is not a backup from this app: ${e.message}`, { warn: true }); }
  });
  return section('Data',
    el('div', { class: 'row', style: { 'flex-wrap': 'wrap' } },
      state.role === 'lead' ? btn('Import TileDo or Excel', () => { close(null); go('/import'); }, { cls: 'sm', ic: 'upload' }) : null,
      btn('Archive', () => { close(null); go('/archive'); }, { cls: 'sm', ic: 'archive' }),
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

async function accounts(host, markClean) {
  host.textContent = '';
  host.append(el('div', { class: 'lbl' }, 'Accounts'));
  const card = el('div', { class: 'settings-card' }, 'Loading…');
  host.append(card);
  let access = normaliseAccess(await Store.loadAccess());
  let fresh = null;
  const me = tidyEmail(Auth.user?.email);

  const save = async (next, note) => {
    try {
      await Store.saveAccess(next);
      access = next;
      setAccess(next);
      toast(note);
      draw();
      markClean();
      return true;
    } catch (e) { toast(`Could not save: ${e.message}`, { warn: true }); return false; }
  };

  const roleSelect = (current, onChange, disabled) => {
    const sel = el('select', { class: 'sel', disabled, 'aria-label': 'Role' }, ROLES.map((r) => el('option', { value: r, selected: r === current }, ROLE_LABEL[r])));
    sel.addEventListener('change', () => onChange(sel.value));
    return sel;
  };

  const draw = () => {
    card.textContent = '';
    card.append(el('div', { class: 'settings-row-sub' },
      `Who gets which view, live on their next page load. ${ROLES.map((r) => `${ROLE_LABEL[r]}: ${ROLE_WORDS[r]}.`).join(' ')} An account on no list can sign in and sees nothing. A master may change this list; it is not a role.`));
    const table = el('div', { class: 'acct-table' });
    for (const r of accountRows(access)) {
      const self = r.email === me;
      const tick = el('input', { type: 'checkbox', checked: r.master, disabled: self, title: self ? 'Another master can change yours.' : 'Master: may change this list' });
      tick.addEventListener('change', () => save(withMaster(access, r.email, tick.checked), `${r.email} ${tick.checked ? 'is now a master' : 'is no longer a master'}.`));
      table.append(el('div', { class: 'acct-row' },
        el('span', { style: { 'overflow-wrap': 'anywhere' } }, r.email),
        roleSelect(r.role, (v) => save(withRole(access, r.email, v), `${r.email} is now ${ROLE_LABEL[v]}.`), self),
        el('label', { class: 'check-line' }, tick, 'Master'),
        el('div', { class: 'row' },
          btn('Make user', () => makeUser(r.email), { cls: 'sm', attrs: self ? { disabled: '' } : {} }),
          btn('Remove', () => save(withoutAccount(access, r.email), `${r.email} removed from the lists.`), { cls: 'sm ghost', attrs: self ? { disabled: '' } : {} }))));
    }
    card.append(table);
    const input = el('input', { class: 'input', type: 'email', placeholder: 'name@example.com', autocomplete: 'off', spellcheck: 'false', 'aria-label': 'New account address' });
    let role = 'designer';
    const err = el('div', { class: 'form-err', role: 'alert' });
    const add = async () => {
      const email = tidyEmail(input.value);
      err.textContent = '';
      if (!isEmail(email)) { err.textContent = 'That does not look like an email address.'; return; }
      if (accountRows(access).some((x) => x.email === email)) { err.textContent = `${email} is already listed, as ${ROLE_LABEL[roleOf(access, email)]}.`; return; }
      if (await save(withRole(access, email, role), `${email} added as ${ROLE_LABEL[role]}.`)) await makeUser(email);
    };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') add(); });
    card.append(el('div', { class: 'row', style: { 'flex-wrap': 'wrap' } }, input, roleSelect(role, (v) => { role = v; }), btn('Add', add, { cls: 'sm' })), err);
    if (fresh) card.append(freshBox(fresh));
  };

  const makeUser = async (email) => {
    const password = tempPassword();
    try {
      await Auth.createAccount(email, password);
      fresh = { email, password };
    } catch (e) {
      fresh = String(e?.code ?? '').includes('email-already-in-use') ? { email, exists: true } : { email, failed: friendlyAuthError(e) };
    }
    draw();
  };

  draw();
}

function freshBox({ email, password, exists, failed }) {
  const box = el('div', { class: 'acct-fresh' });
  if (exists) {
    box.append(el('strong', {}, `${email} already has a Firebase user`),
      el('div', { class: 'settings-row-sub' }, 'Its password is unchanged. If it is lost: delete the user in the Firebase console (Authentication, Users) and press Make user again for a fresh temporary one.'));
    return box;
  }
  if (failed) {
    box.append(el('strong', {}, `${email} is listed, but its Firebase user was not made`), el('div', { class: 'settings-row-sub' }, `${failed} Press Make user to try again.`));
    return box;
  }
  const copy = btn('Copy', async () => { try { await navigator.clipboard.writeText(password); copy.textContent = 'Copied'; } catch { copy.textContent = 'Select and copy it'; } }, { cls: 'sm' });
  box.append(el('strong', {}, `Account made for ${email}`),
    el('div', { class: 'row' }, el('span', {}, 'Temporary password: '), el('code', { class: 'mono' }, password), copy),
    el('div', { class: 'settings-row-sub' }, 'Shown once: it goes when this closes. They sign in with it and press Password under the cog to make it theirs.'));
  return box;
}
