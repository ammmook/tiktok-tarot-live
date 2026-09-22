import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import Fastify from "fastify";
import { ZodError } from "zod";
import { registerTikTokRoutes } from "../src/routes/tiktok.ts";
import { processTikTokEvent, getTikTokPending, reportListenerStatus } from "../src/modules/tiktok/service.ts";
import { startQueue, completeQueue } from "../src/modules/queue/service.ts";
import { AppError } from "../src/errors/app-error.ts";

let client, db;
before(async () => {
 client = new PGlite();
 for (const name of ["0000_initial.sql", "0001_question_credits.sql", "0002_tiktok_live_listener.sql"]) {
  const sql = await readFile(new URL(`../../../packages/db/migrations/${name}`, import.meta.url), "utf8");
  // PGlite provides gen_random_uuid natively; pgcrypto is not bundled.
  await client.exec(sql.replace("CREATE EXTENSION IF NOT EXISTS pgcrypto;", ""));
 }
 db = drizzle(client);
 await client.exec(`INSERT INTO gift_rules (id,gift_code,display_name,icon,priority,question_limit,multiplication_mode) VALUES ('test-rose','5655','Rose','🌹',30,1,'FIXED'),('test-galaxy','galaxy','Galaxy','🌌',1,1,'FIXED');`);
});
after(async () => { await client?.close(); });

const identity = id => ({ userId: id, username: `user_${id}`, nickname: `TikTok ${id}`, profilePictureUrl: "https://example.com/avatar.png" });
const chat = (id, userId, roomId = "room") => ({ type: "chat", eventId: id, roomId, liveUsername: "host", timestamp: Date.now(), user: identity(userId), comment: "มุก/งานใหม่จะดีไหม" });
const gift = (id, userId, roomId = "room") => ({ type: "gift", eventId: id, roomId, liveUsername: "host", timestamp: Date.now(), user: identity(userId), gift: { giftId: "5655", giftName: "Rose", giftType: 1, repeatCount: 1, repeatEnd: true, imageUrl: "https://example.com/rose.png" } });

test("comment first is visible waiting for gift; same user's gift makes one ready queue", async () => {
 assert.equal((await processTikTokEvent(db, chat("c1", "1"), 10)).disposition, "waiting_for_gift");
 const pending = (await getTikTokPending(db)).find(p => p.tiktokUsername === "@user_1");
 assert.equal(pending.displayName, "มุก");
 assert.equal(pending.tiktokNickname, "TikTok 1");
 assert.equal(pending.status, "waiting_for_gift");
 const result = await processTikTokEvent(db, gift("g1", "1"), 10);
 assert.equal(result.mutations.length, 1);
 const entry = result.mutations[0].entry;
 assert.equal(entry.status, "waiting");
 assert.equal(entry.question, "งานใหม่จะดีไหม");
 assert.equal(entry.giftImageUrl, "https://example.com/rose.png");
 assert.equal(entry.profilePictureUrl, "https://example.com/avatar.png");
 assert.equal((await getTikTokPending(db)).some(p => p.tiktokUsername === "@user_1"), false);
 await startQueue(db, entry.id);
 const completed = await completeQueue(db, entry.id);
 assert.equal(completed.entry.status, "answered");
 assert.equal((await processTikTokEvent(db, gift("g1", "1"), 10)).replayed, true);
 assert.equal((await processTikTokEvent(db, chat("c1", "1"), 10)).replayed, true);
 assert.equal((await processTikTokEvent(db, chat("c1-new", "1"), 10)).disposition, "waiting_for_gift");
});

test("gift first waits for the same stable user ID; same nickname is not sufficient", async () => {
 assert.equal((await processTikTokEvent(db, gift("g2", "2"), 10)).disposition, "waiting_for_question");
 assert.equal((await getTikTokPending(db)).find(p => p.tiktokUsername === "@user_2").giftName, "Rose");
 const other = chat("c-other", "other"); other.user.nickname = "TikTok 2";
 assert.equal((await processTikTokEvent(db, other, 10)).disposition, "waiting_for_gift");
 const same = chat("c2", "2"); same.user.username = "renamed_account";
 assert.equal((await processTikTokEvent(db, same, 10)).mutations.length, 1);
});

