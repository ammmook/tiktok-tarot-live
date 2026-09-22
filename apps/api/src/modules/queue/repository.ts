import { and, asc, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import type { Database } from "@tarot-live/db";
import { giftRules, questionCredits, queueEntries, queueEvents, queueSettings } from "@tarot-live/db/schema";
import { toGiftRuleDto, toQueueEntryDto, toQueueSettingsDto } from "./mapping.js";
import type { QueueEntryDto, QueueRow, QueueSettingsDto, GiftRuleDto } from "./types.js";

export const activeStatuses = ["WAITING", "ANSWERING", "SKIPPED", "PENDING_QUESTION", "PENDING_APPROVAL"] as const;
export const terminalStatuses = ["ANSWERED", "CANCELLED", "DELETED"] as const;

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

export async function listActive(db: Database): Promise<QueueEntryDto[]> {
  const rows = await db.select().from(queueEntries).where(inArray(queueEntries.status, activeStatuses)).orderBy(queueOrder());
  return rows.map(toQueueEntryDto);
}

export async function listHistory(db: Database, limit: number): Promise<QueueEntryDto[]> {
  const rows = await db.select().from(queueEntries).where(inArray(queueEntries.status, terminalStatuses)).orderBy(desc(queueEntries.updatedAt), desc(queueEntries.queueNumber)).limit(limit);
  return rows.map(toQueueEntryDto);
}

export async function getQueueOrder(db: Database) {
  const rows = await db.select({ id: queueEntries.id }).from(queueEntries).where(inArray(queueEntries.status, activeStatuses)).orderBy(queueOrder());
  return rows.map((row) => row.id);
}

export async function getSettings(db: Database): Promise<QueueSettingsDto> {
  const [row] = await db.select().from(queueSettings).where(eq(queueSettings.id, "default")).limit(1);
  if (!row) throw new Error("Queue settings are not initialized");
  return toQueueSettingsDto(row as unknown as Record<string, unknown>);
}

export async function getGiftRules(db: Database): Promise<GiftRuleDto[]> {
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
