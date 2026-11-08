// sample.js — INVENTED demo data for local mode: enough jobs, steps, waits
// and ages to exercise every view. The repository is public; nothing here is
// a real job, customer, vessel or person. Loaded only from the first-run
// screen in local mode, and only into this browser.

import { Store, newId } from './store.js';
import { ORDER_GAP } from './tree.js';
import { toast } from './ui.js';
import { dayOf } from './dates.js';
import { LOCAL_AS, inboxId } from './team.js';
import * as NT from './notes.js';
import * as PH from './photos.js';

const DAY = 86400000;
const ago = (d, h = 0) => new Date(Date.now() - d * DAY - h * 3600000).toISOString();

export async function loadSample() {
  if (Store.mode !== 'local') return;
  // The lead's work is the local lead's, whoever this browser is viewing as;
  // the designers' work goes to the invented team (team.js).
  const me = LOCAL_AS.lead;
  const alex = 'alex@local.test';
  const sam = 'sam@local.test';
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
  // Written as STEPS, the way data was stored before steps merged into tasks
  // (2026-11-06), on purpose: loading the sample shows the lead's "Convert
  // steps into tasks" ask, so the migration (migrate.js) can be tried here.
  const step = (label, parentId, st = 'todo') => {
    const id = newId();
    nodes.push({ id, kind: 'step', parentId, order: next(parentId), label, state: st, createdAt: ago(20), updatedAt: ago(2), archivedAt: null });
    return id;
  };
  const say = (taskId, kind, text, days, extra = {}) => updates.push({ taskId, at: ago(days), by: me, kind, text, ...extra });

  const prod = group('Production');
  // Shared with managers (invented): Davits with their stage, Watermakers status only.
  const davits = group('Davits', prod, { shared: 'stage', colour: 2, stepsTemplate: [{ label: 'Concept' }, { label: '3D model' }, { label: 'Drawings' }, { label: 'Laser files' }, { label: 'Build form' }, { label: 'Checked' }] });
  // Jobs sit above a category's sub-groups, as new ones do.
  const exploded = task('Exploded diagrams: 550kg davit', davits, 'in_progress', 1, { revision: 'R2' });
  step('Concept', exploded, 'done'); step('3D model', exploded, 'done'); step('Drawings', exploded, 'done'); step('PDF set', exploded, 'doing');
  task('Davit BOM levels', davits, 'todo', 31, { shared: 'off', brief: '- Define which assembly level each BOM covers\n- Agree the part-number ranges with production' });
  const single = group('Single stage', davits);
  const plinths = group('Plinths', davits);
  const lifters = group('Cylinder Lifters', prod, { colour: 1 });
  const rotary = group('Rotary Lifters', prod, { colour: 5 });
  const chairs = group('Helm Chairs', prod, { colour: 7 });
  const water = group('Watermakers', prod, { colour: 6, shared: 'status' });
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

  const ext = task('450kg davit: R3 extension', single, 'check', 0.2, {
    revision: 'R3', assignee: alex, submittedBy: alex, submittedAt: ago(0.2), statusAt: ago(0.2), lastBy: alex,
    lastNote: { text: 'Drawings done, laser checklist updated. End-cap pin drawing still to confirm.', by: alex, at: ago(0.2) } });
  step('3D model', ext, 'done'); step('Drawings', ext, 'done'); step('Laser checklist', ext, 'done'); step('End-cap pin drawing', ext, 'todo');
  say(ext, 'submit', 'Drawings done, laser checklist updated. End-cap pin drawing still to confirm.', 0.2, { from: 'in_progress', to: 'check', by: alex });

  task('Electric plinth wiring diagram', plinths, 'in_progress', 6);
  // The designers' own work (invented): Alex is busy, Sam has gone quiet.
  const chock = task('Sliding chock drawings', single, 'in_progress', 0.3, { assignee: alex, due: dayOf(new Date(Date.now() + 9 * DAY)), statusAt: ago(4), lastBy: alex, timeTracked: true,
    brief: '- Drawings and laser files to the current standard\n- Same layout as the fixed chock set; revision on every sheet',
    lastNote: { text: 'GA done, drawings about half way.', by: alex, at: ago(0.3) } });
  const ch3d = step('3D model', chock, 'done'); const chDraw = step('Drawings', chock, 'doing'); step('Laser files', chock, 'todo'); const chPdf = step('PDF', chock, 'done'); step('Build form', chock, 'todo'); step('Filed', chock, 'todo');
  say(chock, 'comment', 'GA done, drawings about half way.', 0.3, { by: alex });
  task('Exploded diagram: 650kg davit', davits, 'todo', 3, { assignee: alex, due: dayOf(new Date(Date.now() + 20 * DAY)), brief: 'Assembly only for now; A3 to match the 550.' });
  task('Garage door seal update', inboxId(alex), 'todo', 1, { assignee: alex, createdBy: alex });
  task('Self-enclosed plinth concept', plinths, 'in_progress', 2);
  const range = task('Plinth range rebuild', plinths, 'waiting', 6);
  nodes.find((n) => n.id === range).waiting = { note: '', since: ago(6), prevStatus: 'in_progress', blockedBy: [boom] };

  const hob = task('Lifter concept: 48 ft catamaran transom', lifters, 'fix', 2, { assignee: alex, statusAt: ago(2), due: dayOf(new Date(Date.now() + 1 * DAY)), fixNote: 'Hob curve does not follow the transom scan. Re-check it against the measured profile, then resubmit.' });
  step('Concept', hob, 'done'); step('Approval', hob, 'todo'); step('3D model', hob, 'todo'); step('Drawings', hob, 'todo');
  say(hob, 'sendback', 'Hob curve does not follow the transom scan. Re-check it against the measured profile, then resubmit.', 2, { from: 'check', to: 'fix' });
  task('Lifter weights and dimensions list', lifters, 'todo', 15);
  task('Platform bracket standard sizes', lifters, 'todo', 44);
  const guide = task('Rotary lifter design guide', rotary, 'in_progress', 5);
  step('Outline', guide, 'done'); step('Concept drawing process', guide, 'todo'); step('Checks list', guide, 'todo'); step('Examples', guide, 'todo');
  task('Premium chair recline mechanism', chairs, 'in_progress', 3);
  task('Armrest profile', chairs, 'waiting', 8, { waiting: { note: 'Supplier sample of the new profile', since: ago(8), prevStatus: 'todo', blockedBy: [] } });
  const frame = task('600LPH boxed frame', water, 'in_progress', 8);
  const plate = task('600LPH manifold plate', water, 'in_progress', 8, { assignee: sam, statusAt: ago(9), lastBy: sam });
  step('3D model', plate, 'done'); step('Drawings', plate, 'todo'); step('Laser files', plate, 'todo');
  const hinge = task('Watertight door hinge update', fixes, 'check', 8, { assignee: sam, submittedBy: sam, submittedAt: ago(8), statusAt: ago(8), lastBy: sam,
    lastNote: { text: 'Hinge plate increased to 10 mm; laser files regenerated.', by: sam, at: ago(8) } });
  task('Tie bar machining drawing', rotary, 'waiting', 9, { assignee: sam, lastBy: sam, waiting: { note: 'Flange spec from the supplier', since: ago(9), prevStatus: 'in_progress', blockedBy: [] } });
  const membrane = task('Membrane bracket revision', water, 'done', 3);
  const gone = task('Twin-membrane frame for a custom build', water, 'cancelled', 9, { cancelled: { by: me, at: ago(9), reason: 'Customer cancelled (verbal)', prevStatus: 'in_progress' } });
  say(gone, 'cancel', 'Customer cancelled (verbal)', 9, { from: 'in_progress', to: 'cancelled' });
  task('Aircon unit drawings', fixes, 'todo', 24);
  task('Watertight door seal detail', fixes, 'todo', 17);
  task('Hinge plate thickness', fixes, 'todo', 4);
  task('Laser checklist template v2', laser, 'in_progress', 0.1);
  const big = task('Nesting rules for the cutting sheet', laser, 'todo', 40);
  task('Sheet size table', big, 'todo', 40);
  task('Part spacing by thickness', big, 'todo', 40);

  // Two notes from the invented manager: a question, and a customer cancelling.
  const casey = LOCAL_AS.manager;
  const ask = (id, kind, text, days, cancels = false) => {
    const n = nodes.find((x) => x.id === id);
    n.request = { kind, text, cancels, by: casey, at: ago(days) };
    n.requestOpen = (n.requestOpen ?? 0) + 1;
    updates.push({ taskId: id, at: ago(days), by: casey, kind: 'request', requestKind: kind, text, cancels });
  };
  ask(boom, 'question', 'The customer asks whether the R3 drawings will be ready by the end of next week.', 0.15);
  ask(frame, 'customer', 'Customer has cancelled the boxed frame; they are going with the open frame instead.', 0.4, true);

  // Time on a quotable job (invented): Alex's stretches over three days, one
  // the timer missed and added by hand, one paused for lunch, and the lead's
  // check of the model. Its total is kept on the job, as the app keeps it.
  const at = (daysAgo, h, m) => { const d = new Date(); d.setDate(d.getDate() - daysAgo); d.setHours(h, m, 0, 0); return d.toISOString(); };
  const time = [];
  const stretch = (by, taskId, daysAgo, [h1, m1], [h2, m2], extra = {}) => time.push({
    id: newId(), jobId: chock, taskId, by, start: at(daysAgo, h1, m1), end: at(daysAgo, h2, m2), stopAt: null, stopFor: null,
    source: 'timer', day: dayOf(new Date(at(daysAgo, h1, m1))), createdAt: at(daysAgo, h1, m1), ...extra,
  });
  stretch(alex, ch3d, 3, [8, 10], [12, 0], { stopAt: at(3, 12, 0), stopFor: 'lunch', pausedFor: 'lunch' });
  stretch(alex, ch3d, 3, [12, 30], [15, 45]);
  stretch(me, ch3d, 3, [15, 50], [16, 20]);
  stretch(alex, chPdf, 2, [9, 0], [9, 40], { source: 'manual', stopAt: null, createdAt: at(1, 16, 5) });
  stretch(alex, chDraw, 2, [9, 45], [12, 0], { stopAt: at(2, 12, 0), stopFor: 'lunch', pausedFor: 'lunch' });
  stretch(alex, chDraw, 1, [13, 5], [16, 30], { stopAt: at(1, 16, 30), stopFor: 'finish' });
  nodes.find((n) => n.id === chock).timeTotal = Math.round(time.reduce((s, e) => s + (Date.parse(e.end) - Date.parse(e.start)), 0) / 60000);

  await Store.commit({ set: nodes, updates, timeSet: time });

  // The Log: invented notes from the invented team, with drawn sample photos.
  const riley = LOCAL_AS.contributor;
  const titleOf = (id) => nodes.find((n) => n.id === id)?.title;
  const notes = [];
  const images = [];
  let k = 0;
  const note = async ({ text, kind, groupId = null, by, days, jobs = [], photos = 0, hue = 210, extra = {} }) => {
    const at = ago(days);
    const refs = [];
    for (let i = 0; i < photos; i++) {
      const p = await samplePhoto(++k, hue + i * 25);
      images.push({ ...p, by, at });
      refs.push({ ...PH.refOf(p), by });
    }
    notes.push({ ...NT.noteNode({ id: newId(), text, kind, groupId, by, at, photos: refs, jobs: jobs.map((id) => ({ id, title: titleOf(id) })) }), ...extra });
  };
  await note({ kind: 'issue', groupId: fixes, by: riley, days: 0.1, photos: 1, hue: 200,
    text: 'Access hatch hinge binds after painting\nPaint builds up in the knuckle and the pin seizes. Seen on the last two units.\n- More clearance in the knuckle, or\n- mask it before paint' });
  await note({ kind: 'idea', groupId: chairs, by: casey, days: 0.8,
    text: 'Fold-down footrest on the helm chair\nTwo customers asked about it this month. Could it share the armrest pivot so it stays one bracket?' });
  await note({ kind: 'reference', groupId: davits, by: alex, days: 2, photos: 3, hue: 30,
    text: 'As built: 550kg davit base plate weld prep\nBevel on both sides, 3 mm root gap. Photos from the second unit, before and after the root pass.' });
  await note({ kind: 'issue', groupId: fixes, by: riley, days: 6, photos: 1, hue: 120, jobs: [hinge],
    text: 'Door hinge plate flexes when the door is slammed\nVisible gap at the top hinge after a few cycles.' });
  await note({ kind: 'issue', groupId: laser, by: riley, days: 9,
    text: 'Laser parts arrive with sharp edges\nEspecially the small tabs.',
    extra: { state: 'dismissed', dismissed: { by: me, at: ago(8), reason: 'Deburring is a workshop step, not a drawing change.' } } });
  await note({ kind: 'idea', groupId: water, by: me, days: 12, jobs: [membrane],
    text: 'One hole pattern for every membrane bracket\nThree patterns today; one would let us stock a single plate.', extra: { state: 'resolved' } });
  await note({ kind: 'reference', by: me, days: 20,
    text: 'How revision PDFs are named\n- **Job name**, then the revision: R1, R2…\n- One PDF per drawing set, never per sheet\n- Superseded sets go in the Old folder, not deleted' });
  await Store.commit({ noteSet: notes, images });
  toast('Sample data loaded: invented jobs and notes, in this browser only');
}

/**
 * An invented "photo": a drawn plate with holes, nothing real. Run through
 * photos.js like any photo, so the sample exercises resizing and thumbnails.
 */
async function samplePhoto(n, hue) {
  const W = 1600;
  const H = 1200;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, `hsl(${hue} 18% 34%)`);
  grad.addColorStop(1, `hsl(${hue + 30} 14% 12%)`);
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
  g.fillStyle = `hsl(${hue} 6% 68%)`;
  g.fillRect(340, 290, 920, 560);
  g.fillStyle = `hsl(${hue} 10% 20%)`;
  for (const [x, y] of [[450, 400], [1150, 400], [450, 740], [1150, 740]]) { g.beginPath(); g.arc(x, y, 44, 0, Math.PI * 2); g.fill(); }
  g.strokeStyle = '#f2b84b';
  g.lineWidth = 10;
  g.beginPath();
  g.arc(700 + ((n * 70) % 240), 570, 120, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = 'rgba(255, 255, 255, .85)';
  g.font = '600 52px system-ui, sans-serif';
  g.fillText(`Sample photo ${n}`, 56, H - 64);
  const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.85));
  return PH.prepare(new File([blob], `sample-${n}.jpg`, { type: 'image/jpeg' }));
}
