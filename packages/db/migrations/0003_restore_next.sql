ALTER TABLE queue_entries
  ADD COLUMN IF NOT EXISTS restore_next boolean NOT NULL DEFAULT false;
