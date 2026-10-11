/** Tenant-scoped recorded facts. All money uses exact atomic decimal strings. */
export type DashboardDTO = {
  schemaVersion:'finance-dashboard.v1';
  generatedAt:string;
  window:{days:7|30|90;from:string;to:string;timeZone:'UTC'};
  workspace:{name:string;environment:'local'|'fuji';dataEnvironment:'synthetic';accountRoles:string[]};
  token:{symbol:'DEMO';decimals:6};
  totals:{registeredPayablesCount:number;registeredPayablesAtomic:string;verifiedPaidCount:number;verifiedPaidAtomic:string;unpaidRegisteredCount:number;unpaidRegisteredAtomic:string;inboxCount:number;needsReviewCount:number;securityHoldCount:number;unresolvedPaymentCount:number};
  daily:Array<{date:string;inboxCount:number;workflowApprovedCount:number;verifiedPaidCount:number;verifiedPaidAtomic:string}>;
  channels:Array<{channel:'invoice'|'email'|'voice'|'text';count:number}>;
  suppliers:Array<{supplierKey:string;name:string;payablesCount:number;registeredAtomic:string;verifiedPaidCount:number;verifiedPaidAtomic:string}>;
  recentActivity:Array<{id:string;kind:'source'|'payment';title:string;status:string;occurredAt:string;itemId?:string;caseId?:string}>;
  coverage:{financialsAvailable:boolean;basis:string;excludedUnverifiedCount:number;undatedSettlementsCount:number;limitations:string[]};
};
