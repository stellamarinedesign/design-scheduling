// samples.js — INVENTED fixtures for the tests. The repository is public: no
// real job, customer, vessel or staff name may appear here (CLAUDE.md).
// Titles are generic on purpose ("Bracket redesign"), shaped like the real
// work without being any of it.

const AT = '2026-10-01T00:00:00.000Z';

/** The invented lead the fixtures' own tasks belong to (the tests' BY). */
export const LEAD = 'lead@example.test';

/**
 * A small tree: two master categories, categories, jobs, the tasks inside a
 * job, a section, a product. Since steps merged into tasks (2026-11-06),
 * what were steps are tasks with nobody on them - part of their job - and
 * what were subtasks are tasks with someone on them (here the lead, whose
 * own subtasks they were).
 */
export function sampleNodes() {
  const n = (o) => ({ archivedAt: null, createdAt: AT, updatedAt: AT, lastActivityAt: AT, ...o });
  const part = (o) => n({ kind: 'task', assignee: null, createdBy: LEAD, ...o });
  return [
    n({ id: 'g-prod', kind: 'group', parentId: null, order: 1024, name: 'Production' }),
    n({ id: 'g-alpha', kind: 'group', parentId: 'g-prod', order: 1024, name: 'Alpha Units', colour: 2,
      stepsTemplate: [{ label: 'Concept' }, { label: '3D model', children: [{ label: 'Body' }, { label: 'Head' }] }, { label: 'Drawings' }] }),
    n({ id: 'g-alpha-sub', kind: 'group', parentId: 'g-alpha', order: 4096, name: 'Small range' }),
    n({ id: 'g-beta', kind: 'group', parentId: 'g-prod', order: 2048, name: 'Beta Frames', colour: 5 }),
    n({ id: 'g-prog', kind: 'group', parentId: null, order: 2048, name: 'Programs' }),

    n({ id: 'j1', kind: 'task', parentId: 'g-alpha', order: 1024, title: 'Bracket redesign', status: 'in_progress' }),
    n({ id: 'j2', kind: 'task', parentId: 'g-alpha', order: 2048, title: 'Hinge plate update', status: 'todo' }),
    n({ id: 'j3', kind: 'task', parentId: 'g-alpha-sub', order: 1024, title: 'Compact frame concept', status: 'todo' }),
    n({ id: 'j4', kind: 'task', parentId: 'g-beta', order: 1024, title: 'Panel cut list', status: 'done' }),

    // j1's insides: tasks part of the job, one holding tasks of its own, a
    // task someone has among them, and a section.
    part({ id: 's1', parentId: 'j1', order: 1024, title: 'Concept', status: 'done' }),
    part({ id: 's2', parentId: 'j1', order: 2048, title: '3D model', status: 'todo' }),
    part({ id: 's2a', parentId: 's2', order: 1024, title: 'Body', status: 'done' }),
    part({ id: 's2b', parentId: 's2', order: 2048, title: 'Head', status: 'todo' }),
    n({ id: 't1', kind: 'task', parentId: 's2', order: 3072, title: 'Swap pins to standard', status: 'in_progress', assignee: LEAD, createdBy: LEAD }),
    part({ id: 's3', parentId: 'j1', order: 3072, title: 'Approval', status: 'cancelled', cancelled: { by: LEAD, at: AT, reason: 'Was N/a', prevStatus: 'todo' } }),
    n({ id: 'sec', kind: 'group', parentId: 'j1', order: 4096, name: 'Laser' }),
    n({ id: 't2', kind: 'task', parentId: 'sec', order: 1024, title: 'Laser files', status: 'todo', assignee: LEAD, createdBy: LEAD }),
  ];
}

/**
 * The same tree as it was stored before steps merged into tasks: steps with
 * a label and a state, subtasks among them. The migration's input.
 */
