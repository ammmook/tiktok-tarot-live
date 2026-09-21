import type { FastifyInstance } from "fastify";
import type { Server } from "socket.io";
import type { Database } from "@tarot-live/db";
import { assertListenerApiKey } from "../auth/api-key.js";
import type { AppConfig } from "../config/env.js";
import { emitQueueMutation } from "../socket/index.js";
import { listenerStatusSchema, tiktokEventSchema } from "../modules/tiktok/schemas.js";
import { getLatestListenerStatus, processTikTokEvent, reportListenerStatus } from "../modules/tiktok/service.js";

export async function registerTikTokRoutes(app: FastifyInstance, options: { db: Database; io: Server; config: AppConfig }) {
  app.post("/internal/tiktok/events", async (request) => {
    assertListenerApiKey(options.config, request.headers.authorization, request.headers["x-listener-key"] as string | undefined);
    const input = tiktokEventSchema.parse(request.body);
    const result = await processTikTokEvent(options.db, input, options.config.QUESTION_GIFT_MATCH_TTL_MINUTES);
    if (!result.replayed) for (const mutation of result.mutations) emitQueueMutation(options.io, mutation);
    return { data: { replayed: result.replayed, disposition: result.disposition, created: result.mutations.length } };
  });

  app.post("/internal/tiktok/status", async (request) => {
    assertListenerApiKey(options.config, request.headers.authorization, request.headers["x-listener-key"] as string | undefined);
    const status = await reportListenerStatus(options.db, listenerStatusSchema.parse(request.body));
    return { data: status };
  });

  app.get("/api/listener/status", async () => ({ data: await getLatestListenerStatus(options.db) }));
}
