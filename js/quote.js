// quote.js — the time export (owner, 2026-11-10): a time-tracked job's
// recorded time as a Word document on the letterhead, like a quote. Pure: no
// store, no DOM, no zip (docx.js puts the parts in the file), so the tests
// hold every figure and every line of the XML still.
//
// TWO KINDS. INTERNAL (for sales, or the lead's own record) shows the time
// only: exact hours and minutes per line, and the total. EXTERNAL (for a
// customer) rounds each line UP to the next quarter hour and, when a $/h rate
// is given, prices each line and the total; GST (10%) is added when ticked.
// The total is the sum of the lines as printed, so the document always adds up.
//
// THE LINES are the job's top-level tasks (Concept, 3D, Drawings...), each with
// the tasks inside it counted in (timing.totals), sections passed through, in
// the job's order. Time on the job itself - the timer ran with no task in
// progress, or its task has since gone - is one line, "General". A line with
// no time to the minute is left out: a quote lists the work that was done.
//
// THE TEMPLATE is any .docx the lead uploads (the letterhead now, a quote
// template later). Its header, footer, styles and page setup are kept; the
// export replaces the page body, or, when the template has a paragraph that
// reads exactly {{content}}, that paragraph alone. Nothing of the letterhead
// is in this repository: with none uploaded, a plain A4 page (BLANK) stands in.

import { KIND, childrenOf, nameOf } from './tree.js';
import { totals, fmt } from './timing.js';
import { parseDay } from './dates.js';

const MIN = 60000;

/** External lines are rounded up to this many minutes. */
export const STEP_MIN = 15;

/** GST, when it is added. */
export const GST_RATE = 0.1;

/** A template is kept in parts of this size (Firestore holds 1 MiB a document; photos.js keeps the same margin). */
export const PART_BYTES = 900 * 1024;

/** The largest template that may be uploaded: four parts. The letterhead is 947 KB. */
export const MAX_TEMPLATE_BYTES = 4 * PART_BYTES;

/** A paragraph reading exactly this, in a template, is where the export goes. */
export const MARKER = '{{content}}';

export const DOCX_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/** The brand red of the letterhead's rule, for the small label over the title. */
const RED = 'EA282C';
const GREY = '595959';
const RULE = '1F1F1F';
const HAIR = 'BFBFBF';

// ---------------------------------------------------------------------------
// the lines and the figures
// ---------------------------------------------------------------------------

/**
 * The export's lines: each top-level task of the job with its time (the
 * tasks inside it included), in order, then "General" for time on the job
 * itself. Whole minutes; lines under half a minute are left out.
 * @returns {{id: string|null, name: string, min: number}[]}
 */
export function timeLines(idx, jobId, entries, now) {
  const t = totals(idx, jobId, entries, now);
  const lines = [];
  let inTasks = 0;
  const walk = (pid) => {
    for (const c of childrenOf(idx, pid)) {
      if (c.kind === KIND.task || c.kind === KIND.step) {
        const ms = t.get(c.id) ?? 0;
        inTasks += ms;
        lines.push({ id: c.id, name: nameOf(c).trim() || 'Untitled task', min: Math.round(ms / MIN) });
      } else if (c.kind === KIND.group) walk(c.id);
    }
  };
  walk(jobId);
  lines.push({ id: null, name: 'General', min: Math.round(Math.max(0, (t.get(jobId) ?? 0) - inTasks) / MIN) });
  return lines.filter((l) => l.min > 0);
}

/** Minutes rounded up to the next step (15): 1 → 15, 15 → 15, 16 → 30, 0 → 0. */
export const roundUp = (min, step = STEP_MIN) => (min > 0 ? Math.ceil(min / step) * step : 0);

/**
 * A rate as typed: '$120', '95.50', '1,200'. Null when blank (no prices);
 * an error when it is not a sum of money per hour.
 * @returns {{rate: number|null, error?: string}}
 */
export function parseRate(text) {
  const s = String(text ?? '').replace(/[\s$,]/g, '').replace(/\/h(ou)?r?$/i, '');
  if (!s) return { rate: null };
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return { rate: null, error: 'A rate is dollars an hour, like 120 or 95.50.' };
  const rate = Number(s);
  if (!(rate > 0)) return { rate: null, error: 'The rate has to be more than $0.' };
  if (rate > 10000) return { rate: null, error: 'That rate is more than $10,000 an hour.' };
  return { rate };
}

