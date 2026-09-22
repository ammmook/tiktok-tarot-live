import { and, asc, eq, gt, inArray, isNull, or, sql } from "drizzle-orm";
import type { Database } from "@tarot-live/db";
import { giftRules, questionCredits, queueEntries, queueSettings } from "@tarot-live/db/schema";
import { conflict, invalidTransition, notFound } from "../../errors/app-error.js";
import { calculateRights, makeDedupeKey, storedUsername } from "./rules.js";
import { activeStatuses, getGiftRules, getSettings, queueOrder, recordEvent } from "./repository.js";
import { toGiftRuleDto, toGiftRuleValues, toQueueEntryDto, toQueueSettingsValues } from "./mapping.js";
import type { GiftRuleDto, QuestionCreditRow, QueueMutationResult, QueueRow, QueueSettingsDto } from "./types.js";
import type { CreateQuestionInput, CreateQueueInput, SettingsInput, UpdateQueueInput } from "./schemas.js";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

const admittedStatuses = ["WAITING", "ANSWERING", "SKIPPED"] as const;

const awaitingGiftRule: GiftRuleDto = {
  id: "awaiting-gift", giftCode: "awaiting-gift", displayName: "Awaiting Gift", icon: "⏳",
  priority: 2_147_483_647, queueType: "normal", questionLimit: 0, unlimitedQuestions: false,
  multiplicationMode: "fixed", maxQuestions: null, maximumQuestionsPerUser: null,
  minimumGiftCount: 1, isExpress: false, autoQueue: false, requireQuestion: true, active: true,
  colorTag: "default", displayOrder: 0, expressBehavior: "before_normal", respectExistingExpressQueue: true,
};

function hasCredit(credit: QuestionCreditRow | undefined) {
  return Boolean(credit && (credit.remainingQuestions === null || credit.remainingQuestions > 0));
}

async function lockUser(tx: Transaction, username: string) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${username}, 0))`);
}

async function lockQueue(tx: Transaction) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended('tarot-live-queue-state', 0))`);
}

async function getCredit(tx: Transaction, id: string) {
  const [credit] = await tx.select().from(questionCredits).where(eq(questionCredits.id, id)).limit(1);
  return credit;
}

async function findAvailableCredit(tx: Transaction, username: string) {
  const [credit] = await tx.select().from(questionCredits)
    .where(and(eq(questionCredits.username, username), eq(questionCredits.status, "ACTIVE"), or(isNull(questionCredits.remainingQuestions), gt(questionCredits.remainingQuestions, 0))))
    .orderBy(asc(questionCredits.createdAt), asc(questionCredits.id)).limit(1);
  return credit;
}

async function consumeCredit(tx: Transaction, credit: QuestionCreditRow) {
  if (!hasCredit(credit)) throw conflict("This gift has no remaining question credits");
  const remainingQuestions = credit.remainingQuestions === null ? null : credit.remainingQuestions - 1;
  const [updated] = await tx.update(questionCredits)
    .set({ remainingQuestions, updatedAt: new Date() })
    .where(eq(questionCredits.id, credit.id)).returning();
  return updated;
}

async function countUnspentForRule(tx: Transaction, username: string, giftId: string) {
  const rows = await tx.select({ remaining: questionCredits.remainingQuestions }).from(questionCredits)
    .where(and(eq(questionCredits.username, username), eq(questionCredits.giftId, giftId), eq(questionCredits.status, "ACTIVE")));
  if (rows.some((row) => row.remaining === null)) return Number.MAX_SAFE_INTEGER;
  return rows.reduce((total, row) => total + (row.remaining ?? 0), 0);
}

async function countAdmitted(tx: Transaction) {
  const rows = await tx.select({ id: queueEntries.id }).from(queueEntries)
    .where(inArray(queueEntries.status, admittedStatuses));
  return rows.length;
}

async function resolvePlacement(tx: Transaction, settings: QueueSettingsDto) {
  if (!settings.maxActiveQueues) return { status: "WAITING" as const, pendingReason: null };
  await lockQueue(tx);
  return (await countAdmitted(tx)) >= settings.maxActiveQueues
    ? { status: "PENDING_APPROVAL" as const, pendingReason: "max_active_queues" }
    : { status: "WAITING" as const, pendingReason: null };
}

