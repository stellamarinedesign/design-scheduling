// views/convert-steps.js — the Design lead's one-time ask: convert the steps
// into tasks (Phase 2.5, decided 2026-11-06; migrate.js holds the logic).
//
// IT ASKS FIRST, with the count, and nothing converts on its own: the strip
// sits at the top of the lead's Home and Tasks pages until the lead presses
// Convert, with Export a backup beside it. Nothing on screen changes when it
// runs - each step already shows as the task it becomes - so the strip says
// what does: the data, so ticks, updates and assigning work on them.

import { el, btn } from '../ui.js';
import * as A from '../actions.js';

let busy = false;

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** The strip, or null when there is nothing to convert (or this is not the lead). */
export function stepsBanner() {
  const n = A.stepsLeft();
  if (!n) return null;
  const convert = btn(busy ? 'Converting…' : `Convert ${plural(n, 'step')} into tasks`, async () => {
    busy = true;
    convert.disabled = true;
    convert.textContent = 'Converting…';
    const done = await A.convertSteps();
    busy = false;
    // Converted: the live tree redraws without the strip. Not: try again.
    if (done === null) { convert.disabled = false; convert.textContent = `Convert ${plural(n, 'step')} into tasks`; }
  }, { cls: 'primary' });
  convert.disabled = busy;
  return el('section', { class: 'callout convert-steps', 'aria-label': 'Convert steps into tasks' },
    el('div', { class: 'callout-head' }, `Steps are tasks now: ${plural(n, 'step')} still stored the old way`),
    el('div', { class: 'callout-body' }, 'Each becomes a task with nobody on it, part of its job, where it is now (archived ones too). They already show that way; until they are converted they can only be ticked, renamed, moved or archived.'),
    el('div', { class: 'acts' },
      convert,
      btn('Export a backup', () => A.exportBackup(), { title: 'Saves every job and task as a file on this computer first' })));
}
