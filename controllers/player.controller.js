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
 */
const getPlayerCareerStatistics = TryCatch(async (req, res, next) => {
  const { playerId } = req.params;

  const player = await db('users').where({ id: playerId }).first();
  if (!player) throw new ErrorHandler('Player not found', 404);

  // Get all active teams for the player
  const playerTeams = await db('team_players')
    .where('user_id', playerId)
    .where('is_active', true)
    .pluck('team_id');

  // Get all completed matches for the player
  const matchPlayers = await db('matches')
    .andWhere('status', 'COMPLETED')
    .whereNull('deleted_at')
    .andWhere(function () {
      this.whereIn('team_a_id', playerTeams)
        .orWhereIn('team_b_id', playerTeams);
    })
    .select('id as match_id');

  const matchIds = matchPlayers.map(mp => mp.match_id);

  let stats = {
    matches: matchIds.length,
    batting: {
      innings: 0,
      runs: 0,
      balls: 0,
      highest_score: 0,
      fours: 0,
      sixes: 0,
      average: '0.00',
      strike_rate: '0.00',
      not_outs: 0
    },
    bowling: {
      innings: 0,
      overs: '0.0',
      balls: 0,
      runs: 0,
      wickets: 0,
      maidens: 0,
      economy: '0.00',
      average: '0.00',
      strike_rate: '0.00'
    },
    fielding: {
      catches: 0,
      run_outs: 0,
      stumpings: 0
    }
  };

  if (matchIds.length > 0) {
    const inningsList = await db('innings').whereIn('match_id', matchIds);
    const inningsIds = inningsList.map(i => i.id);

    if (inningsIds.length > 0) {
      // === Career Batting ===
      const battingByInnings = await db('deliveries')
        .whereIn('innings_id', inningsIds)
        .andWhere('striker_id', playerId)
        .select('innings_id')
        .sum('runs_off_bat as total_runs')
        .select(db.raw('SUM(IF(is_four = 1, 1, 0)) as fours'))
        .select(db.raw('SUM(IF(is_six = 1, 1, 0)) as sixes'))
        .select(db.raw("SUM(IF(extra_type != 'WIDE' OR extra_type IS NULL, 1, 0)) as balls"))
        .groupBy('innings_id');

      const dismissals = await db('deliveries')
        .whereIn('innings_id', inningsIds)
        .andWhere('dismissed_player_id', playerId)
        .select('innings_id');
      const dismissedInnings = new Set(dismissals.map(d => d.innings_id));

      stats.batting.innings = battingByInnings.length;

      battingByInnings.forEach(inn => {
        stats.batting.runs += Number(inn.total_runs);
        stats.batting.balls += Number(inn.balls);
        stats.batting.fours += Number(inn.fours);
        stats.batting.sixes += Number(inn.sixes);

        if (Number(inn.total_runs) > stats.batting.highest_score) {
          stats.batting.highest_score = Number(inn.total_runs);
        }

        if (!dismissedInnings.has(inn.innings_id)) {
          stats.batting.not_outs++;
        }
      });

      const outs = stats.batting.innings - stats.batting.not_outs;
      stats.batting.average = outs > 0 ? (stats.batting.runs / outs).toFixed(2) : (stats.batting.runs > 0 ? stats.batting.runs.toFixed(2) : '0.00');
      stats.batting.strike_rate = stats.batting.balls > 0 ? ((stats.batting.runs / stats.batting.balls) * 100).toFixed(2) : '0.00';

      // === Career Bowling ===
      const oversByInnings = await db('overs')
        .whereIn('innings_id', inningsIds)
        .andWhere('bowler_id', playerId)
        .select('innings_id')
        .sum('runs as runs')
        .sum('legal_balls as balls')
        .select(db.raw('SUM(IF(legal_balls = 6 AND runs = 0, 1, 0)) as maidens'))
        .groupBy('innings_id');

      stats.bowling.innings = oversByInnings.length;

      let totalBowlBalls = 0;
      let totalBowlRuns = 0;
      let totalMaidens = 0;

      oversByInnings.forEach(inn => {
        totalBowlBalls += Number(inn.balls);
        totalBowlRuns += Number(inn.runs);
        totalMaidens += Number(inn.maidens);
      });

      const bowlWickets = await db('deliveries')
        .join('overs', 'deliveries.over_id', '=', 'overs.id')
        .whereIn('overs.innings_id', inningsIds)
        .andWhere('overs.bowler_id', playerId)
        .andWhere('deliveries.is_wicket', true)
        .whereIn('deliveries.wicket_type', ['BOWLED', 'CAUGHT', 'LBW', 'STUMPED', 'HIT_WICKET'])
        .count({ count: '*' }).first();

      stats.bowling.balls = totalBowlBalls;
      stats.bowling.runs = totalBowlRuns;
      stats.bowling.maidens = totalMaidens;
      stats.bowling.wickets = Number(bowlWickets.count);
      stats.bowling.overs = Math.floor(totalBowlBalls / 6) + '.' + (totalBowlBalls % 6);

      const totalOversDec = totalBowlBalls / 6;
      stats.bowling.economy = totalOversDec > 0 ? (totalBowlRuns / totalOversDec).toFixed(2) : '0.00';
      stats.bowling.average = stats.bowling.wickets > 0 ? (totalBowlRuns / stats.bowling.wickets).toFixed(2) : '0.00';
      stats.bowling.strike_rate = stats.bowling.wickets > 0 ? (totalBowlBalls / stats.bowling.wickets).toFixed(2) : '0.00';

      // === Career Fielding ===
      const fStats = await db('deliveries')
        .whereIn('innings_id', inningsIds)
        .andWhere('fielder_id', playerId)
        .andWhere('is_wicket', true)
        .select('wicket_type')
        .count({ count: '*' })
        .groupBy('wicket_type');

      fStats.forEach(f => {
        if (f.wicket_type === 'CAUGHT') stats.fielding.catches = Number(f.count);
        if (f.wicket_type === 'RUN_OUT') stats.fielding.run_outs = Number(f.count);
        if (f.wicket_type === 'STUMPED') stats.fielding.stumpings = Number(f.count);
      });
    }
  }

  res.json({
    success: true,
    data: stats
  });
});

module.exports = {
  getPlayerMatchPerformance,
  getPlayerMatchHistory,
  getPlayerCareerStatistics
};