async function mutation(tx: Transaction, entry: QueueRow, relatedEntries: QueueRow[] = [], eventType: QueueMutationResult["eventType"]): Promise<QueueMutationResult> {
  const rows = await tx.select().from(queueEntries).where(inArray(queueEntries.status, activeStatuses)).orderBy(queueOrder());
  return {
    entry: toQueueEntryDto(entry),
    relatedEntries: relatedEntries.map(toQueueEntryDto),
    queueOrder: rows.map((row) => row.id),
    eventType,
  };
}

function assertQuestionLength(question: string, settings: QueueSettingsDto) {
  if (settings.maxQuestionLength && question.length > settings.maxQuestionLength) {
    throw conflict("Question exceeds the configured character limit");
  }
}

function validateRule(rule: GiftRuleDto | null, giftCount: number): asserts rule is GiftRuleDto {
  if (!rule || !rule.active) throw conflict("Gift rule is not available");
  if (giftCount < rule.minimumGiftCount) throw conflict("Gift count is below the configured minimum");
}

async function recordCreated(tx: Transaction, entry: QueueRow, source: string) {
  await recordEvent(tx as unknown as Database, entry.id, "created", null, entry.status, { source });
}

type Identity = {
  username: string;
  userId?: string;
  displayName: string;
  question: string;
  idempotencyKey: string;
  externalEventId?: string;
  source: string;
  dedupeKey: string | null;
};

function identity(input: CreateQueueInput | CreateQuestionInput, username: string, question: string): Identity {
  return {
    username,
    userId: input.tiktokUserId,
    displayName: input.displayName.trim(),
    question,
    idempotencyKey: input.idempotencyKey,
    externalEventId: input.externalEventId,
    source: input.source,
    dedupeKey: question ? makeDedupeKey(username, "question", question) : null,
  };
}

async function createPaidEntry(tx: Transaction, input: Identity, credit: QuestionCreditRow, settings: QueueSettingsDto) {
  const placement = await resolvePlacement(tx, settings);
  const now = new Date();
  const [entry] = await tx.insert(queueEntries).values({
    userId: input.userId ?? credit.userId ?? input.username.slice(1),
    username: input.username,
    displayName: input.displayName,
    question: input.question,
    giftId: credit.giftId,
    giftName: credit.giftName,
    giftIcon: credit.giftIcon,
    priority: credit.priority,
    queueType: credit.queueType,
    giftCount: credit.giftCount,
    questionRights: credit.remainingQuestions,
    creditId: credit.id,
    ruleSnapshot: credit.ruleSnapshot,
    status: placement.status,
    pendingReason: placement.pendingReason,
    idempotencyKey: input.idempotencyKey,
    externalEventId: input.externalEventId,
    dedupeKey: input.dedupeKey,
    source: input.source,
    queueEnteredAt: placement.status === "WAITING" ? now : null,
    createdAt: now,
    updatedAt: now,
  }).returning();
  await recordCreated(tx, entry, input.source);
  return entry;
}

async function createGiftPlaceholder(tx: Transaction, input: CreateQueueInput, username: string, credit: QuestionCreditRow) {
  const now = new Date();
  const [entry] = await tx.insert(queueEntries).values({
    userId: input.tiktokUserId ?? credit.userId ?? username.slice(1),
    username,
    displayName: input.displayName.trim(),
    question: "",
    giftId: credit.giftId,
    giftName: credit.giftName,
    giftIcon: credit.giftIcon,
    priority: credit.priority,
    queueType: credit.queueType,
    giftCount: credit.giftCount,
    questionRights: credit.remainingQuestions,
    creditId: credit.id,
    ruleSnapshot: credit.ruleSnapshot,
    status: "PENDING_QUESTION",
    pendingReason: "question_required",
    idempotencyKey: input.idempotencyKey,
    externalEventId: input.externalEventId,
    dedupeKey: null,
    source: input.source,
    createdAt: now,
    updatedAt: now,
  }).returning();
  await recordCreated(tx, entry, input.source);
  return entry;
}

async function createAwaitingGiftEntry(tx: Transaction, input: Identity) {
  const now = new Date();
  const [entry] = await tx.insert(queueEntries).values({
    userId: input.userId ?? input.username.slice(1),
    username: input.username,
    displayName: input.displayName,
    question: input.question,
    giftId: awaitingGiftRule.id,
    giftName: awaitingGiftRule.displayName,
    giftIcon: awaitingGiftRule.icon,
    priority: awaitingGiftRule.priority,
    queueType: "NORMAL",
    giftCount: 1,
    questionRights: 0,
    ruleSnapshot: awaitingGiftRule as unknown as Record<string, unknown>,
    status: "PENDING_APPROVAL",
    pendingReason: "awaiting_gift",
    idempotencyKey: input.idempotencyKey,
    externalEventId: input.externalEventId,
    dedupeKey: input.dedupeKey,
    source: input.source,
    createdAt: now,
    updatedAt: now,
  }).returning();
  await recordCreated(tx, entry, input.source);
  return entry;
}

