// auth.js — sign-in and roles. Copied from the board, with this app's roles.
//
// Firebase email/password, no self-signup. SINCE THE HUB (2026-11-23) people
// and roles are given in Hubinator, which signs this app in to its own
// project as the hub's person (hub-bridge.js); this app's own form, password
// dialog and user-making stay only as the fallback while the hub is new, and
// go in the clean-up release.
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
import { LOCAL_AS } from './team.js';
import { SILENT_REFUSED } from './hub-bridge.js';

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

// LOCAL MODE, VIEWED AS ANOTHER ROLE (Phase 2). Local mode cannot show a
// designer's, contributor's or manager's screens with real accounts, so this
// browser can be switched to view as one of a small invented team
// (team.js LOCAL_AS). Local mode only: with Firebase the role is the access
// document's and nothing here applies. Changing it reloads the page.
const LOCAL_ROLE_KEY = 'stella.design.localRole';
export function localRole() {
  try { const r = localStorage.getItem(LOCAL_ROLE_KEY); return Object.values(ROLE).includes(r) && r !== ROLE.NONE ? r : ROLE.LEAD; } catch { return ROLE.LEAD; }
}
export function setLocalRole(role) {
  try { if (role === ROLE.LEAD) localStorage.removeItem(LOCAL_ROLE_KEY); else localStorage.setItem(LOCAL_ROLE_KEY, role); } catch { /* this session only */ }
}

export const Auth = {
  mode: 'local',        // 'firebase' | 'local'
  user: null,
  role: ROLE.NONE,
  hub: null,            // the hub (hub-bridge.js), when it loaded
  hubState: null,       // what it answered: in | legacy | none | broken | unreachable

  /**
   * @param {(state: {role, email, mode}) => void} onChange
   * @returns {Promise<'firebase'|'local'>}
   */
  async init(onChange) {
    const { getFirebase, firebaseConfig, isConfigured, localForced } = await import('./firebase.js');
    // The hub's file is asked for now, beside Firebase, and waited for after
    // the first auth state (joinHub), so it is not one more wait at the end.
    const { joinHub, askForHub } = await import('./hub-bridge.js');
    const load = isConfigured() && !localForced ? askForHub() : undefined;
    const fb = await getFirebase();

    if (!fb) {
      // LOCAL MODE. There is no auth to enforce and no second device to
      // protect against, so the single person on this machine is the lead.
      // The UI says so plainly rather than implying a login happened.
      this.mode = 'local';
      this.role = localRole();
      this.user = null;
      onChange({ role: this.role, email: null, mode: 'local' });
      return 'local';
    }

    this.mode = 'firebase';
    this._fb = fb;
    // THE HUB, before the app's own listener: it may sign this app in (or
    // out) as the hub's person first. Fails open: with no hub this is as
    // before. app.js and settings.js read `hub` and `hubState`.
    const joined = await joinHub({ fb, projectId: firebaseConfig.projectId, slot: document.getElementById('hubSlot'), load });
    this.hub = joined?.Hub ?? null;
    this.hubState = joined?.state ?? null;
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
  get me() { return this.mode === 'local' ? (LOCAL_AS[this.role] ?? LOCAL_ME) : tidyEmail(this.user?.email); },

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

  /** True when this app is signed in as the hub's person: Password and Sign out are the hub's. */
  get viaHub() { return this.mode === 'firebase' && this.hubState === 'in' && Boolean(this.hub); },

  /**
   * Sign out of the hub as well when signed in through it (it leaves a mark
   * so the other apps on this device sign out when next opened), then out of
   * this app. A hub that will not answer does not keep anyone signed in here.
   */
  async signOutEverywhere() {
    if (this.viaHub) {
      try { await this.hub.signOut(); } catch (e) { console.warn('[hub] sign-out failed:', e?.message ?? e); }
    }
    await this.signOut();
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

/**
 * Firebase's error codes are not sentences. Make them ones. `hubSilent`: the
 * own form is up because the hub did not answer (hub-bridge.js), so a refused
 * password may well be a Hubinator one, and says so.
 */
export function friendlyAuthError(e, { hubSilent = false } = {}) {
  const code = e?.code ?? '';
  if (code.includes('invalid-credential') || code.includes('wrong-password')
      || code.includes('user-not-found')) return hubSilent ? SILENT_REFUSED : 'Wrong email or password.';
  if (code.includes('weak-password')) return 'Firebase wants a stronger password — at least six characters.';
  if (code.includes('operation-not-allowed')) return 'Making accounts from the app is switched off in the Firebase console (Authentication, Sign-in method, Email/Password, "Enable create").';
  if (code.includes('email-already-in-use')) return 'That address already has a Firebase user.';
  if (code.includes('requires-recent-login')) return 'Sign out, sign in again, and then change it.';
  if (code.includes('invalid-email')) return 'That does not look like an email address.';
  if (code.includes('too-many-requests')) return 'Too many attempts — wait a minute and try again.';
  if (code.includes('network-request-failed')) return 'No connection to Firebase. Check the network.';
  if (code.includes('user-disabled')) return 'That account has been disabled.';
  // Anything else is Firebase's own wording: never shown (stella-internal-ux).
  return 'Sign-in did not work just now. Check the address and password and try again; if it keeps happening, reload the page.';
}
