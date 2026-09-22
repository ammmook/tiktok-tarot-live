import {
  boolean,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
  index,
} from "drizzle-orm/pg-core";

export const queueStatusEnum = pgEnum("queue_status", [
  "WAITING",
  "ANSWERING",
  "ANSWERED",
  "CANCELLED",
  "DELETED",
  "SKIPPED",
  "PENDING_QUESTION",
  "PENDING_APPROVAL",
]);

export const queueTypeEnum = pgEnum("queue_type", ["NORMAL", "EXPRESS"]);

export const giftRules = pgTable(
  "gift_rules",
  {
    id: varchar("id", { length: 80 }).primaryKey(),
    giftCode: varchar("gift_code", { length: 80 }).notNull(),
    displayName: varchar("display_name", { length: 120 }).notNull(),
    icon: varchar("icon", { length: 24 }).notNull(),
    priority: integer("priority").notNull(),
    queueType: queueTypeEnum("queue_type").notNull().default("NORMAL"),
    questionLimit: integer("question_limit").notNull().default(1),
    unlimitedQuestions: boolean("unlimited_questions").notNull().default(false),
    multiplicationMode: varchar("multiplication_mode", { length: 16 }).notNull().default("MULTIPLY"),
    maxQuestions: integer("max_questions"),
    maximumQuestionsPerUser: integer("maximum_questions_per_user"),
    minimumGiftCount: integer("minimum_gift_count").notNull().default(1),
    isExpress: boolean("is_express").notNull().default(false),
    autoQueue: boolean("auto_queue").notNull().default(true),
    requireQuestion: boolean("require_question").notNull().default(true),
    active: boolean("active").notNull().default(true),
    colorTag: varchar("color_tag", { length: 16 }).notNull().default("DEFAULT"),
    displayOrder: integer("display_order").notNull().default(0),
    expressBehavior: varchar("express_behavior", { length: 32 }).notNull().default("BEFORE_NORMAL"),
    respectExistingExpressQueue: boolean("respect_existing_express_queue").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    giftCodeUnique: uniqueIndex("gift_rules_gift_code_uidx").on(table.giftCode),
    displayOrderIndex: index("gift_rules_display_order_idx").on(table.displayOrder),
  }),
);

export const queueSettings = pgTable("queue_settings", {
  id: varchar("id", { length: 64 }).primaryKey().default("default"),
  protectCurrentQuestion: boolean("protect_current_question").notNull().default(true),
  fifoSamePriority: boolean("fifo_same_priority").notNull().default(true),
  autoAdvance: boolean("auto_advance").notNull().default(false),
  skippedBehavior: varchar("skipped_behavior", { length: 32 }).notNull().default("SKIPPED_TAB"),
  duplicateQuestionMode: varchar("duplicate_question_mode", { length: 16 }).notNull().default("WARN"),
  upgradeExistingQueueOnExpress: boolean("upgrade_existing_queue_on_express").notNull().default(true),
  maxActiveQueues: integer("max_active_queues"),
  maxQuestionLength: integer("max_question_length"),
  pendingExpirationMinutes: integer("pending_expiration_minutes"),
  keepAnsweredHistory: boolean("keep_answered_history").notNull().default(true),
  confirmBeforeDelete: boolean("confirm_before_delete").notNull().default(true),
  showTikTokUsername: boolean("show_tiktok_username").notNull().default(true),
  showGiftName: boolean("show_gift_name").notNull().default(true),
  compactMode: boolean("compact_mode").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/** One record for each TikTok room the listener has connected to. */
export const liveSessions = pgTable(
  "live_sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tiktokUsername: varchar("tiktok_username", { length: 120 }).notNull(),
    roomId: varchar("room_id", { length: 120 }).notNull(),
    status: varchar("status", { length: 32 }).notNull().default("CONNECTED"),
    connectedAt: timestamp("connected_at", { withTimezone: true }).defaultNow().notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    roomUnique: uniqueIndex("live_sessions_room_uidx").on(table.roomId),
    usernameStatusIndex: index("live_sessions_username_status_idx").on(table.tiktokUsername, table.status, table.connectedAt),
  }),
);

