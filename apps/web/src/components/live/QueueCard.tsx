"use client";
import { useLiveQueue } from "@/store/LiveQueueProvider";
import type { QueueEntry } from "@/types/queue";
import Icon from "@/components/ui/Icon";
export function Avatar({entry, large = false}: {entry: QueueEntry; large?: boolean}) { return <span className={`avatar tone-${entry.number % 5} ${large ? "large" : ""}`}>{entry.displayName.slice(0,1).toUpperCase()}{entry.profilePictureUrl && <img src={entry.profilePictureUrl} alt="" onError={event => { event.currentTarget.style.display = "none"; }} />}<span className="avatar-spark">✧</span></span>; }
export function GiftBadge({entry}: {entry: QueueEntry}) { const {settings}=useLiveQueue(); return <span className={`gift-badge tag-${entry.ruleSnapshot.colorTag} ${entry.queueType === "express" ? "express-gift" : ""}`}><span title={entry.giftName}>{entry.giftImageUrl ? <img className="gift-image" src={entry.giftImageUrl} alt=""/> : entry.giftIcon}</span>{settings.showGiftName && entry.giftName}</span>; }
export function timeAgo(created: number, now: number) { const minutes = Math.max(0, Math.floor((now-created)/60000)); return minutes < 1 ? "เมื่อสักครู่" : `${minutes} นาทีที่แล้ว`; }
export default function QueueCard({entry, now, displayNumber = entry.number, onStart, onEdit, onSkip, onDelete, onRestore}: {entry: QueueEntry; now: number; displayNumber?: number; onStart: () => void; onEdit: () => void; onSkip: () => void; onDelete: () => void; onRestore: () => void}) {
 const express = entry.queueType === "express";
 const pending = !entry.question;
 const approval = entry.status === "pending_approval";
 const awaitingGift = entry.pendingReason === "awaiting_gift";
 const canApprove = approval && !awaitingGift && (!pending || !entry.ruleSnapshot.requireQuestion);
 return <article className={`queue-row ${express ? "express-row" : ""}`}>
   <div className="queue-number">{express ? <Icon name="bolt" size={15}/> : null}<span>#{String(displayNumber).padStart(2,"0")}</span></div>
   <div className="row-person"><Avatar entry={entry}/><div><strong>{entry.displayName}</strong><small className="tiktok-nickname">{entry.tiktokNickname}</small><span className="username">{entry.tiktokUsername}</span></div></div>
   <div className="row-question"><p>{entry.question || "Waiting for question · รอคำถาม"}</p>{approval && <small className="field-help">{awaitingGift ? "รอของขวัญเพื่อยืนยันสิทธิ์คำถาม" : entry.pendingReason}</small>}<span className="row-meta"><GiftBadge entry={entry}/><span className="rights-badge">{awaitingGift ? "ยังไม่มีสิทธิ์คำถาม" : entry.questionRights===null?"ไม่จำกัดคำถาม":`เหลือ ${entry.questionRights} คำถาม`} · x{entry.giftCount}</span><span className="time">· {awaitingGift ? "รอของขวัญ" : pending ? "ส่งของขวัญ" : "เข้าคิว"} {timeAgo(entry.createdAt, now)}</span></span></div>
   <span className={`status ${entry.status === "answered" ? "green" : entry.status === "skipped" ? "muted" : express ? "gold" : "waiting"}`}>{entry.status === "answered" ? "✓ ตอบแล้ว" : entry.status === "skipped" ? "พักไว้ก่อน" : awaitingGift ? "รอของขวัญ" : approval ? "รออนุมัติ" : express ? "ϟ ลัดคิว" : pending ? "รอคำถาม" : "• รอคำตอบ"}{entry.answeredAt && <small>{new Date(entry.answeredAt).toLocaleTimeString("th-TH", {hour:"2-digit",minute:"2-digit"})}</small>}</span>
   <div className="row-actions">{entry.status === "answered" || entry.status === "skipped" ? <button className="button row-button" onClick={onRestore}>คืนเข้าคิว</button> : awaitingGift ? <button className="button row-button" disabled><Icon name="gift" size={14}/>รอของขวัญ</button> : <button className={`button row-button ${express ? "express-button" : ""}`} onClick={canApprove ? onRestore : pending ? onEdit : onStart}><Icon name={pending ? "plus" : "play"} size={14}/>{canApprove ? "อนุมัติ" : pending ? "เพิ่มคำถาม" : "เริ่มตอบ"}</button>}
   <details className="more-menu"><summary aria-label={`ตัวเลือกคิว ${entry.displayName}`}><Icon name="more"/></summary><div className="menu-popover"><button onClick={e => {e.currentTarget.closest("details")?.removeAttribute("open"); onEdit();}}><Icon name="edit" size={15}/>แก้คำถาม</button>{entry.status !== "answered" && <button onClick={e => {e.currentTarget.closest("details")?.removeAttribute("open"); onSkip();}}><Icon name="skip" size={15}/>ข้ามไว้ก่อน</button>}<button className="danger-text" onClick={onDelete}><Icon name="trash" size={15}/>ลบคิว</button></div></details></div>
 </article>;
}


