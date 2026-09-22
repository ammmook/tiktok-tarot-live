import type { FastifyInstance } from "fastify";
import type { Server } from "socket.io";
import type { Database } from "@tarot-live/db";
import { idSchema, createQuestionSchema, createQueueSchema, historyQuerySchema, updateQueueSchema } from "../modules/queue/schemas.js";
import { cancelQueue, completeQueue, createQuestion, createQueue, deleteQueue, restoreQueue, skipQueue, startQueue, updateQueue } from "../modules/queue/service.js";
import { listActive, listHistory } from "../modules/queue/repository.js";
import { emitQueueMutation } from "../socket/index.js";
import type { TikTokControl } from "../modules/tiktok/control.js";

export async function registerQueueRoutes(app: FastifyInstance, options: { db: Database; io: Server; control: TikTokControl }) {
  const { db, io, control } = options;
  const accountUsername = () => control.read().username;

  app.get("/api/queue", async () => ({ data: { entries: await listActive(db, control.read().username) } }));
  app.get("/api/queue/history", async (request) => {
    const { limit } = historyQuerySchema.parse(request.query);
    return { data: { entries: await listHistory(db, limit, control.read().username) } };
  });

  app.post("/api/queue", async (request, reply) => {
    const input = createQueueSchema.parse(request.body);
    const result = await createQueue(db, input, accountUsername());
    if (!result.replayed) emitQueueMutation(io, result);
    return reply.code(result.replayed ? 200 : 201).send({ data: result.entry, replayed: Boolean(result.replayed) });
  });

  app.post("/api/queue/questions", async (request, reply) => {
    const input = createQuestionSchema.parse(request.body);
    const result = await createQuestion(db, input, accountUsername());
    if (!result.replayed) emitQueueMutation(io, result);
    return reply.code(result.replayed ? 200 : 201).send({ data: result.entry, replayed: Boolean(result.replayed) });
  });

  app.patch("/api/queue/:id", async (request) => {
    const { id } = idSchema.parse(request.params);
    const result = await updateQueue(db, id, updateQueueSchema.parse(request.body), accountUsername());
    emitQueueMutation(io, result);
    return { data: result.entry };
  });

  app.post("/api/queue/:id/start", async (request) => {
    const { id } = idSchema.parse(request.params);
    const result = await startQueue(db, id, accountUsername());
    emitQueueMutation(io, result);
    return { data: result.entry };
  });

  app.post("/api/queue/:id/complete", async (request) => {
    const { id } = idSchema.parse(request.params);
    const result = await completeQueue(db, id, accountUsername());
    emitQueueMutation(io, result);
    return { data: result.entry };
  });

  app.post("/api/queue/:id/cancel", async (request) => {
    const { id } = idSchema.parse(request.params);
    const result = await cancelQueue(db, id, accountUsername());
    emitQueueMutation(io, result);
    return { data: result.entry };
  });

  app.post("/api/queue/:id/skip", async (request) => {
    const { id } = idSchema.parse(request.params);
    const result = await skipQueue(db, id);
    emitQueueMutation(io, result);
    return { data: result.entry };
  });

  app.post("/api/queue/:id/restore", async (request) => {
    const { id } = idSchema.parse(request.params);
    const result = await restoreQueue(db, id);
    emitQueueMutation(io, result);
    return { data: result.entry };
  });

  app.delete("/api/queue/:id", async (request) => {
    const { id } = idSchema.parse(request.params);
    const result = await deleteQueue(db, id, accountUsername());
    emitQueueMutation(io, result);
    return { data: result.entry };
  });
}
