import { config as loadDotenv } from "dotenv";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createPool, closePool } from "./index.js";

const migrationDirectory = fileURLToPath(new URL("./migrations/", import.meta.url));
loadDotenv();
loadDotenv({ path: fileURLToPath(new URL("../../apps/api/.env.local", import.meta.url)) });

async function migrate() {
  const pool = createPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`
      CREATE TABLE IF NOT EXISTS app_migrations (
        filename text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    const filenames = (await readdir(migrationDirectory))
      .filter((filename) => filename.endsWith(".sql"))
      .sort();

    for (const filename of filenames) {
      const existing = await client.query("SELECT 1 FROM app_migrations WHERE filename = $1", [filename]);
      if (existing.rowCount) continue;
      const sql = await readFile(join(migrationDirectory, filename), "utf8");
      await client.query(sql);
      await client.query("INSERT INTO app_migrations (filename) VALUES ($1)", [filename]);
      console.log(`Applied ${filename}`);
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await closePool(pool);
  }
}

await migrate();
