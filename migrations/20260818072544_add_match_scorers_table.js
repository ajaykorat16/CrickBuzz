/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function(knex) {
  await knex.schema.createTable('match_scorers', (table) => {
    table.increments('id').primary();
    table.integer('match_id').unsigned().notNullable().references('id').inTable('matches').onDelete('CASCADE');
    table.integer('user_id').unsigned().notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.timestamps(true, true);
    
    // Ensure a user can only be added once as a scorer for a specific match
    table.unique(['match_id', 'user_id']);
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function(knex) {
  await knex.schema.dropTableIfExists('match_scorers');
};
