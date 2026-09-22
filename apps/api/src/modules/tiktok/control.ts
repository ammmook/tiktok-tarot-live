import { randomUUID } from "node:crypto";
import { z } from "zod";

export const connectTikTokSchema = z.object({
  username: z.string().trim().transform(value => value.replace(/^@/, "").toLowerCase())
    .pipe(z.string().min(1).max(24).regex(/^[a-z0-9_.]+$/, "กรอกชื่อบัญชี TikTok เช่น @yourname")),
});

/** One dashboard controls one live connection. Restarting the API returns to idle. */
export class TikTokControl {
  private command = { username: null as string | null, revision: randomUUID() as string };
  private lastPollAt = 0;

  set(username: string | null) {
    this.command = { username, revision: randomUUID() };
    return this.read();
  }

  read() { return { ...this.command }; }
  poll() { this.lastPollAt = Date.now(); return this.read(); }
  get listenerOnline() { return Date.now() - this.lastPollAt < 15_000; }
}
