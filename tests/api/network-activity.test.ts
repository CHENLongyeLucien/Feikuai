import {afterEach, describe, expect, it, vi} from 'vitest';
import Fastify from 'fastify';
import rateLimit from '@fastify/rate-limit';
import {NetworkActivityService, PUBLIC_ACTIVITY_RPC, registerNetworkActivity} from '../../apps/api/src/network/activity.js';

const NOW = Date.parse('2026-10-11T12:30:00.000Z');
const hash = (value: number) => `0x${value.toString(16).padStart(64, '0')}`;
const quantity = (value: number | bigint) => `0x${value.toString(16)}`;
function block(number = 1000, count = 15, ageSeconds = 2) {
  return {
    number: quantity(number), hash: hash(number), parentHash: hash(number - 1), timestamp: quantity(Math.floor(NOW / 1000) - ageSeconds),
    transactions: Array.from({length: count}, (_, index) => ({hash: hash(number * 100 + index), blockNumber: quantity(number), blockHash: hash(number), transactionIndex: quantity(index), from: '0x' + '1'.repeat(40), to: index ? '0x' + '2'.repeat(40) : null, value: quantity(10n ** 18n + BigInt(index))})),
  };
}
type RawBlock = ReturnType<typeof block>;
function rpcMock(options: {latest?: RawBlock; parent?: RawBlock; chainId?: string} = {}) {
  const latest = options.latest ?? block(), parent = options.parent ?? block(999, 15, 3);
  const fetcher = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    expect(url).toBe(PUBLIC_ACTIVITY_RPC);
    expect(init).toMatchObject({method: 'POST', redirect: 'error', credentials: 'omit'});
    const request = JSON.parse(init!.body as string) as {id: number; method: string; params: unknown[]};
    expect(['eth_chainId', 'eth_getBlockByNumber', 'eth_getBlockByHash']).toContain(request.method);
    const result = request.method === 'eth_chainId' ? options.chainId ?? '0xa86a' : request.method === 'eth_getBlockByNumber' ? latest : parent;
    if (request.method === 'eth_getBlockByNumber') expect(request.params).toEqual(['finalized', true]);
    if (request.method === 'eth_getBlockByHash') expect(request.params).toEqual([latest.parentHash, true]);
    return new Response(JSON.stringify({jsonrpc: '2.0', id: request.id, result}), {headers: {'content-type': 'application/json'}});
  });
  return fetcher;
}
const services: NetworkActivityService[] = [];
const apps: ReturnType<typeof Fastify>[] = [];
function service(fetcher: typeof fetch, options: {now?: () => number; timeoutMs?: number} = {}) {
  const instance = new NetworkActivityService({fetch: fetcher, now: () => NOW, ...options});
  services.push(instance);
  return instance;
}
afterEach(async () => {
  for (const app of apps.splice(0)) await app.close();
  for (const instance of services.splice(0)) await instance.close();
  vi.useRealTimers();
});

