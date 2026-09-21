import { neonConfig, Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import ws from "ws";
import * as schema from "./schema/index.js";

neonConfig.webSocketConstructor = ws;

export type Database = ReturnType<typeof createDatabase>;

export type DatabaseWithPool = {
  db: Database;
  pool: Pool;
};

export function createPool(connectionString = process.env.DATABASE_URL) {
  if (!connectionString) {
    throw new Error("DATABASE_URL is required");
  }

  return new Pool({
    connectionString,
    max: Number(process.env.DATABASE_POOL_MAX ?? 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
}

export function createDatabase(connectionString = process.env.DATABASE_URL) {
  const pool = createPool(connectionString);
  return drizzle({ client: pool, schema });
}

export function createDatabaseWithPool(connectionString = process.env.DATABASE_URL): DatabaseWithPool {
  const pool = createPool(connectionString);
  return { db: drizzle({ client: pool, schema }), pool };
}

export async function closePool(pool: Pool) {
  await pool.end();
}

export { schema };
export * from "./schema/index.js";
