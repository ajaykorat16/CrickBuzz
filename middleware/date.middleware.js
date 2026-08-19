const moment = require('moment');

/**
 * Global Date Formatting Middleware
 * Intercepts res.json to format all Date objects and date strings into DD/MM/YYYY HH:mm:ss
 */
const dateFormattingMiddleware = (req, res, next) => {
  const originalJson = res.json;

  function formatDates(obj) {
    if (obj === null || obj === undefined) return obj;

    if (obj instanceof Date) {
      return moment(obj).format('DD/MM/YYYY HH:mm:ss');
    }

    if (Array.isArray(obj)) {
      return obj.map(formatDates);
    }

    if (typeof obj === 'object') {
      const result = {};
      for (const key in obj) {
        if (obj[key] instanceof Date) {
          result[key] = moment(obj[key]).format('DD/MM/YYYY HH:mm:ss');
        } else if (typeof obj[key] === 'string' && (key.endsWith('_at') || key === 'scheduled_date' || key.endsWith('timestamp'))) {
          const d = moment(obj[key], moment.ISO_8601, true);
          if (d.isValid()) {
            result[key] = d.format('DD/MM/YYYY HH:mm:ss');
          } else {
            const fallback = moment(new Date(obj[key]));
            if (fallback.isValid() && obj[key].length > 8) {
              result[key] = fallback.format('DD/MM/YYYY HH:mm:ss');
            } else {
              result[key] = obj[key];
            }
          }
        } else if (typeof obj[key] === 'object') {
          result[key] = formatDates(obj[key]);
        } else {
          result[key] = obj[key];
        }
      }
      return result;
    }

    return obj;
  }

  res.json = function (body) {
    body = formatDates(body);
    return originalJson.call(this, body);
  };

  next();
};

module.exports = {
  dateFormattingMiddleware
};
