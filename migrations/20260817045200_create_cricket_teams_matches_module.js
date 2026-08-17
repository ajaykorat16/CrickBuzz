/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function(knex) {
  await knex.schema.createTable('teams', (table) => {
    table.increments('id').primary();
    table.integer('owner_id').unsigned().notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.string('name', 255).notNullable();
    table.string('short_name', 50).nullable();
    table.string('logo', 255).nullable();
    table.string('city', 100).nullable();
    table.text('description').nullable();
    table.boolean('is_active').notNullable().defaultTo(true);
    table.timestamps(true, true);
    table.timestamp('deleted_at').nullable();

    table.index('owner_id');
  });

  await knex.schema.createTable('team_players', (table) => {
    table.increments('id').primary();
    table.integer('team_id').unsigned().notNullable().references('id').inTable('teams').onDelete('CASCADE');
    table.integer('user_id').unsigned().notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.boolean('is_captain').notNullable().defaultTo(false);
    table.boolean('is_vice_captain').notNullable().defaultTo(false);
    table.string('jersey_number', 20).nullable();
    table.timestamp('joined_at').defaultTo(knex.fn.now());
    table.timestamp('left_at').nullable();
    table.boolean('is_active').notNullable().defaultTo(true);
    table.timestamps(true, true);

    table.index('team_id');
    table.index('user_id');
  });

  await knex.schema.createTable('matches', (table) => {
    table.increments('id').primary();
    table.integer('created_by').unsigned().notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.integer('team_a_id').unsigned().notNullable().references('id').inTable('teams').onDelete('CASCADE');
    table.integer('team_b_id').unsigned().notNullable().references('id').inTable('teams').onDelete('CASCADE');
    table.string('match_type', 50).notNullable();
    table.decimal('overs', 5, 1).nullable();
    table.string('venue', 255).nullable();
    table.string('city', 100).nullable();
    table.date('scheduled_date').nullable();
    table.time('scheduled_time').nullable();
    table.string('status', 50).notNullable().defaultTo('SCHEDULED');
    table.integer('toss_winner_team_id').unsigned().nullable().references('id').inTable('teams').onDelete('SET NULL');
    table.string('toss_decision', 20).nullable();
    table.integer('winner_team_id').unsigned().nullable().references('id').inTable('teams').onDelete('SET NULL');
    table.string('result_type', 50).nullable();
    table.string('result_description', 255).nullable();
    table.timestamps(true, true);
    table.timestamp('deleted_at').nullable();

    table.index('created_by');
    table.index('team_a_id');
    table.index('team_b_id');
    table.index('scheduled_date');
    table.index('status');
  });
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function(knex) {
  await knex.schema.dropTableIfExists('matches');
  await knex.schema.dropTableIfExists('team_players');
  await knex.schema.dropTableIfExists('teams');
};
