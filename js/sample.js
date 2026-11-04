// sample.js — INVENTED demo data for local mode: enough jobs, steps, waits
// and ages to exercise every view. The repository is public; nothing here is
// a real job, customer, vessel or person. Loaded only from the first-run
// screen in local mode, and only into this browser.

import { Store, newId } from './store.js';
import { state } from './state.js';
import { ORDER_GAP } from './tree.js';
import { toast } from './ui.js';
import { dayOf } from './dates.js';

const DAY = 86400000;
const ago = (d, h = 0) => new Date(Date.now() - d * DAY - h * 3600000).toISOString();

export async function loadSample() {
  if (Store.mode !== 'local') return;
  const me = state.me;
  const nodes = [];
  const updates = [];
  const order = new Map();
  const next = (pid) => { const o = (order.get(pid ?? '') ?? 0) + ORDER_GAP; order.set(pid ?? '', o); return o; };
  const group = (name, parentId = null, extra = {}) => {
    const id = newId();
    nodes.push({ id, kind: 'group', parentId, order: next(parentId), name, createdAt: ago(60), updatedAt: ago(60), archivedAt: null, ...extra });
    return id;
  };
  const task = (title, parentId, status = 'todo', days = 1, extra = {}) => {
    const id = newId();
    nodes.push({
      id, kind: 'task', parentId, order: next(parentId), title, brief: '', status, waiting: null, priority: 'normal',
      assignee: me, createdBy: me, createdAt: ago(days + 10), updatedAt: ago(days), lastActivityAt: ago(days),
      due: null, revision: null, folders: [], checkedBy: null, checkedAt: null, doneAt: status === 'done' ? ago(days) : null,
      homeOrder: null, backlogIgnored: false, archivedAt: null, fixNote: null, cancelled: null, ...extra,
    });
    return id;
  };
  const step = (label, parentId, st = 'todo') => {
    const id = newId();
    nodes.push({ id, kind: 'step', parentId, order: next(parentId), label, state: st, createdAt: ago(20), updatedAt: ago(2), archivedAt: null });
    return id;
  };
  const say = (taskId, kind, text, days, extra = {}) => updates.push({ taskId, at: ago(days), by: me, kind, text, ...extra });

  const prod = group('Production');
  const davits = group('Davits', prod, { colour: 2, stepsTemplate: [{ label: 'Concept' }, { label: '3D model' }, { label: 'Drawings' }, { label: 'Laser files' }, { label: 'Build form' }, { label: 'Checked' }] });
  // Jobs sit above a category's sub-groups, as new ones do.
  const exploded = task('Exploded diagrams: 550kg davit', davits, 'in_progress', 1, { revision: 'R2' });
  step('Concept', exploded, 'done'); step('3D model', exploded, 'done'); step('Drawings', exploded, 'done'); step('PDF set', exploded, 'doing');
  task('Davit BOM levels', davits, 'todo', 31, { brief: '- Define which assembly level each BOM covers\n- Agree the part-number ranges with production' });
  const single = group('Single stage', davits);
  const plinths = group('Plinths', davits);
  const lifters = group('Cylinder Lifters', prod, { colour: 1 });
  const rotary = group('Rotary Lifters', prod, { colour: 5 });
  const chairs = group('Helm Chairs', prod, { colour: 7 });
  const water = group('Watermakers', prod, { colour: 6 });
  const fixes = group('Minor Fixes', prod, { colour: 4 });
  const progs = group('Programs');
  const laser = group('Laser automation', progs, { colour: 10 });

  const boom = task('350kg fixed boom rebuild', single, 'in_progress', 1, { priority: 'high', due: dayOf(new Date(Date.now() + 2 * DAY)), brief: 'Rebuild the fixed boom to the **new extension style**.\n- Luff boss thickness to suit the new pin\n- Laser files and laser checklist to match\n- Revision on every drawing', folders: [{ path: 'Example Products/02 - Production/Fixed boom/R3', label: 'GA' }] });
  step('Concept', boom, 'done');
  const model = step('3D model', boom, 'todo');
  step('Body', model, 'done'); step('Extension', model, 'done'); step('Head', model, 'todo');
  task('Swap body pins to standard', model, 'in_progress', 2);
  step('Drawings', boom, 'todo'); step('Laser files', boom, 'todo'); step('Approval', boom, 'na');
  say(boom, 'create', '', 12); say(boom, 'status', '', 5, { from: 'todo', to: 'in_progress' });
  say(boom, 'comment', 'Extension shape matches the larger unit now. Body pins swapped to standard.', 1);

  const ext = task('450kg davit: R3 extension', single, 'check', 0.2, { revision: 'R3' });
  step('3D model', ext, 'done'); step('Drawings', ext, 'done'); step('Laser checklist', ext, 'done'); step('End-cap pin drawing', ext, 'todo');
  say(ext, 'submit', 'Drawings done, laser checklist updated. End-cap pin drawing still to confirm.', 0.2, { from: 'in_progress', to: 'check' });

  task('Electric plinth wiring diagram', plinths, 'in_progress', 6);
  task('Self-enclosed plinth concept', plinths, 'in_progress', 2);
  const range = task('Plinth range rebuild', plinths, 'waiting', 6);
  nodes.find((n) => n.id === range).waiting = { note: '', since: ago(6), prevStatus: 'in_progress', blockedBy: [boom] };

  const hob = task('Lifter concept: 48 ft catamaran transom', lifters, 'fix', 2, { fixNote: 'Hob curve does not follow the transom scan. Re-check it against the measured profile, then resubmit.' });
  say(hob, 'sendback', 'Hob curve does not follow the transom scan. Re-check it against the measured profile, then resubmit.', 2, { from: 'check', to: 'fix' });
  task('Lifter weights and dimensions list', lifters, 'todo', 15);
  task('Platform bracket standard sizes', lifters, 'todo', 44);
  const guide = task('Rotary lifter design guide', rotary, 'in_progress', 5);
  step('Outline', guide, 'done'); step('Concept drawing process', guide, 'todo'); step('Checks list', guide, 'todo'); step('Examples', guide, 'todo');
  task('Premium chair recline mechanism', chairs, 'in_progress', 3);
  task('Armrest profile', chairs, 'waiting', 8, { waiting: { note: 'Supplier sample of the new profile', since: ago(8), prevStatus: 'todo', blockedBy: [] } });
  task('600LPH boxed frame', water, 'in_progress', 8);
  task('Membrane bracket revision', water, 'done', 3);
  const gone = task('Twin-membrane frame for a custom build', water, 'cancelled', 9, { cancelled: { by: me, at: ago(9), reason: 'Customer cancelled (verbal)', prevStatus: 'in_progress' } });
  say(gone, 'cancel', 'Customer cancelled (verbal)', 9, { from: 'in_progress', to: 'cancelled' });
  task('Aircon unit drawings', fixes, 'todo', 24);
  task('Watertight door seal detail', fixes, 'todo', 17);
  task('Hinge plate thickness', fixes, 'todo', 4);
  task('Laser checklist template v2', laser, 'in_progress', 0.1);
  const big = task('Nesting rules for the cutting sheet', laser, 'todo', 40);
  task('Sheet size table', big, 'todo', 40);
  task('Part spacing by thickness', big, 'todo', 40);

  await Store.commit({ set: nodes, updates });
  toast('Sample data loaded: invented jobs, in this browser only');
}
