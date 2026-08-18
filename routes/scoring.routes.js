const express = require('express');

const scoringController = require('../controllers/scoring.controller');
const scoringValidator = require('../validators/scoring.validator');
const validate = require('../middleware/validate.middleware');
const { authenticate, requireAccessToken } = require('../middleware/auth.middleware');

const router = express.Router();

// Get live scoreboard (public or protected based on requirement, going with protected for consistency)
router.get(
  '/matches/:id/scoreboard',
  authenticate,
  requireAccessToken,
  scoringController.getLiveScoreboard
);

router.get(
  '/matches/:id/scorecard',
  authenticate,
  requireAccessToken,
  scoringController.getScorecard
);

// Start innings (Protected)
router.post(
  '/matches/:id/innings/start',
  authenticate,
  requireAccessToken,
  scoringValidator.startInnings,
  validate,
  scoringController.startInnings
);

// Record delivery (Protected)
router.post(
  '/innings/:id/deliveries',
  authenticate,
  requireAccessToken,
  scoringValidator.recordDelivery,
  validate,
  scoringController.recordDelivery
);

// Set next players after wicket/over (Protected)
router.put(
  '/innings/:id/players',
  authenticate,
  requireAccessToken,
  scoringValidator.setNextPlayers,
  validate,
  scoringController.setNextPlayers
);

module.exports = router;
