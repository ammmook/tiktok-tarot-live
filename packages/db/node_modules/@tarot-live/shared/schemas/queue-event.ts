import type { QueueEvent, QueueEventType } from "../types/queue-events.js";

const eventTypes: QueueEventType[] = ["gift", "comment", "like", "follow", "share"];

export function isQueueEvent(value: unknown): value is QueueEvent {
  if (!value || typeof value !== "object") return false;
  const event = value as Partial<QueueEvent>;
  return typeof event.type === "string"
    && eventTypes.includes(event.type as QueueEventType)
    && typeof event.userId === "string"
    && typeof event.username === "string"
    && typeof event.payload === "object"
    && event.payload !== null
    && typeof event.receivedAt === "number";
}
