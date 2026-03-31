const crypto = require('crypto');
const licenseModel = require('../models/licenseModel');
const activationModel = require('../models/activationModel');
const activationEventModel = require('../models/activationEventModel');
const seatEntitlementModel = require('../models/seatEntitlementModel');
const { withTransaction, query } = require('../db/query');
const { env } = require('../config/env');
const { hashLicenseKey, hashDeviceFingerprint, normalizeLicenseKey, generateLicenseKey } = require('../utils/hash');
const { AppError } = require('../utils/appError');
const { isExpired, canProvisionUser } = require('../utils/license');
const { writeAuditLog } = require('./auditService');
const { signActivationToken, signStatusToken, verifyActivationToken } = require('./tokenService');

const ACTIVATE_EVENT_TYPE = 'activate_attempt';
const ACTIVATE_IP_WINDOW_SECONDS = env.ACTIVATE_IP_WINDOW_SECONDS;
const ACTIVATE_TENANT_WINDOW_SECONDS = env.ACTIVATE_TENANT_WINDOW_SECONDS;
const ACTIVATE_IP_MAX_ATTEMPTS = env.ACTIVATE_IP_MAX_ATTEMPTS;
const ACTIVATE_TENANT_MAX_ATTEMPTS = env.ACTIVATE_TENANT_MAX_ATTEMPTS;

const hashTelemetryValue = (value) => {
  const normalized = String(value || '').trim();
  if (!normalized) {
    return null;
  }

  return crypto.createHash('sha256').update(normalized).digest('hex');
};

const isHeartbeatStale = (activation, license) => {
  if (!activation || activation.status !== 'active') {
    return false;
  }

  const lastSeen = new Date(activation.last_seen_at).getTime();
  if (!Number.isFinite(lastSeen)) {
    return false;
  }

  const graceSeconds = Number(license.heartbeat_grace_seconds ?? 172800);
  if (!Number.isFinite(graceSeconds) || graceSeconds <= 0) {
    return false;
  }

  return Date.now() - lastSeen > graceSeconds * 1000;
};

const writeActivationEvent = async (db, payload) => {
  await activationEventModel.create(db, payload);
};

const enforceActivationVelocity = async (db, { tenantId, ipHash }) => {
  if (ipHash) {
    const recentByIp = await activationEventModel.countRecentByIpHash(
      db,
      ipHash,
      ACTIVATE_EVENT_TYPE,
      ACTIVATE_IP_WINDOW_SECONDS
    );

    if (recentByIp >= ACTIVATE_IP_MAX_ATTEMPTS) {
      throw new AppError(429, 'Activation rate limit exceeded for this device network', {
        code: 'activation_rate_limited_ip'
      });
    }
  }

  if (tenantId) {
    const recentByTenant = await activationEventModel.countRecentByTenant(
      db,
      tenantId,
      ACTIVATE_EVENT_TYPE,
      ACTIVATE_TENANT_WINDOW_SECONDS
    );

    if (recentByTenant >= ACTIVATE_TENANT_MAX_ATTEMPTS) {
      throw new AppError(429, 'Activation rate limit exceeded for this tenant', {
        code: 'activation_rate_limited_tenant'
      });
    }
  }
};

const enforceTokenDeviceBinding = ({ payload, activation }) => {
  if (payload.installId && payload.installId !== activation.install_id) {
    throw new AppError(401, 'Activation token device binding mismatch');
  }

  if (payload.deviceFingerprintHash && payload.deviceFingerprintHash !== activation.device_fingerprint_hash) {
    throw new AppError(401, 'Activation token device binding mismatch');
  }
};

const ensureRequestFingerprintMatches = ({ license, payload, activation }) => {
  if (!payload.activationToken || !license.require_device_binding) {
    return;
  }

  if (!payload.deviceFingerprint) {
    throw new AppError(400, 'deviceFingerprint is required when device binding is enabled');
  }

  const requestFingerprintHash = hashDeviceFingerprint(payload.deviceFingerprint);
  if (requestFingerprintHash !== activation.device_fingerprint_hash) {
    throw new AppError(401, 'Device fingerprint mismatch for activation token');
  }
};

