/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function(knex) {
  await knex.schema.alterTable('team_players', (table) => {
    table.string('playing_role', 50).nullable(); // Batter, Bowler, All-Rounder, Wicket-Keeper
  });
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function(knex) {
  await knex.schema.alterTable('team_players', (table) => {
    table.dropColumn('playing_role');
  });
};
