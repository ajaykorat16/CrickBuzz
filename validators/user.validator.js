/**
 * =============================================================================
 * User Validators
 * =============================================================================
 * express-validator rule chains for user routes.
 * Always pair with the `validate` middleware in the route definition.
 * =============================================================================
 */

const { query } = require('express-validator');

/** GET /api/users — pagination, sorting, search */
const listUsers = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('page must be an integer >= 1')
    .toInt(),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('limit must be an integer between 1 and 100')
    .toInt(),
  query('sort_by')
    .optional()
    .isIn([
      'id',
      'first_name',
      'last_name',
      'username',
      'mobile',
      'email',
      'created_at',
      'updated_at',
    ])
    .withMessage('invalid sort_by column'),
  query('sort_order')
    .optional()
    .isIn(['asc', 'desc', 'ASC', 'DESC'])
    .withMessage('sort_order must be asc or desc'),
  query('search')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('search must be at most 100 characters'),
];

module.exports = {
  listUsers,
};
