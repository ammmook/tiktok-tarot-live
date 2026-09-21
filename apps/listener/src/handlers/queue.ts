import { enqueueFromTikTok, type QueueIngestEvent } from "../client/api.js";
import type { ListenerConfig } from "../index.js";
import type { ParsedGiftEvent } from "../parser/event.js";

export async function handleGiftEvent(config: ListenerConfig, event: ParsedGiftEvent, giftRuleId: string) {
  const queueEvent: QueueIngestEvent = { ...event, giftRuleId };
  return enqueueFromTikTok(config, queueEvent);
}
