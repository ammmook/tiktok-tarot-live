import type { InferSelectModel } from "drizzle-orm";
import type { questionCredits, queueEntries } from "@tarot-live/db/schema";

export type QueueStatus =
  | "waiting"
  | "answering"
  | "answered"
  | "cancelled"
  | "deleted"
  | "skipped"
  | "pending_question"
  | "pending_approval";

export type QueueType = "normal" | "express";

export interface GiftRuleDto {
  id: string;
  giftCode: string;
  displayName: string;
  icon: string;
  priority: number;
  queueType: QueueType;
  questionLimit: number;
  unlimitedQuestions: boolean;
  multiplicationMode: "multiply" | "fixed" | "capped";
  maxQuestions: number | null;
  maximumQuestionsPerUser: number | null;
  minimumGiftCount: number;
  isExpress: boolean;
  autoQueue: boolean;
  requireQuestion: boolean;
  active: boolean;
  colorTag: "default" | "gold" | "purple" | "orange" | "pink" | "blue";
  displayOrder: number;
  expressBehavior: "before_normal" | "after_express_group";
  respectExistingExpressQueue: boolean;
}

export interface QueueSettingsDto {
  protectCurrentQuestion: boolean;
  fifoSamePriority: boolean;
  autoAdvance: boolean;
  skippedBehavior: "end_of_priority" | "skipped_tab";
  duplicateQuestionMode: "allow" | "warn" | "block";
  upgradeExistingQueueOnExpress: boolean;
  maxActiveQueues: number | null;
  maxQuestionLength: number | null;
  pendingExpirationMinutes: number | null;
  keepAnsweredHistory: boolean;
  confirmBeforeDelete: boolean;
  showTikTokUsername: boolean;
  showGiftName: boolean;
  compactMode: boolean;
}

export interface QueueEntryDto {
  id: string;
  number: number;
  tiktokUserId: string;
  tiktokUsername: string;
  tiktokNickname?: string;
  profilePictureUrl?: string;
  displayName: string;
  giftName: string;
  giftIcon: string;
  giftImageUrl?: string;
  giftPriority: number;
  question: string;
  status: QueueStatus;
  createdAt: number;
  answerStartedAt?: number;
  answeredAt?: number;
  cancelledAt?: number;
  deletedAt?: number;
  giftRuleId: string;
  giftCount: number;
  queueType: QueueType;
  questionRights: number | null;
  ruleSnapshot: GiftRuleDto;
  queueEnteredAt?: number;
  movedToEnd?: boolean;
  pendingReason?: string;
}

export type QueueRow = InferSelectModel<typeof queueEntries>;
export type QuestionCreditRow = InferSelectModel<typeof questionCredits>;

export interface QueueMutationResult {
  entry: QueueEntryDto;
  relatedEntries: QueueEntryDto[];
  queueOrder: string[];
  replayed?: boolean;
  eventType?: "queue:created" | "queue:updated" | "queue:started" | "queue:completed" | "queue:cancelled" | "queue:deleted";
}
