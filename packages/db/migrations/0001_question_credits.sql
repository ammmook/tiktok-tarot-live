CREATE TABLE IF NOT EXISTS question_credits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id varchar(120),
  username varchar(120) NOT NULL,
  display_name varchar(120) NOT NULL,
  gift_id varchar(80) NOT NULL,
  gift_name varchar(120) NOT NULL,
  gift_icon varchar(24) NOT NULL,
  priority integer NOT NULL,
  queue_type queue_type NOT NULL,
  gift_count integer NOT NULL DEFAULT 1,
  initial_questions integer,
  remaining_questions integer,
  rule_snapshot jsonb NOT NULL,
  idempotency_key varchar(180) NOT NULL UNIQUE,
  external_event_id varchar(180) UNIQUE,
  source varchar(32) NOT NULL DEFAULT 'dashboard',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT question_credits_positive_values_check CHECK (
    priority >= 0 AND gift_count >= 1
    AND (initial_questions IS NULL OR initial_questions >= 0)
    AND (remaining_questions IS NULL OR remaining_questions >= 0)
  )
);

ALTER TABLE queue_entries ADD COLUMN IF NOT EXISTS credit_id uuid REFERENCES question_credits(id);

CREATE INDEX IF NOT EXISTS question_credits_username_remaining_idx
  ON question_credits (username, remaining_questions, created_at);
CREATE INDEX IF NOT EXISTS queue_entries_credit_idx ON queue_entries (credit_id, created_at);

-- Preserve unasked credits created by the first release. Entries which already
-- contain a question are intentionally excluded: their old right count did not
-- distinguish allocated from already spent credits.
INSERT INTO question_credits (
  user_id, username, display_name, gift_id, gift_name, gift_icon, priority,
  queue_type, gift_count, initial_questions, remaining_questions, rule_snapshot,
  idempotency_key, source, created_at, updated_at
)
SELECT
  q.user_id, q.username, q.display_name, q.gift_id, q.gift_name, q.gift_icon,
  q.priority, q.queue_type, q.gift_count, q.question_rights, q.question_rights,
  q.rule_snapshot, 'legacy-credit-' || q.id::text, q.source, q.created_at, now()
FROM queue_entries q
WHERE q.status = 'PENDING_QUESTION'
  AND q.question = ''
  AND q.question_rights IS NOT NULL
  AND q.credit_id IS NULL
ON CONFLICT (idempotency_key) DO NOTHING;

UPDATE queue_entries q
SET credit_id = c.id
FROM question_credits c
WHERE q.credit_id IS NULL
  AND c.idempotency_key = 'legacy-credit-' || q.id::text;
