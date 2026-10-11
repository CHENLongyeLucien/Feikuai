import { z } from 'zod';
export {DORA_RULES_VERSION,DORA_SOURCES,doraImpactSchema,doraTimelineSchema,classifyDoraImpact,doraReportingDeadlines,type DoraImpact,type DoraTimeline} from './agentguard-dora.js';
export type {NetworkActivity, NetworkTransaction} from './network.js';

export type Address = `0x${string}`;
export type Hex32 = `0x${string}`;
export type UInt256String = string;
export type UInt64String = string;
export const addressSchema = z.string().regex(/^0x[0-9a-fA-F]{40}$/).transform(v => v.toLowerCase() as Address);
export const hex32Schema = z.string().regex(/^0x[0-9a-f]{64}$/).transform(v=>v as Hex32);
export const uint256Schema = z.string().regex(/^(0|[1-9][0-9]*)$/).refine(v => BigInt(v) < 2n ** 256n, 'uint256 overflow');
export const uint64Schema = z.string().regex(/^(0|[1-9][0-9]*)$/).refine(v => BigInt(v) < 2n ** 64n, 'uint64 overflow');
export const positiveUintSchema = uint256Schema.refine(v => BigInt(v) > 0n, 'Must be positive');
export const nonzeroHex32Schema = hex32Schema.refine(v=>!/^0x0+$/.test(v),'Must be nonzero');
export const paymentSchema = z.object({ invoiceKey: nonzeroHex32Schema, supplierKey: nonzeroHex32Schema, recipient: addressSchema, token: addressSchema, amountAtomic: positiveUintSchema, authorizationNonce: positiveUintSchema, issuedAt: uint64Schema, deadline: uint64Schema, evidenceCommitment: nonzeroHex32Schema, policyId: hex32Schema }).strict();
export const paymentWireSchema = paymentSchema;
export type PaymentWire = z.infer<typeof paymentSchema>;
export const domainSchema = z.object({ name:z.literal('SecureFinancePaymentGuard'), version:z.literal('1'), chainId:z.enum(['31337','43113']), verifyingContract:addressSchema }).strict();
export type DomainWire = z.infer<typeof domainSchema>;
export function parseAmount(input: string, decimals=6): string {
  if (!Number.isSafeInteger(decimals) || decimals < 0 || decimals > 77) throw new Error('Invalid decimals');
  if (!/^(0|[1-9][0-9]*)(\.[0-9]+)?$/.test(input)) throw new Error('Invalid decimal amount');
  const [whole, fraction=''] = input.split('.');
  if(fraction.length>decimals) throw new Error('Too many decimal places');
  return uint256Schema.parse((BigInt(whole!) * 10n ** BigInt(decimals) + BigInt(fraction.padEnd(decimals,'0') || '0')).toString());
}
export function formatAmount(input:string, decimals=6):string {
  const value=BigInt(uint256Schema.parse(input)), scale=10n**BigInt(decimals);
  const whole=(value/scale).toString().replace(/\B(?=(\d{3})+(?!\d))/g,',');
  const fraction=(value%scale).toString().padStart(decimals,'0').replace(/0+$/,'');
  return fraction?`${whole}.${fraction}`:whole;
}
export const sourceSpanSchema=z.object({page:z.number().int().min(1).max(20),start:z.number().int().min(0).max(40000),end:z.number().int().min(0).max(40000),quote:z.string().max(4000)}).strict();
export type SourceSpan=z.infer<typeof sourceSpanSchema>;
export function validateSourceSpan(span:SourceSpan,pages:string[]):boolean {const page=pages[span.page-1];return page!==undefined && span.end>span.start && span.end<=page.length && page.slice(span.start,span.end)===span.quote;}
const nullableText=z.string().max(500).nullable();
export const intakeResultSchema=z.object({schemaVersion:z.literal('intake.v1'),invoiceReference:nullableText,supplierReference:nullableText,amountDecimalCandidate:nullableText,displayedAsset:nullableText,claimedRecipient:nullableText,fieldSources:z.array(z.object({field:z.enum(['invoiceReference','supplierReference','amountDecimalCandidate','displayedAsset','claimedRecipient']),span:sourceSpanSchema}).strict()).max(30),missingFields:z.array(z.string().max(100)).max(10),suspiciousInstructions:z.array(z.object({category:z.enum(['FORGED_AUTHORITY','RECIPIENT_CHANGE','TOOL_INSTRUCTION','OTHER']),span:sourceSpanSchema,summary:z.string().max(1000)}).strict()).max(30),summary:z.string().max(2000)}).strict();
export type IntakeResult=z.infer<typeof intakeResultSchema>;
export const discrepancyCodes=['IDENTITY_MISMATCH','AMOUNT_MISMATCH','TOKEN_MISMATCH','RECIPIENT_MISMATCH','MISSING_FACT','SUSPICIOUS_INSTRUCTION','ALREADY_SETTLED','UNRESOLVED_EXECUTION','RECORD_VERSION_MISMATCH','UNKNOWN_RECORD'] as const;
export const financeResultSchema=z.object({schemaVersion:z.literal('finance.v1'),payableRecordId:nullableText,supplierRecordId:nullableText,payableRecordVersion:nullableText,supplierRecordVersion:nullableText,recommendation:z.enum(['READY_FOR_HUMAN_REVIEW','HOLD','NEEDS_INFORMATION']),discrepancies:z.array(z.object({code:z.enum(discrepancyCodes),summary:z.string().max(1000),evidenceIds:z.array(z.string().max(200)).max(20)}).strict()).max(30),summary:z.string().max(2000)}).strict();
export type FinanceResult=z.infer<typeof financeResultSchema>;
export const workflowStatusSchema=z.enum(['RECEIVED','EXTRACTING','CHECKING','NEEDS_INFORMATION','HELD','READY_FOR_REVIEW','CLOSED']);
export type WorkflowStatus=z.infer<typeof workflowStatusSchema>;
export type AuthorizationStatus='AWAITING_SIGNATURE'|'VALID'|'EXPIRED'|'CANCELLATION_PENDING'|'CANCELLED'|'CONSUMED';
export type ExecutionStatus='NONE'|'PREPARING'|'PREPARED'|'SUBMITTED'|'PENDING'|'UNKNOWN'|'REVERTED'|'CONFIRMED'|'INCONSISTENT';
export type SettlementStatus='UNSETTLED'|'SETTLED';
export const signatureFileSchema=z.object({schemaVersion:z.literal('secure-finance.approval-signature.v1'),proposalId:z.string().uuid(),typedDigest:hex32Schema,signer:addressSchema,signature:z.string().regex(/^0x[0-9a-fA-F]{130}$/)}).strict();
export const cancellationFileSchema=z.object({schemaVersion:z.literal('secure-finance.cancellation-observation.v1'),proposalId:z.string().uuid(),chainId:z.enum(['31337','43113']),vault:addressSchema,authorizationNonce:positiveUintSchema,transactionHash:hex32Schema}).strict();
