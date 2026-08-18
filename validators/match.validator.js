const { body, param } = require('express-validator');

const createMatch = [
  body('team_a_id').isInt().withMessage('Team A ID is required').toInt(),
  body('team_b_id').isInt().withMessage('Team B ID is required').toInt(),
  body('match_type').trim().notEmpty().withMessage('Match type is required').isIn(['T20', 'ODI', 'TEST', 'CUSTOM']).withMessage('Invalid match type'),
  body('overs').optional({ checkFalsy: true }).isFloat({ min: 1 }).withMessage('Overs must be a positive number').toFloat(),
  body('venue').optional({ checkFalsy: true }).trim().isLength({ max: 255 }),
  body('city').optional({ checkFalsy: true }).trim().isLength({ max: 100 }),
  body('scheduled_date').optional({ checkFalsy: true }).isISO8601().withMessage('Invalid scheduled date'),
  body('scheduled_time').optional({ checkFalsy: true }).matches(/^([01]\d|2[0-3]):?([0-5]\d)(:?([0-5]\d))?$/).withMessage('Invalid scheduled time (HH:MM:SS)'),
];

const updateMatch = [
  param('id').isInt().withMessage('Invalid match ID').toInt(),
  body('status').optional().isIn(['SCHEDULED', 'LIVE', 'COMPLETED', 'CANCELLED', 'ABANDONED']).withMessage('Invalid match status'),
  body('toss_winner_team_id').optional({ checkFalsy: true }).isInt().withMessage('Invalid toss winner ID').toInt(),
  body('toss_decision').optional({ checkFalsy: true }).isIn(['BAT', 'BOWL']).withMessage('Invalid toss decision'),
  body('winner_team_id').optional({ checkFalsy: true }).isInt().withMessage('Invalid winner ID').toInt(),
  body('result_type').optional({ checkFalsy: true }).isIn(['TEAM_A_WIN', 'TEAM_B_WIN', 'TIE', 'NO_RESULT', 'ABANDONED']).withMessage('Invalid result type'),
  body('result_description').optional({ checkFalsy: true }).trim().isLength({ max: 255 }),
  body('overs').optional({ checkFalsy: true }).isFloat({ min: 1 }).toFloat(),
  body('venue').optional({ checkFalsy: true }).trim().isLength({ max: 255 }),
  body('city').optional({ checkFalsy: true }).trim().isLength({ max: 100 }),
  body('scheduled_date').optional({ checkFalsy: true }).isISO8601(),
  body('scheduled_time').optional({ checkFalsy: true }).matches(/^([01]\d|2[0-3]):?([0-5]\d)(:?([0-5]\d))?$/),
];

module.exports = {
  createMatch,
  updateMatch,
  addScorer: [
    param('id').isInt().withMessage('Invalid match ID').toInt(),
    body('user_id').isInt().withMessage('User ID is required').toInt()
  ],
  removeScorer: [
    param('id').isInt().withMessage('Invalid match ID').toInt(),
    body('user_id').isInt().withMessage('User ID is required').toInt()
  ]
};
