// Detection benchmark: runs every corpus item through the real inbox pipeline
// (InboxService.create -> process, SQLite, artifact storage, linked invoice analysis)
// and measures precision, false-positive rate, recall and time to detect.
// Usage: pnpm benchmark:detection [--split dev|test|all] [--fast] [--examples N] [--live]
// Tune rules on the dev split only; run the test split to obtain the figures you present.
import {createHash} from 'node:crypto';
import {existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {performance} from 'node:perf_hooks';
import {buildApp} from '../../apps/api/src/app.js';
import {loadConfig} from '../../apps/api/src/config.js';
import {seed} from '../../apps/api/src/db/seed.js';
import {registerInbox} from '../../apps/api/src/inbox/index.js';
import {InboxWorker} from '../../apps/api/src/inbox/worker.js';
import {classify, financeDecision, securityReview} from '../../apps/api/src/inbox/pipeline.js';
import type {InboxService} from '../../apps/api/src/inbox/service.js';
import {mulberry32} from './fetch-corpus.js';
import {syntheticAp, type CorpusItem, type Payable} from './synthetic-bec.js';

const data = resolve('var/benchmark-data'), out = resolve('var/benchmark-results');
const tenantId = 'northstar-demo';
const user = {tenantId, membershipId: 'detection-benchmark', address: 'detection-benchmark', roles: ['operator', 'reviewer'], csrfToken: ''};

export async function openSystem() {
  const dir = mkdtempSync(join(tmpdir(), 'sf-detection-'));
  const manifest = join(dir, 'deployment.json');
  writeFileSync(manifest, readFileSync('deployments/local.json'));
  const config = loadConfig({NODE_ENV: 'test', APP_ENV: 'local', CHAIN_ID: '31337', DATABASE_PATH: join(dir, 'db.sqlite'), ARTIFACT_ROOT: join(dir, 'artifacts'), DEPLOYMENT_MANIFEST_PATH: manifest, TRUSTED_REGISTRY_PATH: join(dir, 'registry.json'), AGENT_MODE: 'fixture', OPENAI_API_KEY: '', OPENAI_MODEL: '', SEED_ON_START: 'false', ENABLE_DEMO_ROUTES: 'true', WEB_ORIGIN: 'http://localhost:5173'});
  const system = await buildApp({config, worker: false});
  const registry = seed(system.db, config) as {payables: Payable[]};
  const inbox: {service: InboxService} = (system as any).inbox ?? await registerInbox(system.app, system.service, system.db, config, {startWorker: false});
  return {system, registry, inbox, close: async () => {await system.app.close(); rmSync(dir, {recursive: true, force: true});}};
}

const readJsonl = (path: string) => readFileSync(path, 'utf8').trim().split('\n').map(line => JSON.parse(line));
export function loadCorpus(payables: Payable[]): CorpusItem[] {
  for (const file of ['enron-sample.jsonl', 'nazario.jsonl']) if (!existsSync(join(data, file))) throw new Error(`Missing ${file}. Run pnpm benchmark:fetch first.`);
  const enron: CorpusItem[] = readJsonl(join(data, 'enron-sample.jsonl')).map((r: any) => ({id: r.id, source: 'enron', category: 'business_email', channel: 'email', title: r.subject || undefined, sender: r.sender || undefined, text: r.text, malicious: false}));
  const nazario: CorpusItem[] = readJsonl(join(data, 'nazario.jsonl')).map((r: any) => ({id: r.id, source: 'nazario', category: 'real_phishing', channel: 'email', title: r.subject || undefined, sender: r.sender || undefined, text: r.text, malicious: true}));
  const all = [...enron, ...nazario, ...syntheticAp(payables)];
  const random = mulberry32(42);
  for (let i = all.length - 1; i > 0; i--) {const j = Math.floor(random() * (i + 1)); [all[i], all[j]] = [all[j]!, all[i]!];}
  return all;
}

type Outcome = 'security_hold' | 'human_review' | 'auto_cleared' | 'pending' | 'error';
export type Row = {id: string; source: string; category: string; channel: string; malicious: boolean; outcome: Outcome; risks: string[]; classification: string | null; linkedCase: boolean; decisionMs: number; analysisMs: number; error?: string; payableReference?: string; attackerRecipient?: string; claimedAmountAtomic?: string};
const outcomeOf = (status: string): Outcome => status === 'quarantined' ? 'security_hold' : status === 'needs_review' ? 'human_review' : status === 'approved' ? 'auto_cleared' : 'pending';

async function runItem(ctx: Awaited<ReturnType<typeof openSystem>>, item: CorpusItem): Promise<Row> {
  const base = {id: item.id, source: item.source, category: item.category, channel: item.channel, malicious: item.malicious, payableReference: item.payableReference, attackerRecipient: item.attackerRecipient, claimedAmountAtomic: item.claimedAmountAtomic};
  try {
    const started = performance.now();
    const created = await ctx.inbox.service.create(user, {channel: item.channel, title: item.title?.slice(0, 160), sender: item.sender?.slice(0, 254), text: item.text}, `benchmark:${item.id}`);
    let state = await ctx.inbox.service.process(created.id);
    const decisionMs = performance.now() - started;
    let analysisMs = 0;
    if (state === 'WAITING') {
      // In production the payment job worker runs this analysis; here it runs inline.
      const caseId = (ctx.system.db.prepare('SELECT linked_case_id FROM inbox_items WHERE id=?').get(created.id) as any).linked_case_id;
      const before = performance.now();
      await ctx.system.service.analyze(tenantId, caseId);
      state = await ctx.inbox.service.process(created.id);
      analysisMs = performance.now() - before;
    }
    const dto = ctx.inbox.service.project(user, created.id);
    return {...base, outcome: outcomeOf(dto.status), risks: dto.risks.map(r => r.code), classification: dto.classification?.category ?? null, linkedCase: !!dto.linkedCaseId, decisionMs, analysisMs};
  } catch (error) {
    return {...base, outcome: 'error', risks: [], classification: null, linkedCase: false, decisionMs: 0, analysisMs: 0, error: error instanceof Error ? error.message.slice(0, 200) : String(error)};
  }
}

// ---------- statistics ----------
const round = (x: number | null, digits = 4) => x === null || !Number.isFinite(x) ? null : Number(x.toFixed(digits));
function wilson(k: number, n: number) {
  if (!n) return null;
  const z = 1.96, p = k / n, d = 1 + z * z / n, c = (p + z * z / (2 * n)) / d, h = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d;
  return [round(Math.max(0, c - h)), round(Math.min(1, c + h))];
}
const percentile = (xs: number[], p: number) => {if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); return round(s[Math.min(s.length - 1, Math.ceil(p * s.length) - 1)]!, 3);};
const latency = (xs: number[]) => ({n: xs.length, medianMs: percentile(xs, .5), p95Ms: percentile(xs, .95), p99Ms: percentile(xs, .99), maxMs: xs.length ? round(Math.max(...xs), 3) : null});

