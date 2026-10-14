-- Keep LIVE activity for at most one day, even while the same LIVE session is
-- still connected. Gift rules, queue settings, and the known-gift catalog are
-- configuration data, so they are intentionally retained.
CREATE OR REPLACE FUNCTION public.purge_stale_live_queue_data(
  cutoff_at timestamptz DEFAULT now() - interval '1 day'
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  -- Remove child rows before their queue or session parents.
  DELETE FROM queue_events AS event
  USING queue_entries AS entry
  WHERE event.queue_entry_id = entry.id
    AND entry.created_at < cutoff_at;

  -- Questions and every queue state (waiting, answered, skipped, and manual)
  -- must disappear after one day, including when a LIVE stays connected longer.
  DELETE FROM queue_entries WHERE created_at < cutoff_at;

  -- A newer queue can still point to an older pending question or gift credit.
  -- Remove only that historical link before purging the expired activity row.
  UPDATE queue_entries
  SET pending_question_id = NULL
  WHERE pending_question_id IN (
    SELECT id FROM pending_questions WHERE created_at < cutoff_at
  );

  UPDATE queue_entries
  SET credit_id = NULL
  WHERE credit_id IN (
    SELECT id FROM question_credits WHERE created_at < cutoff_at
  );

  DELETE FROM pending_questions WHERE created_at < cutoff_at;
  DELETE FROM question_credits WHERE created_at < cutoff_at;

  -- Event receipts and activity logs must follow the same retention window.
  DELETE FROM tiktok_processed_events WHERE created_at < cutoff_at;
  DELETE FROM tiktok_live_comments WHERE created_at < cutoff_at;
  DELETE FROM tiktok_live_gifts WHERE created_at < cutoff_at;

  -- Finished or stale sessions can be removed completely. Active sessions are
  -- retained so the listener connection is never interrupted by the cleanup.
  DELETE FROM live_sessions AS session
  WHERE COALESCE(session.ended_at, session.updated_at, session.connected_at) < cutoff_at
    AND NOT EXISTS (
      SELECT 1
      FROM listener_health AS health
      WHERE health.room_id = session.room_id
        AND health.tiktok_username = session.tiktok_username
        AND health.tiktok_status = 'CONNECTED'
        AND health.updated_at >= cutoff_at
    );

  DELETE FROM listener_health WHERE updated_at < cutoff_at;
END;
$$;
