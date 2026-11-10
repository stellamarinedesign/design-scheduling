// views/quote-ui.js — the time export's screens (owner, 2026-11-10): the
// Export time box on a time-tracked job, and Settings' "Time export", where
// the lead uploads the Word template (the letterhead for now) and sets the
// default rate. quote.js decides every figure; docx.js makes the file.
//
// WHAT YOU SEE IS WHAT GOES IN. The box shows the document's table as it
// will print - the lines, their times (rounded for External), the prices and
// the totals - and each line has a tick, so a line can be left out of this
// document without changing the job.
//
// THE LEAD'S ALONE (owner, 2026-11-10): offered on any tracked job, at any
// time; before the job is Done the box says the time is so far, and an
// internal document says so too.

import { el, btn, toast, prefs, isRefusal, loadProblem } from '../ui.js';
import { state, node, realName } from '../state.js';
import * as QT from '../quote.js';
import { Store } from '../store.js';
import * as A from '../actions.js';
import * as TC from '../timing.js';
import { openDialog, confirmDialog } from '../dialog.js';
import { nowISO, dayOf, dayLabel } from '../dates.js';

const KINDS = [['internal', 'Internal'], ['external', 'External']];
const KIND_HINT = {
  internal: 'For sales or your own records: the exact times, no prices.',
  external: 'For a customer: each line rounded up to the next 15 minutes, and priced when a rate is given.',
};

/** A rate as it is typed back into its field: '120', '95.50'. */
const rateText = (r) => (typeof r === 'number' && r > 0 ? (Number.isInteger(r) ? String(r) : r.toFixed(2)) : '');

