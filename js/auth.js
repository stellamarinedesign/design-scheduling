// auth.js — sign-in and roles. Copied from the board, with this app's roles.
//
// Firebase email/password, no self-signup: a master makes accounts in the app
// (settings.js) with a temporary password, and the owner changes it under the
// cog (password.js).
//
// THE ROLE LISTS ARE NOT SECURITY. They decide what gets drawn. The Firestore
// rules are the real enforcement, and they read the same settings/access
// document. The lists are not in this file either: a static site hands its
// JavaScript to anyone who asks, so addresses live in Firestore, readable only
// by a listed account, and `setAccess` hands them here once loaded.
//
// Empty until then, and empty means nobody is anything: an unknown account
// sees nothing rather than the run of the app. Fail closed.

import { normaliseAccess, roleOf, isMaster } from './access.js';

// Plain {} rather than normaliseAccess({}) at load: access.js imports
// tidyEmail from here, and calling into it while the two modules are still
// loading each other would meet its constants uninitialised.
let access = {};

export const tidyEmail = (e) => String(e ?? '').trim().toLowerCase();
export const isEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e ?? ''));

/** The loaded settings/access document. */
export function setAccess(doc) { access = normaliseAccess(doc); }
export const currentAccess = () => access;

export const ROLE = { LEAD: 'lead', DESIGNER: 'designer', CONTRIBUTOR: 'contributor', MANAGER: 'manager', NONE: 'none' };

/** Who a signed-in account is. In local mode there is one person, the lead. */
export const LOCAL_ME = 'local';

export const Auth = {
  mode: 'local',        // 'firebase' | 'local'
  user: null,
  role: ROLE.NONE,

  /**
   * @param {(state: {role, email, mode}) => void} onChange
   * @returns {Promise<'firebase'|'local'>}
   */
  async init(onChange) {
    const { getFirebase } = await import('./firebase.js');
    const fb = await getFirebase();

    if (!fb) {
      // LOCAL MODE. There is no auth to enforce and no second device to
      // protect against, so the single person on this machine is the lead.
      // The UI says so plainly rather than implying a login happened.
      this.mode = 'local';
      this.role = ROLE.LEAD;
      this.user = null;
      onChange({ role: this.role, email: null, mode: 'local' });
      return 'local';
    }

    this.mode = 'firebase';
    this._fb = fb;
    fb.fa.onAuthStateChanged(fb.auth, (user) => {
      this.user = user;
      this.role = user ? (roleOf(access, user.email) ?? ROLE.NONE) : ROLE.NONE;
      onChange({ role: this.role, email: user?.email ?? null, mode: 'firebase' });
    });
    return 'firebase';
  },

  /**
   * Re-decide the role now the access document has loaded. Firebase reports
   * the signed-in user before the store is up, so the first decision is
   * always made against empty lists and is always NONE. This is the real one.
   */
  refreshRole() {
    if (this.mode === 'local') return this.role;
    this.role = this.user ? (roleOf(access, this.user.email) ?? ROLE.NONE) : ROLE.NONE;
    return this.role;
  },

  /** The address that goes in createdBy, assignee and an update's `by`. */
  get me() { return this.mode === 'local' ? LOCAL_ME : tidyEmail(this.user?.email); },

  async signIn(email, password) {
    if (this.mode === 'local') throw new Error('Local mode — no sign-in required.');
    const { fa, auth } = this._fb;
    await fa.signInWithEmailAndPassword(auth, email.trim(), password);
  },

  async signOut() {
    if (this.mode === 'local') return;
    const { fa, auth } = this._fb;
    await fa.signOut(auth);
  },

  /**
   * Firebase resolves this the same way whether or not the address exists,
   * so it cannot be used to discover who has an account. A typo looks exactly
   * like success — hence the wording in the UI.
   */
  async sendPasswordReset(email) {
    if (this.mode === 'local') throw new Error('Local mode — there are no accounts.');
    const { fa, auth } = this._fb;
    await fa.sendPasswordResetEmail(auth, email.trim());
  },

  /**
   * Change the signed-in account's password, here, with no email in the loop.
   * Firebase will not change a password on a stale sign-in, so the current
   * password is proved first by signing in with it again.
   */
  async changePassword(current, next) {
    if (this.mode === 'local') throw new Error('Local mode — there are no accounts.');
    const { fa, auth } = this._fb;
    const user = auth.currentUser;
    if (!user?.email) throw new Error('Not signed in.');
    await fa.reauthenticateWithCredential(user, fa.EmailAuthProvider.credential(user.email, current));
    await fa.updatePassword(user, next);
  },

  /**
   * Make a Firebase user from the app, as a master, on a second auth (see
   * firebase.js) so the master stays signed in. Needs "Enable create
   * (sign-up)" ON in the console; the rules make sign-up harmless anyway,
   * since a user nobody listed reads nothing.
   */
  async createAccount(email, password) {
    if (this.mode === 'local') throw new Error('Local mode — there are no accounts.');
    const { secondaryAuth } = await import('./firebase.js');
    const auth2 = await secondaryAuth();
    const { fa } = this._fb;
    await fa.createUserWithEmailAndPassword(auth2, tidyEmail(email), password);
    await fa.signOut(auth2);
  },

  get isLead() { return this.role === ROLE.LEAD; },
  get isDesigner() { return this.role === ROLE.DESIGNER; },
  /** May change the accounts and their roles. Not a role. */
  get isMaster() { return this.mode === 'firebase' && Boolean(this.user?.email) && isMaster(access, this.user.email); },
};

/** Firebase's error codes are not sentences. Make them ones. */
export function friendlyAuthError(e) {
  const code = e?.code ?? '';
  if (code.includes('invalid-credential') || code.includes('wrong-password')
      || code.includes('user-not-found')) return 'Wrong email or password.';
  if (code.includes('weak-password')) return 'Firebase wants a stronger password — at least six characters.';
  if (code.includes('operation-not-allowed')) return 'Making accounts from the app is switched off in the Firebase console (Authentication, Sign-in method, Email/Password, "Enable create").';
  if (code.includes('email-already-in-use')) return 'That address already has a Firebase user.';
  if (code.includes('requires-recent-login')) return 'Sign out, sign in again, and then change it.';
  if (code.includes('invalid-email')) return 'That does not look like an email address.';
  if (code.includes('too-many-requests')) return 'Too many attempts — wait a minute and try again.';
  if (code.includes('network-request-failed')) return 'No connection to Firebase. Check the network.';
  if (code.includes('user-disabled')) return 'That account has been disabled.';
  return e?.message ?? 'Sign-in failed.';
}
