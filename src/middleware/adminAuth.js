const crypto = require('crypto');
const { env } = require('../config/env');
const { AppError } = require('../utils/appError');

const safeEqual = (left, right) => {
  const leftBuffer = Buffer.from(String(left || ''), 'utf8');
  const rightBuffer = Buffer.from(String(right || ''), 'utf8');

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
};

const adminAuth = (req, res, next) => {
  const provided = req.header('x-admin-secret');
  if (!provided || !safeEqual(provided, env.ADMIN_API_SECRET)) {
    return next(new AppError(401, 'Unauthorized admin request'));
  }

  return next();
};

module.exports = { adminAuth };
