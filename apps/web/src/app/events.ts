export type EventGate={cursor:string;versions:Map<string,number>};
const sequence=/^(0|[1-9][0-9]{0,77})$/;
/** Events invalidate server queries only; they never grant local authority. */
export function acceptEvent(state:EventGate,input:unknown):boolean{
 if(!input||typeof input!=='object')return false;
 const e=input as Record<string,unknown>;
 if(typeof e.id!=='string'||!sequence.test(e.id)||typeof e.entityId!=='string'||!e.entityId||!Number.isSafeInteger(e.entityVersion)||Number(e.entityVersion)<0)return false;
 if(BigInt(e.id)<=BigInt(state.cursor))return false;
 state.cursor=e.id;
 if(Number(e.entityVersion)<=(state.versions.get(e.entityId)??-1))return false;
 state.versions.set(e.entityId,Number(e.entityVersion));return true;
}