/** Save a Blob on this computer under a name. */
function saveFile(blob, name) {
  const a = el('a', { href: URL.createObjectURL(blob), download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

/** settings/quote, or why it could not be read. */
async function readQuote() {
  try { return { q: (await Store.getQuote()) ?? {}, error: null }; } catch (e) { return { q: {}, error: e }; }
}

/**
 * Export time: an internal or external Word document of a job's recorded
 * time, on the uploaded template.
 */
export function openExport(jobId) {
  const job = node(jobId);
  if (!job || state.role !== 'lead') return;
  let kind = prefs.get('quoteKind', 'internal') === 'external' ? 'external' : 'internal';
  let gst = prefs.get('quoteGst', true) !== false;
  let entries = [];
  let loaded = false;
  let loadErr = null;
  let fromCache = false;
  let quote = null;           // {q, error} once read
  let busy = false;
  const left = new Set();     // lines unticked: ids, '' for General
  let unsub = null;

  openDialog((box, close, { dismiss }) => {
    box.classList.add('qx');
    const rate = el('input', { class: 'input qx-rate', type: 'text', inputmode: 'decimal', autocomplete: 'off', maxlength: '12', id: 'qx-rate', placeholder: 'No prices' });
    const rateErr = el('div', { class: 'form-err', role: 'alert', id: 'qx-rate-err' });
    const gstBox = el('input', { type: 'checkbox', checked: gst });
    const ref = el('input', { class: 'input qx-ref', type: 'text', maxlength: '40', autocomplete: 'off', placeholder: 'Optional' });
    const seg = el('div', { class: 'seg', role: 'group', 'aria-label': 'Document' });
    const hint = el('p', { class: 'hint qx-kind-hint' });
    const extFields = el('div', { class: 'qx-ext' },
      el('label', { class: 'field' }, el('span', { class: 'lbl' }, 'Rate ($/h)'), rate),
      el('label', { class: 'check-line qx-gst' }, gstBox, 'Add GST (10%)'));
    const preview = el('div', { class: 'qx-preview' });
    const notes = el('ul', { class: 'qx-notes' });
    const make = btn('Download .docx', () => download(), { cls: 'primary', ic: 'download' });
    const title = el('div', { class: 'meta wrap qx-job', title: job.title }, job.title);
    const when = el('div', { class: 'meta' });

    for (const [v, label] of KINDS) {
      seg.append(el('button', { type: 'button', 'aria-pressed': String(v === kind), dataset: { kind: v }, onclick: () => { kind = v; draw(); } }, label));
    }
    rate.addEventListener('input', () => { rate.removeAttribute('aria-invalid'); rate.removeAttribute('aria-describedby'); rateErr.textContent = ''; draw(); });
    gstBox.addEventListener('change', () => { gst = gstBox.checked; draw(); });
    ref.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); download(); } });
    rate.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); download(); } });

    box.append(
      el('div', { class: 'qx-head' }, el('h3', {}, 'Export time'), title, when),
      el('div', { class: 'qx-kind' }, seg, hint),
      el('div', { class: 'qx-fields' }, extFields, el('label', { class: 'field' }, el('span', { class: 'lbl' }, 'Reference'), ref)),
      rateErr,
      preview,
      notes,
      el('div', { class: 'actions' }, make, btn('Cancel', dismiss)));

    const fresh = () => node(jobId) ?? job;
    const rateNow = () => (kind === 'external' ? QT.parseRate(rate.value) : { rate: null });
    const lines = () => QT.timeLines(state.idx, jobId, entries, nowISO());
    const keyOf = (l) => l.id ?? '';
    const partial = () => fromCache && Store.offline();

    function draw() {
      const j = fresh();
      for (const b of seg.children) b.setAttribute('aria-pressed', String(b.dataset.kind === kind));
      hint.textContent = KIND_HINT[kind];
      extFields.hidden = kind !== 'external';
      when.textContent = [dayLabel(dayOf()), j.revision ? `Revision ${j.revision}` : ''].filter(Boolean).join(' · ');
      const r = rateNow();
      preview.textContent = '';
      notes.textContent = '';
      const all = loaded ? lines() : [];
      const shown = all.filter((l) => !left.has(keyOf(l)));
      make.disabled = busy || !loaded || !shown.length || partial() || (loadErr && !entries.length);
      if (!loaded) {
        preview.append(el('div', { class: 'skel qx-skel', 'aria-busy': 'true', 'aria-label': 'Loading the times' }));
        return;
      }
      if (loadErr && !entries.length) {
        preview.append(el('div', { class: 'state-msg tl-state', role: 'alert' },
          el('h4', {}, 'The times did not load'),
          ...loadProblem(loadErr).map((line) => el('p', {}, line)),
          el('div', {}, btn('Reload', () => location.reload(), { cls: 'sm' }))));
        return;
      }
      if (!all.length) {
        preview.append(el('div', { class: 'empty' }, el('span', {}, TC.onBench(j)
          ? 'No time recorded on this job yet. Start the timer at the top of the job, or add a stretch in its Time log.'
          : 'No time recorded on this job. Add the stretches worked on it in its Time log.')));
        return;
      }
      preview.append(table(all, shown, r.rate));
      const say = (text, cls = '') => notes.append(el('li', { class: cls }, text));
      if (partial()) say('Offline: this device may not hold every entry, so the export waits for the connection.', 'warn-text');
      if (j.status === 'cancelled') say('The job was cancelled: these are the times recorded on it.');
      else if (j.status !== 'done') say(`The job is not finished: the times are so far${kind === 'internal' ? ', and the document says so' : ''}.`);
      if (entries.some((e) => !e.end && !TC.stopOf(e, j, nowISO()))) say('A timer is running on this job: it counts to now.');
      if (!shown.length) say('Every line is unticked: tick one to export.');
      if (quote) {
        const t = quote.q?.template;
        if (quote.error) say(`The template could not be read (${isRefusal(quote.error) ? 'this account is not allowed to' : quote.error.message}), so it comes out on a plain page.`, 'warn-text');
        else if (t) say(`On the Word template ${t.name}.`);
        else notes.append(el('li', {}, 'No Word template uploaded, so it comes out on a plain page. ', el('button', { class: 'qx-link', type: 'button', onclick: settingsHere }, 'Upload one in Settings')));
      }
    }

    /** The preview: the document's table, a tick on each line. */
    function table(all, shown, r) {
      const external = kind === 'external';
      const each = new Map(QT.figures(all, { kind, rate: r, gst }).rows.map((x) => [keyOf(x), x]));
      const model = QT.docModel({ title: '', day: dayOf(), kind, rate: r, gst, lines: shown });
      const priced = model.columns.length === 3;
      const t = (min) => (external ? QT.hours(min) : QT.hm(min));
      const head = el('tr', {}, ...model.columns.map((c, i) => el('th', { scope: 'col', class: i ? 'num' : '' }, c)));
      const body = all.map((l) => {
        const x = each.get(keyOf(l));
        const on = !left.has(keyOf(l));
        const tick = el('input', { type: 'checkbox', checked: on, 'aria-label': `Include ${l.name}` });
        tick.addEventListener('change', () => { if (tick.checked) left.delete(keyOf(l)); else left.add(keyOf(l)); draw(); preview.querySelector(`[data-k="${CSS.escape(keyOf(l))}"] input`)?.focus(); });
        return el('tr', { class: on ? '' : 'off', dataset: { k: keyOf(l) } },
          el('td', {}, el('label', { class: 'qx-line' }, tick, el('span', {}, l.name))),
          el('td', { class: 'num' }, t(x.min)),
          priced ? el('td', { class: 'num' }, x.cents === null ? '' : QT.money(x.cents)) : null);
      });
      const foot = model.foot.map((row, k) => el('tr', { class: k === model.foot.length - 1 ? 'last' : '' },
        ...row.map((c, i) => el(i ? 'td' : 'th', { scope: i ? null : 'row', class: i ? 'num' : '' }, c))));
      return el('table', { class: 'qx-table', 'aria-label': 'What goes in the document' },
        el('thead', {}, head), el('tbody', {}, ...body), el('tfoot', {}, ...foot));
    }

    /** Settings on top of this box; the template line catches up when it closes. */
    async function settingsHere() {
      const { openSettings } = await import('../settings.js');
      await openSettings();
      quote = await readQuote();
      draw();
    }

    async function download() {
      if (make.disabled) return;
      const r = rateNow();
      if (r.error) {
        rateErr.textContent = r.error;
        rate.setAttribute('aria-invalid', 'true');
        rate.setAttribute('aria-describedby', 'qx-rate-err');
        rate.focus();
        return;
      }
      const j = fresh();
      const shown = lines().filter((l) => !left.has(keyOf(l)));
      busy = true;
      const label = make.lastChild.textContent;
      make.lastChild.textContent = 'Making it…';
      draw();
      try {
        quote = quote ?? await readQuote();
        const t = quote.error ? null : quote.q?.template ?? null;
        const bytes = t ? QT.joinBytes(await Store.getQuoteTemplate(t)) : null;
        const model = QT.docModel({ title: j.title, brief: j.brief, revision: j.revision, ref: ref.value, day: dayOf(), kind, rate: r.rate, gst, lines: shown, status: j.status });
        const { makeDocx } = await import('../docx.js');
        const blob = await makeDocx(bytes, model);
        const name = QT.fileName(j.title, kind, dayOf());
        saveFile(blob, name);
        prefs.set('quoteKind', kind);
        if (kind === 'external') prefs.set('quoteGst', gst);
        // The job keeps the rate last used on it: a field of its own, so the export does not count as touching the job.
        if (kind === 'external' && r.rate !== null && r.rate !== j.quoteRate) A.write({ patch: [{ id: jobId, quoteRate: r.rate }] }, 'The rate was not kept on the job');
        toast(`${kind === 'external' ? 'Quote' : 'Time summary'} saved to this computer: open it in Word to check it`);
        close(null);
      } catch (e) {
        busy = false;
        make.lastChild.textContent = label;
        draw();
        toast(isRefusal(e) ? 'The template could not be read: this account is not allowed to.' : `The document was not made: ${e.message}`, { warn: true });
      }
    }

    unsub = Store.watchTime({ jobId }, (list, meta) => {
      if (list) { entries = list; loadErr = null; fromCache = Boolean(meta?.fromCache); } else loadErr = meta?.error ?? new Error('The time entries could not be read.');
      loaded = true;
      if (!busy) draw();
    }, { cached: true });
    readQuote().then((v) => {
      quote = v;
      // The job's own last rate first, then the team's default; typed already wins.
      if (!rate.value) rate.value = rateText(job.quoteRate ?? v.q?.rate);
      if (!busy) draw();
    });
    draw();
    seg.querySelector('[aria-pressed="true"]')?.setAttribute('data-autofocus', '');
  }, { label: 'Export time', wide: true }).then(() => unsub?.());
}

