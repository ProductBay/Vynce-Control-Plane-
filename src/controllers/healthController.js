const { pool } = require('../db/pool');

const health = (req, res) => {
  res.json({
    success: true,
    data: {
      service: 'Vynce Control Plane',
      status: 'ok',
      timestamp: new Date().toISOString()
    }
  });
};

const ready = async (req, res, next) => {
  try {
    await pool.query('SELECT 1');
    res.json({
      success: true,
      data: {
        status: 'ready',
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { health, ready };
