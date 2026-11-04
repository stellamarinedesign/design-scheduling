// views/import.js — the staged import (lead only). TileDo's data.json and
// archive.json, and the Excel tracker's Todo sheet, read in this browser,
// shown as a preview you map onto your categories, and written only on Apply.
// The files go nowhere else, and nothing about them is kept but the result.

import { el, btn, pill, toast, toastError, prefs } from '../ui.js';
import { state } from '../state.js';
import * as T from '../tree.js';
import * as S from '../status.js';
import { Store, newId } from '../store.js';
import { nowISO } from '../dates.js';
import * as TD from '../import/tiledo.js';
import * as XL from '../import/excel.js';
import { go } from '../router.js';

// Same build the production board uses.
const SHEETJS_URL = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs';

const st = {
  tiledo: null,        // { parsed, plan, names }
  excel: null,         // { parsed, plan: {into, skip}, name }
  archiveDone: true,
  busy: false,
  error: '',
};

let host = null;
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

export function renderImport(root) {
  host = root;
  draw();
}

function draw() {
  if (!host) return;
  host.textContent = '';
  const inner = el('div', { class: 'imp' });
  host.append(inner);
  inner.append(el('div', { class: 'view-head' },
    el('h1', { class: 'h1' }, 'Import'),
    el('span', { class: 'meta' }, 'Staged: you see it all first, and nothing is written until Apply.')));
  if (state.role !== 'lead') { inner.append(el('p', {}, 'Only the Design lead imports.')); return; }

  inner.append(el('div', { class: 'imp-sources' },
    source('TileDo', 'data.json, and archive.json if you want the archive too. TileDo keeps them in the .tiledo folder in your Windows profile.', '.json,application/json', true, loadTiledo, st.tiledo?.names),
    source('Excel tracker', 'The Drafting Progress Tracker workbook. Its Todo sheet is read; the Progress sheet waits for the Progress page.', '.xlsx,.xlsm,.xls', false, loadExcel, st.excel?.name ? [st.excel.name] : null)));
  if (st.error) inner.append(el('div', { class: 'form-err', role: 'alert' }, st.error));
  if (st.busy) inner.append(el('div', { class: 'meta', 'aria-busy': 'true' }, 'Reading…'));

  if (st.tiledo) inner.append(tiledoPreview());
  if (st.excel) inner.append(excelPreview());
  if (st.tiledo || st.excel) inner.append(applyBar());
}

function source(title, words, accept, multiple, onFiles, loaded) {
  const input = el('input', { type: 'file', accept, multiple, 'aria-label': `${title} files` });
  input.addEventListener('change', () => { if (input.files?.length) onFiles([...input.files]); });
  return el('div', { class: 'imp-card' },
    el('h2', { class: 'h2' }, title),
    el('p', {}, words),
    el('div', { class: 'imp-file' }, input),
    loaded?.length ? el('div', { class: 'meta' }, `Loaded: ${loaded.join(', ')}`) : null);
}

