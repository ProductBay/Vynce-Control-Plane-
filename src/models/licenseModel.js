const baseSelect = `
  SELECT
    id,
    tenant_id,
    license_key_hash,
    plan,
    status,
    max_activations,
    activation_count,
    lifetime_activation_count,
    included_users,
    extra_seats,
    one_time_activation,
    require_device_binding,
    heartbeat_grace_seconds,
    expires_at,
    created_at,
    updated_at
  FROM licenses
`;

const findByLicenseKeyHash = async (db, licenseKeyHash) => {
  const result = await db.query(`${baseSelect} WHERE license_key_hash = $1`, [licenseKeyHash]);
  return result.rows[0] || null;
};

const findByTenantId = async (db, tenantId) => {
  const result = await db.query(`${baseSelect} WHERE tenant_id = $1`, [tenantId]);
  return result.rows[0] || null;
};

const findById = async (db, id) => {
  const result = await db.query(`${baseSelect} WHERE id = $1`, [id]);
  return result.rows[0] || null;
};

const findByLicenseKeyHashForUpdate = async (db, licenseKeyHash) => {
  const result = await db.query(`${baseSelect} WHERE license_key_hash = $1 FOR UPDATE`, [licenseKeyHash]);
  return result.rows[0] || null;
};

const updateStatus = async (db, id, status) => {
  const result = await db.query(
    `
      UPDATE licenses
      SET status = $2
      WHERE id = $1
      RETURNING *
    `,
    [id, status]
  );
  return result.rows[0] || null;
};

const syncActivationCount = async (db, licenseId) => {
  const result = await db.query(
    `
      UPDATE licenses
      SET activation_count = (
        SELECT COUNT(*)
        FROM activations
        WHERE license_id = $1 AND status = 'active'
      )
      WHERE id = $1
      RETURNING *
    `,
    [licenseId]
  );
  return result.rows[0] || null;
};

const incrementLifetimeActivationCount = async (db, licenseId) => {
  const result = await db.query(
    `
      UPDATE licenses
      SET lifetime_activation_count = lifetime_activation_count + 1
      WHERE id = $1
      RETURNING *
    `,
    [licenseId]
  );
  return result.rows[0] || null;
};

const updateSeatValues = async (db, tenantId, extraSeats, includedUsers) => {
  const result = await db.query(
    `
      UPDATE licenses
      SET extra_seats = $2,
          included_users = COALESCE($3, included_users)
      WHERE tenant_id = $1
      RETURNING *
    `,
    [tenantId, extraSeats, includedUsers ?? null]
  );
  return result.rows[0] || null;
};

const create = async (db, payload) => {
  const result = await db.query(
    `
      INSERT INTO licenses (
        tenant_id,
        license_key_hash,
        plan,
        status,
        max_activations,
        included_users,
        extra_seats,
        expires_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `,
    [
      payload.tenantId,
      payload.licenseKeyHash,
      payload.plan,
      payload.status,
      payload.maxActivations,
      payload.includedUsers,
      payload.extraSeats,
      payload.expiresAt || null
    ]
  );
  return result.rows[0];
};

module.exports = {
  create,
  findByLicenseKeyHash,
  findByLicenseKeyHashForUpdate,
  findByTenantId,
  findById,
  updateStatus,
  syncActivationCount,
  incrementLifetimeActivationCount,
  updateSeatValues
};
