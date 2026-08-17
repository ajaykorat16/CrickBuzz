const express = require('express');

const authController = require('../controllers/auth.controller');
const authValidator = require('../validators/auth.validator');
const validate = require('../middleware/validate.middleware');
const { authenticate, requireProfileToken } = require('../middleware/auth.middleware');

const router = express.Router();

router.post(
  '/send-otp',
  authValidator.sendOtp,
  validate,
  authController.sendOtp
);

router.post(
  '/verify-otp',
  authValidator.verifyOtp,
  validate,
  authController.verifyOtp
);

router.post(
  '/complete-profile',
  authenticate,
  requireProfileToken,
  authValidator.completeProfile,
  validate,
  authController.completeProfile
);

router.get(
  '/suggest-username',
  authValidator.suggestUsername,
  validate,
  authController.suggestUsername
);

module.exports = router;
