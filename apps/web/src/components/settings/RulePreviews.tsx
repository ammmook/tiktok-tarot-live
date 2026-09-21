"use client";
import { useState } from "react";
import type { GiftRule, QueueEntry, QueueSettings } from "@/types/queue";
import { calculateRights } from "@/utils/giftRules";
import { sortQueue } from "@/utils/queuePriority";
import Icon from "@/components/ui/Icon";

const rightsText = (rights:number|null)=>rights===null?"ไม่จำกัด":`${rights} คำถาม`;
export default function RulePreviews({rules,settings}: {rules:GiftRule[];settings:QueueSettings}) {
 const [selected,setSelected] = useState("glasses");
 const [count,setCount] = useState(1);
 const rule = rules.find(r=>r.id===selected)||rules[0];
 const samples = [["Mint","donut"],["Jane","bear"],["May","glasses"],["Pear","orange"],["Bam","glasses"]];
 const entries: QueueEntry[] = samples.flatMap(([name,id],index)=>{
  const gift=rules.find(g=>g.id===id&&g.active);if(!gift)return [];
  return [{id:`preview-${index}`,number:index+1,displayName:name,tiktokUserId:name.toLowerCase(),tiktokUsername:`@${name.toLowerCase()}`,giftName:gift.displayName,giftIcon:gift.icon,giftPriority:gift.priority,giftRuleId:gift.id,giftCount:1,queueType:gift.queueType,questionRights:calculateRights(gift,1),ruleSnapshot:gift,question:"ตัวอย่างคำถาม",status:"waiting",createdAt:index*1000}];
 });
 const sorted=sortQueue(entries,rules,settings);
 return <div className="previews-grid">
  <section className="settings-section rule-preview"><div className="section-heading"><div><span className="eyebrow">A LITTLE TEST RUN</span><h2>Rule Preview</h2><p>สิทธิ์ต่อการส่ง สำหรับผู้ถามที่ยังไม่มีคิว</p></div><Icon name="gift"/></div>
   {rule?<><label>เลือกของขวัญ<select value={rule.id} onChange={e=>setSelected(e.target.value)}>{rules.map(r=><option key={r.id} value={r.id}>{r.icon} {r.displayName}{!r.active?" · Disabled":""}</option>)}</select></label>
   <dl className="preview-facts"><div><dt>Priority</dt><dd>{rule.priority}</dd></div><div><dt>ประเภทคิว</dt><dd>{rule.queueType==="express"?"ϟ ลัดคิว":"คิวปกติ"}</dd></div><div><dt>สิทธิ์พื้นฐาน</dt><dd>{rule.unlimitedQuestions?"ไม่จำกัด":`${rule.questionLimit} คำถาม`}</dd></div><div><dt>Minimum Gift</dt><dd>{rule.minimumGiftCount} ชิ้น</dd></div><div><dt>เพดานต่อครั้ง</dt><dd>{rule.multiplicationMode==="capped"?rightsText(rule.maxQuestions):"ไม่มี"}</dd></div><div><dt>สูงสุดต่อคน</dt><dd>{rule.maximumQuestionsPerUser??"ไม่มี"}</dd></div><div><dt>Auto Queue</dt><dd>{rule.autoQueue?"Yes · อัตโนมัติ":"No · รออนุมัติ"}</dd></div><div><dt>ต้องมีคำถาม</dt><dd>{rule.requireQuestion?"Yes":"No"}</dd></div></dl>
   <div className="send-examples"><div>ส่ง x1 <strong>{rightsText(calculateRights(rule,1))}</strong></div><div>ส่ง x2 <strong>{rightsText(calculateRights(rule,2))}</strong></div></div>
   <label className="preview-count">ลองส่งจำนวนอื่น<input type="number" min={1} step={1} value={Number.isNaN(count)?"":count} onChange={e=>setCount(e.target.valueAsNumber)}/><strong>{Number.isInteger(count)&&count>0?rightsText(calculateRights(rule,count)):"ใส่จำนวนเต็มตั้งแต่ 1"}</strong></label>
   {!rule.active?<p className="field-help">Disabled · ไม่รับเข้าคิวใหม่</p>:count<rule.minimumGiftCount?<p className="field-help gold">ยังไม่ถึงจำนวนขั้นต่ำ จึงไม่ได้สิทธิ์เข้าคิว</p>:null}</>:<p className="empty-state">เพิ่มของขวัญเพื่อดูตัวอย่างสิทธิ์</p>}
  </section>
  <section className="settings-section order-preview"><div className="section-heading"><div><span className="eyebrow">SEE WHO COMES NEXT</span><h2>Queue Order Preview</h2><p>ลำดับหลังใช้กติกาฉบับร่างของคุณ</p></div><Icon name="bolt"/></div>
   <div className="preview-current"><span className="dot purple-dot"/>{settings.protectCurrentQuestion?"คนที่กำลังตอบยังคงอยู่ใน Current Question":"ปิดการป้องกัน Current · คิวลัดพร้อมตอบจะแทรกคนปัจจุบันได้"}</div>
   <ol>{sorted.map((entry,index)=><li key={entry.id} className={entry.queueType==="express"?"express-sample":""}><span className="preview-index">{String(index+1).padStart(2,"0")}</span><span className="preview-emoji">{entry.giftIcon}</span><div><strong>{entry.displayName}</strong><small>{entry.giftName}</small></div><span className="preview-priority">Priority {entry.giftPriority}<small>{entry.queueType==="express"?"ϟ ลัดคิว":"คิวปกติ"}</small></span></li>)}</ol>
   <p className="field-help">ตัวอย่างส่งก่อน → หลัง: Mint, Jane, May, Pear, Bam<br/>แสดงเฉพาะของขวัญเริ่มต้นที่ยังเปิดใช้งาน · ใช้ตัวเรียงเดียวกับ LIVE</p>
  </section>
 </div>;
}

