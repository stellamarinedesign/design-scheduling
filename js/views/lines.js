// views/lines.js — the boxes behind the Progress page's product lines (owner,
// 2026-11-19): a new line, a line's columns (its tasks template), the next
// revision of a row, and BRINGING A JOB IN as a row, with the comparison
// first. The lead's alone; the writes are in actions.js, the matching in
// register.js.
//
// BRINGING A JOB IN keeps the job: its id, its status, its Waiting and how
// long it has waited (`waiting.since`, `prevStatus`, `blockedBy`), its
// timeline and its time all stay, because nothing is made again. The page
// shows each of the line's stages and sub-steps beside the job's task that
// becomes it - matched by name, changeable - or "New: to do"; and what is
// left of the job's tasks, kept as extras or archived. "Keep its tasks as
// they are" only moves it.

import { el, btn, icon, iconBtn, dot, pill, refuse } from '../ui.js';
import { state, node, personName } from '../state.js';
import * as T from '../tree.js';
import * as S from '../status.js';
import * as A from '../actions.js';
import * as RG from '../register.js';
import { assignable } from '../team.js';
import { openDialog } from '../dialog.js';
import { ageDays } from '../dates.js';

const norm = (s) => String(s ?? '').toLowerCase();
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const lead = () => state.role === 'lead';

/** Leads and designers, you first. */
const people = () => {
  const list = assignable(state.access);
  return [state.me, ...list.filter((p) => p !== state.me).sort((a, b) => personName(a).localeCompare(personName(b)))];
};
const whoSelect = (id, value) => el('select', { class: 'sel', id },
  people().map((p) => el('option', { value: p, selected: p === value }, personName(p))),
  el('option', { value: '', selected: !value }, 'Nobody yet'));

/** Every product line, with the path of its category. */
const allLines = () => state.idx.nodes.filter(T.isLine).map((l) => ({ line: l, where: T.pathText(state.idx, l.id, { skipMaster: true }) }))
  .sort((a, b) => a.where.localeCompare(b.where) || T.nameOf(a.line).localeCompare(T.nameOf(b.line)));

/** A searchable list of choices in a box. `items`: [{id, label, sub, lead?}] */
function pickDialog({ title, placeholder, items, empty }) {
  return openDialog((box, close) => {
    box.append(el('h3', {}, title));
    const q = el('input', { class: 'input', type: 'search', placeholder, autocomplete: 'off', 'data-autofocus': '', 'aria-label': placeholder });
    const list = el('div', { class: 'picker-list', role: 'listbox', 'aria-label': title });
    const draw = () => {
      list.textContent = '';
      const query = norm(q.value.trim());
      const shown = items.filter((i) => !query || norm(i.label).includes(query) || norm(i.sub).includes(query)).slice(0, 60);
      for (const i of shown) {
        list.append(el('button', { class: 'pick', type: 'button', role: 'option', onclick: () => close(i.id) },
          i.lead ?? null, el('span', {}, i.label), el('span', { class: 'sub' }, i.sub ?? '')));
      }
      if (!shown.length) list.append(el('div', { class: 'pick', 'aria-disabled': 'true' }, query ? 'Nothing matches.' : empty));
    };
    q.addEventListener('input', draw);
    q.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); list.querySelector('.pick')?.focus(); }
      if (e.key === 'Enter') { e.preventDefault(); list.querySelector('button.pick')?.click(); }
    });
    list.addEventListener('keydown', (e) => {
      const picks = [...list.querySelectorAll('button.pick')];
      const i = picks.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') { e.preventDefault(); picks[Math.min(i + 1, picks.length - 1)]?.focus(); }
      if (e.key === 'ArrowUp') { e.preventDefault(); if (i <= 0) q.focus(); else picks[i - 1]?.focus(); }
    });
    box.append(q, list, el('div', { class: 'actions' }, btn('Cancel', () => close(null))));
    draw();
  }, { label: title, wide: true });
}

// ---------------------------------------------------------------------------
// a new product line
// ---------------------------------------------------------------------------

