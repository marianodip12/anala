-- ============================================================
-- HANDBALL STATS – SUPABASE SCHEMA
-- Auth: none for now, prepared for future user_id column
-- ============================================================

-- TEAMS -------------------------------------------------------
CREATE TABLE IF NOT EXISTS teams (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  name        TEXT        NOT NULL,
  short_name  TEXT,
  color       TEXT        DEFAULT '#ef6461',
  is_mine     BOOLEAN     DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- PLAYERS -----------------------------------------------------
CREATE TABLE IF NOT EXISTS players (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  team_id     UUID        REFERENCES teams(id) ON DELETE CASCADE NOT NULL,
  number      INTEGER     NOT NULL,
  name        TEXT        NOT NULL,
  position    TEXT        CHECK (position IN ('goalkeeper','field')) DEFAULT 'field',
  is_active   BOOLEAN     DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (team_id, number)
);

-- MATCHES -----------------------------------------------------
CREATE TABLE IF NOT EXISTS matches (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  home_team_id    UUID        REFERENCES teams(id) NOT NULL,
  away_team_id    UUID        REFERENCES teams(id) NOT NULL,
  home_score      INTEGER     DEFAULT 0,
  away_score      INTEGER     DEFAULT 0,
  date            TIMESTAMPTZ DEFAULT NOW(),
  status          TEXT        DEFAULT 'pending'
                  CHECK (status IN ('pending','live','finished')),
  half            INTEGER     DEFAULT 1,
  elapsed_seconds INTEGER     DEFAULT 0,
  court_flip      BOOLEAN     DEFAULT false,  -- home team attacks left side
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  CHECK (home_team_id <> away_team_id)
);

-- MATCH EVENTS ------------------------------------------------
-- One row per game event: shot, sanction, timeout, etc.
CREATE TABLE IF NOT EXISTS events (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  match_id        UUID        REFERENCES matches(id) ON DELETE CASCADE NOT NULL,
  team_id         UUID        REFERENCES teams(id) NOT NULL,
  player_id       UUID        REFERENCES players(id),
  goalkeeper_id   UUID        REFERENCES players(id),   -- who was keeper at the time
  half            INTEGER,
  minute          INTEGER,
  second_in_min   INTEGER,
  elapsed_seconds INTEGER,                               -- total match elapsed secs

  -- Type: 'shot' | 'sanction' | 'timeout' | 'substitution'
  event_type      TEXT        NOT NULL,

  -- Shot fields
  zone            TEXT,   -- extreme_left | back_left | center | back_right | extreme_right | pivot | 7m | outside
  goal_section    TEXT,   -- tl | tc | tr | ml | mc | mr | bl | bc | br | outside
  shot_result     TEXT,   -- goal | saved | missed | post | blocked
  attack_action   TEXT,   -- no_shot | deflect_success | deflect_fail
  defense_action  TEXT,   -- wrong_anticipation | bad_position | static | leg_up | arm_down | good_anticipation | influenced_shot

  -- Sanction fields
  sanction_type   TEXT,   -- yellow | 2min | red | blue

  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- EXCLUSIONS (2-min suspensions tracking) --------------------
CREATE TABLE IF NOT EXISTS exclusions (
  id                  UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  match_id            UUID        REFERENCES matches(id) ON DELETE CASCADE NOT NULL,
  event_id            UUID        REFERENCES events(id),
  player_id           UUID        REFERENCES players(id) NOT NULL,
  team_id             UUID        REFERENCES teams(id) NOT NULL,
  sanction_type       TEXT        NOT NULL,  -- 2min | red | blue
  is_permanent        BOOLEAN     DEFAULT false,  -- red / blue card → never returns
  started_at_seconds  INTEGER     NOT NULL,       -- match elapsed when suspension began
  ends_at_seconds     INTEGER,                    -- started + 120 (null if permanent)
  is_served           BOOLEAN     DEFAULT false,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- MATCH LINEUP ------------------------------------------------
-- Tracks which players are on court per side at any point
CREATE TABLE IF NOT EXISTS lineup (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  match_id        UUID        REFERENCES matches(id) ON DELETE CASCADE NOT NULL,
  team_id         UUID        REFERENCES teams(id) NOT NULL,
  player_id       UUID        REFERENCES players(id) NOT NULL,
  is_goalkeeper   BOOLEAN     DEFAULT false,
  entered_at_secs INTEGER,
  left_at_secs    INTEGER,
  is_on_court     BOOLEAN     DEFAULT true,
  UNIQUE (match_id, team_id, player_id)
);

-- INDEXES for performance ------------------------------------
CREATE INDEX IF NOT EXISTS idx_events_match      ON events(match_id);
CREATE INDEX IF NOT EXISTS idx_events_player     ON events(player_id);
CREATE INDEX IF NOT EXISTS idx_exclusions_match  ON exclusions(match_id);
CREATE INDEX IF NOT EXISTS idx_lineup_match      ON lineup(match_id);
CREATE INDEX IF NOT EXISTS idx_players_team      ON players(team_id);

-- ============================================================
-- HELPER VIEWS
-- ============================================================

-- Goalkeeper stats per match
CREATE OR REPLACE VIEW v_goalkeeper_stats AS
SELECT
  e.match_id,
  e.goalkeeper_id AS player_id,
  p.name,
  p.number,
  t.name AS team_name,
  COUNT(*) FILTER (WHERE e.shot_result IN ('goal','saved','missed','post')) AS total_shots_faced,
  COUNT(*) FILTER (WHERE e.shot_result = 'saved')  AS saves,
  COUNT(*) FILTER (WHERE e.shot_result = 'goal')   AS goals_conceded,
  ROUND(
    COUNT(*) FILTER (WHERE e.shot_result = 'saved')::NUMERIC /
    NULLIF(COUNT(*) FILTER (WHERE e.shot_result IN ('goal','saved')), 0) * 100
  , 1) AS save_pct
FROM events e
JOIN players p ON p.id = e.goalkeeper_id
JOIN teams t ON t.id = p.team_id
WHERE e.event_type = 'shot' AND e.goalkeeper_id IS NOT NULL
GROUP BY e.match_id, e.goalkeeper_id, p.name, p.number, t.name;

-- Shooter stats per match
CREATE OR REPLACE VIEW v_shooter_stats AS
SELECT
  e.match_id,
  e.player_id,
  p.name,
  p.number,
  t.name AS team_name,
  e.zone,
  COUNT(*) AS total_shots,
  COUNT(*) FILTER (WHERE e.shot_result = 'goal')   AS goals,
  COUNT(*) FILTER (WHERE e.shot_result = 'saved')  AS saved,
  COUNT(*) FILTER (WHERE e.shot_result = 'missed') AS missed,
  ROUND(
    COUNT(*) FILTER (WHERE e.shot_result = 'goal')::NUMERIC /
    NULLIF(COUNT(*), 0) * 100
  , 1) AS goal_pct
FROM events e
JOIN players p ON p.id = e.player_id
JOIN teams t ON t.id = e.team_id
WHERE e.event_type = 'shot' AND e.player_id IS NOT NULL
GROUP BY e.match_id, e.player_id, p.name, p.number, t.name, e.zone;
