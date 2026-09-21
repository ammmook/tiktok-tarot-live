import { config as loadDotenv } from "dotenv";
import { fileURLToPath } from "node:url";
import { defineConfig } from "drizzle-kit";

loadDotenv();
loadDotenv({ path: fileURLToPath(new URL("../../apps/api/.env.local", import.meta.url)) });

export default defineConfig({
  dialect: "postgresql",
  schema: "./schema/index.ts",
  out: "./migrations",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
});