/**
 * The figures the document prints. Internal: exact minutes. External: each
 * line up to the quarter hour, and, with a rate, its price in cents; the
 * subtotal is the sum of the lines, GST is on the subtotal.
 * @param {{min: number}[]} lines  the lines to print (the ones left ticked)
 * @returns {{rows: object[], min: number, subtotal: number|null, gst: number|null, total: number|null}}
 */
export function figures(lines, { kind = 'internal', rate = null, gst = false } = {}) {
  const external = kind === 'external';
  const rateCents = external && rate > 0 ? Math.round(rate * 100) : null;
  const rows = lines.map((l) => {
    const min = external ? roundUp(l.min) : l.min;
    return { ...l, min, cents: rateCents === null ? null : Math.round((min * rateCents) / 60) };
  });
  const min = rows.reduce((s, r) => s + r.min, 0);
  if (rateCents === null) return { rows, min, subtotal: null, gst: null, total: null };
  const subtotal = rows.reduce((s, r) => s + r.cents, 0);
  const tax = gst ? Math.round(subtotal * GST_RATE) : null;
  return { rows, min, subtotal, gst: tax, total: subtotal + (tax ?? 0) };
}

/** '$1,234.50' from cents. */
export function money(cents) {
  const c = Math.abs(Math.round(cents ?? 0));
  const dollars = String(Math.floor(c / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${cents < 0 ? '-' : ''}$${dollars}.${String(c % 100).padStart(2, '0')}`;
}

/** Hours as a quote prints them: '2.25'. */
export const hours = (min) => (min / 60).toFixed(2);

/** A time as the app prints it: '2h 15m'. */
export const hm = (min) => fmt(min * MIN);

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** '10 November 2026': a document's date, from a calendar day. */
export function longDate(day) {
  const d = parseDay(day);
  return d ? `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}` : '';
}

/**
 * The file's name: 'Quote - Davit arm - 2026-11-10.docx'. Only what Windows
 * allows in a name, and short enough for a mail attachment.
 */
export function fileName(title, kind, day) {
  const clean = String(title ?? '').replace(/[<>:"/\\|?*\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/[. ]+$/, '');
  const name = clean.length > 60 ? `${clean.slice(0, 60).replace(/\s+\S*$/, '').trim() || clean.slice(0, 60)}` : clean;
  return `${kind === 'external' ? 'Quote' : 'Time'} - ${name || 'Job'} - ${day}.docx`;
}

// ---------------------------------------------------------------------------
// what the document says
// ---------------------------------------------------------------------------

/**
 * Everything the document prints, as plain data (the XML is made from this).
 * `status`: the job's status - an internal export of a job not yet Done says
 * the time is so far.
 */
export function docModel({ title, brief = '', revision = '', ref = '', day, kind = 'internal', rate = null, gst = false, lines, status = 'done' }) {
  const external = kind === 'external';
  const f = figures(lines, { kind, rate, gst });
  const priced = f.subtotal !== null;
  const timeCol = external ? 'Hours' : 'Time';
  const t = (min) => (external ? hours(min) : hm(min));
  const columns = priced ? ['Task', timeCol, 'Amount'] : ['Task', timeCol];
  const rows = f.rows.map((r) => (priced ? [r.name, t(r.min), money(r.cents)] : [r.name, t(r.min)]));
  let foot;
  if (!priced) foot = [['Total', t(f.min)]];
  else if (f.gst === null) foot = [['Total (ex GST)', t(f.min), money(f.total)]];
  else foot = [['Subtotal (ex GST)', t(f.min), money(f.subtotal)], ['GST (10%)', '', money(f.gst)], ['Total (inc GST)', '', money(f.total)]];
  const meta = [['Date', longDate(day)]];
  if (String(revision ?? '').trim()) meta.push(['Revision', String(revision).trim()]);
  if (String(ref ?? '').trim()) meta.push(['Reference', String(ref).trim()]);
  const notes = [];
  if (external) {
    notes.push(`Each line is rounded up to the next ${STEP_MIN} minutes.`);
    if (priced) notes.push(`Rate ${money(Math.round(rate * 100))} an hour, ex GST.`);
  } else if (status === 'cancelled') notes.push('The job was cancelled: this is the time recorded on it.');
  else if (status !== 'done') notes.push(`The job is not finished: this is the time so far, to ${longDate(day)}.`);
  return { label: external ? 'Quote' : 'Time summary', title: String(title ?? '').trim() || 'Untitled job', meta, brief: String(brief ?? ''), columns, rows, foot, notes, empty: !rows.length };
}

// ---------------------------------------------------------------------------
// WordprocessingML
// ---------------------------------------------------------------------------

/** Text safe inside XML: escaped, and without the control characters XML 1.0 forbids. */
export const xmlText = (s) => String(s ?? '')
  .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g, '')
  .replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** One run of text. Tabs inside become Word tabs. */
function run(text, { b = false, sz = null, color = null, caps = false, spacing = null } = {}) {
  const pr = [b ? '<w:b/><w:bCs/>' : '', caps ? '<w:caps/>' : '', color ? `<w:color w:val="${color}"/>` : '', spacing ? `<w:spacing w:val="${spacing}"/>` : '', sz ? `<w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/>` : ''].join('');
  const parts = String(text ?? '').split('\t').map((p) => (p ? `<w:t xml:space="preserve">${xmlText(p)}</w:t>` : ''));
  return `<w:r>${pr ? `<w:rPr>${pr}</w:rPr>` : ''}${parts.join('<w:tab/>')}</w:r>`;
}

/** One paragraph. */
function para(runs, { style = null, align = null, before = null, after = null, line = null, keepNext = false, ind = null } = {}) {
  const sp = before !== null || after !== null || line !== null
    ? `<w:spacing${before !== null ? ` w:before="${before}"` : ''}${after !== null ? ` w:after="${after}"` : ''}${line !== null ? ` w:line="${line}" w:lineRule="auto"` : ''}/>` : '';
  const pr = [style ? `<w:pStyle w:val="${style}"/>` : '', keepNext ? '<w:keepNext/>' : '', sp, ind ? `<w:ind w:left="${ind}" w:hanging="${ind}"/>` : '', align ? `<w:jc w:val="${align}"/>` : ''].join('');
  return `<w:p>${pr ? `<w:pPr>${pr}</w:pPr>` : ''}${runs.join('')}</w:p>`;
}

/** **bold** inside a line of the brief, as the panel shows it (panel.js formatBrief). */
function inline(text, o = {}) {
  const out = [];
  const re = /\*\*(.+?)\*\*/g;
  let at = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > at) out.push(run(text.slice(at, m.index), o));
    out.push(run(m[1], { ...o, b: true }));
    at = m.index + m[0].length;
  }
  if (at < text.length) out.push(run(text.slice(at), o));
  return out;
}

/** The brief as paragraphs: one per line, "- " lines as bullets, blank lines dropped. The last one leaves room for what follows. */
export function briefXml(brief, { last = 100 } = {}) {
  const lines = [];
  for (const line of String(brief ?? '').split(/\r?\n/)) {
    const m = /^\s*[-*•]\s+(.*)$/.exec(line);
    if (m) lines.push({ runs: [run('•\t'), ...inline(m[1])], after: 40, ind: 360 });
    else if (line.trim()) lines.push({ runs: inline(line.trim()), after: 100, ind: null });
  }
  return lines.map((l, i) => para(l.runs, { after: i === lines.length - 1 ? last : l.after, ind: l.ind })).join('');
}

const border = (side, sz, color) => `<w:${side} w:val="single" w:sz="${sz}" w:space="0" w:color="${color}"/>`;

function cell(text, width, { right = false, b = false, top = null, bottom = null, sz = 21, color = null, caps = false, keepNext = false } = {}) {
  const borders = [top ? border('top', top[0], top[1]) : '', bottom ? border('bottom', bottom[0], bottom[1]) : ''].join('');
  return `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/>${borders ? `<w:tcBorders>${borders}</w:tcBorders>` : ''}<w:vAlign w:val="center"/></w:tcPr>${
    para(text ? [run(text, { b, sz, color, caps, spacing: caps ? 10 : null })] : [], { before: 0, after: 0, line: 252, align: right ? 'right' : null, keepNext })}</w:tc>`;
}

/** The text width of a page, from a template's section properties (twips). A4 with 2.54 cm margins when it will not read. */
export function textWidth(sectPr) {
  const n = (re) => { const m = re.exec(sectPr ?? ''); return m ? Number(m[1]) : null; };
  const w = n(/<w:pgSz\b[^>]*\bw:w="(\d+)"/);
  const l = n(/<w:pgMar\b[^>]*\bw:left="(-?\d+)"/);
  const r = n(/<w:pgMar\b[^>]*\bw:right="(-?\d+)"/);
  const g = n(/<w:pgMar\b[^>]*\bw:gutter="(\d+)"/) ?? 0;
  const tw = w && l !== null && r !== null ? w - l - r - g : null;
  return tw && tw >= 3000 && tw <= 20000 ? tw : 9026;
}

/** Cell padding left and right (twips). The table reaches this far into each margin, so its text lines up with the page's. */
const PAD = 100;

/**
 * The table: a header row repeated on every page, the lines, then the
 * totals, kept on the page with the last line.
 */
export function tableXml(model, width = 9026) {
  const priced = model.columns.length === 3;
  const num = priced ? [1300, 1700] : [1700];
  const full = width + 2 * PAD;
  const widths = [full - num.reduce((s, x) => s + x, 0), ...num];
  const grid = `<w:tblGrid>${widths.map((w) => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>`;
  const tblPr = `<w:tblPr><w:tblW w:w="${full}" w:type="dxa"/><w:tblInd w:w="${-PAD}" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblCellMar><w:top w:w="70" w:type="dxa"/><w:left w:w="${PAD}" w:type="dxa"/><w:bottom w:w="70" w:type="dxa"/><w:right w:w="${PAD}" w:type="dxa"/></w:tblCellMar><w:tblLook w:val="0420" w:firstRow="1" w:lastRow="1" w:firstColumn="0" w:lastColumn="0" w:noHBand="1" w:noVBand="1"/></w:tblPr>`;
  const tr = (cells, { header = false } = {}) => `<w:tr><w:trPr><w:cantSplit/>${header ? '<w:tblHeader/>' : ''}</w:trPr>${cells.join('')}</w:tr>`;
  const head = tr(model.columns.map((c, i) => cell(c, widths[i], { right: i > 0, b: true, sz: 17, color: GREY, caps: true, bottom: [8, RULE] })), { header: true });
  const body = model.rows.map((r, k) => tr(r.map((c, i) => cell(c, widths[i], { right: i > 0, bottom: [4, HAIR], keepNext: k === model.rows.length - 1 }))));
  const foot = model.foot.map((r, k) => {
    const last = k === model.foot.length - 1;
    return tr(r.map((c, i) => cell(c, widths[i], { right: i > 0, b: last, top: k === 0 ? [8, RULE] : null, keepNext: !last })));
  });
  return `<w:tbl>${tblPr}${grid}${head}${body.join('')}${foot.join('')}</w:tbl>`;
}

/** The export's body: the label, the title, date and the like, the brief, the table, the notes. */
export function contentXml(model, width = 9026) {
  const out = [];
  out.push(para([run(model.label, { b: true, sz: 18, color: RED, caps: true, spacing: 20 })], { after: 40, keepNext: true }));
  out.push(para([run(model.title, { sz: 44 })], { style: 'Title', after: 120, keepNext: true }));
  out.push(para(model.meta.flatMap(([k, v], i) => [i ? run('     ') : '', run(`${k}  `, { sz: 18, color: GREY }), run(v, { sz: 18 })]).filter(Boolean), { after: 280 }));
  if (model.brief.trim()) {
    out.push(para([run('Brief', { b: true, sz: 17, color: GREY, caps: true, spacing: 10 })], { after: 80, keepNext: true }));
    out.push(briefXml(model.brief, { last: 320 }));
  }
  if (model.empty) out.push(para([run('No time recorded on this job yet.', { color: GREY })], { after: 120 }));
  else out.push(tableXml(model, width));
  // A table is never the last thing in a body: Word wants a paragraph after it.
  out.push(model.notes.length
    ? model.notes.map((n, i) => para([run(n, { sz: 17, color: GREY })], { before: i ? 0 : 160, after: 40 })).join('')
    : para([], { after: 0 }));
  return out.join('');
}

/**
 * A template's document.xml with the export in it. The section properties
 * (page size, margins, the letterhead's header and footer) are kept; the
 * rest of the body is replaced, or only the {{content}} paragraph when the
 * template has one.
 * @throws {Error} when it is not a Word document body
 */
export function fillDocument(documentXml, model) {
  const xml = String(documentXml ?? '');
  const open = /<w:body\b[^>]*>/.exec(xml);
  const close = xml.lastIndexOf('</w:body>');
  if (!open || close < open.index) throw new Error('That template has no page body Word can read.');
  const start = open.index + open[0].length;
  const inner = xml.slice(start, close);
  const sectAt = inner.lastIndexOf('<w:sectPr');
  const sectPr = sectAt >= 0 && /<\/w:sectPr>\s*$|<w:sectPr\b[^>]*\/>\s*$/.test(inner.slice(sectAt)) ? inner.slice(sectAt) : '';
  const content = contentXml(model, textWidth(sectPr));
  // The marker: a paragraph whose text is {{content}} alone (Word may split it over runs).
  const paras = inner.match(/<w:p\b(?:[^>]*\/>|[^>]*>[\s\S]*?<\/w:p>)/g) ?? [];
  const marker = paras.find((p) => (p.match(/<w:t\b[^>]*>([^<]*)<\/w:t>/g) ?? []).map((t) => t.replace(/<[^>]+>/g, '')).join('').trim() === MARKER);
  // A function, not a string: a replacement string reads "$1" in "$1,590.00" as a pattern.
  if (marker) return xml.slice(0, start) + inner.replace(marker, () => content) + xml.slice(close);
  return xml.slice(0, start) + content + sectPr + xml.slice(close);
}

/** docProps/core.xml with the document's title (shown in Word's Info and Explorer). */
export function fillCore(coreXml, title) {
  const xml = String(coreXml ?? '');
  const t = `<dc:title>${xmlText(title)}</dc:title>`;
  if (/<dc:title\s*\/>|<dc:title>[\s\S]*?<\/dc:title>/.test(xml)) return xml.replace(/<dc:title\s*\/>|<dc:title>[\s\S]*?<\/dc:title>/, t);
  return xml.replace(/<\/cp:coreProperties>/, `${t}</cp:coreProperties>`);
}

/**
 * Where a package's main document and its properties are, from _rels/.rels:
 * almost always word/document.xml and docProps/core.xml, but the package
 * says, so it is read rather than assumed.
 * @returns {{main: string, core: string|null}}
 */
export function partsOf(relsXml) {
  const target = (type) => {
    for (const m of String(relsXml ?? '').matchAll(/<Relationship\b[^>]*>/g)) {
      const t = /\bType="([^"]+)"/.exec(m[0])?.[1] ?? '';
      if (t.endsWith(type)) return (/\bTarget="([^"]+)"/.exec(m[0])?.[1] ?? '').replace(/^\//, '') || null;
    }
    return null;
  };
  return { main: target('/officeDocument') ?? 'word/document.xml', core: target('/core-properties') };
}

/** A Word template (.dotx) filled is a document: its main part is declared as one. */
export const asDocument = (contentTypesXml) => String(contentTypesXml ?? '').replace('wordprocessingml.template.main+xml', 'wordprocessingml.document.main+xml');

/** Is this the main part of a Word document? Null when it is, else why not. */
export function templateProblem(documentXml) {
  if (documentXml === null || documentXml === undefined) return 'That is not a Word document (.docx): it has no document inside.';
  if (!/<w:document\b/.test(documentXml) || !/<w:body\b/.test(documentXml)) return 'That Word file has no page body this app can fill.';
  return null;
}

// ---------------------------------------------------------------------------
// a template kept in parts, and the plain page used when there is none
// ---------------------------------------------------------------------------

/** Bytes in parts of `size` (the last one shorter). */
export function splitBytes(bytes, size = PART_BYTES) {
  const out = [];
  for (let i = 0; i < bytes.length; i += size) out.push(bytes.subarray(i, i + size));
  return out.length ? out : [new Uint8Array(0)];
}

/** The parts back as one array of bytes. */
export function joinBytes(parts) {
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}

/** '947 KB', '1.2 MB'. */
export const sizeText = (bytes) => (bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const PR = 'http://schemas.openxmlformats.org/package/2006/relationships';
const ODR = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

/**
 * A plain A4 Word document with nothing on the page: what the export fills
 * when no letterhead has been uploaded. Arial, so it reads the same on any PC.
 */
export const BLANK = {
  '[Content_Types].xml': `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`,
  '_rels/.rels': `${XML}<Relationships xmlns="${PR}"><Relationship Id="rId1" Type="${ODR}/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`,
  'word/_rels/document.xml.rels': `${XML}<Relationships xmlns="${PR}"><Relationship Id="rId1" Type="${ODR}/styles" Target="styles.xml"/></Relationships>`,
  'word/document.xml': `${XML}<w:document xmlns:w="${W}" xmlns:r="${ODR}"><w:body><w:p/><w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>`,
  'word/styles.xml': `${XML}<w:styles xmlns:w="${W}"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Arial" w:cs="Arial"/><w:sz w:val="21"/><w:szCs w:val="21"/><w:lang w:val="en-AU"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="264" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style><w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="80" w:line="240" w:lineRule="auto"/></w:pPr><w:rPr><w:sz w:val="44"/><w:szCs w:val="44"/></w:rPr></w:style><w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style></w:styles>`,
  'docProps/core.xml': `${XML}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title></dc:title></cp:coreProperties>`,
};
