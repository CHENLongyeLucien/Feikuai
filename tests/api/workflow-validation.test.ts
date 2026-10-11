import {beforeAll,describe,expect,it} from 'vitest';
import {samples} from '../../scripts/workflow-validation/corpus.js';
import {runWorkflowValidation,type ValidationReport} from '../../scripts/workflow-validation/run.js';

let report:ValidationReport;
beforeAll(async()=>{report=await runWorkflowValidation();},120000);
describe('100 authored inputs through real intake and both durable workers',()=>{
 it.each(samples)('$id $channel: $name',sample=>{
  const result=report.results.find(row=>row.id===sample.id)!;
  expect(result,`Missing report for ${sample.id}`).toBeDefined();
  expect(result.httpStatus).toBe(201);
  expect(result.failures,result.failures.join('\n')).toEqual([]);
 });
 it('loses no accepted input and creates no payment authority or execution',()=>{
  expect(report.summary.total).toBe(100);expect(report.summary.accepted).toBe(100);
  expect(report.summary.byChannel).toEqual({invoice:25,email:25,voice:25,text:25});
  expect(report.summary.networkAttempts).toBe(0);expect(report.summary.paymentWriteAttempts).toBe(0);
  expect(report.summary.analysisRuns).toBeGreaterThan(0);expect(report.invariants).toEqual([]);
 });
});
