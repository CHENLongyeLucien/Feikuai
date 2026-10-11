import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import {formatUnits} from 'viem';
import type {NetworkActivity, NetworkTransaction} from '@secure-finance/shared';

// Public network reads are deliberately independent of payment config, accounts and DB.
// RPC/chain: https://build.avax.network/docs/primary-network
// finalized = settled block: https://build.avax.network/docs/primary-network/exchange-integration
// Explorer: https://build.avax.network/integrations/snowtrace
export const PUBLIC_ACTIVITY_RPC = 'https://api.avax.network/ext/bc/C/rpc';
const EXPLORER = 'https://snowtrace.io';
const POLL_MS = 10_000, MAX_BACKOFF_MS = 60_000, FRESH_MS = 30_000, HEAD_FRESH_MS = 60_000, MAX_STALE_MS = 300_000;
const BODY_LIMIT = 5 * 1024 * 1024, TX_LIMIT = 24;
const quantity = z.string().regex(/^0x(?:0|[1-9a-fA-F][0-9a-fA-F]*)$/).max(66);
const hash = z.string().regex(/^0x[0-9a-fA-F]{64}$/).transform(value => value.toLowerCase());
const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/).transform(value => value.toLowerCase());
const transactionSchema = z.object({hash, blockHash: hash, blockNumber: quantity, transactionIndex: quantity, from: address, to: address.nullable(), value: quantity});
const blockSchema = z.object({number: quantity, hash, parentHash: hash, timestamp: quantity, transactions: z.array(transactionSchema).max(10_000)});
type Block = z.infer<typeof blockSchema>;
type FailureCode = 'RPC_UNAVAILABLE' | 'RPC_TIMEOUT' | 'RPC_RATE_LIMITED' | 'RPC_INVALID_RESPONSE' | 'RPC_WRONG_CHAIN' | 'SOURCE_STALE';
const messages: Record<FailureCode, string> = {
  RPC_UNAVAILABLE: 'The public C-Chain source is unavailable. No activity has been invented.',
  RPC_TIMEOUT: 'The public C-Chain request timed out. Try again after the retry interval.',
  RPC_RATE_LIMITED: 'The public C-Chain source is limiting requests. Activity will retry shortly.',
  RPC_INVALID_RESPONSE: 'The public source returned an incomplete or inconsistent block response.',
  RPC_WRONG_CHAIN: 'The public source did not identify Avalanche C-Chain mainnet.',
  SOURCE_STALE: 'The last observed activity is older than the live freshness window.',
};
class ActivityFailure extends Error {constructor(readonly code: FailureCode) {super(messages[code]);}}
type Snapshot = {fetchedMs: number; headMs: number; latestBlock: NonNullable<NetworkActivity['latestBlock']>; transactions: NetworkTransaction[]; sample: NetworkActivity['sample']};

export class NetworkActivityService {
  private readonly fetcher: typeof fetch;
  private readonly now: () => number;
  private readonly timeoutMs: number;
  private snapshot: Snapshot | null = null;
  private failure: FailureCode | null = null;
  private failures = 0;
  private nextAttempt = 0;
  private sequence = 0;
  private pending: Promise<void> | undefined;
  private controller: AbortController | undefined;
  private closed = false;

  constructor(options: {fetch?: typeof fetch; now?: () => number; timeoutMs?: number} = {}) {
    this.fetcher = options.fetch ?? globalThis.fetch;
    this.now = options.now ?? Date.now;
    this.timeoutMs = Math.max(1, Math.min(options.timeoutMs ?? 4000, 4000));
  }

