import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import { ZodError } from "zod";
import { closePool, createDatabaseWithPool } from "@tarot-live/db";
import { loadConfig, type AppConfig } from "./config/env.js";
import { AppError } from "./errors/app-error.js";
import { registerHealthRoute } from "./routes/health.js";
import { registerIngestRoutes } from "./routes/ingest.js";
import { registerQueueRoutes } from "./routes/queue.js";
import { registerSettingsRoutes } from "./routes/settings.js";
import { createSocketServer } from "./socket/index.js";

export async function buildApp(config: AppConfig = loadConfig()) {
  const app = Fastify({ logger: { level: config.LOG_LEVEL } });
  const { db, pool } = createDatabaseWithPool(config.DATABASE_URL);
  const io = createSocketServer(app.server, config);

  await app.register(helmet);
  await app.register(cors, {
    origin: config.frontendOrigins,
    credentials: true,
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Listener-Key"],
  });
  await registerHealthRoute(app, db);
  await registerQueueRoutes(app, { db, io });
  await registerIngestRoutes(app, { db, io, config });
  await registerSettingsRoutes(app, { db, io });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) {
      return reply.code(400).send({ error: { code: "VALIDATION_ERROR", message: "Invalid request", details: error.issues } });
    }
    if (error instanceof AppError) {
      return reply.code(error.statusCode).send({ error: { code: error.code, message: error.message, details: error.details } });
    }
    const databaseError = error as Error & { code?: string };
    if (databaseError.code === "23505") {
      return reply.code(409).send({ error: { code: "CONFLICT", message: "The queue mutation conflicts with an existing record" } });
    }
    request.log.error(error);
    return reply.code(500).send({ error: { code: "INTERNAL_ERROR", message: "Internal server error" } });
  });

  app.addHook("onClose", async () => {
    io.close();
    await closePool(pool);
  });

  return app;
}
