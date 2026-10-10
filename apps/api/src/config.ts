import 'dotenv/config';
import { z } from 'zod';
import { existsSync, readFileSync } from 'node:fs';
import { deploymentSchema } from '@secure-finance/chain';
const boolean = z.enum(['true','false']).transform(x => x === 'true');
export const envSchema = z.object({
 NODE_ENV:z.enum(['development','test','production']).default('development'),APP_ENV:z.enum(['local','fuji']).default('local'),
 API_HOST:z.string().default('127.0.0.1'),API_PORT:z.coerce.number().int().min(1).max(65535).default(3001),
 WEB_ORIGIN:z.string().url().default('http://localhost:5173'),APPROVER_ORIGIN:z.string().url().default('http://localhost:5174'),
 DATABASE_PATH:z.string().default('./var/secure-finance.sqlite'),ARTIFACT_ROOT:z.string().default('./var/artifacts'),
 DEPLOYMENT_MANIFEST_PATH:z.string().default('./deployments/local.json'),TRUSTED_REGISTRY_PATH:z.string().default('./fixtures/trusted-registry.local.json'),
 RPC_URL:z.string().url().default('http://127.0.0.1:8545'),CHAIN_ID:z.enum(['31337','43113']).default('31337'),
 AGENT_MODE:z.enum(['live','fixture']).default('fixture'),OPENAI_API_KEY:z.string().default(''),OPENAI_MODEL:z.string().default(''),
 AGENT_MAX_MODEL_REQUESTS_PER_STAGE:z.coerce.number().int().min(1).max(4).default(4),AGENT_MAX_TOOL_CALLS_PER_STAGE:z.coerce.number().int().min(0).max(3).default(3),
 AGENT_STAGE_TIMEOUT_MS:z.coerce.number().int().min(100).max(60000).default(60000),SESSION_SECRET:z.string().default(''),
 RELAYER_PRIVATE_KEY:z.string().default(''),SEED_ON_START:boolean.default(false),ENABLE_DEMO_ROUTES:boolean.default(true),ENABLE_MAINNET:z.literal('false').default('false'),BUILD_ID:z.string().default('local-working-tree'),
 AUTOMATION_MANIFEST_PATH:z.string().default(''),AUTOMATION_EXECUTOR_PRIVATE_KEY:z.string().default(''),
 INBOX_WEBHOOK_SECRET:z.string().default(''),INBOX_WEBHOOK_TENANT_ID:z.string().default('northstar-demo')
}).superRefine((e,ctx)=>{if((e.APP_ENV==='local')!==(e.CHAIN_ID==='31337'))ctx.addIssue({code:'custom',message:'APP_ENV and CHAIN_ID disagree'});if(e.NODE_ENV==='production'&&!e.WEB_ORIGIN.startsWith('https://'))ctx.addIssue({code:'custom',message:'Production requires HTTPS'});if(e.APP_ENV==='fuji'&&e.ENABLE_DEMO_ROUTES)ctx.addIssue({code:'custom',message:'Disable convenience demo routes on Fuji'});});
export type Config=z.infer<typeof envSchema>;
export function loadConfig(overrides:Record<string,unknown>={}){return envSchema.parse({...process.env,...overrides});}
export function loadDeployment(c:Config){return existsSync(c.DEPLOYMENT_MANIFEST_PATH)?deploymentSchema.parse(JSON.parse(readFileSync(c.DEPLOYMENT_MANIFEST_PATH,'utf8'))):null;}
