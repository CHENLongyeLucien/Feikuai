import {describe,expect,it} from 'vitest';
import {classifyDoraImpact,doraImpactSchema,doraReportingDeadlines,type DoraImpact} from '../../packages/shared/src/agentguard-dora';
const noImpact:DoraImpact={criticalServicesAffected:true,successfulMaliciousUnauthorizedAccessMayCauseDataLoss:false,clientPercent:0,affectedClients:0,financialCounterpartPercent:0,transactionPercent:0,transactionValuePercent:0,relevantClientsAffected:false,reputationalImpact:false,durationHours:0,criticalServiceDowntimeHours:0,affectedMemberStates:[],dataLossBusinessImpact:false,economicImpactEur:0};
describe('DORA decision support with unknown impact facts',()=>{
 it('never promotes a blocked attack or empty observations to a regulatory incident',()=>{expect(classifyDoraImpact({})).toMatchObject({status:'insufficient_information',metCriteriaCount:0,criticalServicesAffected:null,requiresHumanReview:true});});
 it('requires critical-service impact and two separate ordinary criteria',()=>{
  expect(classifyDoraImpact({...noImpact,clientPercent:11,economicImpactEur:100001}).status).toBe('major_candidate');
  expect(classifyDoraImpact({...noImpact,criticalServicesAffected:false,clientPercent:11,economicImpactEur:100001}).status).toBe('not_major_on_known_facts');
 });
 it('does not require actual data loss for the special successful-access criterion',()=>{
  expect(classifyDoraImpact({...noImpact,successfulMaliciousUnauthorizedAccessMayCauseDataLoss:true})).toMatchObject({status:'major_candidate',metCriteriaCount:0});
  expect(doraImpactSchema.safeParse({criticalServicesAffected:false,successfulMaliciousUnauthorizedAccessMayCauseDataLoss:true}).success).toBe(false);
 });
 it('counts clients, counterparties and transactions as one group',()=>{
  expect(classifyDoraImpact({...noImpact,clientPercent:11,affectedClients:100001,financialCounterpartPercent:31,transactionPercent:11,transactionValuePercent:11})).toMatchObject({status:'not_major_on_known_facts',metCriteriaCount:1});
 });
 it('counts duration and downtime only once',()=>{expect(classifyDoraImpact({...noImpact,durationHours:25,criticalServiceDowntimeHours:3})).toMatchObject({metCriteriaCount:1,status:'not_major_on_known_facts'});});
 it('uses strict greater-than thresholds and at least two distinct member states',()=>{
  expect(classifyDoraImpact({...noImpact,clientPercent:10,affectedClients:100000,financialCounterpartPercent:30,transactionPercent:10,transactionValuePercent:10,durationHours:24,criticalServiceDowntimeHours:2,economicImpactEur:100000,affectedMemberStates:['FR','FR']})).toMatchObject({metCriteriaCount:0,status:'not_major_on_known_facts'});
  expect(classifyDoraImpact({...noImpact,affectedMemberStates:['FR','DE'],reputationalImpact:true})).toMatchObject({metCriteriaCount:2,status:'major_candidate'});
 });
 it('keeps uncertainty if remaining unknown criteria can change the outcome',()=>{
  expect(classifyDoraImpact({criticalServicesAffected:true,successfulMaliciousUnauthorizedAccessMayCauseDataLoss:false,economicImpactEur:100001}).status).toBe('insufficient_information');
  expect(classifyDoraImpact({...noImpact,economicImpactEur:100001,reputationalImpact:null}).status).toBe('insufficient_information');
 });
 it('does not count an integrity issue without adverse business/regulatory impact as the data criterion',()=>{
  const report=classifyDoraImpact({...noImpact,dataLossBusinessImpact:false});
  expect(report.criteria.find(c=>c.id==='data_loss')?.met).toBe(false);
 });
 it('rejects model extras, invalid percentages, invalid EU codes and negative/non-finite measurements',()=>{
  for(const input of [{approve:true},{clientPercent:101},{economicImpactEur:-1},{durationHours:Infinity},{affectedMemberStates:['US']},{affectedClients:1.2}])expect(doraImpactSchema.safeParse(input).success).toBe(false);
  expect(doraImpactSchema.safeParse({transactionPercent:150}).success).toBe(true);
 });
});
describe('baseline reporting deadlines from actual human-reported timestamps',()=>{
 it('does not substitute export time for missing classification/submission',()=>{expect(doraReportingDeadlines({})).toMatchObject({initialDueAt:null,intermediateDueAt:null,finalDueAt:null,awarenessWindowEnd:null});});
 it('uses four hours after classification, bounded by awareness plus 24 hours',()=>{
  expect(doraReportingDeadlines({detectedAt:'2026-10-11T00:00:00Z',classifiedAt:'2026-10-11T01:00:00Z'}).initialDueAt).toBe('2026-10-11T05:00:00.000Z');
  expect(doraReportingDeadlines({detectedAt:'2026-10-11T00:00:00Z',classifiedAt:'2026-10-11T23:00:00Z'}).initialDueAt).toBe('2026-10-12T00:00:00.000Z');
 });
 it('handles the Article 5(2) late-classification exception',()=>{expect(doraReportingDeadlines({detectedAt:'2026-10-11T00:00:00Z',classifiedAt:'2026-10-13T00:00:00Z'})).toMatchObject({initialDueAt:'2026-10-13T04:00:00.000Z',lateClassification:true});});
 it('starts intermediate deadline at initial submission and uses calendar month after latest intermediate',()=>{
  expect(doraReportingDeadlines({initialSubmittedAt:'2026-10-11T09:00:00+02:00',latestIntermediateSubmittedAt:'2026-10-31T09:00:00Z'})).toMatchObject({intermediateDueAt:'2026-10-14T07:00:00.000Z',finalDueAt:'2026-11-30T09:00:00.000Z'});
  expect(doraReportingDeadlines({latestIntermediateSubmittedAt:'2028-01-31T10:15:00Z'}).finalDueAt).toBe('2028-02-29T10:15:00.000Z');
 });
 it('does not silently apply calendar exceptions and rejects reversed times',()=>{
  expect(doraReportingDeadlines({}).calendarPolicy).toContain('no weekend');
  expect(()=>doraReportingDeadlines({detectedAt:'2026-10-12T00:00:00Z',classifiedAt:'2026-10-11T00:00:00Z'})).toThrow();
  expect(()=>doraReportingDeadlines({initialSubmittedAt:'2026-10-12T00:00:00Z',latestIntermediateSubmittedAt:'2026-10-11T00:00:00Z'})).toThrow();
 });
});
