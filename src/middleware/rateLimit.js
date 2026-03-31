const { env } = require('../config/env');

const windows = new Map();

const rateLimit = ({ windowMs, maxRequests, keyFn }) => {
  const safeWindowMs = Number(windowMs);
  const safeMaxRequests = Number(maxRequests);

  return (req, res, next) => {
    const key = keyFn(req);
    if (!key) {
      return next();
    }

    const now = Date.now();
    const current = windows.get(key);

    if (!current || now >= current.resetAt) {
      windows.set(key, {
        count: 1,
        resetAt: now + safeWindowMs
      });
      return next();
    }

    if (current.count >= safeMaxRequests) {
      const retryAfterSeconds = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
      res.setHeader('Retry-After', String(retryAfterSeconds));
      return res.status(429).json({
        success: false,
        error: {
          message: 'Too many requests',
          details: {
            code: 'rate_limited',
            retryAfterSeconds
          }
        }
      });
    }

    current.count += 1;
    return next();
  };
};

const apiRateLimit = rateLimit({
  windowMs: env.API_RATE_LIMIT_WINDOW_MS,
  maxRequests: env.API_RATE_LIMIT_MAX_REQUESTS,
  keyFn: (req) => `${req.ip}:${req.baseUrl || req.path}`
});

module.exports = { rateLimit, apiRateLimit };
