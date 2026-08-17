const { body, param } = require('express-validator');

const createTeam = [
  body('name').trim().notEmpty().withMessage('Team name is required').isLength({ max: 255 }).withMessage('Team name must be at most 255 characters'),
  body('short_name').optional().trim().isLength({ max: 50 }).withMessage('Short name must be at most 50 characters'),
  body('logo').optional().trim().isLength({ max: 255 }),
  body('city').optional().trim().isLength({ max: 100 }),
  body('description').optional().trim(),
];

const updateTeam = [
  param('id').isInt().withMessage('Invalid team ID').toInt(),
  body('name').optional().trim().notEmpty().withMessage('Team name cannot be empty').isLength({ max: 255 }),
  body('short_name').optional().trim().isLength({ max: 50 }),
  body('logo').optional().trim().isLength({ max: 255 }),
  body('city').optional().trim().isLength({ max: 100 }),
  body('description').optional().trim(),
  body('is_active').optional().isBoolean().withMessage('is_active must be a boolean').toBoolean(),
];

const addPlayer = [
  param('id').isInt().withMessage('Invalid team ID').toInt(),
  body('user_id').isInt().withMessage('user_id is required').toInt(),
  body('is_captain').optional().isBoolean().toBoolean(),
  body('is_vice_captain').optional().isBoolean().toBoolean(),
  body('playing_role').optional({ nullable: true }).isIn(['Batter', 'Bowler', 'All-Rounder', 'Wicket-Keeper']).withMessage('Invalid playing role'),
  body('jersey_number').optional().trim().isLength({ max: 20 }),
];

const updateTeamPlayer = [
  param('id').isInt().withMessage('Invalid team ID').toInt(),
  param('userId').isInt().withMessage('Invalid user ID').toInt(),
  body('is_captain').optional().isBoolean().toBoolean(),
  body('is_vice_captain').optional().isBoolean().toBoolean(),
  body('playing_role').optional({ nullable: true }).isIn(['Batter', 'Bowler', 'All-Rounder', 'Wicket-Keeper']).withMessage('Invalid playing role'),
  body('jersey_number').optional().trim().isLength({ max: 20 }),
  body('is_active').optional().isBoolean().toBoolean(),
];

module.exports = {
  createTeam,
  updateTeam,
  addPlayer,
  updateTeamPlayer,
};
