import { sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { Database } from "@tarot-live/db";

export async function registerHealthRoute(app: FastifyInstance, db: Database) {
  app.get("/health", async (_request, reply) => {
    try {
      await db.execute(sql`select 1`);
      return { status: "ok" };
    } catch {
      return reply.code(503).send({ status: "error" });
    }
  });
}
