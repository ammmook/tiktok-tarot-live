import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { Database } from "@tarot-live/db";
import { giftRules, queueEntries, queueSettings } from "@tarot-live/db/schema";
import { conflict, invalidTransition, notFound } from "../../errors/app-error.js";
import { calculateRights, makeDedupeKey, storedUsername } from "./rules.js";
import { activeStatuses, getSettings, getGiftRules, recordEvent } from "./repository.js";
import { toGiftRuleDto, toGiftRuleValues, toQueueEntryDto, toQueueSettingsValues } from "./mapping.js";
import type { QueueMutationResult, QueueRow, QueueSettingsDto, GiftRuleDto } from "./types.js";
import type { CreateQueueInput, SettingsInput, UpdateQueueInput } from "./schemas.js";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

async function getRule(tx: Transaction, id: string) {
  const [row] = await tx.select().from(giftRules).where(eq(giftRules.id, id)).limit(1);
  return row;
}

async function countAllocated(tx: Transaction, username: string, excludeId?: string) {
  const conditions = [eq(queueEntries.username, username), inArray(queueEntries.status, activeStatuses)];
  if (excludeId) conditions.push(sql`${queueEntries.id} <> ${excludeId}` as never);
  const rows = await tx.select({ rights: queueEntries.questionRights }).from(queueEntries).where(and(...conditions));
  return rows.reduce((total, row) => total + (row.rights ?? 0), 0);
}

async function countActive(tx: Transaction) {
  const rows = await tx.select({ count: sql<number>`count(*)` }).from(queueEntries).where(inArray(queueEntries.status, activeStatuses));
  return Number(rows[0]?.count ?? 0);
}

async function lockUserAdmission(tx: Transaction, username: string) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${username}, 0))`);
}

async function lockQueueState(tx: Transaction) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended('tarot-live-queue-state', 0))`);
}

async function getActiveDedupe(tx: Transaction, dedupeKey: string, excludeId?: string) {
  const conditions = [eq(queueEntries.dedupeKey, dedupeKey), inArray(queueEntries.status, activeStatuses)];
  if (excludeId) conditions.push(sql`${queueEntries.id} <> ${excludeId}` as never);
  const [row] = await tx.select().from(queueEntries).where(and(...conditions)).limit(1);
  return row;
}

async function orderedRows(tx: Transaction) {
  const rows = await tx.select().from(queueEntries).where(inArray(queueEntries.status, activeStatuses)).orderBy(sql`CASE
    WHEN ${queueEntries.status} = 'ANSWERING' THEN 0
    WHEN ${queueEntries.status} = 'WAITING' AND ${queueEntries.queueType} = 'EXPRESS' THEN 1
    WHEN ${queueEntries.status} = 'WAITING' THEN 2
    WHEN ${queueEntries.status} = 'SKIPPED' THEN 3
    ELSE 4 END, ${queueEntries.priority} ASC, COALESCE(${queueEntries.queueEnteredAt}, ${queueEntries.createdAt}) ASC, ${queueEntries.queueNumber} ASC`);
  return rows;
}

async function mutation(tx: Transaction, entry: QueueRow, relatedRows: QueueRow[] = [], eventType: QueueMutationResult["eventType"]): Promise<QueueMutationResult> {
  const rows = await orderedRows(tx);
  return {
    entry: toQueueEntryDto(entry),
    relatedEntries: relatedRows.map(toQueueEntryDto),
    queueOrder: rows.map((row) => row.id),
    eventType,
  };
}

function assertQuestionLength(question: string, settings: QueueSettingsDto) {
  if (settings.maxQuestionLength && question.length > settings.maxQuestionLength) {
    throw conflict(`Question exceeds the ${settings.maxQuestionLength} character limit`);
  }
}

function validateRule(rule: GiftRuleDto | null, giftCount: number): asserts rule is GiftRuleDto {
  if (!rule || !rule.active) throw conflict("Gift rule is not available");
  if (giftCount < rule.minimumGiftCount) throw conflict(`This gift requires at least ${rule.minimumGiftCount} gifts`);
}

