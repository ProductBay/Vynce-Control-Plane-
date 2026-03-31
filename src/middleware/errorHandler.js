const { AppError } = require('../utils/appError');

const errorHandler = (error, req, res, next) => {
  if (res.headersSent) {
    return next(error);
  }

  const statusCode = error instanceof AppError ? error.statusCode : 500;
  const message = error instanceof AppError ? error.message : 'Internal server error';

  if (!(error instanceof AppError)) {
    console.error(error);
  }

  res.status(statusCode).json({
    success: false,
    error: {
      message,
      details: error instanceof AppError ? error.details : null
    }
  });
};

module.exports = { errorHandler };
