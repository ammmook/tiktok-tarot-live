-- PostgreSQL triggers only run when data changes. The API invokes the retention
-- function every 15 minutes so it also runs when no new TikTok event arrives.
CREATE OR REPLACE FUNCTION public.delete_live_session_children()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- queue_events must be removed before their queue_entries parent rows.
  DELETE FROM queue_events AS event
  USING queue_entries AS entry
  WHERE event.queue_entry_id = entry.id
    AND entry.live_session_id = OLD.id;

  -- queue_entries reference credits and pending questions, so remove them first.
  DELETE FROM queue_entries WHERE live_session_id = OLD.id;
  DELETE FROM pending_questions WHERE live_session_id = OLD.id;
  DELETE FROM question_credits WHERE live_session_id = OLD.id;
  DELETE FROM tiktok_processed_events WHERE live_session_id = OLD.id;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS live_sessions_delete_children ON live_sessions;
CREATE TRIGGER live_sessions_delete_children
BEFORE DELETE ON live_sessions
FOR EACH ROW
EXECUTE FUNCTION public.delete_live_session_children();

CREATE OR REPLACE FUNCTION public.purge_stale_live_queue_data(
  cutoff_at timestamptz DEFAULT now() - interval '1 day'
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  -- Dashboard-created queues do not always have a live_session_id. Keep only one
  -- day of those records too, including their event history and unused credits.
  DELETE FROM queue_events AS event
  USING queue_entries AS entry
  WHERE event.queue_entry_id = entry.id
    AND entry.live_session_id IS NULL
    AND entry.created_at < cutoff_at;

  DELETE FROM queue_entries
  WHERE live_session_id IS NULL
    AND created_at < cutoff_at;

  DELETE FROM question_credits AS credit
  WHERE credit.live_session_id IS NULL
    AND credit.created_at < cutoff_at
    AND NOT EXISTS (
      SELECT 1
      FROM queue_entries AS entry
      WHERE entry.credit_id = credit.id
    );

  -- Do not purge a session that still has a listener heartbeat reporting it as
  -- connected, even if the LIVE has been running for more than one day.
  -- Deleting a session invokes live_sessions_delete_children above.
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

  -- Health records are operational status only; retain the latest day as well.
  DELETE FROM listener_health WHERE updated_at < cutoff_at;
END;
$$;