export async function createQueue(db: Database, input: CreateQueueInput): Promise<QueueMutationResult> {
  try {
    return await db.transaction(async (tx) => {
      const existingByKey = await tx.select().from(queueEntries).where(eq(queueEntries.idempotencyKey, input.idempotencyKey)).limit(1);
      if (existingByKey[0]) return { ...(await mutation(tx, existingByKey[0], [], "queue:created")), replayed: true };
      if (input.externalEventId) {
        const existingByExternal = await tx.select().from(queueEntries).where(eq(queueEntries.externalEventId, input.externalEventId)).limit(1);
        if (existingByExternal[0]) return { ...(await mutation(tx, existingByExternal[0], [], "queue:created")), replayed: true };
      }

      const settings = (await getSettings(tx as unknown as Database));
      const ruleRow = await getRule(tx, input.giftRuleId);
      const rule = ruleRow ? toGiftRuleDto(ruleRow as unknown as Record<string, unknown>) : null;
      validateRule(rule, input.giftCount);
      assertQuestionLength(input.question, settings);

      const username = storedUsername(input.tiktokUsername);
      await lockUserAdmission(tx, username);
      if (settings.maxActiveQueues) await lockQueueState(tx);
      const dedupeKey = input.allowDuplicate ? null : makeDedupeKey(username, input.giftRuleId, input.question);
      if (dedupeKey && await getActiveDedupe(tx, dedupeKey)) throw conflict("An active queue already exists for this user and question");

      const allocatedRights = await countAllocated(tx, username);
      const questionRights = calculateRights(rule as GiftRuleDto, input.giftCount, allocatedRights);
      if (!questionRights) throw conflict("This user has no remaining question rights");

      const activeQueues = await countActive(tx);
      const pendingReason = !input.question && (rule as GiftRuleDto).requireQuestion
        ? "question_required"
        : settings.maxActiveQueues && activeQueues >= settings.maxActiveQueues
          ? "max_active_queues"
          : null;
      const status: QueueRow["status"] = pendingReason === "question_required"
        ? "PENDING_QUESTION"
        : pendingReason === "max_active_queues"
          ? "PENDING_APPROVAL"
          : "WAITING";
      const now = new Date();

      const [entry] = await tx.insert(queueEntries).values({
        userId: input.tiktokUserId ?? username.slice(1),
        username,
        displayName: input.displayName.trim(),
        question: input.question.trim(),
        giftId: (rule as GiftRuleDto).id,
        giftName: (rule as GiftRuleDto).displayName,
        giftIcon: (rule as GiftRuleDto).icon,
        priority: (rule as GiftRuleDto).priority,
        queueType: (rule as GiftRuleDto).queueType === "express" ? "EXPRESS" : "NORMAL",
        giftCount: input.giftCount,
        questionRights,
        ruleSnapshot: rule as unknown as Record<string, unknown>,
        status,
        pendingReason,
        idempotencyKey: input.idempotencyKey,
        externalEventId: input.externalEventId,
        dedupeKey,
        source: input.source,
        queueEnteredAt: status === "WAITING" ? now : null,
        createdAt: now,
        updatedAt: now,
      }).returning();
      await recordEvent(tx as unknown as Database, entry.id, "created", null, status, { source: input.source });
      return mutation(tx, entry, [], "queue:created");
    });
  } catch (error) {
    if (error instanceof Error && /duplicate key|unique constraint/i.test(error.message)) {
      const replay = await findByIdempotencyOrExternal(db, input.idempotencyKey, input.externalEventId);
      if (replay) return { ...(await mutation(db as unknown as Transaction, replay, [], "queue:created")), replayed: true };
    }
    throw error;
  }
}

async function findByIdempotencyOrExternal(db: Database, idempotencyKey: string, externalEventId?: string) {
  const [row] = await db.select().from(queueEntries).where(externalEventId
    ? sql`${queueEntries.idempotencyKey} = ${idempotencyKey} OR ${queueEntries.externalEventId} = ${externalEventId}`
    : eq(queueEntries.idempotencyKey, idempotencyKey)).limit(1);
  return row;
}

async function loadForUpdate(tx: Transaction, id: string) {
  const [row] = await tx.select().from(queueEntries).where(eq(queueEntries.id, id)).limit(1);
  if (!row) throw notFound();
  return row;
}

