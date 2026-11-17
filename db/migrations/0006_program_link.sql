-- The recommended program links to a real product page with its image, and every graded result
-- gets a private link that opens the result on the website without a session.

ALTER TABLE levels ADD COLUMN IF NOT EXISTS program_url TEXT;
ALTER TABLE levels ADD COLUMN IF NOT EXISTS program_image TEXT;

-- The four General English levels point at the General English product, the two TOEFL/IELTS
-- levels at the TOEFL ITP product. The team can repoint a level by editing these two columns.
UPDATE levels SET program_url = 'https://titiknolenglish.com/product/general-english-offline/',
                  program_image = 'https://titiknolenglish.com/wp-content/uploads/2024/12/general-english-500x500.webp'
  WHERE key IN ('starter', 'basic', 'intermediate', 'advanced') AND program_url IS NULL;
UPDATE levels SET program_url = 'https://titiknolenglish.com/product/toefl-preparation-itp-offline/',
                  program_image = 'https://titiknolenglish.com/wp-content/uploads/2024/12/toefl-ielts-prep-500x500.webp'
  WHERE key IN ('toefl-prep', 'toefl-scoring') AND program_url IS NULL;

-- The private result link. The token is random and the row keeps it as it is, because the email
-- and the WhatsApp message are built from the stored attempt on the delivery side.
ALTER TABLE attempts ADD COLUMN IF NOT EXISTS result_token TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_attempts_result_token ON attempts (result_token);
