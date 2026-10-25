-- F-Ray-grance 0004 (Phase 11): Scent Academy. Expand-only, owner-scoped Academy records. Original lesson content is versioned
-- with the application; stable identities/versions anchor durable progress.
CREATE TABLE app.academy_lessons (
  slug text NOT NULL,
  content_version integer NOT NULL CHECK (content_version > 0),
  PRIMARY KEY(slug,content_version)
);
INSERT INTO app.academy_lessons(slug,content_version) VALUES
('pyramid-drydown',1),('material-note-accord',1),('families',1),('descriptors',1),('concentration-performance',1),('blotter-testing',1);
GRANT SELECT ON app.academy_lessons TO fray_runtime;
REVOKE INSERT,UPDATE,DELETE,TRUNCATE ON app.academy_lessons FROM fray_runtime;
CREATE TABLE app.academy_progress (
  owner_id uuid NOT NULL REFERENCES app.owners(id) ON DELETE RESTRICT,
  lesson_slug text NOT NULL,
  content_version integer NOT NULL,
  status text NOT NULL CHECK(status IN ('not_started','in_progress','completed')),
  position integer NOT NULL CHECK(position BETWEEN 0 AND 20),
  PRIMARY KEY(owner_id,lesson_slug,content_version),
  FOREIGN KEY(lesson_slug,content_version) REFERENCES app.academy_lessons(slug,content_version)
);
CREATE TABLE app.training_exercises (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES app.owners(id) ON DELETE RESTRICT,
  entry_id uuid REFERENCES app.collection_entries(id) ON DELETE RESTRICT,
  title text NOT NULL CHECK(length(title) BETWEEN 1 AND 100),
  status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','paused','completed')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX training_exercises_owner_idx ON app.training_exercises(owner_id,created_at);
CREATE TABLE app.training_observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exercise_id uuid NOT NULL REFERENCES app.training_exercises(id) ON DELETE CASCADE,
  stage text NOT NULL CHECK(stage IN ('initial','twenty','sixty')),
  elapsed_minutes integer NOT NULL CHECK(elapsed_minutes BETWEEN 0 AND 1440),
  descriptors jsonb NOT NULL CHECK(jsonb_typeof(descriptors)='array'),
  free_text text NOT NULL DEFAULT '' CHECK(length(free_text)<=4000),
  UNIQUE(exercise_id,stage)
);
