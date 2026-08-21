const { db } = require('../config/database');
const { TryCatch, ErrorHandler } = require('../middleware/error.middleware');

/**
 * Calculate player's match performance
 */
const getPlayerMatchPerformance = TryCatch(async (req, res, next) => {
  const { playerId, matchId } = req.params;

  const player = await db('users').where({ id: playerId }).first();
  if (!player) throw new ErrorHandler('Player not found', 404);

  const match = await db('matches').where({ id: matchId }).first();
  if (!match) throw new ErrorHandler('Match not found', 404);

  const inningsList = await db('innings').where({ match_id: matchId }).orderBy('innings_number', 'asc');
  const inningsIds = inningsList.map(i => i.id);

  let batting = { played: false };
  let bowling = { played: false };
  let fielding = { played: false };
  let summary = { runs: 0, wickets: 0, catches: 0 };
  let ballByBall = [];

  if (inningsIds.length > 0) {
    // === BATTING ===
    const battingDeliveries = await db('deliveries')
      .join('overs', 'deliveries.over_id', '=', 'overs.id')
      .whereIn('deliveries.innings_id', inningsIds)
      .andWhere('deliveries.striker_id', playerId)
      .select('deliveries.*', 'overs.over_number')
      .orderBy('deliveries.delivery_number', 'asc');

    const wasNonStriker = await db('deliveries')
      .whereIn('innings_id', inningsIds)
      .andWhere('non_striker_id', playerId)
      .first();

    if (battingDeliveries.length > 0 || wasNonStriker) {
      batting.played = true;
      let runs = 0, balls = 0, fours = 0, sixes = 0;

      battingDeliveries.forEach(d => {
        const isWide = d.extra_type === 'WIDE';
        if (!isWide) {
          balls++;
        }
        runs += d.runs_off_bat;
        if (d.is_four) fours++;
        if (d.is_six) sixes++;

        ballByBall.push({
          over: d.over_number,
          ball: d.ball_number,
          runs_off_bat: d.runs_off_bat,
          extra_type: d.extra_type,
          extra_runs: d.extra_runs,
          is_wicket: d.is_wicket,
          wicket_type: d.wicket_type,
          bowler_id: d.bowler_id
        });
      });

      batting.runs = runs;
      batting.balls = balls;
      batting.fours = fours;
      batting.sixes = sixes;
      batting.strike_rate = balls > 0 ? ((runs / balls) * 100).toFixed(2) : '0.00';
      batting.status = 'not_out';
      batting.dismissal = null;
      summary.runs = runs;

      // check if dismissed
      const dismissal = await db('deliveries')
        .whereIn('innings_id', inningsIds)
        .andWhere('dismissed_player_id', playerId)
        .first();

      if (dismissal) {
        batting.status = 'out';
        let bowler = null, fielder = null;
        if (dismissal.bowler_id) {
          bowler = await db('users').select('id', 'username').where({ id: dismissal.bowler_id }).first();
        }
        if (dismissal.fielder_id) {
          fielder = await db('users').select('id', 'username').where({ id: dismissal.fielder_id }).first();
        }
        batting.dismissal = {
          type: dismissal.wicket_type,
          bowler: bowler,
          fielder: fielder
        };
      }
    }

    // === BOWLING ===
    const bowledOvers = await db('overs')
      .whereIn('innings_id', inningsIds)
      .andWhere('bowler_id', playerId);

    if (bowledOvers.length > 0) {
      bowling.played = true;
      let runsConceded = 0;
      let legalBalls = 0;
      let wickets = 0;
      let maidens = 0;

      for (const over of bowledOvers) {
        runsConceded += over.runs;
        legalBalls += over.legal_balls;

        const overWickets = await db('deliveries')
          .where({ over_id: over.id, is_wicket: true })
          .whereIn('wicket_type', ['BOWLED', 'CAUGHT', 'LBW', 'STUMPED', 'HIT_WICKET'])
          .count({ count: '*' }).first();
        wickets += Number(overWickets.count);

        if (over.legal_balls === 6 && over.runs === 0) {
          maidens++;
        }
      }

      bowling.overs = Math.floor(legalBalls / 6) + '.' + (legalBalls % 6);
      bowling.balls = legalBalls;
      bowling.maidens = maidens;
      bowling.runs = runsConceded;
      bowling.wickets = wickets;

      const totalOversDec = legalBalls / 6;
      bowling.economy = totalOversDec > 0 ? (runsConceded / totalOversDec).toFixed(2) : '0.00';
      summary.wickets = wickets;
    }

    // === FIELDING ===
    const catches = await db('deliveries')
      .whereIn('innings_id', inningsIds)
      .andWhere('is_wicket', true)
      .andWhere('wicket_type', 'CAUGHT')
      .andWhere('fielder_id', playerId)
      .count({ count: '*' }).first();

    const runOuts = await db('deliveries')
      .whereIn('innings_id', inningsIds)
      .andWhere('is_wicket', true)
      .andWhere('wicket_type', 'RUN_OUT')
      .andWhere('fielder_id', playerId)
      .count({ count: '*' }).first();

    const stumpings = await db('deliveries')
      .whereIn('innings_id', inningsIds)
      .andWhere('is_wicket', true)
      .andWhere('wicket_type', 'STUMPED')
      .andWhere('fielder_id', playerId)
      .count({ count: '*' }).first();

    const catchesCount = Number(catches.count);
    const runOutsCount = Number(runOuts.count);
    const stumpingsCount = Number(stumpings.count);

    if (catchesCount > 0 || runOutsCount > 0 || stumpingsCount > 0) {
      fielding.played = true;
      fielding.catches = catchesCount;
      fielding.run_outs = runOutsCount;
      fielding.stumpings = stumpingsCount;
      summary.catches = catchesCount;
    }
  }

  res.json({
    success: true,
    data: {
      player: {
        id: player.id,
        username: player.username
      },
      match: {
        id: match.id,
        status: match.status,
        date: match.scheduled_date
      },
      summary,
      batting,
      bowling,
      fielding,
      ball_by_ball: ballByBall
    }
  });
});

