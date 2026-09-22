import type { GiftRule, QueueEntry, QueueSettings } from "@/types/queue";

export function resolveRule(entry: QueueEntry, rules: GiftRule[]) {
 return rules.find(rule => rule.id === entry.giftRuleId) || entry.ruleSnapshot;
}
export function sortQueue(entries: QueueEntry[], rules: GiftRule[], settings: QueueSettings) {
 const time = (e: QueueEntry) => e.queueEnteredAt ?? e.createdAt;
 const restoreNext = entries.filter(entry => entry.restoreNext).sort((a,b) => time(a)-time(b) || a.number-b.number);
 const regularEntries = entries.filter(entry => !entry.restoreNext);
 const normal: QueueEntry[] = [];
 const express: QueueEntry[] = [];
 // Insert in arrival order: append-mode express never cuts an existing express group.
 for (const entry of [...regularEntries].sort((a,b) => time(a)-time(b) || a.number-b.number)) {
  const rule = resolveRule(entry,rules);
  if (rule.queueType !== "express") { normal.push(entry); continue; }
  if (rule.expressBehavior === "after_express_group") { express.push(entry); continue; }
  const position = express.findIndex(other => {
   const otherRule = resolveRule(other,rules);
   if (rule.priority !== otherRule.priority) return rule.priority < otherRule.priority;
   if (entry.movedToEnd) return false;
   return !settings.fifoSamePriority && !rule.respectExistingExpressQueue;
  });
  if (position < 0) express.push(entry); else express.splice(position,0,entry);
 }
 normal.sort((a,b) => resolveRule(a,rules).priority-resolveRule(b,rules).priority ||
  Number(!!a.movedToEnd)-Number(!!b.movedToEnd) ||
  (settings.fifoSamePriority || (a.movedToEnd && b.movedToEnd) ? time(a)-time(b) : time(b)-time(a)) || a.number-b.number);
 return [...restoreNext,...express,...normal];
}
export function waitingQueue(entries: QueueEntry[], rules: GiftRule[], settings: QueueSettings) {
 return sortQueue(entries.filter(e => e.status === "waiting"),rules,settings);
}
