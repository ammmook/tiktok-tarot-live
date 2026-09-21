import type { QuestionIngestEvent } from "../client/api.js";

export function parseCommentEvent(input: unknown): QuestionIngestEvent {
  if (!input || typeof input !== "object") throw new Error("Invalid TikTok comment event");
  const event = input as Record<string, unknown>;
  const eventId = String(event.eventId ?? "").trim();
  const tiktokUsername = String(event.tiktokUsername ?? "").trim();
  const question = String(event.question ?? event.comment ?? "").trim();
  if (!eventId || !tiktokUsername || !question) throw new Error("TikTok comment event is missing required fields");
  return {
    eventId,
    tiktokUserId: event.tiktokUserId ? String(event.tiktokUserId) : undefined,
    tiktokUsername,
    displayName: String(event.displayName ?? tiktokUsername),
    question,
  };
}
