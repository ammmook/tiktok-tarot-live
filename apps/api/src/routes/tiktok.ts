import type { FastifyInstance } from "fastify";
import type { Server } from "socket.io";
import type { Database } from "@tarot-live/db";
import { assertListenerApiKey } from "../auth/api-key.js";
import type { AppConfig } from "../config/env.js";
import { emitQueueMutation } from "../socket/index.js";
import { listenerStatusSchema, tiktokEventSchema } from "../modules/tiktok/schemas.js";
import { getLatestListenerStatus, getTikTokPending, processTikTokEvent, reportListenerStatus } from "../modules/tiktok/service.js";
import { ensureAccountSettings } from "../modules/queue/repository.js";
import { connectTikTokSchema, TikTokControl } from "../modules/tiktok/control.js";
import { AppError } from "../errors/app-error.js";

export async function registerTikTokRoutes(app: FastifyInstance, options: { db: Database; io: Server; config: AppConfig; control?: TikTokControl }) {
  const control = options.control ?? new TikTokControl();
  const connectionStatus = async () => {
    const command = control.read();
    const status = command.username ? await getLatestListenerStatus(options.db, command.revision) : null;
    return { ...command, listenerOnline: control.listenerOnline,
      status: status?.status ?? "OFFLINE",
      tiktokStatus: !command.username ? "OFFLINE" : !control.listenerOnline ? "BACKEND_UNREACHABLE" : !status?.updatedAt ? "CONNECTING" : status.tiktokStatus,
      roomId: status?.roomId ?? null, lastEventAt: status?.lastEventAt ?? null,
      updatedAt: status?.updatedAt ?? null,
      detail: status && "detail" in status ? status.detail : null,
    };
  };
  app.get("/internal/tiktok/control", async request => {
    assertListenerApiKey(options.config, request.headers.authorization);
    return { data: control.poll() };
  });
  app.get("/api/tiktok/connection", async () => ({ data: await connectionStatus() }));
  app.post("/api/tiktok/connect", async request => {
    const { username } = connectTikTokSchema.parse(request.body);
    if (!options.config.listenerApiKey) throw new AppError("ยังไม่ได้ตั้งค่า secret สำหรับบริการรับ TikTok", 503, "LISTENER_NOT_CONFIGURED");
    if (!control.listenerOnline) throw new AppError("บริการรับ TikTok ยังไม่พร้อม กรุณาเปิดบริการ listener แล้วลองอีกครั้ง", 503, "LISTENER_OFFLINE");
    control.set(username);
    await ensureAccountSettings(options.db, username);
    return { data: await connectionStatus() };
  });
  app.post("/api/tiktok/disconnect", async () => {
    control.set(null);
    return { data: await connectionStatus() };
  });
  app.get("/api/tiktok/pending", async () => ({ data: await getTikTokPending(options.db, control.read().username) }));
  app.post("/internal/tiktok/events", async (request) => {
    assertListenerApiKey(options.config, request.headers.authorization, request.headers["x-listener-key"] as string | undefined);
    const input = tiktokEventSchema.parse(request.body);
    const result = await processTikTokEvent(options.db, input, options.config.QUESTION_GIFT_MATCH_TTL_MINUTES);
    if (!result.replayed) for (const mutation of result.mutations) emitQueueMutation(options.io, mutation);
    if (!result.replayed) options.io.emit("tiktok:pending-changed");
    return { data: { replayed: result.replayed, disposition: result.disposition, created: result.mutations.length } };
  });

  app.post("/internal/tiktok/status", async (request) => {
    assertListenerApiKey(options.config, request.headers.authorization, request.headers["x-listener-key"] as string | undefined);
    const status = await reportListenerStatus(options.db, listenerStatusSchema.parse(request.body));
    options.io.emit("tiktok:status-changed");
    if (status.tiktokStatus === "ENDED") options.io.emit("tiktok:pending-changed");
    return { data: status };
  });

  app.get("/api/listener/status", async () => ({ data: await getLatestListenerStatus(options.db) }));
}