async function resolveRuleAndSettings(tx: Transaction, row: QueueRow, input: UpdateQueueInput) {
  const settings = await getSettings(tx as unknown as Database);
  const ruleRow = await getRule(tx, input.giftRuleId ?? row.giftId);
  const rule = ruleRow ? toGiftRuleDto(ruleRow as unknown as Record<string, unknown>) : null;
  validateRule(rule, input.giftCount ?? row.giftCount);
  return { settings, rule: rule as GiftRuleDto };
}

export async function updateQueue(db: Database, id: string, input: UpdateQueueInput): Promise<QueueMutationResult> {
  return db.transaction(async (tx) => {
    const row = await loadForUpdate(tx, id);
    const { settings, rule } = await resolveRuleAndSettings(tx, row, input);
    const username = storedUsername(input.tiktokUsername ?? row.username);
    await lockUserAdmission(tx, username);
    const question = input.question ?? row.question;
    assertQuestionLength(question, settings);
    const dedupeKey = input.allowDuplicate ? null : makeDedupeKey(username, rule.id, question);
    if (dedupeKey && await getActiveDedupe(tx, dedupeKey, id)) throw conflict("An active queue already exists for this user and question");
    const rights = calculateRights(rule, input.giftCount ?? row.giftCount, await countAllocated(tx, username, id));
    if (!rights) throw conflict("This user has no remaining question rights");
    let status = row.status;
    let pendingReason = row.pendingReason;
    if (input.status && input.status !== "waiting" && input.status !== "skipped") throw invalidTransition("Only waiting or skipped status can be set by update");
    if (input.status === "waiting") status = "WAITING";
    if (input.status === "skipped") status = "SKIPPED";
    if (!question && rule.requireQuestion) { status = "PENDING_QUESTION"; pendingReason = "question_required"; }
    else if (pendingReason === "question_required") { pendingReason = null; status = input.status ? status : "WAITING"; }
    const [updated] = await tx.update(queueEntries).set({
      username,
      userId: row.userId ?? username.slice(1),
      displayName: input.displayName ?? row.displayName,
      question,
      giftId: rule.id,
      giftName: rule.displayName,
      giftIcon: rule.icon,
      priority: rule.priority,
      queueType: rule.queueType === "express" ? "EXPRESS" : "NORMAL",
      giftCount: input.giftCount ?? row.giftCount,
      questionRights: rights,
      ruleSnapshot: rule as unknown as Record<string, unknown>,
      status,
      pendingReason,
      dedupeKey,
      queueEnteredAt: status === "WAITING" || status === "SKIPPED" ? (row.queueEnteredAt ?? new Date()) : row.queueEnteredAt,
      movedToEnd: input.status === "skipped" ? true : row.movedToEnd,
      updatedAt: new Date(),
    }).where(eq(queueEntries.id, id)).returning();
    if (row.status !== updated.status) await recordEvent(tx as unknown as Database, id, "status_changed", row.status, updated.status);
    else await recordEvent(tx as unknown as Database, id, "updated", row.status, updated.status);
    return mutation(tx, updated, [], "queue:updated");
  });
}

