import {paymentPresentation,type PaymentStateInput} from '../app/payment-presentation';
export type StationId='intake'|'finance'|'approval'|'vault'|'evidence'|'supplier'|'exception';
export type SceneState={station:StationId;status:string;tone:'blue'|'amber'|'red'|'green'|'neutral';route:string|null;working:boolean;authorized:boolean;settled:boolean};
export function deriveSceneState(c:PaymentStateInput):SceneState{
 const base={working:false,authorized:false,settled:false};
 const payment=paymentPresentation(c);
 if(payment.settled)return {...base,station:'supplier',status:'Verified settlement',tone:'green',route:'delivery',settled:true};
 if(payment.executionStatus==='INCONSISTENT')return {...base,station:'vault',status:'Investigation required',tone:'red',route:'to-vault'};
 if(payment.executionStatus==='UNKNOWN')return {...base,station:'vault',status:'Payment outcome unknown',tone:'neutral',route:'to-vault'};
 if(['PREPARING','PREPARED','SUBMITTED','PENDING'].includes(payment.executionStatus))return {...base,station:'vault',status:'Execution pending',tone:'amber',route:'to-vault',working:true,authorized:payment.authorized};
 if(payment.automatic&&payment.executionStatus==='HELD')return {...base,station:'exception',status:'Automatic payment held',tone:'red',route:'to-vault'};
 if(!payment.automatic&&c.authorizationStatus==='CANCELLATION_PENDING')return {...base,station:'approval',status:'Cancellation pending',tone:'amber',route:'to-review'};
 if(!payment.automatic&&(c.authorizationStatus==='CANCELLED'||c.authorizationStatus==='EXPIRED'))return {...base,station:'approval',status:c.authorizationStatus==='CANCELLED'?'Authorization cancelled':'Authorization expired',tone:'neutral',route:'to-review'};
 if(c.workflowStatus==='HELD'||c.workflowStatus==='NEEDS_INFORMATION')return {...base,station:'exception',status:c.workflowStatus==='HELD'?'Business hold':'Needs information',tone:'red',route:'to-review'};
 if(payment.executionStatus==='REVERTED')return {...base,station:'vault',status:'Attempt reverted',tone:'red',route:'to-vault'};
 if(payment.automatic&&c.workflowStatus==='READY_FOR_REVIEW')return {...base,station:'finance',status:'Registered policy · final checks',tone:'blue',route:'to-finance',authorized:payment.authorized};
 if(!payment.automatic&&c.authorizationStatus==='VALID')return {...base,station:'vault',status:'Signed · awaiting execution',tone:'blue',route:'to-vault',authorized:true};
 if(c.workflowStatus==='READY_FOR_REVIEW'||c.authorizationStatus==='AWAITING_SIGNATURE')return {...base,station:'approval',status:'Awaiting human review',tone:'amber',route:'to-review'};
 if(c.workflowStatus==='CHECKING')return {...base,station:'finance',status:'Checking trusted records',tone:'blue',route:'to-finance',working:true};
 return {...base,station:'intake',status:c.workflowStatus==='EXTRACTING'?'Extracting invoice':'Received',tone:'blue',route:'to-finance',working:c.workflowStatus==='EXTRACTING'};
}
