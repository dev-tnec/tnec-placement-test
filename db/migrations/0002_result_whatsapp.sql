-- The placement result now also goes to the student's WhatsApp right after the contact step,
-- the same way as the result email. These columns record whether that message went out.
ALTER TABLE attempts ADD COLUMN IF NOT EXISTS wa_sent_at BIGINT;
ALTER TABLE attempts ADD COLUMN IF NOT EXISTS wa_status TEXT;
