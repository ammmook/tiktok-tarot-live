import type { TikTokPending } from "@/lib/api";
import { timeAgo } from "./QueueCard";

export default function TikTokPendingCard({ entry, now }: { entry: TikTokPending; now: number }) {
 const waitingForGift = entry.status === "waiting_for_gift";
 return <article className="queue-row tiktok-pending-row">
  <div className="queue-number">—</div>
  <div className="row-person"><span className="avatar tone-0">{entry.displayName.slice(0, 1)}{entry.profilePictureUrl && <img src={entry.profilePictureUrl} alt="" onError={event => { event.currentTarget.style.display = "none"; }}/>}</span><div><strong>{entry.displayName}</strong><small className="tiktok-nickname">{entry.tiktokNickname}</small><span className="username">{entry.tiktokUsername}</span></div></div>
  <div className="row-question"><p>{entry.question || "รอคอมเมนต์ ชื่อ/คำถาม จากผู้ส่งของขวัญ"}</p><span className="row-meta">{entry.giftName && <span className="gift-badge">{entry.giftImageUrl ? <img className="gift-image" src={entry.giftImageUrl} alt=""/> : entry.giftIcon}{entry.giftName} ×{entry.giftCount}</span>}<span className="time">{timeAgo(entry.createdAt, now)} · รออีก {Math.max(0, Math.ceil((entry.expiresAt - now) / 60_000))} นาที</span></span></div>
  <span className="status waiting">{waitingForGift ? "รอของขวัญ" : "รอคำถาม"}</span>
  <div className="row-actions"><span className="muted">จับคู่อัตโนมัติ</span></div>
 </article>;
}
