/* Pure domain tests: compile the project's TypeScript in memory, with no new dependencies. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { fileURLToPath } from "node:url";
const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const cache = new Map();
function load(name) {
 const file = path.resolve(testDirectory,"..","src",name.replace(/^@\//,"")) + ".ts";
 if(cache.has(file)) return cache.get(file).exports;
 const compiledModule = {exports:{}}; cache.set(file,compiledModule);
 const code = ts.transpileModule(fs.readFileSync(file,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
 new Function("require","module","exports",code)(load,compiledModule,compiledModule.exports);
 return compiledModule.exports;
}
const {defaultGiftRules,defaultQueueSettings} = load("data/defaultRules");
const {queueService,addWithProtection,validateQueueInput,restoreQueueEntry} = load("services/queueService");
const {sortQueue,waitingQueue} = load("utils/queuePriority");
const {calculateRights,validateGiftRule} = load("utils/giftRules");
const input=(giftRuleId="donut",extra={})=>({displayName:"Test",tiktokUsername:"@test",giftRuleId,giftCount:1,question:"คำถามทดสอบ",...extra});
const make=(rule,entries=[],settings=defaultQueueSettings(),extra={},now=1000000)=>queueService.create(entries,input(rule.id,extra),now,[rule],settings);

test("rights: multiply, fixed, capped, minimum, unlimited and per-user remaining",()=>{
 const rule=defaultGiftRules()[3];
 assert.equal(calculateRights(rule,2),6);
 assert.equal(calculateRights({...rule,multiplicationMode:"fixed"},5),3);
 assert.equal(calculateRights({...rule,multiplicationMode:"capped",maxQuestions:5},3),5);
 assert.equal(calculateRights({...rule,minimumGiftCount:2},1),0);
 assert.equal(calculateRights({...rule,unlimitedQuestions:true},2),null);
 assert.equal(calculateRights({...rule,maximumQuestionsPerUser:5},3,3),2);
 assert.equal(calculateRights({...rule,active:false},3),0);
});
test("validation rejects invalid numbers and duplicate codes regardless of case",()=>{
 const rules=defaultGiftRules(),rule=rules[0];
 for(const update of [{priority:0},{priority:NaN},{questionLimit:21},{questionLimit:0},{minimumGiftCount:0},{giftCode:"DONUT"},{multiplicationMode:"capped",maxQuestions:null}]) assert.ok(validateGiftRule({...rule,...update},rules));
 assert.equal(validateGiftRule({...rule,unlimitedQuestions:true,questionLimit:0},rules),null);
});
test("express type outranks numeric priority; rule edits change sorting without reordering current",()=>{
 const rules=defaultGiftRules(),settings=defaultQueueSettings(),entries=queueService.load(1000000,rules);
 assert.deepEqual(waitingQueue(entries,rules,settings).map(e=>e.displayName),["May","Ploy","Jane","Bam","Fah","Pear","Belle"]);
 const changed=rules.map(r=>({...r,priority:r.id==="orange"?1:r.id==="glasses"?99:r.priority}));
 assert.deepEqual(waitingQueue(entries,changed,settings).slice(0,3).map(e=>e.displayName),["May","Ploy","Pear"]);
 assert.equal(entries.find(e=>e.status==="answering").displayName,"Mint");
});
test("FIFO, reverse order and express respect rules",()=>{
 const rules=defaultGiftRules(),settings=defaultQueueSettings();
 const a=make(rules[1],[],settings,{},100),b=make(rules[1],[],settings,{},200);
 assert.equal(sortQueue([b,a],rules,settings)[0].id,a.id);
 assert.equal(sortQueue([b,a],rules,{...settings,fifoSamePriority:false})[0].id,b.id);
 const x=make(rules[3],[],settings,{},100),y=make(rules[3],[],settings,{},200);
 assert.equal(sortQueue([y,x],rules,{...settings,fifoSamePriority:false})[0].id,x.id);
 const changed=rules.map(r=>({...r,respectExistingExpressQueue:false}));
 assert.equal(sortQueue([y,x],changed,{...settings,fifoSamePriority:false})[0].id,y.id);
});
test("append express behavior respects earlier express even with lower new priority",()=>{
 const settings=defaultQueueSettings();
 const first={...defaultGiftRules()[3],id:"old",priority:20};
 const second={...first,id:"new",priority:1,expressBehavior:"after_express_group"};
 const a=make(first,[],settings,{},100),b=make(second,[],settings,{},200);
 assert.equal(sortQueue([b,a],[first,second],settings)[0].id,a.id);
});
test("admission: missing question, manual approval, active limit and explicit approval",()=>{
 const rule=defaultGiftRules()[1],settings=defaultQueueSettings();
 assert.equal(make(rule,[],settings,{question:""}).status,"pending_question");
 assert.equal(make({...rule,requireQuestion:false},[],settings,{question:""}).status,"waiting");
 const manual=make({...rule,autoQueue:false});assert.equal(manual.status,"pending_approval");
 assert.equal(queueService.transition([manual],manual.id,"waiting",100,[rule],settings)[0].status,"waiting");
 const one=make(rule);const two=make(rule,[one],{...settings,maxActiveQueues:1},{tiktokUsername:"@another"});assert.equal(two.status,"pending_approval");
 assert.equal(queueService.transition([one,two],two.id,"waiting",100,[rule],{...settings,maxActiveQueues:1})[1].status,"pending_approval");
});
test("disabled gifts, minimum and comment length are enforced by service",()=>{
 const rule=defaultGiftRules()[1],settings=defaultQueueSettings();
 assert.throws(()=>make({...rule,active:false}));
 assert.throws(()=>make({...rule,minimumGiftCount:2}));
 assert.ok(validateQueueInput(input("donut",{question:"x".repeat(201)}),rule,settings));
 const pending=make(rule,[],settings,{question:""});
 assert.throws(()=>queueService.edit(pending,input("donut",{question:"x".repeat(201)}),[rule],settings,[pending]));
});
test("per-user maximum accounts for already allocated rights",()=>{
 const rule={...defaultGiftRules()[1],maximumQuestionsPerUser:5};
 const first=make(rule,[],defaultQueueSettings(),{giftCount:3});
 const second=make(rule,[first],defaultQueueSettings(),{giftCount:3});
 assert.equal(second.questionRights,2);
 assert.throws(()=>make(rule,[first,second]));
});
test("auto advance and skip-to-end preserve a single current answer",()=>{
 const rules=defaultGiftRules(),settings=defaultQueueSettings(),entries=queueService.load(1000000,rules);
 const result=queueService.transition(entries,"seed-0","answered",1000001,rules,{...settings,autoAdvance:true});
 assert.equal(result.filter(e=>e.status==="answering").length,1);
 assert.equal(result.find(e=>e.status==="answering").displayName,"May");
 const moved=queueService.transition(entries,"seed-1","skipped",1000002,rules,{...settings,skippedBehavior:"end_of_priority"});
 assert.deepEqual(waitingQueue(moved,rules,settings).filter(e=>e.giftRuleId==="donut").map(e=>e.displayName),["Fah","Bam"]);
});
test("express preemption is opt-in and deleted rules never delete historical queues",()=>{
 const rules=defaultGiftRules(),settings=defaultQueueSettings(),entries=queueService.load(1000000,rules);
 const express=make(rules[3]);
 assert.equal(addWithProtection(entries,express,settings,100).find(e=>e.status==="answering").displayName,"Mint");
 assert.equal(addWithProtection(entries,express,{...settings,protectCurrentQuestion:false},100).find(e=>e.status==="answering").id,express.id);
 const noDonut=rules.filter(r=>r.id!=="donut"),updated=queueService.syncRules(entries,noDonut);
 assert.equal(updated.length,entries.length);
 assert.equal(updated.find(e=>e.id==="seed-1").giftName,"Donut");
 assert.doesNotThrow(()=>queueService.edit(updated[1],input("donut"),noDonut,settings,updated));
});
test("undo after auto advance keeps the new current; undo never bypasses active limit",()=>{
 const rules=defaultGiftRules(),settings=defaultQueueSettings(),entries=queueService.load(1000000,rules);
 const snapshot=entries[0];
 const advanced=queueService.transition(entries,snapshot.id,"answered",1000001,rules,{...settings,autoAdvance:true});
 const restored=restoreQueueEntry(advanced,snapshot,rules,settings,1000002);
 assert.equal(restored.filter(e=>e.status==="answering").length,1);
 assert.equal(restored.find(e=>e.status==="answering").displayName,"May");
 assert.equal(restored.find(e=>e.id===snapshot.id).status,"waiting");
 const limited=restoreQueueEntry(advanced,snapshot,rules,{...settings,maxActiveQueues:1},1000002);
 assert.equal(limited.find(e=>e.id===snapshot.id).status,"pending_approval");
});
test("saving require-question changes reclassifies empty queues and preserves allocated rights on unrelated saves",()=>{
 const rules=defaultGiftRules(),settings=defaultQueueSettings(),entries=queueService.load(1000000,rules);
 const changed=rules.map(r=>({...r,requireQuestion:false}));
 const updated=queueService.syncRules(entries,changed,settings);
 assert.equal(updated.find(e=>e.id==="seed-8").status,"waiting");
 const reverted=queueService.syncRules(updated,rules,settings);
 assert.equal(reverted.find(e=>e.id==="seed-8").status,"pending_question");
 const cappedRule={...rules[1],maximumQuestionsPerUser:5};
 const first=make(cappedRule,[],settings,{giftCount:3}),second=make(cappedRule,[first],settings,{giftCount:3});
 assert.equal(queueService.syncRules([first,second],[cappedRule],settings)[1].questionRights,2);
});

