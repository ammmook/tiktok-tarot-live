export type QueueStatus = "waiting" | "answering" | "answered" | "skipped" | "cancelled" | "pending_question" | "pending_approval";
export type GiftName = string;
export type QueueType = "normal" | "express";
export type ColorTag = "default" | "gold" | "purple" | "orange" | "pink" | "blue";
export interface GiftRule {
 id: string; giftCode: string; displayName: string; icon: string; priority: number;
 queueType: QueueType; questionLimit: number; unlimitedQuestions: boolean;
 multiplicationMode: "multiply" | "fixed" | "capped"; maxQuestions: number | null;
 maximumQuestionsPerUser: number | null; minimumGiftCount: number; isExpress: boolean;
 autoQueue: boolean; requireQuestion: boolean; active: boolean; colorTag: ColorTag; displayOrder: number;
 expressBehavior: "before_normal" | "after_express_group"; respectExistingExpressQueue: boolean;
}
export interface QueueSettings {
 protectCurrentQuestion: boolean; fifoSamePriority: boolean; autoAdvance: boolean;
 skippedBehavior: "end_of_priority" | "skipped_tab";
 duplicateQuestionMode: "allow" | "warn" | "block"; upgradeExistingQueueOnExpress: boolean;
 maxActiveQueues: number | null; maxQuestionLength: number | null; pendingExpirationMinutes: number | null;
 keepAnsweredHistory: boolean; confirmBeforeDelete: boolean; showTikTokUsername: boolean;
 showGiftName: boolean; compactMode: boolean;
}
export interface QueueEntry {
 id: string; number: number; tiktokUserId: string; tiktokUsername: string; displayName: string;
 giftName: GiftName; giftIcon: string; giftPriority: number; question: string; status: QueueStatus;
 createdAt: number; answerStartedAt?: number; answeredAt?: number;
 giftRuleId: string; giftCount: number; queueType: QueueType; questionRights: number | null;
 ruleSnapshot: GiftRule; queueEnteredAt?: number; movedToEnd?: boolean; pendingReason?: string;
}
export type QueueInput = Pick<QueueEntry, "tiktokUsername" | "displayName" | "question" | "giftRuleId" | "giftCount">;

