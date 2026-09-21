import type { GiftRule, QueueSettings } from "@/types/queue";

export function newGiftRule(): GiftRule {
 return { id: "", giftCode: "", displayName: "", icon: "🎁", priority: 30, queueType: "normal",
  questionLimit: 1, unlimitedQuestions: false, multiplicationMode: "multiply", maxQuestions: null,
  maximumQuestionsPerUser: null, minimumGiftCount: 1, isExpress: false, autoQueue: true,
  requireQuestion: true, active: true, colorTag: "default", displayOrder: 0,
  expressBehavior: "before_normal", respectExistingExpressQueue: true };
}
export function defaultGiftRules(): GiftRule[] {
 return [
  {id:"orange",giftCode:"orange-heart",displayName:"Orange Heart",icon:"🧡",priority:30},
  {id:"donut",giftCode:"donut",displayName:"Donut",icon:"🍩",priority:20},
  {id:"bear",giftCode:"bear-heart",displayName:"Bear Heart",icon:"🐻",priority:10},
  {id:"glasses",giftCode:"love-glasses",displayName:"Love Glasses",icon:"👓",priority:1},
 ].map((gift,i) => ({...newGiftRule(),...gift,displayOrder:i,questionLimit:i===3?3:1,
  queueType:i===3?"express":"normal",isExpress:i===3,colorTag:i===3?"gold":"default"}));
}
export function defaultQueueSettings(): QueueSettings {
 return {protectCurrentQuestion:true,fifoSamePriority:true,autoAdvance:false,skippedBehavior:"skipped_tab",
 duplicateQuestionMode:"warn",upgradeExistingQueueOnExpress:true,maxActiveQueues:null,maxQuestionLength:200,
 pendingExpirationMinutes:10,keepAnsweredHistory:true,confirmBeforeDelete:true,showTikTokUsername:true,
 showGiftName:true,compactMode:false};
}