/** The categories a line can go in: groups that are not lines, not sections, and hold no jobs' sections. */
const lineHomes = () => state.idx.nodes.filter((n) => n.kind === T.KIND.group && !T.isLine(n) && !T.isSection(state.idx, n))
  .map((g) => ({ id: g.id, label: T.nameOf(g), sub: T.pathText(state.idx, g.id, { skipMaster: false }), lead: dot(T.colourOf(state.idx, g.id)) }));

/**
 * New product line: its name, its category, whether it shows in Tasks too,
 * and its columns to start from (none, or a copy of another line's).
 */
export function newLine({ parentId = null } = {}) {
  if (!lead()) return null;
  const homes = lineHomes();
  let place = parentId ?? homes.find((h) => node(h.id)?.parentId)?.id ?? homes[0]?.id ?? null;
  const others = allLines();
  return openDialog((box, close, { dismiss }) => {
    box.append(el('h3', {}, 'New product line'),
      el('p', { class: 'lede' }, 'A table on the Progress page. Its columns are its tasks template, and each row is a job in it.'));
    const name = el('input', { class: 'input', id: 'nlName', type: 'text', maxlength: '120', autocomplete: 'off', placeholder: 'e.g. Custom Lifters', 'data-autofocus': '' });
    const placeBtn = el('button', { class: 'pv-btn ln-place picker', type: 'button', id: 'nlIn' });
    const drawPlace = () => {
      placeBtn.textContent = '';
      const g = place ? node(place) : null;
      const path = g ? [...T.categoryPath(state.idx, g.id), g].map(T.nameOf).join(' › ') : '';
      placeBtn.append(g ? dot(T.colourOf(state.idx, g.id)) : icon('home', 16), el('span', {}, g ? path : 'Choose a category'));
    };
    placeBtn.addEventListener('click', async () => {
      const id = await pickDialog({ title: 'Which category?', placeholder: 'Find a category', items: homes, empty: 'No categories yet: make one in Tasks first.' });
      if (id) { place = id; drawPlace(); }
      name.focus();
    });
    const copy = el('select', { class: 'sel', id: 'nlCopy' },
      el('option', { value: '' }, 'None yet: set them next'),
      others.map((o) => el('option', { value: o.line.id }, `${T.nameOf(o.line)}${o.where ? ` (${o.where})` : ''}`)));
    const listed = el('input', { type: 'checkbox' });
    const err = el('div', { class: 'form-err', role: 'alert' });
    box.append(
      el('div', { class: 'field' }, el('label', { for: 'nlName' }, 'Name'), name),
      el('div', { class: 'field' }, el('label', { for: 'nlIn' }, 'In'), placeBtn),
      el('div', { class: 'field' }, el('label', { for: 'nlCopy' }, 'Columns'), copy),
      el('label', { class: 'check-line' }, listed, 'Show it in Tasks too (otherwise it lives on the Progress page)'),
      err);
    drawPlace();
    const go1 = () => {
      const v = name.value.trim();
      if (!v) { err.textContent = 'Give it a name.'; refuse(name); return; }
      if (!place) { err.textContent = 'Choose the category it goes in.'; placeBtn.focus(); return; }
      const from = copy.value ? node(copy.value) : null;
      const template = from ? (T.stepsTemplateOf(state.idx, from.id)?.template ?? null) : null;
      const id = A.createLine({ name: v, parentId: place, listed: listed.checked, template });
      close(id);
      // A line with no columns yet goes straight on to them.
      if (id && !template) setTimeout(() => { const l = node(id); if (l) editColumns(l); }, 0);
    };
    name.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); go1(); } });
    name.addEventListener('input', () => { err.textContent = ''; name.removeAttribute('aria-invalid'); });
    box.append(el('div', { class: 'actions' }, btn('Add the line', go1, { cls: 'primary' }), btn('Cancel', dismiss, { cls: 'ghost' })));
  }, { label: 'New product line', guard: true });
}

// ---------------------------------------------------------------------------
// a line's columns: its tasks template, edited as stages and sub-steps
// ---------------------------------------------------------------------------