async function fillGiftPlaceholder(
  tx: Transaction,
  row: QueueRow,
  question: string,
  settings: QueueSettingsDto,
  event?: Pick<CreateQuestionInput, "idempotencyKey" | "externalEventId">,
) {
  if (!row.creditId) throw conflict("This pending queue does not have a gift credit");
  const credit = await getCredit(tx, row.creditId);
  if (!hasCredit(credit)) throw conflict("This gift has no remaining question credits");
  const consumed = await consumeCredit(tx, credit);
  const placement = await resolvePlacement(tx, settings);
  const now = new Date();
  const [updated] = await tx.update(queueEntries).set({
    question,
    questionRights: consumed.remainingQuestions,
    status: placement.status,
    pendingReason: placement.pendingReason,
    dedupeKey: makeDedupeKey(row.username, "question", question),
    idempotencyKey: event?.idempotencyKey ?? row.idempotencyKey,
    externalEventId: event?.externalEventId ?? row.externalEventId,
    queueEnteredAt: placement.status === "WAITING" ? now : null,
    updatedAt: now,
  }).where(eq(queueEntries.id, row.id)).returning();
  await recordEvent(tx as unknown as Database, row.id, "question_attached", row.status, updated.status, { creditId: consumed.id });
  return updated;
}

async function matchAwaitingQuestion(tx: Transaction, row: QueueRow, credit: QuestionCreditRow, settings: QueueSettingsDto) {
  const consumed = await consumeCredit(tx, credit);
  const placement = await resolvePlacement(tx, settings);
  const now = new Date();
  const [updated] = await tx.update(queueEntries).set({
    userId: row.userId ?? credit.userId ?? row.username.slice(1),
    giftId: credit.giftId,
    giftName: credit.giftName,
    giftIcon: credit.giftIcon,
    priority: credit.priority,
    queueType: credit.queueType,
    giftCount: credit.giftCount,
    questionRights: consumed.remainingQuestions,
    creditId: credit.id,
    ruleSnapshot: credit.ruleSnapshot,
    status: placement.status,
    pendingReason: placement.pendingReason,
    dedupeKey: makeDedupeKey(row.username, "question", row.question),
    queueEnteredAt: placement.status === "WAITING" ? now : null,
    updatedAt: now,
  }).where(eq(queueEntries.id, row.id)).returning();
  await recordEvent(tx as unknown as Database, row.id, "gift_matched", row.status, updated.status, { creditId: consumed.id });
  return updated;
}

async function queueReplay(tx: Transaction, idempotencyKey: string, externalEventId?: string) {
  const [row] = await tx.select().from(queueEntries).where(externalEventId
    ? or(eq(queueEntries.idempotencyKey, idempotencyKey), eq(queueEntries.externalEventId, externalEventId))
    : eq(queueEntries.idempotencyKey, idempotencyKey)).limit(1);
  return row;
}

async function creditReplay(tx: Transaction, idempotencyKey: string, externalEventId?: string) {
  const [credit] = await tx.select().from(questionCredits).where(externalEventId
    ? or(eq(questionCredits.idempotencyKey, idempotencyKey), eq(questionCredits.externalEventId, externalEventId))
    : eq(questionCredits.idempotencyKey, idempotencyKey)).limit(1);
  if (!credit) return undefined;
  const [entry] = await tx.select().from(queueEntries).where(eq(queueEntries.creditId, credit.id)).orderBy(asc(queueEntries.createdAt)).limit(1);
  return entry;
}

