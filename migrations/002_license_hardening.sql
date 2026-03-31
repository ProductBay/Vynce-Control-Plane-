ALTER TABLE licenses
  ADD COLUMN IF NOT EXISTS one_time_activation BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS require_device_binding BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS heartbeat_grace_seconds INTEGER NOT NULL DEFAULT 172800;

CREATE INDEX IF NOT EXISTS idx_activations_last_seen_at ON activations (last_seen_at);
CREATE INDEX IF NOT EXISTS idx_activations_tenant_status ON activations (tenant_id, status);

CREATE TABLE IF NOT EXISTS activation_events (
  id BIGSERIAL PRIMARY KEY,
  tenant_id TEXT,
  activation_id UUID REFERENCES activations(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  ip_hash TEXT,
  user_agent_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activation_events_tenant_created_at
  ON activation_events (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_activation_events_ip_created_at
  ON activation_events (ip_hash, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_activation_events_event_type_created_at
  ON activation_events (event_type, created_at DESC);
