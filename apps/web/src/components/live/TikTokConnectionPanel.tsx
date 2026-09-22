"use client";
import { useState } from "react";
import { connectTikTok, disconnectTikTok } from "@/lib/api";
import { useLiveQueue } from "@/store/LiveQueueProvider";

export default function TikTokConnectionPanel({ compact = false }: { compact?: boolean }) {
 const { connection, setConnection } = useLiveQueue();
 const [username, setUsername] = useState("");
 const [busy, setBusy] = useState(false);
 const [error, setError] = useState("");
 const status = connection?.tiktokStatus;
 const label = status === "CONNECTED" ? "เชื่อมต่อแล้ว" : status === "CONNECTING" ? "กำลังเชื่อมต่อ…" : status === "ENDED" ? "ไลฟ์จบแล้ว" : status === "AUTHENTICATION_ERROR" ? "เชื่อมต่อไม่สำเร็จ · ตรวจสอบการยืนยันตัวตน" : status === "BACKEND_UNREACHABLE" ? "บริการรับ TikTok ขาดการเชื่อมต่อ" : "ยังไม่เชื่อมต่อ";
 const act = async (disconnect = false) => {
  setBusy(true); setError("");
  try { setConnection(disconnect ? await disconnectTikTok() : await connectTikTok(username || connection?.username || "")); }
  catch (cause) { setError((cause as Error).message); }
  finally { setBusy(false); }
 };
 return <section className={`tiktok-connect-panel${compact ? " compact" : ""}`} aria-label="เชื่อมต่อ TikTok LIVE">
  {!compact && <div><h2>เชื่อมต่อ TikTok LIVE</h2><p>เริ่มไลฟ์ใน TikTok แล้วกรอกชื่อบัญชีเจ้าของไลฟ์</p></div>}
  <form onSubmit={event => { event.preventDefault(); void act(); }}>
   <label htmlFor="live-username">ชื่อบัญชี TikTok</label>
   <div className="tiktok-connect-controls"><input id="live-username" placeholder="@yourname" autoComplete="off" spellCheck={false} maxLength={25} value={username} onChange={event => setUsername(event.target.value)} disabled={busy}/>
   <button className="button primary" disabled={busy || !(username.trim() || connection?.username)}>{busy ? "กำลังดำเนินการ…" : "Connect"}</button>
   {connection?.username && <button type="button" className="button secondary" disabled={busy} onClick={() => void act(true)}>Disconnect</button>}</div>
  </form>
  <div className="tiktok-connection-detail" role="status"><span className={status === "CONNECTED" ? "green" : "muted"}>{label}{connection?.username ? ` · @${connection.username}` : ""}</span>{connection?.roomId && <small>ห้องไลฟ์ {connection.roomId}</small>}{connection?.detail && <small>{connection.detail}</small>}</div>
  {error && <p className="form-error" role="alert">{error}</p>}
  {!compact && <p className="tiktok-flow-hint">คอมเมนต์ <strong>ชื่อ/คำถาม</strong> → รอของขวัญ → พร้อมตอบ · ส่งของขวัญก่อนก็ได้ ระบบรอจับคู่กับคำถามจากบัญชีเดียวกัน</p>}
 </section>;
}
