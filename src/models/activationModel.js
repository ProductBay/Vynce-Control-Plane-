const activationSelect = `
  SELECT
    id,
    tenant_id,
    license_id,
    install_id,
    device_fingerprint_hash,
    device_name,
    activated_by_email,
    activated_at,
    last_seen_at,
    revoked_at,
    status,
    created_at,
    updated_at
  FROM activations
`;

const findActiveByLicenseInstallFingerprint = async (db, licenseId, installId, fingerprintHash) => {
  const result = await db.query(
    `${activationSelect} WHERE license_id = $1 AND install_id = $2 AND device_fingerprint_hash = $3 AND status = 'active'`,
    [licenseId, installId, fingerprintHash]
  );
  return result.rows[0] || null;
};

const findByRestoreFingerprint = async (db, activationId, installId, fingerprintHash) => {
  const result = await db.query(
    `${activationSelect} WHERE id = $1 AND install_id = $2 AND device_fingerprint_hash = $3`,
    [activationId, installId, fingerprintHash]
  );
  return result.rows[0] || null;
};

const findById = async (db, activationId) => {
  const result = await db.query(`${activationSelect} WHERE id = $1`, [activationId]);
  return result.rows[0] || null;
};

const listByTenantId = async (db, tenantId) => {
  const result = await db.query(`${activationSelect} WHERE tenant_id = $1 ORDER BY created_at DESC`, [tenantId]);
  return result.rows;
};

const countActiveByLicenseId = async (db, licenseId) => {
  const result = await db.query(
    `SELECT COUNT(*)::int AS active_count FROM activations WHERE license_id = $1 AND status = 'active'`,
    [licenseId]
  );
  return result.rows[0]?.active_count || 0;
};

const create = async (db, payload) => {
  const result = await db.query(
    `
      INSERT INTO activations (
        tenant_id,
        license_id,
        install_id,
        device_fingerprint_hash,
        device_name,
        activated_by_email
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `,
    [
      payload.tenantId,
      payload.licenseId,
      payload.installId,
      payload.deviceFingerprintHash,
      payload.deviceName,
      payload.activatedByEmail
    ]
  );
  return result.rows[0];
};

const touchHeartbeat = async (db, activationId) => {
  const result = await db.query(
    `
      UPDATE activations
      SET last_seen_at = NOW()
      WHERE id = $1
      RETURNING *
    `,
    [activationId]
  );
  return result.rows[0] || null;
};

const updateStatus = async (db, activationId, status) => {
  const revokedAt = status === 'active' ? null : new Date().toISOString();
  const result = await db.query(
    `
      UPDATE activations
      SET status = $2,
          revoked_at = $3
      WHERE id = $1
      RETURNING *
    `,
    [activationId, status, revokedAt]
  );
  return result.rows[0] || null;
};

const updateManyByTenant = async (db, tenantId, status) => {
  const revokedAt = status === 'active' ? null : new Date().toISOString();
  const result = await db.query(
    `
      UPDATE activations
      SET status = $2,
          revoked_at = $3
      WHERE tenant_id = $1 AND status = 'active'
      RETURNING *
    `,
    [tenantId, status, revokedAt]
  );
  return result.rows;
};

module.exports = {
  findActiveByLicenseInstallFingerprint,
  findByRestoreFingerprint,
  findById,
  listByTenantId,
  countActiveByLicenseId,
  create,
  touchHeartbeat,
  updateStatus,
  updateManyByTenant
};
