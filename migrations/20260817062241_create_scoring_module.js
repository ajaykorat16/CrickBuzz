/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function(knex) {
  // innings
  await knex.schema.createTable('innings', (table) => {
    table.increments('id').primary();
    table.integer('match_id').unsigned().notNullable().references('id').inTable('matches').onDelete('CASCADE');
    table.integer('innings_number').notNullable();
    table.integer('batting_team_id').unsigned().notNullable().references('id').inTable('teams').onDelete('CASCADE');
    table.integer('bowling_team_id').unsigned().notNullable().references('id').inTable('teams').onDelete('CASCADE');
    table.integer('total_runs').notNullable().defaultTo(0);
    table.integer('total_wickets').notNullable().defaultTo(0);
    table.integer('total_legal_balls').notNullable().defaultTo(0);
    table.decimal('overs', 5, 1).notNullable().defaultTo(0.0);
    table.integer('target_runs').nullable();
    table.string('status', 50).notNullable().defaultTo('IN_PROGRESS'); // IN_PROGRESS, COMPLETED
    table.timestamp('started_at').defaultTo(knex.fn.now());
    table.timestamp('completed_at').nullable();
    table.timestamps(true, true);
    table.index('match_id');
  });

  // match_players
  await knex.schema.createTable('match_players', (table) => {
    table.increments('id').primary();
    table.integer('match_id').unsigned().notNullable().references('id').inTable('matches').onDelete('CASCADE');
    table.integer('team_id').unsigned().notNullable().references('id').inTable('teams').onDelete('CASCADE');
    table.integer('user_id').unsigned().notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.string('player_role', 50).nullable();
    table.integer('batting_position').nullable();
    table.boolean('is_playing').notNullable().defaultTo(true);
    table.timestamps(true, true);
    table.index(['match_id', 'team_id']);
  });

  // innings_state
  await knex.schema.createTable('innings_state', (table) => {
    table.increments('id').primary();
    table.integer('innings_id').unsigned().notNullable().references('id').inTable('innings').onDelete('CASCADE');
    table.integer('striker_id').unsigned().nullable().references('id').inTable('users').onDelete('SET NULL');
    table.integer('non_striker_id').unsigned().nullable().references('id').inTable('users').onDelete('SET NULL');
    table.integer('current_bowler_id').unsigned().nullable().references('id').inTable('users').onDelete('SET NULL');
    table.integer('current_over_number').notNullable().defaultTo(1);
    table.integer('current_ball_number').notNullable().defaultTo(0);
    table.timestamps(true, true);
    table.index('innings_id');
  });

  // overs
  await knex.schema.createTable('overs', (table) => {
    table.increments('id').primary();
    table.integer('innings_id').unsigned().notNullable().references('id').inTable('innings').onDelete('CASCADE');
    table.integer('over_number').notNullable();
    table.integer('bowler_id').unsigned().notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.integer('runs').notNullable().defaultTo(0);
    table.integer('wickets').notNullable().defaultTo(0);
    table.integer('legal_balls').notNullable().defaultTo(0);
    table.string('status', 50).notNullable().defaultTo('IN_PROGRESS'); // IN_PROGRESS, COMPLETED
    table.timestamps(true, true);
    table.index('innings_id');
  });

  // deliveries
  await knex.schema.createTable('deliveries', (table) => {
    table.increments('id').primary();
    table.integer('innings_id').unsigned().notNullable().references('id').inTable('innings').onDelete('CASCADE');
    table.integer('over_id').unsigned().notNullable().references('id').inTable('overs').onDelete('CASCADE');
    table.integer('ball_number').notNullable();
    table.integer('delivery_number').notNullable(); // Actual order in innings
    table.integer('striker_id').unsigned().notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.integer('non_striker_id').unsigned().notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.integer('bowler_id').unsigned().notNullable().references('id').inTable('users').onDelete('CASCADE');
    
    table.integer('runs_off_bat').notNullable().defaultTo(0);
    table.integer('extra_runs').notNullable().defaultTo(0);
    table.integer('total_runs').notNullable().defaultTo(0);
    
    table.string('extra_type', 50).nullable(); // WIDE, NO_BALL, BYE, LEG_BYE, PENALTY
    table.string('wicket_type', 50).nullable(); // BOWLED, CAUGHT, LBW, RUN_OUT, etc.
    table.integer('dismissed_player_id').unsigned().nullable().references('id').inTable('users').onDelete('SET NULL');
    
    table.boolean('is_legal_delivery').notNullable().defaultTo(true);
    table.boolean('is_wicket').notNullable().defaultTo(false);
    table.boolean('is_four').notNullable().defaultTo(false);
    table.boolean('is_six').notNullable().defaultTo(false);
    
    table.string('review_status', 50).nullable();
    table.text('commentary').nullable();
    
    table.timestamps(true, true);
    table.index('innings_id');
    table.index('over_id');
  });

  // Alter matches to add current_innings_id
  await knex.schema.alterTable('matches', (table) => {
    table.integer('current_innings_id').unsigned().nullable().references('id').inTable('innings').onDelete('SET NULL');
  });
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function(knex) {
  await knex.schema.alterTable('matches', (table) => {
    table.dropColumn('current_innings_id');
  });
  await knex.schema.dropTableIfExists('deliveries');
  await knex.schema.dropTableIfExists('overs');
  await knex.schema.dropTableIfExists('innings_state');
  await knex.schema.dropTableIfExists('match_players');
  await knex.schema.dropTableIfExists('innings');
};