export function metrics(rows: Row[]) {
  const evaluated = rows.filter(r => r.outcome !== 'error');
  const pos = evaluated.filter(r => r.malicious), neg = evaluated.filter(r => !r.malicious);
  const tp = pos.filter(r => r.outcome === 'security_hold').length, fn = pos.length - tp;
  const fp = neg.filter(r => r.outcome === 'security_hold').length, tn = neg.length - fp;
  const recall = pos.length ? tp / pos.length : null, fpr = neg.length ? fp / neg.length : null, precision = tp + fp ? tp / (tp + fp) : null;
  const atPrevalence = (pi: number) => recall === null || fpr === null || recall * pi + fpr * (1 - pi) === 0 ? null : round(recall * pi / (recall * pi + fpr * (1 - pi)));
  return {
    items: rows.length, errors: rows.length - evaluated.length, malicious: pos.length, benign: neg.length,
    confusion: {truePositive: tp, falsePositive: fp, trueNegative: tn, falseNegative: fn},
    securityAlert: {precision: round(precision), precisionCi95: wilson(tp, tp + fp), recall: round(recall), recallCi95: wilson(tp, pos.length), falsePositiveRate: round(fpr), falsePositiveRateCi95: wilson(fp, neg.length), f1: precision !== null && recall !== null && precision + recall ? round(2 * precision * recall / (precision + recall)) : null, precisionIfOnePercentMalicious: atPrevalence(.01), precisionIfOnePerThousandMalicious: atPrevalence(.001)},
    workflow: {
      maliciousAutoCleared: pos.filter(r => r.outcome === 'auto_cleared').length,
      maliciousSentToHuman: pos.filter(r => r.outcome === 'human_review').length,
      maliciousNotAutoClearedRate: round(pos.length ? pos.filter(r => r.outcome !== 'auto_cleared').length / pos.length : null),
      benignAutoClearedRate: round(neg.length ? neg.filter(r => r.outcome === 'auto_cleared').length / neg.length : null),
      benignHumanReviewRate: round(neg.length ? neg.filter(r => r.outcome === 'human_review').length / neg.length : null),
    },
    timeToDetect: latency(pos.filter(r => r.outcome === 'security_hold').map(r => r.decisionMs)),
    timeToDecisionAllItems: latency(evaluated.map(r => r.decisionMs + r.analysisMs)),
  };
}
const groupBy = (rows: Row[], key: (r: Row) => string) => Object.fromEntries([...new Set(rows.map(key))].sort().map(k => [k, rows.filter(r => key(r) === k)]));
const tally = (xs: string[]) => Object.fromEntries(Object.entries(xs.reduce((a, x) => ({...a, [x]: (a[x] ?? 0) + 1}), {} as Record<string, number>)).sort((a, b) => b[1] - a[1]));

