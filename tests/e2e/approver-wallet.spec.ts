import {test,expect,type Page} from '@playwright/test';
import {readFileSync} from 'node:fs';

// Approver wallet readiness against the isolated demo approver (5184), using a scripted EIP-1193 stub.
const approver=JSON.parse(readFileSync('var/experience-demo/deployment.json','utf8')).approver as string;
type Stub={account?:string;chainId?:string;rejectAccounts?:boolean;switchable?:boolean};
async function open(page:Page,stub:Stub|null){
 if(stub)await page.addInitScript((s:Stub)=>{let chain=s.chainId??'0x7a69';const listeners:Record<string,Array<(v:unknown)=>void>>={};
  Object.defineProperty(window,'ethereum',{value:{on:(e:string,f:(v:unknown)=>void)=>{(listeners[e]??=[]).push(f);},removeListener:()=>{},request:async({method,params}:{method:string;params?:Array<{chainId:string}>})=>{
   if(method==='eth_requestAccounts'||method==='eth_accounts'){if(s.rejectAccounts)throw Object.assign(new Error('User rejected the request.'),{code:4001});return [s.account];}
   if(method==='eth_chainId')return chain;
   if(method==='wallet_switchEthereumChain'){if(!s.switchable)throw Object.assign(new Error('User rejected the request.'),{code:4001});chain=params![0]!.chainId;listeners.chainChanged?.forEach(f=>f(chain));return null;}
   throw new Error(`Unsupported ${method}`);}}});},stub);
 await page.goto('http://localhost:5184');
}
test('explains a missing wallet',async({page})=>{await open(page,null);await page.getByRole('button',{name:'Connect wallet',exact:true}).click();await expect(page.getByRole('alert')).toContainText('No wallet was found');});
test('explains a declined connection without implying a signature',async({page})=>{await open(page,{account:approver,rejectAccounts:true});await page.getByRole('button',{name:'Connect wallet',exact:true}).click();await expect(page.getByRole('alert')).toContainText('Nothing was signed or sent');});
test('flags a non-approver account',async({page})=>{await open(page,{account:'0x000000000000000000000000000000000000dead'});await page.getByRole('button',{name:'Connect wallet',exact:true}).click();await expect(page.getByText('This account cannot approve.',{exact:false})).toBeVisible();await expect(page.getByRole('heading',{name:'1 · Prepare your approval wallet'})).toBeVisible();});
test('offers a network switch and becomes ready',async({page})=>{await open(page,{account:approver,chainId:'0xa869',switchable:true});await page.getByRole('button',{name:'Connect wallet',exact:true}).click();await expect(page.getByText('Wrong network.',{exact:false})).toBeVisible();await page.getByRole('button',{name:'Switch to the local demo network',exact:true}).click();await expect(page.getByRole('heading',{name:'Approval wallet ready'})).toBeVisible();});
test('keeps a declined network switch recoverable',async({page})=>{await open(page,{account:approver,chainId:'0xa869'});await page.getByRole('button',{name:'Connect wallet',exact:true}).click();await page.getByRole('button',{name:'Switch to the local demo network',exact:true}).click();await expect(page.getByRole('alert')).toContainText('declined');await expect(page.getByRole('button',{name:'Switch to the local demo network',exact:true})).toBeEnabled();});