/** Durable event receipt log. The unique key makes listener retries and reconnects safe. */
export const tiktokProcessedEvents = pgTable(
  "tiktok_processed_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    eventKey: varchar("event_key", { length: 480 }).notNull(),
    eventId: varchar("event_id", { length: 180 }).notNull(),
    eventType: varchar("event_type", { length: 32 }).notNull(),
    liveSessionId: uuid("live_session_id").notNull().references(() => liveSessions.id),
    roomId: varchar("room_id", { length: 120 }).notNull(),
    status: varchar("status", { length: 32 }).notNull().default("RECEIVED"),
    eventTimestamp: timestamp("event_timestamp", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    eventKeyUnique: uniqueIndex("tiktok_processed_events_key_uidx").on(table.eventKey),
    sessionTypeIndex: index("tiktok_processed_events_session_type_idx").on(table.liveSessionId, table.eventType, table.createdAt),
  }),
);

/** Valid comments wait here until a credit belonging to the same TikTok account arrives. */
export const pendingQuestions = pgTable(
  "pending_questions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    liveSessionId: uuid("live_session_id").notNull().references(() => liveSessions.id),
    roomId: varchar("room_id", { length: 120 }).notNull(),
    tiktokUserId: varchar("tiktok_user_id", { length: 120 }).notNull(),
    secUid: varchar("sec_uid", { length: 256 }),
    username: varchar("username", { length: 120 }).notNull(),
    nickname: varchar("nickname", { length: 120 }).notNull(),
    profilePictureUrl: text("profile_picture_url"),
    commentMessageId: varchar("comment_message_id", { length: 180 }).notNull(),
    eventKey: varchar("event_key", { length: 480 }).notNull(),
    displayName: varchar("display_name", { length: 120 }).notNull(),
    question: text("question").notNull(),
    eventTimestamp: timestamp("event_timestamp", { withTimezone: true }).notNull(),
    status: varchar("status", { length: 32 }).notNull().default("WAITING_FOR_GIFT"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    matchedQueueEntryId: uuid("matched_queue_entry_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    eventKeyUnique: uniqueIndex("pending_questions_event_key_uidx").on(table.eventKey),
    matchingIndex: index("pending_questions_match_idx").on(table.liveSessionId, table.roomId, table.tiktokUserId, table.status, table.createdAt),
    expirationIndex: index("pending_questions_expiration_idx").on(table.status, table.expiresAt),
  }),
);

/** Last reported state for every independently deployed listener instance. */
export const listenerHealth = pgTable(
  "listener_health",
  {
    instanceId: varchar("instance_id", { length: 120 }).primaryKey(),
    tiktokUsername: varchar("tiktok_username", { length: 120 }).notNull(),
    status: varchar("status", { length: 40 }).notNull(),
    tiktokStatus: varchar("tiktok_status", { length: 40 }).notNull(),
    authenticationStatus: varchar("authentication_status", { length: 32 }).notNull().default("missing"),
    roomId: varchar("room_id", { length: 120 }),
    lastEventAt: timestamp("last_event_at", { withTimezone: true }),
    detail: varchar("detail", { length: 240 }),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    updatedIndex: index("listener_health_updated_idx").on(table.updatedAt),
  }),
);

/** A gift's unspent question allowance. One gift can fund several queue entries. */
export const questionCredits = pgTable(
  "question_credits",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    liveSessionId: uuid("live_session_id").references(() => liveSessions.id),
    roomId: varchar("room_id", { length: 120 }),
    userId: varchar("user_id", { length: 120 }),
    secUid: varchar("sec_uid", { length: 256 }),
    username: varchar("username", { length: 120 }).notNull(),
    displayName: varchar("display_name", { length: 120 }).notNull(),
    nickname: varchar("nickname", { length: 120 }),
    profilePictureUrl: text("profile_picture_url"),
    giftId: varchar("gift_id", { length: 80 }).notNull(),
    giftName: varchar("gift_name", { length: 120 }).notNull(),
    giftIcon: varchar("gift_icon", { length: 24 }).notNull(),
    giftImageUrl: text("gift_image_url"),
    priority: integer("priority").notNull(),
    queueType: queueTypeEnum("queue_type").notNull(),
    giftCount: integer("gift_count").notNull().default(1),
    initialQuestions: integer("initial_questions"),
    remainingQuestions: integer("remaining_questions"),
    ruleSnapshot: jsonb("rule_snapshot").$type<Record<string, unknown>>().notNull(),
    idempotencyKey: varchar("idempotency_key", { length: 180 }).notNull(),
    externalEventId: varchar("external_event_id", { length: 180 }),
    source: varchar("source", { length: 32 }).notNull().default("dashboard"),
    status: varchar("status", { length: 32 }).notNull().default("ACTIVE"),
    eventTimestamp: timestamp("event_timestamp", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    idempotencyUnique: uniqueIndex("question_credits_idempotency_uidx").on(table.idempotencyKey),
    externalEventUnique: uniqueIndex("question_credits_external_event_uidx").on(table.externalEventId),
    usernameRemainingIndex: index("question_credits_username_remaining_idx").on(table.username, table.remainingQuestions, table.createdAt),
    matchingIndex: index("question_credits_match_idx").on(table.liveSessionId, table.roomId, table.userId, table.status, table.createdAt),
    expirationIndex: index("question_credits_expiration_idx").on(table.status, table.expiresAt),
  }),
);