// ---------------------------------------------------------------------------
// Settings: the Word template and the default rate (the lead)
// ---------------------------------------------------------------------------

/**
 * Settings' "Time export": the template every export is made on, and the
 * default $/h an external one starts from. `section` is Settings' own
 * section maker, so it looks like its neighbours.
 */
export function quoteSettings(section, markClean) {
  const status = el('div', { class: 'settings-row-sub qx-tpl', role: 'status' }, 'Reading…');
  const acts = el('div', { class: 'row' });
  const err = el('div', { class: 'form-err', role: 'alert' });
  const file = el('input', { type: 'file', accept: '.docx,.dotx,application/vnd.openxmlformats-officedocument.wordprocessingml.document', hidden: true, 'aria-label': 'Word template' });
  const rate = el('input', { class: 'input qx-rate', type: 'text', inputmode: 'decimal', autocomplete: 'off', maxlength: '12', placeholder: 'None', id: 'qs-rate' });
  const rateErr = el('div', { class: 'form-err', role: 'alert', id: 'qs-rate-err' });
  let q = {};
  let working = false;

  const draw = () => {
    acts.textContent = '';
    const t = q.template;
    if (t) {
      status.textContent = `${t.name} · ${QT.sizeText(t.size)} · uploaded ${dayLabel(dayOf(new Date(t.at)))}${t.by ? ` by ${t.by === state.me ? 'you' : realName(t.by) || t.by}` : ''}`;
      acts.append(btn('Replace…', () => file.click(), { cls: 'sm', ic: 'upload', attrs: working ? { disabled: '' } : {} }),
        btn('Remove', remove, { cls: 'sm ghost', attrs: working ? { disabled: '' } : {} }));
    } else {
      status.textContent = 'None yet: exports come out on a plain page.';
      acts.append(btn('Upload .docx…', () => file.click(), { cls: 'sm', ic: 'upload', attrs: working ? { disabled: '' } : {} }));
    }
  };

  // The rate field joins the page once its saved value is in it. Settings
  // notes what each field held when it opened, to ask before discarding
  // typing; a field filled in after that would read as typed and unsaved.
  const rateSlot = el('div', { class: 'row qx-rate-row' }, el('div', { class: 'skel qx-rate-skel', 'aria-busy': 'true', 'aria-label': 'Loading the rate' }));
  const load = async () => {
    try { q = (await Store.getQuote()) ?? {}; err.textContent = ''; }
    catch (e) { err.textContent = isRefusal(e) ? 'This account is not allowed to read the export settings.' : `The export settings did not load (${e.message}). Open Settings again to retry.`; }
    rate.value = rateText(q.rate);
    rateSlot.replaceChildren(el('label', { class: 'field' }, el('span', { class: 'lbl' }, 'Default rate ($/h)'), rate), btn('Save', saveRate, { cls: 'sm' }));
    draw();
  };

  file.addEventListener('change', async () => {
    const f = file.files?.[0];
    file.value = '';
    if (!f) return;
    if (Store.offline()) { err.textContent = 'Uploading a template needs a connection. Try again when you are back online.'; return; }
    working = true;
    err.textContent = '';
    draw();
    status.textContent = `Checking ${f.name}…`;
    try {
      const { checkTemplate } = await import('../docx.js');
      const t = await checkTemplate(f);
      status.textContent = `Uploading ${t.name}…`;
      const meta = await Store.saveQuoteTemplate({ parts: QT.splitBytes(t.bytes), name: t.name, size: t.size, by: state.me, at: nowISO() });
      q = { ...q, template: meta };
      toast(`Template saved: exports use ${t.name} from now on`);
    } catch (e) {
      err.textContent = isRefusal(e) ? 'That did not save: only the Design lead sets the template.' : e.message;
    }
    working = false;
    draw();
  });

  async function remove() {
    const ok = await confirmDialog({ title: 'Remove the template?', body: `Exports come out on a plain page until another is uploaded. ${q.template?.name ?? 'The file'} stays wherever you keep it.`, ok: 'Remove', destructive: true });
    if (!ok) return;
    if (Store.offline()) { err.textContent = 'Removing the template needs a connection.'; return; }
    working = true;
    draw();
    try { await Store.removeQuoteTemplate(); q = { ...q, template: null }; toast('Template removed: exports come out on a plain page'); }
    catch (e) { err.textContent = isRefusal(e) ? 'That did not save: only the Design lead sets the template.' : `That did not save: ${e.message}`; }
    working = false;
    draw();
  }

  const saveRate = async () => {
    const r = QT.parseRate(rate.value);
    if (r.error) {
      rateErr.textContent = r.error;
      rate.setAttribute('aria-invalid', 'true');
      rate.setAttribute('aria-describedby', 'qs-rate-err');
      rate.focus();
      return;
    }
    if (r.rate === (q.rate ?? null)) { markClean(); return; }
    const p = Store.saveQuoteRate(r.rate);
    const said = r.rate === null ? 'Default rate cleared' : `Default rate saved: ${QT.money(Math.round(r.rate * 100))} an hour`;
    if (Store.offline()) {
      q = { ...q, rate: r.rate };
      markClean();
      toast(`${said}, kept on this device until the connection is back`);
      p.catch((e) => toast(isRefusal(e) ? 'The rate did not save: only the Design lead sets it.' : `The rate did not save: ${e.message}`, { warn: true }));
      return;
    }
    try { await p; q = { ...q, rate: r.rate }; rate.value = rateText(r.rate); markClean(); toast(said); }
    catch (e) { toast(isRefusal(e) ? 'Could not save: only the Design lead sets the rate.' : `Could not save: ${e.message}`, { warn: true }); }
  };
  rate.addEventListener('input', () => { rateErr.textContent = ''; rate.removeAttribute('aria-invalid'); rate.removeAttribute('aria-describedby'); });
  rate.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); saveRate(); } });

  load();
  return section('Time export',
    el('div', { class: 'settings-row-sub' }, 'Export time on a time-tracked job makes a Word document on this template: your letterhead, or a quote template. The export replaces the page body, or goes where a line reads {{content}}.'),
    el('div', { class: 'settings-row' }, el('div', { class: 'qx-tpl-wrap' }, el('div', { class: 'lbl' }, 'Word template'), status), acts),
    err,
    file,
    rateSlot,
    rateErr,
    el('div', { class: 'hint' }, 'An external export starts from this; each job keeps the rate last used on it.'));
}
