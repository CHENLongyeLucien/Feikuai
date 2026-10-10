import 'dotenv/config';
import {readFile,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {createPublicClient,createWalletClient,http,keccak256,toHex,type Hex} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';
import {avalancheFuji} from 'viem/chains';
import {deploymentSchema,paymentGuardAbi,toViemPayment} from '../packages/chain/src/index.js';
import {preflight} from './chain-preflight.js';
try{
  const m=deploymentSchema.parse(JSON.parse(await readFile('deployments/fuji.json','utf8')));if(m.chainId!=='43113')throw new Error('Fuji manifest required');
  const rpc=process.env.FUJI_RPC_URL??m.rpcUrl;const check=await preflight(m,rpc);if(!check.passed)throw new Error('Fuji preflight failed');
  const report:Record<string,unknown>={environment:'fuji',checkedAt:new Date().toISOString(),readChecks:check,positiveTransfer:'NOT_RUN: requires real approver wallet and application workflow',negativeTransaction:'NOT_RUN: pass --broadcast-negative explicitly to send one bounded unsigned request from configured relayer'};
  if(process.argv.includes('--broadcast-negative')){
    if(!process.env.RELAYER_PRIVATE_KEY)throw new Error('RELAYER_PRIVATE_KEY required only for explicitly requested negative gas transaction');
    const account=privateKeyToAccount(process.env.RELAYER_PRIVATE_KEY as Hex);if(account.address.toLowerCase()!==m.roles.relayer||account.address.toLowerCase()===m.approver)throw new Error('Configured key is not pinned relayer');
    const client=createPublicClient({chain:avalancheFuji,transport:http(rpc)});if(await client.getChainId()!==43113)throw new Error('Chain changed');
    const wallet=createWalletClient({account,chain:avalancheFuji,transport:http(rpc)}),block=await client.getBlock(),supplier=m.registry[0]!;
    const payment={invoiceKey:keccak256(toHex('synthetic-fuji-unsigned-probe:'+randomUUID())),supplierKey:supplier.supplierKey,recipient:supplier.recipient,token:m.token,amountAtomic:'1',authorizationNonce:BigInt(keccak256(toHex(randomUUID()))).toString(),issuedAt:block.timestamp.toString(),deadline:(block.timestamp+120n).toString(),evidenceCommitment:keccak256(toHex('unsigned negative probe')),policyId:m.policyId};
    const fees=await client.estimateFeesPerGas();const maximum=BigInt(process.env.FUJI_MAX_NEGATIVE_FEE_PER_GAS_WEI??'100000000000');
    if((fees.maxFeePerGas??0n)>maximum)throw new Error('Fee exceeds explicit negative test bound');
    const hash=await wallet.writeContract({address:m.vault,abi:paymentGuardAbi,functionName:'executePayment',args:[toViemPayment(payment),'0x'],gas:150000n,...fees});const receipt=await client.waitForTransactionReceipt({hash});
    if(receipt.status!=='reverted')throw new Error('Unsigned test unexpectedly succeeded; investigate');report.negativeTransaction={kind:'ACTUAL_FUJI_REVERT',hash,status:receipt.status,gasUsed:receipt.gasUsed.toString(),feeWei:(receipt.gasUsed*receipt.effectiveGasPrice).toString(),invoiceKey:payment.invoiceKey};
  }
  await writeFile('docs/fuji-test-results.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}catch(e){console.error(`Fuji tests BLOCKED: ${e instanceof Error?e.message:String(e)}`);process.exitCode=1;}
