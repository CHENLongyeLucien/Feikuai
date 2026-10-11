/** Public, read-only C-Chain observations. No wallet authority or geographic attribution. */
export type NetworkTransaction = {
  hash: string;
  blockNumber: string;
  blockHash: string;
  timestamp: string;
  transactionIndex: number;
  from: string;
  to: string | null;
  valueAtomic: string;
  valueAvax: string;
  explorerUrl: string;
  executionStatus: 'not_checked';
};
export type NetworkActivity = {
  schemaVersion: 'avalanche-c-chain-activity.v1';
  network: {name: 'Avalanche C-Chain'; chainId: '43114'; environment: 'mainnet'; scope: 'C-Chain only'; nativeSymbol: 'AVAX'; nativeDecimals: 18; geolocationAvailable: false};
  source: {name: string; rpcUrl: string; documentationUrl: string; explorerUrl: string; readOnly: true; finality: 'rpc-finalized'};
  status: 'fresh' | 'stale' | 'unavailable';
  fetchedAt: string | null;
  servedAt: string;
  ageMs: number | null;
  headAgeMs?: number | null;
  nextRefreshAfterMs: number;
  latestBlock: null | {number: string; hash: string; timestamp: string; transactionCount: number; explorerUrl: string};
  transactions: NetworkTransaction[];
  sample: {blockCount: number; transactionCount: number; returnedTransactionCount: number; limit: 24};
  error: null | {code: string; message: string};
};
