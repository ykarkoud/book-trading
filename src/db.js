'use strict';

const knex = require('knex');

/**
 * Build a Knex instance from environment variables.
 * - Default: in-memory SQLite (better-sqlite3), single connection so all
 *   queries see the same database.
 * - DATABASE_FILE=path: SQLite file on disk.
 * - DB_CLIENT=mysql: MySQL/MariaDB via mysql2, credentials from DB_* env vars.
 * No credentials are stored in code.
 */
function createDb(env = process.env) {
  if ((env.DB_CLIENT || '').toLowerCase() === 'mysql') {
    return knex({
      client: 'mysql2',
      connection: {
        host: env.DB_HOST || 'localhost',
        port: Number(env.DB_PORT || 3306),
        user: env.DB_USER,
        password: env.DB_PASSWORD,
        database: env.DB_NAME,
        charset: 'utf8mb4',
      },
      pool: { min: 0, max: 5 },
    });
  }

  const filename = env.DATABASE_FILE || ':memory:';
  return knex({
    client: 'better-sqlite3',
    connection: { filename },
    useNullAsDefault: true,
    // One connection: required for ':memory:' so every query sees the same DB.
    pool: { min: 1, max: 1 },
  });
}

/** Create the minimal schema if it is missing (idempotent). */
async function init(db) {
  const exists = await db.schema.hasTable('books');
  if (!exists) {
    await db.schema.createTable('books', (table) => {
      table.increments('id').primary();
      table.string('title', 255).notNullable();
      table.string('author', 255).notNullable();
    });
  }
}

module.exports = { createDb, init };
