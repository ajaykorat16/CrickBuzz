/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function(knex) {
  await knex.schema.createTable('player_career_stats', (table) => {
    table.integer('player_id').unsigned().primary().references('id').inTable('users').onDelete('CASCADE');
    table.integer('matches').unsigned().defaultTo(0);
    // Batting
    table.integer('batting_innings').unsigned().defaultTo(0);
    table.integer('batting_runs').unsigned().defaultTo(0);
    table.integer('batting_balls').unsigned().defaultTo(0);
    table.integer('batting_highest_score').unsigned().defaultTo(0);
    table.integer('batting_fours').unsigned().defaultTo(0);
    table.integer('batting_sixes').unsigned().defaultTo(0);
    table.integer('batting_not_outs').unsigned().defaultTo(0);
    // Bowling
    table.integer('bowling_innings').unsigned().defaultTo(0);
    table.integer('bowling_balls').unsigned().defaultTo(0);
    table.integer('bowling_runs').unsigned().defaultTo(0);
    table.integer('bowling_wickets').unsigned().defaultTo(0);
    table.integer('bowling_maidens').unsigned().defaultTo(0);
    // Fielding
    table.integer('fielding_catches').unsigned().defaultTo(0);
    table.integer('fielding_run_outs').unsigned().defaultTo(0);
    table.integer('fielding_stumpings').unsigned().defaultTo(0);
    
    table.timestamps(true, true);
  });
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function(knex) {
  await knex.schema.dropTableIfExists('player_career_stats');
};
