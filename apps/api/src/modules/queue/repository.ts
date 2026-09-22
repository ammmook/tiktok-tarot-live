import { and, asc, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import type { Database } from "@tarot-live/db";
import { giftRules, liveSessions, questionCredits, queueEntries, queueEvents, queueSettings, tiktokAccountSettings } from "@tarot-live/db/schema";
import { storedUsername } from "./rules.js";
import { toGiftRuleDto, toQueueEntryDto, toQueueSettingsDto } from "./mapping.js";
import type { QueueEntryDto, QueueRow, QueueSettingsDto, GiftRuleDto } from "./types.js";

export const activeStatuses = ["WAITING", "ANSWERING", "SKIPPED", "PENDING_QUESTION", "PENDING_APPROVAL"] as const;
export const terminalStatuses = ["ANSWERED", "CANCELLED", "DELETED"] as const;

function accountConfig(row: typeof tiktokAccountSettings.$inferSelect) {
  return {
    rules: row.giftRules as unknown as GiftRuleDto[],
    settings: row.queueSettings as unknown as QueueSettingsDto,
  };
}

async function findAccountConfig(db: Database, username?: string | null) {
  if (!username) return null;
  const [row] = await db.select().from(tiktokAccountSettings)
    .where(eq(tiktokAccountSettings.tiktokUsername, storedUsername(username))).limit(1);
  return row ? accountConfig(row) : null;
}

export async function ensureAccountSettings(db: Database, username: string) {
  const tiktokUsername = storedUsername(username);
  const existing = await findAccountConfig(db, tiktokUsername);
  if (existing) return existing;
  const [defaultSettings] = await db.select().from(queueSettings).where(eq(queueSettings.id, "default")).limit(1);
  if (!defaultSettings) throw new Error("Queue settings are not initialized");
  const defaultRules = await db.select().from(giftRules).orderBy(asc(giftRules.displayOrder), asc(giftRules.priority));
  const values = {
    tiktokUsername,
    giftRules: defaultRules.map((rule) => toGiftRuleDto(rule as unknown as Record<string, unknown>)) as unknown as Record<string, unknown>[],
    queueSettings: toQueueSettingsDto(defaultSettings as unknown as Record<string, unknown>) as unknown as Record<string, unknown>,
    updatedAt: new Date(),
  };
  await db.insert(tiktokAccountSettings).values(values).onConflictDoNothing();
  const account = await findAccountConfig(db, tiktokUsername);
  if (!account) throw new Error("Unable to initialize account settings");
  return account;
}

export function queueOrder() {
  return sql`CASE
    WHEN ${queueEntries.status} = 'ANSWERING' THEN 0
    WHEN ${queueEntries.status} = 'WAITING' AND ${queueEntries.restoreNext} = true THEN 1
    WHEN ${queueEntries.status} = 'WAITING' AND ${queueEntries.queueType} = 'EXPRESS' THEN 2
    WHEN ${queueEntries.status} = 'WAITING' THEN 3
    WHEN ${queueEntries.status} = 'SKIPPED' THEN 4
    ELSE 5
  END, CASE WHEN ${queueEntries.status} = 'WAITING' AND ${queueEntries.restoreNext} = true THEN 0 ELSE ${queueEntries.priority} END ASC,
  COALESCE(${queueEntries.queueEnteredAt}, ${queueEntries.createdAt}) ASC, ${queueEntries.queueNumber} ASC`;
}

export async function findQueueEntry(db: Database, id: string) {
  const [row] = await db.select().from(queueEntries).where(eq(queueEntries.id, id)).limit(1);
  return row;
}

export async function findByIdempotencyKey(db: Database, key: string) {
  const [row] = await db.select().from(queueEntries).where(eq(queueEntries.idempotencyKey, key)).limit(1);
  return row;
}

export async function findByExternalEventId(db: Database, key: string) {
  const [row] = await db.select().from(queueEntries).where(eq(queueEntries.externalEventId, key)).limit(1);
  return row;
}

async function sessionIdsForUsername(db: Database, username: string | null | undefined) {
  if (!username) return [];
  const sessions = await db.select({ id: liveSessions.id }).from(liveSessions)
    .where(eq(liveSessions.tiktokUsername, storedUsername(username)));
  return sessions.map((session) => session.id);
}

export async function listActive(db: Database, username?: string | null): Promise<QueueEntryDto[]> {
  const sessionIds = await sessionIdsForUsername(db, username);
  if (!sessionIds.length) return [];
  const rows = await db.select().from(queueEntries)
    .where(and(inArray(queueEntries.status, activeStatuses), inArray(queueEntries.liveSessionId, sessionIds)))
    .orderBy(queueOrder());
  return rows.map(toQueueEntryDto);
}

export async function listHistory(db: Database, limit: number, username?: string | null): Promise<QueueEntryDto[]> {
  const sessionIds = await sessionIdsForUsername(db, username);
  if (!sessionIds.length) return [];
  const rows = await db.select().from(queueEntries)
    .where(and(inArray(queueEntries.status, terminalStatuses), inArray(queueEntries.liveSessionId, sessionIds)))
    .orderBy(desc(queueEntries.updatedAt), desc(queueEntries.queueNumber)).limit(limit);
  return rows.map(toQueueEntryDto);
}

export async function getQueueOrder(db: Database) {
  const rows = await db.select({ id: queueEntries.id }).from(queueEntries).where(inArray(queueEntries.status, activeStatuses)).orderBy(queueOrder());
  return rows.map((row) => row.id);
}

export async function getSettings(db: Database, username?: string | null): Promise<QueueSettingsDto> {
  const account = await findAccountConfig(db, username);
  if (account) return account.settings;
  const [row] = await db.select().from(queueSettings).where(eq(queueSettings.id, "default")).limit(1);
  if (!row) throw new Error("Queue settings are not initialized");
  return toQueueSettingsDto(row as unknown as Record<string, unknown>);
}

export async function getGiftRules(db: Database, username?: string | null): Promise<GiftRuleDto[]> {
  const account = await findAccountConfig(db, username);
  if (account) return account.rules;
  const rows = await db.select().from(giftRules).orderBy(asc(giftRules.displayOrder), asc(giftRules.priority));
  return rows.map((row) => toGiftRuleDto(row as unknown as Record<string, unknown>));
}

export async function recordEvent(
  db: Database,
  queueEntryId: string,
  eventType: string,
  fromStatus: QueueRow["status"] | null,
  toStatus: QueueRow["status"] | null,
  payload: Record<string, unknown> = {},
) {
  await db.insert(queueEvents).values({ queueEntryId, eventType, fromStatus, toStatus, payload });
}

export async function countAllocatedRights(db: Database, username: string, excludeId?: string) {
  const conditions = [eq(queueEntries.username, username), inArray(queueEntries.status, activeStatuses), isNotNull(queueEntries.questionRights)];
  if (excludeId) conditions.push(sql`${queueEntries.id} <> ${excludeId}` as never);
  const rows = await db.select({ rights: queueEntries.questionRights }).from(queueEntries).where(and(...conditions));
  return rows.reduce((total, row) => total + (row.rights ?? 0), 0);
}

export async function activeCount(db: Database) {
  const rows = await db.select({ count: sql<number>`count(*)` }).from(queueEntries).where(inArray(queueEntries.status, activeStatuses));
  return Number(rows[0]?.count ?? 0);
}

export function toDto(row: QueueRow) {
  return toQueueEntryDto(row);
}

export { giftRules, questionCredits, queueEntries, queueEvents, queueSettings, isNull };
