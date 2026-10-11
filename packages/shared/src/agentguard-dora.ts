import {z} from 'zod';

// Decision support only. Facts are supplied by an authenticated reviewer, not inferred
// from a token amount, source text, model output, or a blocked payment attempt.
export const DORA_RULES_VERSION='EU-2024-1772-art8-9_2025-301-art5.v1';
export const DORA_SOURCES=['https://eur-lex.europa.eu/eli/reg_del/2024/1772/oj/eng','https://eur-lex.europa.eu/eli/reg_del/2025/301/oj/eng'] as const;
const euCodes=['AT','BE','BG','HR','CY','CZ','DK','EE','FI','FR','DE','GR','HU','IE','IT','LV','LT','LU','MT','NL','PL','PT','RO','SK','SI','ES','SE'] as const;
const flag=z.boolean().nullable().optional(),number=z.number().finite().nonnegative().max(Number.MAX_SAFE_INTEGER).nullable().optional();
const percent=z.number().finite().min(0).max(100).nullable().optional();
export const doraImpactSchema=z.object({
 criticalServicesAffected:flag,successfulMaliciousUnauthorizedAccessMayCauseDataLoss:flag,
 clientPercent:percent,affectedClients:z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).nullable().optional(),financialCounterpartPercent:percent,
 transactionPercent:number,transactionValuePercent:number,relevantClientsAffected:flag,reputationalImpact:flag,
 durationHours:number,criticalServiceDowntimeHours:number,affectedMemberStates:z.array(z.enum(euCodes)).max(27).nullable().optional(),
 dataLossBusinessImpact:flag,economicImpactEur:number,
}).strict().superRefine((v,ctx)=>{
 if(v.criticalServicesAffected===false&&v.successfulMaliciousUnauthorizedAccessMayCauseDataLoss===true)ctx.addIssue({code:'custom',path:['criticalServicesAffected'],message:'Successful malicious unauthorised access is included in Article 6 criticality; review these conflicting answers.'});
});
export type DoraImpact=z.infer<typeof doraImpactSchema>;
type Truth=boolean|null;
const truth=(value:boolean|null|undefined):Truth=>value??null;
const exceeds=(value:number|null|undefined,limit:number):Truth=>value==null?null:value>limit;
function any(values:Truth[]):Truth{return values.includes(true)?true:values.includes(null)?null:false;}
export function classifyDoraImpact(input:DoraImpact){
 const v=doraImpactSchema.parse(input);
 const criteria=[
  {id:'clients_transactions',label:'Clients, financial counterparts and transactions',met:any([exceeds(v.clientPercent,10),exceeds(v.affectedClients,100000),exceeds(v.financialCounterpartPercent,30),exceeds(v.transactionPercent,10),exceeds(v.transactionValuePercent,10),truth(v.relevantClientsAffected)]),basis:'Article 9(1): any one threshold; this group counts once.'},
  {id:'reputation',label:'Reputational impact',met:truth(v.reputationalImpact),basis:'Articles 2 and 9(2): media coverage, repeated complaints, inability to meet regulatory requirements or material loss of clients/counterparts.'},
  {id:'duration',label:'Duration or critical-service downtime',met:any([exceeds(v.durationHours,24),exceeds(v.criticalServiceDowntimeHours,2)]),basis:'Article 9(3): over 24 hours duration or over 2 hours critical-service downtime; counts once.'},
  {id:'geography',label:'EU geographical spread',met:v.affectedMemberStates==null?null:new Set(v.affectedMemberStates).size>=2,basis:'Article 9(4): meaningful impact in at least two distinct EU Member States.'},
  {id:'data_loss',label:'Data loss affecting business or regulatory duties',met:truth(v.dataLossBusinessImpact),basis:'Article 9(5)(a): availability, authenticity, integrity or confidentiality impact adversely affecting business objectives or regulatory duties.'},
  {id:'economic',label:'Economic impact',met:exceeds(v.economicImpactEur,100000),basis:'Article 9(6): incurred or likely costs/losses above EUR 100,000, before recoveries.'},
 ];
 const critical=truth(v.criticalServicesAffected),special=truth(v.successfulMaliciousUnauthorizedAccessMayCauseDataLoss);
 const met=criteria.filter(c=>c.met===true).length,unknown=criteria.filter(c=>c.met===null).length;
 const sufficient=special===true||met>=2;
 const impossible=special===false&&met+unknown<2;
 const status=critical===true&&sufficient?'major_candidate':critical===false||impossible?'not_major_on_known_facts':'insufficient_information';
 return {rulesVersion:DORA_RULES_VERSION,status,criteria,metCriteriaCount:met,criticalServicesAffected:critical,
  unauthorizedAccessCriterion:special,requiresHumanReview:true as const,sources:DORA_SOURCES,
  limitations:['A candidate classification is not a formal regulatory determination or a filed notification.',
   'Unknown inputs remain unknown. A blocked attack or security score does not establish a major ICT incident.',
   'Critical services include the Article 6 categories; the reviewer must assess actual impact and applicability.',
   'Recurring incidents with the same apparent cause require the separate Article 8(2) six-month aggregation and monthly review, subject to its exemptions. This single-incident assessment does not perform that review.']};
}
const timestamp=z.iso.datetime({offset:true}).nullable().optional();
export const doraTimelineSchema=z.object({detectedAt:timestamp,classifiedAt:timestamp,initialSubmittedAt:timestamp,latestIntermediateSubmittedAt:timestamp}).strict().superRefine((v,ctx)=>{
 const order=[['detectedAt','classifiedAt'],['detectedAt','initialSubmittedAt'],['classifiedAt','initialSubmittedAt'],['initialSubmittedAt','latestIntermediateSubmittedAt']] as const;
 for(const [earlier,later] of order)if(v[earlier]&&v[later]&&Date.parse(v[later]!)<Date.parse(v[earlier]!))ctx.addIssue({code:'custom',path:[later],message:`${later} cannot precede ${earlier}.`});
});
export type DoraTimeline=z.infer<typeof doraTimelineSchema>;
function nextCalendarMonth(ms:number){const d=new Date(ms),day=d.getUTCDate();d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+1);const end=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();d.setUTCDate(Math.min(day,end));return d.toISOString();}
export function doraReportingDeadlines(input:DoraTimeline){
 const v=doraTimelineSchema.parse(input),hour=3600000;
 const detected=v.detectedAt?Date.parse(v.detectedAt):null,classified=v.classifiedAt?Date.parse(v.classifiedAt):null;
 const lateClassification=detected!==null&&classified!==null?classified>detected+24*hour:null;
 const initial=classified===null||detected===null?null:lateClassification?classified+4*hour:Math.min(classified+4*hour,detected+24*hour);
 return {initialDueAt:initial===null?null:new Date(initial).toISOString(),
  intermediateDueAt:v.initialSubmittedAt?new Date(Date.parse(v.initialSubmittedAt)+72*hour).toISOString():null,
  finalDueAt:v.latestIntermediateSubmittedAt?nextCalendarMonth(Date.parse(v.latestIntermediateSubmittedAt)):null,
  awarenessWindowEnd:detected===null?null:new Date(detected+24*hour).toISOString(),lateClassification,
  calendarPolicy:'Baseline UTC deadlines; no weekend or national-holiday extension applied.',
  limitations:['Use actual awareness, formal major-classification and submission times, not draft creation or source receipt times.',
   'Initial reporting is as early as possible; Article 5(2) allows four hours after a major classification made later than 24 hours after awareness.',
   'Intermediate reporting runs from initial submission; final reporting runs from the latest intermediate submission, using one calendar month.',
   'Article 5(4)-(6) calendar exceptions depend on entity type, national holidays and competent-authority decisions; a compliance reviewer must establish applicability.',
   'Recovery updates and inability-to-report notices have additional obligations. This draft does not submit or schedule notifications.']};
}
