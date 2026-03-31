const { AppError } = require('../utils/appError');

const validate = ({ body, query }) => (req, res, next) => {
  if (body) {
    const result = body.safeParse(req.body);
    if (!result.success) {
      return next(new AppError(400, 'Invalid request body', result.error.flatten()));
    }
    req.body = result.data;
  }

  if (query) {
    const result = query.safeParse(req.query);
    if (!result.success) {
      return next(new AppError(400, 'Invalid query parameters', result.error.flatten()));
    }
    req.query = result.data;
  }

  return next();
};

module.exports = { validate };
