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
  try {
    await pool.query("BEGIN");
    await pool.query(`
      CREATE TABLE IF NOT EXISTS app_migrations (
        filename text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    const filenames = (await readdir(migrationDirectory))
      .filter((filename) => filename.endsWith(".sql"))
      .sort();

    for (const filename of filenames) {
      const existing = await pool.query("SELECT 1 FROM app_migrations WHERE filename = $1", [filename]);
      if (existing.rowCount) continue;
      const sql = await readFile(join(migrationDirectory, filename), "utf8");
      await pool.query(sql);
      await pool.query("INSERT INTO app_migrations (filename) VALUES ($1)", [filename]);
      console.log(`Applied ${filename}`);
    }

    await pool.query("COMMIT");
  } catch (error) {
    await pool.query("ROLLBACK");
    throw error;
  } finally {
    await closePool(pool);
  }
}

await migrate();