async function transition(db: Database, id: string, target: QueueRow["status"], eventType: QueueMutationResult["eventType"]) {
  return db.transaction(async (tx) => {
    await lockQueueState(tx);
    const row = await loadForUpdate(tx, id);
    const now = new Date();
    if (target === "ANSWERING" && row.status !== "WAITING") throw invalidTransition("Only waiting queues can start");
    if (target === "ANSWERED" && row.status !== "ANSWERING") throw invalidTransition("Only the current queue can be completed");
    if (target === "CANCELLED" && ["ANSWERED", "DELETED", "CANCELLED"].includes(row.status)) throw invalidTransition("This queue is already closed");
    if (target === "DELETED" && row.status === "DELETED") throw invalidTransition("This queue is already deleted");

    const related: QueueRow[] = [];
    if (target === "ANSWERING") {
      const current = await tx.select().from(queueEntries).where(eq(queueEntries.status, "ANSWERING")).limit(1);
      if (current[0] && current[0].id !== row.id) {
        const [skipped] = await tx.update(queueEntries).set({ status: "SKIPPED", updatedAt: now }).where(eq(queueEntries.id, current[0].id)).returning();
        related.push(skipped);
        await recordEvent(tx as unknown as Database, skipped.id, "auto_skipped", "ANSWERING", "SKIPPED");
      }
    }
    const values = target === "ANSWERING"
      ? { status: target, startedAt: now, queueEnteredAt: row.queueEnteredAt ?? now, updatedAt: now }
      : target === "ANSWERED"
        ? { status: target, answeredAt: now, dedupeKey: null, updatedAt: now }
        : target === "CANCELLED"
          ? { status: target, cancelledAt: now, dedupeKey: null, updatedAt: now }
          : { status: target, deletedAt: now, dedupeKey: null, updatedAt: now };
    const [updated] = await tx.update(queueEntries).set(values).where(eq(queueEntries.id, id)).returning();
    await recordEvent(tx as unknown as Database, id, eventType?.replace("queue:", "") ?? "status_changed", row.status, target);

    if (target === "ANSWERED") {
      const settings = await getSettings(tx as unknown as Database);
      if (settings.autoAdvance) {
        const [next] = await tx.select().from(queueEntries).where(eq(queueEntries.status, "WAITING")).orderBy(asc(queueEntries.priority), asc(queueEntries.queueEnteredAt), asc(queueEntries.queueNumber)).limit(1);
        if (next) {
          const [started] = await tx.update(queueEntries).set({ status: "ANSWERING", startedAt: now, updatedAt: now }).where(eq(queueEntries.id, next.id)).returning();
          related.push(started);
          await recordEvent(tx as unknown as Database, next.id, "auto_advanced", "WAITING", "ANSWERING");
        }
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
    await lockQueueState(tx);
    const row = await loadForUpdate(tx, id);
    if (!["WAITING", "ANSWERING"].includes(row.status)) throw invalidTransition("Only active queues can be skipped");
    const [updated] = await tx.update(queueEntries).set({ status: "SKIPPED", movedToEnd: true, queueEnteredAt: new Date(), updatedAt: new Date() }).where(eq(queueEntries.id, id)).returning();
    await recordEvent(tx as unknown as Database, id, "skipped", row.status, "SKIPPED");
    return mutation(tx, updated, [], "queue:updated");
  });
}

export async function restoreQueue(db: Database, id: string) {
  return db.transaction(async (tx) => {
    await lockQueueState(tx);
    const row = await loadForUpdate(tx, id);
    await lockUserAdmission(tx, row.username);
    if (!["ANSWERED", "CANCELLED", "DELETED"].includes(row.status)) throw invalidTransition("Only closed queues can be restored");
    const [updated] = await tx.update(queueEntries).set({ status: "WAITING", answeredAt: null, cancelledAt: null, deletedAt: null, dedupeKey: makeDedupeKey(row.username, row.giftId, row.question), queueEnteredAt: new Date(), updatedAt: new Date() }).where(eq(queueEntries.id, id)).returning();
    await recordEvent(tx as unknown as Database, id, "restored", row.status, "WAITING");
    return mutation(tx, updated, [], "queue:updated");
  });
}

export async function getSettingsSnapshot(db: Database) {
  return { rules: await getGiftRules(db), settings: await getSettings(db) };
}

export async function updateSettings(db: Database, input: SettingsInput) {
  return db.transaction(async (tx) => {
    await tx.insert(queueSettings).values(toQueueSettingsValues(input.settings)).onConflictDoUpdate({ target: queueSettings.id, set: toQueueSettingsValues(input.settings) });
    for (const rule of input.rules) {
      await tx.insert(giftRules).values(toGiftRuleValues(rule)).onConflictDoUpdate({ target: giftRules.id, set: toGiftRuleValues(rule) });
    }
    const incomingIds = input.rules.map((rule) => rule.id);
    if (incomingIds.length) await tx.update(giftRules).set({ active: false, updatedAt: new Date() }).where(sql`${giftRules.id} NOT IN (${sql.join(incomingIds.map((id) => sql`${id}`), sql`, `)})`);
    return { rules: input.rules, settings: input.settings };
  });
}