export async function createQueue(db: Database, input: CreateQueueInput): Promise<QueueMutationResult> {
  try {
    return await db.transaction(async (tx) => {
      const replay = await queueReplay(tx, input.idempotencyKey, input.externalEventId) ?? await creditReplay(tx, input.idempotencyKey, input.externalEventId);
      if (replay) return { ...(await mutation(tx, replay, [], "queue:created")), replayed: true };

      const settings = await getSettings(tx as unknown as Database);
      const [ruleRow] = await tx.select().from(giftRules).where(eq(giftRules.id, input.giftRuleId)).limit(1);
      const rule = ruleRow ? toGiftRuleDto(ruleRow as unknown as Record<string, unknown>) : null;
      validateRule(rule, input.giftCount);
      const question = input.question.trim();
      assertQuestionLength(question, settings);

      const username = storedUsername(input.tiktokUsername);
      await lockUser(tx, username);
      const replayAfterLock = await queueReplay(tx, input.idempotencyKey, input.externalEventId) ?? await creditReplay(tx, input.idempotencyKey, input.externalEventId);
      if (replayAfterLock) return { ...(await mutation(tx, replayAfterLock, [], "queue:created")), replayed: true };
      if (question && !input.allowDuplicate) {
        const [duplicate] = await tx.select().from(queueEntries).where(and(
          eq(queueEntries.dedupeKey, makeDedupeKey(username, "question", question)),
          inArray(queueEntries.status, activeStatuses),
        )).limit(1);
        if (duplicate) throw conflict("An active queue already exists for this user and question");
      }
      const granted = rule.unlimitedQuestions ? null : calculateRights(rule, input.giftCount, await countUnspentForRule(tx, username, rule.id));
      if (granted === 0) throw conflict("This user has no remaining question rights");

      const now = new Date();
      const [credit] = await tx.insert(questionCredits).values({
        userId: input.tiktokUserId ?? username.slice(1),
        username,
        displayName: input.displayName.trim(),
        giftId: rule.id,
        giftName: rule.displayName,
        giftIcon: rule.icon,
        priority: rule.priority,
        queueType: rule.queueType === "express" ? "EXPRESS" : "NORMAL",
        giftCount: input.giftCount,
        initialQuestions: granted,
        remainingQuestions: granted,
        ruleSnapshot: rule as unknown as Record<string, unknown>,
        idempotencyKey: input.idempotencyKey,
        externalEventId: input.externalEventId,
        source: input.source,
        createdAt: now,
        updatedAt: now,
      }).returning();

      const awaiting = await tx.select().from(queueEntries).where(and(
        eq(queueEntries.username, username),
        eq(queueEntries.status, "PENDING_APPROVAL"),
        eq(queueEntries.pendingReason, "awaiting_gift"),
        isNull(queueEntries.creditId),
      )).orderBy(asc(queueEntries.createdAt), asc(queueEntries.queueNumber));

      const promoted: QueueRow[] = [];
      let available: QuestionCreditRow | undefined = credit;
      for (const row of awaiting) {
        if (!hasCredit(available)) break;
        promoted.push(await matchAwaitingQuestion(tx, row, available, settings));
        available = await getCredit(tx, credit.id);
      }

      let primary: QueueRow;
      if (question) {
        const item = identity(input, username, question);
        if (hasCredit(available)) primary = await createPaidEntry(tx, item, await consumeCredit(tx, available), settings);
        else primary = await createAwaitingGiftEntry(tx, item);
      } else if (hasCredit(available)) {
        primary = await createGiftPlaceholder(tx, input, username, available);
      } else if (promoted.length) {
        primary = promoted.shift() as QueueRow;
      } else {
        throw conflict("The gift could not be matched to a question");
      }

      return mutation(tx, primary, promoted.filter((entry) => entry.id !== primary.id), "queue:created");
    });
  } catch (error) {
    if (error instanceof Error && /duplicate key|unique constraint/i.test(error.message)) {
      const replay = await db.transaction((tx) => queueReplay(tx, input.idempotencyKey, input.externalEventId) ?? creditReplay(tx, input.idempotencyKey, input.externalEventId));
      if (replay) return { ...(await mutation(db as unknown as Transaction, replay, [], "queue:created")), replayed: true };
    }
    throw error;
  }
}

