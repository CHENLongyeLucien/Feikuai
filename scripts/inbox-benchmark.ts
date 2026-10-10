import {createHash} from 'node:crypto';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {performance} from 'node:perf_hooks';
import {classify, securityReview} from '../apps/api/src/inbox/pipeline';
import type {InboxChannel} from '../apps/api/src/inbox/types';

type Scenario = {id: string; channel: InboxChannel; title: string; text: string; malicious: boolean; category: string; conservativeAbstentionExpected?: boolean; rationale: string};
type Corpus = {schemaVersion: string; authorship: string; limitations: string[]; cases: Scenario[]};
const corpusPath = resolve('tests/fixtures/inbox-security-corpus.json');
const destination = resolve('docs/results/inbox-security-benchmark.json');
const corpusBytes = await readFile(corpusPath);
const corpus = JSON.parse(corpusBytes.toString('utf8')) as Corpus;
if (corpus.cases.length < 12 || new Set(corpus.cases.map(c => c.id)).size !== corpus.cases.length) throw new Error('The benchmark needs at least 12 distinct authored cases.');
if (!corpus.cases.every(c => c.text && typeof c.malicious === 'boolean' && ['invoice','email','voice','text'].includes(c.channel))) throw new Error('Invalid security benchmark corpus.');
const predict = (scenario: Scenario) => {const classification = classify(scenario.text, scenario.channel);const review = securityReview(scenario.text, classification);return {classification, review, held: review.risks.length > 0};};
const rows = corpus.cases.map(scenario => {
  const observed = predict(scenario);
  const outcome = scenario.malicious ? observed.held ? 'true_positive' : 'false_negative' : observed.held ? 'false_positive' : 'true_negative';
  return {id: scenario.id, title: scenario.title, channel: scenario.channel, category: scenario.category,
    groundTruth: {malicious: scenario.malicious, rationale: scenario.rationale},
    prediction: {securityHold: observed.held, classification: observed.classification.category, matchedRiskCodes: observed.review.risks.map(risk => risk.code), linksObserved: observed.review.links.length},
    outcome, conservativeAbstention: outcome === 'false_positive' && !!scenario.conservativeAbstentionExpected};
});
const count = (outcome: string) => rows.filter(row => row.outcome === outcome).length;
const confusion = {truePositive: count('true_positive'), falsePositive: count('false_positive'), trueNegative: count('true_negative'), falseNegative: count('false_negative')};
const ratio = (n: number, d: number) => d ? Number((n / d).toFixed(6)) : null;
const warmupRounds = 100, measuredRounds = 1000;
for (let round = 0; round < warmupRounds; round++) for (const scenario of corpus.cases) predict(scenario);
const samples: number[] = [];
const started = performance.now();
for (let round = 0; round < measuredRounds; round++) for (const scenario of corpus.cases) {
  const before = performance.now(); predict(scenario); samples.push(performance.now() - before);
}
const totalMeasuredMs = performance.now() - started;
samples.sort((a, b) => a - b);
const millis = (value: number) => Number(value.toFixed(6));
const percentile = (p: number) => millis(samples[Math.min(samples.length - 1, Math.ceil(p * samples.length) - 1)]!);
const result = {
  schemaVersion: 'secure-finance.synthetic-security-benchmark.v1', generatedAt: new Date().toISOString(),
  corpus: {path: 'tests/fixtures/inbox-security-corpus.json', sha256: createHash('sha256').update(corpusBytes).digest('hex'), cases: rows.length, benign: rows.filter(row => !row.groundTruth.malicious).length, malicious: rows.filter(row => row.groundTruth.malicious).length, authorship: corpus.authorship},
  method: {scope: 'Local deterministic classification + securityReview only; a nonempty risk list is counted as a positive detection.', networkRequests: 0, liveProviderCalls: 0, browserActions: 0, excluded: ['Sender or speaker authentication','Attachment malware scanning','Remote URL verification','Trusted payable checks','Independent final audit','Registered payment policy and chain receipts','Human review quality','Live model inference']},
  confusion,
  metrics: {detectionRecall: ratio(confusion.truePositive, confusion.truePositive + confusion.falseNegative), precision: ratio(confusion.truePositive, confusion.truePositive + confusion.falsePositive), falsePositiveRate: ratio(confusion.falsePositive, confusion.falsePositive + confusion.trueNegative), falseNegativeRate: ratio(confusion.falseNegative, confusion.falseNegative + confusion.truePositive), corpusAccuracy: ratio(confusion.truePositive + confusion.trueNegative, rows.length), conservativeBenignAbstentions: rows.filter(row => row.conservativeAbstention).length},
  latency: {unit: 'milliseconds per local classification + rule evaluation', warmupRounds, measuredRounds, evaluations: samples.length, minimumMs: millis(samples[0]!), medianMs: percentile(.5), p95Ms: percentile(.95), maximumMs: millis(samples.at(-1)!), meanMs: millis(samples.reduce((a, b) => a + b, 0) / samples.length), totalMeasuredMs: millis(totalMeasuredMs), environment: {node: process.version, platform: process.platform, arch: process.arch}, interpretation: 'Warmed rule execution on this machine. Includes measurement overhead and runtime scheduling; excludes request, upload, storage, agent, network and payment latency.'},
  cases: rows,
  limitations: [...corpus.limitations, 'These corpus metrics are not an estimate of production accuracy or real-world fraud prevention.', 'A rule-only false negative does not prove that the full workflow would pay; business, final-audit, human and onchain controls are not measured here.', 'A false-positive hold is preserved in the metrics even when abstaining is the conservative operational response.', 'The malicious examples are inert synthetic strings. All .invalid URLs remain unfetched.']
};
await mkdir(dirname(destination), {recursive: true});
await writeFile(destination, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({output: 'docs/results/inbox-security-benchmark.json', cases: rows.length, confusion, metrics: result.metrics, latencyMs: {median: result.latency.medianMs, p95: result.latency.p95Ms}}, null, 2));