export function sampleStepNodes() {
  const n = (o) => ({ archivedAt: null, createdAt: AT, updatedAt: AT, lastActivityAt: AT, ...o });
  return [
    n({ id: 'g-prod', kind: 'group', parentId: null, order: 1024, name: 'Production' }),
    n({ id: 'g-alpha', kind: 'group', parentId: 'g-prod', order: 1024, name: 'Alpha Units', colour: 2,
      stepsTemplate: [{ label: 'Concept' }, { label: '3D model', children: [{ label: 'Body' }, { label: 'Head' }] }, { label: 'Drawings' }] }),
    n({ id: 'g-alpha-sub', kind: 'group', parentId: 'g-alpha', order: 4096, name: 'Small range' }),
    n({ id: 'g-beta', kind: 'group', parentId: 'g-prod', order: 2048, name: 'Beta Frames', colour: 5 }),
    n({ id: 'g-prog', kind: 'group', parentId: null, order: 2048, name: 'Programs' }),

    n({ id: 'j1', kind: 'task', parentId: 'g-alpha', order: 1024, title: 'Bracket redesign', status: 'in_progress' }),
    n({ id: 'j2', kind: 'task', parentId: 'g-alpha', order: 2048, title: 'Hinge plate update', status: 'todo' }),
    n({ id: 'j3', kind: 'task', parentId: 'g-alpha-sub', order: 1024, title: 'Compact frame concept', status: 'todo' }),
    n({ id: 'j4', kind: 'task', parentId: 'g-beta', order: 1024, title: 'Panel cut list', status: 'done' }),

    // j1's insides: steps with sub-steps, a subtask among them, and a section.
    n({ id: 's1', kind: 'step', parentId: 'j1', order: 1024, label: 'Concept', state: 'done' }),
    n({ id: 's2', kind: 'step', parentId: 'j1', order: 2048, label: '3D model', state: 'todo' }),
    n({ id: 's2a', kind: 'step', parentId: 's2', order: 1024, label: 'Body', state: 'done' }),
    n({ id: 's2b', kind: 'step', parentId: 's2', order: 2048, label: 'Head', state: 'todo' }),
    n({ id: 't1', kind: 'task', parentId: 's2', order: 3072, title: 'Swap pins to standard', status: 'in_progress' }),
    n({ id: 's3', kind: 'step', parentId: 'j1', order: 3072, label: 'Approval', state: 'na' }),
    n({ id: 'sec', kind: 'group', parentId: 'j1', order: 4096, name: 'Laser' }),
    n({ id: 't2', kind: 'task', parentId: 'sec', order: 1024, title: 'Laser files', status: 'todo' }),
  ];
}

/** An invented TileDo data.json: the real file's shape, none of its content. */
export const tiledoData = {
  stages: [
    { id: 'todo', name: 'To Do', color: '#7a8088' },
    { id: 'in_progress', name: 'In Progress', color: '#4a90d0' },
    { id: 'blocked', name: 'Blocked', color: '#cc4444' },
    { id: 'review', name: 'Review', color: '#e8982a' },
  ],
  templates: [],
  tasks: [
    { id: 'aaaaaaaa-0000-0000-0000-000000000001', title: 'Current Jobs', notes: '', priority: 'medium', stage: 'todo', parent_id: null, recurring: false, completed: false, order: 0, created: '2026-09-01T08:00:00.000000' },
    { id: 'aaaaaaaa-0000-0000-0000-000000000002', title: 'Alpha unit rework', notes: 'Check the mounting holes.', priority: 'high', stage: 'in_progress', parent_id: 'aaaaaaaa-0000-0000-0000-000000000001', recurring: false, completed: false, order: 0, created: '2026-09-02T08:00:00.000000', view: 'list' },
    { id: 'aaaaaaaa-0000-0000-0000-000000000003', title: 'Model the base', notes: '', priority: 'medium', stage: 'todo', parent_id: 'aaaaaaaa-0000-0000-0000-000000000002', recurring: false, completed: true, order: 0, created: '2026-09-02T09:00:00.000000' },
    { id: 'aaaaaaaa-0000-0000-0000-000000000004', title: 'Waiting on supplier sample', notes: '', priority: 'low', stage: 'blocked', parent_id: 'aaaaaaaa-0000-0000-0000-000000000002', recurring: false, completed: false, order: 1, created: '2026-09-03T09:00:00.000000', waiting: { note: 'Sample due next week', since: '2026-09-10T09:00:00.000000', prev_stage: 'in_progress' } },
    { id: 'aaaaaaaa-0000-0000-0000-000000000005', title: 'Beta frame drawings', notes: '', priority: 'medium', stage: 'review', parent_id: 'aaaaaaaa-0000-0000-0000-000000000001', recurring: false, completed: false, order: 1, created: '2026-09-04T09:00:00.000000' },
    { id: 'aaaaaaaa-0000-0000-0000-000000000006', title: 'Misc', notes: '', priority: 'medium', stage: 'todo', parent_id: null, recurring: false, completed: false, order: 1, created: '2026-09-01T08:00:00.000000' },
    { id: 'aaaaaaaa-0000-0000-0000-000000000007', title: 'Tidy the template folder', notes: '', priority: 'medium', stage: 'todo', parent_id: 'aaaaaaaa-0000-0000-0000-000000000006', recurring: false, completed: true, order: 0, created: '2026-09-05T09:00:00.000000' },
  ],
};

