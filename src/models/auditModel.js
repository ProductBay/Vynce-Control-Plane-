const create = async (db, payload) => {
  const result = await db.query(
    `
      INSERT INTO license_audits (
        tenant_id,
        license_id,
        activation_id,
        action,
        performed_by,
        reason,
        metadata_json
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
      RETURNING *
    `,
    [
      payload.tenantId,
      payload.licenseId || null,
      payload.activationId || null,
      payload.action,
      payload.performedBy || null,
      payload.reason || null,
      JSON.stringify(payload.metadata || {})
    ]
  );
  return result.rows[0];
};

module.exports = { create };
