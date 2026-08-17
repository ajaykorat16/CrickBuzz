/**
 * Username suggestion and availability checks.
 */

const { db } = require('../config/database');

async function isUsernameTaken(username, excludeUserId = null) {
  const query = db('users').where({ username });
  if (excludeUserId) {
    query.andWhereNot({ id: excludeUserId });
  }
  const row = await query.first();
  return Boolean(row);
}

/**
 * Builds unique usernames from name parts.
 * Returns an array of exactly 3 unique usernames not present in DB.
 */
async function suggestUsernames(firstName, lastName, isTaken = isUsernameTaken) {
  const clean = (str) => (str || '').toLowerCase().replace(/[^a-z0-9_]/g, '');
  
  const f = clean(firstName);
  const l = clean(lastName);
  
  const seeds = [];
  if (f && l) {
    seeds.push(`${f}_${l}`.slice(0, 40));
    seeds.push(`${f}${l}`.slice(0, 40));
    seeds.push(`${l}_${f}`.slice(0, 40));
  } else {
    const base = f || l || `user${Date.now().toString().slice(-6)}`;
    seeds.push(base);
  }
  
  const suggestions = [];
  
  // 1. Try the direct combinations
  for (const seed of seeds) {
    if (suggestions.length >= 3) break;
    if (!suggestions.includes(seed) && !(await isTaken(seed))) {
      suggestions.push(seed);
    }
  }
  
  // 2. Add random numbers to the primary seed if we still need more
  const primarySeed = seeds[0];
  while (suggestions.length < 3) {
    const randomNum = Math.floor(Math.random() * 9000) + 100; 
    const candidate = `${primarySeed}${randomNum}`.slice(0, 50);
    if (!suggestions.includes(candidate) && !(await isTaken(candidate))) {
      suggestions.push(candidate);
    }
  }

  return suggestions;
}

module.exports = {
  isUsernameTaken,
  suggestUsernames,
};
