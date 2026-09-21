import { z } from "zod";

const queueStatus = z.enum(["waiting", "answering", "answered", "cancelled", "deleted", "skipped", "pending_question", "pending_approval"]);
const queueType = z.enum(["normal", "express"]);
const colorTag = z.enum(["default", "gold", "purple", "orange", "pink", "blue"]);

export const createQueueSchema = z.object({
  displayName: z.string().trim().min(1).max(120),
  tiktokUsername: z.string().trim().min(1).max(120),
  tiktokUserId: z.string().trim().max(120).optional(),
  question: z.string().trim().max(2000).default(""),
  giftRuleId: z.string().trim().min(1).max(80),
  giftCount: z.coerce.number().int().positive().max(100000),
  idempotencyKey: z.string().trim().min(8).max(180),
  externalEventId: z.string().trim().max(180).optional(),
  source: z.string().trim().max(32).default("dashboard"),
  allowDuplicate: z.boolean().default(false),
});

export const updateQueueSchema = z.object({
  displayName: z.string().trim().min(1).max(120).optional(),
  tiktokUsername: z.string().trim().min(1).max(120).optional(),
  question: z.string().trim().max(2000).optional(),
  giftRuleId: z.string().trim().min(1).max(80).optional(),
  giftCount: z.coerce.number().int().positive().max(100000).optional(),
  status: queueStatus.optional(),
  allowDuplicate: z.boolean().default(false),
});

export const idSchema = z.object({ id: z.string().uuid() });
export const historyQuerySchema = z.object({ limit: z.coerce.number().int().min(1).max(500).default(100) });

export const giftRuleSchema = z.object({
  id: z.string().trim().min(1).max(80),
  giftCode: z.string().trim().min(1).max(80),
  displayName: z.string().trim().min(1).max(120),
  icon: z.string().trim().max(24),
  priority: z.number().int().nonnegative(),
  queueType,
  questionLimit: z.number().int().nonnegative(),
  unlimitedQuestions: z.boolean(),
  multiplicationMode: z.enum(["multiply", "fixed", "capped"]),
  maxQuestions: z.number().int().positive().nullable(),
  maximumQuestionsPerUser: z.number().int().positive().nullable(),
  minimumGiftCount: z.number().int().positive(),
  isExpress: z.boolean(),
  autoQueue: z.boolean(),
  requireQuestion: z.boolean(),
  active: z.boolean(),
  colorTag,
  displayOrder: z.number().int().nonnegative(),
  expressBehavior: z.enum(["before_normal", "after_express_group"]),
  respectExistingExpressQueue: z.boolean(),
});

export const queueSettingsSchema = z.object({
  protectCurrentQuestion: z.boolean(),
  fifoSamePriority: z.boolean(),
  autoAdvance: z.boolean(),
  skippedBehavior: z.enum(["end_of_priority", "skipped_tab"]),
  duplicateQuestionMode: z.enum(["allow", "warn", "block"]),
  upgradeExistingQueueOnExpress: z.boolean(),
  maxActiveQueues: z.number().int().positive().nullable(),
  maxQuestionLength: z.number().int().positive().nullable(),
  pendingExpirationMinutes: z.number().int().positive().nullable(),
  keepAnsweredHistory: z.boolean(),
  confirmBeforeDelete: z.boolean(),
  showTikTokUsername: z.boolean(),
  showGiftName: z.boolean(),
  compactMode: z.boolean(),
});

export const settingsSchema = z.object({
  rules: z.array(giftRuleSchema).max(100),
  settings: queueSettingsSchema,
});

export type CreateQueueInput = z.infer<typeof createQueueSchema>;
export type UpdateQueueInput = z.infer<typeof updateQueueSchema>;
export type SettingsInput = z.infer<typeof settingsSchema>;
