import type { ListenerConfig } from "../index.js";

export interface QueueIngestEvent {
  eventId: string;
  tiktokUserId?: string;
  tiktokUsername: string;
  displayName: string;
  question: string;
  giftRuleId: string;
  giftCount: number;
}

export async function enqueueFromTikTok(config: ListenerConfig, event: QueueIngestEvent) {
  if (!config.apiKey) throw new Error("LISTENER_API_KEY is required");
  const response = await fetch(`${config.apiBaseUrl.replace(/\/$/, "")}/api/ingest/queue`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-listener-key": config.apiKey },
    body: JSON.stringify({ ...event, idempotencyKey: event.eventId, externalEventId: event.eventId }),
  });
  if (!response.ok) throw new Error(`Queue ingest failed with status ${response.status}`);
  return response.json() as Promise<{ data: unknown; replayed?: boolean }>;
}