/**
 * Get player match history
 */
const getPlayerMatchHistory = TryCatch(async (req, res, next) => {
  const { playerId } = req.params;
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 10;
  const offset = (page - 1) * limit;

  const player = await db('users').where({ id: playerId }).first();
  if (!player) throw new ErrorHandler('Player not found', 404);

  // Get all active teams for the player
  const playerTeams = await db('team_players')
    .where('user_id', playerId)
    .where('is_active', true)
    .pluck('team_id');

  // Find all matches where the player was in a team that played the match
  const matchesBase = db('matches')
    .leftJoin('teams as team_a', 'matches.team_a_id', 'team_a.id')
    .leftJoin('teams as team_b', 'matches.team_b_id', 'team_b.id')
    .whereNull('matches.deleted_at')
    .andWhere(function () {
      this.whereIn('matches.team_a_id', playerTeams)
        .orWhereIn('matches.team_b_id', playerTeams);
    });

  const countRow = await matchesBase.clone().clearSelect().count({ total: '*' }).first();
  const total = Number(countRow.total) || 0;

  const matches = await matchesBase.clone()
    .select(
      'matches.*',
      'team_a.name as team_a_name',
      'team_b.name as team_b_name'
    )
    .orderBy('matches.scheduled_date', 'desc')
    .limit(limit).offset(offset);

  const history = [];
  for (const match of matches) {
    const inningsList = await db('innings').where({ match_id: match.id });
    const inningsIds = inningsList.map(i => i.id);
    let runs = 0, wickets = 0;

    let team_a_score = null;
    let team_b_score = null;

    for (const inn of inningsList) {
      const scoreObj = { runs: inn.total_runs, wickets: inn.total_wickets, overs: inn.overs };
      if (inn.batting_team_id === match.team_a_id) {
        team_a_score = scoreObj;
      } else if (inn.batting_team_id === match.team_b_id) {
        team_b_score = scoreObj;
      }
    }

    if (inningsIds.length > 0) {
      // Runs
      const batDelivs = await db('deliveries').whereIn('innings_id', inningsIds).andWhere('striker_id', playerId);
      runs = batDelivs.reduce((acc, d) => acc + d.runs_off_bat, 0);

      // Wickets
      const bowlOvers = await db('overs').whereIn('innings_id', inningsIds).andWhere('bowler_id', playerId).select('id');
      const overIds = bowlOvers.map(o => o.id);
      if (overIds.length > 0) {
        const wCount = await db('deliveries')
          .whereIn('over_id', overIds)
          .andWhere('is_wicket', true)
          .whereIn('wicket_type', ['BOWLED', 'CAUGHT', 'LBW', 'STUMPED', 'HIT_WICKET'])
          .count({ count: '*' }).first();
        wickets = Number(wCount.count);
      }
    }

    history.push({
      match_id: match.id,
      date: match.scheduled_date,
      status: match.status,
      team_a: match.team_a_name,
      team_b: match.team_b_name,
      team_a_score,
      team_b_score,
      result_description: match.result_description || null,
      performance: {
        runs,
        wickets
      }
    });
  }

  res.json({
    success: true,
    data: history,
    pagination: {
      page,
      limit,
      total,
      total_pages: Math.ceil(total / limit) || 0,
    }
  });
});