/**
 * The columns of a line, as stages (each may wait on the customer) and their
 * sub-steps, moved with buttons rather than typed indents. It saves on the
 * line, even when the template it starts from is a category's above it.
 */
export function editColumns(line) {
  if (!lead()) return null;
  const from = T.stepsTemplateOf(state.idx, line.id);
  const clone = (list) => (list ?? []).map((i) => (typeof i === 'string' ? { label: i, children: [] } : { label: i.label, waits: Boolean(i.waits), children: clone(i.children) }));
  const stages = clone(from?.template);
  const rows = RG.rowsOf(state.idx, line.id).length;
  return openDialog((box, close, { dismiss }) => {
    box.append(el('h3', {}, `Columns of ${T.nameOf(line)}`),
      el('p', { class: 'lede' }, `New rows start with these tasks.${rows ? ` The ${plural(rows, 'row')} already here keep theirs: a row's ⋯ › Match to the columns brings one up to date.` : ''}`),
      ...(from && from.from.id !== line.id ? [el('p', { class: 'hint' }, `These come from ${T.nameOf(from.from)}. Saving gives ${T.nameOf(line)} its own.`)] : []));
    const list = el('ol', { class: 'ln-stages', 'aria-label': 'Stages' });
    const err = el('div', { class: 'form-err', role: 'alert' });
    const move = (arr, i, d) => { const j = i + d; if (j < 0 || j >= arr.length) return; [arr[i], arr[j]] = [arr[j], arr[i]]; draw(); };
    const field = (item, label, onEnter) => {
      const f = el('input', { class: 'input', type: 'text', value: item.label, maxlength: '80', 'aria-label': label, placeholder: label });
      f.addEventListener('input', () => { item.label = f.value; err.textContent = ''; });
      f.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); onEnter?.(); } });
      return f;
    };
    let focusNext = null;
    function draw() {
      list.textContent = '';
      stages.forEach((s, i) => {
        const subs = el('ol', { class: 'ln-subs', 'aria-label': `Sub-steps of ${s.label || 'this stage'}` });
        s.children.forEach((c, j) => {
          subs.append(el('li', { class: 'ln-sub' },
            field(c, 'Sub-step name', () => { s.children.splice(j + 1, 0, { label: '', children: [] }); focusNext = [i, j + 1]; draw(); }),
            iconBtn('chevUp', 'Move this sub-step up', () => move(s.children, j, -1), 'sm'),
            iconBtn('chevDown', 'Move this sub-step down', () => move(s.children, j, 1), 'sm'),
            iconBtn('close', `Remove the sub-step ${c.label}`, () => { s.children.splice(j, 1); draw(); }, 'sm')));
        });
        const waits = el('input', { type: 'checkbox', checked: s.waits });
        waits.addEventListener('change', () => { s.waits = waits.checked; });
        list.append(el('li', { class: 'ln-stage' },
          el('div', { class: 'ln-stage-row' },
            el('span', { class: 'ln-num', 'aria-hidden': 'true' }, String(i + 1)),
            field(s, 'Stage name', () => { stages.splice(i + 1, 0, { label: '', waits: false, children: [] }); focusNext = [i + 1]; draw(); }),
            iconBtn('chevUp', 'Move this stage up', () => move(stages, i, -1), 'sm'),
            iconBtn('chevDown', 'Move this stage down', () => move(stages, i, 1), 'sm'),
            iconBtn('close', `Remove the stage ${s.label}`, () => { stages.splice(i, 1); draw(); }, 'sm')),
          s.children.length ? null : el('label', { class: 'check-line ln-waits', title: 'Starting it puts the job into Waiting; ticking it Done ends the wait' }, waits, 'Waits on the customer'),
          subs,
          btn('Sub-step', () => { s.children.push({ label: '', children: [] }); s.waits = false; focusNext = [i, s.children.length - 1]; draw(); }, { cls: 'sm ghost', ic: 'plus' })));
      });
      if (focusNext) {
        const [i, j] = focusNext;
        focusNext = null;
        const st = list.children[i];
        (j === undefined ? st?.querySelector('.ln-stage-row .input') : st?.querySelectorAll('.ln-sub .input')[j])?.focus();
      }
    }
    draw();
    box.append(list, btn('Add a stage', () => { stages.push({ label: '', waits: false, children: [] }); focusNext = [stages.length - 1]; draw(); }, { cls: 'sm', ic: 'plus' }), err);
    const save = () => {
      const clean = (arr) => arr.map((x) => ({ ...x, label: x.label.trim() })).filter((x) => x.label);
      const out = clean(stages).map((s) => {
        const children = clean(s.children).map((c) => ({ label: c.label }));
        return { label: s.label, ...(s.waits && !children.length ? { waits: true } : {}), ...(children.length ? { children } : {}) };
      });
      const keys = out.map((s) => RG.labelKey(s.label));
      if (new Set(keys).size !== keys.length) { err.textContent = 'Two stages have the same name: a row could not tell them apart.'; return; }
      A.updateFields(line.id, { stepsTemplate: out.length ? out : null }, { message: out.length ? `Columns of ${T.nameOf(line)} saved` : `${T.nameOf(line)} has no columns now`, undo: true });
      close(true);
    };
    box.append(el('div', { class: 'actions' }, btn('Save the columns', save, { cls: 'primary' }), btn('Cancel', dismiss, { cls: 'ghost' })));
  }, { label: `Columns of ${T.nameOf(line)}`, wide: true, guard: true });
}