export const tiledoArchive = {
  tasks: [
    { id: 'aaaaaaaa-0000-0000-0000-000000000099', title: 'Old cleanup', notes: '', priority: 'low', stage: 'todo', parent_id: null, recurring: false, completed: true, order: 0, created: '2026-08-01T08:00:00.000000', archived_at: '2026-08-20T08:00:00.000000' },
  ],
};

/** An invented Excel Todo sheet, as rows of cells (SheetJS `header: 1` output). */
export const excelRows = [
  ['Drafting tracker'],
  [],
  ['Model', 'Status', 'Status Notes', 'Notes', 'Checked'],
  ['Alpha bracket R2', 'In Progress', 'Drawings half done', 'Use the standard pins', ''],
  ['Beta frame laser', 'Done', 'Laser files out', '', 'Done'],
  ['Gamma panel', 'Done', 'Needs another look', '', 'Fix'],
  ['Delta clamp', '', '', 'Low priority', ''],
  ['Old idea', 'N/a', '', '', ''],
  ['Theta cradle', 'Cancelled', 'Cancelled - verbal 12/03/26', '', ''],
  [],
  ['Handover'],
  ['Model', 'Status', 'Status Notes', 'Notes', 'Path'],
  ['Epsilon mount', 'In Progress', '', '', 'Stella Systems\\Example Products\\02 - Production\\Epsilon'],
  ['Zeta stand', 'Done', '', '', 'C:\\Users\\someone\\OneDrive - Example\\Stella Systems\\Example Products\\Zeta'],
  ['Eta bad path', '', '', '', 'D:\\Elsewhere\\Eta'],
];

/**
 * A register (the Progress page) of PRODUCT LINES, INVENTED (owner,
 * 2026-11-19: no real product, model or customer names). Lifters holds the
 * line Custom Lifters, whose template is the owner's example: Concept,
 * Approval (waits on the customer), Engineering with four sub-steps, and
 * Production. Its rows stray from the template in the usual ways. Davits
 * holds a listed line; a sub-category holds a line with no template; Minor
 * fixes has a template but is no line.
 */
