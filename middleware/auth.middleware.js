const { db } = require('../config/database');
const { ErrorHandler } = require('./error.middleware');
const { verifyToken } = require('../helpers/jwt');

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

module.exports = {
  authenticate,
  requireProfileToken,
  requireAccessToken,
};
