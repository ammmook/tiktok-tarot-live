import { and, asc, eq, gt, inArray, isNull, lt, or, sql } from "drizzle-orm";
import type { Database } from "@tarot-live/db";
import { giftRules, listenerHealth, liveSessions, pendingQuestions, questionCredits, queueEntries, tiktokProcessedEvents } from "@tarot-live/db/schema";
import { calculateRights, storedUsername } from "../queue/rules.js";
import { activeStatuses, queueOrder, recordEvent } from "../queue/repository.js";
import { toGiftRuleDto, toQueueEntryDto } from "../queue/mapping.js";
import type { GiftRuleDto, QueueMutationResult, QueueRow } from "../queue/types.js";
import type { ListenerStatusInput, TikTokEventInput } from "./schemas.js";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

type PendingQuestion = typeof pendingQuestions.$inferSelect;
type QuestionCredit = typeof questionCredits.$inferSelect;

function eventKey(input: TikTokEventInput) {
  return `${input.roomId}|${input.type}|${input.eventId}`;
}

function expiresAt(now: Date, ttlMinutes: number) {
  return new Date(now.getTime() + ttlMinutes * 60_000);
}

function hasRemainingCredit(credit: QuestionCredit | undefined) {
  return Boolean(credit && credit.status === "WAITING_FOR_QUESTION" && (credit.remainingQuestions === null || credit.remainingQuestions > 0));
}

