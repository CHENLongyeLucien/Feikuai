export const APPROVAL_BRIDGE='secure-finance.approval-bridge.v1';
export type BridgeAction='ready'|'request'|'signature'|'cancellation'|'received';
export type BridgeEnvelope={type:typeof APPROVAL_BRIDGE;action:BridgeAction;nonce:string;payload?:unknown};
export function bridgeMessage(action:BridgeAction,nonce:string,payload?:unknown):BridgeEnvelope{return {type:APPROVAL_BRIDGE,action,nonce,...(payload===undefined?{}:{payload})}}
export function acceptsBridgeEvent(event:{origin:string;source:unknown;data:unknown},expected:{origin:string;source:unknown;nonce:string},action:BridgeAction):boolean{
 if(!expected.source||event.source!==expected.source||event.origin!==expected.origin||!event.data||typeof event.data!=='object')return false;
 const data=event.data as Record<string,unknown>;
 return data.type===APPROVAL_BRIDGE&&data.action===action&&data.nonce===expected.nonce&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(expected.nonce)&&Object.keys(data).every(key=>['type','action','nonce','payload'].includes(key));
}