// ---------- live worker latency (real 1 s polling worker, realistic arrivals and a burst) ----------
async function liveWorker(items: CorpusItem[], arrivals: number[]) {
  const ctx = await openSystem();
  const worker = new InboxWorker(ctx.inbox.service);
  worker.start();
  const submitted: {id: string; item: CorpusItem; at: number}[] = [];
  const startedAt = Date.now();
  for (let i = 0; i < items.length; i++) {
    const wait = startedAt + arrivals[i]! - Date.now();
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
    const at = Date.now(), item = items[i]!;
    const created = await ctx.inbox.service.create(user, {channel: item.channel, title: item.title?.slice(0, 160), sender: item.sender?.slice(0, 254), text: item.text}, `live:${item.id}`);
    submitted.push({id: created.id, item, at});
  }
  const deadline = Date.now() + 15 * 60 * 1000;
  const status = () => submitted.map(s => ctx.system.db.prepare('SELECT status,updated_at FROM inbox_items WHERE id=?').get(s.id) as {status: string; updated_at: string});
  while (status().some(s => s.status === 'processing') && Date.now() < deadline) await new Promise(r => setTimeout(r, 250));
  await worker.stop();
  const result = status().map((s, i) => ({malicious: submitted[i]!.item.malicious, status: s.status, ms: Date.parse(s.updated_at) - submitted[i]!.at}));
  await ctx.close();
  const detected = result.filter(r => r.malicious && r.status === 'quarantined').map(r => r.ms);
  return {items: items.length, stillProcessing: result.filter(r => r.status === 'processing').length, timeToDetect: latency(detected), timeToDecisionAllItems: latency(result.filter(r => r.status !== 'processing').map(r => r.ms))};
}

// ---------- dev/test split ----------
// Nazario is split by year: rules are tuned on 2015-2020 phishing and evaluated on 2021-2025.
// Enron and synthetic items are split 50/50 by a hash of their id.
export function splitOf(item: {id: string; source: string}): 'dev' | 'test' {
  if (item.source === 'nazario') return Number(/phishing-(\d{4})/.exec(item.id)?.[1]) <= 2020 ? 'dev' : 'test';
  return createHash('sha256').update(item.id).digest()[0]! % 2 === 0 ? 'dev' : 'test';
}

// Rule-only evaluation for fast iteration: same classify/securityReview/financeDecision code,
// without storage or linked invoice analysis (invoices therefore never auto-clear here).
function fastRow(item: CorpusItem): Row {
  const text = [item.title ? `Subject: ${item.title.slice(0, 160)}` : '', item.sender ? `From: ${item.sender.slice(0, 254)}` : '', item.text].filter(Boolean).join('\n');
  const started = performance.now();
  const classification = classify(text, item.channel), security = securityReview(text, classification);
  const finance = financeDecision(text, classification, null);
  const decisionMs = performance.now() - started;
  return {id: item.id, source: item.source, category: item.category, channel: item.channel, malicious: item.malicious, outcome: security.risks.length ? 'security_hold' : finance.clear ? 'auto_cleared' : 'human_review', risks: security.risks.map(r => r.code), classification: classification.category, linkedCase: false, decisionMs, analysisMs: 0};
}

