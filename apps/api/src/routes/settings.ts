import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { Server } from "socket.io";
import type { Database } from "@tarot-live/db";
import { settingsSchema } from "../modules/queue/schemas.js";
import { getSettingsSnapshot, updateSettings } from "../modules/queue/service.js";
import type { TikTokControl } from "../modules/tiktok/control.js";

export async function registerSettingsRoutes(app: FastifyInstance, options: { db: Database; io: Server; control: TikTokControl }) {
  app.get("/api/settings", async () => ({ data: await getSettingsSnapshot(options.db, options.control.read().username) }));
  app.put("/api/settings", async (request) => {
    const username = options.control.read().username;
    const snapshot = await updateSettings(options.db, settingsSchema.parse(request.body), username);
    options.io.emit("settings:updated", { eventId: randomUUID(), username, ...snapshot });
    return { data: snapshot };
  });
}
