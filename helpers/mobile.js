/**
 * Mobile number helpers.
 */

/** Ensures phone numbers are stored/compared in E.164-style (+prefix). */
function normalizeMobile(mobile) {
  const trimmed = String(mobile).trim();
  return trimmed.startsWith('+') ? trimmed : `+${trimmed}`;
}

module.exports = {
  normalizeMobile,
};
