import {describe,it,expect} from 'vitest';
import {deriveSceneState} from '../../apps/web/src/scene/state';
import {acceptEvent,type EventGate} from '../../apps/web/src/app/events';
import {useUI} from '../../apps/web/src/app/store';
const initial={workflowStatus:'READY_FOR_REVIEW',authorizationStatus:'AWAITING_SIGNATURE',executionStatus:'NONE',settlementStatus:'UNSETTLED'};
describe('financial projection to the 3D scene',()=>{
 it.each([
  [{workflowStatus:'EXTRACTING'},'intake','Extracting invoice'],
  [{workflowStatus:'CHECKING',authorizationStatus:null},'finance','Checking trusted records'],
  [{},'approval','Awaiting human review'],
  [{workflowStatus:'HELD'},'exception','Business hold'],
  [{authorizationStatus:'VALID'},'vault','Signed · awaiting execution'],
  [{executionStatus:'SUBMITTED'},'vault','Execution pending'],
  [{executionStatus:'UNKNOWN'},'vault','Payment outcome unknown'],
  [{executionStatus:'INCONSISTENT'},'vault','Investigation required'],
  [{authorizationStatus:'CANCELLATION_PENDING'},'approval','Cancellation pending'],
  [{authorizationStatus:'CANCELLED'},'approval','Authorization cancelled'],
  [{authorizationStatus:'EXPIRED'},'approval','Authorization expired'],
 ])('places observed state %j truthfully',(patch,station,status)=>{
  // Extraction precedes any exported proposal.
  const input={...initial,...patch};if(input.workflowStatus==='EXTRACTING')input.authorizationStatus=null;
  expect(deriveSceneState(input)).toMatchObject({station,status,settled:false});
 });
 it('never regresses a confirmed settlement because a later replay reverted or cancellation lost',()=>{
  for(const executionStatus of ['REVERTED','UNKNOWN','INCONSISTENT'])expect(deriveSceneState({...initial,settlementStatus:'SETTLED',executionStatus,authorizationStatus:'CANCELLED'})).toMatchObject({station:'supplier',settled:true,status:'Verified settlement'});
 });
 it('pause, reduced motion, selection and camera commands cannot mutate financial input',()=>{
  const input=Object.freeze({...initial,authorizationStatus:'VALID'});const before=deriveSceneState(input);
  useUI.getState().setPaused(true);useUI.getState().setReduced(true);useUI.getState().cameraTo({kind:'focus',target:'vault'});useUI.getState().select({kind:'case',id:'test'});
  expect(deriveSceneState(input)).toEqual(before);expect(input.settlementStatus).toBe('UNSETTLED');
 });
});
describe('durable event invalidation gate',()=>{
 it('deduplicates event IDs and ignores stale entity versions after reconnect',()=>{
  const state:EventGate={cursor:'100',versions:new Map([['case-a',7]])};
  expect(acceptEvent(state,{id:'101',entityId:'case-a',entityVersion:8})).toBe(true);
  for(const item of [{id:'101',entityId:'case-a',entityVersion:8},{id:'99',entityId:'case-a',entityVersion:20},{id:'102',entityId:'case-a',entityVersion:7}])expect(acceptEvent(state,item)).toBe(false);
  expect(state.cursor).toBe('102');expect(state.versions.get('case-a')).toBe(8);
  expect(acceptEvent(state,{id:'103',entityId:'case-a',entityVersion:9})).toBe(true);
 });
 it('does not let malformed event data poison the durable cursor',()=>{
  const state:EventGate={cursor:'0',versions:new Map()};
  for(const id of ['garbage','-1','01','1'.repeat(79)])expect(acceptEvent(state,{id,entityId:'a',entityVersion:1})).toBe(false);
  expect(acceptEvent(state,{id:'1',entityId:'a',entityVersion:NaN})).toBe(false);expect(state.cursor).toBe('0');
  expect(acceptEvent(state,{id:'9007199254740993',entityId:'a',entityVersion:1})).toBe(true);
 });
});