const shouldRejectOneTimeActivation = ({ license, existingActivation }) => {
  return Boolean(!existingActivation && license.one_time_activation && license.lifetime_activation_count > 0);
};

const isIdempotentActivationReuse = (existingActivation) => Boolean(existingActivation);

const buildEntitlementState = async (db, license) => {
  const existing = await seatEntitlementModel.findByTenantId(db, license.tenant_id);
  if (existing) {
    return existing;
  }

  return seatEntitlementModel.upsert(db, {
    tenantId: license.tenant_id,
    plan: license.plan,
    includedUsers: license.included_users,
    extraSeats: license.extra_seats,
    additionalSeatPrice: 0,
    canProvisionUser: canProvisionUser({
      includedUsers: license.included_users,
      extraSeats: license.extra_seats
    })
  });
};

const buildCommercialState = async (db, license, activation) => {
  const entitlement = await buildEntitlementState(db, license);
  const activeActivations = await activationModel.countActiveByLicenseId(db, license.id);
  const heartbeatStale = isHeartbeatStale(activation, license);
  const blockedReason =
    license.status !== 'active'
      ? `license_${license.status}`
      : isExpired(license.expires_at)
        ? 'license_expired'
        : activation && activation.status !== 'active'
          ? `activation_${activation.status}`
          : heartbeatStale
            ? 'heartbeat_stale'
            : null;

  const normalized = {
    tenantId: license.tenant_id,
    licenseId: license.id,
    licenseActive: blockedReason === null,
    commercialStatus: license.status,
    blockedReason,
    plan: license.plan,
    includedUsers: license.included_users,
    extraSeats: license.extra_seats,
    maxActivations: license.max_activations,
    activeActivations,
    activationCount: license.activation_count,
    expiresAt: license.expires_at,
    seatEntitlement: {
      id: entitlement.id,
      plan: entitlement.plan,
      includedUsers: entitlement.included_users,
      extraSeats: entitlement.extra_seats,
      additionalSeatPrice: entitlement.additional_seat_price,
      canProvisionUser: entitlement.can_provision_user
    }
  };

  if (activation) {
    normalized.activation = {
      activationId: activation.id,
      installId: activation.install_id,
      deviceName: activation.device_name,
      status: activation.status,
      activatedAt: activation.activated_at,
      lastSeenAt: activation.last_seen_at,
      revokedAt: activation.revoked_at
    };
  }

  return normalized;
};

const createSignedStatusBundle = async (state) => {
  const statusToken = await signStatusToken({
    tenantId: state.tenantId,
    licenseId: state.licenseId,
    commercialStatus: state.commercialStatus,
    blockedReason: state.blockedReason,
    plan: state.plan,
    includedUsers: state.includedUsers,
    extraSeats: state.extraSeats,
    maxActivations: state.maxActivations,
    activeActivations: state.activeActivations,
    seatEntitlement: state.seatEntitlement,
    activation: state.activation || null
  });

  return {
    ...state,
    signedStatusToken: statusToken
  };
};

const resolveActivationFromRequest = async ({ db, activationToken, activationId, installId, deviceFingerprint }) => {
  if (activationToken) {
    const payload = await verifyActivationToken(activationToken);
    const activation = await activationModel.findById(db, payload.activationId || payload.sub);
    if (!activation) {
      throw new AppError(404, 'Activation not found');
    }

    enforceTokenDeviceBinding({ payload, activation });
    return activation;
  }

  if (!activationId || !installId || !deviceFingerprint) {
    throw new AppError(400, 'Activation token or activation identifiers are required');
  }

  const fingerprintHash = hashDeviceFingerprint(deviceFingerprint);
  const activation = await activationModel.findByRestoreFingerprint(db, activationId, installId, fingerprintHash);
  if (!activation) {
    throw new AppError(404, 'Activation not found');
  }
  return activation;
};

