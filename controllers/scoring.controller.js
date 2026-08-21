const { ErrorHandler, TryCatch } = require('../middleware/error.middleware');
const { db } = require('../config/database');
const { getIO } = require('../socket');
const {
  isLegalDelivery,
  calculateOvers,
  calculateTotalRuns,
  shouldSwapStriker
} = require('../helpers/scoring');
const { getScoreboard } = require('../helpers/scoreboard');

/**
 * Starts a new innings for a match.
 * 
 * Validates teams and players, creates DB records for the innings, initial state, and first over.
 * Broadcasts 'innings:started' and 'scoreboard:update' socket events.
 */
const startInnings = TryCatch(async (req, res, next) => {
    const matchId = req.params.id;
    const { batting_team_id, bowling_team_id, striker_id, non_striker_id, bowler_id, toss_winner_team_id, toss_decision } = req.body;
    const match = req.match;
    
    if (striker_id === non_striker_id) {
      throw new ErrorHandler('Striker and non-striker cannot be the same player', 400);
    }
    
    if (bowler_id === striker_id || bowler_id === non_striker_id) {
      throw new ErrorHandler('Bowler cannot be the same as the striker or non-striker', 400);
    }

    if (![match.team_a_id, match.team_b_id].includes(batting_team_id) || 
        ![match.team_a_id, match.team_b_id].includes(bowling_team_id) ||
        batting_team_id === bowling_team_id) {
      throw new ErrorHandler('Invalid batting/bowling teams for this match', 400);
    }

    const battingTeamPlayers = await db('team_players').where({ team_id: batting_team_id, is_active: true }).pluck('user_id');
    const bowlingTeamPlayers = await db('team_players').where({ team_id: bowling_team_id, is_active: true }).pluck('user_id');

    if (!battingTeamPlayers.includes(striker_id)) {
      throw new ErrorHandler('Striker must be a player of the batting team', 400);
    }
    if (!battingTeamPlayers.includes(non_striker_id)) {
      throw new ErrorHandler('Non-striker must be a player of the batting team', 400);
    }
    if (!bowlingTeamPlayers.includes(bowler_id)) {
      throw new ErrorHandler('Bowler must be a player of the bowling team', 400);
    }

    if (toss_winner_team_id && ![match.team_a_id, match.team_b_id].includes(toss_winner_team_id)) {
      throw new ErrorHandler('Invalid toss winner team. Must be one of the playing teams.', 400);
    }

    const result = await db.transaction(async (trx) => {
      const existingInnings = await trx('innings').where({ match_id: matchId }).count({ count: '*' }).first();
      const inningsNumber = (Number(existingInnings.count) || 0) + 1;

      let targetRuns = null;
      if (inningsNumber === 2) {
        const firstInnings = await trx('innings').where({ match_id: matchId, innings_number: 1 }).first();
        if (!firstInnings) throw new ErrorHandler('First innings not found', 400);
        if (firstInnings.status !== 'COMPLETED') throw new ErrorHandler('First innings is not completed yet', 400);
        targetRuns = firstInnings.total_runs + 1;
      }

      const [inningsId] = await trx('innings').insert({
        match_id: matchId,
        innings_number: inningsNumber,
        batting_team_id,
        bowling_team_id,
        target_runs: targetRuns,
        status: 'IN_PROGRESS'
      });

      const matchUpdatePayload = {
        current_innings_id: inningsId,
        status: 'LIVE'
      };

      if (inningsNumber === 1 && toss_winner_team_id && toss_decision) {
        matchUpdatePayload.toss_winner_team_id = toss_winner_team_id;
        matchUpdatePayload.toss_decision = toss_decision;
      }

      await trx('matches').where({ id: matchId }).update(matchUpdatePayload);

      await trx('innings_state').insert({
        innings_id: inningsId,
        striker_id,
        non_striker_id,
        current_bowler_id: bowler_id,
        current_over_number: 1,
        current_ball_number: 0
      });

      await trx('overs').insert({
        innings_id: inningsId,
        over_number: 1,
        bowler_id,
        status: 'IN_PROGRESS'
      });

      // Broadcast the start of the innings via Socket.IO
      const io = getIO();
      io.to(`match:${matchId}`).emit('innings:started', { inningsId, inningsNumber });
      
      const scoreboard = await getScoreboard(matchId, trx);
      io.to(`match:${matchId}`).emit('scoreboard:update', scoreboard);

      return { inningsId, inningsNumber };
    });

    res.status(201).json({ success: true, data: result });
  });