  async activity(): Promise<NetworkActivity> {
    if (!this.closed && !this.pending && this.now() >= this.nextAttempt) {
      this.pending = this.refresh().finally(() => {this.pending = undefined;});
    }
    if (this.pending) await this.pending;
    const now = this.now(), stored = this.snapshot;
    const ageMs = stored ? Math.max(0, now - stored.fetchedMs) : null;
    const headAgeMs = stored ? Math.max(0, now - stored.headMs) : null;
    const usable = !!stored && Math.max(ageMs!, headAgeMs!) <= MAX_STALE_MS;
    const fresh = usable && !this.failure && ageMs! <= FRESH_MS && headAgeMs! <= HEAD_FRESH_MS;
    const code = this.failure ?? (!fresh ? stored ? 'SOURCE_STALE' : 'RPC_UNAVAILABLE' : null);
    return {
      schemaVersion: 'avalanche-c-chain-activity.v1',
      network: {name: 'Avalanche C-Chain', chainId: '43114', environment: 'mainnet', scope: 'C-Chain only', nativeSymbol: 'AVAX', nativeDecimals: 18, geolocationAvailable: false},
      source: {name: 'Avalanche public RPC', rpcUrl: PUBLIC_ACTIVITY_RPC, documentationUrl: 'https://build.avax.network/docs/primary-network/exchange-integration', explorerUrl: EXPLORER, readOnly: true, finality: 'rpc-finalized'},
      status: !usable ? 'unavailable' : fresh ? 'fresh' : 'stale',
      fetchedAt: stored ? new Date(stored.fetchedMs).toISOString() : null,
      servedAt: new Date(now).toISOString(), ageMs, headAgeMs,
      nextRefreshAfterMs: Math.max(0, this.nextAttempt - now),
      latestBlock: usable ? {...stored.latestBlock} : null,
      transactions: usable ? stored.transactions.map(transaction => ({...transaction})) : [],
      sample: usable ? {...stored.sample} : {blockCount: 0, transactionCount: 0, returnedTransactionCount: 0, limit: TX_LIMIT},
      error: code ? {code, message: messages[code]} : null,
    };
  }

  async close() {
    this.closed = true;
    this.controller?.abort(new ActivityFailure('RPC_UNAVAILABLE'));
    await this.pending;
  }

  private async refresh() {
    const controller = new AbortController();
    this.controller = controller;
    const timeout = setTimeout(() => controller.abort(new ActivityFailure('RPC_TIMEOUT')), this.timeoutMs);
    timeout.unref();
    try {
      const cancelled = new Promise<never>((_, reject) => controller.signal.addEventListener('abort', () => reject(controller.signal.reason), {once: true}));
      this.snapshot = await Promise.race([this.readSnapshot(controller.signal), cancelled]);
      this.failure = null;
      this.failures = 0;
      this.nextAttempt = this.now() + POLL_MS;
    } catch (error) {
      this.failure = error instanceof ActivityFailure ? error.code : 'RPC_UNAVAILABLE';
      this.failures = Math.min(this.failures + 1, 8);
      this.nextAttempt = this.now() + Math.min(MAX_BACKOFF_MS, POLL_MS * 2 ** (this.failures - 1));
    } finally {
      clearTimeout(timeout);
      this.controller = undefined;
    }
  }