export function lineNodes() {
  const n = (o) => ({ archivedAt: null, createdAt: AT, updatedAt: AT, lastActivityAt: AT, ...o });
  const job = (o) => n({ kind: 'task', assignee: LEAD, createdBy: LEAD, revision: null, ...o });
  const part = (o) => n({ kind: 'task', assignee: null, createdBy: LEAD, ...o });
  const since = '2026-09-25T00:00:00.000Z';
  return [
    n({ id: 'm', kind: 'group', parentId: null, order: 1024, name: 'Products' }),
    n({ id: 'lift', kind: 'group', parentId: 'm', order: 1024, name: 'Lifters', colour: 3 }),
    n({ id: 'cl', kind: 'group', parentId: 'lift', order: 1024, name: 'Custom Lifters', line: true, listed: false,
      stepsTemplate: [{ label: 'Concept' }, { label: 'Approval', waits: true },
        { label: 'Engineering', children: [{ label: '3D Model' }, { label: 'Drawing' }, { label: 'Laser' }, { label: 'PDF' }] }, { label: 'Production' }] }),

    // Custom 45: under way. No PDF yet, a sub-step outside the template, "drawing" in lower case.
    job({ id: 'r1', parentId: 'cl', order: 1024, title: 'Custom 45', status: 'in_progress', revision: 'R2' }),
    part({ id: 'r1c', parentId: 'r1', order: 1024, title: 'Concept', status: 'done' }),
    part({ id: 'r1a', parentId: 'r1', order: 2048, title: 'Approval', status: 'done', waits: true }),
    part({ id: 'r1e', parentId: 'r1', order: 3072, title: 'Engineering', status: 'todo' }),
    part({ id: 'r1e1', parentId: 'r1e', order: 1024, title: '3D Model', status: 'done' }),
    part({ id: 'r1e2', parentId: 'r1e', order: 2048, title: 'drawing', status: 'in_progress' }),
    part({ id: 'r1e3', parentId: 'r1e', order: 3072, title: 'Laser', status: 'todo' }),
    part({ id: 'r1e9', parentId: 'r1e', order: 4096, title: 'FEA', status: 'todo' }),
    part({ id: 'r1p', parentId: 'r1', order: 4096, title: 'Production', status: 'todo' }),

    // Model 500: waiting on the customer at Approval; on the lists by its own switch; an extra task.
    job({ id: 'r2', parentId: 'cl', order: 2048, title: 'Model 500', status: 'waiting', listed: true,
      waiting: { note: 'Approval with the customer', since, prevStatus: 'in_progress', blockedBy: [], stageId: 'r2a' } }),
    part({ id: 'r2c', parentId: 'r2', order: 1024, title: 'Concept', status: 'done' }),
    part({ id: 'r2a', parentId: 'r2', order: 2048, title: 'Approval', status: 'waiting', waits: true,
      waiting: { note: 'On the customer', since, prevStatus: 'todo', blockedBy: [] } }),
    part({ id: 'r2e', parentId: 'r2', order: 3072, title: 'Engineering', status: 'todo' }),
    part({ id: 'r2e1', parentId: 'r2e', order: 1024, title: '3D Model', status: 'todo' }),
    part({ id: 'r2e2', parentId: 'r2e', order: 2048, title: 'Drawing', status: 'todo' }),
    part({ id: 'r2e3', parentId: 'r2e', order: 3072, title: 'Laser', status: 'todo' }),
    part({ id: 'r2e4', parentId: 'r2e', order: 4096, title: 'PDF', status: 'todo' }),
    part({ id: 'r2p', parentId: 'r2', order: 4096, title: 'Production', status: 'todo' }),
    part({ id: 'r2x', parentId: 'r2', order: 5120, title: 'Paint spec', status: 'done' }),

    // Model 600: cancelled. Model 700: done, with no tasks at all.
    job({ id: 'r3', parentId: 'cl', order: 3072, title: 'Model 600', status: 'cancelled' }),
    part({ id: 'r3c', parentId: 'r3', order: 1024, title: 'Concept', status: 'done' }),
    job({ id: 'r4', parentId: 'cl', order: 4096, title: 'Model 700', status: 'done' }),

    // A sub-category with a line that has no template: its columns are the names its rows use.
    n({ id: 'small', kind: 'group', parentId: 'lift', order: 2048, name: 'Small lifters' }),
    n({ id: 'cp', kind: 'group', parentId: 'small', order: 1024, name: 'Compact', line: true, listed: false }),
    job({ id: 'c1', parentId: 'cp', order: 1024, title: 'C1', status: 'in_progress' }),
    part({ id: 'c1a', parentId: 'c1', order: 1024, title: 'Frame', status: 'done' }),
    part({ id: 'c1b', parentId: 'c1', order: 2048, title: 'Print', status: 'todo' }),
    job({ id: 'c2', parentId: 'cp', order: 2048, title: 'C2', status: 'todo' }),
    part({ id: 'c2a', parentId: 'c2', order: 1024, title: 'Print', status: 'todo' }),
    part({ id: 'c2b', parentId: 'c2', order: 2048, title: 'Fit', status: 'todo' }),
    part({ id: 'c2c', parentId: 'c2', order: 3072, title: 'frame', status: 'todo' }),

    // A line on the lists (made from a category in Tasks).
    n({ id: 'dav', kind: 'group', parentId: 'm', order: 2048, name: 'Davits', colour: 5 }),
    n({ id: 'fx', kind: 'group', parentId: 'dav', order: 1024, name: 'Fixed arm', line: true, stepsTemplate: [{ label: 'Model' }, { label: 'Drawings' }] }),
    job({ id: 'f1', parentId: 'fx', order: 1024, title: 'F120', status: 'done', revision: 'R4' }),
    part({ id: 'f1a', parentId: 'f1', order: 1024, title: 'Model', status: 'done' }),
    part({ id: 'f1b', parentId: 'f1', order: 2048, title: 'Drawings', status: 'done' }),

    // A template, but no line: not on the Progress page. Its job is brought in by a test.
    n({ id: 'minor', kind: 'group', parentId: 'm', order: 3072, name: 'Minor fixes', stepsTemplate: [{ label: 'Fix' }] }),
    job({ id: 'oj', parentId: 'minor', order: 1024, title: 'Old job', status: 'waiting',
      waiting: { note: 'Parts from the supplier', since, prevStatus: 'in_progress', blockedBy: ['f1'] } }),
    part({ id: 'oj1', parentId: 'oj', order: 1024, title: 'concept', status: 'done' }),
    part({ id: 'oj2', parentId: 'oj', order: 2048, title: '3D model', status: 'in_progress' }),
    part({ id: 'oj3', parentId: 'oj', order: 3072, title: 'Approval', status: 'todo' }),
    part({ id: 'oj4', parentId: 'oj', order: 4096, title: 'Notes', status: 'todo' }),
    part({ id: 'oj4a', parentId: 'oj4', order: 1024, title: 'Inside the notes', status: 'todo' }),
    n({ id: 'ojs', kind: 'group', parentId: 'oj', order: 5120, name: 'Paper' }),
    part({ id: 'oj5', parentId: 'ojs', order: 1024, title: 'Drawing', status: 'done' }),
  ];
}

