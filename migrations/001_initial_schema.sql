CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'license_status_enum') THEN
    CREATE TYPE license_status_enum AS ENUM ('inactive', 'active', 'suspended', 'revoked');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'activation_status_enum') THEN
    CREATE TYPE activation_status_enum AS ENUM ('active', 'revoked', 'replaced');
  END IF;
END $$;

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS licenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL UNIQUE,
  license_key_hash TEXT NOT NULL UNIQUE,
  plan TEXT NOT NULL,
  status license_status_enum NOT NULL DEFAULT 'inactive',
  max_activations INTEGER NOT NULL DEFAULT 1 CHECK (max_activations >= 0),
  activation_count INTEGER NOT NULL DEFAULT 0 CHECK (activation_count >= 0),
  included_users INTEGER NOT NULL DEFAULT 1 CHECK (included_users >= 0),
  extra_seats INTEGER NOT NULL DEFAULT 0 CHECK (extra_seats >= 0),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS activations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  license_id UUID NOT NULL REFERENCES licenses(id) ON DELETE CASCADE,
  install_id TEXT NOT NULL,
  device_fingerprint_hash TEXT NOT NULL,
  device_name TEXT,
  activated_by_email TEXT,
  activated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,
  status activation_status_enum NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS seat_entitlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL UNIQUE,
  plan TEXT NOT NULL,
  included_users INTEGER NOT NULL DEFAULT 1 CHECK (included_users >= 0),
  extra_seats INTEGER NOT NULL DEFAULT 0 CHECK (extra_seats >= 0),
  additional_seat_price NUMERIC(10, 2) NOT NULL DEFAULT 0,
  can_provision_user BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS license_audits (
  id BIGSERIAL PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  license_id UUID REFERENCES licenses(id) ON DELETE SET NULL,
  activation_id UUID REFERENCES activations(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  performed_by TEXT,
  reason TEXT,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activations_tenant_id ON activations (tenant_id);
CREATE INDEX IF NOT EXISTS idx_activations_license_id ON activations (license_id);
CREATE INDEX IF NOT EXISTS idx_activations_status ON activations (status);
CREATE INDEX IF NOT EXISTS idx_license_audits_tenant_id ON license_audits (tenant_id);
CREATE INDEX IF NOT EXISTS idx_license_audits_license_id ON license_audits (license_id);
CREATE INDEX IF NOT EXISTS idx_license_audits_activation_id ON license_audits (activation_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_active_install_per_license
  ON activations (license_id, install_id)
  WHERE status = 'active';

CREATE UNIQUE INDEX IF NOT EXISTS uq_active_fingerprint_per_license
  ON activations (license_id, device_fingerprint_hash)
  WHERE status = 'active';

DROP TRIGGER IF EXISTS trg_licenses_updated_at ON licenses;
CREATE TRIGGER trg_licenses_updated_at
BEFORE UPDATE ON licenses
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_activations_updated_at ON activations;
CREATE TRIGGER trg_activations_updated_at
BEFORE UPDATE ON activations
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_seat_entitlements_updated_at ON seat_entitlements;
CREATE TRIGGER trg_seat_entitlements_updated_at
BEFORE UPDATE ON seat_entitlements
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();
