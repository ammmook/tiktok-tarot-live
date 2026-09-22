import type { GiftRuleDto, QueueEntryDto, QueueRow, QueueSettingsDto } from "./types.js";

const statusMap = {
  WAITING: "waiting",
  ANSWERING: "answering",
  ANSWERED: "answered",
  CANCELLED: "cancelled",
  DELETED: "deleted",
  SKIPPED: "skipped",
  PENDING_QUESTION: "pending_question",
  PENDING_APPROVAL: "pending_approval",
} as const;

const queueTypeMap = { NORMAL: "normal", EXPRESS: "express" } as const;

export function toGiftRuleDto(value: Record<string, unknown>): GiftRuleDto {
  return {
    id: String(value.id),
    giftCode: String(value.giftCode),
    displayName: String(value.displayName),
    icon: String(value.icon),
    priority: Number(value.priority),
    queueType: value.queueType === "EXPRESS" ? "express" : "normal",
    questionLimit: Number(value.questionLimit),
    unlimitedQuestions: Boolean(value.unlimitedQuestions),
    multiplicationMode: value.multiplicationMode === "FIXED" ? "fixed" : value.multiplicationMode === "CAPPED" ? "capped" : "multiply",
    maxQuestions: value.maxQuestions === null || value.maxQuestions === undefined ? null : Number(value.maxQuestions),
    maximumQuestionsPerUser: value.maximumQuestionsPerUser === null || value.maximumQuestionsPerUser === undefined ? null : Number(value.maximumQuestionsPerUser),
    minimumGiftCount: Number(value.minimumGiftCount),
    isExpress: Boolean(value.isExpress),
    autoQueue: Boolean(value.autoQueue),
    requireQuestion: Boolean(value.requireQuestion),
    active: Boolean(value.active),
    colorTag: String(value.colorTag).toLowerCase() as GiftRuleDto["colorTag"],
    displayOrder: Number(value.displayOrder),
    expressBehavior: value.expressBehavior === "AFTER_EXPRESS_GROUP" ? "after_express_group" : "before_normal",
    respectExistingExpressQueue: Boolean(value.respectExistingExpressQueue),
  };
}

export function toQueueEntryDto(row: QueueRow): QueueEntryDto {
  const status = statusMap[row.status];
  const queueType = queueTypeMap[row.queueType];
  return {
    id: row.id,
    number: row.queueNumber,
    tiktokUserId: row.userId ?? row.username.replace(/^@+/, ""),
    tiktokUsername: row.username,
    tiktokNickname: row.nickname ?? undefined,
    profilePictureUrl: row.profilePictureUrl ?? undefined,
    displayName: row.displayName,
    giftName: row.giftName,
    giftIcon: row.giftIcon,
    giftImageUrl: row.giftImageUrl ?? undefined,
    giftPriority: row.priority,
    question: row.question,
    status,
    createdAt: row.createdAt.getTime(),
    answerStartedAt: row.startedAt?.getTime(),
    answeredAt: row.answeredAt?.getTime(),
    cancelledAt: row.cancelledAt?.getTime(),
    deletedAt: row.deletedAt?.getTime(),
    giftRuleId: row.giftId,
    giftCount: row.giftCount,
    queueType,
    questionRights: row.questionRights,
    ruleSnapshot: toGiftRuleDto(row.ruleSnapshot),
    queueEnteredAt: row.queueEnteredAt?.getTime(),
    movedToEnd: row.movedToEnd,
    restoreNext: row.restoreNext,
    pendingReason: row.pendingReason ?? undefined,
  };
}

export function toGiftRuleValues(rule: GiftRuleDto) {
  return {
    id: rule.id,
    giftCode: rule.giftCode.trim().toLowerCase(),
    displayName: rule.displayName.trim(),
    icon: rule.icon.trim() || "🎁",
    priority: rule.priority,
    queueType: rule.queueType === "express" ? "EXPRESS" as const : "NORMAL" as const,
    questionLimit: rule.questionLimit,
    unlimitedQuestions: rule.unlimitedQuestions,
    multiplicationMode: rule.multiplicationMode.toUpperCase(),
    maxQuestions: rule.maxQuestions,
    maximumQuestionsPerUser: rule.maximumQuestionsPerUser,
    minimumGiftCount: rule.minimumGiftCount,
    isExpress: rule.queueType === "express",
    autoQueue: rule.autoQueue,
    requireQuestion: rule.requireQuestion,
    active: rule.active,
    colorTag: rule.colorTag.toUpperCase(),
    displayOrder: rule.displayOrder,
    expressBehavior: rule.expressBehavior.toUpperCase(),
    respectExistingExpressQueue: rule.respectExistingExpressQueue,
    updatedAt: new Date(),
  };
}

export function toQueueSettingsValues(settings: QueueSettingsDto) {
  return {
    id: "default",
    protectCurrentQuestion: settings.protectCurrentQuestion,
    fifoSamePriority: settings.fifoSamePriority,
    autoAdvance: settings.autoAdvance,
    skippedBehavior: settings.skippedBehavior.toUpperCase(),
    duplicateQuestionMode: settings.duplicateQuestionMode.toUpperCase(),
    upgradeExistingQueueOnExpress: settings.upgradeExistingQueueOnExpress,
    maxActiveQueues: settings.maxActiveQueues,
    maxQuestionLength: settings.maxQuestionLength,
    pendingExpirationMinutes: settings.pendingExpirationMinutes,
    keepAnsweredHistory: settings.keepAnsweredHistory,
    confirmBeforeDelete: settings.confirmBeforeDelete,
    showTikTokUsername: settings.showTikTokUsername,
    showGiftName: settings.showGiftName,
    compactMode: settings.compactMode,
    updatedAt: new Date(),
  };
}

export function toQueueSettingsDto(value: Record<string, unknown>): QueueSettingsDto {
  return {
    protectCurrentQuestion: Boolean(value.protectCurrentQuestion),
    fifoSamePriority: Boolean(value.fifoSamePriority),
    autoAdvance: Boolean(value.autoAdvance),
    skippedBehavior: value.skippedBehavior === "END_OF_PRIORITY" ? "end_of_priority" : "skipped_tab",
    duplicateQuestionMode: value.duplicateQuestionMode === "ALLOW" ? "allow" : value.duplicateQuestionMode === "BLOCK" ? "block" : "warn",
    upgradeExistingQueueOnExpress: Boolean(value.upgradeExistingQueueOnExpress),
    maxActiveQueues: value.maxActiveQueues === null || value.maxActiveQueues === undefined ? null : Number(value.maxActiveQueues),
    maxQuestionLength: value.maxQuestionLength === null || value.maxQuestionLength === undefined ? null : Number(value.maxQuestionLength),
    pendingExpirationMinutes: value.pendingExpirationMinutes === null || value.pendingExpirationMinutes === undefined ? null : Number(value.pendingExpirationMinutes),
    keepAnsweredHistory: Boolean(value.keepAnsweredHistory),
    confirmBeforeDelete: Boolean(value.confirmBeforeDelete),
    showTikTokUsername: Boolean(value.showTikTokUsername),
    showGiftName: Boolean(value.showGiftName),
    compactMode: Boolean(value.compactMode),
  };
}