export async function createQuestion(db: Database, input: CreateQuestionInput): Promise<QueueMutationResult> {
  try {
    return await db.transaction(async (tx) => {
      const replay = await queueReplay(tx, input.idempotencyKey, input.externalEventId);
      if (replay) return { ...(await mutation(tx, replay, [], "queue:created")), replayed: true };

      const settings = await getSettings(tx as unknown as Database);
      const question = input.question.trim();
      assertQuestionLength(question, settings);
      const username = storedUsername(input.tiktokUsername);
      await lockUser(tx, username);
      const replayAfterLock = await queueReplay(tx, input.idempotencyKey, input.externalEventId);
      if (replayAfterLock) return { ...(await mutation(tx, replayAfterLock, [], "queue:created")), replayed: true };
      const dedupeKey = makeDedupeKey(username, "question", question);
      if (!input.allowDuplicate) {
        const [duplicate] = await tx.select().from(queueEntries).where(and(eq(queueEntries.dedupeKey, dedupeKey), inArray(queueEntries.status, activeStatuses))).limit(1);
        if (duplicate) throw conflict("An active queue already exists for this user and question");
      }

      const placeholders = await tx.select().from(queueEntries).where(and(
        eq(queueEntries.username, username), eq(queueEntries.status, "PENDING_QUESTION"), eq(queueEntries.question, ""),
      )).orderBy(asc(queueEntries.createdAt), asc(queueEntries.queueNumber));
      for (const row of placeholders) {
        if (!row.creditId) continue;
        const credit = await getCredit(tx, row.creditId);
        if (hasCredit(credit)) return mutation(tx, await fillGiftPlaceholder(tx, row, question, settings, input), [], "queue:updated");
      }

      const available = await findAvailableCredit(tx, username);
      const item = identity(input, username, question);
      if (hasCredit(available)) return mutation(tx, await createPaidEntry(tx, item, await consumeCredit(tx, available), settings), [], "queue:created");
      return mutation(tx, await createAwaitingGiftEntry(tx, item), [], "queue:created");
    });
  } catch (error) {
    if (error instanceof Error && /duplicate key|unique constraint/i.test(error.message)) {
      const replay = await db.transaction((tx) => queueReplay(tx, input.idempotencyKey, input.externalEventId));
      if (replay) return { ...(await mutation(db as unknown as Transaction, replay, [], "queue:created")), replayed: true };
    }
    throw error;
  }
}

async function load(tx: Transaction, id: string) {
  const [row] = await tx.select().from(queueEntries).where(eq(queueEntries.id, id)).limit(1);
  if (!row) throw notFound();
  return row;
}

export async function updateQueue(db: Database, id: string, input: UpdateQueueInput) {
  return db.transaction(async (tx) => {
    const row = await load(tx, id);
    const settings = await getSettings(tx as unknown as Database);
    const question = input.question?.trim() ?? row.question;
    assertQuestionLength(question, settings);
    await lockUser(tx, row.username);
    if (row.status === "PENDING_QUESTION" && !row.question && question) {
      return mutation(tx, await fillGiftPlaceholder(tx, row, question, settings), [], "queue:updated");
    }
    if (input.status && input.status !== "waiting" && input.status !== "skipped") throw invalidTransition("Only waiting or skipped status can be set by update");
    const status = input.status === "waiting" ? "WAITING" : input.status === "skipped" ? "SKIPPED" : row.status;
    const [updated] = await tx.update(queueEntries).set({
      displayName: input.displayName?.trim() ?? row.displayName,
      question,
      status,
      pendingReason: status === "WAITING" && row.pendingReason === "max_active_queues" ? null : row.pendingReason,
      dedupeKey: question ? makeDedupeKey(row.username, "question", question) : row.dedupeKey,
      queueEnteredAt: status === "WAITING" || status === "SKIPPED" ? (row.queueEnteredAt ?? new Date()) : row.queueEnteredAt,
      movedToEnd: status === "SKIPPED" ? true : row.movedToEnd,
      restoreNext: status === "SKIPPED" ? false : row.restoreNext,
      updatedAt: new Date(),
    }).where(eq(queueEntries.id, id)).returning();
    await recordEvent(tx as unknown as Database, id, row.status === updated.status ? "updated" : "status_changed", row.status, updated.status);
    return mutation(tx, updated, [], "queue:updated");
  });
}

