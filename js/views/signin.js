// views/signin.js — the sign-in screen (Firebase mode only), and the screen
// for an account nobody has listed yet. Local mode never shows either.

import { el, btn, withReveal } from '../ui.js';
import { Auth, friendlyAuthError } from '../auth.js';

export function renderSignIn(app) {
  app.textContent = '';
  const email = el('input', { class: 'input', type: 'email', id: 'siEmail', autocomplete: 'username', spellcheck: 'false' });
  const pw = el('input', { class: 'input', type: 'password', id: 'siPw', autocomplete: 'current-password' });
  const err = el('div', { class: 'form-err', role: 'alert' });
  const go = btn('Sign in', async () => {
    err.textContent = '';
    go.disabled = true;
    // The sign-in screen replaced the app's shell, so the way back in is a
    // fresh load: Firebase remembers the sign-in and the shell starts signed in.
    try { await Auth.signIn(email.value, pw.value); location.reload(); }
    catch (e) { err.textContent = friendlyAuthError(e); go.disabled = false; }
  }, { cls: 'primary' });
  for (const i of [email, pw]) i.addEventListener('keydown', (e) => { if (e.key === 'Enter') go.click(); });
  app.append(el('header', { class: 'hd' }, el('span', { class: 'hd-logo', 'aria-hidden': 'true' }), el('span', { class: 'hd-title' }, 'Design Scheduling')),
    el('main', { class: 'view' }, el('div', { class: 'box', style: { margin: '10vh auto 0' } },
      el('h3', {}, 'Sign in'),
      el('div', { class: 'field' }, el('label', { for: 'siEmail' }, 'Email'), email),
      el('div', { class: 'field' }, el('label', { for: 'siPw' }, 'Password'), withReveal(pw)),
      err,
      el('div', { class: 'actions' }, go))));
  email.focus();
}

/**
 * Signed in, no role. On a brand-new project (no settings/access yet) the
 * first person in may claim it as the Design lead and master; the rules allow
 * that once, and only with their own address on the leads list.
 */
export function renderNotListed(app, address, { canClaim = false } = {}) {
  app.textContent = '';
  const err = el('div', { class: 'form-err', role: 'alert' });
  const claim = canClaim ? btn('Set it up: make me the Design lead', async () => {
    claim.disabled = true;
    try {
      const { Store } = await import('../store.js');
      const me = String(address ?? '').trim().toLowerCase();
      await Store.saveAccess({ leads: [me], designers: [], contributors: [], managers: [], masters: [me] });
      location.reload();
    } catch (e) { err.textContent = `That did not save: ${e.message}`; claim.disabled = false; }
  }, { cls: 'primary' }) : null;
  app.append(el('header', { class: 'hd' }, el('span', { class: 'hd-logo', 'aria-hidden': 'true' }), el('span', { class: 'hd-title' }, 'Design Scheduling')),
    el('main', { class: 'view' }, el('div', { class: 'state-msg', style: { margin: '10vh auto 0' } },
      el('h1', { class: 'h1' }, canClaim ? 'A new Design Scheduling' : 'Signed in, but not listed yet'),
      el('p', {}, canClaim
        ? `Nobody has set this app up yet. ${address} can claim it as the Design lead, and then add everyone else under the cog.`
        : `${address ?? 'This account'} can sign in, but nobody has given it a role, so there is nothing to show. Ask the Design lead to add it under the cog.`),
      err,
      el('div', { class: 'row' }, claim, btn('Sign out', async () => { await Auth.signOut(); location.reload(); })))));
}
