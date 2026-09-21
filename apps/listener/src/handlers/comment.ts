import { enqueueQuestionFromTikTok } from "../client/api.js";
import type { ListenerConfig } from "../index.js";
import type { QuestionIngestEvent } from "../client/api.js";

export function handleCommentEvent(config: ListenerConfig, event: QuestionIngestEvent) {
  return enqueueQuestionFromTikTok(config, event);
}
