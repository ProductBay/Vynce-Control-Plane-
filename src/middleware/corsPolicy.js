const { env } = require('../config/env');

const normalizeOrigin = (origin) => String(origin || '').trim().toLowerCase();

const parseAllowedOrigins = (value) => {
  const raw = String(value || '').trim();
  if (!raw || raw === '*') {
    return { allowAny: true, set: new Set() };
  }

  const set = new Set(
    raw
      .split(',')
      .map((item) => normalizeOrigin(item))
      .filter(Boolean)
  );

  return { allowAny: false, set };
};

const corsConfig = parseAllowedOrigins(env.CORS_ALLOWED_ORIGINS);

const corsPolicy = (req, res, next) => {
  const requestOrigin = req.header('origin');

  if (!requestOrigin) {
    return next();
  }

  const normalizedOrigin = normalizeOrigin(requestOrigin);
  const isAllowed = corsConfig.allowAny || corsConfig.set.has(normalizedOrigin);

  if (isAllowed) {
    res.setHeader('Access-Control-Allow-Origin', requestOrigin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-admin-secret');
  }

  if (req.method === 'OPTIONS') {
    return res.sendStatus(isAllowed ? 204 : 403);
  }

  return next();
};

module.exports = { corsPolicy };
