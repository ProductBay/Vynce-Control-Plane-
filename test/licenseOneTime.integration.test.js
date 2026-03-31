const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');

require('dotenv').config();
process.env.CONTROL_PLANE_BASE_URL = process.env.CONTROL_PLANE_BASE_URL || 'http://localhost:4000';
process.env.ADMIN_API_SECRET = process.env.ADMIN_API_SECRET || 'this-is-a-long-admin-api-secret-for-tests';
process.env.JWT_SIGNING_PRIVATE_KEY = process.env.JWT_SIGNING_PRIVATE_KEY || 'test-private-key';
process.env.JWT_SIGNING_PUBLIC_KEY = process.env.JWT_SIGNING_PUBLIC_KEY || 'test-public-key';

const { query } = require('../src/db/query');
const { pool } = require('../src/db/pool');
const licenseService = require('../src/services/licenseService');
const adminService = require('../src/services/adminService');
const { AppError } = require('../src/utils/appError');

const canRunIntegration = async () => {
  try {
    await query('SELECT 1');
    return true;
  } catch {
    return false;
  }
};

test('one-time activation remains blocked after tenant reset flow', async (t) => {
  if (!(await canRunIntegration())) {
    t.skip('Postgres not available for integration test');
    return;
  }

  const tenantId = `tenant_it_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`;
  const installOne = crypto.randomUUID();
  const installTwo = crypto.randomUUID();

  const issued = await adminService.issueLicense({
    tenantId,
    plan: 'professional',
    maxActivations: 1,
    includedUsers: 1,
    extraSeats: 0,
    performedBy: 'integration@test.local',
    reason: 'integration_test'
  });

  try {
    await query('UPDATE licenses SET one_time_activation = TRUE WHERE id = $1', [issued.licenseId]);

    const firstActivation = await licenseService.activateLicense({
      licenseKey: issued.licenseKey,
      companyName: 'Integration Co',
      adminFirstName: 'Int',
      adminLastName: 'Test',
      adminEmail: 'integration@test.local',
      installId: installOne,
      deviceFingerprint: 'fingerprint-integration-one-12345',
      deviceName: 'Integration-Device-One',
      requestMeta: {
        ip: '127.0.0.1',
        userAgent: 'integration-test'
      }
    });

    assert.ok(firstActivation.activationId);

    await adminService.resetLicenseActivations({
      tenantId,
      performedBy: 'integration@test.local',
      reason: 'integration_reset'
    });

    await assert.rejects(
      () =>
        licenseService.activateLicense({
          licenseKey: issued.licenseKey,
          companyName: 'Integration Co',
          adminFirstName: 'Int',
          adminLastName: 'Test',
          adminEmail: 'integration@test.local',
          installId: installTwo,
          deviceFingerprint: 'fingerprint-integration-two-12345',
          deviceName: 'Integration-Device-Two',
          requestMeta: {
            ip: '127.0.0.1',
            userAgent: 'integration-test'
          }
        }),
      (error) => error instanceof AppError && error.statusCode === 403
    );
  } finally {
    await query('DELETE FROM licenses WHERE tenant_id = $1', [tenantId]);
  }
});

test.after(async () => {
  await pool.end().catch(() => {});
});
