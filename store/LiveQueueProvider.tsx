"use client";
import { createContext, useContext, useEffect, useState, type Dispatch, type SetStateAction } from "react";
import type { GiftRule, QueueEntry, QueueSettings } from "@/types/queue";
import { defaultGiftRules, defaultQueueSettings } from "@/data/defaultRules";
import { queueService } from "@/services/queueService";

interface Store {
 rules: GiftRule[]; settings: QueueSettings; entries: QueueEntry[]; now: number; ready: boolean;
 setEntries: Dispatch<SetStateAction<QueueEntry[]>>;
 commitSettings: (rules: GiftRule[], settings: QueueSettings) => void;
 live: boolean; setLive: Dispatch<SetStateAction<boolean>>;
 liveStarted: number; setLiveStarted: Dispatch<SetStateAction<number>>;
}
const Context = createContext<Store | null>(null);
export function LiveQueueProvider({children}: {children:React.ReactNode}) {
 const [rules,setRules] = useState(defaultGiftRules);
 const [settings,setSettings] = useState(defaultQueueSettings);
 const [entries,setEntries] = useState<QueueEntry[]>([]);
 const [now,setNow] = useState(0);
 const [ready,setReady] = useState(false);
 const [live,setLive] = useState(false);
 const [liveStarted,setLiveStarted] = useState(0);
 useEffect(() => {
  const initialize = setTimeout(()=>{const time = Date.now();setEntries(queueService.load(time,defaultGiftRules()));setNow(time);setReady(true);},0);
  const interval = setInterval(()=>setNow(Date.now()),1000);
  return ()=>{clearTimeout(initialize);clearInterval(interval);};
 },[]);
 function commitSettings(nextRules: GiftRule[], nextSettings: QueueSettings) {
  const copy = nextRules.map(r=>({...r,isExpress:r.queueType === "express"}));
  setRules(copy); setSettings({...nextSettings});
  setEntries(previous=>queueService.syncRules(previous,copy,nextSettings));
 }
 return <Context.Provider value={{rules,settings,entries,setEntries,now,ready,commitSettings,live,setLive,liveStarted,setLiveStarted}}>{children}</Context.Provider>;
}
export function useLiveQueue() {
 const store = useContext(Context);
 if(!store) throw new Error("LiveQueueProvider is required");
 return store;
}
