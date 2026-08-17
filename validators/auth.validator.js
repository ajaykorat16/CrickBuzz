/**
 * =============================================================================
 * Auth Validators
 * =============================================================================
 * express-validator rule chains for auth routes.
 * Always pair with the `validate` middleware in the route definition.
 * =============================================================================
 */

const { body, query } = require('express-validator');

/** Shared mobile number rule (E.164-style) */
const mobileRule = body('mobile')
  .trim()
  .notEmpty()
  .withMessage('mobile is required')
  .matches(/^\+?[1-9]\d{7,14}$/)
  .withMessage('mobile must be a valid E.164-style number (e.g. +919876543210)');

/** POST /api/auth/send-otp */
const sendOtp = [
  mobileRule,
  body('recaptcha_token')
    .optional({ values: 'falsy' })
    .trim()
    .isString()
    .withMessage('recaptcha_token must be a string'),
];

/** POST /api/auth/verify-otp */
const verifyOtp = [
  mobileRule,
  body('otp')
    .trim()
    .notEmpty()
    .withMessage('otp is required')
    .isLength({ min: 4, max: 8 })
    .withMessage('otp must be 4–8 characters')
    .matches(/^\d+$/)
    .withMessage('otp must be numeric'),
];

/** POST /api/auth/complete-profile */
const completeProfile = [
  body('first_name')
    .trim()
    .notEmpty()
    .withMessage('first_name is required')
    .isLength({ min: 1, max: 100 })
    .withMessage('first_name must be at most 100 characters'),
  body('last_name')
    .trim()
    .notEmpty()
    .withMessage('last_name is required')
    .isLength({ min: 1, max: 100 })
    .withMessage('last_name must be at most 100 characters'),
  body('username')
    .trim()
    .notEmpty()
    .withMessage('username is required')
    .isLength({ min: 3, max: 50 })
    .withMessage('username must be 3–50 characters')
    .matches(/^[a-zA-Z0-9_]+$/)
    .withMessage('username may only contain letters, numbers, and underscores'),
  body('email')
    .optional({ values: 'falsy' })
    .trim()
    .isEmail()
    .withMessage('email must be valid')
    .isLength({ max: 255 })
    .withMessage('email must be at most 255 characters')
    .normalizeEmail(),
];

/** GET /api/auth/suggest-username */
const suggestUsername = [
  query('first_name')
    .trim()
    .notEmpty()
    .withMessage('first_name query param is required')
    .isLength({ max: 100 }),
  query('last_name')
    .optional({ values: 'falsy' })
    .trim()
    .isLength({ max: 100 }),
];

module.exports = {
  sendOtp,
  verifyOtp,
  completeProfile,
  suggestUsername,
};
