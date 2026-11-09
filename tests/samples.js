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
 * A register (the Progress page), INVENTED: a category of lift frames with a
 * tasks template, its products and their revisions, and a category with no
 * template. Every name is made up.
 */
export function registerNodes() {
  const n = (o) => ({ archivedAt: null, createdAt: AT, updatedAt: AT, lastActivityAt: AT, ...o });
  const job = (o) => n({ kind: 'task', assignee: LEAD, createdBy: LEAD, revision: null, ...o });
  const part = (o) => n({ kind: 'task', assignee: null, createdBy: LEAD, ...o });
  const later = (days) => new Date(Date.parse(AT) + days * 864e5).toISOString();
  return [
    n({ id: 'm', kind: 'group', parentId: null, order: 1024, name: 'Products' }),
    n({ id: 'lf', kind: 'group', parentId: 'm', order: 1024, name: 'Lift Frames', colour: 3,
      stepsTemplate: [{ label: 'Concept' }, { label: '3D', children: [{ label: 'Body' }, { label: 'Arm' }] }, { label: 'Drawings' }, { label: 'Build Form' }] }),
    n({ id: 'lf-small', kind: 'group', parentId: 'lf', order: 9216, name: 'Small' }),
    n({ id: 'misc', kind: 'group', parentId: 'm', order: 2048, name: 'Odd Parts' }),

    // P1: R1 finished (older), R2 open and under way.
    n({ id: 'p1', kind: 'product', parentId: 'lf', order: 1024, name: 'Frame 200' }),
    job({ id: 'p1r1', parentId: 'p1', order: 1024, title: 'Frame 200 R1', status: 'done', revision: 'R1', createdAt: later(0) }),
    part({ id: 'p1r1a', parentId: 'p1r1', order: 1024, title: 'Concept', status: 'done' }),
    job({ id: 'p1r2', parentId: 'p1', order: 2048, title: 'Frame 200 R2', status: 'in_progress', revision: 'R2', createdAt: later(5) }),
    part({ id: 'a1', parentId: 'p1r2', order: 1024, title: 'Concept', status: 'done' }),
    part({ id: 'a2', parentId: 'p1r2', order: 2048, title: '3D', status: 'todo' }),
    part({ id: 'a2a', parentId: 'a2', order: 1024, title: 'Body', status: 'done' }),
    part({ id: 'a2b', parentId: 'a2', order: 2048, title: 'Arm', status: 'todo' }),
    part({ id: 'a3', parentId: 'p1r2', order: 3072, title: 'drawings', status: 'fix' }),
    part({ id: 'a4', parentId: 'p1r2', order: 4096, title: 'Build form', status: 'cancelled' }),

    // P2: one job, finished; every cell done.
    n({ id: 'p2', kind: 'product', parentId: 'lf', order: 2048, name: 'Frame 300' }),
    job({ id: 'p2r4', parentId: 'p2', order: 1024, title: 'Frame 300 R4', status: 'done', revision: 'R4' }),
    part({ id: 'b1', parentId: 'p2r4', order: 1024, title: 'Concept', status: 'done' }),
    part({ id: 'b2', parentId: 'p2r4', order: 2048, title: '3D', status: 'done' }),
    part({ id: 'b3', parentId: 'p2r4', order: 3072, title: 'Drawings', status: 'done' }),
    part({ id: 'b4', parentId: 'p2r4', order: 4096, title: 'Build Form', status: 'done' }),

    // P3: no job yet.
    n({ id: 'p3', kind: 'product', parentId: 'lf', order: 3072, name: 'Frame 400' }),

    // P4: strays from the template - no Concept, an extra task, one in a section, a waiting one.
    n({ id: 'p4', kind: 'product', parentId: 'lf', order: 4096, name: 'Frame 500' }),
    job({ id: 'p4r1', parentId: 'p4', order: 1024, title: 'Frame 500 R1', status: 'waiting', revision: 'Rev 2' }),
    part({ id: 'c2', parentId: 'p4r1', order: 1024, title: '3D', status: 'waiting' }),
    part({ id: 'cx', parentId: 'p4r1', order: 2048, title: 'Weld map', status: 'done' }),
    n({ id: 'csec', kind: 'group', parentId: 'p4r1', order: 3072, name: 'Paperwork' }),
    part({ id: 'c3', parentId: 'csec', order: 1024, title: 'Drawings', status: 'check', assignee: LEAD }),
    part({ id: 'c4', parentId: 'p4r1', order: 4096, title: 'Build Form', status: 'in_progress' }),

    // P5: cancelled.
    n({ id: 'p5', kind: 'product', parentId: 'lf', order: 5120, name: 'Frame 600' }),
    job({ id: 'p5r1', parentId: 'p5', order: 1024, title: 'Frame 600 R1', status: 'cancelled', revision: 'R1' }),
    part({ id: 'e1', parentId: 'p5r1', order: 1024, title: 'Concept', status: 'done' }),

    // A sub-category with a product, under the template above it.
    n({ id: 'p6', kind: 'product', parentId: 'lf-small', order: 1024, name: 'Frame 50' }),
    job({ id: 'p6r1', parentId: 'p6', order: 1024, title: 'Frame 50 R1', status: 'todo' }),

    // No template: the columns are the names the jobs use.
    n({ id: 'p7', kind: 'product', parentId: 'misc', order: 1024, name: 'Clip A' }),
    job({ id: 'p7r1', parentId: 'p7', order: 1024, title: 'Clip A R1', status: 'in_progress' }),
    part({ id: 'f1', parentId: 'p7r1', order: 1024, title: 'Model', status: 'done' }),
    part({ id: 'f2', parentId: 'p7r1', order: 2048, title: 'Print', status: 'todo' }),
    n({ id: 'p8', kind: 'product', parentId: 'misc', order: 2048, name: 'Clip B' }),
    job({ id: 'p8r1', parentId: 'p8', order: 1024, title: 'Clip B R1', status: 'todo' }),
    part({ id: 'g1', parentId: 'p8r1', order: 1024, title: 'Print', status: 'todo' }),
    part({ id: 'g2', parentId: 'p8r1', order: 2048, title: 'Test fit', status: 'todo' }),
    part({ id: 'g3', parentId: 'p8r1', order: 3072, title: 'model', status: 'todo' }),
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
