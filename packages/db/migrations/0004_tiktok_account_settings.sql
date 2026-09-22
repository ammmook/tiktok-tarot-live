CREATE TABLE IF NOT EXISTS tiktok_account_settings (
  tiktok_username varchar(120) PRIMARY KEY,
  gift_rules jsonb NOT NULL,
  queue_settings jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tiktok_account_settings_updated_idx
  ON tiktok_account_settings (updated_at);
