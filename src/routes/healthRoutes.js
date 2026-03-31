const express = require('express');
const { asyncHandler } = require('../utils/asyncHandler');
const { health, ready } = require('../controllers/healthController');

const router = express.Router();

router.get('/health', health);
router.get('/ready', asyncHandler(ready));

module.exports = { healthRoutes: router };
