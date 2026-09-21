import { config as loadDotenv } from "dotenv";
import { fileURLToPath } from "node:url";
import { z } from "zod";

loadDotenv();
loadDotenv({ path: fileURLToPath(new URL("../../.env.local", import.meta.url)) });

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  FRONTEND_URL: z.string().min(1).default("http://localhost:3000"),
  LOG_LEVEL: z.string().default("info"),
  DATABASE_POOL_MAX: z.coerce.number().int().positive().max(50).default(10),
  LISTENER_API_KEY: z.string().min(16).optional(),
  QUEUE_API_SECRET: z.string().min(16).optional(),
});

export type AppConfig = z.infer<typeof envSchema> & { frontendOrigins: string[]; listenerApiKey?: string };

export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    throw new Error(`Invalid environment configuration: ${result.error.issues.map((issue) => issue.message).join(", ")}`);
  }

  return {
    ...result.data,
    frontendOrigins: result.data.FRONTEND_URL.split(",").map((origin) => origin.trim()).filter(Boolean),
    listenerApiKey: result.data.LISTENER_API_KEY ?? result.data.QUEUE_API_SECRET,
  };
}
