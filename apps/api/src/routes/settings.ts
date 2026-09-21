import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { Server } from "socket.io";
import type { Database } from "@tarot-live/db";
import { settingsSchema } from "../modules/queue/schemas.js";
import { getSettingsSnapshot, updateSettings } from "../modules/queue/service.js";

export async function registerSettingsRoutes(app: FastifyInstance, options: { db: Database; io: Server }) {
  app.get("/api/settings", async () => ({ data: await getSettingsSnapshot(options.db) }));
  app.put("/api/settings", async (request) => {
    const snapshot = await updateSettings(options.db, settingsSchema.parse(request.body));
    options.io.emit("settings:updated", { eventId: randomUUID(), ...snapshot });
    return { data: snapshot };
  });
}
