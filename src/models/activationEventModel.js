const create = async (db, payload) => {
  const result = await db.query(
    `
      INSERT INTO activation_events (
        tenant_id,
        activation_id,
        event_type,
        ip_hash,
        user_agent_hash
      )
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `,
    [
      payload.tenantId || null,
      payload.activationId || null,
      payload.eventType,
      payload.ipHash || null,
      payload.userAgentHash || null
    ]
  );

  return result.rows[0];
};

const countRecentByTenant = async (db, tenantId, eventType, windowSeconds) => {
  const result = await db.query(
    `
      SELECT COUNT(*)::int AS event_count
      FROM activation_events
      WHERE tenant_id = $1
        AND event_type = $2
        AND created_at >= NOW() - make_interval(secs => $3::int)
    `,
    [tenantId, eventType, windowSeconds]
  );

  return result.rows[0]?.event_count || 0;
};

const countRecentByIpHash = async (db, ipHash, eventType, windowSeconds) => {
  const result = await db.query(
    `
      SELECT COUNT(*)::int AS event_count
      FROM activation_events
      WHERE ip_hash = $1
        AND event_type = $2
        AND created_at >= NOW() - make_interval(secs => $3::int)
    `,
    [ipHash, eventType, windowSeconds]
  );

  return result.rows[0]?.event_count || 0;
};

module.exports = {
  create,
  countRecentByTenant,
  countRecentByIpHash
};
