// firebase.js — one Firebase app, shared by the store and the auth gate.
// Copied from the production board (CLAUDE.md, "Modules copied from the
// board"), with this app's own, separate project.
//
// The config block below is a set of PUBLIC identifiers, not secrets. Every
// visitor's browser needs it to talk to Firebase, so it cannot be hidden.
// All protection comes from Auth plus the Firestore rules (firestore.rules in
// this repo). Do not try to obscure it, and do not rotate the key if GitHub
// secret scanning flags the `AIzaSy…` string — a Firebase web key is public
// by design.

const SDK = 'https://www.gstatic.com/firebasejs/10.12.2';

// ---------------------------------------------------------------------------
// Paste from Firebase Console → Project settings → Your apps, once the
// project exists (it is deliberately NOT the board's project).
// Leaving this empty keeps the whole app in LOCAL MODE: no sign-in, data in
// localStorage, one machine. That is how Phase 1 is built and tested.
// ---------------------------------------------------------------------------
export const firebaseConfig = {
  apiKey: '',
  authDomain: '',
  projectId: '',
  storageBucket: '',
  messagingSenderId: '',
  appId: '',
};

// APP CHECK — deliberately off, as on the board. Sign-in plus the Firestore
// rules are the gate: every collection requires a LISTED account.
export const APPCHECK_SITE_KEY = '';

export const isConfigured = () => Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);

let _fb = null;
let _failed = null;

/**
 * @returns {Promise<{app, db, auth, fs, fa}|null>} null when unconfigured or
 *          unreachable — callers fall back to local mode.
 */
export async function getFirebase() {
  if (_fb) return _fb;
  if (_failed) return null;
  if (!isConfigured()) { _failed = 'Firebase not configured'; return null; }

  try {
    // THREE FETCHES, NOT THREE ROUND TRIPS. Awaited one after the other, a
    // phone on a slow connection paid the latency three times over before the
    // first line of application code ran.
    const [{ initializeApp }, fs, fa] = await Promise.all([
      import(`${SDK}/firebase-app.js`),
      import(`${SDK}/firebase-firestore.js`),
      import(`${SDK}/firebase-auth.js`),
    ]);
    const app = initializeApp(firebaseConfig);

    if (APPCHECK_SITE_KEY) {
      try {
        const ac = await import(`${SDK}/firebase-app-check.js`);
        ac.initializeAppCheck(app, {
          provider: new ac.ReCaptchaV3Provider(APPCHECK_SITE_KEY),
          isTokenAutoRefreshEnabled: true,
        });
      } catch (e) {
        console.warn('[AppCheck] activation failed — continuing without it:', e.message);
      }
    }

    // LONG-POLLING DETECTION, ON PURPOSE. Mobile carriers, captive portals and
    // corporate proxies mangle Firestore's streaming transport, and the SDK's
    // own fallback waits tens of seconds first — "blank screen for a minute on
    // a phone". Probing up front costs nothing where the stream is fine.
    _fb = {
      app,
      db: fs.initializeFirestore(app, { experimentalAutoDetectLongPolling: true }),
      auth: fa.getAuth(app),
      fs,
      fa,
    };
    return _fb;
  } catch (e) {
    _failed = e.message;
    console.warn('[firebase] unreachable —', e.message);
    return null;
  }
}

export const failureReason = () => _failed;

// A SECOND AUTH, for making accounts. createUserWithEmailAndPassword signs
// the new user in on whichever auth it is called with; on the main one that
// would sign the master out of their own session. So accounts are made on a
// second Firebase app, same config, separate auth, signed out again at once.
let _second = null;
export async function secondaryAuth() {
  const fb = await getFirebase();
  if (!fb) return null;
  if (!_second) {
    const { initializeApp } = await import(`${SDK}/firebase-app.js`);
    _second = fb.fa.getAuth(initializeApp(firebaseConfig, 'accounts'));
  }
  return _second;
}
