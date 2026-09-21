import { timingSafeEqual } from "node:crypto";
import { AppError } from "../errors/app-error.js";
import type { AppConfig } from "../config/env.js";

export function assertListenerApiKey(config: AppConfig, authorization: string | undefined, legacyKey?: string) {
  if (!config.listenerApiKey) throw new AppError("Listener authentication is not configured", 503, "AUTH_NOT_CONFIGURED");
  const bearerMatch = authorization?.match(/^Bearer\s+(.+)$/i);
  const received = bearerMatch?.[1] ?? legacyKey;
  if (!received) throw new AppError("Listener authentication is required", 401, "UNAUTHORIZED");
  const expected = Buffer.from(config.listenerApiKey);
  const actual = Buffer.from(received);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    throw new AppError("Invalid listener authentication", 401, "UNAUTHORIZED");
  }
}
