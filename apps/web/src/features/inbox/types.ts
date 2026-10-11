export type InboxChannel = 'invoice' | 'email' | 'voice' | 'text';
export type InboxStatus = 'processing' | 'quarantined' | 'needs_review' | 'approved' | 'rejected';
export type InboxStage = {
  id: string;
  name: string;
  status: string;
  summary: string;
  evidence: unknown;
  mode: string;
};
export type InboxRisk = {code: string; severity: string; title: string; detail: string; evidence?: unknown};
export type InboxNotification = {id: string; itemId: string; kind: string; title: string; message: string; read: boolean; createdAt: string};
export type InboxItem = {
  id: string;
  version: number;
  channel: InboxChannel;
  title: string;
  sender?: string | null;
  preview: string;
  text: string;
  status: InboxStatus;
  classification: null | {category: string; label: string; confidence: string; summary: string};
  stages: InboxStage[];
  risks: InboxRisk[];
  links: {url: string; status: string; reason: string}[];
  notifications: InboxNotification[];
  nextActions: {id: string; label: string; href?: string}[];
  linkedCaseId: string | null;
  payableId: string | null;
  approval: null | {scope: string; decision: string; reason?: string};
  reviewBlock?: {code: 'INVOICE_ALREADY_SETTLED'; title: string; message: string};
  payment: null | {authorizationStatus: string | null; executionStatus: string; settlementStatus: string; txHash?: string | null; requiresWalletSignature?: boolean; authorityModel?: string};
  createdAt?: string;
  updatedAt?: string;
  source: {sha256: string; textHash: string; filename: string | null; mimeType: string; extraction: string; sizeBytes?: number; senderAuthentication: string; channelDetection?: {mode: 'automatic' | 'specified'; channel: InboxChannel; reason?: string}; transcription: {mode: string; model: string | null}};
  reviewHistory: {decision: string; note: string; reviewer: string; createdAt: string}[];
};
export type InboxList = {items: InboxItem[]; total: number};
export const channelNames: Record<InboxChannel, string> = {invoice: 'Invoice', email: 'Email', voice: 'Voice', text: 'Text'};
export const statusNames: Record<InboxStatus, string> = {processing: 'Checking', quarantined: 'Blocked for review', needs_review: 'Needs your review', approved: 'Workflow approved', rejected: 'Rejected'};
export function classificationName(item: InboxItem) {return item.classification?.label || 'Unclassified';}
export function readable(value: string) {return value.replaceAll('_', ' ').replace(/^\w/, c => c.toUpperCase());}
