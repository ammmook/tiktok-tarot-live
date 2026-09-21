"use client";
import type { QueueSettings } from "@/types/queue";
import { NumberField, Toggle } from "./Fields";
export default function GeneralQueueRules({settings,onChange}: {settings:QueueSettings;onChange:(settings:QueueSettings)=>void}) {
 const set = <K extends keyof QueueSettings>(key:K,value:QueueSettings[K])=>onChange({...settings,[key]:value});
 return <section className="settings-section"><div className="section-heading"><div><span className="eyebrow">THE FLOW OF YOUR LIVE</span><h2>General Queue Rules</h2><p>ตั้งค่าจังหวะและการแสดงผล ให้เหมาะกับ LIVE ของคุณ</p></div><span className="soft-label">กติกาส่วนกลาง</span></div>
  <div className="general-grid">
   <div className="settings-group"><h3>ลำดับและจังหวะการตอบ</h3><p className="field-help">คิวลัดก่อนคิวปกติ → 1. Priority ต่ำกว่า → 2. คนที่เข้าก่อน</p>
    <Toggle label="FIFO within same priority" help="ปิดเพื่อให้คิวที่เข้าทีหลังขึ้นก่อน เมื่อ Priority เท่ากัน" checked={settings.fifoSamePriority} onChange={v=>set("fifoSamePriority",v)}/>
    <Toggle label="ห้ามคิวลัดแทรกคนที่กำลังตอบ" help="คิวลัดจะขึ้นเป็นคนถัดไป แต่จะไม่ตัด Current Question" checked={settings.protectCurrentQuestion} onChange={v=>set("protectCurrentQuestion",v)}/>
    {!settings.protectCurrentQuestion && <p className="field-help gold">คิวลัดใหม่ที่พร้อมตอบจะพักคนปัจจุบันและเริ่มตอบทันที</p>}
    <Toggle label="Auto Move Next Queue" help="เมื่อกดตอบแล้ว เริ่มคิวถัดไปที่มีคำถามให้อัตโนมัติ" checked={settings.autoAdvance} onChange={v=>set("autoAdvance",v)}/>
    <label>เมื่อข้ามไว้ก่อน<select value={settings.skippedBehavior} onChange={e=>set("skippedBehavior",e.target.value as QueueSettings["skippedBehavior"])}><option value="skipped_tab">Keep in skipped tab · เก็บในพักไว้</option><option value="end_of_priority">Move to end of same priority · ย้ายไปท้ายกลุ่ม</option></select></label>
   </div>
   <div className="settings-group"><h3>ผู้ถามและการรับคิว</h3>
    <label>Duplicate Question Handling<select value={settings.duplicateQuestionMode} onChange={e=>set("duplicateQuestionMode",e.target.value as QueueSettings["duplicateQuestionMode"])}><option value="allow">Allow · เพิ่มซ้ำได้</option><option value="warn">Warn · แจ้งเตือนก่อนเพิ่ม</option><option value="block">Block · ไม่รับคิวซ้ำ</option></select><small className="field-help">ตรวจจาก TikTok Username ที่มีคิวรออยู่แล้ว</small></label>
    <Toggle label="Upgrade existing queue on Express" help="เมื่อคนเดิมส่งคิวลัด ให้เลือกอัปเกรดคิวเดิมหรือสร้างคิวใหม่" checked={settings.upgradeExistingQueueOnExpress} onChange={v=>set("upgradeExistingQueueOnExpress",v)}/>
    <label>Maximum Active Queues<select value={settings.maxActiveQueues===null?"none":[10,20,30,50].includes(settings.maxActiveQueues)?String(settings.maxActiveQueues):"custom"} onChange={e=>set("maxActiveQueues",e.target.value==="none"?null:e.target.value==="custom"?15:Number(e.target.value))}><option value="none">No Limit · ไม่จำกัด</option>{[10,20,30,50].map(n=><option key={n} value={n}>{n} คิว</option>)}<option value="custom">Custom · กำหนดเอง</option></select><small className="field-help">รวมคิวรอและกำลังตอบ · คิวใหม่ที่เกินจำนวนจะรออนุมัติ</small></label>
    {settings.maxActiveQueues!==null && ![10,20,30,50].includes(settings.maxActiveQueues) && <NumberField label="จำนวนคิวสูงสุด" value={settings.maxActiveQueues} onChange={v=>set("maxActiveQueues",v)}/>}
   </div>
   <div className="settings-group"><h3>คำถามและประวัติ</h3>
    <label>Maximum Question Length<select value={settings.maxQuestionLength??"none"} onChange={e=>set("maxQuestionLength",e.target.value==="none"?null:Number(e.target.value))}>{[100,150,200,300].map(n=><option key={n} value={n}>{n} ตัวอักษร</option>)}<option value="none">No Limit · ไม่จำกัด</option></select><small className="field-help">ใช้กับการเพิ่มเองและ Mock Comment</small></label>
    <label>Pending Gift Expiration<select value={settings.pendingExpirationMinutes??"never"} onChange={e=>set("pendingExpirationMinutes",e.target.value==="never"?null:Number(e.target.value))}>{[5,10,15,30].map(n=><option key={n} value={n}>{n} นาที</option>)}<option value="never">Never · ไม่หมดอายุ</option></select><small className="field-help">บันทึกกติกาไว้สำหรับระบบจริง รอบนี้ยังไม่หมดอายุอัตโนมัติ</small></label>
    <Toggle label="Keep Answered History" help="แสดงแท็บตอบแล้ว โดยยังเก็บรายการไว้เมื่อซ่อน" checked={settings.keepAnsweredHistory} onChange={v=>set("keepAnsweredHistory",v)}/>
    <Toggle label="Confirm before deleting queue" help="ปิดเพื่อยกเลิกคิวทันที พร้อมปุ่ม Undo" checked={settings.confirmBeforeDelete} onChange={v=>set("confirmBeforeDelete",v)}/>
   </div>
   <div className="settings-group"><h3>หน้าจอขณะ LIVE</h3><p className="field-help">ปรับข้อมูลที่ต้องการเห็น โดยไม่เปลี่ยนรายละเอียดในคิว</p>
    <Toggle label="Show TikTok username" help="แสดงชื่อ @TikTok บนคิวและคำถามปัจจุบัน" checked={settings.showTikTokUsername} onChange={v=>set("showTikTokUsername",v)}/>
    <Toggle label="Show Gift Name" help="ปิดเพื่อแสดงเฉพาะ Icon ของขวัญ" checked={settings.showGiftName} onChange={v=>set("showGiftName",v)}/>
    <Toggle label="Compact Queue Cards" help="ลดความสูงรายการ เพื่อมองเห็นคิวได้มากขึ้น" checked={settings.compactMode} onChange={v=>set("compactMode",v)}/>
    <div className={`mini-card ${settings.compactMode?"mini-compact":""}`}><span>🍩</span><div><strong>Mint</strong>{settings.showTikTokUsername&&<small>@minttarot</small>}<p>เดือนนี้ความรักจะเป็นอย่างไร</p>{settings.showGiftName&&<small>Donut</small>}</div><span className="gold">รอคำตอบ</span></div>
   </div>
  </div>
 </section>;
}
