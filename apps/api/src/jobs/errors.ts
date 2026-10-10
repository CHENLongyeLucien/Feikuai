import {decodeErrorResult,type Hex} from 'viem';
import {paymentGuardAbi,demoTokenAbi} from '@secure-finance/chain';
import {DomainError} from '../domain/errors.js';

/** Persist only controlled codes: RPC exception text may contain signed calldata. */
export function chainFailureCode(error:unknown):string {
 if(error instanceof DomainError)return error.code;
 let cause:any=error;
 for(let depth=0;cause&&depth<12;depth++,cause=cause.cause){
  const name=typeof cause.data?.errorName==='string'?cause.data.errorName:null;
  if(name&&/^[A-Za-z][A-Za-z0-9]{0,80}$/.test(name))return name.replace(/([a-z0-9])([A-Z])/g,'$1_$2').toUpperCase();
  const data=typeof cause.data==='string'?cause.data:typeof cause.data?.data==='string'?cause.data.data:null;
  if(data&&/^0x[0-9a-fA-F]{8,}$/.test(data))try{const decoded=decodeErrorResult({abi:[...paymentGuardAbi,...demoTokenAbi],data:data as Hex});return decoded.errorName.replace(/([a-z0-9])([A-Z])/g,'$1_$2').toUpperCase();}catch{/* non-contract RPC data */}
 }
 return 'CHAIN_PREPARATION_FAILED';
}