/**
 * Records a single delivery (ball).
 * 
 * This is the core engine for live scoring. It calculates runs, updates the current over,
 * tracks player stats, and handles wickets/over completion.
 * Broadcasts 'delivery:recorded', 'scoreboard:update' and optionally 'innings/match:completed'.
 */
const recordDelivery = TryCatch(async (req, res, next) => {
    const inningsId = req.params.id;
    const data = req.body;

    const result = await db.transaction(async (trx) => {
      const innings = await trx('innings').where({ id: inningsId }).first();
      if (!innings) throw new ErrorHandler('Innings not found', 404);
      if (innings.status === 'COMPLETED') throw new ErrorHandler('Innings already completed', 400);

      const match = req.match;
      
      // Strict Over Limit Validation
      if (match.overs && innings.total_legal_balls >= match.overs * 6) {
        throw new ErrorHandler(`All ${match.overs} overs for this match have already been bowled. You cannot add any more deliveries.`, 400);
      }

      const state = await trx('innings_state').where({ innings_id: inningsId }).first();
      let currentOver = await trx('overs')
        .where({ innings_id: inningsId, status: 'IN_PROGRESS' })
        .orderBy('over_number', 'desc')
        .first();

      if (!currentOver) {
        throw new ErrorHandler('No active over found. Start a new over first.', 400);
      }

      const {
        runs_off_bat = 0,
        extra_type = null,
        extra_runs = 0,
        is_wicket = false,
        wicket_type = null,
        dismissed_player_id = null,
        bowler_id = null,
        fielder_id = null,
        is_four = false,
        is_six = false
      } = data;
      
      const wicketTypeUpper = wicket_type ? wicket_type.toUpperCase() : null;

      if (is_wicket) {
        if (!dismissed_player_id) throw new ErrorHandler('dismissed_player_id is required when is_wicket is true', 400);
        if (dismissed_player_id !== state.striker_id && dismissed_player_id !== state.non_striker_id) {
          throw new ErrorHandler('The dismissed player must be the current striker or non-striker', 400);
        }
        if (!wicketTypeUpper) throw new ErrorHandler('wicket_type is required', 400);
        
        const requiresFielder = ['CAUGHT', 'RUN_OUT', 'STUMPED'].includes(wicketTypeUpper);
        if (requiresFielder && !fielder_id) {
          throw new ErrorHandler(`fielder_id is required for wicket type: ${wicketTypeUpper}`, 400);
        }
        
        if (fielder_id) {
          const fieldingTeamPlayers = await trx('team_players')
            .where({ team_id: innings.bowling_team_id, is_active: true })
            .pluck('user_id');
          if (!fieldingTeamPlayers.includes(fielder_id)) {
            throw new ErrorHandler('Fielder must belong to the bowling team', 400);
          }
        }
        
        // If bowler_id is provided, validate it matches the active bowler
        if (bowler_id && bowler_id !== currentOver.bowler_id) {
          throw new ErrorHandler('Provided bowler_id does not match the active bowler for this over', 400);
        }
      }

      const legalDelivery = isLegalDelivery(extra_type);
      const totalRunsThisBall = calculateTotalRuns(runs_off_bat, extra_type, extra_runs);
      
      const deliveryNumber = (await trx('deliveries').where({ innings_id: inningsId }).count({ count: '*' }).first()).count + 1;
      let ballNumber = currentOver.legal_balls;
      if (legalDelivery) ballNumber += 1;

      await trx('deliveries').insert({
        innings_id: inningsId,
        over_id: currentOver.id,
        ball_number: ballNumber,
        delivery_number: deliveryNumber,
        striker_id: state.striker_id,
        non_striker_id: state.non_striker_id,
        bowler_id: currentOver.bowler_id,
        runs_off_bat,
        extra_runs,
        total_runs: totalRunsThisBall,
        extra_type,
        wicket_type: wicketTypeUpper,
        dismissed_player_id,
        fielder_id: fielder_id || null,
        is_legal_delivery: legalDelivery,
        is_wicket,
        is_four,
        is_six
      });

      const newLegalBalls = currentOver.legal_balls + (legalDelivery ? 1 : 0);
      const isOverComplete = newLegalBalls === 6;
      
      await trx('overs').where({ id: currentOver.id }).update({
        runs: currentOver.runs + totalRunsThisBall,
        wickets: currentOver.wickets + (is_wicket ? 1 : 0),
        legal_balls: newLegalBalls,
        status: isOverComplete ? 'COMPLETED' : 'IN_PROGRESS'
      });

      const newTotalLegalBalls = innings.total_legal_balls + (legalDelivery ? 1 : 0);
      const newOvers = calculateOvers(newTotalLegalBalls);
      const newTotalRuns = innings.total_runs + totalRunsThisBall;
      const newTotalWickets = innings.total_wickets + (is_wicket ? 1 : 0);
      
      let inningsCompleted = false;
      let matchCompleted = false;
      let matchStatus = match.status;

      if (newTotalWickets === 10 || (match.overs && newTotalLegalBalls >= match.overs * 6)) {
        inningsCompleted = true;
        if (innings.innings_number === 2) {
          matchCompleted = true;
          matchStatus = 'COMPLETED';
        }
      }
      
      // If batting second and target is reached, match is over immediately
      if (innings.target_runs && newTotalRuns >= innings.target_runs) {
        inningsCompleted = true;
        matchCompleted = true;
        matchStatus = 'COMPLETED';
      }
      
      let winner_team_id = null;
      let result_type = null;
      let result_description = null;

      if (matchCompleted) {
        const target = innings.target_runs;
        if (newTotalRuns >= target) {
          winner_team_id = innings.batting_team_id;
          result_type = 'WON';
          const winTeam = await trx('teams').where({ id: winner_team_id }).first();
          result_description = `${winTeam.name} won by ${10 - newTotalWickets} wickets`;
        } else if (newTotalRuns === target - 1) {
          result_type = 'TIE';
          result_description = 'Match Tied';
        } else {
          winner_team_id = innings.bowling_team_id;
          result_type = 'WON';
          const winTeam = await trx('teams').where({ id: winner_team_id }).first();
          result_description = `${winTeam.name} won by ${(target - 1) - newTotalRuns} runs`;
        }
      }

      await trx('innings').where({ id: inningsId }).update({
        total_runs: newTotalRuns,
        total_wickets: newTotalWickets,
        total_legal_balls: newTotalLegalBalls,
        overs: newOvers,
        status: inningsCompleted ? 'COMPLETED' : 'IN_PROGRESS',
        completed_at: inningsCompleted ? trx.fn.now() : null
      });

      if (inningsCompleted || matchCompleted) {
        const matchUpdate = { status: matchStatus };
        if (matchCompleted) {
          matchUpdate.winner_team_id = winner_team_id;
          matchUpdate.result_type = result_type;
          matchUpdate.result_description = result_description;
        }
        await trx('matches').where({ id: match.id }).update(matchUpdate);
      }

      let nextStriker = state.striker_id;
      let nextNonStriker = state.non_striker_id;
      
      if (is_wicket) {
        if (dismissed_player_id === nextStriker) nextStriker = null;
        if (dismissed_player_id === nextNonStriker) nextNonStriker = null;
      }

      if (shouldSwapStriker(runs_off_bat, extra_type, extra_runs, isOverComplete)) {
        const temp = nextStriker;
        nextStriker = nextNonStriker;
        nextNonStriker = temp;
      }

      await trx('innings_state').where({ innings_id: inningsId }).update({
        striker_id: nextStriker,
        non_striker_id: nextNonStriker,
        current_ball_number: ballNumber,
        updated_at: trx.fn.now()
      });

      // ----------------------------------------------------------------------
      // Socket.IO Broadcasting
      // ----------------------------------------------------------------------
      const io = getIO();
      
      // Notify clients that a new ball was just added
      io.to(`match:${match.id}`).emit('delivery:recorded', { deliveryNumber });
      
      // Notify if the innings or match was finished on this ball
      if (inningsCompleted) {
        io.to(`match:${match.id}`).emit('innings:completed', { inningsId });
      }
      if (matchCompleted) {
        io.to(`match:${match.id}`).emit('match:completed', { 
          matchId: match.id,
          winner_team_id,
          result_type,
          result_description
        });
      }
      
      // Fetch the freshly updated scoreboard payload
      const scoreboard = await getScoreboard(match.id, trx);
      
      // Broadcast the new scoreboard state to all users in the match room
      io.to(`match:${match.id}`).emit('scoreboard:update', scoreboard);

      return { success: true };
    });

    res.status(201).json(result);
  });