/**
 * The Excel tracker's Progress sheet, INVENTED, in the shape the real one
 * has: a title, "Date:" rows before each family, a family's name on its own,
 * header rows naming each section, a legend down the side past the last
 * column, a blank header cell, rows with only a name, a row with no name, a
 * note typed in a cell, cancelled rows, and a stray note before a header.
 */
export const progressRows = [
  ['GENERAL PROGRESS:'],
  [],
  ['Date:', '2026-10-30', '', '', '', '', '', '', '', '', '', '', 'N/a'],
  ['Hoists', '', '', '', '', '', '', '', '', '', '', '', 'Done'],
  ['', '', '', '', '', '', '', '', '', '', '', '', 'In Progress'],
  ['Single arm', 'Archived', 'Model', 'Laser', '', 'Drawings', 'Checked', 'Comments/ File Path', 'Revision No.', '', '', '', 'Fix'],
  ['100kg', 'Done', 'Done', 'N/a', 'ignored', 'Done', 'Done', 'Stella Systems\\Example Products\\Hoists\\100kg', 'R4', '', '', '', 'Cancelled'],
  ['200kg', 'Done', 'In Progress', '', '', '', '', 'Check the base plate', 'R1-->R2'],
  ['300kg (twin)', '(see the twin note)', '', '', '', '', '', '', ''],
  ['400kg'],
  [],
  ['Folding arm', 'Archived', 'Model', 'Laser', '', 'Drawings', 'Checked', 'Comments/ File Path'],
  ['150kg', 'Done', 'Done', 'Done', '', 'Done', 'Done', ''],
  ['', 'N/a', 'Fix', '', '', '', '', ''],
  [],
  ['Date:', '2026-10-30'],
  ['Platform lifts'],
  [],
  ['Lift', 'Concept', 'Approval', '3D', 'Drawings', 'Comments/ File Path'],
  ['Unit A', 'Done', 'Done', 'Done', 'Done', 'Email chain from the customer'],
  ['Unit B', 'Cancelled', '', '', '', 'Cancelled - verbal 12/03/26'],
  ['Unit C', 'Done', 'Cancelled', '', '', 'Customer dissolved'],
  ['Unit D', 'Done', 'Fix', 'Waiting', '', ''],
  ['Unit E', 'Cancelled', 'Done', '', '', ''],
  ['Date:', '2026-10-30'],
  ['Research'],
  ['', '', '', 'calc, cost, sign off'],
  ['Project', 'Research', 'Concept design', 'Comments/ File Path'],
  ['Winch idea', 'In Progress', '', ''],
  ['Date:', '2026-10-30'],
  ['Empty family'],
];