// ---------------------------------------------------------------------------
// the next revision of a row (reset in place; owner, 2026-11-19)
// ---------------------------------------------------------------------------

export function nextRevisionBox(job) {
  if (!lead()) return null;
  const rev = RG.nextRevision(job.revision);
  const inside = T.tasksUnder(state.idx, job.id).length;
  return openDialog((box, close, { dismiss }) => {
    box.append(el('h3', {}, `Next revision of ${T.nameOf(job)}`),
      el('p', { class: 'lede' }, `Its ${plural(inside, 'task')} go back to To do and the job reopens. How the stages stand now is kept in its timeline, with its history and time.`));
    const revision = el('input', { class: 'input mono', id: 'nrRev', type: 'text', maxlength: '40', autocomplete: 'off', value: rev, 'data-autofocus': '' });
    const who = whoSelect('nrWho', job.assignee ?? state.me);
    box.append(el('div', { class: 'sr-row' },
      el('div', { class: 'field' }, el('label', { for: 'nrRev' }, 'Revision'), revision),
      el('div', { class: 'field' }, el('label', { for: 'nrWho' }, 'Who has it'), who)));
    const go1 = () => { A.restartRow(job.id, { revision: revision.value, assignee: who.value || null }); close(true); };
    revision.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); go1(); } });
    box.append(el('div', { class: 'actions' }, btn(`Start ${rev}`, go1, { cls: 'primary' }), btn('Cancel', dismiss, { cls: 'ghost' })));
    revision.addEventListener('input', () => { box.querySelector('.actions .primary').textContent = revision.value.trim() ? `Start ${revision.value.trim()}` : 'Start again'; });
  }, { label: `Next revision of ${T.nameOf(job)}`, guard: true });
}

// ---------------------------------------------------------------------------
// bringing a job in, with the comparison first
// ---------------------------------------------------------------------------

/**
 * Bring a job in as a row of a line. Either may be missing: the line is
 * picked from every line, the job from the jobs not in a line (open first).
 * A row already in the line goes straight to the comparison (Match to the
 * columns).
 */
