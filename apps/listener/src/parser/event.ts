export interface ParsedGiftEvent {
  eventId: string;
  tiktokUserId?: string;
  tiktokUsername: string;
  displayName: string;
  giftCode: string;
  giftCount: number;
  question: string;
}

export function parseGiftEvent(input: unknown): ParsedGiftEvent {
  if (!input || typeof input !== "object") throw new Error("Invalid TikTok event");
  const event = input as Record<string, unknown>;
  const eventId = String(event.eventId ?? "").trim();
  const tiktokUsername = String(event.tiktokUsername ?? "").trim();
  const giftCode = String(event.giftCode ?? "").trim().toLowerCase();
  const giftCount = Number(event.giftCount ?? 0);
  if (!eventId || !tiktokUsername || !giftCode || !Number.isInteger(giftCount) || giftCount < 1) throw new Error("TikTok gift event is missing required fields");
  return { eventId, tiktokUserId: event.tiktokUserId ? String(event.tiktokUserId) : undefined, tiktokUsername, displayName: String(event.displayName ?? tiktokUsername), giftCode, giftCount, question: String(event.question ?? "") };
}
