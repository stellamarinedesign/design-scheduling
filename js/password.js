// password.js - change the signed-in account's password, in the app. Copied
// from the board.
//
// No email in the loop. Firebase's reset mail comes from a sender nobody
// recognises, lands in junk, and takes its time; the account's own holder,
// signed in, needs none of that. They prove the current password and choose
// the next one here. A FORGOTTEN password is the one case this cannot cover:
// that is a one-minute job in the Firebase console, after which this is how
// they make the temporary one theirs.

import { Auth, friendlyAuthError } from './auth.js';
import { openDialog } from './dialog.js';
import { toast } from './ui.js';

const MIN_LENGTH = 8;

const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
};

/** Open the dialog - from the Settings cog. Nothing to do in local mode. */
export function openPasswordDialog() {
  if (Auth.mode !== 'firebase') return;
  openDialog((box, close) => {
    box.append(el('h3', null, 'Change password'));
    const email = Auth.user?.email ?? '';
    if (email) box.append(el('p', 'lede', `For ${email}.`));
    const field = (id, label, auto, hint) => {
      const f = el('div', 'field');
      const l = el('label', null, label);
      l.htmlFor = id;
      const i = document.createElement('input');
      i.type = 'password';
      i.id = id;
      i.className = 'input';
      i.autocomplete = auto;
      f.append(l, i);
      if (hint) f.append(el('div', 'hint', hint));
      return f;
    };
    box.append(field('pwCurrent', 'Current password', 'current-password'));
    box.append(field('pwNew', 'New password', 'new-password', `At least ${MIN_LENGTH} characters.`));
    box.append(field('pwAgain', 'New password, again', 'new-password'));
    const err = el('div', 'form-err');
    err.setAttribute('role', 'alert');
    box.append(err);
    const acts = el('div', 'actions');
    const save = el('button', 'btn primary', 'Change password');
    const cancel = el('button', 'btn', 'Cancel');
    acts.append(save, cancel);
    box.append(acts);

    const submit = async () => {
      const current = box.querySelector('#pwCurrent').value;
      const next = box.querySelector('#pwNew').value;
      const again = box.querySelector('#pwAgain').value;
      err.textContent = '';
      if (!current) { err.textContent = 'Type the current password first.'; return; }
      if (next.length < MIN_LENGTH) { err.textContent = `The new password needs at least ${MIN_LENGTH} characters.`; return; }
      if (next !== again) { err.textContent = 'The two new passwords are not the same.'; return; }
      if (next === current) { err.textContent = 'That is the current password.'; return; }
      save.disabled = true;
      try {
        await Auth.changePassword(current, next);
        close(true);
        toast('Password changed. Use the new one from now on.');
      } catch (e) {
        err.textContent = friendlyAuthError(e);
      } finally {
        save.disabled = false;
      }
    };
    save.addEventListener('click', submit);
    cancel.addEventListener('click', () => close(null));
    for (const id of ['pwCurrent', 'pwNew', 'pwAgain']) {
      box.querySelector(`#${id}`).addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
    }
  }, { label: 'Change password' });
}