describe('public Avalanche C-Chain activity', () => {
  it('returns only real RPC block records with exact native values and bounded sample counts', async () => {
    const fetcher = rpcMock(), instance = service(fetcher);
    const result = await instance.activity();
    expect(result.status).toBe('fresh');
    expect(result.network).toMatchObject({chainId: '43114', scope: 'C-Chain only', geolocationAvailable: false, nativeDecimals: 18});
    expect(result.source).toMatchObject({rpcUrl: PUBLIC_ACTIVITY_RPC, readOnly: true, finality: 'rpc-finalized'});
    expect(result.latestBlock).toMatchObject({number: '1000', hash: hash(1000), transactionCount: 15, timestamp: '2026-10-11T12:29:58.000Z'});
    expect(result.sample).toEqual({blockCount: 2, transactionCount: 30, returnedTransactionCount: 24, limit: 24});
    expect(result.transactions).toHaveLength(24);
    expect(result.transactions[0]).toMatchObject({hash: hash(100014), blockNumber: '1000', transactionIndex: 14, valueAtomic: '1000000000000000014', valueAvax: '1.000000000000000014', executionStatus: 'not_checked', explorerUrl: `https://snowtrace.io/tx/${hash(100014)}`});
    expect(result.transactions[14]!.to).toBeNull();
    expect(result.transactions[15]!.blockNumber).toBe('999');
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(JSON.stringify(result)).not.toMatch(/latitude|longitude|"success"|"settled"/);
  });

  it('coalesces simultaneous requests and returns isolated copies from its ten-second cache', async () => {
    const fetcher = rpcMock(), instance = service(fetcher);
    const results = await Promise.all(Array.from({length: 25}, () => instance.activity()));
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(results.every(result => result.status === 'fresh')).toBe(true);
    results[0]!.transactions[0]!.hash = 'tampered caller value';
    const cached = await instance.activity();
    expect(cached.transactions[0]!.hash).toBe(hash(100014));
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(cached.nextRefreshAfterMs).toBe(10_000);
  });

  it('retains a labelled stale sample on failure, backs off, recovers, then removes expired data', async () => {
    let now = NOW;
    const fetcher = rpcMock(), instance = service(fetcher, {now: () => now});
    await instance.activity();
    now += 10_001;
    fetcher.mockRejectedValueOnce(new Error('provider response includes private-debug-text'));
    const stale = await instance.activity();
    expect(stale.status).toBe('stale');
    expect(stale.transactions).toHaveLength(24);
    expect(stale.error?.code).toBe('RPC_UNAVAILABLE');
    expect(JSON.stringify(stale)).not.toContain('private-debug-text');
    const calls = fetcher.mock.calls.length;
    await instance.activity();
    expect(fetcher).toHaveBeenCalledTimes(calls);
    now += 10_000;
    expect((await instance.activity()).status).toBe('fresh');
    now += 300_001;
    fetcher.mockRejectedValueOnce(new Error('offline'));
    const expired = await instance.activity();
    expect(expired.status).toBe('unavailable');
    expect(expired.latestBlock).toBeNull();
    expect(expired.transactions).toEqual([]);
    expect(expired.sample.transactionCount).toBe(0);
  });

  it('returns no fabricated first sample and caps exponential failure backoff at sixty seconds', async () => {
    let now = NOW;
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new Error('unreachable'));
    const instance = service(fetcher, {now: () => now});
    for (const delay of [10_000, 20_000, 40_000, 60_000, 60_000]) {
      const result = await instance.activity();
      expect(result).toMatchObject({status: 'unavailable', fetchedAt: null, latestBlock: null, transactions: [], nextRefreshAfterMs: delay});
      now += delay;
    }
    expect(fetcher).toHaveBeenCalledTimes(5);
  });

  it('rejects the wrong network before reading any blocks and never falls back to latest or pending', async () => {
    const fetcher = rpcMock({chainId: '0xa869'}), result = await service(fetcher).activity();
    expect(result.error?.code).toBe('RPC_WRONG_CHAIN');
    expect(result.transactions).toEqual([]);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it.each(['parent identity', 'transaction block', 'duplicate transaction', 'future timestamp'] as const)('rejects inconsistent %s without publishing it', async defect => {
    const latest = block(), parent = block(999, 15, 3);
    if (defect === 'parent identity') parent.hash = hash(998);
    if (defect === 'transaction block') latest.transactions[0]!.blockHash = hash(999);
    if (defect === 'duplicate transaction') latest.transactions[1]!.hash = latest.transactions[0]!.hash;
    if (defect === 'future timestamp') latest.timestamp = quantity(Math.floor(NOW / 1000) + 60);
    const result = await service(rpcMock({latest, parent})).activity();
    expect(result.status).toBe('unavailable');
    expect(result.error?.code).toBe('RPC_INVALID_RESPONSE');
    expect(result.transactions).toEqual([]);
  });

  it('labels an old finalized head stale even when the RPC fetch itself just succeeded', async () => {
    const result = await service(rpcMock({latest: block(1000, 0, 120), parent: block(999, 0, 121)})).activity();
    expect(result).toMatchObject({status: 'stale', ageMs: 0, headAgeMs: 120_000, transactions: [], error: {code: 'SOURCE_STALE'}});
    expect(result.sample).toMatchObject({blockCount: 2, transactionCount: 0});
  });

  it('bounds a stalled transport by the total deadline and aborts it', async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    const fetcher = vi.fn<typeof fetch>((_url, init) => {signal = init!.signal as AbortSignal; return new Promise<Response>(() => {});});
    const instance = service(fetcher, {timeoutMs: 40});
    const result = instance.activity();
    await vi.advanceTimersByTimeAsync(41);
    expect((await result).error?.code).toBe('RPC_TIMEOUT');
    expect(signal?.aborted).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('rejects oversized bodies, malformed JSON-RPC envelopes and upstream rate limits', async () => {
    for (const [response, code] of [
      [new Response(new Uint8Array(5 * 1024 * 1024 + 1)), 'RPC_INVALID_RESPONSE'],
      [new Response(JSON.stringify({jsonrpc: '2.0', id: 9999, result: '0xa86a'})), 'RPC_INVALID_RESPONSE'],
      [new Response('provider-private-message', {status: 429}), 'RPC_RATE_LIMITED'],
    ] as const) {
      const result = await service(vi.fn<typeof fetch>().mockResolvedValue(response)).activity();
      expect(result.error?.code).toBe(code);
      expect(result.transactions).toEqual([]);
      expect(JSON.stringify(result)).not.toContain('provider-private-message');
    }
  });

  it('serves unauthenticated GET only, rejects RPC overrides and limits public requests', async () => {
    const app = Fastify(); apps.push(app);
    await app.register(rateLimit, {global: false});
    const fetcher = rpcMock();
    await registerNetworkActivity(app, service(fetcher));
    const result = await app.inject('/api/v1/network/activity');
    expect(result.statusCode).toBe(200);
    expect(result.json().status).toBe('fresh');
    expect(result.headers['cache-control']).toBe('no-store');
    expect((await app.inject('/api/v1/network/activity?rpcUrl=https://attacker.invalid')).statusCode).toBe(400);
    expect((await app.inject({method: 'POST', url: '/api/v1/network/activity', payload: {method: 'eth_sendRawTransaction'}})).statusCode).toBe(404);
    let last = 200;
    for (let index = 0; index < 31; index++) last = (await app.inject('/api/v1/network/activity')).statusCode;
    expect(last).toBe(429);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it('aborts in-flight reads on close and never starts a background poll', async () => {
    const fetcher = vi.fn<typeof fetch>(() => new Promise<Response>(() => {}));
    const instance = service(fetcher);
    const pending = instance.activity();
    await instance.close();
    expect((await pending).status).toBe('unavailable');
    await instance.activity();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
