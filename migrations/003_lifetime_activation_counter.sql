ALTER TABLE licenses
  ADD COLUMN IF NOT EXISTS lifetime_activation_count INTEGER NOT NULL DEFAULT 0 CHECK (lifetime_activation_count >= 0);
