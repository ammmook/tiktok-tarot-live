import type { GiftRule } from "@/types/queue";

export function calculateRights(rule: GiftRule, count: number, alreadyAllocated = 0): number | null {
 if (!rule.active || count < rule.minimumGiftCount) return 0;
 let rights = rule.unlimitedQuestions ? Infinity : rule.questionLimit * (rule.multiplicationMode === "fixed" ? 1 : count);
 if (rule.multiplicationMode === "capped" && rule.maxQuestions !== null) rights = Math.min(rights, rule.maxQuestions);
 if (rule.maximumQuestionsPerUser !== null) rights = Math.min(rights, Math.max(0,rule.maximumQuestionsPerUser-alreadyAllocated));
 return Number.isFinite(rights) ? rights : null;
}
export function validateGiftRule(rule: GiftRule, rules: GiftRule[]): string | null {
 if (!rule.displayName.trim()) return "กรุณาใส่ชื่อของขวัญ";
 if (!/^[a-z0-9][a-z0-9_-]*$/i.test(rule.giftCode.trim())) return "Gift Code ใช้ตัวอักษรอังกฤษ ตัวเลข - หรือ _ และห้ามว่าง";
 if (rules.some(g => g.id !== rule.id && g.giftCode.toLowerCase() === rule.giftCode.trim().toLowerCase())) return "Gift Code นี้มีอยู่แล้ว กรุณาใช้รหัสอื่น";
 if (!Number.isInteger(rule.priority) || rule.priority < 1) return "Priority ต้องเป็นจำนวนเต็มตั้งแต่ 1";
 if (!rule.unlimitedQuestions && (!Number.isInteger(rule.questionLimit) || rule.questionLimit < 1 || rule.questionLimit > 20)) return "สิทธิ์คำถามต้องอยู่ระหว่าง 1–20";
 if (!Number.isInteger(rule.minimumGiftCount) || rule.minimumGiftCount < 1) return "จำนวนของขวัญขั้นต่ำต้องเป็นจำนวนเต็มตั้งแต่ 1";
 if (rule.multiplicationMode === "capped" && (rule.maxQuestions === null || !Number.isInteger(rule.maxQuestions) || rule.maxQuestions < 1)) return "กรุณากำหนด Maximum Questions ตั้งแต่ 1";
 if (rule.maximumQuestionsPerUser !== null && (!Number.isInteger(rule.maximumQuestionsPerUser) || rule.maximumQuestionsPerUser < 1)) return "สิทธิ์สูงสุดต่อคนต้องเป็นจำนวนเต็มตั้งแต่ 1";
 return null;
}