/**
 * Fetches the current live scoreboard for a match via REST API.
 * (Useful for initial load before WebSocket events start arriving).
 */
const getLiveScoreboard = TryCatch(async (req, res, next) => {
    const matchId = req.params.id;

    const scoreboard = await getScoreboard(matchId);
    res.json({ success: true, data: scoreboard });
  });

/**
 * Assigns the next striker, non-striker, or bowler.
 * Typically called after a wicket falls or at the end of an over.
 * Broadcasts the updated scoreboard to reflect the new players on pitch.
 */
const setNextPlayers = TryCatch(async (req, res, next) => {
    const inningsId = req.params.id;
    const { striker_id, non_striker_id, bowler_id } = req.body;

    const result = await db.transaction(async (trx) => {
      const innings = await trx('innings').where({ id: inningsId }).first();
      if (!innings || innings.status === 'COMPLETED') throw new ErrorHandler('Invalid innings', 400);

      const match = req.match;
      
      // Strict Over Limit Validation
      if (match.overs && innings.total_legal_balls >= match.overs * 6) {
        throw new ErrorHandler(`All ${match.overs} overs for this match have already been bowled. You cannot start a new over.`, 400);
      }
      
      const state = await trx('innings_state').where({ innings_id: inningsId }).first();
      
      const finalStriker = striker_id || state.striker_id;
      const finalNonStriker = non_striker_id || state.non_striker_id;
      const finalBowler = bowler_id || state.current_bowler_id;
      
      if (finalStriker && finalNonStriker && finalStriker === finalNonStriker) {
        throw new ErrorHandler('Striker and non-striker cannot be the same player', 400);
      }
      if (finalBowler && (finalBowler === finalStriker || finalBowler === finalNonStriker)) {
        throw new ErrorHandler('Bowler cannot be the same as the striker or non-striker', 400);
      }

      if (striker_id || non_striker_id) {
        const battingTeamPlayers = await trx('team_players').where({ team_id: innings.batting_team_id, is_active: true }).pluck('user_id');
        if (striker_id && !battingTeamPlayers.includes(striker_id)) {
          throw new ErrorHandler('Striker must be a player of the batting team', 400);
        }
        if (non_striker_id && !battingTeamPlayers.includes(non_striker_id)) {
          throw new ErrorHandler('Non-striker must be a player of the batting team', 400);
        }
      }

      if (bowler_id) {
        const bowlingTeamPlayers = await trx('team_players').where({ team_id: innings.bowling_team_id, is_active: true }).pluck('user_id');
        if (!bowlingTeamPlayers.includes(bowler_id)) {
          throw new ErrorHandler('Bowler must be a player of the bowling team', 400);
        }
      }

      const updatePayload = { updated_at: trx.fn.now() };
      
      if (striker_id) updatePayload.striker_id = striker_id;
      if (non_striker_id) updatePayload.non_striker_id = non_striker_id;
      if (bowler_id && bowler_id !== state.current_bowler_id) {
         updatePayload.current_bowler_id = bowler_id;
         const currentOver = await trx('overs').where({ innings_id: inningsId }).orderBy('over_number', 'desc').first();
         const newOverNumber = (currentOver ? currentOver.over_number : 0) + 1;
         await trx('overs').insert({
           innings_id: inningsId,
           over_number: newOverNumber,
           bowler_id,
           status: 'IN_PROGRESS'
         });
         updatePayload.current_over_number = newOverNumber;
         updatePayload.current_ball_number = 0;
      }

      await trx('innings_state').where({ innings_id: inningsId }).update(updatePayload);

      // Broadcast the player change to the live dashboard
      const scoreboard = await getScoreboard(match.id, trx);
      const io = getIO();
      io.to(`match:${match.id}`).emit('scoreboard:update', scoreboard);
      
      return { success: true };
    });

    res.json(result);
  });

