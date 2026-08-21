/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function(knex) {
  await knex.schema.alterTable('deliveries', (table) => {
    table.integer('fielder_id').unsigned().nullable().references('id').inTable('users').onDelete('SET NULL');
  });
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function(knex) {
  await knex.schema.alterTable('deliveries', (table) => {
    table.dropForeign('fielder_id');
    table.dropColumn('fielder_id');
  });
};
