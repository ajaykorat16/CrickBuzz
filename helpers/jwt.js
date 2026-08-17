/**
 * JWT sign/verify helpers for access and profile-completion tokens.
 */

const jwt = require('jsonwebtoken');
const config = require('../config');

/** Access token for users with a completed profile. Payload must include `sub` (user id). */
function signAccessToken(payload) {
  return jwt.sign(payload, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn,
  });
}

/**
 * Short-lived token after OTP when the profile is still incomplete.
 * Sets `purpose: 'complete_profile'` so middleware can restrict it to signup only.
 */
function signProfileToken(payload) {
  return jwt.sign(
    { ...payload, purpose: 'complete_profile' },
    config.jwt.secret,
    { expiresIn: config.jwt.profileExpiresIn }
  );
}

function verifyToken(token) {
  return jwt.verify(token, config.jwt.secret);
}

module.exports = {
  signAccessToken,
  signProfileToken,
  verifyToken,
};
