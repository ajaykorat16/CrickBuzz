const path = require('path');
const knex = require('knex');
const config = require('./index');

/**
 * Single source for Knex config + the shared DB instance.
 * Knex CLI uses the env keys below via: --knexfile config/database.js
 */
const knexConfig = {
  client: 'mysql2',
  connection: {
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: config.db.database,
  },
  // Resolved from this file so CLI works even when cwd differs
  migrations: {
    directory: path.join(__dirname, '../migrations'),
    tableName: 'knex_migrations',
  },
  pool: { min: 0, max: 10 },
};

const envConfigs = {
  development: knexConfig,
  production: knexConfig,
  test: knexConfig,
};

const db = knex(envConfigs[config.env] || envConfigs.development);

module.exports = {
  db,
  development: envConfigs.development,
  production: envConfigs.production,
  test: envConfigs.test,
  knexConfig,
};