/**
 * Generates the full detailed scorecard for a completed or ongoing match.
 * Includes batting stats, bowling figures, and fall of wickets (FOW).
 */
const getScorecard = TryCatch(async (req, res, next) => {
    const matchId = req.params.id;

    const match = await db('matches').where({ id: matchId }).first();
    if (!match) throw new ErrorHandler('Match not found', 404);
    
    const innings = await db('innings').where({ match_id: matchId }).orderBy('innings_number', 'asc');
    
    const scorecardData = [];
    
    for (const inn of innings) {
      // Batting
      const battersData = await db('deliveries')
        .join('users', 'deliveries.striker_id', '=', 'users.id')
        .where({ innings_id: inn.id })
        .select('users.id', 'users.username as name')
        .sum('runs_off_bat as runs')
        .count('* as balls')
        .sum('is_four as fours')
        .sum('is_six as sixes')
        .groupBy('users.id', 'users.username');
        
      const batters = battersData.map(b => {
        const balls = Number(b.balls) || 0;
        const runs = Number(b.runs) || 0;
        return {
          ...b,
          runs,
          balls,
          fours: Number(b.fours) || 0,
          sixes: Number(b.sixes) || 0,
          strike_rate: balls > 0 ? ((runs / balls) * 100).toFixed(2) : 0
        };
      });
      
      // Bowling
      const bowlersData = await db('deliveries')
        .join('users', 'deliveries.bowler_id', '=', 'users.id')
        .where({ innings_id: inn.id })
        .select('users.id', 'users.username as name')
        .sum('total_runs as runs')
        .sum('is_wicket as wickets')
        .groupBy('users.id', 'users.username');
        
      const bowlers = [];
      for (const b of bowlersData) {
        const legalBallsRow = await db('deliveries')
          .where({ innings_id: inn.id, bowler_id: b.id, is_legal_delivery: true })
          .count('* as lb').first();
        const totalLegalBalls = Number(legalBallsRow.lb) || 0;
        const completeOvers = Math.floor(totalLegalBalls / 6);
        const rem = totalLegalBalls % 6;
        const runs = Number(b.runs) || 0;
        
        bowlers.push({
          id: b.id,
          name: b.name,
          runs,
          wickets: Number(b.wickets) || 0,
          overs: parseFloat(`${completeOvers}.${rem}`),
          economy: totalLegalBalls > 0 ? ((runs / totalLegalBalls) * 6).toFixed(2) : 0
        });
      }
      
      // Fall of Wickets
      const fowDataRaw = await db('deliveries')
        .join('users as batter', 'deliveries.dismissed_player_id', '=', 'batter.id')
        .join('overs', 'deliveries.over_id', '=', 'overs.id')
        .leftJoin('users as bowler', 'deliveries.bowler_id', '=', 'bowler.id')
        .leftJoin('users as fielder', 'deliveries.fielder_id', '=', 'fielder.id')
        .where({ 'deliveries.innings_id': inn.id, 'deliveries.is_wicket': true })
        .orderBy('deliveries.delivery_number', 'asc')
        .select(
          'deliveries.delivery_number',
          'overs.over_number',
          'deliveries.ball_number',
          'deliveries.wicket_type',
          'batter.id as batter_id',
          'batter.username as batter_name',
          'bowler.id as bowler_id',
          'bowler.username as bowler_name',
          'fielder.id as fielder_id',
          'fielder.username as fielder_name'
        );
      
      const fallOfWickets = [];
      for (const fow of fowDataRaw) {
         const scoreAtWicket = await db('deliveries')
           .where({ innings_id: inn.id })
           .where('delivery_number', '<=', fow.delivery_number)
           .sum('total_runs as score')
           .first();
           
         const noBowlerCredit = ['RUN_OUT', 'RETIRED_HURT', 'RETIRED_OUT', 'OBSTRUCTING_THE_FIELD', 'TIMED_OUT'].includes(fow.wicket_type);
         const displayBowlerId = noBowlerCredit ? null : fow.bowler_id;
         const displayBowlerName = noBowlerCredit ? null : fow.bowler_name;
           
         fallOfWickets.push({
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
      
      scorecardData.push({
        innings_id: inn.id,
        innings_number: inn.innings_number,
        total_runs: inn.total_runs,
        total_wickets: inn.total_wickets,
        overs: inn.overs,
        batters,
        bowlers,
        fall_of_wickets: fallOfWickets
      });
    }

    res.json({ success: true, data: scorecardData });
  });

module.exports = {
  startInnings,
  recordDelivery,
  getLiveScoreboard,
  setNextPlayers,
  getScorecard
};

/**
 * Undoes the last recorded delivery for an innings.
 * Reverts the database state (runs, wickets, balls) and restores the crease state.
 */
const undoLastDelivery = TryCatch(async (req, res, next) => {
    const inningsId = req.params.id;

    const result = await db.transaction(async (trx) => {
      const innings = await trx('innings').where({ id: inningsId }).first();
      if (!innings) throw new ErrorHandler('Innings not found', 404);

      const match = req.match;

      // Find the last delivery
      const lastDelivery = await trx('deliveries')
        .where({ innings_id: inningsId })
        .orderBy('delivery_number', 'desc')
        .first();

      if (!lastDelivery) {
        throw new ErrorHandler('No deliveries found to undo', 400);
      }

      const over = await trx('overs').where({ id: lastDelivery.over_id }).first();

      // Delete the delivery
      await trx('deliveries').where({ id: lastDelivery.id }).del();

      // Update the over (never delete it, even if it has 0 balls)
      const isLegal = lastDelivery.is_legal_delivery;
      const runsToSubtract = lastDelivery.total_runs;
      const wicketsToSubtract = lastDelivery.is_wicket ? 1 : 0;
      
      const newLegalBalls = over.legal_balls - (isLegal ? 1 : 0);
      
      await trx('overs').where({ id: over.id }).update({
        runs: over.runs - runsToSubtract,
        wickets: over.wickets - wicketsToSubtract,
        legal_balls: newLegalBalls,
        status: 'IN_PROGRESS'
      });

      // Delete any future empty overs that were created but had no deliveries yet
      await trx('overs')
        .where({ innings_id: inningsId })
        .andWhere('over_number', '>', over.over_number)
        .del();

      // Update innings
      const newTotalRuns = innings.total_runs - runsToSubtract;
      const newTotalWickets = innings.total_wickets - wicketsToSubtract;
      const newTotalLegalBalls = innings.total_legal_balls - (isLegal ? 1 : 0);
      const newOvers = calculateOvers(newTotalLegalBalls);

      await trx('innings').where({ id: inningsId }).update({
        total_runs: newTotalRuns,
        total_wickets: newTotalWickets,
        total_legal_balls: newTotalLegalBalls,
        overs: newOvers,
        status: 'IN_PROGRESS',
        completed_at: null
      });

      // Update match
      await trx('matches').where({ id: match.id }).update({
        status: 'LIVE',
        winner_team_id: null,
        result_type: null,
        result_description: null
      });

      // Update innings state
      const currentOver = await trx('overs').where({ innings_id: inningsId }).orderBy('over_number', 'desc').first();
      
      await trx('innings_state').where({ innings_id: inningsId }).update({
        striker_id: lastDelivery.striker_id,
        non_striker_id: lastDelivery.non_striker_id,
        current_bowler_id: lastDelivery.bowler_id,
        current_over_number: currentOver ? currentOver.over_number : 1,
        current_ball_number: currentOver ? currentOver.legal_balls : 0,
        updated_at: trx.fn.now()
      });

      // Broadcast update
      const io = getIO();
      const scoreboard = await getScoreboard(match.id, trx);
      io.to(`match:${match.id}`).emit('scoreboard:update', scoreboard);

      return { success: true, message: 'Last delivery undone successfully' };
    });

    res.json(result);
});

module.exports = {
  startInnings,
  recordDelivery,
  getLiveScoreboard,
  setNextPlayers,
  getScorecard,
  undoLastDelivery
};
