import {createWalletClient,http} from 'viem';
import {foundry} from 'viem/chains';
import {mnemonicToAccount} from 'viem/accounts';

type DemoConfig={demoLoginAvailable?:boolean;chainId?:string;appEnv?:string;rpcUrl?:string};

/** Public Anvil test identity; enabled only by an explicit local demo action. */
export async function installDemoWallet(config:DemoConfig){
 const rpcUrl=config.rpcUrl||'http://127.0.0.1:18545';
 if(!config.demoLoginAvailable||config.appEnv!=='local'||config.chainId!=='31337'
  ||!['localhost','127.0.0.1','[::1]'].includes(location.hostname)
  ||!['localhost','127.0.0.1','[::1]'].includes(new URL(rpcUrl).hostname))throw new Error('The demonstration wallet is available only on the isolated local network.');
 const account=mnemonicToAccount('test test test test test test test test test test test junk',{addressIndex:1});
 const wallet=createWalletClient({account,chain:foundry,transport:http(rpcUrl)});
 const chainId=await wallet.request({method:'eth_chainId'});
 if(BigInt(chainId)!==31337n)throw new Error('The demo wallet refuses public networks.');
 const provider={async request({method,params=[]}:{method:string;params?:unknown[]}){
  if(method==='eth_requestAccounts'||method==='eth_accounts')return [account.address];
  if(method==='eth_chainId')return '0x7a69';
  if(method==='personal_sign')return account.signMessage({message:{raw:params[0] as `0x${string}`}});
  if(method==='eth_signTypedData_v4'){
   const typed=JSON.parse(String(params[1]));
   if(BigInt(typed.domain?.chainId||0)!==31337n)throw new Error('The demo wallet refuses public-network authorizations.');
   return account.signTypedData(typed);
  }
  if(method==='eth_sendTransaction'){
   const tx=params[0] as Record<string,string>;
   if(!tx?.to||tx.from?.toLowerCase()!==account.address.toLowerCase())throw new Error('Demo transaction account mismatch.');
   return wallet.sendTransaction({to:tx.to as `0x${string}`,data:(tx.data||'0x') as `0x${string}`,value:BigInt(tx.value||'0x0')});
  }
  if(method==='wallet_switchEthereumChain'){
   if(BigInt((params[0] as {chainId:string})?.chainId||0)!==31337n)throw new Error('The demo wallet cannot switch to a public network.');
   return null;
  }
  throw new Error(`This operation is not supported by the demo wallet: ${method}`);
 }};
 Object.defineProperty(window,'ethereum',{value:provider,writable:true,configurable:true});
 return account.address;
}