test("streak progress cannot consume the final id; replayed final count grants once", async () => {
 const final = gift("streak:3:5655:99", "3"); final.gift.repeatCount = 5;
 assert.equal((await processTikTokEvent(db, { ...final, gift: { ...final.gift, repeatEnd: false } }, 10)).disposition, "streak_in_progress");
 assert.equal((await processTikTokEvent(db, final, 10)).disposition, "waiting_for_question");
 assert.equal((await processTikTokEvent(db, final, 10)).replayed, true);
 assert.equal((await getTikTokPending(db)).filter(p => p.tiktokUsername === "@user_3").length, 1);
});

test("room boundaries, expired credits, malformed comments and disabled gifts do not match", async () => {
 await processTikTokEvent(db, gift("g4", "4", "old-room"), 10);
 assert.equal((await processTikTokEvent(db, chat("c4", "4", "new-room"), 10)).disposition, "waiting_for_gift");
 await processTikTokEvent(db, gift("g5", "5", "new-room"), 10);
 await client.exec("UPDATE question_credits SET expires_at = now() - interval '1 minute' WHERE username = '@user_5'");
 assert.equal((await processTikTokEvent(db, chat("c5", "5", "new-room"), 10)).disposition, "waiting_for_gift");
 assert.equal((await processTikTokEvent(db, { ...chat("bad", "6"), comment: "สวัสดี" }, 10)).disposition, "ignored_invalid_question");
 const unknown = gift("unknown", "6"); unknown.gift.giftId = "unknown"; unknown.gift.giftName = "Unknown";
 assert.equal((await processTikTokEvent(db, unknown, 10)).disposition, "ignored_gift");
});

test("named gift rules work and ending a stream removes waiting items", async () => {
 const event = gift("galaxy", "7", "ending-room"); event.gift.giftId = "999"; event.gift.giftName = "Galaxy";
 await processTikTokEvent(db, event, 10);
 assert.equal((await getTikTokPending(db)).some(p => p.tiktokUsername === "@user_7"), true);
 await reportListenerStatus(db, { instanceId: "ended", liveUsername: "host", status: "OFFLINE", tiktokStatus: "ENDED", authenticationStatus: "missing", roomId: "ending-room", startedAt: Date.now() });
 assert.equal((await getTikTokPending(db)).some(p => p.tiktokUsername === "@user_7"), false);
});

test("dashboard control validates usernames, requires a live worker and isolates old status", async () => {
 const app = Fastify();
 app.setErrorHandler((error, _request, reply) => reply.code(error instanceof ZodError ? 400 : error instanceof AppError ? error.statusCode : 500).send({ error: error.message }));
 await registerTikTokRoutes(app, { db, io: { emit() {} }, config: { listenerApiKey: "test-secret-123456789", QUESTION_GIFT_MATCH_TTL_MINUTES: 10 } });
 const post = (url, payload) => app.inject({ method: "POST", url, payload });
 assert.equal((await post("/api/tiktok/connect", { username: "test" })).statusCode, 503);
 assert.equal((await app.inject("/internal/tiktok/control")).statusCode, 401);
 await app.inject({ url: "/internal/tiktok/control", headers: { authorization: "Bearer test-secret-123456789" } });
 assert.equal((await post("/api/tiktok/connect", { username: "https://bad.example" })).statusCode, 400);
 const connected = (await post("/api/tiktok/connect", { username: " @HOST " })).json().data;
 assert.equal(connected.username, "host");
 assert.equal(connected.tiktokStatus, "CONNECTING");
 await reportListenerStatus(db, { instanceId: connected.revision, liveUsername: "host", status: "ONLINE", tiktokStatus: "CONNECTED", authenticationStatus: "missing", roomId: "active-room", startedAt: Date.now() });
 assert.equal((await app.inject("/api/tiktok/connection")).json().data.tiktokStatus, "CONNECTED");
 const switched = (await post("/api/tiktok/connect", { username: "second" })).json().data;
 assert.equal(switched.tiktokStatus, "CONNECTING");
 assert.notEqual(switched.revision, connected.revision);
 assert.equal((await post("/api/tiktok/disconnect")).json().data.username, null);
 await app.close();
});
