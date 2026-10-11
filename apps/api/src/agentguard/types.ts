/** Reading projections only: none of these fields grant or revoke authority. */
export type AgentGuardProjection = {
 schemaVersion:'secure-finance.agentguard-projection.v1'; generatedAt:string;
 subject:{kind:'case'|'inbox';id:string;title:string;version:number};
 authority:{model:'HUMAN_WALLET'|'EXACT_REGISTERED_POLICY'|'NONE';enforcement:'CONTRACT_PAYMENT_TERMS'|'NO_PAYMENT_WORKFLOW';status:string;summary:string;delegation:'NOT_IMPLEMENTED';dailyBudget:null;frequencyLimit:null;globalCircuit:'NOT_IMPLEMENTED';agentCanAuthorize:false};
 provenance:{sourceKind:'EXTERNAL_DOCUMENT'|'EXTERNAL_MESSAGE'|'EXTERNAL_TRANSCRIPT'|'UNKNOWN';channel:string|null;sourceHash:string|null;textHash:string|null;senderAuthenticated:false;originAttested:false;transport:'NOT_RECORDED';summary:string;stages:{id:string;status:string;mode:string|null;completedAt:string|null;sourceHash:string|null}[]};
 decision:{status:string;hold:string|null;checksCurrent:boolean|null;checks:{code:string;passed:boolean;severity:string;summary:string}[];workflowOnly:true};
 priority:{level:'HIGH'|'MEDIUM'|'LOW'|'UNASSESSED';score:number|null;reasons:string[];policyVersion:'agentguard-priority.v1';purpose:'REVIEW_ORDER_ONLY'};
 payment:{status:'VERIFIED'|'UNRESOLVED'|'NOT_RECORDED'|'NOT_APPLICABLE';executionStatus:string;observedAt:string|null;blockNumber:string|null;summary:string};
 evidence:{scope:string;anchoring:'PAYMENT_RECEIPT_RECORDED'|'NOT_RECORDED';summary:string};
 incident:{relevant:boolean;reason:string;draftEligible:boolean};
 limitations:string[];
};

export type AgentGuardIncidents = {
 schemaVersion:'secure-finance.agentguard-incidents.v1';generatedAt:string;scope:'APPLICATION_OBSERVATIONS_ONLY';
 items:{id:string;title:string;status:string;detectedAt:string;latestRecordedAt:string;riskCodes:string[];priority:AgentGuardProjection['priority'];draftEligible:true}[];
 total:number;limit:number;offset:number;
 circuitSignals:{code:'REPEATED_SECURITY_HOLDS';count:number;windowStart:string;windowEnd:string;scope:'TENANT_INBOX';state:'PROPOSED_REVIEW_SIGNAL';summary:string}[];
 circuit:{enforcement:'APPLICATION_ONLY';contractPause:'NOT_IMPLEMENTED';actionTaken:'NONE_BY_THIS_PROJECTION'};
 limitations:string[];
};
