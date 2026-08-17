const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const config = {
  env: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT) || 3000,

  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'crickbuzz',
  },

  jwt: {
    secret: process.env.JWT_SECRET || 'dev_secret_change_me',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    profileExpiresIn: process.env.JWT_PROFILE_EXPIRES_IN || '15m',
  },

  otp: {
    // When true, OTP is logged/returned as dev_otp instead of sending SMS
    devMode: process.env.OTP_DEV_MODE === 'true',
    expiryMinutes: Number(process.env.OTP_EXPIRY_MINUTES) || 5,
  },
};

module.exports = config;
