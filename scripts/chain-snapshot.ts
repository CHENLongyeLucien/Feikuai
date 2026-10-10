import 'dotenv/config';
import {gunzipSync} from 'node:zlib';
import {mkdirSync,writeFileSync,renameSync} from 'node:fs';
const rpc=process.env.RPC_URL??'http://127.0.0.1:8545';
if(!['localhost','127.0.0.1','[::1]'].includes(new URL(rpc).hostname))throw new Error('Snapshots are supported only on the isolated loopback Anvil chain.');
async function call(method:string){const response=await fetch(rpc,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params:[]})});const result=await response.json() as {result?:string;error?:{message:string}};if(!response.ok||result.error||!result.result)throw new Error(result.error?.message??'RPC failed');return result.result;}
if(BigInt(await call('eth_chainId'))!==31337n)throw new Error('Snapshot refuses any non-local chain.');
const compressed=Buffer.from((await call('anvil_dumpState')).slice(2),'hex');
const bytes=compressed[0]===0x1f&&compressed[1]===0x8b?gunzipSync(compressed,{maxOutputLength:64*1024*1024}):compressed;
const state=JSON.parse(bytes.toString('utf8'));if(!state.accounts||!state.blocks||!state.transactions)throw new Error('Snapshot lacks state or receipt history.');
mkdirSync('var',{recursive:true});writeFileSync('var/anvil-state.json.tmp',JSON.stringify(state),{mode:0o600});renameSync('var/anvil-state.json.tmp','var/anvil-state.json');
console.log(JSON.stringify({snapshot:'var/anvil-state.json',chainId:'31337',bestBlock:state.best_block_number,bytes:bytes.length,observedAt:new Date().toISOString()}));
