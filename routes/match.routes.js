const express = require('express');

const matchController = require('../controllers/match.controller');
const matchValidator = require('../validators/match.validator');
const validate = require('../middleware/validate.middleware');
const { authenticate, requireAccessToken } = require('../middleware/auth.middleware');

const router = express.Router();

router.use(authenticate, requireAccessToken);

router.post(
  '/',
  matchValidator.createMatch,
  validate,
  matchController.createMatch
);

router.get(
  '/',
  matchController.getMatches
);

router.get(
  '/:id',
  matchController.getMatch
);

router.put(
  '/:id',
  matchValidator.updateMatch,
  validate,
  matchController.updateMatch
);

router.delete(
  '/:id',
  matchController.deleteMatch
);

router.post(
  '/:id/scorers',
  matchValidator.addScorer,
  validate,
  matchController.addScorer
);

router.get(
  '/:id/scorers',
  matchController.getScorers
);

router.delete(
  '/:id/scorers',
  matchValidator.removeScorer,
  validate,
  matchController.removeScorer
);

module.exports = router;
