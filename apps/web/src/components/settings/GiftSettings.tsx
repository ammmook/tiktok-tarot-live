"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLiveQueue } from "@/store/LiveQueueProvider";
import type { GiftRule } from "@/types/queue";
import { defaultGiftRules, defaultQueueSettings, newGiftRule } from "@/data/defaultRules";
import { validateGiftRule } from "@/utils/giftRules";
import Icon from "@/components/ui/Icon";
import { Modal } from "@/components/live/QueueModal";
import GiftRuleModal from "./GiftRuleModal";
import GeneralQueueRules from "./GeneralQueueRules";
import RulePreviews from "./RulePreviews";

export default function GiftSettings() {
 const {rules,settings,commitSettings,ready} = useLiveQueue();
 const [draftRules,setDraftRules] = useState(()=>rules.map(r=>({...r})));
 const [draftSettings,setDraftSettings] = useState({...settings});
 const [editor,setEditor] = useState<{rule:GiftRule;isNew:boolean}|null>(null);
 const [deleting,setDeleting] = useState<GiftRule|null>(null);
 const [reset,setReset] = useState(false);
 const [leaving,setLeaving] = useState(false);
 const [notice,setNotice] = useState("");
 const router=useRouter();
 const dirty=JSON.stringify(draftRules)!==JSON.stringify(rules)||JSON.stringify(draftSettings)!==JSON.stringify(settings);
 useEffect(()=>{if(!dirty)return;const handler=(event:BeforeUnloadEvent)=>{event.preventDefault();};window.addEventListener("beforeunload",handler);return()=>window.removeEventListener("beforeunload",handler);},[dirty]);
 useEffect(()=>{if(!notice)return;const timeout=setTimeout(()=>setNotice(""),6000);return()=>clearTimeout(timeout);},[notice]);
 useEffect(()=>{if(!ready)return;const sync=window.setTimeout(()=>{setDraftRules(rules.map(r=>({...r})));setDraftSettings({...settings});},0);return()=>window.clearTimeout(sync);},[ready,rules,settings]);
 const active=draftRules.filter(r=>r.active);
 const ordered=[...draftRules].sort((a,b)=>a.displayOrder-b.displayOrder);
 function duplicate(rule:GiftRule){let suffix=1;let code=`${rule.giftCode}-copy`;while(draftRules.some(r=>r.giftCode===code)){suffix++;code=`${rule.giftCode}-copy-${suffix}`;}setDraftRules([...draftRules,{...rule,id:crypto.randomUUID(),giftCode:code,displayName:`${rule.displayName} Copy${suffix>1?` ${suffix}`:""}`,displayOrder:draftRules.length}]);}
 function move(rule:GiftRule,direction:number){const index=ordered.findIndex(r=>r.id===rule.id);const target=index+direction;if(target<0||target>=ordered.length)return;const next=[...ordered];[next[index],next[target]]=[next[target],next[index]];setDraftRules(next.map((r,i)=>({...r,displayOrder:i})));}
 function discard(){setDraftRules(rules.map(r=>({...r})));setDraftSettings({...settings});setNotice("ยกเลิกการแก้ไขแล้ว");}
 async function save(){for(const rule of draftRules){const error=validateGiftRule(rule,draftRules);if(error){setNotice(`${rule.displayName}: ${error}`);return;}}if(draftSettings.maxActiveQueues!==null&&(!Number.isInteger(draftSettings.maxActiveQueues)||draftSettings.maxActiveQueues<1)){setNotice("จำนวนคิวสูงสุดต้องเป็นจำนวนเต็มตั้งแต่ 1");return;}try{await commitSettings(draftRules,draftSettings);setNotice("บันทึกการตั้งค่าแล้ว · มีผลกับหน้า LIVE");}catch(error){setNotice((error as Error).message);}}
 const navigate=(event:React.MouseEvent<HTMLAnchorElement>)=>{if(dirty){event.preventDefault();setLeaving(true);}};
 return <div className="app-shell"><header className="topbar"><Link href="/live" onClick={navigate} className="brand"><span className="brand-mark"><Icon name="moon" size={23}/><span>✦</span></span><span>tarot<span className="brand-live">LIVE</span><small>QUEUE</small></span></Link><nav className="settings-nav"><span className="mock-badge"><span/>Live Backend</span><Link href="/live" onClick={navigate} className="button secondary">← กลับหน้า LIVE</Link></nav></header>
 <main className="settings-main"><section className="page-intro"><div><div className="eyebrow">YOUR LIVE, YOUR LITTLE RULES <span>✧</span></div><h1>Gift & Queue Rules</h1><p>ตั้งค่าของขวัญ สิทธิ์ จำนวนคำถาม และลำดับคิวสำหรับ LIVE</p></div><span className="settings-local"><span className="dot purple-dot"/>บันทึกบน backend</span></section>
 <section className="stats settings-stats" aria-label="สรุปกติกาของขวัญ">{[["Active Gifts",active.length,"gift","purple"],["Express Gifts",active.filter(r=>r.queueType==="express").length,"bolt","gold"],["Normal Gifts",active.filter(r=>r.queueType==="normal").length,"clock","green"],["Disabled Gifts",draftRules.length-active.length,"close","muted"]].map(([label,count,icon,tone])=><div className="stat" key={label}><span className={`stat-icon ${tone}`}><Icon name={String(icon)}/></span><span className="stat-label">{label}</span><strong>{String(count).padStart(2,"0")}</strong></div>)}</section>
 <section className="settings-section"><div className="section-heading"><div><h2>กติกาของขวัญ</h2><p>เลข Priority ยิ่งน้อย คิวยิ่งขึ้นก่อน</p></div><div className="settings-actions"><button className="button secondary" onClick={()=>setReset(true)}>Reset Rules</button><button className="button primary" onClick={()=>setEditor({rule:{...newGiftRule(),id:crypto.randomUUID(),displayOrder:draftRules.length},isNew:true})}><Icon name="plus" size={17}/>เพิ่มของขวัญ</button></div></div>
 <div className="gift-table-scroll"><table className="gift-rule-table"><thead><tr>{["ลำดับ","Gift","Priority","สิทธิ์คำถาม","ประเภทคิว","เมื่อส่งหลายชิ้น","สถานะ","Actions"].map(label=><th key={label}>{label}</th>)}</tr></thead><tbody>{ordered.map((rule,index)=><tr key={rule.id} className={!rule.active?"disabled-rule":""}>
  <td data-label="ลำดับ"><div className="display-order"><span>{String(index+1).padStart(2,"0")}</span><div><button aria-label={`เลื่อน ${rule.displayName} ขึ้น`} disabled={index===0} onClick={()=>move(rule,-1)}>↑</button><button aria-label={`เลื่อน ${rule.displayName} ลง`} disabled={index===ordered.length-1} onClick={()=>move(rule,1)}>↓</button></div></div></td>
  <td data-label="Gift"><div className={`rule-gift tag-${rule.colorTag}`}><span>{rule.icon}</span><div><strong>{rule.displayName}</strong><small>{rule.giftCode}</small></div></div></td>
  <td data-label="Priority"><span className="priority-number">{rule.priority}</span></td>
  <td data-label="สิทธิ์คำถาม">{rule.unlimitedQuestions?"ไม่จำกัดคำถาม":`${rule.questionLimit} คำถาม`}<small className="cell-help">ขั้นต่ำ {rule.minimumGiftCount} ชิ้น</small></td>
  <td data-label="ประเภทคิว"><span className={rule.queueType==="express"?"type-badge gold":"type-badge"}>{rule.queueType==="express"?"ϟ ลัดคิว":"คิวปกติ"}</span></td>
  <td data-label="เมื่อส่งหลายชิ้น">{rule.multiplicationMode==="multiply"?"ตามจำนวนที่ส่ง":rule.multiplicationMode==="fixed"?"สิทธิ์ครั้งเดียว":`สูงสุด ${rule.maxQuestions} คำถาม`}</td>
  <td data-label="สถานะ"><button className={`rule-active ${rule.active?"green":"muted"}`} aria-label={`${rule.active?"Disable":"Enable"} ${rule.displayName}`} aria-pressed={rule.active} onClick={()=>setDraftRules(draftRules.map(r=>r.id===rule.id?{...r,active:!r.active}:r))}><span className="dot"/>{rule.active?"Active":"Disabled"}</button></td>
  <td data-label="Actions"><div className="rule-actions"><button className="icon-button" aria-label={`Edit ${rule.displayName}`} onClick={()=>setEditor({rule,isNew:false})}><Icon name="edit" size={16}/><span className="mobile-edit-label">Edit</span></button><button className="icon-button" aria-label={`Duplicate ${rule.displayName}`} onClick={()=>duplicate(rule)}><Icon name="plus" size={16}/></button><button className="icon-button danger-text" aria-label={`Delete ${rule.displayName}`} onClick={()=>setDeleting(rule)}><Icon name="trash" size={16}/></button></div></td>
 </tr>)}</tbody></table></div>{!draftRules.length&&<div className="empty-state"><h3>ยังไม่มีกติกาของขวัญ</h3><p>เพิ่มของขวัญใหม่ หรือคืนค่าเริ่มต้น</p></div>}<p className="table-helper">↑ ↓ เปลี่ยนลำดับการแสดงผลเท่านั้น · ลำดับคิวจริงใช้ประเภทคิวและ Priority</p></section>
 <RulePreviews rules={draftRules} settings={draftSettings}/>
 <GeneralQueueRules settings={draftSettings} onChange={setDraftSettings}/>
 <div className={`settings-save-bar ${dirty?"is-dirty":""}`}><div><strong>{dirty?"มีการเปลี่ยนแปลงที่ยังไม่ได้บันทึก":"บันทึกการตั้งค่าปัจจุบันแล้ว"}</strong><small>{dirty?"Preview แสดงฉบับร่าง · กดบันทึกเพื่อใช้กับ LIVE":"ข้อมูลถูกบันทึกใน backend · ใช้ร่วมกันทุก client"}</small></div><div><button className="button secondary" disabled={!dirty} onClick={discard}>ยกเลิกการแก้ไข</button><button className="button primary" disabled={!dirty} onClick={save}><Icon name="check" size={17}/>บันทึกการตั้งค่า</button></div></div>
 <footer><span><Icon name="moon" size={14}/>A little order. A little magic.</span><span>Neon PostgreSQL · realtime rules</span></footer>
 </main>
 {editor&&<GiftRuleModal initial={editor.rule} rules={draftRules} isNew={editor.isNew} onClose={()=>setEditor(null)} onSave={rule=>{setDraftRules(editor.isNew?[...draftRules,rule]:draftRules.map(r=>r.id===rule.id?rule:r));setEditor(null);}}/>}
 {deleting&&<Modal title="ลบ Gift Rule นี้?" onClose={()=>setDeleting(null)}><div className="delete-preview"><strong>{deleting.icon} {deleting.displayName}</strong></div><p>การลบ Rule จะไม่ลบ Queue เก่าที่เคยใช้ Gift นี้</p><div className="modal-actions"><button className="button secondary" onClick={()=>setDeleting(null)}>ยกเลิก</button><button className="button danger-button" onClick={()=>{setDraftRules(draftRules.filter(r=>r.id!==deleting.id).map((r,i)=>({...r,displayOrder:i})));setDeleting(null);}}>ลบ Rule</button></div></Modal>}
 {reset&&<Modal title="คืนค่ากติกาเริ่มต้น?" onClose={()=>setReset(false)}><p className="modal-intro">คืน Gift Rules และ Queue Settings เป็นค่าเริ่มต้นทันที คิวที่มีอยู่จะยังคงอยู่</p><div className="modal-actions"><button className="button secondary" onClick={()=>setReset(false)}>ยกเลิก</button><button className="button primary" onClick={()=>{const gifts=defaultGiftRules();const queue=defaultQueueSettings();void commitSettings(gifts,queue).then(()=>setNotice("คืนค่ากติกาเริ่มต้นแล้ว")).catch(error=>setNotice((error as Error).message));setDraftRules(gifts);setDraftSettings(queue);setReset(false);}}>คืนค่าเริ่มต้น</button></div></Modal>}
 {leaving&&<Modal title="ออกโดยไม่บันทึกการตั้งค่า?" onClose={()=>setLeaving(false)}><p className="modal-intro">มีฉบับร่างที่ยังไม่ได้บันทึก หน้า LIVE จะใช้ค่าที่บันทึกไว้ล่าสุด</p><div className="modal-actions"><button className="button secondary" onClick={()=>setLeaving(false)}>แก้ไขต่อ</button><button className="button primary" onClick={()=>router.push("/live")}>ออกโดยไม่บันทึก</button></div></Modal>}
 {notice&&<div className="toast" role="status"><Icon name="star" size={17}/><span>{notice}</span><button className="icon-button" aria-label="ปิดการแจ้งเตือน" onClick={()=>setNotice("")}><Icon name="close" size={15}/></button></div>}
 </div>;
}