export async function bringIn({ jobId = null, lineId = null, subOf = null } = {}) {
  if (!lead()) return;
  let job = jobId ? node(jobId) : null;
  let line = lineId ? node(lineId) : null;
  if (!line) {
    const items = allLines().map((o) => ({ id: o.line.id, label: T.nameOf(o.line), sub: o.where, lead: icon('register', 16) }));
    const id = await pickDialog({ title: `Bring ${job ? T.nameOf(job) : 'a job'} into which product line?`, placeholder: 'Find a product line', items, empty: 'No product lines yet: make one on the Progress page.' });
    if (!id) return;
    line = node(id);
  }
  if (!job) {
    const jobs = state.idx.nodes.filter((n) => T.isJob(state.idx, n) && !T.lineOfRow(state.idx, n))
      .sort((a, b) => (S.isOpen(a.status) ? 0 : 1) - (S.isOpen(b.status) ? 0 : 1) || String(b.lastActivityAt).localeCompare(String(a.lastActivityAt)));
    const items = jobs.map((n) => ({ id: n.id, label: n.title, sub: T.pathText(state.idx, n.id), lead: pill(n.status) }));
    const under = subOf ? node(subOf) : null;
    const id = await pickDialog({ title: under ? `Bring a job in under ${T.nameOf(under)}` : `Bring a job into ${T.nameOf(line)}`, placeholder: 'Find the job', items, empty: 'No jobs outside the product lines.' });
    if (!id) return;
    job = node(id);
  }
  if (job && line) compare(job, line, subOf);
}

/** What a task is called in the comparison: its name, and where it sits when not at the top. */
function taskWords(job, t) {
  const above = T.ancestorChain(state.idx, t.id).filter((a) => a.id !== job.id && T.descendantIds(state.idx, job.id).includes(a.id));
  return `${T.nameOf(t)}${above.length ? ` (in ${above.map(T.nameOf).join(' › ')})` : ''}`;
}

