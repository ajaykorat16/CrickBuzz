const bcrypt = require('bcrypt');
const moment = require('moment');
const { db } = require('../config/database');
const config = require('../config');
const { signAccessToken, signProfileToken } = require('../helpers/jwt');
const { normalizeMobile } = require('../helpers/mobile');
const { generateOtp } = require('../helpers/otp');
const { toPublicUser } = require('../helpers/user');
const { isUsernameTaken, suggestUsernames: buildUsernames } = require('../helpers/username');
const smsService = require('../services/sms.service');
const { TryCatch, ErrorHandler } = require('../middleware/error.middleware');

/**
 * POST /api/auth/send-otp
 * Generates OTP locally and stores in DB. SMS sending is currently paused.
 */
const sendOtp = TryCatch(async (req, res) => {
  const phone = normalizeMobile(req.body.mobile);
  const expiresAt = new Date(Date.now() + config.otp.expiryMinutes * 60 * 1000);

  await db('otp_sessions').where({ mobile: phone, is_verified: false }).del();

  const otp = generateOtp();
  const otpHash = await bcrypt.hash(otp, 10);

  await db('otp_sessions').insert({
    mobile: phone,
    otp_hash: otpHash,
    expires_at: expiresAt,
    is_verified: false,
  });

  // Call the SMS service (currently abstracted/paused)
  await smsService.sendOtpSms(phone, otp);

  let devOtp = null;
  if (config.otp.devMode) {
    devOtp = otp;
    console.log(`[OTP_DEV] ${phone} → ${otp}`);
  }

  const result = {
    mobile: phone,
    expires_at: moment(expiresAt).format('DD/MM/YYYY HH:mm'),
    message: 'OTP generated and stored successfully',
  };

  if (devOtp) {
    result.dev_otp = devOtp;
  }

  res.status(200).json({ success: true, data: result });
});

/**
 * POST /api/auth/verify-otp
 * Returns an access token if the profile is complete, otherwise a profile_token.
 */
const verifyOtp = TryCatch(async (req, res) => {
  const phone = normalizeMobile(req.body.mobile);
  const otp = req.body.otp;

  const session = await db('otp_sessions')
    .where({ mobile: phone, is_verified: false })
    .orderBy('id', 'desc')
    .first();

  if (!session) {
    throw new ErrorHandler('No OTP session found. Request a new OTP.', 400);
  }

  if (new Date(session.expires_at) < new Date()) {
    throw new ErrorHandler('OTP has expired. Request a new OTP.', 400);
  }

  const valid = session.otp_hash
    ? await bcrypt.compare(otp, session.otp_hash)
    : false;

  if (!valid) {
    throw new ErrorHandler('Invalid OTP', 400);
  }

  await db('otp_sessions').where({ id: session.id }).update({ is_verified: true });

  let user = await db('users').where({ mobile: phone }).first();

  if (!user) {
    const [id] = await db('users').insert({
      mobile: phone,
      is_profile_complete: false,
    });
    user = await db('users').where({ id }).first();
  }

  if (user.is_profile_complete) {
    const token = signAccessToken({ sub: user.id });
    return res.status(200).json({
      success: true,
      data: {
        is_new_user: false,
        profile_complete: true,
        token,
        token_type: 'Bearer',
        user: toPublicUser(user),
      },
    });
  }

  const profileToken = signProfileToken({ sub: user.id });
  return res.status(200).json({
    success: true,
    data: {
      is_new_user: !user.first_name,
      profile_complete: false,
      profile_token: profileToken,
      token_type: 'Bearer',
      message: 'OTP verified. Complete your profile to finish signup.',
      user: toPublicUser(user),
    },
  });
});

/**
 * POST /api/auth/complete-profile
 * Requires profile_token. Auto-generates username when omitted.
 */
const completeProfile = TryCatch(async (req, res) => {
  const user = req.user;

  if (user.is_profile_complete) {
    return res.status(400).json({ error: true, message: 'Profile is already complete' });
  }

  const { first_name, last_name, email, username } = req.body;

  const existingUsername = await db('users').where({ username }).first();
  if (existingUsername && existingUsername.id !== user.id) {
    throw new ErrorHandler('Username is already taken', 409);
  }

  if (email) {
    const existingEmail = await db('users').where({ email }).first();
    if (existingEmail && existingEmail.id !== user.id) {
      throw new ErrorHandler('Email is already in use', 409);
    }
  }

  await db('users')
    .where({ id: user.id })
    .update({
      first_name,
      last_name,
      username,
      email: email || null,
      is_profile_complete: true,
      updated_at: db.fn.now(),
    });

  const updated = await db('users').where({ id: user.id }).first();
  const token = signAccessToken({ sub: updated.id });

  const data = {
    is_new_user: true,
    profile_complete: true,
    token,
    token_type: 'Bearer',
    user: toPublicUser(updated),
  };



  res.status(200).json({ success: true, data });
});

/** GET /api/auth/suggest-username */
const suggestUsername = TryCatch(async (req, res) => {
  const usernames = await buildUsernames(
    req.query.first_name,
    req.query.last_name || '',
    isUsernameTaken
  );
  res.status(200).json({ success: true, data: { usernames } });
});

module.exports = {
  sendOtp,
  verifyOtp,
  completeProfile,
  suggestUsername,
};
