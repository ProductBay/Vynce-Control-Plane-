const activationModel = require('../models/activationModel');
const licenseModel = require('../models/licenseModel');
const seatEntitlementModel = require('../models/seatEntitlementModel');
const { withTransaction, query } = require('../db/query');
const { AppError } = require('../utils/appError');
const { canProvisionUser } = require('../utils/license');
const { writeAuditLog } = require('./auditService');
const { buildCommercialState, issueLicense } = require('./licenseService');

const getTenantLicense = async (tenantId) => {
  const license = await licenseModel.findByTenantId({ query }, tenantId);
  if (!license) {
    throw new AppError(404, 'Tenant license not found');
  }

  const activations = await activationModel.listByTenantId({ query }, tenantId);
  const state = await buildCommercialState({ query }, license, null);

  return {
    tenantId: license.tenant_id,
    licenseActive: state.licenseActive,
    commercialStatus: license.status,
    blockedReason: state.blockedReason,
    plan: license.plan,
    includedUsers: license.included_users,
    extraSeats: license.extra_seats,
    maxActivations: license.max_activations,
    activeActivations: activations.filter((item) => item.status === 'active').length,
    canProvisionUser: state.seatEntitlement.canProvisionUser,
    activations: activations.map((activation) => ({
      activationId: activation.id,
      installId: activation.install_id,
      deviceName: activation.device_name,
      activatedByEmail: activation.activated_by_email,
      activatedAt: activation.activated_at,
      lastSeenAt: activation.last_seen_at,
      revokedAt: activation.revoked_at,
      status: activation.status
    }))
  };
};

const revokeLicense = async (payload) =>
  withTransaction(async (db) => {
    const license = await licenseModel.findByTenantId(db, payload.tenantId);
    if (!license) {
      throw new AppError(404, 'Tenant license not found');
    }

    const updatedLicense = await licenseModel.updateStatus(db, license.id, 'revoked');
    await writeAuditLog(db, {
      tenantId: updatedLicense.tenant_id,
      licenseId: updatedLicense.id,
      action: 'admin_license_revoked',
      performedBy: payload.performedBy,
      reason: payload.reason,
      metadata: payload.metadata || {}
    });

    return buildCommercialState(db, updatedLicense, null);
  });

const resetLicenseActivations = async (payload) =>
  withTransaction(async (db) => {
    const license = await licenseModel.findByTenantId(db, payload.tenantId);
    if (!license) {
      throw new AppError(404, 'Tenant license not found');
    }

    const resetActivations = await activationModel.updateManyByTenant(db, payload.tenantId, 'replaced');
    const syncedLicense = await licenseModel.syncActivationCount(db, license.id);

    await writeAuditLog(db, {
      tenantId: syncedLicense.tenant_id,
      licenseId: syncedLicense.id,
      action: 'admin_license_activations_reset',
      performedBy: payload.performedBy,
      reason: payload.reason,
      metadata: {
        resetCount: resetActivations.length
      }
    });

    return buildCommercialState(db, syncedLicense, null);
  });

const revokeActivation = async (payload) =>
  withTransaction(async (db) => {
    const activation = await activationModel.findById(db, payload.activationId);
    if (!activation) {
      throw new AppError(404, 'Activation not found');
    }

    const updatedActivation = await activationModel.updateStatus(db, payload.activationId, 'revoked');
    const license = await licenseModel.syncActivationCount(db, activation.license_id);

    await writeAuditLog(db, {
      tenantId: activation.tenant_id,
      licenseId: activation.license_id,
      activationId: activation.id,
      action: 'admin_activation_revoked',
      performedBy: payload.performedBy,
      reason: payload.reason,
      metadata: payload.metadata || {}
    });

    return buildCommercialState(db, license, updatedActivation);
  });

const resetActivation = async (payload) =>
  withTransaction(async (db) => {
    const activation = await activationModel.findById(db, payload.activationId);
    if (!activation) {
      throw new AppError(404, 'Activation not found');
    }

    const updatedActivation = await activationModel.updateStatus(db, payload.activationId, 'replaced');
    const license = await licenseModel.syncActivationCount(db, activation.license_id);

    await writeAuditLog(db, {
      tenantId: activation.tenant_id,
      licenseId: activation.license_id,
      activationId: activation.id,
      action: 'admin_activation_reset',
      performedBy: payload.performedBy,
      reason: payload.reason,
      metadata: payload.metadata || {}
    });

    return buildCommercialState(db, license, updatedActivation);
  });

const grantSeats = async (payload) =>
  withTransaction(async (db) => {
    const license = await licenseModel.findByTenantId(db, payload.tenantId);
    if (!license) {
      throw new AppError(404, 'Tenant license not found');
    }

    const nextExtraSeats = license.extra_seats + payload.extraSeats;
    const nextIncludedUsers = payload.includedUsers ?? license.included_users;
    const updatedLicense = await licenseModel.updateSeatValues(db, payload.tenantId, nextExtraSeats, nextIncludedUsers);

    const entitlement = await seatEntitlementModel.upsert(db, {
      tenantId: updatedLicense.tenant_id,
      plan: updatedLicense.plan,
      includedUsers: nextIncludedUsers,
      extraSeats: updatedLicense.extra_seats,
      additionalSeatPrice: payload.additionalSeatPrice ?? 0,
      canProvisionUser: canProvisionUser({
        includedUsers: nextIncludedUsers,
        extraSeats: updatedLicense.extra_seats
      })
    });

    await writeAuditLog(db, {
      tenantId: updatedLicense.tenant_id,
      licenseId: updatedLicense.id,
      action: 'admin_seats_granted',
      performedBy: payload.performedBy,
      reason: payload.reason,
      metadata: {
        grantedExtraSeats: payload.extraSeats,
        totalExtraSeats: updatedLicense.extra_seats,
        additionalSeatPrice: entitlement.additional_seat_price
      }
    });

    return buildCommercialState(db, updatedLicense, null);
  });

module.exports = {
  getTenantLicense,
  issueLicense,
  revokeLicense,
  resetLicenseActivations,
  revokeActivation,
  resetActivation,
  grantSeats
};
