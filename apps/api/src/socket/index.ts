import type { Server as HttpServer } from "node:http";
import { randomUUID } from "node:crypto";
import { Server } from "socket.io";
import type { AppConfig } from "../config/env.js";
import type { QueueMutationResult } from "../modules/queue/types.js";

export function createSocketServer(httpServer: HttpServer, config: AppConfig) {
  return new Server(httpServer, {
    cors: { origin: config.frontendOrigins, credentials: true },
    transports: ["websocket", "polling"],
  });
}

export function emitQueueMutation(io: Server, result: QueueMutationResult) {
  const eventName = result.eventType ?? "queue:updated";
  io.emit(eventName, {
    eventId: randomUUID(),
    entry: result.entry,
    relatedEntries: result.relatedEntries,
    queueOrder: result.queueOrder,
  });
  for (const relatedEntry of result.relatedEntries) {
    io.emit("queue:updated", {
      eventId: randomUUID(),
      entry: relatedEntry,
      relatedEntries: [],
      queueOrder: result.queueOrder,
    });
  }
  io.emit("queue:reordered", { eventId: randomUUID(), queueOrder: result.queueOrder });
}
