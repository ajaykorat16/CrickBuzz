const { db } = require('../config/database');

/**
 * Calculates a player's career statistics dynamically and upserts them into player_career_stats table
 * @param {number} playerId - The ID of the player
 * @param {import('knex').Knex} trx - Optional Knex transaction
 */
async function updatePlayerCareerStats(playerId, trx = null) {
  const query = trx || db;

  // Get all active teams for the player
  const playerTeams = await query('team_players')
    .where('user_id', playerId)
    .where('is_active', true)
    .pluck('team_id');

  // Get all completed matches for the player
  const matchPlayers = await query('matches')
    .andWhere('status', 'COMPLETED')
    .whereNull('deleted_at')
    .andWhere(function () {
      this.whereIn('team_a_id', playerTeams)
        .orWhereIn('team_b_id', playerTeams);
    })
    .select('id as match_id');

  const matchIds = matchPlayers.map(mp => mp.match_id);

  let stats = {
    player_id: playerId,
    matches: matchIds.length,
    batting_innings: 0,
    batting_runs: 0,
    batting_balls: 0,
    batting_highest_score: 0,
    batting_fours: 0,
    batting_sixes: 0,
    batting_not_outs: 0,
    bowling_innings: 0,
    bowling_balls: 0,
    bowling_runs: 0,
    bowling_wickets: 0,
    bowling_maidens: 0,
    fielding_catches: 0,
    fielding_run_outs: 0,
    fielding_stumpings: 0
  };

  if (matchIds.length > 0) {
    const inningsList = await query('innings').whereIn('match_id', matchIds);
    const inningsIds = inningsList.map(i => i.id);

    if (inningsIds.length > 0) {
      // === Career Batting ===
      const battingByInnings = await query('deliveries')
        .whereIn('innings_id', inningsIds)
        .andWhere('striker_id', playerId)
        .select('innings_id')
        .sum('runs_off_bat as total_runs')
        .select(query.raw('SUM(IF(is_four = 1, 1, 0)) as fours'))
        .select(query.raw('SUM(IF(is_six = 1, 1, 0)) as sixes'))
        .select(query.raw("SUM(IF(extra_type != 'WIDE' OR extra_type IS NULL, 1, 0)) as balls"))
        .groupBy('innings_id');

      const dismissals = await query('deliveries')
        .whereIn('innings_id', inningsIds)
        .andWhere('dismissed_player_id', playerId)
        .select('innings_id');
      const dismissedInnings = new Set(dismissals.map(d => d.innings_id));

      stats.batting_innings = battingByInnings.length;

      battingByInnings.forEach(inn => {
        stats.batting_runs += Number(inn.total_runs);
        stats.batting_balls += Number(inn.balls);
        stats.batting_fours += Number(inn.fours);
        stats.batting_sixes += Number(inn.sixes);

        if (Number(inn.total_runs) > stats.batting_highest_score) {
          stats.batting_highest_score = Number(inn.total_runs);
        }

        if (!dismissedInnings.has(inn.innings_id)) {
          stats.batting_not_outs++;
        }
      });

      // === Career Bowling ===
      const oversByInnings = await query('overs')
        .whereIn('innings_id', inningsIds)
        .andWhere('bowler_id', playerId)
        .select('innings_id')
        .sum('runs as runs')
        .sum('legal_balls as balls')
        .select(query.raw('SUM(IF(legal_balls = 6 AND runs = 0, 1, 0)) as maidens'))
        .groupBy('innings_id');

      stats.bowling_innings = oversByInnings.length;

      let totalBowlBalls = 0;
      let totalBowlRuns = 0;
      let totalMaidens = 0;

      oversByInnings.forEach(inn => {
        totalBowlBalls += Number(inn.balls);
        totalBowlRuns += Number(inn.runs);
        totalMaidens += Number(inn.maidens);
      });

      const bowlWickets = await query('deliveries')
        .join('overs', 'deliveries.over_id', '=', 'overs.id')
        .whereIn('overs.innings_id', inningsIds)
        .andWhere('overs.bowler_id', playerId)
        .andWhere('deliveries.is_wicket', true)
        .whereIn('deliveries.wicket_type', ['BOWLED', 'CAUGHT', 'LBW', 'STUMPED', 'HIT_WICKET'])
        .count({ count: '*' }).first();

      stats.bowling_balls = totalBowlBalls;
      stats.bowling_runs = totalBowlRuns;
      stats.bowling_maidens = totalMaidens;
      stats.bowling_wickets = Number(bowlWickets.count);

      // === Career Fielding ===
      const fStats = await query('deliveries')
        .whereIn('innings_id', inningsIds)
        .andWhere('fielder_id', playerId)
        .andWhere('is_wicket', true)
        .select('wicket_type')
        .count({ count: '*' })
        .groupBy('wicket_type');

      fStats.forEach(f => {
        if (f.wicket_type === 'CAUGHT') stats.fielding_catches = Number(f.count);
        if (f.wicket_type === 'RUN_OUT') stats.fielding_run_outs = Number(f.count);
        if (f.wicket_type === 'STUMPED') stats.fielding_stumpings = Number(f.count);
      });
    }
  }

  // Upsert into player_career_stats
  await query('player_career_stats')
    .insert(stats)
    .onConflict('player_id')
    .merge();
}

/**
 * Recalculates stats for all players in a given match
 * @param {number} matchId 
 * @param {import('knex').Knex} trx 
 */
async function updateMatchPlayersStats(matchId, trx = null) {
  const query = trx || db;
  const match = await query('matches').where({ id: matchId }).first();
  if (!match) return;

  const players = await query('team_players')
    .whereIn('team_id', [match.team_a_id, match.team_b_id])
    .pluck('user_id');

  // Using a loop to avoid deadlocks on upserts
  for (const playerId of players) {
    await updatePlayerCareerStats(playerId, query);
  }
}

module.exports = {
  updatePlayerCareerStats,
  updateMatchPlayersStats
};
