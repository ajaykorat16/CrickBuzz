const { body, param } = require('express-validator');

const startInnings = [
  param('id').isInt().withMessage('Invalid match ID').toInt(),
  body('batting_team_id').isInt().withMessage('batting_team_id is required').toInt(),
  body('bowling_team_id').isInt().withMessage('bowling_team_id is required').toInt(),
  body('striker_id').isInt().withMessage('striker_id is required').toInt(),
  body('non_striker_id').isInt().withMessage('non_striker_id is required').toInt(),
  body('bowler_id').isInt().withMessage('bowler_id is required').toInt(),
  body('toss_winner_team_id').optional({ nullable: true }).isInt().toInt(),
  body('toss_decision').optional({ nullable: true }).isIn(['BAT', 'BOWL']).withMessage('toss_decision must be BAT or BOWL'),
];

const recordDelivery = [
  param('id').isInt().withMessage('Invalid innings ID').toInt(),
  body('runs_off_bat').isInt({ min: 0 }).withMessage('runs_off_bat must be >= 0').toInt(),
  body('extra_type').optional({ nullable: true }).isIn(['WIDE', 'NO_BALL', 'BYE', 'LEG_BYE', 'PENALTY']),
  body('extra_runs').optional().isInt({ min: 0 }).toInt(),
  body('is_wicket').optional().isBoolean().toBoolean(),
  body('wicket_type').optional({ nullable: true }).isString(),
  body('dismissed_player_id').optional({ nullable: true }).isInt().toInt(),
  body('is_boundary').optional().isBoolean().toBoolean(),
  body('is_four').optional().isBoolean().toBoolean(),
  body('is_six').optional().isBoolean().toBoolean(),
];

const setNextPlayers = [
  param('id').isInt().withMessage('Invalid innings ID').toInt(),
  body('striker_id').optional({ nullable: true }).isInt().toInt(),
  body('non_striker_id').optional({ nullable: true }).isInt().toInt(),
  body('bowler_id').optional({ nullable: true }).isInt().toInt(),
];

module.exports = {
  startInnings,
  recordDelivery,
  setNextPlayers
};