const option = (name: string, fallback: string) => process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1]! : fallback;
const pct = (x: number | null) => x === null ? '   n/a' : `${(x * 100).toFixed(1).padStart(5)}%`;
function table(label: string, current: Row[], baseline: Row[] | null) {
  const line = (name: string, pick: (r: Row) => boolean) => {
    const now = metrics(current.filter(pick)), before = baseline ? metrics(baseline.filter(pick)) : null;
    const cell = (f: (m: ReturnType<typeof metrics>) => number | null) => `${pct(f(now))}${before ? ` (was ${pct(f(before)).trim()})` : ''}`;
    console.log(`  ${name.padEnd(22)} precision ${cell(m => m.securityAlert.precision)}  FPR ${cell(m => m.securityAlert.falsePositiveRate)}  recall ${cell(m => m.securityAlert.recall)}  attacks auto-cleared ${now.workflow.maliciousAutoCleared}${before ? ` (was ${before.workflow.maliciousAutoCleared})` : ''}`);
  };
  console.log(label);
  line('real data', r => r.source !== 'synthetic-ap');
  line('enron (benign)', r => r.source === 'enron');
  line('nazario (phishing)', r => r.source === 'nazario');
  line('synthetic AP', r => r.source === 'synthetic-ap');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const split = option('--split', 'dev') as 'dev' | 'test' | 'all', fast = process.argv.includes('--fast'), live = process.argv.includes('--live');
  if (!['dev', 'test', 'all'].includes(split)) throw new Error('--split must be dev, test or all');
  if (split !== 'dev' && process.argv.includes('--examples')) throw new Error('Examples are only shown for the dev split, so test items never influence the rules.');
  const runs = join(out, 'runs');
  mkdirSync(runs, {recursive: true});
  const ctx = await openSystem();
  const corpus = loadCorpus(ctx.registry.payables).filter(i => split === 'all' || splitOf(i) === split);
  const corpusDigest = createHash('sha256').update(corpus.map(i => `${i.id}\u0000${i.text}`).join('\u0001')).digest('hex');
  const rulesHash = createHash('sha256').update(readFileSync('apps/api/src/inbox/pipeline.ts')).digest('hex').slice(0, 12);
  console.log(`${split} split: ${corpus.length} items (${corpus.filter(i => i.malicious).length} malicious), ${fast ? 'fast rule-only' : 'full pipeline'} mode, rules ${rulesHash}`);
  const rows: Row[] = [];
  const t0 = performance.now();
  for (const item of corpus) {
    rows.push(fast ? fastRow(item) : await runItem(ctx, item));
    if (!fast && rows.length % 1000 === 0) console.log(`  ${rows.length}/${corpus.length} processed (${((performance.now() - t0) / 1000).toFixed(1)} s)`);
  }
  const wallSeconds = (performance.now() - t0) / 1000;
  await ctx.close();

  let liveResult: unknown = 'not run (add --live)';
  if (live) {
    // Steady load: 120 non-invoice items, Poisson arrivals averaging one every 2 s (1,800 per hour,
    // well above a typical accounts-payable mailbox). Burst: 100 items delivered at once.
    const random = mulberry32(99), pool = corpus.filter(i => i.channel !== 'invoice');
    const sample = (n: number) => Array.from({length: n}, () => pool[Math.floor(random() * pool.length)]!);
    let clock = 0;
    const steadyArrivals = Array.from({length: 120}, () => (clock += -Math.log(1 - random()) * 2000));
    console.log('Live worker: steady load (about 4 minutes)...');
    const steady = await liveWorker(sample(120), steadyArrivals);
    console.log('Live worker: burst of 100...');
    const burst = await liveWorker(sample(100), Array(100).fill(0));
    liveResult = {worker: 'apps/api/src/inbox/worker.ts (1 s polling interval, one item per tick)', steady: {arrivals: 'Poisson, mean 2 s', ...steady}, burst: {arrivals: '100 simultaneous', ...burst}};
  }

  const baselinePath = join(out, 'baseline', 'items.jsonl');
  const ids = new Set(rows.map(r => r.id));
  const baseline = existsSync(baselinePath) ? readJsonl(baselinePath).filter((r: Row) => ids.has(r.id)).map((r: Row) => fast && r.channel === 'invoice' && r.outcome === 'auto_cleared' ? {...r, outcome: 'human_review' as const} : r) : null;
  table(`\nSecurity alert = quarantined.${baseline ? ' Baseline = original rules on the same items.' : ''}`, rows, baseline);
  const reasons = (pick: (r: Row) => boolean) => tally(rows.filter(pick).flatMap(r => r.risks));
  console.log('\nFalse-positive reasons:', JSON.stringify(reasons(r => !r.malicious && r.outcome === 'security_hold')));
  console.log('True-positive reasons: ', JSON.stringify(reasons(r => r.malicious && r.outcome === 'security_hold')));

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const report = {
    schemaVersion: 'secure-finance.detection-benchmark.v3', generatedAt: new Date().toISOString(), split, mode: fast ? 'fast-rules-only' : 'full-pipeline', rulesSha256Prefix: rulesHash,
    corpus: {items: corpus.length, sha256: corpusDigest, splitRule: 'Nazario: 2015-2020 dev, 2021-2025 test. Enron and synthetic: 50/50 by sha256(id).'},
    method: {wallSeconds: round(wallSeconds, 1), environment: {node: process.version, platform: process.platform, arch: process.arch}},
    overall: metrics(rows), realDataOnly: metrics(rows.filter(r => r.source !== 'synthetic-ap')),
    bySource: Object.fromEntries(Object.entries(groupBy(rows, r => r.source)).map(([k, v]) => [k, metrics(v)])),
    byCategory: Object.fromEntries(Object.entries(groupBy(rows, r => `${r.source}:${r.category}`)).map(([k, v]) => [k, {items: v.length, malicious: v[0]!.malicious, securityHold: v.filter(r => r.outcome === 'security_hold').length, humanReview: v.filter(r => r.outcome === 'human_review').length, autoCleared: v.filter(r => r.outcome === 'auto_cleared').length, errors: v.filter(r => r.outcome === 'error').length}])),
    falsePositiveReasons: reasons(r => !r.malicious && r.outcome === 'security_hold'),
    truePositiveReasons: reasons(r => r.malicious && r.outcome === 'security_hold'),
    liveWorker: liveResult,
    errors: rows.filter(r => r.outcome === 'error').slice(0, 20).map(r => ({id: r.id, error: r.error})),
  };
  const base = join(runs, `${stamp}-${split}-${fast ? 'fast' : 'full'}-${rulesHash}`);
  writeFileSync(`${base}.json`, JSON.stringify(report, null, 2) + '\n');
  writeFileSync(`${base}.items.jsonl`, rows.map(r => JSON.stringify(r)).join('\n') + '\n');
  if (!fast) writeFileSync(join(out, 'items.jsonl'), rows.map(r => JSON.stringify(r)).join('\n') + '\n');
  if (process.argv.includes('--examples')) {
    const byId = new Map(corpus.map(i => [i.id, i]));
    const show = (title: string, list: Row[]) => {console.log(`\n${title} (${list.length}):`); for (const r of list.slice(0, Number(option('--examples', '10')) || 10)) {const i = byId.get(r.id)!; console.log(`  [${r.id}] ${r.risks.join(',') || r.outcome} | ${(i.title ?? '').slice(0, 60)} | ${i.text.replace(/\s+/g, ' ').slice(0, 180)}`);}};
    const random = mulberry32(5), shuffle = (xs: Row[]) => xs.map(x => [random(), x] as const).sort((a, b) => a[0] - b[0]).map(x => x[1]);
    show('False positives', shuffle(rows.filter(r => !r.malicious && r.outcome === 'security_hold')));
    show('Missed attacks auto-cleared', shuffle(rows.filter(r => r.malicious && r.outcome === 'auto_cleared')));
    show('Missed attacks sent to human review', shuffle(rows.filter(r => r.malicious && r.outcome === 'human_review')));
  }
  console.log(`\nSaved ${base}.json (${round(wallSeconds, 1)} s)`);
}