export const queueEntries = pgTable(
  "queue_entries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    queueNumber: serial("queue_number").notNull(),
    liveSessionId: uuid("live_session_id").references(() => liveSessions.id),
    roomId: varchar("room_id", { length: 120 }),
    userId: varchar("user_id", { length: 120 }),
    secUid: varchar("sec_uid", { length: 256 }),
    username: varchar("username", { length: 120 }).notNull(),
    displayName: varchar("display_name", { length: 120 }).notNull(),
    nickname: varchar("nickname", { length: 120 }),
    profilePictureUrl: text("profile_picture_url"),
    question: text("question").notNull().default(""),
    giftId: varchar("gift_id", { length: 80 }).notNull(),
    giftName: varchar("gift_name", { length: 120 }).notNull(),
    giftIcon: varchar("gift_icon", { length: 24 }).notNull(),
    giftImageUrl: text("gift_image_url"),
    priority: integer("priority").notNull(),
    queueType: queueTypeEnum("queue_type").notNull(),
    giftCount: integer("gift_count").notNull().default(1),
    questionRights: integer("question_rights"),
    creditId: uuid("credit_id").references(() => questionCredits.id),
    pendingQuestionId: uuid("pending_question_id").references(() => pendingQuestions.id),
    ruleSnapshot: jsonb("rule_snapshot").$type<Record<string, unknown>>().notNull(),
    status: queueStatusEnum("status").notNull().default("WAITING"),
    pendingReason: varchar("pending_reason", { length: 240 }),
    idempotencyKey: varchar("idempotency_key", { length: 180 }).notNull(),
    externalEventId: varchar("external_event_id", { length: 180 }),
    dedupeKey: varchar("dedupe_key", { length: 600 }),
    source: varchar("source", { length: 32 }).notNull().default("dashboard"),
    queueEnteredAt: timestamp("queue_entered_at", { withTimezone: true }),
    movedToEnd: boolean("moved_to_end").notNull().default(false),
    restoreNext: boolean("restore_next").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    answeredAt: timestamp("answered_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    idempotencyUnique: uniqueIndex("queue_entries_idempotency_uidx").on(table.idempotencyKey),
    externalEventUnique: uniqueIndex("queue_entries_external_event_uidx").on(table.externalEventId),
    dedupeUnique: uniqueIndex("queue_entries_active_dedupe_uidx").on(table.dedupeKey),
    statusCreatedIndex: index("queue_entries_status_created_idx").on(table.status, table.createdAt),
    orderingIndex: index("queue_entries_ordering_idx").on(table.status, table.priority, table.createdAt),
    priorityCreatedIndex: index("queue_entries_priority_created_idx").on(table.priority, table.createdAt),
    usernameStatusIndex: index("queue_entries_username_status_idx").on(table.username, table.status),
    creditIndex: index("queue_entries_credit_idx").on(table.creditId, table.createdAt),
    liveUserIndex: index("queue_entries_live_user_idx").on(table.liveSessionId, table.roomId, table.userId, table.createdAt),
  }),
);

export const queueEvents = pgTable(
  "queue_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    queueEntryId: uuid("queue_entry_id").notNull(),
    eventType: varchar("event_type", { length: 40 }).notNull(),
    fromStatus: queueStatusEnum("from_status"),
    toStatus: queueStatusEnum("to_status"),
    payload: jsonb("payload").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    queueEntryIndex: index("queue_events_queue_entry_idx").on(table.queueEntryId, table.createdAt),
  }),
);
