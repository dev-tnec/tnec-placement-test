-- The invite queue claim lease: Render keeps the old admin instance alive about 60 seconds
-- after a deploy switches traffic, so two processes can drain at once. The lease makes the
-- atomic claim possible and bounds the boot requeue to rows whose claim has gone stale
-- (audit finding wave2/invite-queue-drain-race).

ALTER TABLE mockup_invite_queue ADD COLUMN IF NOT EXISTS lease_until BIGINT;
