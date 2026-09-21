import type { FastifyInstance } from "fastify";
import type { Server } from "socket.io";
import type { Database } from "@tarot-live/db";
import { assertListenerApiKey } from "../auth/api-key.js";
import type { AppConfig } from "../config/env.js";
import { createQuestion, createQueue } from "../modules/queue/service.js";
import { createQuestionSchema, createQueueSchema } from "../modules/queue/schemas.js";
import type { QueueMutationResult } from "../modules/queue/types.js";
import { emitQueueMutation } from "../socket/index.js";

export async function registerIngestRoutes(app: FastifyInstance, options: { db: Database; io: Server; config: AppConfig }) {
  app.post("/api/ingest/queue", async (request, reply) => {
    assertListenerApiKey(options.config, request.headers["x-listener-key"] as string | undefined);
    const input = createQueueSchema.parse({ ...(request.body as Record<string, unknown>), source: "tiktok" });
    const result: QueueMutationResult = await createQueue(options.db, input);
    if (!result.replayed) emitQueueMutation(options.io, result);
    return reply.code(result.replayed ? 200 : 201).send({ data: result.entry, replayed: Boolean(result.replayed) });
  });

  app.post("/api/ingest/question", async (request, reply) => {
    assertListenerApiKey(options.config, request.headers["x-listener-key"] as string | undefined);
    const input = createQuestionSchema.parse({ ...(request.body as Record<string, unknown>), source: "tiktok" });
    const result: QueueMutationResult = await createQuestion(options.db, input);
    if (!result.replayed) emitQueueMutation(options.io, result);
    return reply.code(result.replayed ? 200 : 201).send({ data: result.entry, replayed: Boolean(result.replayed) });
  });
}
