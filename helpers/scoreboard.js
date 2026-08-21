const { db } = require('../config/database');

async function getScoreboard(matchId, transaction = null) {
  const query = transaction || db;
  
  const match = await query('matches').where({ id: matchId }).first();
  if (!match || !match.current_innings_id) return { match };

  const innings = await query('innings').where({ id: match.current_innings_id }).first();
  const state = await query('innings_state').where({ innings_id: innings.id }).first();
  const currentOver = await query('overs')
    .where({ innings_id: innings.id })
    .orderBy('over_number', 'desc')
    .first();

  let striker = null;
  let nonStriker = null;
  let bowler = null;
  
  if (state.striker_id) {
    const s = await query('users').where({ id: state.striker_id }).first();
    const stats = await query('deliveries').where({ innings_id: innings.id, striker_id: s.id })
      .sum('runs_off_bat as runs')
      .count('* as balls')
      .sum('is_four as fours')
      .sum('is_six as sixes')
      .first();
    const balls = Number(stats.balls) || 0;
    const runs = Number(stats.runs) || 0;
    striker = {
      id: s.id,
      name: s.username,
      runs,
      balls,
      fours: Number(stats.fours) || 0,
      sixes: Number(stats.sixes) || 0,
      strike_rate: balls > 0 ? ((runs / balls) * 100).toFixed(2) : 0
    };
  }

  if (state.non_striker_id) {
    const ns = await query('users').where({ id: state.non_striker_id }).first();
    const stats = await query('deliveries').where({ innings_id: innings.id, striker_id: ns.id })
      .sum('runs_off_bat as runs')
      .count('* as balls')
      .sum('is_four as fours')
      .sum('is_six as sixes')
      .first();
    const balls = Number(stats.balls) || 0;
    const runs = Number(stats.runs) || 0;
    nonStriker = {
      id: ns.id,
      name: ns.username,
      runs,
      balls,
      fours: Number(stats.fours) || 0,
      sixes: Number(stats.sixes) || 0,
      strike_rate: balls > 0 ? ((runs / balls) * 100).toFixed(2) : 0
    };
  }

  if (state.current_bowler_id) {
    const b = await query('users').where({ id: state.current_bowler_id }).first();
    const stats = await query('deliveries').where({ innings_id: innings.id, bowler_id: b.id })
      .sum('total_runs as runs')
      .sum('is_wicket as wickets')
      .sum({ is_legal_delivery: query.raw('CASE WHEN is_legal_delivery = 1 THEN 1 ELSE 0 END') })
      .first();
      
    // Count legal deliveries natively since true/false sum varies by sql dialect.
    const legalBallsRow = await query('deliveries')
      .where({ innings_id: innings.id, bowler_id: b.id, is_legal_delivery: true })
      .count('* as lb').first();
      
    const totalLegalBalls = Number(legalBallsRow.lb) || 0;
    const completeOvers = Math.floor(totalLegalBalls / 6);
    const rem = totalLegalBalls % 6;
    const oversStr = `${completeOvers}.${rem}`;
    const runs = Number(stats.runs) || 0;
    
    bowler = {
      id: b.id,
      name: b.username,
      overs: parseFloat(oversStr),
      runs,
      wickets: Number(stats.wickets) || 0,
      economy: totalLegalBalls > 0 ? ((runs / totalLegalBalls) * 6).toFixed(2) : 0
    };
  }

  let currentOverBalls = [];
  if (currentOver) {
    const deliveries = await query('deliveries')
      .where({ over_id: currentOver.id })
      .orderBy('delivery_number', 'asc');
      
    currentOverBalls = deliveries.map(d => {
      if (d.is_wicket) return 'W';
      if (d.extra_type === 'WIDE') return `${d.extra_runs > 0 ? d.extra_runs : ''}Wd`;
      if (d.extra_type === 'NO_BALL') return `${d.extra_runs > 0 ? d.extra_runs : ''}Nb`;
      return d.runs_off_bat.toString();
    });
  }
  
  let required = null;
  if (innings.target_runs) {
    const runsNeeded = innings.target_runs - innings.total_runs;
    const maxBalls = match.overs ? match.overs * 6 : 120; // Default T20
    const ballsRemaining = maxBalls - innings.total_legal_balls;
    required = {
      target: innings.target_runs,
      runs_needed: Math.max(0, runsNeeded),
      balls_remaining: Math.max(0, ballsRemaining),
      required_run_rate: ballsRemaining > 0 ? ((runsNeeded / ballsRemaining) * 6).toFixed(2) : 0
    };
  }

  const current_run_rate = innings.total_legal_balls > 0 ? ((innings.total_runs / innings.total_legal_balls) * 6).toFixed(2) : 0;
  
  // Fall of Wickets
  const fowDataRaw = await query('deliveries')
    .join('users as batter', 'deliveries.dismissed_player_id', '=', 'batter.id')
    .join('overs', 'deliveries.over_id', '=', 'overs.id')
    .leftJoin('users as bowler', 'deliveries.bowler_id', '=', 'bowler.id')
    .leftJoin('users as fielder', 'deliveries.fielder_id', '=', 'fielder.id')
    .where({ 'deliveries.innings_id': innings.id, 'deliveries.is_wicket': true })
    .orderBy('deliveries.delivery_number', 'asc')
    .select(
      'deliveries.delivery_number',
      'overs.over_number',
      'deliveries.ball_number',
      'deliveries.wicket_type',
      'batter.id as batter_id',
      'batter.name as batter_name',
      'bowler.id as bowler_id',
      'bowler.name as bowler_name',
      'fielder.id as fielder_id',
      'fielder.name as fielder_name'
    );
  
  const fall_of_wickets = [];
  for (const fow of fowDataRaw) {
     const scoreAtWicket = await query('deliveries')
       .where({ innings_id: innings.id })
       .where('delivery_number', '<=', fow.delivery_number)
       .sum('total_runs as score')
       .first();
       
     const noBowlerCredit = ['RUN_OUT', 'RETIRED_HURT', 'RETIRED_OUT', 'OBSTRUCTING_THE_FIELD', 'TIMED_OUT'].includes(fow.wicket_type);
     const displayBowlerId = noBowlerCredit ? null : fow.bowler_id;
     const displayBowlerName = noBowlerCredit ? null : fow.bowler_name;
       
     fall_of_wickets.push({
        dismissed_player_id: fow.batter_id,
        player: { id: fow.batter_id, name: fow.batter_name },
        score: Number(scoreAtWicket.score) || 0,
        over: `${fow.over_number - 1}.${fow.ball_number}`,
        wicket_type: fow.wicket_type,
        bowler_id: displayBowlerId || null,
        bowler: displayBowlerId ? { id: displayBowlerId, name: displayBowlerName } : null,
        fielder_id: fow.fielder_id || null,
        fielder: fow.fielder_id ? { id: fow.fielder_id, name: fow.fielder_name } : null
     });
  }

  return {
    match_id: match.id,
    innings_id: innings.id,
    score: {
      runs: innings.total_runs,
      wickets: innings.total_wickets,
      overs: innings.overs,
      current_run_rate
    },
    striker,
    non_striker: nonStriker,
    bowler,
    current_over: currentOverBalls,
    required,
    fall_of_wickets,
    timestamp: new Date().toISOString()
  };
}

async function isAuthorizedViewer(matchId, userId) {
  const match = await db('matches').where({ id: matchId }).whereNull('deleted_at').first();
  if (!match) return false;
  
  if (String(match.created_by) === String(userId)) return true;
  if (await db('match_admins').where({ match_id: matchId, user_id: userId }).first()) return true;
  if (await db('match_viewers').where({ match_id: matchId, user_id: userId }).first()) return true;
  
  const isPlayer = await db('team_players')
    .whereIn('team_id', [match.team_a_id, match.team_b_id])
    .andWhere({ user_id: userId, is_active: true })
    .first();
    
  if (isPlayer) return true;
  
  return false;
}

module.exports = {
  getScoreboard,
  isAuthorizedViewer
};
