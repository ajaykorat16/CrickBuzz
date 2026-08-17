const { db } = require('../config/database');
const { ErrorHandler } = require('../middleware/error.middleware');

const formatTeam = (req, team) => {
  if (team && team.logo && !team.logo.startsWith('http')) {
    team.logo = `${req.protocol}://${req.get('host')}${team.logo}`;
  }
  return team;
};

async function createTeam(req, res, next) {
  try {
    const { name, short_name, city, description } = req.body;
    let logo = req.body.logo;
    if (req.file) {
      logo = `/uploads/${req.file.filename}`;
    }
    const [id] = await db('teams').insert({
      owner_id: req.user.id,
      name,
      short_name,
      logo,
      city,
      description,
    });

    const team = await db('teams').where({ id }).first();
    res.status(201).json({ success: true, data: formatTeam(req, team) });
  } catch (err) {
    next(err);
  }
}

async function getTeams(req, res, next) {
  try {
    const teams = await db('teams')
      .where({ owner_id: req.user.id })
      .whereNull('deleted_at');
    const formattedTeams = teams.map(t => formatTeam(req, t));
    res.json({ success: true, data: formattedTeams });
  } catch (err) {
    next(err);
  }
}

async function getTeam(req, res, next) {
  try {
    const team = await db('teams')
      .where({ id: req.params.id, owner_id: req.user.id })
      .whereNull('deleted_at')
      .first();

    if (!team) {
      throw new ErrorHandler('Team not found', 404);
    }

    res.json({ success: true, data: formatTeam(req, team) });
  } catch (err) {
    next(err);
  }
}

async function updateTeam(req, res, next) {
  try {
    const { name, short_name, city, description, is_active } = req.body;
    let logo = req.body.logo;
    if (req.file) {
      logo = `/uploads/${req.file.filename}`;
    }
    const team = await db('teams')
      .where({ id: req.params.id, owner_id: req.user.id })
      .whereNull('deleted_at')
      .first();

    if (!team) {
      throw new ErrorHandler('Team not found', 404);
    }

    await db('teams').where({ id: team.id }).update({
      name,
      short_name,
      logo,
      city,
      description,
      is_active,
      updated_at: db.fn.now(),
    });

    const updatedTeam = await db('teams').where({ id: team.id }).first();
    res.json({ success: true, data: formatTeam(req, updatedTeam) });
  } catch (err) {
    next(err);
  }
}

async function deleteTeam(req, res, next) {
  try {
    const team = await db('teams')
      .where({ id: req.params.id, owner_id: req.user.id })
      .whereNull('deleted_at')
      .first();

    if (!team) {
      throw new ErrorHandler('Team not found', 404);
    }

    await db('teams').where({ id: team.id }).update({
      deleted_at: db.fn.now(),
      is_active: false,
    });

    res.json({ success: true, message: 'Team deleted successfully' });
  } catch (err) {
    next(err);
  }
}

async function addPlayer(req, res, next) {
  try {
    const { user_id, is_captain, is_vice_captain, jersey_number } = req.body;

    const team = await db('teams')
      .where({ id: req.params.id, owner_id: req.user.id })
      .whereNull('deleted_at')
      .first();

    if (!team) throw new ErrorHandler('Team not found', 404);

    const player = await db('users')
      .where({ id: user_id })
      .first();

    if (!player) throw new ErrorHandler('User not found', 404);

    // Check if user is already active in the team
    const existing = await db('team_players')
      .where({ team_id: team.id, user_id: player.id, is_active: true })
      .first();

    if (existing) {
      throw new ErrorHandler('User is already an active member of this team', 400);
    }

    if (is_captain) {
      const existingCaptain = await db('team_players').where({ team_id: team.id, is_active: true, is_captain: true }).first();
      if (existingCaptain) throw new ErrorHandler('Team already has a captain', 400);
    }

    if (is_vice_captain) {
      const existingViceCaptain = await db('team_players').where({ team_id: team.id, is_active: true, is_vice_captain: true }).first();
      if (existingViceCaptain) throw new ErrorHandler('Team already has a vice captain', 400);
    }

    const [id] = await db('team_players').insert({
      team_id: team.id,
      user_id: player.id,
      is_captain: is_captain || false,
      is_vice_captain: is_vice_captain || false,
      playing_role: req.body.playing_role || null,
      jersey_number,
      is_active: true,
    });

    const teamPlayer = await db('team_players').where({ id }).first();
    res.status(201).json({ success: true, data: teamPlayer });
  } catch (err) {
    next(err);
  }
}

