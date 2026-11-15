'use strict';

// Clearly fake sample data, for previews only.
const DEMO_BOOKS = [
  { title: '[Demo] Der Beispielroman', author: 'Erika Musterfrau' },
  { title: '[Demo] The Sample Novel', author: 'Jane Placeholder' },
  { title: '[Demo] Kochen für Testfälle', author: 'Max Mustermann' },
];

function isTruthy(value) {
  if (value === undefined || value === null) return false;
  const v = String(value).trim().toLowerCase();
  return v !== '' && v !== '0' && v !== 'false' && v !== 'no' && v !== 'off';
}

/** Demo data only when NODE_ENV=development or DEBUG is truthy. */
function shouldSeed(env = process.env) {
  return env.NODE_ENV === 'development' || isTruthy(env.DEBUG);
}

/** Insert the demo books once (idempotent: matches on title). */
async function seedDemoData(db) {
  for (const book of DEMO_BOOKS) {
    const existing = await db('books').where({ title: book.title }).first();
    if (!existing) {
      await db('books').insert(book);
    }
  }
}

module.exports = { DEMO_BOOKS, shouldSeed, seedDemoData, isTruthy };
