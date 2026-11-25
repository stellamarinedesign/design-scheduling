// startwatch.js — the start-up watch: never a skeleton for ever.
//
// A CLASSIC SCRIPT, WRITTEN INLINE. tools/importmap.py copies this file into
// index.html between the startwatch markers, so it runs before any module has
// arrived and costs no request of its own (as the production board's
// watchdog.js). It is never imported. Edit it here and rerun the tool; a test
// fails when the page's copy differs from this file.
//
// WHAT IT WATCHES. Everything between opening the page and the first draw of
// the data: the modules, Firebase, the sign-in store, the hub, the access
// list, the first answer. Any of them can wait without limit, with only the
// skeleton showing. app.js calls `finish` once there is something real on
// screen (the data, a sign-in screen, an error that says why).
//
// WHAT IT SAYS, after LIMIT, in one line under the header, with Reload beside
// it. It never reloads by itself: on a slow link that would throw away what
// has arrived. While something covers the page (the hub's sign-in screen) the
// person is not waiting, and the count starts again once it has gone.
//
// THE BACK BUTTON. Firestore shuts itself down as a page is left, so a page
// the browser brings back whole (`persisted`) looks alive but no longer
// updates or saves. It reloads.
(function () {
  var LIMIT = 8000;
  var GUARD = 'stella.design.startReloadAt';   // Reload pressed here: the second time, say more
  var WORDS = {
    offline: 'Offline. The app opens when the connection is back.',
    slow: 'Still loading. If it does not open soon, reload the page.',
    again: 'Still not loading. Close the app fully, then open it again.'
  };
  var since = Date.now();
  var done = false;
  var timer = null;
  window.__boot = { finish: finish, words: words };

  /** Which line: none until the limit, except offline, which is said at once. */
  function words(o) {
    if (!o.online) return WORDS.offline;
    if (o.waited < LIMIT) return '';
    return o.again ? WORDS.again : WORDS.slow;
  }

  function reloadedLately() {
    try { return Date.now() - (Number(sessionStorage.getItem(GUARD)) || 0) < 120000; } catch (e) { return false; }
  }

  /** Is something over the page (the hub's full-screen card)? */
  function covered() {
    var app = document.getElementById('app');
    var top = document.elementFromPoint(window.innerWidth / 2, 8);
    return !!(app && top && top !== document.body && top !== document.documentElement && !app.contains(top));
  }

  function say(text) {
    var n = document.getElementById('bootNote');
    if (!n) return;
    var t = n.querySelector('.boot-text');
    if (t.textContent !== text) t.textContent = text;      // said once, not every look
    n.hidden = !text;
  }

  function look() {
    if (done) return;
    if (covered()) { since = Date.now(); say(''); return; }
    say(words({ online: navigator.onLine !== false, waited: Date.now() - since, again: reloadedLately() }));
  }

  /** There is something real on screen: the line goes, the watch stops. */
  function finish() {
    if (done) return;
    done = true;
    clearInterval(timer);
    say('');
    try { sessionStorage.removeItem(GUARD); } catch (e) { /* a private window */ }
  }

  timer = setInterval(look, 1000);
  window.addEventListener('offline', look);
  window.addEventListener('online', function () { since = Date.now(); look(); });
  document.addEventListener('click', function (e) {
    if (!e.target.closest || !e.target.closest('#bootReload')) return;
    try { sessionStorage.setItem(GUARD, String(Date.now())); } catch (err) { /* a private window */ }
    location.reload();
  });
  window.addEventListener('pageshow', function (e) { if (e.persisted) location.reload(); });
})();
