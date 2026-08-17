/**
 * =============================================================================
 * Migration: users + otp_sessions
 * =============================================================================
 * Creates the core tables for auth and the user list.
 *
 * users         — app users identified by mobile number
 * otp_sessions  — temporary OTP / Firebase session storage
 * =============================================================================
 */

/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function up(knex) {
  await knex.schema.createTable('users', (table) => {
    table.increments('id').primary();
    table.string('mobile', 20).notNullable().unique();
    table.string('first_name', 100).nullable();
    table.string('last_name', 100).nullable();
    table.string('username', 50).nullable().unique();
    table.string('email', 255).nullable().unique();
    table.string('firebase_uid', 128).nullable().unique();
    table.boolean('is_profile_complete').notNullable().defaultTo(false);
    table.timestamps(true, true);

    table.index(['first_name', 'last_name']);
  });

  await knex.schema.createTable('otp_sessions', (table) => {
    table.increments('id').primary();
    table.string('mobile', 20).notNullable().index();
    /** bcrypt hash of local OTP (null when using Firebase sessionInfo) */
    table.string('otp_hash', 255).nullable();
    /** Firebase Identity Toolkit sessionInfo for SMS OTP verify */
    table.string('firebase_session_info', 512).nullable();
    table.timestamp('expires_at').notNullable();
    table.boolean('is_verified').notNullable().defaultTo(false);
    table.timestamps(true, true);
  });
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('otp_sessions');
  await knex.schema.dropTableIfExists('users');
};
