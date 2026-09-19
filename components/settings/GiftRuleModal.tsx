"use client";
import { useState } from "react";
import type { ColorTag, GiftRule } from "@/types/queue";
import { Modal } from "@/components/live/QueueModal";
import { validateGiftRule } from "@/utils/giftRules";
import { NumberField, Toggle } from "./Fields";

export default function GiftRuleModal({initial,rules,isNew,onSave,onClose}: {initial:GiftRule;rules:GiftRule[];isNew:boolean;onSave:(rule:GiftRule)=>void;onClose:()=>void}) {
 const [draft,setDraft] = useState({...initial});
 const [error,setError] = useState("");
 const field = <K extends keyof GiftRule>(key:K,value:GiftRule[K]) => setDraft(previous=>({...previous,[key]:value}));
 return <Modal title={isNew?"เพิ่มของขวัญ":"แก้ไขกติกาของขวัญ"} onClose={onClose}><form className="gift-rule-form" onSubmit={e=>{e.preventDefault();const normalized={...draft,giftCode:draft.giftCode.trim().toLowerCase(),displayName:draft.displayName.trim(),icon:draft.icon.trim()||"🎁",isExpress:draft.queueType==="express"};const problem=validateGiftRule(normalized,rules);if(problem){setError(problem);return;}onSave(normalized);}}>
  <p className="muted modal-intro">กำหนดสิทธิ์ให้ของขวัญชิ้นนี้ แล้วตรวจผลก่อนบันทึกการตั้งค่า</p>
  <div className="form-pair"><label>Gift Display Name<input required value={draft.displayName} onChange={e=>field("displayName",e.target.value)} maxLength={80}/></label><label>Gift Code / Internal ID<input required value={draft.giftCode} onChange={e=>field("giftCode",e.target.value)} maxLength={80}/><small className="field-help">รหัสไม่ซ้ำ สำหรับเชื่อมต่อในอนาคต</small></label></div>
  <div className="form-pair"><label>Emoji / Icon<input value={draft.icon} onChange={e=>field("icon",e.target.value)} maxLength={12}/></label><label>Color Tag<select value={draft.colorTag} onChange={e=>field("colorTag",e.target.value as ColorTag)}>{["default","gold","purple","orange","pink","blue"].map(c=><option key={c} value={c}>{c[0].toUpperCase()+c.slice(1)}</option>)}</select></label></div>
  <div className="form-pair"><NumberField label="Priority" value={draft.priority} onChange={v=>field("priority",v)} help="เลข Priority ยิ่งน้อย คิวยิ่งขึ้นก่อน"/><label>ประเภทคิว<select value={draft.queueType} onChange={e=>field("queueType",e.target.value as GiftRule["queueType"])}><option value="normal">Normal · คิวปกติ</option><option value="express">Express · ลัดคิว</option></select><small className="field-help">คิวลัดขึ้นก่อนคิวปกติ ไม่แทรกคนที่กำลังตอบเมื่อเปิดการป้องกัน</small></label></div>
  <div className="form-section-title">สิทธิ์คำถาม</div>
  <Toggle label="Unlimited Questions" help="ไม่จำกัดจำนวนคำถามพื้นฐาน" checked={draft.unlimitedQuestions} onChange={v=>field("unlimitedQuestions",v)}/>
  <NumberField label="Question Limit" value={draft.questionLimit} max={20} disabled={draft.unlimitedQuestions} onChange={v=>field("questionLimit",v)} help="จำนวนคำถามที่ได้จากของขวัญนี้ (1–20)"/>
  <label>เมื่อส่ง Gift หลายชิ้น<select value={draft.multiplicationMode} onChange={e=>{field("multiplicationMode",e.target.value as GiftRule["multiplicationMode"]);if(e.target.value==="capped" && draft.maxQuestions===null)field("maxQuestions",5);}}><option value="multiply">Multiply · เพิ่มตามจำนวนที่ส่ง</option><option value="fixed">Fixed · ได้สิทธิ์ครั้งเดียว</option><option value="capped">Capped · เพิ่มตามจำนวน แต่มีเพดาน</option></select><small className="field-help">กำหนดสิทธิ์เมื่อส่งของขวัญชนิดเดียวกันหลายชิ้น</small></label>
  {draft.multiplicationMode==="capped" && <NumberField label="Maximum Questions" value={draft.maxQuestions??5} onChange={v=>field("maxQuestions",v)} help="จำนวนคำถามสูงสุดต่อการส่งหนึ่งครั้ง"/>}
  <NumberField label="Minimum Gift Count" value={draft.minimumGiftCount} onChange={v=>field("minimumGiftCount",v)} help="ส่งอย่างน้อยกี่ชิ้นจึงจะได้สิทธิ์เข้าคิว"/>
  <Toggle label="No Maximum · ไม่จำกัดสิทธิ์ต่อคน" help="ถ้าปิด จะจำกัดสิทธิ์รวมในคิวที่ยังไม่ตอบของผู้ถามคนเดียวกัน" checked={draft.maximumQuestionsPerUser===null} onChange={v=>field("maximumQuestionsPerUser",v?null:5)}/>
  {draft.maximumQuestionsPerUser!==null && <NumberField label="Maximum Questions per User" value={draft.maximumQuestionsPerUser} onChange={v=>field("maximumQuestionsPerUser",v)}/>}
  <div className="form-section-title">การรับเข้าคิว</div>
  <Toggle label="Auto Add to Queue" help="ปิดเพื่อให้รออนุมัติก่อน แม้มีคำถามแล้ว" checked={draft.autoQueue} onChange={v=>field("autoQueue",v)}/>
  <Toggle label="Require Question Before Queue" help="เปิดเพื่อพัก Gift ไว้ที่รอคำถาม เมื่อยังไม่มี Comment" checked={draft.requireQuestion} onChange={v=>field("requireQuestion",v)}/>
  <Toggle label="Active" help="ปิดแล้วจะไม่รับของขวัญนี้สร้างคิวใหม่" checked={draft.active} onChange={v=>field("active",v)}/>
  {draft.queueType==="express" && <fieldset className="advanced-rules"><legend>Express Behavior</legend><label>การแทรกคิว<select value={draft.expressBehavior} onChange={e=>field("expressBehavior",e.target.value as GiftRule["expressBehavior"])}><option value="before_normal">Insert Before Normal Queue</option><option value="after_express_group">Insert After Current Express Group</option></select><small className="field-help">แบบแรกเรียง Priority ในกลุ่มคิวลัด · แบบหลังต่อท้ายกลุ่มคิวลัดที่มาก่อน</small></label><Toggle label="Respect Existing Express Queue" help="เมื่อ Priority เท่ากัน ให้คิวลัดที่มาก่อนอยู่ก่อน" checked={draft.respectExistingExpressQueue} onChange={v=>field("respectExistingExpressQueue",v)}/></fieldset>}
  {error && <p className="form-error" role="alert">{error}</p>}
  <div className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>ยกเลิก</button><button className="button primary" type="submit">บันทึก</button></div>
 </form></Modal>;
}