async function lockTikTokUser(tx: Transaction, liveSessionId: string, userId: string) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`${liveSessionId}:${userId}`}, 0))`);
}

async function resolveLiveSession(tx: Transaction, username: string, roomId: string, now: Date) {
  const [existing] = await tx.select().from(liveSessions).where(eq(liveSessions.roomId, roomId)).limit(1);
  if (existing) {
    if (existing.status !== "CONNECTED") {
      const [updated] = await tx.update(liveSessions).set({ status: "CONNECTED", endedAt: null, updatedAt: now }).where(eq(liveSessions.id, existing.id)).returning();
      return updated;
    }
    return existing;
  }
  const previousSessions = await tx.select().from(liveSessions).where(and(
    eq(liveSessions.tiktokUsername, storedUsername(username)),
    eq(liveSessions.status, "CONNECTED"),
  ));
  for (const previousSession of previousSessions) await endLiveSession(tx, previousSession.roomId, now);
  const [created] = await tx.insert(liveSessions).values({
    tiktokUsername: storedUsername(username), roomId, status: "CONNECTED", connectedAt: now, createdAt: now, updatedAt: now,
  }).returning();
  return created;
}

async function updateReceipt(tx: Transaction, id: string, status: string, now: Date) {
  await tx.update(tiktokProcessedEvents).set({ status, updatedAt: now }).where(eq(tiktokProcessedEvents.id, id));
}

async function expireWithinTransaction(tx: Transaction, now: Date) {
  await tx.update(pendingQuestions).set({ status: "EXPIRED", updatedAt: now })
    .where(and(eq(pendingQuestions.status, "WAITING_FOR_GIFT"), lt(pendingQuestions.expiresAt, now)));
  await tx.update(questionCredits).set({ status: "EXPIRED", updatedAt: now })
    .where(and(eq(questionCredits.status, "WAITING_FOR_QUESTION"), lt(questionCredits.expiresAt, now)));
}

export async function expireTikTokPending(db: Database) {
  return db.transaction(async (tx) => {
    await expireWithinTransaction(tx, new Date());
  });
}

export function parseQuestionComment(comment: string) {
  const separator = comment.indexOf("/");
  if (separator < 1) return null;
  const displayName = comment.slice(0, separator).trim();
  const question = comment.slice(separator + 1).trim();
  if (!displayName || !question || displayName.length > 120 || question.length > 2_000) return null;
  return { displayName, question };
}

async function findOldestCredit(tx: Transaction, liveSessionId: string, roomId: string, userId: string) {
  const [credit] = await tx.select().from(questionCredits).where(and(
    eq(questionCredits.liveSessionId, liveSessionId),
    eq(questionCredits.roomId, roomId),
    eq(questionCredits.userId, userId),
    eq(questionCredits.status, "WAITING_FOR_QUESTION"),
    or(isNull(questionCredits.remainingQuestions), gt(questionCredits.remainingQuestions, 0)),
  )).orderBy(asc(questionCredits.createdAt), asc(questionCredits.id)).limit(1);
  return credit;
}

async function consumeCredit(tx: Transaction, credit: QuestionCredit, now: Date) {
  const remainingQuestions = credit.remainingQuestions === null ? null : credit.remainingQuestions - 1;
  const status = remainingQuestions === 0 ? "CONSUMED" : "WAITING_FOR_QUESTION";
  const [updated] = await tx.update(questionCredits).set({ remainingQuestions, status, updatedAt: now })
    .where(eq(questionCredits.id, credit.id)).returning();
  return updated;
}

function latestIdentity(question: PendingQuestion, credit: QuestionCredit) {
  const giftIsLatest = (credit.eventTimestamp?.getTime() ?? credit.createdAt.getTime()) >= question.eventTimestamp.getTime();
  return giftIsLatest
    ? { username: credit.username, nickname: credit.nickname, secUid: credit.secUid, profilePictureUrl: credit.profilePictureUrl }
    : { username: question.username, nickname: question.nickname, secUid: question.secUid, profilePictureUrl: question.profilePictureUrl };
}

async function createQueueFromMatch(tx: Transaction, question: PendingQuestion, credit: QuestionCredit, now: Date) {
  const consumed = await consumeCredit(tx, credit, now);
  const identity = latestIdentity(question, credit);
  const [entry] = await tx.insert(queueEntries).values({
    liveSessionId: question.liveSessionId,
    roomId: question.roomId,
    userId: question.tiktokUserId,
    secUid: identity.secUid ?? question.secUid ?? credit.secUid,
    username: identity.username,
    displayName: question.displayName,
    nickname: identity.nickname,
    profilePictureUrl: identity.profilePictureUrl,
    question: question.question,
    giftId: credit.giftId,
    giftName: credit.giftName,
    giftIcon: credit.giftIcon,
    giftImageUrl: credit.giftImageUrl,
    priority: credit.priority,
    queueType: credit.queueType,
    giftCount: credit.giftCount,
    questionRights: consumed.remainingQuestions,
    creditId: credit.id,
    pendingQuestionId: question.id,
    ruleSnapshot: credit.ruleSnapshot,
    status: "WAITING",
    idempotencyKey: `tiktok:queue:${question.id}`,
    externalEventId: question.commentMessageId,
    dedupeKey: `tiktok:${question.id}`,
    source: "tiktok",
    queueEnteredAt: now,
    createdAt: now,
    updatedAt: now,
  }).returning();
  await tx.update(pendingQuestions).set({ status: "MATCHED", matchedQueueEntryId: entry.id, updatedAt: now }).where(eq(pendingQuestions.id, question.id));
  await recordEvent(tx as unknown as Database, entry.id, "created", null, "WAITING", { source: "tiktok", creditId: credit.id, pendingQuestionId: question.id });
  return entry;
}

async function matchPendingQuestions(tx: Transaction, liveSessionId: string, roomId: string, userId: string, now: Date) {
  const questions = await tx.select().from(pendingQuestions).where(and(
    eq(pendingQuestions.liveSessionId, liveSessionId),
    eq(pendingQuestions.roomId, roomId),
    eq(pendingQuestions.tiktokUserId, userId),
    eq(pendingQuestions.status, "WAITING_FOR_GIFT"),
  )).orderBy(asc(pendingQuestions.createdAt), asc(pendingQuestions.id));
  const created: QueueRow[] = [];
  for (const question of questions) {
    const credit = await findOldestCredit(tx, liveSessionId, roomId, userId);
    if (!hasRemainingCredit(credit)) break;
    created.push(await createQueueFromMatch(tx, question, credit, now));
  }
  return created;
}

async function mutationsFor(tx: Transaction, entries: QueueRow[]): Promise<QueueMutationResult[]> {
  if (!entries.length) return [];
  const queueRows = await tx.select({ id: queueEntries.id }).from(queueEntries)
    .where(inArray(queueEntries.status, activeStatuses)).orderBy(queueOrder());
  const queueOrderIds = queueRows.map((row) => row.id);
  return entries.map((entry) => ({ entry: toQueueEntryDto(entry), relatedEntries: [], queueOrder: queueOrderIds, eventType: "queue:created" as const }));
}

function giftRuleSnapshot(rule: GiftRuleDto, event: Extract<TikTokEventInput, { type: "gift" }>) {
  return {
    ...rule,
    tiktokGift: {
      giftId: event.gift.giftId,
      giftName: event.gift.giftName,
      diamondCount: event.gift.diamondCount ?? null,
      imageUrl: event.gift.imageUrl ?? null,
    },
  };
}

export async function processTikTokEvent(db: Database, input: TikTokEventInput, ttlMinutes: number) {
  return db.transaction(async (tx) => {
    const now = new Date();
    await expireWithinTransaction(tx, now);
    const session = await resolveLiveSession(tx, input.liveUsername, input.roomId, now);
    const [receipt] = await tx.insert(tiktokProcessedEvents).values({
      eventKey: eventKey(input), eventId: input.eventId, eventType: input.type, liveSessionId: session.id, roomId: input.roomId,
      status: "RECEIVED", eventTimestamp: new Date(input.timestamp), createdAt: now, updatedAt: now,
    }).onConflictDoNothing().returning();
    if (!receipt) return { replayed: true, mutations: [] as QueueMutationResult[], disposition: "duplicate" };

    await lockTikTokUser(tx, session.id, input.user.userId);
    if (input.type === "chat") {
      const parsed = parseQuestionComment(input.comment);
      if (!parsed) {
        await updateReceipt(tx, receipt.id, "IGNORED_INVALID_QUESTION", now);
        return { replayed: false, mutations: [] as QueueMutationResult[], disposition: "ignored_invalid_question" };
      }
      await tx.insert(pendingQuestions).values({
        liveSessionId: session.id,
        roomId: input.roomId,
        tiktokUserId: input.user.userId,
        secUid: input.user.secUid,
        username: storedUsername(input.user.username),
        nickname: input.user.nickname || input.user.username,
        profilePictureUrl: input.user.profilePictureUrl,
        commentMessageId: input.eventId,
        eventKey: eventKey(input),
        displayName: parsed.displayName,
        question: parsed.question,
        eventTimestamp: new Date(input.timestamp),
        status: "WAITING_FOR_GIFT",
        expiresAt: expiresAt(now, ttlMinutes),
        createdAt: now,
        updatedAt: now,
      });
      const entries = await matchPendingQuestions(tx, session.id, input.roomId, input.user.userId, now);
      await updateReceipt(tx, receipt.id, entries.length ? "MATCHED" : "WAITING_FOR_GIFT", now);
      return { replayed: false, mutations: await mutationsFor(tx, entries), disposition: entries.length ? "matched" : "waiting_for_gift" };
    }

    if (input.gift.giftType === 1 && !input.gift.repeatEnd) {
      await updateReceipt(tx, receipt.id, "IGNORED_STREAK_IN_PROGRESS", now);
      return { replayed: false, mutations: [] as QueueMutationResult[], disposition: "streak_in_progress" };
    }
    const [ruleRow] = await tx.select().from(giftRules).where(eq(giftRules.giftCode, input.gift.giftId.toLowerCase())).limit(1);
    const rule = ruleRow ? toGiftRuleDto(ruleRow as unknown as Record<string, unknown>) : null;
    if (!rule || !rule.active || input.gift.repeatCount < rule.minimumGiftCount) {
      await updateReceipt(tx, receipt.id, "IGNORED_GIFT", now);
      return { replayed: false, mutations: [] as QueueMutationResult[], disposition: "ignored_gift" };
    }
    const granted = rule.unlimitedQuestions ? null : calculateRights(rule, input.gift.repeatCount);
    if (granted === 0) {
      await updateReceipt(tx, receipt.id, "IGNORED_ZERO_CREDIT", now);
      return { replayed: false, mutations: [] as QueueMutationResult[], disposition: "ignored_zero_credit" };
    }
    await tx.insert(questionCredits).values({
      liveSessionId: session.id,
      roomId: input.roomId,
      userId: input.user.userId,
      secUid: input.user.secUid,
      username: storedUsername(input.user.username),
      displayName: input.user.nickname || input.user.username,
      nickname: input.user.nickname || input.user.username,
      profilePictureUrl: input.user.profilePictureUrl,
      giftId: rule.id,
      giftName: input.gift.giftName || rule.displayName,
      giftIcon: rule.icon,
      giftImageUrl: input.gift.imageUrl,
      priority: rule.priority,
      queueType: rule.queueType === "express" ? "EXPRESS" : "NORMAL",
      giftCount: input.gift.repeatCount,
      initialQuestions: granted,
      remainingQuestions: granted,
      ruleSnapshot: giftRuleSnapshot(rule, input),
      idempotencyKey: `tiktok:gift:${receipt.id}`,
      source: "tiktok",
      status: "WAITING_FOR_QUESTION",
      eventTimestamp: new Date(input.timestamp),
      expiresAt: expiresAt(now, ttlMinutes),
      createdAt: now,
      updatedAt: now,
    });
    const entries = await matchPendingQuestions(tx, session.id, input.roomId, input.user.userId, now);
    await updateReceipt(tx, receipt.id, entries.length ? "MATCHED" : "WAITING_FOR_QUESTION", now);
    return { replayed: false, mutations: await mutationsFor(tx, entries), disposition: entries.length ? "matched" : "waiting_for_question" };
  });
}

async function endLiveSession(tx: Transaction, roomId: string, now: Date) {
  const [session] = await tx.select().from(liveSessions).where(eq(liveSessions.roomId, roomId)).limit(1);
  if (!session) return;
  await tx.update(liveSessions).set({ status: "ENDED", endedAt: now, updatedAt: now }).where(eq(liveSessions.id, session.id));
  await tx.update(pendingQuestions).set({ status: "NEEDS_REVIEW", updatedAt: now }).where(and(eq(pendingQuestions.liveSessionId, session.id), eq(pendingQuestions.status, "WAITING_FOR_GIFT")));
  await tx.update(questionCredits).set({ status: "NEEDS_REVIEW", updatedAt: now }).where(and(eq(questionCredits.liveSessionId, session.id), eq(questionCredits.status, "WAITING_FOR_QUESTION")));
}

export async function reportListenerStatus(db: Database, input: ListenerStatusInput) {
  return db.transaction(async (tx) => {
    const now = new Date();
    await expireWithinTransaction(tx, now);
    if (input.roomId && input.tiktokStatus === "CONNECTED") await resolveLiveSession(tx, input.liveUsername, input.roomId, now);
    if (input.roomId && input.tiktokStatus === "ENDED") await endLiveSession(tx, input.roomId, now);
    const values = {
      instanceId: input.instanceId,
      tiktokUsername: storedUsername(input.liveUsername),
      status: input.status,
      tiktokStatus: input.tiktokStatus,
      authenticationStatus: input.authenticationStatus,
      roomId: input.roomId ?? null,
      lastEventAt: input.lastEventAt ? new Date(input.lastEventAt) : null,
      detail: input.detail ?? null,
      startedAt: new Date(input.startedAt),
      updatedAt: now,
    };
    await tx.insert(listenerHealth).values(values).onConflictDoUpdate({
      target: listenerHealth.instanceId,
      set: { ...values, startedAt: sql`${listenerHealth.startedAt}` },
    });
    return { ...values, updatedAt: now };
  });
}

export async function getLatestListenerStatus(db: Database) {
  const [row] = await db.select().from(listenerHealth).orderBy(sql`${listenerHealth.updatedAt} desc`).limit(1);
  if (!row) return { status: "OFFLINE", tiktokStatus: "OFFLINE", authenticationStatus: "missing", roomId: null, lastEventAt: null, updatedAt: null };
  const stale = Date.now() - row.updatedAt.getTime() > 65_000;
  if (stale) return { ...row, status: "OFFLINE", tiktokStatus: "BACKEND_UNREACHABLE" };
  return row;
}
