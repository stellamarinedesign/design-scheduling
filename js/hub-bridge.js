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
// FAIL OPEN. The file lives at the site root, so its address only resolves
// on the live site. Anywhere else (a worktree on localhost, the tests page),
// or when it is slow or broken, loadHub returns null and the app signs in
// exactly as it did before the hub. Local mode never gets this far
// (auth.js returns before the Firebase branch).
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
 * `legacy` does nothing: with no user, the app's own listener draws the old
 * form (app.js boot).
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
    legacy: () => {},
  };
}

/**
 * Firebase reports no user: what the page does.
 *   reload   it had started: the session went while the page was open (a
 *            login just linked, or given a new key); a reload asks the hub again
 *   nothing  the hub has drawn its full-screen card (no access, or a key it
 *            could not mend); the app draws nothing behind it
 *   signin   no hub file, or the hub could not be reached: the app's own form
 */
export function noUserAction({ started, hubState }) {
  if (started) return 'reload';
  if (hubState === 'none' || hubState === 'broken') return 'nothing';
  return 'signin';
}

/**
 * THE APP'S OWN FORM WHILE THE HUB IS SILENT (2026-11-27, from Hubinator's
 * brief FALLBACK_FORM_WORDS). The form shows when the hub did not answer: no
 * hub file in time, or connect said `unreachable`. A login already linked has
 * no password of its own here any more (linking swapped it for the hub's
 * key, which nobody knows), so its person can only type their Hubinator
 * password, and "Wrong email or password" would be untrue and give them
 * nothing to do; a few tries more and Firebase's "Too many attempts" can
 * refuse the hub's own key for a while once it is back. So the form says why
 * it is there, and a refused password says what is true.
 *
 * The live site only: anywhere else (localhost, a worktree, the tests page)
 * there is never a hub file, so its absence says nothing about the hub. Local
 * mode never shows the form. `in` and `legacy` come with a user; `none` and
 * `broken` draw the hub's own card instead. The form itself goes at the
 * clean-up release (`strict: true`), with the hub's own card in its place.
 */
export const HUB_SITE = 'stellamarinedesign.github.io';
export const SILENT_LINE = "Hubinator isn't answering, so this is Design Scheduling's own sign-in. A Hubinator password won't work here.";
export const SILENT_REFUSED = "That password doesn't sign in here. If it's your Hubinator password, try Hubinator again in a minute.";

/** Is the app's own form up because the hub did not answer? */
export function hubSilent({ mode, hubState, host }) {
  if (mode !== 'firebase') return false;
  if (hubState === 'unreachable') return true;
  return hubState == null && host === HUB_SITE;
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
