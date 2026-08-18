/**
 * =============================================================================
 * API Router
 * =============================================================================
 * Aggregates all feature routers under /api.
 * =============================================================================
 */

const express = require('express');

const authRoutes = require('./auth.routes');
const userRoutes = require('./user.routes');
const teamRoutes = require('./team.routes');
const matchRoutes = require('./match.routes');
const scoringRoutes = require('./scoring.routes');

const router = express.Router();

/** Simple health check — useful for load balancers / uptime monitors */
router.get(
  '/health',
  (req, res) => {
    res.json({ success: true, message: 'OK' });
  }
);

router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/teams', teamRoutes);
router.use('/matches', matchRoutes);
router.use('/', scoringRoutes);

module.exports = router;
