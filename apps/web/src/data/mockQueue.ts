import type { GiftName, GiftRule, QueueEntry } from "@/types/queue";
import { calculateRights } from "@/utils/giftRules";
export function createMockQueue(now: number, giftRules: GiftRule[]): QueueEntry[] {
 const people: [string, string, GiftName, string][] = [
 ["Mint", "minttarot", "Donut", "ภายในเดือนนี้คนที่คุยอยู่ จะมีพัฒนาการกับเรามากขึ้นไหม"],
 ["Bam", "bammii", "Donut", "ปีนี้มีโอกาสได้เปลี่ยนงานใหม่ไหมคะ"],
 ["Jane", "jjane", "Bear Heart", "ความสัมพันธ์ครั้งนี้ควรไปต่อ หรือพอแค่นี้ดีคะ"],
 ["Pear", "pearrr", "Orange Heart", "ภายในสามเดือนนี้การเงินจะเป็นอย่างไร"],
 ["May", "mayyy", "Love Glasses", "แฟนเก่ายังคิดถึงเราอยู่ไหม"],
 ["Fah", "fah.sunshine", "Donut", "คนที่เพิ่งเข้ามา เขาจริงจังกับเราไหมคะ"],
 ["Ploy", "ployp", "Love Glasses", "งานที่กำลังรอผลอยู่ มีโอกาสได้ไหมคะ"],
 ["Belle", "belle.b", "Orange Heart", "ช่วงนี้ควรโฟกัสเรื่องอะไรเป็นพิเศษ"],
 ["ABC", "abc123", "Donut", ""], ["Nana", "nana.n", "Orange Heart", ""],
 ["Ink", "inkk", "Donut", "เขาจะกลับมาภายในเดือนนี้ไหม"],
 ];
 return people.map(([displayName, username, giftName, question], i) => {
 const gift = giftRules.find(g => g.displayName === giftName)!;
 return { id: `seed-${i}`, number: i + 8, tiktokUserId: username, tiktokUsername: `@${username}`, displayName, giftRuleId: gift.id, giftCount: 1, queueType: gift.queueType, questionRights: calculateRights(gift,1), ruleSnapshot: {...gift}, giftName, giftIcon: gift.icon, giftPriority: gift.priority, question, status: i === 0 ? "answering" : i === 10 ? "answered" : !question ? "pending_question" : "waiting", createdAt: now - (15-i)*60000, answerStartedAt: i === 0 ? now-154000 : undefined, answeredAt: i === 10 ? now-300000 : undefined };
 });
}


