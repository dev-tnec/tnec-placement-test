-- The result email and WhatsApp now go out in the background after the contact step.
-- A server that is sending an attempt's result holds this lease until it records the outcome,
-- so two servers never send the same result. A lease that has run out means that server stopped
-- in the middle of a send, and another server sends again.
ALTER TABLE attempts ADD COLUMN IF NOT EXISTS delivery_lease_until BIGINT;
