// access.js - the accounts and their roles, as data. Copied from the board,
// with this app's roles.
//
// One document, settings/access, holds five lists of addresses: leads,
// designers, contributors, managers, and masters. The first four are the
// roles, one address in at most one of them. The Firestore rules read the
// lists directly, so they must stay flat arrays. MASTERS is not a role: a
// master is whichever role they are, and additionally the only one who may
// change the lists.
//
// On screen the roles are Design lead · Designer · Contributor · Manager
// contributor (working name). In code and in the document they are
// lead | designer | contributor | manager.

import { tidyEmail } from './auth.js';

export const ROLES = ['lead', 'designer', 'contributor', 'manager'];
export const ROLE_LABEL = { lead: 'Design lead', designer: 'Designer', contributor: 'Contributor', manager: 'Manager contributor' };
export const ROLE_WORDS = {
  lead: 'everything: all jobs, checking, categories, imports',
  designer: 'their own tasks, updates and submitting for check',
  contributor: 'the Log only',
  manager: 'the jobs the lead shares, and the Log',
};

const LISTS = ['leads', 'designers', 'contributors', 'managers', 'masters'];
const ROLE_LIST = { lead: 'leads', designer: 'designers', contributor: 'contributors', manager: 'managers' };

const tidyList = (xs) => [...new Set((Array.isArray(xs) ? xs : []).map(tidyEmail).filter(Boolean))];

/**
 * The document as the app holds it: five tidy, de-duplicated lists. With no
 * masters, the first lead listed is the master - the same default the rules
 * apply - so the document can be claimed and then handed on from the app
 * without anyone touching the console.
 */
export function normaliseAccess(d) {
  const out = {};
  for (const k of LISTS) out[k] = tidyList(d?.[k]);
  if (!out.masters.length && out.leads.length) out.masters = [out.leads[0]];
  return out;
}

/**
 * The role an address has, or null when it is on no list. Unlisted reads
 * nothing (the rules say so), so the app shows it nothing either.
 */
export function roleOf(access, email) {
  const e = tidyEmail(email);
  if (access?.leads?.includes(e)) return 'lead';
  if (access?.designers?.includes(e)) return 'designer';
  if (access?.managers?.includes(e)) return 'manager';
  if (access?.contributors?.includes(e)) return 'contributor';
  return null;
}

export const isMaster = (access, email) => Boolean(access?.masters?.includes(tidyEmail(email)));

/** Every listed account as a row, masters first, then by role, then by address. */
export function accountRows(access) {
  const a = normaliseAccess(access);
  const all = [...new Set([...a.leads, ...a.designers, ...a.managers, ...a.contributors, ...a.masters])];
  const rank = { lead: 0, designer: 1, manager: 2, contributor: 3 };
  return all
    .map((email) => ({ email, role: roleOf(a, email) ?? 'contributor', master: a.masters.includes(email) }))
    .sort((x, y) => Number(y.master) - Number(x.master) || rank[x.role] - rank[y.role] || x.email.localeCompare(y.email));
}

/** The lists with this address in exactly the one role. Masters untouched. */
export function withRole(access, email, role) {
  if (!ROLES.includes(role)) throw new Error(`Not a role: ${role}`);
  const e = tidyEmail(email);
  const a = normaliseAccess(access);
  for (const r of ROLES) a[ROLE_LIST[r]] = a[ROLE_LIST[r]].filter((x) => x !== e);
  a[ROLE_LIST[role]] = [...a[ROLE_LIST[role]], e];
  return a;
}

/** The lists with this address on, or off, the masters list. */
export function withMaster(access, email, on) {
  const e = tidyEmail(email);
  const a = normaliseAccess(access);
  a.masters = on ? [...new Set([...a.masters, e])] : a.masters.filter((x) => x !== e);
  return a;
}

/** The lists without this address on any role list. Masters untouched. */
export function withoutAccount(access, email) {
  const e = tidyEmail(email);
  const a = normaliseAccess(access);
  for (const r of ROLES) a[ROLE_LIST[r]] = a[ROLE_LIST[r]].filter((x) => x !== e);
  return a;
}

/**
 * A temporary password for an account just made: letters and digits,
 * readable aloud, no lookalikes. Changed by its owner under the cog on first
 * sign-in.
 */
export function tempPassword() {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  const pick = (n) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => alphabet[b % alphabet.length]).join('');
  return `${pick(4)}-${pick(4)}-${pick(4)}`;
}
