/**
 * Shared Postgres connection pool. Reads DATABASE_URL from .env.
 * Every module that needs Postgres (credentials, sync-state, etc.) should
 * import this single pool rather than creating its own.
 */
const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set — check .env');
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

module.exports = { pool };
