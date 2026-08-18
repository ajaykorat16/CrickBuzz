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
      const userNames = commonUsers.map(u => `'${u.username}'`).join(', ');

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
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const sortBy = req.query.sort_by || 'created_at';
    const sortOrder = req.query.sort_order || 'desc';
    const status = req.query.status;
    const search = req.query.search;

    const offset = (page - 1) * limit;
    const order = String(sortOrder).toLowerCase() === 'asc' ? 'asc' : 'desc';

    const userTeams = await db('team_players').where({ user_id: req.user.id, is_active: true }).pluck('team_id');
    const scoredMatches = await db('match_scorers').where({ user_id: req.user.id }).pluck('match_id');

    const base = db('matches')
      .whereNull('deleted_at')
      .andWhere(function() {
        this.where('created_by', req.user.id)
            .orWhereIn('team_a_id', userTeams)
            .orWhereIn('team_b_id', userTeams)
            .orWhereIn('id', scoredMatches);
      });

    if (status) {
      base.where('status', status);
    }

    if (search && search.trim() !== '') {
      const term = `%${search}%`;
      base.where((builder) => {
        builder.where('city', 'like', term)
               .orWhere('venue', 'like', term)
               .orWhere('match_type', 'like', term);
      });
    }

    const countRow = await base.clone().count({ total: '*' }).first();
    const total = Number(countRow.total) || 0;

    const matches = await base
      .clone()
      .orderBy(sortBy, order)
      .limit(limit)
      .offset(offset);

    res.json({
      success: true,
      data: matches,
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit) || 0,
      }
    });
  } catch (err) {
    next(err);
  }
}

async function getMatch(req, res, next) {
  try {
    const { isAuthorizedViewer } = require('../helpers/scoreboard');
    const authorized = await isAuthorizedViewer(req.params.id, req.user.id);
    if (!authorized) throw new ErrorHandler('Match not found or unauthorized', 404);

    const match = await db('matches')
      .where({ id: req.params.id })
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

async function addScorer(req, res, next) {
  try {
    const matchId = req.params.id;
    const { user_id } = req.body;

    const match = await db('matches')
      .where({ id: matchId, created_by: req.user.id })
      .whereNull('deleted_at')
      .first();

    if (!match) throw new ErrorHandler('Match not found or unauthorized', 404);

    const userToAdd = await db('users').where({ id: user_id }).first();
    if (!userToAdd) throw new ErrorHandler('User not found', 404);

    // Ensure the new scorer is NOT a player in either team
    const isPlayerInTeams = await db('team_players')
      .whereIn('team_id', [match.team_a_id, match.team_b_id])
      .andWhere({ user_id: user_id, is_active: true })
      .first();

    if (isPlayerInTeams) {
      throw new ErrorHandler('Scorer must be a neutral user outside of both participating teams', 400);
    }

    // Check if already a scorer
    const existing = await db('match_scorers').where({ match_id: matchId, user_id }).first();
    if (existing) {
      return res.status(200).json({ success: true, message: 'User is already a scorer for this match' });
    }

    await db('match_scorers').insert({
      match_id: matchId,
      user_id
    });

    res.status(201).json({ success: true, message: 'Scorer added successfully' });
  } catch (err) {
    next(err);
  }
}

async function removeScorer(req, res, next) {
  try {
    const matchId = req.params.id;
    const { user_id } = req.body;

    const match = await db('matches')
      .where({ id: matchId, created_by: req.user.id })
      .whereNull('deleted_at')
      .first();

    if (!match) throw new ErrorHandler('Match not found or unauthorized', 404);

    await db('match_scorers').where({ match_id: matchId, user_id }).del();

    res.json({ success: true, message: 'Scorer removed successfully' });
  } catch (err) {
    next(err);
  }
}

async function getScorers(req, res, next) {
  try {
    const matchId = req.params.id;
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const sortBy = req.query.sort_by || 'created_at';
    const sortOrder = req.query.sort_order || 'desc';
    const search = req.query.search;

    const offset = (page - 1) * limit;
    const order = String(sortOrder).toLowerCase() === 'asc' ? 'asc' : 'desc';

    const { isAuthorizedViewer } = require('../helpers/scoreboard');
    const authorized = await isAuthorizedViewer(matchId, req.user.id);
    if (!authorized) throw new ErrorHandler('Match not found or unauthorized', 404);

    const base = db('match_scorers')
      .join('users', 'match_scorers.user_id', '=', 'users.id')
      .where('match_scorers.match_id', matchId)
      .select('users.id', 'users.username', 'users.email', 'users.avatar', 'match_scorers.created_at');

    if (search && search.trim() !== '') {
      const term = `%${search}%`;
      base.andWhere((builder) => {
        builder.where('users.username', 'like', term)
               .orWhere('users.email', 'like', term);
      });
    }

    const countRow = await base.clone().clearSelect().count({ total: '*' }).first();
    const total = Number(countRow.total) || 0;

    let orderField = sortBy;
    if (sortBy === 'created_at') orderField = 'match_scorers.created_at';
    else if (sortBy === 'username') orderField = 'users.username';

    const scorers = await base
      .clone()
      .orderBy(orderField, order)
      .limit(limit)
      .offset(offset);

    res.json({
      success: true,
      data: scorers,
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit) || 0,
      }
    });
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
  addScorer,
  removeScorer,
  getScorers
};
