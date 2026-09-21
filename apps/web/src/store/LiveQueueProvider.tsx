"use client";

import { createContext, useContext, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { io } from "socket.io-client";
import type { GiftRule, QueueEntry, QueueSettings } from "@/types/queue";
import { defaultGiftRules, defaultQueueSettings } from "@/data/defaultRules";
import { API_URL, getHistory, getQueue, getSettings, updateSettings } from "@/lib/api";
import { playNewQueueSound, unlockNotificationAudio } from "@/lib/notificationSound";

type QueueEvent = { eventId: string; entry?: QueueEntry; relatedEntries?: QueueEntry[]; queueOrder?: string[] };
type SettingsEvent = { rules: GiftRule[]; settings: QueueSettings };

interface Store {
 rules: GiftRule[]; settings: QueueSettings; entries: QueueEntry[]; now: number; ready: boolean; error: string;
 setEntries: Dispatch<SetStateAction<QueueEntry[]>>;
 commitSettings: (rules: GiftRule[], settings: QueueSettings) => Promise<void>;
 runAction: <T>(label: string, action: () => Promise<T>) => Promise<T>;
 reload: () => Promise<void>;
 live: boolean; setLive: Dispatch<SetStateAction<boolean>>;
 liveStarted: number; setLiveStarted: Dispatch<SetStateAction<number>>;
}
const Context = createContext<Store | null>(null);

function mergeEntries(current: QueueEntry[], incoming: QueueEntry[], order?: string[]) {
 const byId = new Map(current.map(entry => [entry.id, entry]));
 for (const entry of incoming) byId.set(entry.id, entry);
 const values = [...byId.values()];
 if (!order?.length) return values;
 const ordered = order.flatMap(id => { const entry = byId.get(id); return entry ? [entry] : []; });
 const orderedIds = new Set(order);
 return [...ordered, ...values.filter(entry => !orderedIds.has(entry.id))];
}

export function LiveQueueProvider({children}: {children: React.ReactNode}) {
 const [rules,setRules] = useState(defaultGiftRules);
 const [settings,setSettings] = useState(defaultQueueSettings);
 const [entries,setEntries] = useState<QueueEntry[]>([]);
 const [now,setNow] = useState(0);
 const [ready,setReady] = useState(false);
 const [error,setError] = useState("");
 const [live,setLive] = useState(false);
 const [liveStarted,setLiveStarted] = useState(0);
 const [pendingActions,setPendingActions] = useState<{id:number;label:string}[]>([]);
 const actionId = useRef(0);
 const seenCreationEvents = useRef(new Set<string>());
 const seenCreationEntries = useRef(new Set<string>());
 const readyRef = useRef(false);

 const reload = async () => {
  const [snapshot,active,history] = await Promise.all([getSettings(),getQueue(),getHistory()]);
  setRules(snapshot.rules); setSettings(snapshot.settings); setEntries(mergeEntries([], [...active,...history])); setError(""); setReady(true); readyRef.current=true;
 };

 const runAction = async <T,>(label: string, action: () => Promise<T>) => {
  const id = ++actionId.current;
  setPendingActions(current => [...current, {id,label}]);
  try { return await action(); }
  finally { setPendingActions(current => current.filter(item => item.id !== id)); }
 };

 useEffect(() => {
  const interval = window.setInterval(() => setNow(Date.now()),1000);
  const unlock = () => unlockNotificationAudio();
  window.addEventListener("pointerdown",unlock,{once:true}); window.addEventListener("keydown",unlock,{once:true});
  const socket = io(process.env.NEXT_PUBLIC_SOCKET_URL ?? API_URL,{transports:["websocket","polling"],reconnection:true});
  const applyQueueEvent = (event:QueueEvent,playSound=false) => {
   const incoming=[event.entry,...(event.relatedEntries ?? [])].filter(Boolean) as QueueEntry[];
   if(incoming.length) setEntries(current => mergeEntries(current,incoming,event.queueOrder));
   if(playSound&&event.entry&&!seenCreationEvents.current.has(event.eventId)&&!seenCreationEntries.current.has(event.entry.id)){seenCreationEvents.current.add(event.eventId);seenCreationEntries.current.add(event.entry.id);playNewQueueSound();}
  };
  socket.on("queue:created",(event:QueueEvent)=>applyQueueEvent(event,true));
  socket.on("queue:updated",(event:QueueEvent)=>applyQueueEvent(event));
  socket.on("queue:started",(event:QueueEvent)=>applyQueueEvent(event));
  socket.on("queue:completed",(event:QueueEvent)=>applyQueueEvent(event));
  socket.on("queue:cancelled",(event:QueueEvent)=>applyQueueEvent(event));
  socket.on("queue:deleted",(event:QueueEvent)=>applyQueueEvent(event));
  socket.on("queue:reordered",(event:QueueEvent)=>applyQueueEvent(event));
  socket.on("settings:updated",(event:SettingsEvent)=>{setRules(event.rules);setSettings(event.settings);});
  socket.on("connect",()=>{if(readyRef.current) void reload().catch(loadError=>setError((loadError as Error).message));});
  const initialLoad = window.setTimeout(()=>{void reload().catch(loadError=>{setError((loadError as Error).message);setReady(true);readyRef.current=true;});},0);
  return ()=>{window.clearInterval(interval);window.clearTimeout(initialLoad);window.removeEventListener("pointerdown",unlock);window.removeEventListener("keydown",unlock);socket.removeAllListeners();socket.close();};
 },[]);

 const commitSettings = async (nextRules:GiftRule[],nextSettings:QueueSettings) => runAction("กำลังบันทึกการตั้งค่า", async () => {
  const snapshot=await updateSettings(nextRules.map(rule=>({...rule,isExpress:rule.queueType==="express"})),nextSettings);
  setRules(snapshot.rules); setSettings(snapshot.settings); await reload();
 });
 const activeAction = pendingActions[pendingActions.length - 1];
 return <Context.Provider value={{rules,settings,entries,setEntries,now,ready,error,commitSettings,runAction,reload,live,setLive,liveStarted,setLiveStarted}}>{children}{activeAction&&<div className="action-status" role="status" aria-live="polite"><span className="action-status-mark">✦</span><span>{activeAction.label}</span><span className="action-status-dots" aria-hidden="true"><i>.</i><i>.</i><i>.</i></span></div>}</Context.Provider>;
}
export function useLiveQueue(){const store=useContext(Context);if(!store)throw new Error("LiveQueueProvider is required");return store;}
