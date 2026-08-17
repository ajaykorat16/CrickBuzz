const { db } = require('../config/database');
const { ErrorHandler } = require('../middleware/error.middleware');

async function createMatch(req, res, next) {
  try {
    const { team_a_id, team_b_id, match_type, overs, venue, city, scheduled_date, scheduled_time } = req.body;
    
    if (team_a_id === team_b_id) {
      throw new ErrorHandler('Team A and Team B cannot be the same', 400);
    }
    
    const teamA = await db('teams').where({ id: team_a_id, owner_id: req.user.id, is_active: true }).whereNull('deleted_at').first();
    const teamB = await db('teams').where({ id: team_b_id, owner_id: req.user.id, is_active: true }).whereNull('deleted_at').first();
    
    if (!teamA || !teamB) {
      throw new ErrorHandler('Both teams must exist, be active, and belong to you', 400);
    }
    
    // Check if there are common players in both teams
    const teamAPlayers = await db('team_players').where({ team_id: team_a_id, is_active: true }).pluck('user_id');
    const teamBPlayers = await db('team_players').where({ team_id: team_b_id, is_active: true }).pluck('user_id');
    
    const commonPlayers = teamAPlayers.filter(id => teamBPlayers.includes(id));
    
    if (commonPlayers.length > 0) {
      const commonUsers = await db('users').whereIn('id', commonPlayers);
      const userNames = commonUsers.map(u => `'${(`${u.first_name || ''} ${u.last_name || ''}`.trim() || u.username)}'`).join(', ');
      
      const isMultiple = commonPlayers.length > 1;
      const message = `Match cannot be created because the following ${isMultiple ? 'players are' : 'player is'} active in both teams: ${userNames}. A player cannot play against themselves.`;
      
      throw new ErrorHandler(message, 400);
    }
    
    const [id] = await db('matches').insert({
      created_by: req.user.id,
      team_a_id,
      team_b_id,
      match_type,
      overs,
      venue,
      city,
      scheduled_date,
      scheduled_time,
    });
    
    const match = await db('matches').where({ id }).first();
    res.status(201).json({ success: true, data: match });
  } catch (err) {
    next(err);
  }
}

async function getMatches(req, res, next) {
  try {
    const matches = await db('matches')
      .where({ created_by: req.user.id })
      .whereNull('deleted_at');
    res.json({ success: true, data: matches });
  } catch (err) {
    next(err);
  }
}

async function getMatch(req, res, next) {
  try {
    const match = await db('matches')
      .where({ id: req.params.id, created_by: req.user.id })
      .whereNull('deleted_at')
      .first();
      
    if (!match) throw new ErrorHandler('Match not found', 404);
    
    res.json({ success: true, data: match });
  } catch (err) {
    next(err);
  }
}

async function updateMatch(req, res, next) {
  try {
    const match = await db('matches')
      .where({ id: req.params.id, created_by: req.user.id })
      .whereNull('deleted_at')
      .first();
      
    if (!match) throw new ErrorHandler('Match not found', 404);
    
    const {
      status,
      toss_winner_team_id,
      toss_decision,
      winner_team_id,
      result_type,
      result_description,
      overs,
      venue,
      city,
      scheduled_date,
      scheduled_time
    } = req.body;
    
    if (toss_winner_team_id && toss_winner_team_id !== match.team_a_id && toss_winner_team_id !== match.team_b_id) {
      throw new ErrorHandler('Toss winner must be one of the participating teams', 400);
    }
    
    if (winner_team_id && winner_team_id !== match.team_a_id && winner_team_id !== match.team_b_id) {
      throw new ErrorHandler('Winner must be one of the participating teams', 400);
    }
    
    await db('matches').where({ id: match.id }).update({
      status: status || match.status,
      toss_winner_team_id: toss_winner_team_id !== undefined ? toss_winner_team_id : match.toss_winner_team_id,
      toss_decision: toss_decision !== undefined ? toss_decision : match.toss_decision,
      winner_team_id: winner_team_id !== undefined ? winner_team_id : match.winner_team_id,
      result_type: result_type !== undefined ? result_type : match.result_type,
      result_description: result_description !== undefined ? result_description : match.result_description,
      overs: overs !== undefined ? overs : match.overs,
      venue: venue !== undefined ? venue : match.venue,
      city: city !== undefined ? city : match.city,
      scheduled_date: scheduled_date !== undefined ? scheduled_date : match.scheduled_date,
      scheduled_time: scheduled_time !== undefined ? scheduled_time : match.scheduled_time,
      updated_at: db.fn.now(),
    });
    
    const updated = await db('matches').where({ id: match.id }).first();
    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
}

async function deleteMatch(req, res, next) {
  try {
    const match = await db('matches')
      .where({ id: req.params.id, created_by: req.user.id })
      .whereNull('deleted_at')
      .first();
      
    if (!match) throw new ErrorHandler('Match not found', 404);
    
    await db('matches').where({ id: match.id }).update({
      deleted_at: db.fn.now(),
      status: 'CANCELLED',
    });
    
    res.json({ success: true, message: 'Match deleted successfully' });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  createMatch,
  getMatches,
  getMatch,
  updateMatch,
  deleteMatch,
};