/** The comparison page: the line's stages beside what each becomes, then the job's other tasks. */
function compare(job, line, subOf = null) {
  const under = subOf ? node(subOf) : null;
  const columns = RG.columnsFor(state.idx, line.id, [job]);
  const plan = RG.conversionPlan(state.idx, job.id, columns);
  const already = T.lineOfRow(state.idx, job)?.id === line.id;
  const tasks = plan.all;
  let switchTasks = Boolean(columns.stages.length);
  const archive = new Set();
  const waitDays = job.status === 'waiting' && job.waiting?.since ? ageDays(job.waiting.since) : null;
  return openDialog((box, close, { dismiss }) => {
    box.append(el('h3', {}, already ? `Match ${T.nameOf(job)} to the columns` : under ? `Bring ${T.nameOf(job)} in under ${T.nameOf(under)}` : `Bring ${T.nameOf(job)} into ${T.nameOf(line)}`),
      el('p', { class: 'lede' }, `It stays the same job: ${waitDays !== null ? `Waiting for ${waitDays === 1 ? '1 day' : `${waitDays} days`}` : S.LABEL[job.status] ?? job.status}, with its timeline and time.`));
    const mode = el('div', { class: 'seg ln-mode', role: 'radiogroup', 'aria-label': 'Its tasks' });
    const body = el('div', { class: 'ln-compare' });
    const usedBy = () => {
      const m = new Map();
      plan.stages.forEach((s, i) => { if (s.task) m.set(s.task.id, `s${i}`); s.subs.forEach((x, j) => { if (x.task) m.set(x.task.id, `s${i}.${j}`); }); });
      return m;
    };
    const choose = (slotKey, current, onPick, label) => {
      const sel = el('select', { class: 'sel', 'aria-label': label },
        el('option', { value: '', selected: !current }, 'New: to do'),
        tasks.map((t) => el('option', { value: t.id, selected: current?.id === t.id }, `${taskWords(job, t)} · ${(S.LABEL[T.shownStatus(state.idx, t)] ?? '').toLowerCase()}`)));
      sel.addEventListener('change', () => {
        const t = sel.value ? node(sel.value) : null;
        // A task becomes one thing: taken here, it leaves where it was.
        if (t) for (const s of plan.stages) { if (s.task?.id === t.id) s.task = null; for (const x of s.subs) if (x.task?.id === t.id) x.task = null; }
        onPick(t);
        refresh();
      });
      return sel;
    };
    const nowCell = (t) => (t ? pill(T.shownStatus(state.idx, t)) : el('span', { class: 'meta' }, 'New'));
    function refresh() {
      body.textContent = '';
      if (!switchTasks) {
        body.append(el('p', { class: 'meta wrap' }, columns.stages.length
          ? `Its ${plural(T.tasksUnder(state.idx, job.id).length, 'task')} stay as they are. Cells fill where a task's name matches a column; the rest show as extras.`
          : `${T.nameOf(line)} has no columns yet, so its tasks stay as they are.`));
        return;
      }
      const table = el('table', { class: 'ln-table' },
        el('thead', {}, el('tr', {}, el('th', {}, 'Stage'), el('th', {}, 'Becomes'), el('th', {}, 'Now'))));
      const tb = el('tbody');
      plan.stages.forEach((s, i) => {
        tb.append(el('tr', { class: 'ln-stage-tr' },
          el('th', { scope: 'row' }, s.stage.label, s.stage.waits ? el('span', { class: 'ln-tag', title: 'Starting it puts the job into Waiting' }, 'waits') : null),
          el('td', {}, choose(`s${i}`, s.task, (t) => { s.task = t; }, `${s.stage.label} becomes`)),
          el('td', {}, s.subs.length ? null : nowCell(s.task))));
        s.subs.forEach((x, j) => {
          tb.append(el('tr', { class: 'ln-sub-tr' },
            el('th', { scope: 'row' }, el('span', { class: 'ln-indent', 'aria-hidden': 'true' }, '›'), x.sub.label),
            el('td', {}, choose(`s${i}.${j}`, x.task, (t) => { x.task = t; }, `${s.stage.label}, ${x.sub.label} becomes`)),
            el('td', {}, nowCell(x.task))));
        });
      });
      table.append(tb);
      body.append(el('div', { class: 'table-wrap' }, table));
      const used = usedBy();
      // What is left at the top of the job: kept as extras, or archived.
      plan.leftovers = RG.topTasks(state.idx, job.id).filter((t) => !used.has(t.id));
      if (plan.leftovers.length) {
        body.append(el('h4', { class: 'lbl ln-left-head' }, `Left over: ${plural(plan.leftovers.length, 'task')}`));
        const ul = el('ul', { class: 'ln-left' });
        for (const t of plan.leftovers) {
          const sel = el('select', { class: 'sel', 'aria-label': `${T.nameOf(t)}: keep or archive` },
            el('option', { value: 'keep', selected: !archive.has(t.id) }, 'Keep: shown as an extra'),
            el('option', { value: 'archive', selected: archive.has(t.id) }, 'Archive it'));
          sel.addEventListener('change', () => { if (sel.value === 'archive') archive.add(t.id); else archive.delete(t.id); });
          ul.append(el('li', {}, pill(T.shownStatus(state.idx, t)), el('span', { class: 'ln-left-name' }, taskWords(job, t)), sel));
        }
        body.append(ul);
      }
    }
    const opt = (value, text) => {
      const b = el('button', { type: 'button', role: 'radio', 'aria-checked': String(switchTasks === value), onclick: () => { switchTasks = value; for (const x of mode.children) x.setAttribute('aria-checked', String(x === b)); refresh(); } }, text);
      return b;
    };
    if (columns.stages.length) mode.append(opt(true, "Match its tasks to the line's"), opt(false, 'Keep its tasks as they are'));
    if (columns.stages.length) box.append(mode);
    box.append(body);
    refresh();
    const go1 = () => {
      // Only what is still left over can be archived.
      for (const id of [...archive]) if (!plan.leftovers.some((t) => t.id === id)) archive.delete(id);
      A.convertToRow(job.id, line.id, plan, { switchTasks, archive, subOf });
      close(true);
    };
    box.append(el('div', { class: 'actions' },
      btn(already ? 'Match it' : under ? `Bring it in under ${T.nameOf(under)}` : `Bring it into ${T.nameOf(line)}`, go1, { cls: 'primary' }),
      btn('Cancel', dismiss, { cls: 'ghost' })));
  }, { label: `Bring ${T.nameOf(job)} into ${T.nameOf(line)}`, wide: true });
}

