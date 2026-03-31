const test = require('node:test');
const assert = require('node:assert/strict');

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/vynce_control_plane';
process.env.CONTROL_PLANE_BASE_URL = process.env.CONTROL_PLANE_BASE_URL || 'http://localhost:4000';
process.env.ADMIN_API_SECRET = process.env.ADMIN_API_SECRET || 'this-is-a-long-admin-api-secret-for-tests';
process.env.JWT_SIGNING_PRIVATE_KEY = process.env.JWT_SIGNING_PRIVATE_KEY || 'test-private-key';
process.env.JWT_SIGNING_PUBLIC_KEY = process.env.JWT_SIGNING_PUBLIC_KEY || 'test-public-key';

const { AppError } = require('../src/utils/appError');
const licenseService = require('../src/services/licenseService');
const licenseModel = require('../src/models/licenseModel');
const { hashDeviceFingerprint } = require('../src/utils/hash');

const {
  isHeartbeatStale,
  enforceTokenDeviceBinding,
  ensureRequestFingerprintMatches,
  shouldRejectOneTimeActivation,
  isIdempotentActivationReuse
} = licenseService.__internals;

test('concurrent guard uses FOR UPDATE lookup function', () => {
  assert.equal(typeof licenseModel.findByLicenseKeyHashForUpdate, 'function');
});

test('token replay with different device context fails', () => {
  assert.throws(
    () =>
      enforceTokenDeviceBinding({
        payload: {
          installId: 'install-b',
          deviceFingerprintHash: 'fingerprint-hash-b'
        },
        activation: {
          install_id: 'install-a',
          device_fingerprint_hash: 'fingerprint-hash-a'
        }
      }),
    (error) => error instanceof AppError && error.statusCode === 401
  );
});

test('one-time activation mode blocks second distinct device activation', () => {
  const blocked = shouldRejectOneTimeActivation({
    license: {
      one_time_activation: true,
      lifetime_activation_count: 1
    },
    existingActivation: null
  });

  assert.equal(blocked, true);
});

test('stale heartbeat returns true after grace window', () => {
  const now = Date.now();
  const stale = isHeartbeatStale(
    {
      status: 'active',
      last_seen_at: new Date(now - 180_000).toISOString()
    },
    {
      heartbeat_grace_seconds: 60
    }
  );

  assert.equal(stale, true);
});

test('idempotent activation retry remains safe', () => {
  const existingActivation = {
    id: 'activation-id',
    install_id: 'install-a'
  };

  assert.equal(isIdempotentActivationReuse(existingActivation), true);
});

test('device binding requires matching fingerprint when token auth is used', () => {
  const activation = {
    device_fingerprint_hash: hashDeviceFingerprint('fingerprint-123')
  };

  assert.throws(
    () =>
      ensureRequestFingerprintMatches({
        license: { require_device_binding: true },
        payload: {
          activationToken: 'token',
          deviceFingerprint: 'different-fingerprint'
        },
        activation
      }),
    (error) => error instanceof AppError && error.statusCode === 401
  );
});
