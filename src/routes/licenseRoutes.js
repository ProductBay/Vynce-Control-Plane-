const express = require('express');
const { z } = require('zod');
const { validate } = require('../middleware/validate');
const { asyncHandler } = require('../utils/asyncHandler');
const controller = require('../controllers/licenseController');

const router = express.Router();

const activationIdentitySchema = z.object({
  activationToken: z.string().min(1).optional(),
  activationId: z.string().uuid().optional(),
  installId: z.string().min(1).optional(),
  deviceFingerprint: z.string().min(1).optional()
});

const activateSchema = z.object({
  licenseKey: z.string().min(8),
  companyName: z.string().min(1),
  adminFirstName: z.string().min(1),
  adminLastName: z.string().min(1),
  adminEmail: z.string().email(),
  installId: z.string().uuid(),
  deviceFingerprint: z.string().min(10),
  deviceName: z.string().min(1).max(255)
});

const restoreSchema = z.object({
  activationId: z.string().uuid(),
  installId: z.string().min(1),
  deviceFingerprint: z.string().min(10),
  adminEmail: z.string().email().optional()
});

const deactivateSchema = activationIdentitySchema.extend({
  performedBy: z.string().min(1).optional(),
  reason: z.string().min(1).optional()
});

router.post('/activate', validate({ body: activateSchema }), asyncHandler(controller.activate));
router.post('/restore', validate({ body: restoreSchema }), asyncHandler(controller.restore));
router.post('/heartbeat', validate({ body: activationIdentitySchema }), asyncHandler(controller.heartbeat));
router.post('/deactivate', validate({ body: deactivateSchema }), asyncHandler(controller.deactivate));
router.get('/status', validate({ query: activationIdentitySchema }), asyncHandler(controller.status));

module.exports = { licenseRoutes: router };
