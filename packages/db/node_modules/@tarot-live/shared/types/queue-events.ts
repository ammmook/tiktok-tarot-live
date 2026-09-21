export type QueueEventType = "gift" | "comment" | "like" | "follow" | "share";

export interface QueueEvent {
  type: QueueEventType;
  userId: string;
  username: string;
  payload: Record<string, unknown>;
  receivedAt: number;
}
