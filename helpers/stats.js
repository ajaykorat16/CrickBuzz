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
 * Incrementally adds the statistics of a single match to a player's career stats.
 * 
 * DESIGN DECISION: 
 * We use an incremental update (adding new match runs to existing career runs) instead 
 * of recalculating the entire career from scratch. This prevents an O(N) database strain 
 * where N is the player's lifetime deliveries, making the write operation O(1) in scale.
 * 
 * @param {number} playerId
 * @param {number} matchId
 * @param {import('knex').Knex} trx
 */
async function incrementPlayerStatsForMatch(playerId, matchId, trx = null) {
  const query = trx || db;
  const inningsList = await query('innings').where('match_id', matchId);
  const inningsIds = inningsList.map(i => i.id);

  let matchStats = {
    matches: 1,
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

  if (inningsIds.length > 0) {
    // === Batting ===
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

    matchStats.batting_innings = battingByInnings.length;

    battingByInnings.forEach(inn => {
      matchStats.batting_runs += Number(inn.total_runs);
      matchStats.batting_balls += Number(inn.balls);
      matchStats.batting_fours += Number(inn.fours);
      matchStats.batting_sixes += Number(inn.sixes);

      if (Number(inn.total_runs) > matchStats.batting_highest_score) {
        matchStats.batting_highest_score = Number(inn.total_runs);
      }

      if (!dismissedInnings.has(inn.innings_id)) {
        matchStats.batting_not_outs++;
      }
    });

    // === Bowling ===
    const oversByInnings = await query('overs')
      .whereIn('innings_id', inningsIds)
      .andWhere('bowler_id', playerId)
      .select('innings_id')
      .sum('runs as runs')
      .sum('legal_balls as balls')
      .select(query.raw('SUM(IF(legal_balls = 6 AND runs = 0, 1, 0)) as maidens'))
      .groupBy('innings_id');

    matchStats.bowling_innings = oversByInnings.length;

    oversByInnings.forEach(inn => {
      matchStats.bowling_balls += Number(inn.balls);
      matchStats.bowling_runs += Number(inn.runs);
      matchStats.bowling_maidens += Number(inn.maidens);
    });

    const bowlWickets = await query('deliveries')
      .join('overs', 'deliveries.over_id', '=', 'overs.id')
      .whereIn('overs.innings_id', inningsIds)
      .andWhere('overs.bowler_id', playerId)
      .andWhere('deliveries.is_wicket', true)
      .whereIn('deliveries.wicket_type', ['BOWLED', 'CAUGHT', 'LBW', 'STUMPED', 'HIT_WICKET'])
      .count({ count: '*' }).first();

    matchStats.bowling_wickets = Number(bowlWickets.count);

    // === Fielding ===
    const fStats = await query('deliveries')
      .whereIn('innings_id', inningsIds)
      .andWhere('fielder_id', playerId)
      .andWhere('is_wicket', true)
      .select('wicket_type')
      .count({ count: '*' })
      .groupBy('wicket_type');

    fStats.forEach(f => {
      if (f.wicket_type === 'CAUGHT') matchStats.fielding_catches = Number(f.count);
      if (f.wicket_type === 'RUN_OUT') matchStats.fielding_run_outs = Number(f.count);
      if (f.wicket_type === 'STUMPED') matchStats.fielding_stumpings = Number(f.count);
    });
  }

  // UPSERT Logic: We fetch the existing career row and add the match stats to it.
  const existingRow = await query('player_career_stats').where({ player_id: playerId }).first();
  if (existingRow) {
    await query('player_career_stats').where({ player_id: playerId }).update({
      matches: existingRow.matches + matchStats.matches,
      batting_innings: existingRow.batting_innings + matchStats.batting_innings,
      batting_runs: existingRow.batting_runs + matchStats.batting_runs,
      batting_balls: existingRow.batting_balls + matchStats.batting_balls,
      // For highest score, we compare the current highest score with the match's highest score
      batting_highest_score: Math.max(existingRow.batting_highest_score, matchStats.batting_highest_score),
      batting_fours: existingRow.batting_fours + matchStats.batting_fours,
      batting_sixes: existingRow.batting_sixes + matchStats.batting_sixes,
      batting_not_outs: existingRow.batting_not_outs + matchStats.batting_not_outs,
      bowling_innings: existingRow.bowling_innings + matchStats.bowling_innings,
      bowling_balls: existingRow.bowling_balls + matchStats.bowling_balls,
      bowling_runs: existingRow.bowling_runs + matchStats.bowling_runs,
      bowling_wickets: existingRow.bowling_wickets + matchStats.bowling_wickets,
      bowling_maidens: existingRow.bowling_maidens + matchStats.bowling_maidens,
      fielding_catches: existingRow.fielding_catches + matchStats.fielding_catches,
      fielding_run_outs: existingRow.fielding_run_outs + matchStats.fielding_run_outs,
      fielding_stumpings: existingRow.fielding_stumpings + matchStats.fielding_stumpings
    });
  } else {
    matchStats.player_id = playerId;
    await query('player_career_stats').insert(matchStats);
  }
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

  // Incrementally aggregate stats for the match directly to avoid recalculating the whole career.
  // Note: We loop sequentially to prevent database deadlocks that can happen with concurrent upserts.
  for (const playerId of players) {
    await incrementPlayerStatsForMatch(playerId, matchId, query);
  }
}

module.exports = {
  updatePlayerCareerStats,
  updateMatchPlayersStats
};
