-- Copyright (c) 2026 IOTC (Indus Overseas Trading Corporation). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt.
-- part48 (grieviq-74): the Community helper's digital ID card.
--
-- A helper shows the card in the GrievIQ Helper app; a citizen scans its QR
-- code with their OWN phone and grieviq.in says, live, whether this is a
-- genuine active helper, with the card photo. The QR changes every minute
-- (a screenshot stops working after 3 minutes).
--   card_key     the card photo (face only, private storage). Sent with the
--                application and matched on the video call; kept only while
--                the person is a helper, deleted when they stop, are
--                removed or refused, or withdraw.
--   card_status  PENDING (waiting for GrievIQ staff) or OK (confirmed)
--   card_at, card_by  when and by whom it was confirmed
-- No triggers (the count stays 40). Run ONCE ("duplicate column name" means it was done).

ALTER TABLE helpers ADD COLUMN card_key TEXT;
ALTER TABLE helpers ADD COLUMN card_status TEXT CHECK (card_status IS NULL OR card_status IN ('PENDING','OK'));
ALTER TABLE helpers ADD COLUMN card_at TEXT;
ALTER TABLE helpers ADD COLUMN card_by TEXT;
