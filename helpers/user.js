/**
 * User response shaping helpers.
 */

/** Fields safe to expose in API responses. */
const PUBLIC_USER_COLUMNS = [
  'id',
  'mobile',
  'first_name',
  'last_name',
  'username',
  'email',
  'is_profile_complete',
  'created_at',
  'updated_at',
];

const moment = require('moment');

function toPublicUser(user) {
  if (!user) return null;
  const publicUser = {};
  for (const key of PUBLIC_USER_COLUMNS) {
    if ((key === 'created_at' || key === 'updated_at') && user[key]) {
      publicUser[key] = moment(user[key]).format('DD/MM/YYYY HH:mm');
    } else {
      publicUser[key] = user[key];
    }
  }
  return publicUser;
}

module.exports = {
  PUBLIC_USER_COLUMNS,
  toPublicUser,
};