/**
 * Get player career statistics
 * @description This API now reads exclusively from the 'player_career_stats' aggregation table. 
 * Instead of dynamically querying thousands of deliveries (which strains the database), 
 * it fetches the pre-aggregated O(1) stats row and calculates averages/economy on-the-fly.
 */
const getPlayerCareerStatistics = TryCatch(async (req, res, next) => {
  const { playerId } = req.params;

  const player = await db('users').where({ id: playerId }).first();
  if (!player) throw new ErrorHandler('Player not found', 404);

  // Fetch pre-aggregated statistics from the aggregation table (updated automatically on match end)
  const careerStats = await db('player_career_stats').where({ player_id: playerId }).first();

  let stats = {
    matches: careerStats ? careerStats.matches : 0,
    batting: {
      innings: careerStats ? careerStats.batting_innings : 0,
      runs: careerStats ? careerStats.batting_runs : 0,
      balls: careerStats ? careerStats.batting_balls : 0,
      highest_score: careerStats ? careerStats.batting_highest_score : 0,
      fours: careerStats ? careerStats.batting_fours : 0,
      sixes: careerStats ? careerStats.batting_sixes : 0,
      average: '0.00',
      strike_rate: '0.00',
      not_outs: careerStats ? careerStats.batting_not_outs : 0
    },
    bowling: {
      innings: careerStats ? careerStats.bowling_innings : 0,
      overs: '0.0',
      balls: careerStats ? careerStats.bowling_balls : 0,
      runs: careerStats ? careerStats.bowling_runs : 0,
      wickets: careerStats ? careerStats.bowling_wickets : 0,
      maidens: careerStats ? careerStats.bowling_maidens : 0,
      economy: '0.00',
      average: '0.00',
      strike_rate: '0.00'
    },
    fielding: {
      catches: careerStats ? careerStats.fielding_catches : 0,
      run_outs: careerStats ? careerStats.fielding_run_outs : 0,
      stumpings: careerStats ? careerStats.fielding_stumpings : 0
    }
  };

  if (careerStats) {
    // Note: We calculate ratios (averages, strike rates, economy) on-the-fly here.
    // Storing floating point numbers in the database can lead to rounding errors over time, 
    // so we only store raw integers (runs, balls, wickets) in 'player_career_stats'.

    // Calculate derived batting stats
    const outs = careerStats.batting_innings - careerStats.batting_not_outs;
    stats.batting.average = outs > 0
      ? (careerStats.batting_runs / outs).toFixed(2)
      : (careerStats.batting_runs > 0 ? careerStats.batting_runs.toFixed(2) : '0.00');
    stats.batting.strike_rate = careerStats.batting_balls > 0
      ? ((careerStats.batting_runs / careerStats.batting_balls) * 100).toFixed(2)
      : '0.00';

    // Calculate derived bowling stats
    stats.bowling.overs = Math.floor(careerStats.bowling_balls / 6) + '.' + (careerStats.bowling_balls % 6);
    const totalOversDec = careerStats.bowling_balls / 6;
    stats.bowling.economy = totalOversDec > 0
      ? (careerStats.bowling_runs / totalOversDec).toFixed(2)
      : '0.00';
    stats.bowling.average = careerStats.bowling_wickets > 0
      ? (careerStats.bowling_runs / careerStats.bowling_wickets).toFixed(2)
      : '0.00';
    stats.bowling.strike_rate = careerStats.bowling_wickets > 0
      ? (careerStats.bowling_balls / careerStats.bowling_wickets).toFixed(2)
      : '0.00';
  }

  res.json({
    success: true,
    data: {
      player: {
        id: player.id,
        username: player.username
      },
      career: stats
    }
  });
});

module.exports = {
  getPlayerMatchPerformance,
  getPlayerMatchHistory,
  getPlayerCareerStatistics
};
