import { encodeAbiParameters, keccak256, toHex, type Hex } from 'viem';
import { z } from 'zod';
import { paymentSchema, domainSchema, type PaymentWire, type DomainWire } from '@secure-finance/shared';
export { paymentGuardAbi, demoTokenAbi } from './abi.js';

export const paymentTypes = { Payment: [
  { name: 'invoiceKey', type: 'bytes32' }, { name: 'supplierKey', type: 'bytes32' },
  { name: 'recipient', type: 'address' }, { name: 'token', type: 'address' },
  { name: 'amountAtomic', type: 'uint256' }, { name: 'authorizationNonce', type: 'uint256' },
  { name: 'issuedAt', type: 'uint64' }, { name: 'deadline', type: 'uint64' },
  { name: 'evidenceCommitment', type: 'bytes32' }, { name: 'policyId', type: 'bytes32' },
] } as const;
export const PAYMENT_TYPE_STRING = 'Payment(bytes32 invoiceKey,bytes32 supplierKey,address recipient,address token,uint256 amountAtomic,uint256 authorizationNonce,uint64 issuedAt,uint64 deadline,bytes32 evidenceCommitment,bytes32 policyId)';
export const POLICY_TYPE_STRING = 'SecureFinancePolicyV1(address token,address approver,uint256 maxPerPaymentAtomic,uint64 maxAuthorizationTTL,bytes32 registryHash,bytes32 paymentTypeHash)';
export const PAYMENT_TYPEHASH = keccak256(toHex(PAYMENT_TYPE_STRING));
export const POLICY_TYPEHASH = keccak256(toHex(POLICY_TYPE_STRING));

export function toViemPayment(input: PaymentWire) {
  const p = paymentSchema.parse(input);
  return { ...p, amountAtomic: BigInt(p.amountAtomic), authorizationNonce: BigInt(p.authorizationNonce), issuedAt: BigInt(p.issuedAt), deadline: BigInt(p.deadline) };
}
export function paymentTypedData(domain: DomainWire, payment: PaymentWire) {
  const d = domainSchema.parse(domain);
  return { domain: { ...d, chainId: Number(d.chainId) }, types: paymentTypes, primaryType: 'Payment' as const, message: toViemPayment(payment) };
}

const address = z.string().regex(/^0x[0-9a-f]{40}$/).transform(v => v as `0x${string}`);
const bytes32 = z.string().regex(/^0x[0-9a-f]{64}$/).transform(v => v as Hex);
const uint = z.string().regex(/^(0|[1-9][0-9]*)$/).refine(v => BigInt(v) < 2n ** 256n);
const registryEntry = z.object({ supplierKey: bytes32, recipient: address }).strict();
export const policyConfigSchema = z.object({
  token: address, approver: address, maxPerPaymentAtomic: uint.refine(v => BigInt(v) > 0n),
  maxAuthorizationTTL: uint.refine(v => BigInt(v) >= 1n && BigInt(v) <= 600n),
  registry: z.array(registryEntry).min(1).max(32),
}).refine(v => v.registry.every((entry, i) => BigInt(entry.supplierKey) > 0n &&
    (i === 0 || entry.supplierKey > v.registry[i - 1]!.supplierKey) && BigInt(entry.recipient) > 0n), 'Registry must be nonzero and strictly sorted');

export function derivePolicy(config: z.input<typeof policyConfigSchema>) {
  const p = policyConfigSchema.parse(config);
  const registryHash = keccak256(encodeAbiParameters([{type:'bytes32[]'}, {type:'address[]'}], [p.registry.map(r=>r.supplierKey), p.registry.map(r=>r.recipient)]));
  const policyId = keccak256(encodeAbiParameters([{type:'bytes32'},{type:'address'},{type:'address'},{type:'uint256'},{type:'uint64'},{type:'bytes32'},{type:'bytes32'}],
    [POLICY_TYPEHASH,p.token,p.approver,BigInt(p.maxPerPaymentAtomic),BigInt(p.maxAuthorizationTTL),registryHash,PAYMENT_TYPEHASH]));
  return { registryHash, policyId, paymentTypeHash: PAYMENT_TYPEHASH, policyTypeHash: POLICY_TYPEHASH };
}

export const deploymentSchema = z.object({
  schemaVersion: z.literal('secure-finance.deployment.v1'), environment: z.enum(['local','fuji']),
  chainId: z.enum(['31337','43113']), rpcUrl: z.string().url(), vault: address, token: address, approver: address,
  roles: z.object({deployer: address, approver: address, relayer: address, suppliers: z.array(address).min(1).max(32)}).strict(),
  maxPerPaymentAtomic: uint, maxAuthorizationTTL: uint, registry: z.array(registryEntry).min(1).max(32),
  registryHash: bytes32, policyId: bytes32, runtimeCodeHash: bytes32, tokenRuntimeCodeHash: bytes32,
  deploymentBlock: uint, transactions: z.object({token: bytes32,vault: bytes32,funding: bytes32}).strict(),
  build: z.object({solidity: z.string(),openzeppelin: z.string(),evmVersion: z.literal('cancun'),optimizerRuns: z.literal(200),viaIR: z.literal(true),foundry: z.string()}).strict(),
}).strict().superRefine((m, ctx) => {
  const issue = (message: string) => ctx.addIssue({code:'custom',message});
  if ((m.environment === 'local' ? '31337' : '43113') !== m.chainId) issue('Environment/chain mismatch');
  if (m.approver !== m.roles.approver) issue('Approver role mismatch');
  const roles = [m.roles.deployer,m.roles.approver,m.roles.relayer,...m.roles.suppliers];
  if (new Set(roles).size !== roles.length || roles.some(a => BigInt(a) === 0n)) issue('Roles must be distinct and nonzero');
  if (m.registry.some(r => r.recipient === m.vault || !m.roles.suppliers.includes(r.recipient))) issue('Registry recipient must be named supplier');
  try { const p = derivePolicy(m); if (p.policyId !== m.policyId || p.registryHash !== m.registryHash) issue('Derived policy mismatch'); }
  catch { issue('Invalid policy configuration'); }
});
export type Deployment = z.infer<typeof deploymentSchema>;
export function deploymentDomain(m: Deployment): DomainWire { return {name:'SecureFinancePaymentGuard',version:'1',chainId:m.chainId,verifyingContract:m.vault}; }