const issueLicense = async (payload) =>
  withTransaction(async (db) => {
    const existing = await licenseModel.findByTenantId(db, payload.tenantId);
    if (existing) {
      throw new AppError(409, 'Tenant already has a license');
    }

    const rawLicenseKey = generateLicenseKey();
    const createdLicense = await licenseModel.create(db, {
      tenantId: payload.tenantId,
      licenseKeyHash: hashLicenseKey(rawLicenseKey),
      plan: payload.plan,
      status: payload.status ?? 'active',
      maxActivations: payload.maxActivations,
      includedUsers: payload.includedUsers,
      extraSeats: payload.extraSeats ?? 0,
      expiresAt: payload.expiresAt
    });

    await seatEntitlementModel.upsert(db, {
      tenantId: createdLicense.tenant_id,
      plan: createdLicense.plan,
      includedUsers: createdLicense.included_users,
      extraSeats: createdLicense.extra_seats,
      additionalSeatPrice: payload.additionalSeatPrice ?? 0,
      canProvisionUser: canProvisionUser({
        includedUsers: createdLicense.included_users,
        extraSeats: createdLicense.extra_seats
      })
    });

    await writeAuditLog(db, {
      tenantId: createdLicense.tenant_id,
      licenseId: createdLicense.id,
      action: 'admin_license_issued',
      performedBy: payload.performedBy,
      reason: payload.reason,
      metadata: {
        plan: createdLicense.plan,
        maxActivations: createdLicense.max_activations,
        includedUsers: createdLicense.included_users,
        extraSeats: createdLicense.extra_seats,
        expiresAt: createdLicense.expires_at
      }
    });

    const commercialState = await buildCommercialState(db, createdLicense, null);
    return {
      licenseId: createdLicense.id,
      tenantId: createdLicense.tenant_id,
      licenseKey: rawLicenseKey,
      state: await createSignedStatusBundle(commercialState)
    };
  });

const activateLicense = async (payload) =>
  withTransaction(async (db) => {
    const licenseKeyHash = hashLicenseKey(payload.licenseKey);
    const ipHash = hashTelemetryValue(payload.requestMeta?.ip);
    const userAgentHash = hashTelemetryValue(payload.requestMeta?.userAgent);

    await enforceActivationVelocity(db, { ipHash });
    const license = await licenseModel.findByLicenseKeyHashForUpdate(db, licenseKeyHash);

    await writeActivationEvent(db, {
      tenantId: license?.tenant_id || null,
      activationId: null,
      eventType: ACTIVATE_EVENT_TYPE,
      ipHash,
      userAgentHash
    });

    if (!license) {
      throw new AppError(404, 'License key not found');
    }

    await enforceActivationVelocity(db, { tenantId: license.tenant_id, ipHash });

    if (license.status !== 'active') {
      throw new AppError(403, `License is ${license.status}`);
    }

    if (isExpired(license.expires_at)) {
      throw new AppError(403, 'License is expired');
    }

    const deviceFingerprintHash = hashDeviceFingerprint(payload.deviceFingerprint);
    const existingActivation = await activationModel.findActiveByLicenseInstallFingerprint(
      db,
      license.id,
      payload.installId,
      deviceFingerprintHash
    );

    let activation = existingActivation;
    const activeCount = await activationModel.countActiveByLicenseId(db, license.id);

    if (!activation && activeCount >= license.max_activations) {
      throw new AppError(403, 'Activation limit reached');
    }

    if (shouldRejectOneTimeActivation({ license, existingActivation: activation })) {
      throw new AppError(403, 'This license can only be activated once');
    }

    if (!isIdempotentActivationReuse(activation)) {
      activation = await activationModel.create(db, {
        tenantId: license.tenant_id,
        licenseId: license.id,
        installId: payload.installId,
        deviceFingerprintHash,
        deviceName: payload.deviceName,
        activatedByEmail: payload.adminEmail
      });

      await licenseModel.incrementLifetimeActivationCount(db, license.id);

      await writeAuditLog(db, {
        tenantId: license.tenant_id,
        licenseId: license.id,
        activationId: activation.id,
        action: 'license_activation_created',
        performedBy: payload.adminEmail,
        reason: 'public_activation',
        metadata: {
          normalizedLicenseKey: normalizeLicenseKey(payload.licenseKey),
          companyName: payload.companyName,
          adminFirstName: payload.adminFirstName,
          adminLastName: payload.adminLastName,
          deviceName: payload.deviceName,
          installId: payload.installId
        }
      });
    } else {
      await writeAuditLog(db, {
        tenantId: license.tenant_id,
        licenseId: license.id,
        activationId: activation.id,
        action: 'license_activation_reused',
        performedBy: payload.adminEmail,
        reason: 'idempotent_activation',
        metadata: {
          companyName: payload.companyName,
          deviceName: payload.deviceName,
          installId: payload.installId
        }
      });
    }

    const syncedLicense = await licenseModel.syncActivationCount(db, license.id);
    const commercialState = await buildCommercialState(db, syncedLicense, activation);
    const activationToken = await signActivationToken({
      sub: activation.id,
      activationId: activation.id,
      tenantId: syncedLicense.tenant_id,
      licenseId: syncedLicense.id,
      installId: activation.install_id,
      deviceFingerprintHash: activation.device_fingerprint_hash,
      commercialStatus: commercialState.commercialStatus
    });

    await writeActivationEvent(db, {
      tenantId: activation.tenant_id,
      activationId: activation.id,
      eventType: 'activate',
      ipHash,
      userAgentHash
    });

    return {
      activationId: activation.id,
      activationToken,
      licenseKey: normalizeLicenseKey(payload.licenseKey),
      state: await createSignedStatusBundle(commercialState)
    };
  });

