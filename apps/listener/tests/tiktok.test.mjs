import test from "node:test";
import assert from "node:assert/strict";
import { normalizeChatEvent, normalizeGiftEvent } from "../src/parser/tiktok.ts";
import { parseQuestionFormat } from "../src/parser/comment.ts";
import { ListenerController } from "../src/controller.ts";

const user = { id: "1234567890123456789", uniqueId: "mook", nickname: "มุก TikTok", avatarThumb: { urlList: ["https://example.com/avatar.jpg"] } };
const raw = { common: { msgId: "message-1", roomId: "room-1", createTime: 1800000000 }, user };

test("raw connector chat retains stable user ID, nickname, avatar and first slash", () => {
 const chat = normalizeChatEvent({ ...raw, content: "มุก/เรื่องงาน/ความรัก" }, "host", "fallback");
 assert.equal(chat.user.userId, user.id);
 assert.equal(chat.user.nickname, "มุก TikTok");
 assert.equal(chat.user.profilePictureUrl, "https://example.com/avatar.jpg");
 assert.equal(chat.timestamp, 1800000000000);
 assert.deepEqual(parseQuestionFormat(chat.comment), { displayName: "มุก", question: "เรื่องงาน/ความรัก" });
 for (const comment of ["hello", "/งาน", "มุก/ "]) assert.equal(parseQuestionFormat(comment), null);
});

test("legacy flat payloads and gift image URL arrays remain compatible", () => {
 const gift = normalizeGiftEvent({ msgId: "legacy", ...user, userId: user.id, profilePictureUrl: "https://example.com/legacy.jpg", giftId: 5655, giftName: "Rose", giftType: 1, repeatEnd: 1, repeatCount: 3, giftPictureUrl: "https://example.com/rose.png" }, "host", "room-1");
 assert.equal(gift.gift.giftName, "Rose");
 assert.equal(gift.gift.imageUrl, "https://example.com/rose.png");
 assert.equal(gift.user.profilePictureUrl, "https://example.com/legacy.jpg");
 assert.equal(gift.gift.repeatEnd, true);
});

test("streak final messages deduplicate by group while separate groups remain distinct", () => {
 const make = (msgId, groupId, repeatEnd) => normalizeGiftEvent({ ...raw, common: { ...raw.common, msgId }, groupId, repeatEnd, repeatCount: 5, giftId: 5655, giftDetails: { giftType: 1, giftName: "Rose", giftImage: { url: ["https://example.com/rose.png"] } } }, "host", "room-1");
 const a = make("one", "group1", 1), b = make("two", "group1", true), c = make("three", "group2", 1);
 assert.equal(a.eventId, b.eventId);
 assert.notEqual(a.eventId, c.eventId);
 assert.equal(a.gift.imageUrl, "https://example.com/rose.png");
 assert.equal(make("four", "group1", "0").gift.repeatEnd, false);
});

test("extended gift catalog supplies missing gift name and image", () => {
 const gift = normalizeGiftEvent({ ...raw, giftId: 9, repeatCount: 1, gift: { type: 0 }, extendedGiftInfo: { name: "Galaxy", image: { url_list: ["https://example.com/galaxy.png"] }, diamond_count: 1000 } }, "host", "room-1");
 assert.equal(gift.gift.giftName, "Galaxy");
 assert.equal(gift.gift.diamondCount, 1000);
 assert.equal(gift.gift.imageUrl, "https://example.com/galaxy.png");
});

test("controller is idle until Connect, serializes account switches and disconnects", async () => {
 const calls = [];
 const controller = new ListenerController(command => ({
  async start() { calls.push(`start:${command.username}`); },
  async shutdown() { calls.push(`stop:${command.username}`); },
 }));
 await controller.apply({ username: null, revision: "idle" });
 assert.deepEqual(calls, []);
 await Promise.all([
  controller.apply({ username: "one", revision: "1" }),
  controller.apply({ username: "one", revision: "1" }),
  controller.apply({ username: "two", revision: "2" }),
  controller.apply({ username: null, revision: "3" }),
 ]);
 assert.deepEqual(calls, ["start:one", "stop:one", "start:two", "stop:two"]);
 await controller.shutdown();
 await controller.apply({ username: "late", revision: "4" });
 assert.equal(calls.length, 4);
});
