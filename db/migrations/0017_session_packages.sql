-- One paid wave can hand out several question packages. The session keeps its own set in
-- this join table, and each imported student still gets exactly one package on their
-- invite, chosen from the set, so two students in one wave can sit different packages.
-- The single mockup_sessions.package_id column moves here.

CREATE TABLE IF NOT EXISTS mockup_session_packages (
  session_id TEXT NOT NULL REFERENCES mockup_sessions(id) ON DELETE CASCADE,
  package_id TEXT NOT NULL REFERENCES question_packages(id) ON DELETE CASCADE,
  PRIMARY KEY (session_id, package_id)
);

INSERT INTO mockup_session_packages (session_id, package_id)
SELECT s.id, s.package_id FROM mockup_sessions s
ON CONFLICT DO NOTHING;

ALTER TABLE mockup_sessions DROP COLUMN package_id;