const restoreActivation = async (payload) =>
  withTransaction(async (db) => {
    const ipHash = hashTelemetryValue(payload.requestMeta?.ip);
    const userAgentHash = hashTelemetryValue(payload.requestMeta?.userAgent);
    const fingerprintHash = hashDeviceFingerprint(payload.deviceFingerprint);
    const activation = await activationModel.findByRestoreFingerprint(
      db,
      payload.activationId,
      payload.installId,
      fingerprintHash
    );

    if (!activation) {
      throw new AppError(404, 'Activation not found');
    }

    if (activation.status !== 'active') {
      throw new AppError(403, `Activation is ${activation.status}`);
    }

    const license = await licenseModel.findById(db, activation.license_id);
    if (!license) {
      throw new AppError(404, 'License not found');
    }

    if (license.status !== 'active' || isExpired(license.expires_at)) {
      throw new AppError(403, 'License is not available for restore');
    }

    const commercialState = await buildCommercialState(db, license, activation);
    const activationToken = await signActivationToken({
      sub: activation.id,
      activationId: activation.id,
      tenantId: license.tenant_id,
      licenseId: license.id,
      installId: activation.install_id,
      deviceFingerprintHash: activation.device_fingerprint_hash,
      commercialStatus: commercialState.commercialStatus
    });

    await writeActivationEvent(db, {
      tenantId: activation.tenant_id,
      activationId: activation.id,
      eventType: 'restore',
      ipHash,
      userAgentHash
    });

    await writeAuditLog(db, {
      tenantId: activation.tenant_id,
      licenseId: activation.license_id,
      activationId: activation.id,
      action: 'license_activation_restored',
      performedBy: payload.adminEmail || 'system',
      reason: 'restore_request',
      metadata: {
        installId: payload.installId
      }
    });

    return {
      activationId: activation.id,
      activationToken,
      state: await createSignedStatusBundle(commercialState)
    };
  });

