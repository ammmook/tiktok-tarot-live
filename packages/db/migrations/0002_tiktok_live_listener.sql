CREATE TABLE IF NOT EXISTS live_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tiktok_username varchar(120) NOT NULL,
  room_id varchar(120) NOT NULL UNIQUE,
  status varchar(32) NOT NULL DEFAULT 'CONNECTED',
  connected_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS live_sessions_username_status_idx
  ON live_sessions (tiktok_username, status, connected_at);

CREATE TABLE IF NOT EXISTS tiktok_processed_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key varchar(480) NOT NULL UNIQUE,
  event_id varchar(180) NOT NULL,
  event_type varchar(32) NOT NULL,
  live_session_id uuid NOT NULL REFERENCES live_sessions(id),
  room_id varchar(120) NOT NULL,
  status varchar(32) NOT NULL DEFAULT 'RECEIVED',
  event_timestamp timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tiktok_processed_events_session_type_idx
  ON tiktok_processed_events (live_session_id, event_type, created_at);

CREATE TABLE IF NOT EXISTS pending_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  live_session_id uuid NOT NULL REFERENCES live_sessions(id),
  room_id varchar(120) NOT NULL,
  tiktok_user_id varchar(120) NOT NULL,
  sec_uid varchar(256),
  username varchar(120) NOT NULL,
  nickname varchar(120) NOT NULL,
  profile_picture_url text,
  comment_message_id varchar(180) NOT NULL,
  event_key varchar(480) NOT NULL UNIQUE,
  display_name varchar(120) NOT NULL,
  question text NOT NULL,
  event_timestamp timestamptz NOT NULL,
  status varchar(32) NOT NULL DEFAULT 'WAITING_FOR_GIFT',
  expires_at timestamptz NOT NULL,
  matched_queue_entry_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pending_questions_match_idx
  ON pending_questions (live_session_id, room_id, tiktok_user_id, status, created_at);
CREATE INDEX IF NOT EXISTS pending_questions_expiration_idx
  ON pending_questions (status, expires_at);

CREATE TABLE IF NOT EXISTS listener_health (
  instance_id varchar(120) PRIMARY KEY,
  tiktok_username varchar(120) NOT NULL,
  status varchar(40) NOT NULL,
  tiktok_status varchar(40) NOT NULL,
  authentication_status varchar(32) NOT NULL DEFAULT 'missing',
  room_id varchar(120),
  last_event_at timestamptz,
  detail varchar(240),
  started_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS listener_health_updated_idx ON listener_health (updated_at);

ALTER TABLE question_credits
  ADD COLUMN IF NOT EXISTS live_session_id uuid REFERENCES live_sessions(id),
  ADD COLUMN IF NOT EXISTS room_id varchar(120),
  ADD COLUMN IF NOT EXISTS sec_uid varchar(256),
  ADD COLUMN IF NOT EXISTS nickname varchar(120),
  ADD COLUMN IF NOT EXISTS profile_picture_url text,
  ADD COLUMN IF NOT EXISTS gift_image_url text,
  ADD COLUMN IF NOT EXISTS status varchar(32) NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN IF NOT EXISTS event_timestamp timestamptz,
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;
CREATE INDEX IF NOT EXISTS question_credits_match_idx
  ON question_credits (live_session_id, room_id, user_id, status, created_at);
CREATE INDEX IF NOT EXISTS question_credits_expiration_idx ON question_credits (status, expires_at);

ALTER TABLE queue_entries
  ADD COLUMN IF NOT EXISTS live_session_id uuid REFERENCES live_sessions(id),
  ADD COLUMN IF NOT EXISTS room_id varchar(120),
  ADD COLUMN IF NOT EXISTS sec_uid varchar(256),
  ADD COLUMN IF NOT EXISTS nickname varchar(120),
  ADD COLUMN IF NOT EXISTS profile_picture_url text,
  ADD COLUMN IF NOT EXISTS gift_image_url text,
  ADD COLUMN IF NOT EXISTS pending_question_id uuid REFERENCES pending_questions(id);
CREATE INDEX IF NOT EXISTS queue_entries_live_user_idx
  ON queue_entries (live_session_id, room_id, user_id, created_at);
