import { createMockQueue } from "@/data/mockQueue";
import type { GiftRule, QueueEntry, QueueInput, QueueSettings, QueueStatus } from "@/types/queue";
import { calculateRights } from "@/utils/giftRules";
import { resolveRule, waitingQueue } from "@/utils/queuePriority";

export const normalizeUsername = (name: string) => name.trim().replace(/^@+/, "").toLowerCase();
export const activeEntries = (entries: QueueEntry[]) => entries.filter(e => e.status === "waiting" || e.status === "answering");
export function applyRule(entry: QueueEntry, rule: GiftRule): QueueEntry {
 return {...entry,giftName:rule.displayName,giftIcon:rule.icon,giftPriority:rule.priority,queueType:rule.queueType,
  ruleSnapshot:{...rule},questionRights:calculateRights({...rule,active:true},entry.giftCount)};
}
export function validateQueueInput(input: QueueInput, rule: GiftRule | undefined, settings: QueueSettings): string | null {
 if (!input.displayName.trim() || !normalizeUsername(input.tiktokUsername)) return "กรุณากรอกชื่อเล่นและ TikTok Username";
 if (!rule || !rule.active) return "ของขวัญนี้ปิดใช้งานหรือถูกลบแล้ว กรุณาเลือกของขวัญที่เปิดใช้งาน";
 if (!Number.isInteger(input.giftCount) || input.giftCount < rule.minimumGiftCount) return `ต้องส่ง ${rule.displayName} อย่างน้อย ${rule.minimumGiftCount} ชิ้น`;
 if (settings.maxQuestionLength !== null && Array.from(input.question).length > settings.maxQuestionLength) return `คำถามต้องไม่เกิน ${settings.maxQuestionLength} ตัวอักษร`;
 return null;
}
export function admission(entry: QueueEntry, entries: QueueEntry[], settings: QueueSettings, approved = false): QueueEntry {
 const rule = entry.ruleSnapshot;
 if (rule.requireQuestion && !entry.question.trim()) return {...entry,status:"pending_question",pendingReason:"รอคำถามจาก Comment"};
 if (!rule.autoQueue && !approved) return {...entry,status:"pending_approval",pendingReason:"กติกาของขวัญต้องอนุมัติก่อน"};
 if (settings.maxActiveQueues !== null && activeEntries(entries.filter(e => e.id !== entry.id)).length >= settings.maxActiveQueues)
  return {...entry,status:"pending_approval",pendingReason:"จำนวนคิวถึงขีดจำกัดแล้ว"};
 return {...entry,status:"waiting",pendingReason:undefined};
}
export function addWithProtection(entries: QueueEntry[], entry: QueueEntry, settings: QueueSettings, now: number) {
 if (!settings.protectCurrentQuestion && entry.status === "waiting" && entry.queueType === "express" && entry.question.trim() && entries.some(e => e.status === "answering" && e.queueType !== "express"))
  return [...entries.map(e => e.status === "answering" ? {...e,status:"skipped" as const,answerStartedAt:undefined} : e),{...entry,status:"answering" as const,answerStartedAt:now}];
 return [...entries,entry];
}
export function restoreQueueEntry(entries: QueueEntry[], snapshot: QueueEntry, rules: GiftRule[], settings: QueueSettings, now: number) {
 const others = entries.filter(e=>e.id!==snapshot.id);
 let restored: QueueEntry = {...snapshot,answeredAt:undefined};
 if(snapshot.status === "answering" && !others.some(e=>e.status === "answering")) {
  const admitted = admission(restored,others,settings,true);
  restored = admitted.status === "waiting" ? {...admitted,status:"answering",answerStartedAt:now} : admitted;
 } else if(snapshot.status === "answering" || snapshot.status === "waiting") {
  restored = admission({...applyRule(restored,resolveRule(restored,rules)),answerStartedAt:undefined},others,settings,true);
 }
 return entries.map(e=>e.id===restored.id?restored:e);
}
export const queueService = {
 load: createMockQueue,
 create(entries: QueueEntry[], input: QueueInput, now: number, rules: GiftRule[], settings: QueueSettings): QueueEntry {
  const rule = rules.find(g => g.id === input.giftRuleId);
  const error = validateQueueInput(input,rule,settings);
  if (error || !rule) throw new Error(error || "ไม่พบกติกาของขวัญ");
  const allocated = entries.filter(e => !["cancelled","answered"].includes(e.status) && normalizeUsername(e.tiktokUsername) === normalizeUsername(input.tiktokUsername))
   .reduce((sum,e) => sum + (e.questionRights ?? Infinity),0);
  const rights = calculateRights(rule,input.giftCount,allocated);
  if (rights === 0) throw new Error("ผู้ถามใช้สิทธิ์คำถามสูงสุดแล้ว");
  const entry: QueueEntry = {...input,id:crypto.randomUUID(),number:Math.max(0,...entries.map(e=>e.number))+1,
   tiktokUsername:`@${normalizeUsername(input.tiktokUsername)}`,tiktokUserId:normalizeUsername(input.tiktokUsername),
   giftName:rule.displayName,giftIcon:rule.icon,giftPriority:rule.priority,queueType:rule.queueType,ruleSnapshot:{...rule},
   questionRights:rights,status:"waiting",createdAt:now};
  return admission(entry,entries,settings);
 },
 edit(entry: QueueEntry, input: QueueInput, rules: GiftRule[], settings: QueueSettings, entries: QueueEntry[]): QueueEntry {
  const rule = rules.find(g => g.id === input.giftRuleId) || (input.giftRuleId === entry.giftRuleId ? entry.ruleSnapshot : undefined);
  // Old queues retain their gift even if the rule was removed or disabled.
  const existingGift = input.giftRuleId === entry.giftRuleId;
  const error = validateQueueInput(input,existingGift && rule ? {...rule,active:true} : rule,settings);
  if (error || !rule) throw new Error(error || "ไม่พบกติกาของขวัญ");
  if (entry.status === "answering" && !input.question.trim()) throw new Error("คนที่กำลังตอบต้องมีคำถาม");
  let updated = applyRule({...entry,...input,tiktokUsername:`@${normalizeUsername(input.tiktokUsername)}`,tiktokUserId:normalizeUsername(input.tiktokUsername)},rule);
  const allocated = entries.filter(e => e.id !== entry.id && !["cancelled","answered"].includes(e.status) && normalizeUsername(e.tiktokUsername)===normalizeUsername(input.tiktokUsername)).reduce((sum,e)=>sum+(e.questionRights??Infinity),0);
  updated.questionRights = calculateRights({...rule,active:true},input.giftCount,allocated);
  if(updated.questionRights === 0) throw new Error("ผู้ถามใช้สิทธิ์คำถามสูงสุดแล้ว");
  if (["pending_question","pending_approval","waiting"].includes(entry.status)) updated = admission(updated,entries,settings,entry.status === "waiting");
  return updated;
 },
 transition(entries: QueueEntry[], id: string, status: QueueStatus, now: number, rules: GiftRule[], settings: QueueSettings): QueueEntry[] {
  const target = entries.find(e=>e.id===id);
  if(!target) return entries;
  if(status === "answering" && (!target.question.trim() || target.status !== "waiting")) throw new Error("กรุณาเพิ่มคำถามและอนุมัติคิวก่อนเริ่มตอบ");
  let result = entries.map(e => {
   if(e.id === id) {
    if(status === "waiting") return admission({...applyRule(e,resolveRule(e,rules)),answeredAt:undefined,answerStartedAt:undefined},entries,settings,true);
    if(status === "skipped" && settings.skippedBehavior === "end_of_priority") return {...applyRule(e,resolveRule(e,rules)),status:"waiting" as const,answerStartedAt:undefined,queueEnteredAt:now,movedToEnd:true};
    return {...e,status,answerStartedAt:status === "answering" ? now : undefined,answeredAt:status === "answered" ? now : undefined};
   }
   if(status === "answering" && e.status === "answering") return {...e,status:"skipped" as const,answerStartedAt:undefined};
   return e;
  });
  if(status === "answered" && settings.autoAdvance) {
   const next = waitingQueue(result,rules,settings).find(e=>e.question.trim());
   if(next) result = result.map(e=>e.id===next.id?{...e,status:"answering",answerStartedAt:now}:e);
  }
  return result;
 },
 syncRules(entries: QueueEntry[], rules: GiftRule[], settings?: QueueSettings) {
  let updated = entries.map(e => {
   if (["answered","cancelled","answering"].includes(e.status)) return e;
   const rule = resolveRule(e,rules);
   return JSON.stringify(rule) === JSON.stringify(e.ruleSnapshot) ? e : applyRule(e,rule);
  });
  if(settings) updated = updated.map(e => {
   if(e.status === "waiting" && e.ruleSnapshot.requireQuestion && !e.question.trim())
    return {...e,status:"pending_question",pendingReason:"รอคำถามจาก Comment"};
   if(e.status === "pending_question" && (!e.ruleSnapshot.requireQuestion || e.question.trim()))
    return admission(e,updated,settings);
   return e;
  });
  return updated;
 },
};