async function transition(db: Database, id: string, target: QueueRow["status"], eventType: QueueMutationResult["eventType"]) {
  return db.transaction(async (tx) => {
    await lockQueue(tx);
    const row = await load(tx, id);
    const now = new Date();
    if (target === "ANSWERING" && row.status !== "WAITING") throw invalidTransition("Only waiting queues can start");
    if (target === "ANSWERED" && row.status !== "ANSWERING") throw invalidTransition("Only the current queue can be completed");
    if (target === "CANCELLED" && ["ANSWERED", "DELETED", "CANCELLED"].includes(row.status)) throw invalidTransition("This queue is already closed");
    if (target === "DELETED" && row.status === "DELETED") throw invalidTransition("This queue is already deleted");
    const related: QueueRow[] = [];
    if (target === "ANSWERING") {
      const [current] = await tx.select().from(queueEntries).where(eq(queueEntries.status, "ANSWERING")).limit(1);
      if (current && current.id !== row.id) {
        const [skipped] = await tx.update(queueEntries).set({ status: "SKIPPED", restoreNext: false, updatedAt: now }).where(eq(queueEntries.id, current.id)).returning();
        related.push(skipped);
        await recordEvent(tx as unknown as Database, skipped.id, "auto_skipped", "ANSWERING", "SKIPPED");
      }
    }
    const values = target === "ANSWERING"
      ? { status: target, startedAt: now, queueEnteredAt: row.queueEnteredAt ?? now, restoreNext: false, updatedAt: now }
      : target === "ANSWERED"
        ? { status: target, answeredAt: now, dedupeKey: null, restoreNext: false, updatedAt: now }
        : target === "CANCELLED"
          ? { status: target, cancelledAt: now, dedupeKey: null, restoreNext: false, updatedAt: now }
          : { status: target, deletedAt: now, dedupeKey: null, restoreNext: false, updatedAt: now };
    const [updated] = await tx.update(queueEntries).set(values).where(eq(queueEntries.id, id)).returning();
    await recordEvent(tx as unknown as Database, id, (eventType ?? "queue:updated").replace("queue:", ""), row.status, target);
    const settings = await getSettings(tx as unknown as Database);
    if (target === "ANSWERED" && settings.autoAdvance) {
      const [next] = await tx.select().from(queueEntries).where(eq(queueEntries.status, "WAITING")).orderBy(queueOrder()).limit(1);
      if (next) {
        const [started] = await tx.update(queueEntries).set({ status: "ANSWERING", startedAt: now, restoreNext: false, updatedAt: now }).where(eq(queueEntries.id, next.id)).returning();
        related.push(started);
        await recordEvent(tx as unknown as Database, started.id, "auto_advanced", "WAITING", "ANSWERING");
      }
    }
    return mutation(tx, updated, related, eventType);
  });
}

export const startQueue = (db: Database, id: string) => transition(db, id, "ANSWERING", "queue:started");
export const completeQueue = (db: Database, id: string) => transition(db, id, "ANSWERED", "queue:completed");
export const cancelQueue = (db: Database, id: string) => transition(db, id, "CANCELLED", "queue:cancelled");
export const deleteQueue = (db: Database, id: string) => transition(db, id, "DELETED", "queue:deleted");

export async function skipQueue(db: Database, id: string) {
  return db.transaction(async (tx) => {
    await lockQueue(tx);
    const row = await load(tx, id);
    if (!["WAITING", "ANSWERING"].includes(row.status)) throw invalidTransition("Only active queues can be skipped");
    const [updated] = await tx.update(queueEntries).set({ status: "SKIPPED", movedToEnd: true, restoreNext: false, queueEnteredAt: new Date(), updatedAt: new Date() }).where(eq(queueEntries.id, id)).returning();
    await recordEvent(tx as unknown as Database, id, "skipped", row.status, "SKIPPED");
    return mutation(tx, updated, [], "queue:updated");
  });
}

export async function restoreQueue(db: Database, id: string) {
  return db.transaction(async (tx) => {
    await lockQueue(tx);
    const row = await load(tx, id);
    if (!["ANSWERED", "CANCELLED", "DELETED", "SKIPPED"].includes(row.status)) throw invalidTransition("Only closed or skipped queues can be restored");
    const [updated] = await tx.update(queueEntries).set({
      status: "WAITING", answeredAt: null, cancelledAt: null, deletedAt: null,
      dedupeKey: makeDedupeKey(row.username, "question", row.question),
      queueEnteredAt: new Date(), movedToEnd: false, restoreNext: true, pendingReason: null, updatedAt: new Date(),
    }).where(eq(queueEntries.id, id)).returning();
    await recordEvent(tx as unknown as Database, id, "restored", row.status, "WAITING");
    return mutation(tx, updated, [], "queue:updated");
  });
}

export async function getSettingsSnapshot(db: Database) {
  return { rules: await getGiftRules(db), settings: await getSettings(db) };
}

export async function updateSettings(db: Database, input: SettingsInput) {
  return db.transaction(async (tx) => {
    await tx.insert(queueSettings).values(toQueueSettingsValues(input.settings))
      .onConflictDoUpdate({ target: queueSettings.id, set: toQueueSettingsValues(input.settings) });
    for (const rule of input.rules) {
      await tx.insert(giftRules).values(toGiftRuleValues(rule))
        .onConflictDoUpdate({ target: giftRules.id, set: toGiftRuleValues(rule) });
    }
    return { rules: input.rules, settings: input.settings };
  });
}
