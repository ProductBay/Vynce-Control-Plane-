const entitlementSelect = `
  SELECT
    id,
    tenant_id,
    plan,
    included_users,
    extra_seats,
    additional_seat_price,
    can_provision_user,
    created_at,
    updated_at
  FROM seat_entitlements
`;

const findByTenantId = async (db, tenantId) => {
  const result = await db.query(`${entitlementSelect} WHERE tenant_id = $1`, [tenantId]);
  return result.rows[0] || null;
};

const upsert = async (db, payload) => {
  const result = await db.query(
    `
      INSERT INTO seat_entitlements (
        tenant_id,
        plan,
        included_users,
        extra_seats,
        additional_seat_price,
        can_provision_user
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (tenant_id)
      DO UPDATE SET
        plan = EXCLUDED.plan,
        included_users = EXCLUDED.included_users,
        extra_seats = EXCLUDED.extra_seats,
        additional_seat_price = EXCLUDED.additional_seat_price,
        can_provision_user = EXCLUDED.can_provision_user
      RETURNING *
    `,
    [
      payload.tenantId,
      payload.plan,
      payload.includedUsers,
      payload.extraSeats,
      payload.additionalSeatPrice,
      payload.canProvisionUser
    ]
  );
  return result.rows[0];
};

module.exports = { findByTenantId, upsert };
