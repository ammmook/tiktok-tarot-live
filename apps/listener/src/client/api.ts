import type { ListenerConfig } from "../index.js";
import type { ListenerStatusPayload, NormalizedTikTokEvent } from "../types.js";

type OutboundRequest = { path: "/internal/tiktok/events" | "/internal/tiktok/status"; body: NormalizedTikTokEvent | ListenerStatusPayload; attempts: number };

const retryDelaysMs = [1_000, 2_000, 5_000, 10_000, 30_000];

function delayForAttempt(attempt: number) {
  const base = retryDelaysMs[Math.min(attempt, retryDelaysMs.length - 1)] ?? 30_000;
  return base + Math.floor(Math.random() * Math.min(1_000, base * 0.2));
}

export interface QueueIngestEvent {
  eventId: string;
  tiktokUserId?: string;
  tiktokUsername: string;
  displayName: string;
  question: string;
  giftRuleId: string;
  giftCount: number;
}

export interface QuestionIngestEvent {
  eventId: string;
  tiktokUserId?: string;
  tiktokUsername: string;
  displayName: string;
  question: string;
}

function listenerHeaders(config: ListenerConfig) {
  if (!config.listenerSecret) throw new Error("LISTENER_SECRET is required");
  return { "content-type": "application/json", authorization: `Bearer ${config.listenerSecret}` };
}

/** Compatibility helpers for manually-created dashboard events. Live events use ListenerBackendClient. */
export async function enqueueFromTikTok(config: ListenerConfig, event: QueueIngestEvent) {
  const response = await fetch(`${config.apiBaseUrl.replace(/\/$/, "")}/api/ingest/queue`, {
    method: "POST", headers: listenerHeaders(config), body: JSON.stringify({ ...event, idempotencyKey: event.eventId, externalEventId: event.eventId }),
  });
  if (!response.ok) throw new Error(`Queue ingest failed with status ${response.status}`);
  return response.json() as Promise<{ data: unknown; replayed?: boolean }>;
}

export async function enqueueQuestionFromTikTok(config: ListenerConfig, event: QuestionIngestEvent) {
  const response = await fetch(`${config.apiBaseUrl.replace(/\/$/, "")}/api/ingest/question`, {
    method: "POST", headers: listenerHeaders(config), body: JSON.stringify({ ...event, idempotencyKey: event.eventId, externalEventId: event.eventId }),
  });
  if (!response.ok) throw new Error(`Question ingest failed with status ${response.status}`);
  return response.json() as Promise<{ data: unknown; replayed?: boolean }>;
}

export class ListenerBackendClient {
  private closed = false;
  private readonly queue: OutboundRequest[] = [];
  private processing = false;
  private retryTimer: NodeJS.Timeout | undefined;
  private readonly capacity: number;

  constructor(private readonly config: ListenerConfig, capacity: number, private readonly onStateChange: (online: boolean, detail?: string) => void) {
    this.capacity = capacity;
  }

  publishEvent(event: NormalizedTikTokEvent) {
    this.enqueue({ path: "/internal/tiktok/events", body: event, attempts: 0 });
  }

  reportStatus(status: ListenerStatusPayload) {
    this.enqueue({ path: "/internal/tiktok/status", body: status, attempts: 0 });
  }

  private enqueue(request: OutboundRequest) {
    if (this.closed) return;
    if (this.queue.length >= this.capacity) {
      this.onStateChange(false, "Outbound retry buffer is full");
      console.error("Listener retry buffer is full; dropping newest outbound message");
      return;
    }
    this.queue.push(request);
    void this.drain();
  }

  private async drain() {
    if (this.processing || this.closed) return;
    this.processing = true;
    try {
      while (this.queue.length && !this.closed) {
        const current = this.queue[0];
        try {
          const response = await fetch(`${this.config.apiBaseUrl.replace(/\/$/, "")}${current.path}`, {
            method: "POST", headers: listenerHeaders(this.config), body: JSON.stringify(current.body), signal: AbortSignal.timeout(10_000),
          });
          if (!response.ok) {
            if (response.status >= 400 && response.status < 500 && response.status !== 429) {
              this.queue.shift();
              const detail = `Backend rejected outbound message with ${response.status}`;
              this.onStateChange(false, detail);
              console.error(detail);
              continue;
            }
            throw new Error(`Backend responded with ${response.status}`);
          }
          this.queue.shift();
          this.onStateChange(true);
        } catch (error) {
          if (this.closed) return;
          current.attempts += 1;
          this.onStateChange(false, error instanceof Error ? error.message : "Backend request failed");
          const wait = delayForAttempt(current.attempts - 1);
          this.retryTimer = setTimeout(() => { this.retryTimer = undefined; void this.drain(); }, wait);
          return;
        }
      }
    } finally {
      this.processing = false;
    }
  }

  async flush(timeoutMs = 5_000) {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = undefined;
    }
    void this.drain();
    const deadline = Date.now() + timeoutMs;
    while ((this.processing || this.queue.length) && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  close() {
    this.closed = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = undefined;
    this.queue.length = 0;
  }
}
