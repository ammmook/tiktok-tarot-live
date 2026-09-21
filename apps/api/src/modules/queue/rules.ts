import type { GiftRuleDto } from "./types.js";

export function normalizeUsername(value: string) {
  return value.trim().replace(/^@+/, "").toLowerCase();
}

export function storedUsername(value: string) {
  return `@${normalizeUsername(value)}`;
}

export function normalizeQuestion(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

export function makeDedupeKey(username: string, giftRuleId: string, question: string) {
  return `${normalizeUsername(username)}|${giftRuleId}|${normalizeQuestion(question)}`.slice(0, 600);
}

export function calculateRights(rule: GiftRuleDto, giftCount: number, alreadyAllocated = 0) {
  if (giftCount < rule.minimumGiftCount) return 0;
  const raw = rule.multiplicationMode === "fixed"
    ? rule.questionLimit
    : rule.multiplicationMode === "capped"
      ? Math.min(rule.questionLimit * giftCount, rule.maxQuestions ?? Number.MAX_SAFE_INTEGER)
      : rule.questionLimit * giftCount;
  const total = rule.unlimitedQuestions ? Number.MAX_SAFE_INTEGER : raw;
  return Math.max(0, total - alreadyAllocated);
}
