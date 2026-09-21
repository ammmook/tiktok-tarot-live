"use client";
import { useEffect, useState } from "react";
import type { QueueEntry, QueueInput, QueueStatus } from "@/types/queue";
import { cancelQueue, completeQueue, createQuestion, createQueue, deleteQueue, restoreQueue, skipQueue, startQueue, updateQueue } from "@/lib/api";
import Icon from "@/components/ui/Icon";
import QueueCard, { Avatar, GiftBadge } from "./QueueCard";
import { Modal, QueueModal } from "./QueueModal";

import Link from "next/link";
import { useLiveQueue } from "@/store/LiveQueueProvider";
type ToastState = { message: string; undo?: QueueEntry; token: number };
export default function LiveDashboard() {
 const {entries,setEntries,now,rules,settings,runAction,live,setLive,liveStarted,setLiveStarted,listenerStatus} = useLiveQueue();
 const listenerLabel = listenerStatus?.tiktokStatus === "CONNECTED" ? "TikTok Connected" : listenerStatus?.tiktokStatus === "AUTHENTICATION_ERROR" ? "Authentication Error" : listenerStatus?.tiktokStatus === "BACKEND_UNREACHABLE" ? "Backend Unreachable" : listenerStatus?.status === "OFFLINE" ? "TikTok Offline" : "Listener Online";
 const [tab, setTab] = useState("queue");
 const [filter, setFilter] = useState("all");
 const [search, setSearch] = useState("");
 const [queueError,setQueueError] = useState("");
 const [editing, setEditing] = useState<QueueEntry | "new" | null>(null);
 const [deleting, setDeleting] = useState<QueueEntry | null>(null);
 const [toast, setToast] = useState<ToastState | null>(null);
 useEffect(() => { if(!toast) return; const timer = window.setTimeout(() => setToast(null),9000); return () => clearTimeout(timer); }, [toast]);
 const notify = (message: string, undo?: QueueEntry) => setToast({message, undo, token: now});
 const normalizeUsername = (value:string) => value.trim().replace(/^@+/g, "").toLowerCase();
 const waiting = entries.filter(e => e.status === "waiting");
 const current = entries.find(e => e.status === "answering");
 const next = waiting[0];
 const pending = entries.filter(e => e.status === "pending_question" || e.status === "pending_approval");
 const answered = entries.filter(e => e.status === "answered").sort((a,b) => (b.answeredAt || 0)-(a.answeredAt || 0));
 const skipped = entries.filter(e => e.status === "skipped");
 const express = waiting.filter(e => e.queueType === "express").length;
 const elapsed = (start: number) => { const seconds = Math.max(0,Math.floor((now-start)/1000)); return `${String(Math.floor(seconds/60)).padStart(2,"0")}:${String(seconds%60).padStart(2,"0")}`; };
 const [decision,setDecision] = useState<{input:QueueInput;existing:QueueEntry;kind:"duplicate"|"upgrade";count:number}|null>(null);
 const [demoGiftId,setDemoGiftId] = useState("");
 const [demoUsername,setDemoUsername] = useState("@newuser");
 const [demoCount,setDemoCount] = useState(1);
 const [demoComment,setDemoComment] = useState("เดือนหน้ามีโอกาสได้งานไหม");
 const applyEntry = (entry:QueueEntry) => setEntries(current => current.some(item=>item.id===entry.id) ? current.map(item=>item.id===entry.id?entry:item) : [entry,...current]);
 const change = async (entry: QueueEntry, status: QueueStatus) => {
  const actionLabel = status === "answering" ? "กำลังเริ่มตอบคำถาม" : status === "answered" ? "กำลังบันทึกว่าตอบแล้ว" : status === "skipped" ? "กำลังพักคิว" : status === "cancelled" ? "กำลังยกเลิกคิว" : "กำลังคืนคิว";
  try { const updated = await runAction(actionLabel, () => status === "answering" ? startQueue(entry.id) : status === "answered" ? completeQueue(entry.id) : status === "skipped" ? skipQueue(entry.id) : status === "cancelled" ? cancelQueue(entry.id) : restoreQueue(entry.id)); applyEntry(updated);
   if(status==="answered") notify(`ตอบคำถามของ ${entry.displayName} แล้ว`,entry);
   else if(status==="answering") notify(`เริ่มตอบ ${entry.displayName}`);
   else notify(updated.pendingReason || (status==="skipped"?`พักคิวของ ${entry.displayName} แล้ว`:`คืนคิวของ ${entry.displayName} แล้ว`));
  } catch(error){setQueueError((error as Error).message);notify((error as Error).message);}
 };
 const addInput = async (input:QueueInput, ignoreDuplicate=false, skipUpgrade=false) => {
  const matches=entries.filter(e=>e.status==="waiting" && normalizeUsername(e.tiktokUsername)===normalizeUsername(input.tiktokUsername));
  const gift=rules.find(g=>g.id===input.giftRuleId);
  if(!skipUpgrade && settings.upgradeExistingQueueOnExpress && gift?.queueType==="express" && matches.some(e=>e.queueType!=="express")){
   setDecision({input,existing:matches.find(e=>e.queueType!=="express")!,kind:"upgrade",count:matches.length});return;
  }
  if(matches.length && !ignoreDuplicate && settings.duplicateQuestionMode!=="allow"){
   if(settings.duplicateQuestionMode==="block"){setQueueError(`${input.tiktokUsername} มีคำถามที่รออยู่แล้ว · กติกาไม่อนุญาตให้เพิ่มซ้ำ`);notify(`${input.tiktokUsername} มีคำถามที่รออยู่แล้ว · กติกาไม่อนุญาตให้เพิ่มซ้ำ`);return;}
   setDecision({input,existing:matches[0],kind:"duplicate",count:matches.length});return;
  }
  try {const response=await runAction("กำลังเพิ่มคิว", () => createQueue({...input,idempotencyKey:crypto.randomUUID(),allowDuplicate:ignoreDuplicate}));applyEntry(response.data);notify(response.data.status.startsWith("pending")?`${response.data.displayName} · ${response.data.pendingReason}`:response.data.queueType==="express"?`⚡ มีคิวลัดใหม่ · ${response.data.displayName}`:`เพิ่ม ${response.data.displayName} เข้าคิวแล้ว`);setEditing(null);setDecision(null);}catch(error){setQueueError((error as Error).message);notify((error as Error).message);}
};
 const save = (input:QueueInput) => {
  setQueueError("");
  if(editing==="new"){void addInput(input);return;}
  if(editing){void runAction("กำลังบันทึกการแก้ไขคิว", () => updateQueue(editing.id,input)).then(response=>{applyEntry(response.data);notify(response.data.pendingReason || "บันทึกข้อมูลแล้ว");setEditing(null);}).catch(error=>{setQueueError((error as Error).message);notify((error as Error).message);});}
};
 const deleteEntry = (entry:QueueEntry) => {void runAction("กำลังลบคิว", () => deleteQueue(entry.id)).then(updated=>{applyEntry(updated);notify(`ลบคิวของ ${entry.displayName} แล้ว`,entry);setDeleting(null);}).catch(error=>{setQueueError((error as Error).message);notify((error as Error).message);});};
 const requestDelete = (entry:QueueEntry) => {if(settings.confirmBeforeDelete)setDeleting(entry);else deleteEntry(entry);};
 const simulateGift = () => {
  const rule=rules.find(g=>g.active && g.id===(demoGiftId || rules.find(r=>r.active)?.id));
  if(!rule){notify("เลือกของขวัญที่เปิดใช้งานก่อน");return;}
  void addInput({displayName:normalizeUsername(demoUsername)||"New",tiktokUsername:demoUsername,giftRuleId:rule.id,giftCount:demoCount,question:""});
 };
 const simulateQuestion = () => {
  if(!demoComment.trim()){notify("กรุณาใส่ Comment");return;}
  const displayName=normalizeUsername(demoUsername)||"New";
  void runAction("กำลังรับ Comment", () => createQuestion({displayName,tiktokUsername:demoUsername,question:demoComment.trim(),idempotencyKey:crypto.randomUUID()})).then(response=>{applyEntry(response.data);notify(response.data.pendingReason==="awaiting_gift" ? `บันทึกคำถามของ ${displayName} แล้ว · รอของขวัญ` : `รับ Comment ของ ${displayName} แล้ว`);}).catch(error=>{setQueueError((error as Error).message);notify((error as Error).message);});
};
 const source = tab === "pending" ? pending : tab === "answered" && settings.keepAnsweredHistory ? answered : filter === "skipped" ? skipped : waiting.filter(e => filter === "all" || (filter === "express" ? e.queueType === "express" : e.queueType !== "express"));
 const visible = source.filter(e => `${e.displayName} ${e.tiktokUsername} ${e.question}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
 return <div className={`app-shell ${settings.compactMode?"compact-queues":""} ${!settings.showTikTokUsername?"hide-usernames":""}`}>
  <header className="topbar"><Link href="/live" className="brand"><span className="brand-mark"><Icon name="moon" size={23}/><span>✦</span></span><span>tarot<span className="brand-live">LIVE</span><small>QUEUE</small></span></Link><div className="connections"><Link className="button settings-link" href="/settings/gifts"><Icon name="gift" size={15}/>กติกาของขวัญ</Link><span className="mock-badge"><span/>Live Backend</span><span className="connection"><b>♪</b> TikTok <span className="connection-status">{listenerLabel}</span></span><span className="connection"><Icon name="gift" size={15}/> Neon PostgreSQL <span className="connection-status">Realtime</span></span><button className={`button ${live ? "secondary" : "live-button"}`} onClick={() => {setLive(!live); if(!live) setLiveStarted(now); notify(live ? "หยุด Live session แล้ว" : "เริ่ม Live session แล้ว · ทดลองส่ง Gift และ Comment ด้านล่าง");}}><Icon name={live ? "close" : "play"} size={15}/>{live ? "Stop Live" : "Start Live"}</button></div></header>
  <main>
   <section className="page-intro"><div><div className="eyebrow">YOUR LITTLE COSMIC WORKSPACE <span>✧</span></div><h1>ทุกคำถาม มีจังหวะของมัน<span className="title-star">✦</span></h1><p>ดูแลทุกคิว แล้วปล่อยให้ไพ่เล่าเรื่องที่เหลือ</p></div><div className="session"><span className={live ? "dot green-dot" : "dot"}/>{live ? "LIVE SESSION" : "LIVE WORKSPACE"}<span className="session-time">{live ? elapsed(liveStarted) : "พร้อมเมื่อคุณพร้อม"}</span></div></section>
   <section className="stats" aria-label="สรุปคิว"><Stat icon="clock" label="รอคำตอบ" english="WAITING" count={waiting.length} tone="gold"/><Stat icon="message" label="กำลังตอบ" english="ANSWERING" count={current ? 1 : 0} tone="purple"/><Stat icon="check" label="ตอบแล้ว" english="ANSWERED" count={answered.length} tone="green"/><Stat icon="bolt" label="คิวลัด" english="EXPRESS" count={express} tone="gold"/></section>
   <section className="spotlight-grid"><article className="current-panel"><div className="panel-top"><span className="panel-label"><span className="dot purple-dot"/>กำลังตอบ <span className="english-label">IN THE SPOTLIGHT</span></span><span className="timer"><Icon name="clock" size={14}/>{current?.answerStartedAt ? elapsed(current.answerStartedAt) : "00:00"}</span></div>
   {current ? <><div className="current-person"><Avatar entry={current} large/><div><h2>{current.displayName}<span className="username">{current.tiktokUsername}</span></h2><GiftBadge entry={current}/><span className="rights-badge current-rights">{current.questionRights===null?"ไม่จำกัดคำถาม":`เหลือ ${current.questionRights} คำถาม`} · x{current.giftCount}</span></div><span className="current-number">#{String(current.number).padStart(2,"0")}</span></div><div className="question-block"><span className="quote-mark">“</span><p>{current.question || "Waiting for question"}</p></div><div className="current-actions"><button className="button complete-button" onClick={() => change(current,"answered")}><Icon name="check" size={21}/>ตอบแล้ว<span>เสร็จเรียบร้อย</span></button><div className="secondary-actions"><button onClick={() => change(current,"skipped")}><Icon name="skip" size={16}/>ข้ามไว้ก่อน</button><button onClick={() => {setQueueError("");setEditing(current);}}><Icon name="edit" size={16}/>แก้ไข</button><button className="delete-icon" onClick={() => requestDelete(current)} aria-label="ลบคิวปัจจุบัน"><Icon name="trash" size={17}/></button></div></div></> : <div className="current-empty"><Icon name="moon" size={38}/><h2>พร้อมรับฟังเรื่องราวถัดไป</h2><p>เลือกเริ่มตอบจากคิวถัดไปได้เลย</p>{next && <button className="button primary" onClick={() => next.question.trim()?change(next,"answering"):setEditing(next)}>เริ่มตอบ {next.displayName}<Icon name="arrow"/></button>}</div>}
   </article><aside className={`next-panel ${next?.queueType === "express" ? "next-express" : ""}`}><div className="panel-top"><span className="panel-label">คิวถัดไป <span className="english-label">UP NEXT</span></span><Icon name="arrow" size={18}/></div>{next ? <><div className="next-gift"><GiftBadge entry={next}/>{next.queueType === "express" && <span className="express-tag"><Icon name="bolt" size={12}/>EXPRESS</span>}</div><div className="next-person"><Avatar entry={next}/><div><h2>{next.displayName}</h2><span className="username">{next.tiktokUsername}</span></div><span className="next-number">#{String(next.number).padStart(2,"0")}</span></div><p className="next-question">“{next.question || "Waiting for question"}”</p><div className="next-bottom"><span className="next-note"><Icon name={next.queueType === "express" ? "bolt" : "clock"} size={14}/>{next.queueType === "express" ? "คิวลัด · ได้ตอบเป็นคนถัดไป" : "เรียงตาม Priority และเวลาที่เข้าคิว"}</span><button className="button next-button" onClick={() => next.question.trim()?change(next,"answering"):setEditing(next)}><Icon name="play" size={16}/>เริ่มตอบคนถัดไป<Icon name="arrow" size={17}/></button></div></> : <div className="empty-state"><Icon name="star" size={30}/><h3>คิวว่างแล้ว</h3><p>ทุกเรื่องราวได้รับการดูแลแล้ว</p></div>}</aside></section>
   <section className="queue-section"><div className="queue-heading"><div className="tabs" role="tablist" aria-label="รายการคิว">{[["queue","คิว",waiting.length],["pending","รอคำถาม / อนุมัติ",pending.length],...(settings.keepAnsweredHistory?[["answered","ตอบแล้ว",answered.length]]:[])].map(([id,label,count]) => <button role="tab" aria-selected={tab === id} key={id} className={tab === id ? "active" : ""} onClick={() => setTab(String(id))}>{label}<span>{count}</span></button>)}</div><button className="button primary add-button" onClick={() => {setQueueError("");setEditing("new");}}><Icon name="plus"/>เพิ่มคิว</button></div>
   <div className="queue-toolbar"><div className="filters" aria-label="ตัวกรองคิว">{tab === "queue" ? [["all","ทั้งหมด"],["normal","ปกติ"],["express","ϟ ลัดคิว"],["skipped",`พักไว้${skipped.length ? ` (${skipped.length})` : ""}`]].map(([id,label]) => <button key={id} className={filter === id ? "selected" : ""} aria-pressed={filter === id} onClick={() => setFilter(id)}>{label}</button>) : <span className="muted">{tab === "pending" ? "ได้รับของขวัญแล้ว รอเติมคำถาม" : "คำถามที่ตอบแล้วในเซสชันนี้"}</span>}</div><label className="search-box"><Icon name="search" size={17}/><input placeholder="ค้นหา ชื่อ / @TikTok / คำถาม" value={search} onChange={e => setSearch(e.target.value)} aria-label="ค้นหาคิว"/>{search && <button aria-label="ล้างการค้นหา" onClick={() => setSearch("")}><Icon name="close" size={14}/></button>}</label></div>
   <div className="queue-table"><div className="table-heading"><span>คิว</span><span>ผู้ถาม</span><span>{tab === "pending" ? "ของขวัญ / รายละเอียด" : "คำถาม / ของขวัญ"}</span><span>สถานะ</span><span/></div>{visible.map(entry => <QueueCard key={entry.id} entry={entry} now={now} onStart={() => change(entry,"answering")} onEdit={() => {setQueueError("");setEditing(entry);}} onSkip={() => change(entry,"skipped")} onDelete={() => requestDelete(entry)} onRestore={() => change(entry,"waiting")}/>)}{visible.length === 0 && <div className="empty-state"><Icon name="search" size={28}/><h3>{search ? "ไม่พบคิวที่ค้นหา" : "ยังไม่มีรายการในส่วนนี้"}</h3><p>{search ? "ลองค้นหาด้วยชื่อหรือคำถามอื่น" : "คิวใหม่จะแสดงที่นี่เมื่อมีรายการเข้ามา"}</p></div>}</div><div className="queue-foot"><span>แสดง {visible.length} รายการ</span><span><Icon name="bolt" size={12}/>คิวลัดมาก่อน · คิวปกติเรียงตามเวลา</span></div></section>
   <section className="mock-event-form"><div className="demo-fields"><label>ผู้ส่ง Gift / Comment<input value={demoUsername} onChange={e=>setDemoUsername(e.target.value)} aria-label="TikTok Username"/></label><label>ของขวัญ<select value={demoGiftId || rules.find(r=>r.active)?.id || ""} onChange={e=>{setDemoGiftId(e.target.value);setDemoCount(rules.find(r=>r.id===e.target.value)?.minimumGiftCount || 1);}} aria-label="Gift">{rules.filter(r=>r.active).map(r=><option key={r.id} value={r.id}>{r.icon} {r.displayName}</option>)}</select></label><label>จำนวนชิ้น<input type="number" min={1} step={1} value={demoCount} onChange={e=>setDemoCount(e.target.valueAsNumber)} aria-label="Gift Count"/></label><label>Comment<input value={demoComment} onChange={e=>setDemoComment(e.target.value)} aria-label="Comment"/></label></div></section><section className="demo-bar"><div className="demo-description"><span className="demo-icon"><Icon name="gift" size={20}/></span><div><strong>ลองให้ของขวัญเดินทางเข้ามา</strong><p>Gift หนึ่งครั้งใช้สิทธิ์ตามกติกา · ส่ง Comment ก่อน Gift ได้ ระบบจะรอจับคู่ให้</p></div><span className="demo-label">LIVE TOOLS</span></div><div className="demo-actions"><button className="button secondary" onClick={simulateGift}><Icon name="gift" size={16}/>Send Gift</button><button className="button secondary" onClick={simulateQuestion}><Icon name="message" size={16}/>Send Comment</button></div></section>
   <footer><span><Icon name="moon" size={14}/>A little order. A little magic.</span><span>Backend Queue <span>·</span> Neon PostgreSQL + realtime</span></footer>
  </main>
  {editing && !decision && <QueueModal entry={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} onSave={save} saveError={queueError}/>}
  {decision && <Modal title={decision.kind==="upgrade"?`พบ Queue เดิมของ ${decision.input.tiktokUsername}`:"มีคำถามที่รออยู่แล้ว"} onClose={()=>setDecision(null)}><p className="modal-intro">{decision.input.tiktokUsername} มีคำถามที่รออยู่แล้ว {decision.count} คำถาม</p><p className="muted">{decision.kind==="upgrade"?"อัปเกรดของขวัญบนคิวเดิม โดยคงหมายเลข เวลา และคำถามเดิมไว้":"ต้องการเพิ่มคำถามใหม่ต่อหรือไม่?"}</p><div className="modal-actions decision-actions"><button className="button secondary" onClick={()=>setDecision(null)}>ยกเลิก</button>{decision.kind==="upgrade"?<><button className="button secondary" onClick={()=>{const input=decision.input;setDecision(null);void addInput(input,false,true);}}>สร้าง Queue ใหม่</button><button className="button primary" onClick={()=>{void runAction("กำลังอัปเกรดคิว", () => updateQueue(decision.existing.id,{giftRuleId:decision.input.giftRuleId,giftCount:decision.input.giftCount,allowDuplicate:true})).then(response=>{applyEntry(response.data);notify("อัปเกรดคิวเดิมเป็นคิวลัดแล้ว");setDecision(null);setEditing(null);}).catch(error=>{setQueueError((error as Error).message);notify((error as Error).message);});}}>Upgrade Queue เดิม</button></>:<button className="button primary" onClick={()=>void addInput(decision.input,true,true)}>เพิ่มต่อ</button>}</div></Modal>}
  {deleting && <Modal title="ลบคำถามนี้ออกจากคิว?" onClose={() => setDeleting(null)}><div className="delete-preview"><strong>{deleting.displayName}</strong><p>{deleting.question || "ยังไม่มีคำถาม"}</p></div><p className="muted">คิวนี้จะเปลี่ยนเป็นสถานะยกเลิก</p><div className="modal-actions"><button className="button secondary" onClick={() => setDeleting(null)}>ยกเลิก</button><button className="button danger-button" onClick={() => deleteEntry(deleting)}>ลบคิว</button></div></Modal>}
  {toast && <div className="toast" role="status"><span className="green"><Icon name="check"/></span><span>{toast.message}</span>{toast.undo && <button className="undo" onClick={() => {const restored = toast.undo!; void runAction("กำลังคืนคิว", () => restoreQueue(restored.id)).then(applyEntry).catch(error=>notify((error as Error).message)); setToast(null);}}>UNDO</button>}<button className="icon-button" onClick={() => setToast(null)} aria-label="ปิดการแจ้งเตือน"><Icon name="close" size={16}/></button></div>}
 </div>;
}
function Stat({icon,label,english,count,tone}: {icon:string;label:string;english:string;count:number;tone:string}) {return <div className="stat"><span className={`stat-icon ${tone}`}><Icon name={icon} size={20}/></span><div><span className="stat-label">{label}<small>{english}</small></span></div><strong>{count.toString().padStart(2,"0")}</strong></div>;}




