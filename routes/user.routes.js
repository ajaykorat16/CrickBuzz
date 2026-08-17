const express = require('express');
const userController = require('../controllers/user.controller');
const userValidator = require('../validators/user.validator');
const validate = require('../middleware/validate.middleware');
const {
  authenticate,
  requireAccessToken,
} = require('../middleware/auth.middleware');

const router = express.Router();

router.get(
  '/',
  authenticate,
  requireAccessToken,
  userValidator.listUsers,
  validate,
  userController.listUsers
);

module.exports = router;
