import {describe,expect,it} from 'vitest';
import {acceptsBridgeEvent,bridgeMessage} from './approval-bridge';

describe('independent approval window channel',()=>{
 const source={},nonce='d393cf74-dadf-4e46-aac0-ec47c9f4c70f';
 const expected={source,nonce,origin:'http://localhost:15174'};
 const event={source,origin:expected.origin,data:bridgeMessage('signature',nonce,{signature:'unverified'})};
 it('accepts only the bound window, exact origin, nonce and message kind',()=>{
  expect(acceptsBridgeEvent(event,expected,'signature')).toBe(true);
  expect(acceptsBridgeEvent(event,expected,'cancellation')).toBe(false);
  expect(acceptsBridgeEvent({...event,source:{}},expected,'signature')).toBe(false);
  expect(acceptsBridgeEvent({...event,origin:'http://localhost:15174.attacker.example'},expected,'signature')).toBe(false);
  expect(acceptsBridgeEvent({...event,origin:'http://localhost:15173'},expected,'signature')).toBe(false);
  expect(acceptsBridgeEvent({...event,data:bridgeMessage('signature','40d8219c-c197-41ce-81a2-31eab207dcef')},expected,'signature')).toBe(false);
 });
 it('rejects ambient, malformed and protocol-confused messages',()=>{
  for(const data of [null,[],{},'signature',{...event.data,type:'other'},{...event.data,unexpected:true}])expect(acceptsBridgeEvent({...event,data},expected,'signature')).toBe(false);
  expect(acceptsBridgeEvent({...event,source:null},{...expected,source:null},'signature')).toBe(false);
  expect(acceptsBridgeEvent({...event,data:bridgeMessage('signature','')},{...expected,nonce:''},'signature')).toBe(false);
 });
 it('does not mistake a bound payload for verified payment authority',()=>{
  const raw={forged:true};const accepted={...event,data:bridgeMessage('signature',nonce,raw)};
  expect(acceptsBridgeEvent(accepted,expected,'signature')).toBe(true);
  // Channel validation deliberately leaves the packet untrusted for the API/schema/signature verifier.
  expect(accepted.data.payload).toBe(raw);
  expect(acceptsBridgeEvent(accepted,expected,'received')).toBe(false);
 });
});
