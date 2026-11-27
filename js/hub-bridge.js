// hub-bridge.js — the hub (Hubinator), when it can be reached (2026-11-23).
//
// Hubinator is one login for every Stella app. This app keeps its own
// Firebase project, rules, data and roles; joining adds one question at
// start-up: "is the person signed in here the person signed in to the hub?"
// The hub's shared file, /core/v1/hub.js, answers it, and signs this app in
// to its OWN project as that person with a key the hub holds. The contract is
// the comment at the top of that file, in the Stella-Hubinator repo; it is
// never copied here.
//
// A DEVICE ALREADY SIGNED IN CARRIES ON. The file lives at the site root, so
// its address only resolves on the live site. When it is slow or broken,
// loadHub returns null and a device with a session of its own here starts as
// before. A device with none meets the hub's "cannot be reached" card, or the
// app's own copy of it (noUserAction), never the app's old sign-in form
// (2026-11-27): a linked login has no password of its own here, and an
// unlinked one links through the hub. Off the live site (a worktree on
// localhost) there is never a hub, and the old form stays, for building and
// testing only. Local mode never gets this far (auth.js returns before the
// Firebase branch).
//
// The decisions are small pure functions so the tests can reach them with a
// stand-in Hub and a stand-in Firebase auth; nothing here imports the store
// or Firebase.

export const HUB_URL = '/core/v1/hub.js';
const WAIT_MS = 4000;

const tidy = (e) => String(e ?? '').trim().toLowerCase();

/**
 * The hub's file, or null on any failure: not found, an error in it, or
 * slower than four seconds. `load` is the tests' seam.
 * @returns {Promise<object|null>} the Hub
 */
export async function loadHub({ url = HUB_URL, wait = WAIT_MS, load = (u) => import(u) } = {}) {
  let timer = null;
  try {
    const late = new Promise((_, no) => { timer = setTimeout(() => no(new Error('timed out')), wait); });
    const mod = await Promise.race([load(url), late]);
    return mod?.Hub ?? null;
  } catch (e) {
    console.warn('[hub] not loaded:', e?.message ?? e);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Ask for the hub's file now and use it later: what comes back is loadHub's
 * `load`. The four-second limit still starts when it is waited for, not now,
 * so a slow first load has the whole start-up to fetch it in.
 */
export function askForHub(url = HUB_URL, load = (u) => import(u)) {
  const asked = Promise.resolve().then(() => load(url));
  asked.catch(() => {});       // loadHub says so when it is waited for
  return () => asked;
}

/**
 * The app's own session as Firebase first reports it. Once: the hub is not
 * asked anything until the app knows whether it is already signed in, and a
 * one-shot listener works on every SDK version.
 */
export function firstUser(fa, auth) {
  return new Promise((resolve) => {
    let done = false;
    const stop = fa.onAuthStateChanged(auth, (user) => {
      if (done) return;
      done = true;
      resolve(user);
      queueMicrotask(() => stop());
    });
  });
}

/**
 * What Hub.connect is asked. `title` is the app's name on the hub's own cards
 * ("No access to Design Scheduling", "Link your Design Scheduling login").
 * `signIn` takes a token as well as a password: nothing sends one today, it
 * is the seam a token service could use later with no app release.
 * No `legacy` (2026-11-27): when the hub cannot be reached it draws its own
 * card, with Try again, rather than handing back to the app's old form.
 * Not `strict` either: that would also sign out every device that has never
 * met the hub, which waits for the clean-up release.
 */
export function connectOptions({ fb, projectId, title = 'Design Scheduling' }) {
  return {
    project: projectId,
    title,
    session: () => fb.auth.currentUser?.email ?? null,
    signIn: ({ email, password, token } = {}) => (token
      ? fb.fa.signInWithCustomToken(fb.auth, token)
      : fb.fa.signInWithEmailAndPassword(fb.auth, email, password)),
    signOut: () => fb.fa.signOut(fb.auth),
  };
}

/** The live site, where the hub's file is. Anywhere else there is never a hub. */
export const HUB_SITE = 'stellamarinedesign.github.io';

/** The hub's own words on its "cannot be reached" card, which the app's copy repeats. */
export const CANNOT_REACH = {
  title: 'The hub cannot be reached',
  say: 'Check the connection, then try again.',
  act: 'Try again',
};

/**
 * Firebase reports no user: what the page does.
 *   reload   it had started: the session went while the page was open (a
 *            login just linked, or given a new key); a reload asks the hub again
 *   nothing  the hub has drawn its full-screen card (no access, a key it
 *            could not mend, or it cannot be reached); the app draws nothing
 *            behind it. `hubCard`: one of the hub's screens is on the page.
 *   cannot   the hub could not be reached and could not say so itself (its
 *            file did not load, connect threw, or its card's own code did
 *            not): the app's own copy of that card
 *   signin   off the live site (`onSite` false) with no hub, as there never
 *            is one there: the app's old form, for building and testing only
 */
export function noUserAction({ started, hubState, onSite = false, hubCard = false }) {
  if (started) return 'reload';
  if (hubState === 'none' || hubState === 'broken') return 'nothing';
  if (hubState === 'unreachable' && hubCard) return 'nothing';
  if (!onSite && hubState == null) return 'signin';
  return 'cannot';
}

/**
 * The hub's person changed in another tab (signed out, or somebody else):
 * reload when they are no longer the app's own signed-in address. A device
 * the hub left alone (`legacy`) is never troubled.
 */
export function shouldReload({ state, hubEmail, appEmail }) {
  if (state === 'legacy') return false;
  return tidy(hubEmail) !== tidy(appEmail);
}

/**
 * The whole of the app's side, run once at start-up before the app's own
 * auth listener: wait for the first auth state, load the hub, connect, draw
 * the app switcher into `slot`, and watch for the hub's person changing.
 * @returns {Promise<{Hub: object, state: string}|null>} null with no hub
 */
export async function joinHub({ fb, projectId, slot = null, reload = () => location.reload(), load } = {}) {
  await firstUser(fb.fa, fb.auth);
  const Hub = await loadHub(load ? { load } : {});
  if (!Hub) return null;
  let state;
  try {
    const r = await Hub.connect(connectOptions({ fb, projectId }));
    state = r?.state ?? 'unreachable';
  } catch (e) {
    // A fault in the hub's own code is no reason to lock anyone out.
    console.warn('[hub] connect failed:', e?.message ?? e);
    return null;
  }
  // It draws nothing for a login with fewer than two apps, or inside a
  // per-app iPad icon.
  if (slot) { try { Hub.switcher(slot, { current: projectId }); } catch (e) { console.warn('[hub] switcher:', e?.message ?? e); } }
  Hub.onChange((me) => {
    if (shouldReload({ state, hubEmail: me?.email ?? null, appEmail: fb.auth.currentUser?.email ?? null })) reload();
  });
  return { Hub, state };
}
