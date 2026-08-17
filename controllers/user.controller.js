const { db } = require('../config/database');
const { PUBLIC_USER_COLUMNS } = require('../helpers/user');
const { TryCatch } = require('../middleware/error.middleware');

/** GET /api/users — paginated, sortable, searchable list */
const listUsers = TryCatch(async (req, res) => {
  const page = req.query.page || 1;
  const limit = req.query.limit || 10;
  const sortBy = req.query.sort_by || 'created_at';
  const sortOrder = req.query.sort_order || 'desc';
  const search = req.query.search;

  if (!search || search.trim() === '') {
    return res.status(200).json({
      success: true,
      data: [],
      pagination: {
        page,
        limit,
        total: 0,
        total_pages: 0,
      },
    });
  }

  const offset = (page - 1) * limit;
  const order = String(sortOrder).toLowerCase() === 'asc' ? 'asc' : 'desc';

  const base = db('users');

  const term = `%${search}%`;
  base.where((builder) => {
    builder
      .where('username', 'like', term)
      .orWhere('mobile', 'like', term)
      .orWhere('email', 'like', term)
      .orWhere('first_name', 'like', term)
      .orWhere('last_name', 'like', term)
  });

  const countRow = await base.clone().count({ total: '*' }).first();
  const total = Number(countRow.total) || 0;

  const rows = await base
    .clone()
    .select(PUBLIC_USER_COLUMNS)
    .orderBy(sortBy, order)
    .limit(limit)
    .offset(offset);

  res.status(200).json({
    success: true,
    data: rows,
    pagination: {
      page,
      limit,
      total,
      total_pages: Math.ceil(total / limit) || 0,
    },
  });
});

module.exports = {
  listUsers,
};
