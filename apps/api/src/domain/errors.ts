export class DomainError extends Error {constructor(public code:string,message:string,public statusCode=400){super(message);}}
export function fail(code:string,message:string,status=400):never{throw new DomainError(code,message,status);}
export function json(value:unknown):string{return JSON.stringify(value,(_,v)=>typeof v==='bigint'?v.toString():v);}
export function parsed<T=any>(value:string|null|undefined,fallback:T=null as T):T{return value?JSON.parse(value) as T:fallback;}
