const express = require('express');
const { z } = require('zod');
const { adminAuth } = require('../middleware/adminAuth');
const { validate } = require('../middleware/validate');
const { asyncHandler } = require('../utils/asyncHandler');
const controller = require('../controllers/adminController');

const router = express.Router();

const actorSchema = {
  performedBy: z.string().min(1),
  reason: z.string().min(1),
  metadata: z.record(z.any()).optional()
};

router.use(adminAuth);

router.get(
  '/tenant-license',
  validate({
    query: z.object({
      tenantId: z.string().min(1)
    })
  }),
  asyncHandler(controller.getTenantLicense)
);

router.post(
  '/licenses/issue',
  validate({
    body: z.object({
      tenantId: z.string().min(1),
      plan: z.string().min(1),
      maxActivations: z.number().int().positive(),
      includedUsers: z.number().int().positive(),
      extraSeats: z.number().int().nonnegative().optional(),
      additionalSeatPrice: z.number().nonnegative().optional(),
      expiresAt: z.string().datetime().optional(),
      status: z.enum(['inactive', 'active', 'suspended', 'revoked']).optional(),
      ...actorSchema
    })
  }),
  asyncHandler(controller.issueLicense)
);

router.post(
  '/licenses/revoke',
  validate({
    body: z.object({
      tenantId: z.string().min(1),
      ...actorSchema
    })
  }),
  asyncHandler(controller.revokeLicense)
);

router.post(
  '/licenses/reset',
  validate({
    body: z.object({
      tenantId: z.string().min(1),
      ...actorSchema
    })
  }),
  asyncHandler(controller.resetLicense)
);

router.post(
  '/activations/revoke',
  validate({
    body: z.object({
      activationId: z.string().uuid(),
      ...actorSchema
    })
  }),
  asyncHandler(controller.revokeActivation)
);

router.post(
  '/activations/reset',
  validate({
    body: z.object({
      activationId: z.string().uuid(),
      ...actorSchema
    })
  }),
  asyncHandler(controller.resetActivation)
);

router.post(
  '/seats/grant',
  validate({
    body: z.object({
      tenantId: z.string().min(1),
      extraSeats: z.number().int().positive(),
      includedUsers: z.number().int().positive().optional(),
      additionalSeatPrice: z.number().nonnegative().optional(),
      ...actorSchema
    })
  }),
  asyncHandler(controller.grantSeats)
);

module.exports = { adminRoutes: router };
