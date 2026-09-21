import type { QuestionIngestEvent } from "../client/api.js";

export function parseQuestionFormat(comment: string) {
  const separator = comment.indexOf("/");
  if (separator < 1) return null;
  const displayName = comment.slice(0, separator).trim();
  const question = comment.slice(separator + 1).trim();
  if (!displayName || !question || displayName.length > 120 || question.length > 2_000) return null;
  return { displayName, question };
}

export function parseCommentEvent(input: unknown): QuestionIngestEvent {
  if (!input || typeof input !== "object") throw new Error("Invalid TikTok comment event");
  const event = input as Record<string, unknown>;
  const eventId = String(event.eventId ?? "").trim();
  const tiktokUsername = String(event.tiktokUsername ?? "").trim();
  const parsed = parseQuestionFormat(String(event.question ?? event.comment ?? "").trim());
  if (!eventId || !tiktokUsername || !parsed) throw new Error("TikTok comment event is missing required fields");
  return {
    eventId,
    tiktokUserId: event.tiktokUserId ? String(event.tiktokUserId) : undefined,
    tiktokUsername,
    displayName: String(event.displayName ?? parsed.displayName),
    question: parsed.question,
  };
}
