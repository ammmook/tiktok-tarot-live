CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'queue_status') THEN
    CREATE TYPE queue_status AS ENUM (
      'WAITING', 'ANSWERING', 'ANSWERED', 'CANCELLED', 'DELETED', 'SKIPPED',
      'PENDING_QUESTION', 'PENDING_APPROVAL'
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'queue_type') THEN
    CREATE TYPE queue_type AS ENUM ('NORMAL', 'EXPRESS');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS gift_rules (
  id varchar(80) PRIMARY KEY,
  gift_code varchar(80) NOT NULL UNIQUE,
  display_name varchar(120) NOT NULL,
  icon varchar(24) NOT NULL,
  priority integer NOT NULL,
  queue_type queue_type NOT NULL DEFAULT 'NORMAL',
  question_limit integer NOT NULL DEFAULT 1,
  unlimited_questions boolean NOT NULL DEFAULT false,
  multiplication_mode varchar(16) NOT NULL DEFAULT 'MULTIPLY',
  max_questions integer,
  maximum_questions_per_user integer,
  minimum_gift_count integer NOT NULL DEFAULT 1,
  is_express boolean NOT NULL DEFAULT false,
  auto_queue boolean NOT NULL DEFAULT true,
  require_question boolean NOT NULL DEFAULT true,
  active boolean NOT NULL DEFAULT true,
  color_tag varchar(16) NOT NULL DEFAULT 'DEFAULT',
  display_order integer NOT NULL DEFAULT 0,
  express_behavior varchar(32) NOT NULL DEFAULT 'BEFORE_NORMAL',
  respect_existing_express_queue boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT gift_rules_multiplication_mode_check CHECK (multiplication_mode IN ('MULTIPLY', 'FIXED', 'CAPPED')),
  CONSTRAINT gift_rules_positive_values_check CHECK (priority >= 0 AND question_limit >= 1 AND minimum_gift_count >= 1)
);

CREATE INDEX IF NOT EXISTS gift_rules_display_order_idx ON gift_rules (display_order);

CREATE TABLE IF NOT EXISTS queue_settings (
  id varchar(64) PRIMARY KEY DEFAULT 'default',
  protect_current_question boolean NOT NULL DEFAULT true,
  fifo_same_priority boolean NOT NULL DEFAULT true,
  auto_advance boolean NOT NULL DEFAULT false,
  skipped_behavior varchar(32) NOT NULL DEFAULT 'SKIPPED_TAB',
  duplicate_question_mode varchar(16) NOT NULL DEFAULT 'WARN',
  upgrade_existing_queue_on_express boolean NOT NULL DEFAULT true,
  max_active_queues integer,
  max_question_length integer,
  pending_expiration_minutes integer,
  keep_answered_history boolean NOT NULL DEFAULT true,
  confirm_before_delete boolean NOT NULL DEFAULT true,
  show_tiktok_username boolean NOT NULL DEFAULT true,
  show_gift_name boolean NOT NULL DEFAULT true,
  compact_mode boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT queue_settings_skipped_behavior_check CHECK (skipped_behavior IN ('END_OF_PRIORITY', 'SKIPPED_TAB')),
  CONSTRAINT queue_settings_duplicate_mode_check CHECK (duplicate_question_mode IN ('ALLOW', 'WARN', 'BLOCK'))
);

CREATE TABLE IF NOT EXISTS queue_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_number serial NOT NULL,
  user_id varchar(120),
  username varchar(120) NOT NULL,
  display_name varchar(120) NOT NULL,
  question text NOT NULL DEFAULT '',
  gift_id varchar(80) NOT NULL,
  gift_name varchar(120) NOT NULL,
  gift_icon varchar(24) NOT NULL,
  priority integer NOT NULL,
  queue_type queue_type NOT NULL,
  gift_count integer NOT NULL DEFAULT 1,
  question_rights integer,
  rule_snapshot jsonb NOT NULL,
  status queue_status NOT NULL DEFAULT 'WAITING',
  pending_reason varchar(240),
  idempotency_key varchar(180) NOT NULL UNIQUE,
  external_event_id varchar(180) UNIQUE,
  dedupe_key varchar(600) UNIQUE,
  source varchar(32) NOT NULL DEFAULT 'dashboard',
  queue_entered_at timestamptz,
  moved_to_end boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  answered_at timestamptz,
  cancelled_at timestamptz,
  deleted_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT queue_entries_positive_values_check CHECK (priority >= 0 AND gift_count >= 1)
);

CREATE INDEX IF NOT EXISTS queue_entries_status_created_idx ON queue_entries (status, created_at);
CREATE INDEX IF NOT EXISTS queue_entries_ordering_idx ON queue_entries (status, priority, created_at);
CREATE INDEX IF NOT EXISTS queue_entries_priority_created_idx ON queue_entries (priority, created_at);
CREATE INDEX IF NOT EXISTS queue_entries_username_status_idx ON queue_entries (username, status);

CREATE TABLE IF NOT EXISTS queue_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_entry_id uuid NOT NULL REFERENCES queue_entries(id),
  event_type varchar(40) NOT NULL,
  from_status queue_status,
  to_status queue_status,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS queue_events_queue_entry_idx ON queue_events (queue_entry_id, created_at);

INSERT INTO queue_settings (
  id, protect_current_question, fifo_same_priority, auto_advance, skipped_behavior,
  duplicate_question_mode, upgrade_existing_queue_on_express, max_active_queues,
  max_question_length, pending_expiration_minutes, keep_answered_history,
  confirm_before_delete, show_tiktok_username, show_gift_name, compact_mode
)
VALUES ('default', true, true, false, 'SKIPPED_TAB', 'WARN', true, NULL, 200, 10, true, true, true, true, false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO gift_rules (
  id, gift_code, display_name, icon, priority, queue_type, question_limit,
  unlimited_questions, multiplication_mode, max_questions, maximum_questions_per_user,
  minimum_gift_count, is_express, auto_queue, require_question, active, color_tag,
  display_order, express_behavior, respect_existing_express_queue
)
VALUES
  ('orange', 'orange-heart', 'Orange Heart', '🧡', 30, 'NORMAL', 1, false, 'MULTIPLY', NULL, NULL, 1, false, true, true, true, 'DEFAULT', 0, 'BEFORE_NORMAL', true),
  ('donut', 'donut', 'Donut', '🍩', 20, 'NORMAL', 1, false, 'MULTIPLY', NULL, NULL, 1, false, true, true, true, 'DEFAULT', 1, 'BEFORE_NORMAL', true),
  ('bear', 'bear-heart', 'Bear Heart', '🐻', 10, 'NORMAL', 1, false, 'MULTIPLY', NULL, NULL, 1, false, true, true, true, 'DEFAULT', 2, 'BEFORE_NORMAL', true),
  ('glasses', 'love-glasses', 'Love Glasses', '👓', 1, 'EXPRESS', 3, false, 'MULTIPLY', NULL, NULL, 1, true, true, true, true, 'GOLD', 3, 'BEFORE_NORMAL', true)
ON CONFLICT (id) DO NOTHING;
