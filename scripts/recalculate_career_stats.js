const { db } = require('../config/database');
const { updateMatchPlayersStats } = require('../helpers/stats');

async function main() {
  try {
    console.log('Fetching all completed matches...');
    const matches = await db('matches').where({ status: 'COMPLETED' }).whereNull('deleted_at');

    console.log(`Found ${matches.length} completed matches.`);
    for (const match of matches) {
      console.log(`Updating stats for match ${match.id}...`);
      await updateMatchPlayersStats(match.id);
    }

    console.log('Successfully backfilled career stats.');
  } catch (error) {
    console.error('Error backfilling stats:', error);
  } finally {
    process.exit(0);
  }
}

// main();
