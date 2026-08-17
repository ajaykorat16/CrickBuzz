/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function(knex) {
  await knex.schema.alterTable('users', (table) => {
    table.dropColumn('firebase_uid');
  });

  await knex.schema.alterTable('otp_sessions', (table) => {
    table.dropColumn('firebase_session_info');
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function(knex) {
  await knex.schema.alterTable('users', (table) => {
    table.string('firebase_uid', 128).nullable().unique();
  });

  await knex.schema.alterTable('otp_sessions', (table) => {
    table.string('firebase_session_info', 512).nullable();
  });
};
