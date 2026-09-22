import type { NormalizedChatEvent, NormalizedGiftEvent, NormalizedTikTokUser } from "../types.js";

type RawRecord = Record<string, unknown>;

function record(value: unknown): RawRecord | undefined {
  return value && typeof value === "object" ? value as RawRecord : undefined;
}

function string(value: unknown) {
  return typeof value === "string" || typeof value === "number" || typeof value === "bigint" ? String(value).trim() : "";
}

function number(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function imageUrl(value: unknown) {
  if (typeof value === "string") return value || undefined;
  const model = record(value);
  const list = model?.urlList ?? model?.url_list ?? model?.url;
  if (Array.isArray(list)) return list.map(string).find(Boolean);
  return string(model?.url) || undefined;
}

function timestamp(value: unknown) {
  let valueAsNumber = number(value);
  if (!valueAsNumber) return Date.now();
  if (valueAsNumber < 100_000_000_000) valueAsNumber *= 1_000;
  if (valueAsNumber > 100_000_000_000_000) valueAsNumber = Math.floor(valueAsNumber / 1_000);
  return Math.floor(valueAsNumber);
}

function userFrom(input: RawRecord): NormalizedTikTokUser | null {
  const user = record(input.user) ?? input;
  if (!user) return null;
  const userId = string(user.userId ?? user.id);
  const username = string(user.uniqueId ?? user.displayId ?? user.username);
  if (!userId || !username) return null;
  return {
    userId,
    secUid: string(user.secUid) || undefined,
    username,
    nickname: string(user.nickname ?? user.nickName) || username,
    profilePictureUrl: imageUrl(user.profilePictureUrl) ?? imageUrl(user.avatarMedium) ?? imageUrl(user.avatarThumb) ?? imageUrl(user.avatarLarge),
  };
}

function eventMetadata(input: unknown, liveUsername: string, fallbackRoomId: string) {
  const event = record(input);
  if (!event) return null;
  const common = record(event.common);
  const eventId = string(common?.msgId ?? event.msgId ?? event.logId ?? event.orderId);
  const roomId = string(common?.roomId) || fallbackRoomId;
  const user = userFrom(event);
  if (!eventId || !roomId || !user) return null;
  return { event, common, eventId, roomId, user, liveUsername, timestamp: timestamp(common?.createTime ?? event.createTime) };
}

export function normalizeChatEvent(input: unknown, liveUsername: string, fallbackRoomId: string): NormalizedChatEvent | null {
  const metadata = eventMetadata(input, liveUsername, fallbackRoomId);
  if (!metadata) return null;
  const comment = string(metadata.event.content ?? metadata.event.comment);
  if (!comment) return null;
  return { type: "chat", eventId: metadata.eventId, roomId: metadata.roomId, liveUsername, timestamp: metadata.timestamp, user: metadata.user, comment };
}

export function normalizeGiftEvent(input: unknown, liveUsername: string, fallbackRoomId: string): NormalizedGiftEvent | null {
  const metadata = eventMetadata(input, liveUsername, fallbackRoomId);
  if (!metadata) return null;
  const gift = record(metadata.event.gift) ?? record(metadata.event.giftDetails) ?? {};
  const extended = record(metadata.event.extendedGiftInfo) ?? {};
  const giftId = string(metadata.event.giftId ?? gift.id);
  const giftType = number(gift.type ?? gift.giftType ?? metadata.event.giftType);
  const repeatCount = Math.floor(number(metadata.event.repeatCount));
  if (!giftId || !repeatCount) return null;
  return {
    type: "gift",
    // A streak may emit multiple message IDs. Its final group is one purchase.
    eventId: giftType === 1 && string(metadata.event.groupId) && string(metadata.event.groupId) !== "0"
      ? `streak:${metadata.user.userId}:${giftId}:${string(metadata.event.groupId)}` : metadata.eventId,
    roomId: metadata.roomId,
    liveUsername,
    timestamp: metadata.timestamp,
    user: metadata.user,
    gift: {
      giftId,
      giftName: string(gift.name ?? gift.giftName ?? extended.name ?? metadata.event.giftName) || "Gift",
      giftType,
      repeatCount,
      repeatEnd: metadata.event.repeatEnd === true || metadata.event.repeatEnd === 1 || metadata.event.repeatEnd === "1",
      diamondCount: number(gift.diamondCount ?? gift.diamond_count ?? extended.diamond_count ?? metadata.event.diamondCount) || undefined,
      imageUrl: imageUrl(gift.image) ?? imageUrl(gift.giftImage) ?? imageUrl(gift.icon) ?? imageUrl(extended.image) ?? imageUrl(metadata.event.giftPictureUrl) ?? imageUrl(metadata.event.giftImage),
    },
  };
}
