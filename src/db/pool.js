const { Pool } = require('pg');
const { env } = require('../config/env');

const ssl =
  env.NODE_ENV === 'production'
    ? {
        rejectUnauthorized: false
      }
    : false;

const pool = new Pool({
  connectionString: env.DATABASE_URL,
  ssl
});

module.exports = { pool };
