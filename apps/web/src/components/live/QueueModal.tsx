"use client";
import { useEffect, useRef, useState } from "react";
import type { QueueEntry, QueueInput } from "@/types/queue";
import { useLiveQueue } from "@/store/LiveQueueProvider";
import { calculateRights } from "@/utils/giftRules";
import Icon from "@/components/ui/Icon";

export function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const beganOnBackdrop = useRef(false);
  useEffect(() => { const dialog = ref.current; const previous = document.activeElement as HTMLElement; dialog?.showModal(); return () => { dialog?.close(); previous?.focus(); }; }, []);
  return <dialog ref={ref} onCancel={onClose} onPointerDown={event => { beganOnBackdrop.current = event.target === event.currentTarget; }} onPointerUp={event => { if (beganOnBackdrop.current && event.target === event.currentTarget) onClose(); beganOnBackdrop.current = false; }} onPointerCancel={() => { beganOnBackdrop.current = false; }} aria-labelledby="dialog-title"><div className="modal-content"><div className="modal-heading"><h2 id="dialog-title">{title}</h2><button className="icon-button" onClick={onClose} aria-label="ปิด"><Icon name="close"/></button></div>{children}</div></dialog>;
}

export function QueueModal({ entry, onSave, onClose, saveError }: { entry?: QueueEntry; onSave: (input: QueueInput) => void; onClose: () => void; saveError?:string }) {
 const {rules,settings} = useLiveQueue();
 const choices = rules.filter(g=>g.active);
 if(entry && !choices.some(g=>g.id===entry.giftRuleId)) choices.push({...entry.ruleSnapshot,displayName:`${entry.giftName} (คิวเดิม)`});
 const [giftId,setGiftId] = useState(entry?.giftRuleId || choices[0]?.id || "");
 const [count,setCount] = useState(entry?.giftCount || 1);
 const [question,setQuestion] = useState(entry?.question || "");
 const [error,setError] = useState("");
 const gift = choices.find(g=>g.id===giftId);
 const rights = gift ? calculateRights({...gift,active:true},count) : 0;
 return <Modal title={entry ? (entry.question ? "แก้ไขคิว" : "เพิ่มคำถาม") : "เพิ่มคิวใหม่"} onClose={onClose}>
  <p className="muted modal-intro">สิทธิ์และลำดับคิวคำนวณจากกติกาของขวัญที่บันทึกไว้</p>
  <form onSubmit={e=>{e.preventDefault();const values=new FormData(e.currentTarget);const input:QueueInput={tiktokUsername:String(values.get("username")).trim(),displayName:String(values.get("name")).trim(),giftRuleId:giftId,giftCount:count,question:question.trim()};if(!input.displayName || !input.tiktokUsername.replace(/^@+/,"")){setError("กรุณากรอกชื่อและ Username ให้ครบ");return;}if(settings.maxQuestionLength!==null && Array.from(question).length>settings.maxQuestionLength){setError(`คำถามต้องไม่เกิน ${settings.maxQuestionLength} ตัวอักษร`);return;}setError("");onSave(input);}}>
   <div className="form-pair"><label>TikTok Username<input name="username" placeholder="@mint123" defaultValue={entry?.tiktokUsername} required maxLength={80}/></label><label>ชื่อเล่น<input name="name" placeholder="ชื่อที่อยากให้เรียก" defaultValue={entry?.displayName} required maxLength={60}/></label></div>
   <div className="form-pair"><label>ของขวัญ<select value={giftId} required onChange={e=>{setGiftId(e.target.value);setCount(choices.find(g=>g.id===e.target.value)?.minimumGiftCount || 1);}}>{choices.map(g=><option key={g.id} value={g.id}>{g.icon} {g.displayName}{g.queueType==="express"?" · ลัดคิว":""}</option>)}</select></label><label>จำนวนชิ้น<input type="number" value={count} min={gift?.minimumGiftCount || 1} step={1} required onChange={e=>setCount(e.target.valueAsNumber)}/></label></div>
   <label>คำถาม<textarea placeholder="อยากให้ไพ่ช่วยตอบเรื่องอะไร…" value={question} rows={4} onChange={e=>setQuestion(e.target.value)}/><small className="field-help">{Array.from(question).length} / {settings.maxQuestionLength ?? "ไม่จำกัด"} ตัวอักษร · เว้นว่างเพื่อรอคำถามได้</small></label>
   <p className="form-hint"><Icon name="gift" size={15}/>{rights===null?"ไม่จำกัดคำถาม":`${rights} คำถาม`} · {gift?.queueType==="express"?"ลัดคิว":"คิวปกติ"} · ขั้นต่ำ {gift?.minimumGiftCount || 1} ชิ้น</p>
   {!choices.length && <p className="form-error">ยังไม่มีของขวัญที่เปิดใช้งาน กรุณาเพิ่มใน Settings</p>}{(error || saveError) && <p role="alert" className="form-error">{error || saveError}</p>}
   <div className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>ยกเลิก</button><button className="button primary" type="submit" disabled={!gift}><Icon name={entry?"check":"plus"}/>{entry?"บันทึกการแก้ไข":"เพิ่มเข้าคิว"}</button></div>
  </form>
 </Modal>;
}
