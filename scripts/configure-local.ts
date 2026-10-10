import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import {parse} from 'dotenv';
import {mnemonicToAccount} from 'viem/accounts';
import {createPublicClient,http} from 'viem';
const current=existsSync('.env')?readFileSync('.env','utf8'):readFileSync('.env.example','utf8');const env=parse(current);
if((env.APP_ENV??'local')!=='local'||(env.CHAIN_ID??'31337')!=='31337')throw new Error('This setup is local-only. It refuses public network configurations.');
const rpc=env.RPC_URL??'http://127.0.0.1:8545';if(!['127.0.0.1','localhost'].includes(new URL(rpc).hostname))throw new Error('Local setup only supports loopback RPC');
const client=createPublicClient({transport:http(rpc)});if(await client.getChainId()!==31337)throw new Error('RPC must report local chain31337');
const account=mnemonicToAccount('test test test test test test test test test test test junk',{addressIndex:2});
const relayerKey=`0x${Buffer.from(account.getHdKey().privateKey!).toString('hex')}`;
let updated=current;
for(const [key,value] of Object.entries({SESSION_SECRET:env.SESSION_SECRET||randomBytes(32).toString('hex'),RELAYER_PRIVATE_KEY:env.RELAYER_PRIVATE_KEY||relayerKey})){const line=new RegExp(`^${key}=.*$`,'m');updated=line.test(updated)?updated.replace(line,`${key}=${value}`):`${updated}\n${key}=${value}\n`;}
writeFileSync('.env',updated,{mode:0o600});console.log('Private local .env configured. Only the public-test relayer account2 key was added; no approver key is stored. Never reuse this key on Fuji.');
