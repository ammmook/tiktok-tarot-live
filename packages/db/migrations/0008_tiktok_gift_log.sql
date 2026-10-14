CREATE TABLE IF NOT EXISTS tiktok_live_gifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  live_session_id uuid NOT NULL REFERENCES live_sessions(id),
  room_id varchar(120) NOT NULL,
  event_key varchar(480) NOT NULL,
  event_id varchar(180) NOT NULL,
  user_id varchar(120) NOT NULL,
  sec_uid varchar(256),
  username varchar(120) NOT NULL,
  nickname varchar(120) NOT NULL,
  profile_picture_url text,
  gift_id varchar(80) NOT NULL,
  gift_name varchar(120) NOT NULL,
  gift_image_url text,
  diamond_count integer,
  gift_count integer NOT NULL,
  event_timestamp timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS tiktok_live_gifts_event_key_uidx
  ON tiktok_live_gifts(event_key);
CREATE INDEX IF NOT EXISTS tiktok_live_gifts_session_created_idx
  ON tiktok_live_gifts(live_session_id, created_at);

CREATE OR REPLACE FUNCTION public.delete_live_session_children()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM queue_events AS event
  USING queue_entries AS entry
  WHERE event.queue_entry_id = entry.id
    AND entry.live_session_id = OLD.id;

  DELETE FROM queue_entries WHERE live_session_id = OLD.id;
  DELETE FROM pending_questions WHERE live_session_id = OLD.id;
  DELETE FROM question_credits WHERE live_session_id = OLD.id;
  DELETE FROM tiktok_processed_events WHERE live_session_id = OLD.id;
  DELETE FROM tiktok_live_comments WHERE live_session_id = OLD.id;
  DELETE FROM tiktok_live_gifts WHERE live_session_id = OLD.id;

  RETURN OLD;
END;
$$;
