-- One WhatsApp channel row per branch, managed from the dashboard Pengaturan. The AttCos API key
-- stays in the environment; this table holds only the channel identifiers, which are useless
-- without the key. The Pare row is required and seeded from ATTCOS_CHANNEL_ID at insert time by
-- the server; empty branch channels fall back to Pare at send time.

CREATE TABLE IF NOT EXISTS whatsapp_channels (
  branch      TEXT PRIMARY KEY CHECK (branch IN ('pare', 'jogja', 'medan', 'online')),
  channel_id  TEXT NOT NULL DEFAULT '',
  updated_at  BIGINT NOT NULL DEFAULT 0,
  updated_by  TEXT NOT NULL DEFAULT ''
);

INSERT INTO whatsapp_channels (branch, channel_id, updated_at, updated_by)
VALUES ('pare', '', 0, ''), ('jogja', '', 0, ''), ('medan', '', 0, ''), ('online', '', 0, '')
ON CONFLICT (branch) DO NOTHING;
