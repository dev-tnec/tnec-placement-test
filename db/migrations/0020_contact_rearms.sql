-- The contact-step re-arm counters: a failed delivery channel can be re-armed exactly once by
-- the retry that follows it, so a loop of contact replays cannot burn the outbound channels
-- indefinitely while the sends keep failing (audit finding webapi/contact-rearm-failed-channel).

ALTER TABLE attempts ADD COLUMN IF NOT EXISTS email_rearms INTEGER NOT NULL DEFAULT 0;
ALTER TABLE attempts ADD COLUMN IF NOT EXISTS wa_rearms INTEGER NOT NULL DEFAULT 0;
