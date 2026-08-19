const { db } = require('../config/database');
const { ErrorHandler, TryCatch } = require('../middleware/error.middleware');

const createMatch = TryCatch(async (req, res, next) => {
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
  });

const getMatches = TryCatch(async (req, res, next) => {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const sortBy = req.query.sort_by || 'created_at';
    const sortOrder = req.query.sort_order || 'desc';
    const status = req.query.status;
    const search = req.query.search;

    const offset = (page - 1) * limit;
    const order = String(sortOrder).toLowerCase() === 'asc' ? 'asc' : 'desc';

    const userTeams = await db('team_players').where({ user_id: req.user.id, is_active: true }).pluck('team_id');
    const adminMatches = await db('match_admins').where({ user_id: req.user.id }).pluck('match_id');

    const base = db('matches')
      .whereNull('deleted_at')
      .andWhere(function () {
        this.where('created_by', req.user.id)
          .orWhereIn('team_a_id', userTeams)
          .orWhereIn('team_b_id', userTeams)
          .orWhereIn('id', adminMatches);
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
  });

const getMatch = TryCatch(async (req, res, next) => {
    const { isAuthorizedViewer } = require('../helpers/scoreboard');
    const authorized = await isAuthorizedViewer(req.params.id, req.user.id);
    if (!authorized) throw new ErrorHandler('Match not found or unauthorized', 404);

    const match = await db('matches')
      .where({ id: req.params.id })
      .whereNull('deleted_at')
      .first();

    if (!match) throw new ErrorHandler('Match not found', 404);

    res.json({ success: true, data: match });
  });

const updateMatch = TryCatch(async (req, res, next) => {
    const match = await db('matches')
      .where({ id: req.params.id })
      .whereNull('deleted_at')
      .first();

    if (!match) throw new ErrorHandler('Match not found', 404);

    if (match.created_by !== req.user.id) {
      const isAdmin = await db('match_admins').where({ match_id: match.id, user_id: req.user.id }).first();
      if (!isAdmin) throw new ErrorHandler('Unauthorized to update this match details', 403);
    }

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
    
    // Broadcast manual updates to connected clients
    const { getIO } = require('../socket');
    const io = getIO();
    io.to(`match:${match.id}`).emit('match:updated', updated);
    
    if (updated.status === 'COMPLETED' && match.status !== 'COMPLETED') {
      io.to(`match:${match.id}`).emit('match:completed', { 
        matchId: updated.id,
        winner_team_id: updated.winner_team_id,
        result_type: updated.result_type,
        result_description: updated.result_description
      });
    }

    res.json({ success: true, data: updated });
  });

const deleteMatch = TryCatch(async (req, res, next) => {
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
  });

/**
 * Grants admin permission to a user for a specific match.
 * Match Admins are allowed to update the scoreboard and match details.
 * Only the original match owner can assign admins.
 * 
 * @param {Object} req - Express request object containing match ID and user ID
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
const addMatchAdmin = TryCatch(async (req, res, next) => {
    const matchId = req.params.id;
    const { user_id } = req.body;

    const match = await db('matches')
      .where({ id: matchId, created_by: req.user.id })
      .whereNull('deleted_at')
      .first();

    if (!match) throw new ErrorHandler('Match not found or unauthorized', 404);

    const userToAdd = await db('users').where({ id: user_id }).first();
    if (!userToAdd) throw new ErrorHandler('User not found', 404);

    // Check if already an admin
    const existing = await db('match_admins').where({ match_id: matchId, user_id }).first();
    if (existing) {
      return res.status(200).json({ success: true, message: 'User is already a match admin for this match' });
    }

    await db('match_admins').insert({
      match_id: matchId,
      user_id
    });

    res.status(201).json({ success: true, message: 'Match Admin added successfully' });
  });

/**
 * Revokes admin permission from a user for a specific match.
 * Only the original match owner can perform this action.
 * 
 * @param {Object} req - Express request object containing match ID and user ID
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
const removeMatchAdmin = TryCatch(async (req, res, next) => {
    const matchId = req.params.id;
    const { user_id } = req.body;

    const match = await db('matches')
      .where({ id: matchId, created_by: req.user.id })
      .whereNull('deleted_at')
      .first();

    if (!match) throw new ErrorHandler('Match not found or unauthorized', 404);

    await db('match_admins').where({ match_id: matchId, user_id }).del();

    res.json({ success: true, message: 'Match Admin removed successfully' });
  });

/**
 * Fetches a paginated list of all users who have been granted admin permission for the match.
 * Supports searching and sorting.
 * 
 * @param {Object} req - Express request object containing match ID and query parameters
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
const getMatchAdmins = TryCatch(async (req, res, next) => {
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

    const base = db('match_admins')
      .join('users', 'match_admins.user_id', '=', 'users.id')
      .where('match_admins.match_id', matchId)
      .select('users.id', 'users.username', 'users.email', 'match_admins.created_at');

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
    if (sortBy === 'created_at') orderField = 'match_admins.created_at';
    else if (sortBy === 'username') orderField = 'users.username';

    const admins = await base
      .clone()
      .orderBy(orderField, order)
      .limit(limit)
      .offset(offset);

    res.json({
      success: true,
      data: admins,
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit) || 0,
      }
    });
  });

/**
 * Grants viewer permission to a user for a specific match.
 * Match Viewers can see live scores and match details but cannot make updates.
 * Only the original match owner can add viewers.
 * 
 * @param {Object} req - Express request object containing match ID and user ID
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
const addViewer = TryCatch(async (req, res, next) => {
    const matchId = req.params.id;
    const { user_id } = req.body;

    const match = await db('matches')
      .where({ id: matchId, created_by: req.user.id })
      .whereNull('deleted_at')
      .first();

    if (!match) throw new ErrorHandler('Match not found or unauthorized', 404);

    const userToAdd = await db('users').where({ id: user_id }).first();
    if (!userToAdd) throw new ErrorHandler('User not found', 404);

    const existing = await db('match_viewers').where({ match_id: matchId, user_id }).first();
    if (existing) {
      return res.status(200).json({ success: true, message: 'User is already a viewer for this match' });
    }

    await db('match_viewers').insert({
      match_id: matchId,
      user_id
    });

    res.status(201).json({ success: true, message: 'Viewer added successfully' });
  });

/**
 * Revokes viewer permission from a user for a specific match.
 * Only the original match owner can perform this action.
 * 
 * @param {Object} req - Express request object containing match ID and user ID
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
const removeViewer = TryCatch(async (req, res, next) => {
    const matchId = req.params.id;
    const { user_id } = req.body;

    const match = await db('matches')
      .where({ id: matchId, created_by: req.user.id })
      .whereNull('deleted_at')
      .first();

    if (!match) throw new ErrorHandler('Match not found or unauthorized', 404);

    await db('match_viewers').where({ match_id: matchId, user_id }).del();

    res.json({ success: true, message: 'Viewer removed successfully' });
  });

/**
 * Fetches a paginated list of all users who have been granted explicit viewer permission.
 * Supports searching and sorting.
 * 
 * @param {Object} req - Express request object containing match ID and query parameters
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
const getViewers = TryCatch(async (req, res, next) => {
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

    const base = db('match_viewers')
      .join('users', 'match_viewers.user_id', '=', 'users.id')
      .where('match_viewers.match_id', matchId)
      .select('users.id', 'users.username', 'users.email', 'match_viewers.created_at');

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
    if (sortBy === 'created_at') orderField = 'match_viewers.created_at';
    else if (sortBy === 'username') orderField = 'users.username';

    const viewers = await base
      .clone()
      .orderBy(orderField, order)
      .limit(limit)
      .offset(offset);

    res.json({
      success: true,
      data: viewers,
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit) || 0,
      }
    });
  });

module.exports = {
  createMatch,
  getMatches,
  getMatch,
  updateMatch,
  deleteMatch,
  addMatchAdmin,
  removeMatchAdmin,
  getMatchAdmins,
  addViewer,
  removeViewer,
  getViewers
};
