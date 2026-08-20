const express = require('express');

const matchController = require('../controllers/match.controller');
const matchValidator = require('../validators/match.validator');
const validate = require('../middleware/validate.middleware');
const { authenticate, requireAccessToken, requireMatchViewer } = require('../middleware/auth.middleware');

const router = express.Router();

router.use(authenticate, requireAccessToken);

// ==========================================
// MATCH MANAGEMENT (CRUD)
// ==========================================

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
  requireMatchViewer,
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

// ==========================================
// MATCH ADMINS (Update Permissions)
// ==========================================

router.post(
  '/:id/admins',
  matchValidator.addMatchAdmin,
  validate,
  matchController.addMatchAdmin
);

router.get(
  '/:id/admins',
  requireMatchViewer,
  matchController.getMatchAdmins
);

router.delete(
  '/:id/admins',
  matchValidator.removeMatchAdmin,
  validate,
  matchController.removeMatchAdmin
);

// ==========================================
// MATCH VIEWERS (View-Only Permissions)
// ==========================================

router.post(
  '/:id/viewers',
  matchValidator.addViewer,
  validate,
  matchController.addViewer
);

router.get(
  '/:id/viewers',
  requireMatchViewer,
  matchController.getViewers
);

router.delete(
  '/:id/viewers',
  matchValidator.removeViewer,
  validate,
  matchController.removeViewer
);

module.exports = router;