/** Existing categories (not sections), indented, for the "Into" choices. */
function placeOptions() {
  const out = [];
  const walk = (pid, depth) => {
    for (const c of T.childrenOf(state.idx, pid)) {
      if (!T.isGroupLike(c)) continue;
      out.push({ id: c.id, name: T.nameOf(c), depth });
      walk(c.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

function intoSelect(value, onChange, { extra = [] } = {}) {
  const sel = el('select', { class: 'sel', 'aria-label': 'Put into' });
  const opt = (v, text) => el('option', { value: v, selected: v === (value ?? '') }, text);
  for (const [v, text] of extra) sel.append(opt(v, text));
  sel.append(opt('', 'Top level'));
  for (const g of placeOptions()) sel.append(opt(g.id, `${'  '.repeat(g.depth)}${g.name}`));
  sel.addEventListener('change', () => onChange(sel.value || null));
  return sel;
}

// ---------------------------------------------------------------------------
// TileDo
// ---------------------------------------------------------------------------

async function loadTiledo(files) {
  st.error = '';
  try {
    const texts = await Promise.all(files.map(async (f) => ({ name: f.name, json: JSON.parse(await f.text()) })));
    const data = texts.find((t) => /archive/i.test(t.name) === false) ?? texts[0];
    const arch = texts.find((t) => t !== data && /archive/i.test(t.name));
    const parsed = TD.parseTiledo(data.json, arch?.json ?? null);
    st.tiledo = { parsed, plan: TD.defaultPlan(parsed, placeOptions()), names: texts.map((t) => t.name) };
  } catch (e) {
    st.error = `That did not read as TileDo data: ${e.message}`;
  }
  draw();
}

function subtreeCount(p, id) {
  let total = 0;
  let open = 0;
  const walk = (x) => { for (const c of TD.childrenOfItem(p, x)) { total += 1; if (c.status !== 'done') open += 1; walk(c.id); } };
  walk(id);
  return { total, open };
}

function tiledoPreview() {
  const { parsed: p, plan } = st.tiledo;
  const sec = el('section', { class: 'sec', 'aria-label': 'TileDo preview' });
  sec.append(el('div', { class: 'sec-head' },
    el('h2', { class: 'h2' }, 'TileDo'),
    el('span', { class: 'meta' }, `${p.stats.total} tasks · ${p.stats.open} open · ${p.stats.done} done${p.stats.archived ? ` · ${p.stats.archived} archived` : ''}`)));
  sec.append(el('p', { class: 'hint', style: { 'max-width': '75ch' } },
    'Each branch can stay a group, come in as a job (what is under it becomes its tasks), be dissolved (its children move up a level), or be skipped. Whatever lands at the top can go straight into a category; suggestions come from the words in your category names.'));
  const tree = el('div', { class: 'imp-tree' });
  const row = (item, depth) => {
    const mode = TD.modeOf(p, plan, item.id);
    const counts = subtreeCount(p, item.id);
    const asSel = el('select', { class: 'sel', 'aria-label': `${item.title}: import as` },
      [['group', 'Group'], ['job', 'Job'], ['dissolve', 'Dissolve'], ['skip', 'Skip']].map(([v, t]) => el('option', { value: v, selected: v === mode }, t)));
    asSel.addEventListener('change', () => {
      plan[item.id] = { ...(plan[item.id] ?? {}), as: asSel.value };
      if (asSel.value === 'dissolve' || asSel.value === 'skip') plan[item.id].into = null;
      // Children of a new group or dissolved node need their own choice.
      if (asSel.value === 'group' || asSel.value === 'dissolve') {
        for (const c of TD.childrenOfItem(p, item.id)) if (!plan[c.id]) plan[c.id] = { as: 'job', into: TD.suggestGroup(c.title, placeOptions()) };
      }
      draw();
    });
    const top = TD.landsAtTop(p, plan, item.id) && (mode === 'group' || mode === 'job');
    tree.append(el('div', { class: `imp-row${mode === 'skip' ? ' skip' : ''}`, style: { '--depth': depth } },
      el('div', { class: 'imp-title' }, item.status !== 'done' ? null : pill('done'), el('span', { title: item.title }, item.title),
        el('span', { class: 'meta' }, counts.total ? `${counts.open} open of ${counts.total} inside` : '')),
      asSel,
      top ? intoSelect(plan[item.id]?.into ?? null, (v) => { plan[item.id] = { ...(plan[item.id] ?? { as: mode }), into: v }; draw(); }) : el('span')));
    if (mode === 'group' || mode === 'dissolve') for (const c of TD.childrenOfItem(p, item.id)) row(c, depth + 1);
  };
  for (const r of TD.rootsOf(p)) row(r, 0);
  sec.append(tree);
  return sec;
}

// ---------------------------------------------------------------------------
// Excel
// ---------------------------------------------------------------------------

async function loadExcel(files) {
  st.error = '';
  st.busy = true;
  draw();
  try {
    const XLSX = await import(SHEETJS_URL);
    const f = files[0];
    const wb = XLSX.read(await f.arrayBuffer(), { type: 'array' });
    const name = wb.SheetNames.find((n) => /todo/i.test(n)) ?? wb.SheetNames[0];
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, blankrows: true, defval: '', raw: false });
    const parsed = XL.parseTodoRows(rows);
    if (!parsed.sections.length) throw new Error(`no header row with Model and Status on the "${name}" sheet`);
    const into = {};
    parsed.sections.forEach((s, i) => { into[i] = 'new'; });
    st.excel = { parsed, plan: { into, skip: new Set() }, name: `${f.name} (${name})` };
  } catch (e) {
    st.error = /Failed to fetch|import/i.test(String(e.message)) && !st.excel
      ? `The spreadsheet reader did not load (${e.message}). It comes from cdn.sheetjs.com; check the connection.`
      : `That did not read as the tracker: ${e.message}`;
  }
  st.busy = false;
  draw();
}

function excelPreview() {
  const { parsed, plan } = st.excel;
  const total = parsed.sections.reduce((s, x) => s + x.rows.length, 0);
  const sec = el('section', { class: 'sec', 'aria-label': 'Excel preview' });
  sec.append(el('div', { class: 'sec-head' }, el('h2', { class: 'h2' }, 'Excel tracker'), el('span', { class: 'meta' }, `${total} rows in ${parsed.sections.length} sections`)));
  parsed.sections.forEach((s, si) => {
    const live = s.rows.filter((r) => !plan.skip.has(r.key)).length;
    sec.append(el('div', { class: 'sec-head' },
      el('span', { class: 'lbl' }, s.title), el('span', { class: 'meta' }, `${live} of ${s.rows.length}`),
      el('span', { class: 'sp' }),
      intoSelect(plan.into[si] === 'new' ? 'new' : plan.into[si], (v) => { plan.into[si] = v; draw(); }, { extra: [['new', `New category: ${s.title}`]] })));
    const table = el('table', { class: 'imp-table' },
      el('thead', {}, el('tr', {}, ['', 'Model', 'Becomes', 'Notes (brief)', 'Status notes (first update)', 'Folder'].map((h) => el('th', {}, h)))));
    const tb = el('tbody');
    for (const r of s.rows) {
      const m = XL.mapRow(r);
      const skip = plan.skip.has(r.key);
      const box = el('input', { type: 'checkbox', checked: !skip, 'aria-label': `Import ${r.model}` });
      box.addEventListener('change', () => { if (box.checked) plan.skip.delete(r.key); else plan.skip.add(r.key); draw(); });
      tb.append(el('tr', { class: skip ? 'skip' : '' },
        el('td', {}, box),
        el('td', {}, r.model),
        el('td', {}, pill(m.status), m.checked ? el('span', { class: 'meta' }, ' checked') : null),
        el('td', {}, m.brief),
        el('td', {}, m.firstUpdate),
        el('td', { class: m.folderError ? 'err' : 'mono' }, m.folderError ?? (m.folders[0]?.path ?? ''))));
    }
    table.append(tb);
    sec.append(el('div', { class: 'table-wrap' }, table));
  });
  return sec;
}

// ---------------------------------------------------------------------------
// apply
// ---------------------------------------------------------------------------

function build() {
  const at = nowISO();
  const o = { idx: state.idx, by: state.me, at, newId, archiveDone: st.archiveDone };
  const out = { nodes: [], updates: [], views: {}, stats: { groups: 0, jobs: 0, tasks: 0, archived: 0, skipped: 0, folderErrors: 0 } };
  if (st.tiledo) {
    const r = TD.buildTiledo(st.tiledo.parsed, st.tiledo.plan, o);
    out.nodes.push(...r.nodes);
    Object.assign(out.views, r.views);
    for (const k of Object.keys(r.stats)) out.stats[k] += r.stats[k];
  }
  if (st.excel) {
    // Orders continue after anything the TileDo half placed in the same parents.
    const idx = T.buildIndex([...state.nodes, ...out.nodes]);
    const r = XL.buildExcel(st.excel.parsed, st.excel.plan, { ...o, idx });
    out.nodes.push(...r.nodes);
    out.updates.push(...r.updates);
    for (const k of Object.keys(r.stats)) out.stats[k] = (out.stats[k] ?? 0) + r.stats[k];
  }
  return out;
}

function applyBar() {
  const preview = build();
  const s = preview.stats;
  const words = [plural(s.groups, 'group'), plural(s.jobs, 'job'), s.tasks ? plural(s.tasks, 'task') : null, s.archived ? `${s.archived} straight to the archive` : null, s.skipped ? `${s.skipped} skipped` : null, s.folderErrors ? `${plural(s.folderErrors, 'folder path')} left out` : null].filter(Boolean).join(' · ');
  const box = el('input', { type: 'checkbox', checked: st.archiveDone });
  box.addEventListener('change', () => { st.archiveDone = box.checked; draw(); });
  const apply = btn('Apply', async () => {
    apply.disabled = true;
    const result = build();
    try {
      // Steps and tasks first would be fine too; one commit, in batches, either way.
      const p = Store.commit({ set: result.nodes, updates: result.updates });
      for (const [id, v] of Object.entries(result.views)) prefs.set(`view.${id}`, v);
      if (state.mode === 'local') await p; else p.catch((e) => toastError(e, 'Part of the import did not save'));
      toast(`Imported ${plural(result.stats.jobs, 'job')}${result.stats.tasks ? ` and ${plural(result.stats.tasks, 'task')}` : ''}`);
      st.tiledo = null;
      st.excel = null;
      go('/tasks');
    } catch (e) {
      apply.disabled = false;
      toastError(e, 'The import did not save');
    }
  }, { cls: 'primary', ic: 'upload' });
  return el('div', { class: 'imp-bar' },
    el('label', { class: 'check-line' }, box, 'Send done jobs straight to the archive'),
    el('span', { class: 'meta', style: { 'white-space': 'normal' } }, `Will add ${words}.`),
    el('span', { class: 'sp' }),
    btn('Clear', () => { st.tiledo = null; st.excel = null; st.error = ''; draw(); }, { cls: 'ghost' }),
    apply);
}

export { S };
