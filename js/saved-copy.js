// saved-copy.js — a stuck saved copy never stops a start (2026-11-25).
//
// Firestore keeps a saved copy of the data on the device (firebase.js). Every
// read waits for it to open, the server's too, so if something holds its
// database the app sits on the skeleton for ever. Seen on the owner's iPad,
// going to another Stella app and back: the likely cause is that Safari keeps
// the page just left frozen with Firestore's last clean-up write still open.
// Holding the same lock on a PC looks the same.
//
// SO THE COPY IS ASKED ONE SMALL QUESTION BEFORE ANYTHING WAITS ON IT. It never
// leaves the device, so it takes milliseconds. With no answer in COPY_WAIT the
// page reloads once and that load runs WITHOUT the saved copy, in memory, so
// nothing on the device can hold it. The flag is one-use and that load is not
// asked, so it cannot go round.
//
// THE STUCK COPY IS LEFT ALONE: changes not yet sent are in it, and they go on
// the next ordinary start. On the load without it, a change made with no
// signal lasts only while the page stays open; the strip says so (app.js).
//
// Pure, with the tests' seams: no Firebase here.

export const COPY_WAIT = 4000;
const SKIP = 'stella.design.skipSavedCopy';

/**
 * The next load is to run without the saved copy. False when that could not
 * be written down: reloading would then only ask the same question again.
 */
export function skipNextLoad(store = globalThis.sessionStorage) {
  try { store.setItem(SKIP, '1'); return store.getItem(SKIP) === '1'; } catch { return false; }
}

/** Is this load to run without it? Once: reading it clears it. */
export function takeSkip(store = globalThis.sessionStorage) {
  try { const v = store.getItem(SKIP); store.removeItem(SKIP); return v === '1'; } catch { return false; }
}

/**
 * Does the saved copy answer? An answer of any kind will do: "not on this
 * device" is one.
 * @param {() => Promise<any>} ask something only the device can answer
 */
export function copyAnswers(ask, wait = COPY_WAIT) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), wait);
    const answered = () => { clearTimeout(timer); resolve(true); };
    Promise.resolve().then(ask).then(answered, answered);
  });
}