const heartbeat = async (payload) =>
  withTransaction(async (db) => {
    const ipHash = hashTelemetryValue(payload.requestMeta?.ip);
    const userAgentHash = hashTelemetryValue(payload.requestMeta?.userAgent);
    const activation = await resolveActivationFromRequest({
      db,
      activationToken: payload.activationToken,
      activationId: payload.activationId,
      installId: payload.installId,
      deviceFingerprint: payload.deviceFingerprint
    });
    const license = await licenseModel.findById(db, activation.license_id);

    if (!license) {
      throw new AppError(404, 'License not found');
    }

    ensureRequestFingerprintMatches({ license, payload, activation });

    let currentActivation = activation;
    if (activation.status === 'active' && license.status === 'active' && !isExpired(license.expires_at)) {
      currentActivation = await activationModel.touchHeartbeat(db, activation.id);
    }

    await writeActivationEvent(db, {
      tenantId: currentActivation.tenant_id,
      activationId: currentActivation.id,
      eventType: 'heartbeat',
      ipHash,
      userAgentHash
    });

    const commercialState = await buildCommercialState(db, license, currentActivation);

    return {
      status: commercialState.licenseActive ? 'ok' : 'blocked',
      state: await createSignedStatusBundle(commercialState)
    };
  });

const deactivate = async (payload) =>
  withTransaction(async (db) => {
    const ipHash = hashTelemetryValue(payload.requestMeta?.ip);
    const userAgentHash = hashTelemetryValue(payload.requestMeta?.userAgent);
    const activation = await resolveActivationFromRequest({
      db,
      activationToken: payload.activationToken,
      activationId: payload.activationId,
      installId: payload.installId,
      deviceFingerprint: payload.deviceFingerprint
    });

    if (activation.status !== 'active') {
      throw new AppError(409, `Activation already ${activation.status}`);
    }

    const licenseBeforeDeactivation = await licenseModel.findById(db, activation.license_id);
    if (!licenseBeforeDeactivation) {
      throw new AppError(404, 'License not found');
    }

    ensureRequestFingerprintMatches({
      license: licenseBeforeDeactivation,
      payload,
      activation
    });

    const updatedActivation = await activationModel.updateStatus(db, activation.id, 'revoked');
    const license = await licenseModel.syncActivationCount(db, activation.license_id);

    await writeAuditLog(db, {
      tenantId: activation.tenant_id,
      licenseId: activation.license_id,
      activationId: activation.id,
      action: 'license_activation_deactivated',
      performedBy: payload.performedBy || payload.adminEmail || 'app',
      reason: payload.reason || 'device_deactivate',
      metadata: {
        installId: activation.install_id
      }
    });

    await writeActivationEvent(db, {
      tenantId: activation.tenant_id,
      activationId: activation.id,
      eventType: 'deactivate',
      ipHash,
      userAgentHash
    });

    const commercialState = await buildCommercialState(db, license, updatedActivation);

    return {
      deactivated: true,
      state: await createSignedStatusBundle(commercialState)
    };
  });

const getLicenseStatus = async (payload) => {
  const db = { query };
  const ipHash = hashTelemetryValue(payload.requestMeta?.ip);
  const userAgentHash = hashTelemetryValue(payload.requestMeta?.userAgent);
  const activation = await resolveActivationFromRequest({
    db,
    activationToken: payload.activationToken,
    activationId: payload.activationId,
    installId: payload.installId,
    deviceFingerprint: payload.deviceFingerprint
  });

  const license = await licenseModel.findById(db, activation.license_id);
  if (!license) {
    throw new AppError(404, 'License not found');
  }

  ensureRequestFingerprintMatches({ license, payload, activation });

  await writeActivationEvent(db, {
    tenantId: activation.tenant_id,
    activationId: activation.id,
    eventType: 'status',
    ipHash,
    userAgentHash
  });

  const commercialState = await buildCommercialState(db, license, activation);
  return {
    status: commercialState.licenseActive ? 'ok' : 'blocked',
    state: await createSignedStatusBundle(commercialState)
  };
};

module.exports = {
  issueLicense,
  activateLicense,
  restoreActivation,
  heartbeat,
  deactivate,
  getLicenseStatus,
  buildCommercialState,
  __internals: {
    isHeartbeatStale,
    enforceTokenDeviceBinding,
    ensureRequestFingerprintMatches,
    shouldRejectOneTimeActivation,
    isIdempotentActivationReuse
  }
};
