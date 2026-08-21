const express = require('express');

const playerController = require('../controllers/player.controller');
const { authenticate, requireAccessToken } = require('../middleware/auth.middleware');

const router = express.Router();

router.use(authenticate, requireAccessToken);

router.get(
  '/:playerId/matches/:matchId/performance',
  playerController.getPlayerMatchPerformance
);

router.get(
  '/:playerId/matches',
  playerController.getPlayerMatchHistory
);

router.get(
  '/:playerId/statistics',
  playerController.getPlayerCareerStatistics
);

module.exports = router;
