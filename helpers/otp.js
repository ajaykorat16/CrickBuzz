/**
 * OTP generation helpers.
 */

const crypto = require('crypto');

/** Cryptographically strong 6-digit code (avoids predictable Math.random). */
function generateOtp() {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}

module.exports = {
  generateOtp,
};
