// collections.js — every Firestore collection's name, in one place. Never write
// one anywhere else. Its own module because the hub's card (hub-card.js) needs
// the names without the store, which brings Firebase with it.

export const COL = {
  settings: 'settings',     // settings/access: who is what (the rules read it)
  people: 'people',         // people/{email}: display name, initials
  tasks: 'tasks',           // every node: group | product | task (and step, until converted)
  updates: 'updates',       // tasks/{id}/updates/{id}: the timeline
  images: 'images',         // photos as Bytes, one per document (photos.js)
  notes: 'notes',           // the Log
  time: 'time',             // time tracking: one stretch of work per document (timing.js)
  parts: 'parts',           // settings/quote/parts/{id}: the export's Word template, in pieces (quote.js)
};
