const { db } = require('../config/database');
const { ErrorHandler } = require('./error.middleware');
const { verifyToken } = require('../helpers/jwt');
const { isAuthorizedViewer } = require('../helpers/scoreboard');
/** Verifies Bearer JWT and attaches `req.user` / `req.auth`. */
async function authenticate(req, res, next) {
  try {
    const header = req.headers.authorization;

    if (!header) {
      throw new ErrorHandler('Authentication required', 401);
    }

    const token = header.startsWith('Bearer ') ? header.slice(7) : header;
    const decoded = verifyToken(token);
    const user = await db('users').where({ id: decoded.sub }).first();

    if (!user) {
      throw new ErrorHandler('User not found', 401);
    }

    req.user = user;
    req.auth = decoded;
    return next();
  } catch (err) {
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
      return next(new ErrorHandler('Invalid or expired token', 401));
    }
    return next(err);
  }
}

/** Allows only the short-lived post-OTP profile-completion token. */
function requireProfileToken(req, res, next) {
  if (!req.auth || req.auth.purpose !== 'complete_profile') {
    return next(
      new ErrorHandler('Profile completion token required. Verify OTP first.', 403)
    );
  }
  return next();
}

/** Blocks profile-completion tokens from normal authenticated APIs. */
function requireAccessToken(req, res, next) {
  if (req.auth && req.auth.purpose === 'complete_profile') {
    return next(
      new ErrorHandler('Complete your profile before accessing this resource', 403)
    );
  }
  return next();
}

/** Validates if the user is authorized to score/manage the match */
const requireMatchAdmin = (idType = 'match') => {
  return async (req, res, next) => {
    try {
      const userId = req.user.id;
      let matchId;

      if (idType === 'match') {
        matchId = req.params.id;
      } else if (idType === 'innings') {
        const inningsId = req.params.id;
        const innings = await db('innings').where({ id: inningsId }).first();
        if (!innings) throw new ErrorHandler('Innings not found', 404);
        matchId = innings.match_id;
        req.innings = innings;
      }

      const match = await db('matches').where({ id: matchId }).whereNull('deleted_at').first();
      if (!match) throw new ErrorHandler('Match not found', 404);

      if (String(match.created_by) !== String(userId)) {
        const isAdmin = await db('match_admins').where({ match_id: matchId, user_id: userId }).first();
        if (!isAdmin) throw new ErrorHandler('Unauthorized to manage this match', 403);
      }

      req.match = match;
      next();
    } catch (error) {
      next(error);
    }
  };
};

/** Validates if the user is authorized to view the match */
const requireMatchViewer = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const matchId = req.params.id;

    const match = await db('matches').where({ id: matchId }).whereNull('deleted_at').first();
    if (!match) throw new ErrorHandler('Match not found', 404);

    const authorized = await isAuthorizedViewer(matchId, userId);

    if (!authorized) {
      throw new ErrorHandler('Unauthorized to view this match scoreboard', 403);
    }
    
    req.match = match; // Attach match for controllers to use
    next();
  } catch (error) {
    next(error);
  }
};

module.exports = {
  authenticate,
  requireProfileToken,
  requireAccessToken,
  requireMatchAdmin,
  requireMatchViewer,
};