async function getTeamPlayers(req, res, next) {
  try {
    const team = await db('teams')
      .where({ id: req.params.id, owner_id: req.user.id })
      .whereNull('deleted_at')
      .first();

    if (!team) throw new ErrorHandler('Team not found', 404);

    const players = await db('team_players')
      .join('users', 'team_players.user_id', '=', 'users.id')
      .where({ 'team_players.team_id': team.id, 'team_players.is_active': true })
      .select('users.id', 'users.first_name', 'users.last_name', 'users.username', 'team_players.is_captain', 'team_players.is_vice_captain', 'team_players.playing_role', 'team_players.jersey_number', 'team_players.joined_at');

    res.json({ success: true, data: players });
  } catch (err) {
    next(err);
  }
}

async function updateTeamPlayer(req, res, next) {
  try {
    const { is_captain, is_vice_captain, jersey_number, is_active } = req.body;

    const team = await db('teams')
      .where({ id: req.params.id, owner_id: req.user.id })
      .first();

    if (!team) throw new ErrorHandler('Team not found', 404);

    const teamPlayer = await db('team_players')
      .where({ team_id: team.id, user_id: req.params.userId })
      .first();

    if (!teamPlayer) throw new ErrorHandler('User not found in this team', 404);

    if (is_captain && !teamPlayer.is_captain) {
      const existingCaptain = await db('team_players').where({ team_id: team.id, is_active: true, is_captain: true }).first();
      if (existingCaptain) throw new ErrorHandler('Team already has a captain', 400);
    }

    if (is_vice_captain && !teamPlayer.is_vice_captain) {
      const existingViceCaptain = await db('team_players').where({ team_id: team.id, is_active: true, is_vice_captain: true }).first();
      if (existingViceCaptain) throw new ErrorHandler('Team already has a vice captain', 400);
    }

    await db('team_players')
      .where({ id: teamPlayer.id })
      .update({
        is_captain: is_captain !== undefined ? is_captain : teamPlayer.is_captain,
        is_vice_captain: is_vice_captain !== undefined ? is_vice_captain : teamPlayer.is_vice_captain,
        playing_role: req.body.playing_role !== undefined ? req.body.playing_role : teamPlayer.playing_role,
        jersey_number: jersey_number !== undefined ? jersey_number : teamPlayer.jersey_number,
        is_active: is_active !== undefined ? is_active : teamPlayer.is_active,
        left_at: is_active === false ? db.fn.now() : teamPlayer.left_at,
        updated_at: db.fn.now(),
      });

    const updated = await db('team_players').where({ id: teamPlayer.id }).first();
    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
}

async function removeTeamPlayer(req, res, next) {
  try {
    const team = await db('teams')
      .where({ id: req.params.id, owner_id: req.user.id })
      .first();

    if (!team) throw new ErrorHandler('Team not found', 404);

    const teamPlayer = await db('team_players')
      .where({ team_id: team.id, user_id: req.params.userId, is_active: true })
      .first();

    if (!teamPlayer) throw new ErrorHandler('User not found in this team', 404);

    await db('team_players')
      .where({ id: teamPlayer.id })
      .update({
        is_active: false,
        left_at: db.fn.now(),
        updated_at: db.fn.now(),
      });

    res.json({ success: true, message: 'Player removed from team' });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  createTeam,
  getTeams,
  getTeam,
  updateTeam,
  deleteTeam,
  addPlayer,
  getTeamPlayers,
  updateTeamPlayer,
  removeTeamPlayer,
};
