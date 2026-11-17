-- The speaking interview is part of Paket Demo A, not a separate global block. Its 18 questions
-- and videos live in the interview plan (packages/core/src/speaking-mockup.js), so these three
-- sections carry the part labels and timing only, with no question range, passage, or audio.
-- The Bagian table lists them with the other nine sections, and the Paket count includes them.

INSERT INTO question_sections (id, test_key, package_id, position, title, skill, part, passage, audio_url, image_url, created_at, updated_at)
VALUES
  ('sec_ielts_speaking_1', 'ielts-mockup', 'pkg_ielts_demo_a', 10, 'Speaking Part 1', 'Speaking', 1, NULL, NULL, NULL, EXTRACT(EPOCH FROM NOW())::BIGINT, EXTRACT(EPOCH FROM NOW())::BIGINT),
  ('sec_ielts_speaking_2', 'ielts-mockup', 'pkg_ielts_demo_a', 11, 'Speaking Part 2', 'Speaking', 2, NULL, NULL, NULL, EXTRACT(EPOCH FROM NOW())::BIGINT, EXTRACT(EPOCH FROM NOW())::BIGINT),
  ('sec_ielts_speaking_3', 'ielts-mockup', 'pkg_ielts_demo_a', 12, 'Speaking Part 3', 'Speaking', 3, NULL, NULL, NULL, EXTRACT(EPOCH FROM NOW())::BIGINT, EXTRACT(EPOCH FROM NOW())::BIGINT)
ON CONFLICT (id) DO NOTHING;