  private async rpc(method: 'eth_chainId' | 'eth_getBlockByNumber' | 'eth_getBlockByHash', params: unknown[], signal: AbortSignal): Promise<unknown> {
    signal.throwIfAborted();
    const id = ++this.sequence;
    const response = await this.fetcher(PUBLIC_ACTIVITY_RPC, {
      method: 'POST', headers: {'Content-Type': 'application/json', Accept: 'application/json'},
      body: JSON.stringify({jsonrpc: '2.0', id, method, params}), signal, redirect: 'error', credentials: 'omit',
    });
    if (!response.ok) {
      void response.body?.cancel().catch(() => {});
      throw new ActivityFailure(response.status === 429 ? 'RPC_RATE_LIMITED' : 'RPC_UNAVAILABLE');
    }
    if (Number(response.headers.get('content-length')) > BODY_LIMIT || !response.body) {
      void response.body?.cancel().catch(() => {});
      throw new ActivityFailure('RPC_INVALID_RESPONSE');
    }
    const reader = response.body.getReader(), decoder = new TextDecoder('utf-8', {fatal: true});
    let bytes = 0, text = '';
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        bytes += chunk.value.byteLength;
        if (bytes > BODY_LIMIT) throw new ActivityFailure('RPC_INVALID_RESPONSE');
        text += decoder.decode(chunk.value, {stream: true});
      }
      text += decoder.decode();
      const payload = JSON.parse(text) as Record<string, unknown>;
      if (!payload || Array.isArray(payload) || payload.jsonrpc !== '2.0' || payload.id !== id || payload.error || !Object.hasOwn(payload, 'result')) throw new ActivityFailure('RPC_INVALID_RESPONSE');
      return payload.result;
    } catch (error) {
      void reader.cancel().catch(() => {});
      throw error instanceof ActivityFailure ? error : new ActivityFailure('RPC_INVALID_RESPONSE');
    } finally {reader.releaseLock();}
  }

  private block(value: unknown): Block {
    const parsed = blockSchema.safeParse(value);
    if (!parsed.success) throw new ActivityFailure('RPC_INVALID_RESPONSE');
    const block = parsed.data, seen = new Set<string>();
    if (BigInt(block.timestamp) > BigInt(Math.floor(this.now() / 1000) + 30)) throw new ActivityFailure('RPC_INVALID_RESPONSE');
    for (const [index, transaction] of block.transactions.entries()) {
      if (transaction.blockHash !== block.hash || BigInt(transaction.blockNumber) !== BigInt(block.number) || BigInt(transaction.transactionIndex) !== BigInt(index) || seen.has(transaction.hash)) throw new ActivityFailure('RPC_INVALID_RESPONSE');
      seen.add(transaction.hash);
    }
    return block;
  }

  private async readSnapshot(signal: AbortSignal): Promise<Snapshot> {
    const chainId = await this.rpc('eth_chainId', [], signal);
    if (typeof chainId !== 'string' || !quantity.safeParse(chainId).success || BigInt(chainId) !== 43114n) throw new ActivityFailure('RPC_WRONG_CHAIN');
    const latest = this.block(await this.rpc('eth_getBlockByNumber', ['finalized', true], signal));
    const blocks = [latest];
    if (BigInt(latest.number) > 0n) {
      const parent = this.block(await this.rpc('eth_getBlockByHash', [latest.parentHash, true], signal));
      if (parent.hash !== latest.parentHash || BigInt(parent.number) + 1n !== BigInt(latest.number) || BigInt(parent.timestamp) > BigInt(latest.timestamp)) throw new ActivityFailure('RPC_INVALID_RESPONSE');
      blocks.push(parent);
    }
    const transactionHashes = new Set<string>();
    const transactions: NetworkTransaction[] = [];
    for (const block of blocks) for (const transaction of [...block.transactions].reverse()) {
      if (transactionHashes.has(transaction.hash)) throw new ActivityFailure('RPC_INVALID_RESPONSE');
      transactionHashes.add(transaction.hash);
      if (transactions.length < TX_LIMIT) transactions.push({
        hash: transaction.hash, blockHash: block.hash, blockNumber: BigInt(block.number).toString(),
        timestamp: new Date(Number(BigInt(block.timestamp)) * 1000).toISOString(), transactionIndex: Number(BigInt(transaction.transactionIndex)),
        from: transaction.from, to: transaction.to, valueAtomic: BigInt(transaction.value).toString(), valueAvax: formatUnits(BigInt(transaction.value), 18),
        explorerUrl: `${EXPLORER}/tx/${transaction.hash}`, executionStatus: 'not_checked',
      });
    }
    return {
      fetchedMs: this.now(), headMs: Number(BigInt(latest.timestamp)) * 1000,
      latestBlock: {number: BigInt(latest.number).toString(), hash: latest.hash, timestamp: new Date(Number(BigInt(latest.timestamp)) * 1000).toISOString(), transactionCount: latest.transactions.length, explorerUrl: `${EXPLORER}/block/${BigInt(latest.number)}`},
      transactions, sample: {blockCount: blocks.length, transactionCount: transactionHashes.size, returnedTransactionCount: transactions.length, limit: TX_LIMIT},
    };
  }
}

export async function registerNetworkActivity(app: FastifyInstance, service = new NetworkActivityService()) {
  app.get('/api/v1/network/activity', {config: {rateLimit: {max: 30, timeWindow: '1 minute'}}}, async (request, reply) => {
    if (Object.keys(request.query as object).length) return reply.code(400).send({error: {code: 'UNSUPPORTED_QUERY', message: 'This public activity endpoint accepts no RPC URL, chain or other query parameters.'}});
    reply.header('Cache-Control', 'no-store');
    return service.activity();
  });
  app.addHook('onClose', async () => service.close());
  return service;
}
