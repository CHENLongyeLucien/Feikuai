// Downloads the public corpora used by the detection benchmark into ignored var/benchmark-data/.
// Raw data is never committed: every file is pinned by SHA-256, so the same corpus can be
// rebuilt from these scripts.
import {createHash} from 'node:crypto';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {resolve} from 'node:path';

const root = resolve('var/benchmark-data');
const ENRON = {dataset: 'corbt/enron-emails', revision: 'cfc06c758093d90993abce1a43668fb7357258a6'};
// Jose Nazario phishing corpus, CC-BY-4.0, https://monkey.org/~jose/phishing/
const NAZARIO: Record<string, string> = {
  'phishing-2015': '', 'phishing-2016': '', 'phishing-2017': '', 'phishing-2018': '', 'phishing-2019': '', 'phishing-2020': '',
  'phishing-2021': '', 'phishing-2022': '', 'phishing-2023': '', 'phishing-2024': '', 'phishing-2025': '',
};
const pins = resolve('scripts/benchmark/nazario.sha256');

export function mulberry32(seed: number) {
  return () => {seed |= 0; seed = seed + 0x6d2b79f5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296;};
}
const sha256 = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');

async function fetchRetry(url: string, attempts = 5): Promise<Response> {
  for (let i = 0; ; i++) {
    const response = await fetch(url, {signal: AbortSignal.timeout(60000)}).catch(error => error as Error);
    if (response instanceof Response && response.ok) return response;
    if (i + 1 >= attempts) throw new Error(`Download failed: ${url} (${response instanceof Response ? response.status : response.message})`);
    await new Promise(r => setTimeout(r, 1000 * 2 ** i));
  }
}

async function enron() {
  // Full CMU Enron corpus (517,401 messages) as a pinned Parquet mirror; sampling happens in sample_enron.py.
  const dir = resolve(root, 'enron');
  await mkdir(dir, {recursive: true});
  const pinned = (await readFile(resolve('scripts/benchmark/enron.sha256'), 'utf8')).trim().split('\n').map(line => line.split(/\s+/) as [string, string]);
  for (const [digest, name] of pinned) {
    const path = resolve(dir, name);
    const bytes = existsSync(path) ? await readFile(path) : new Uint8Array(await (await fetchRetry(`https://huggingface.co/datasets/${ENRON.dataset}/resolve/${ENRON.revision}/data/${name}`)).arrayBuffer());
    if (sha256(bytes) !== digest) throw new Error(`${name} does not match its pinned SHA-256.`);
    if (!existsSync(path)) await writeFile(path, bytes);
  }
  console.log(`Enron: ${pinned.length} Parquet shards verified`);
}

async function nazario() {
  const dir = resolve(root, 'nazario');
  await mkdir(dir, {recursive: true});
  const pinned = existsSync(pins) ? Object.fromEntries((await readFile(pins, 'utf8')).trim().split('\n').map(line => line.split(/\s+/).reverse())) as Record<string, string> : {};
  for (const name of Object.keys(NAZARIO)) {
    const path = resolve(dir, name);
    const bytes = existsSync(path) ? await readFile(path) : new Uint8Array(await (await fetchRetry(`https://monkey.org/~jose/phishing/${name}`)).arrayBuffer());
    const digest = sha256(bytes);
    if (pinned[name] && pinned[name] !== digest) throw new Error(`${name} does not match its pinned SHA-256; the upstream file changed.`);
    if (!existsSync(path)) await writeFile(path, bytes);
    NAZARIO[name] = digest;
  }
  if (!existsSync(pins)) await writeFile(pins, Object.entries(NAZARIO).map(([name, digest]) => `${digest}  ${name}`).join('\n') + '\n');
  console.log(`Nazario: ${Object.keys(NAZARIO).length} mailboxes verified`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await mkdir(root, {recursive: true});
  await nazario();
  await enron();
}
