const express = require('express');

const teamController = require('../controllers/team.controller');
const teamValidator = require('../validators/team.validator');
const validate = require('../middleware/validate.middleware');
const { authenticate, requireAccessToken } = require('../middleware/auth.middleware');
const upload = require('../middleware/upload.middleware');

const router = express.Router();

router.use(authenticate, requireAccessToken);

// Team endpoints
router.post(
  '/',
  upload.single('logo'),
  teamValidator.createTeam,
  validate,
  teamController.createTeam
);

router.get(
  '/',
  teamController.getTeams
);

router.get(
  '/:id',
  teamController.getTeam
);

router.put(
  '/:id',
  upload.single('logo'),
  teamValidator.updateTeam,
  validate,
  teamController.updateTeam
);

router.delete(
  '/:id',
  teamController.deleteTeam
);

// Team Players endpoints
router.post(
  '/:id/players',
  teamValidator.addPlayer,
  validate,
  teamController.addPlayer
);

router.get(
  '/:id/players',
  teamController.getTeamPlayers
);

router.put(
  '/:id/players/:userId',
  teamValidator.updateTeamPlayer,
  validate,
  teamController.updateTeamPlayer
);

router.delete(
  '/:id/players/:userId',
  teamController.removeTeamPlayer
);

module.exports = router;
