// dates.js — calendar days and ages.
//
// TWO KINDS OF TIME, KEPT APART.
//
// An INSTANT (createdAt, lastActivityAt, an update's `at`) is an ISO string
// from `new Date().toISOString()`. It is only ever compared or turned into an
// age ("3d"), so UTC is fine.
//
// A CALENDAR DAY (a due date) is 'YYYY-MM-DD', built from LOCAL parts and never
// from an instant. Brisbane is UTC+10: `toISOString().slice(0, 10)` on a local
// midnight gives the day before, so a due date written that way arrives a day
// early. The production board learnt this the hard way ("Dates are calendar
// days" in its README).

export const pad = (n) => String(n).padStart(2, '0');

/** Now, as an instant. */
export const nowISO = () => new Date().toISOString();

/** A Date as a calendar day, from its local parts. */
export const dayOf = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** A calendar day as a local-midnight Date, or null when it is not one. */
export function parseDay(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s ?? ''));
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** '2026-11-14' → '14 Nov'; another year adds it. */
export function dayLabel(s, today = new Date()) {
  const d = parseDay(s);
  if (!d) return '';
  const base = `${d.getDate()} ${MONTHS[d.getMonth()]}`;
  return d.getFullYear() === today.getFullYear() ? base : `${base} ${d.getFullYear()}`;
}

/** Whole days from today to a calendar day: 0 today, negative when past. */
export function daysUntil(s, today = new Date()) {
  const d = parseDay(s);
  if (!d) return null;
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((d - t) / 86400000);
}

const ms = (iso) => {
  const t = Date.parse(iso ?? '');
  return Number.isNaN(t) ? null : t;
};

/** Whole days since an instant (0 when unknown). */
export function ageDays(iso, now = Date.now()) {
  const t = ms(iso);
  return t === null ? 0 : Math.max(0, Math.floor((now - t) / 86400000));
}

/**
 * The short age a tile shows: '12m', '4h', '3d'. Days all the way up, because
 * "31d untouched" is what reads at a glance; weeks and months make the eye
 * convert. Tabular figures line them up.
 */
export function ageLabel(iso, now = Date.now()) {
  const t = ms(iso);
  if (t === null) return '';
  const mins = Math.max(0, Math.floor((now - t) / 60000));
  if (mins < 60) return `${Math.max(1, mins)}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

/** When something happened, for a timeline: 'just now', '5m ago', 'Yesterday', '12 Oct'. */
export function whenLabel(iso, now = new Date()) {
  const t = ms(iso);
  if (t === null) return '';
  const mins = Math.floor((now.getTime() - t) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const then = new Date(t);
  const days = Math.round((new Date(now.getFullYear(), now.getMonth(), now.getDate())
    - new Date(then.getFullYear(), then.getMonth(), then.getDate())) / 86400000);
  if (days === 0) return `${Math.floor(mins / 60)}h ago`;
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  return dayLabel(dayOf(then), now);
}
