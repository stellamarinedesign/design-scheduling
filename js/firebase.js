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
// From Firebase Console → Project settings → Your apps. This app's own
// project, deliberately NOT the board's: stella-design-scheduling
// ("Stella Design Scheduling"). Emptying it puts the whole app in LOCAL MODE
// (no sign-in, data in localStorage, one machine).
// ---------------------------------------------------------------------------
export const firebaseConfig = {
  apiKey: 'AIzaSyDNzGoZiogOQhr6OALckHAmlqYe8c36o84',
  authDomain: 'stella-design-scheduling.firebaseapp.com',
  projectId: 'stella-design-scheduling',
  storageBucket: 'stella-design-scheduling.firebasestorage.app',
  messagingSenderId: '663047303134',
  appId: '1:663047303134:web:55114e9203e3d7a344774f',
};

// ---------------------------------------------------------------------------
// LOCAL MODE ON PURPOSE, per device. With the project configured, live is the
// default; development and trying things out must never touch live data. So
// `?local=1` switches this device into local mode and remembers it
// (localStorage), `?local=0` switches it back. Local mode shows its strip
// under the header, so nobody mistakes it for the live app.
//   Development: http://localhost:8790/?local=1
// ---------------------------------------------------------------------------
const LOCAL_KEY = 'stella.design.localMode';

function readLocalSwitch() {
  try {
    const v = new URLSearchParams(window.location.search).get('local');
    if (v === '1') window.localStorage.setItem(LOCAL_KEY, '1');
    else if (v === '0') window.localStorage.removeItem(LOCAL_KEY);
    return window.localStorage.getItem(LOCAL_KEY) === '1';
  } catch {
    return false;                 // no storage: live, as the default is
  }
}

/** Is this device switched into local mode? Read once, at load. */
export const localForced = readLocalSwitch();

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
  if (localForced) { _failed = 'local mode switched on for this device'; return null; }
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
    //
    // A PERSISTENT CACHE, so an edit made offline survives a reload and is
    // sent when the connection is back - which is what the offline strip
    // promises. Without it the cache is memory only and a reload loses the
    // edit. The multiple-tab manager lets two tabs of the app share it
    // (Home in one, Tasks in another) instead of the second failing over.
    _fb = {
      app,
      db: fs.initializeFirestore(app, {
        experimentalAutoDetectLongPolling: true,
        localCache: fs.persistentLocalCache({ tabManager: fs.persistentMultipleTabManager() }),
      }),
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
