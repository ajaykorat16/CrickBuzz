const express = require('express');

const scoringController = require('../controllers/scoring.controller');
const scoringValidator = require('../validators/scoring.validator');
const validate = require('../middleware/validate.middleware');
const { authenticate, requireAccessToken, requireMatchAdmin, requireMatchViewer } = require('../middleware/auth.middleware');

const router = express.Router();

// Get live scoreboard (public or protected based on requirement, going with protected for consistency)
router.get(
  '/matches/:id/scoreboard',
  authenticate,
  requireAccessToken,
  requireMatchViewer,
  scoringController.getLiveScoreboard
);

router.get(
  '/matches/:id/scorecard',
  authenticate,
  requireAccessToken,
  requireMatchViewer,
  scoringController.getScorecard
);

// Start innings (Protected)
router.post(
  '/matches/:id/innings/start',
  authenticate,
  requireAccessToken,
  requireMatchAdmin('match'),
  scoringValidator.startInnings,
  validate,
  scoringController.startInnings
);

// Record delivery (Protected)
router.post(
  '/innings/:id/deliveries',
  authenticate,
  requireAccessToken,
  requireMatchAdmin('innings'),
  scoringValidator.recordDelivery,
  validate,
  scoringController.recordDelivery
);

// Set next players after wicket/over (Protected)
router.put(
  '/innings/:id/players',
  authenticate,
  requireAccessToken,
  requireMatchAdmin('innings'),
  scoringValidator.setNextPlayers,
  validate,
  scoringController.setNextPlayers
);

// Undo last delivery (Protected)
router.delete(
  '/innings/:id/deliveries/last',
  authenticate,
  requireAccessToken,
  requireMatchAdmin('innings'),
  scoringValidator.undoDelivery,
  validate,
  scoringController.undoLastDelivery
);

module.exports = router;
