import {useQueries} from '@tanstack/react-query';
import {ArrowUpRight,AudioLines,Check,FileText,Layers,LoaderCircle,Mail,MessageSquare,ShieldAlert,X} from 'lucide-react';
import {request} from '../../app/api';
import {channelNames,type InboxItem} from '../inbox/types';

/** Follows every document of one upload through the workflow, live, until each has an outcome. */
const icons={invoice:FileText,email:Mail,voice:AudioLines,text:MessageSquare};
const steps=[['receive','Received'],['classification','Classified'],['security','Security'],['client_finance','Finance'],['policy','Policy'],['final_audit','Final audit']] as const;
type StepState='done'|'running'|'held'|'skipped'|'waiting';
const clean=(text:string)=>text.replace(/0x[a-fA-F0-9]{8,64}/g,'[reference]');

function stepState(item:InboxItem|undefined,id:string):StepState{
 if(!item)return id==='receive'?'running':'waiting';
 if(id==='receive')return 'done';
 const stage=item.stages.find(s=>s.id===id);
 if(!stage||stage.status==='pending')return 'waiting';
 if(stage.status==='running')return 'running';
 if(stage.status==='passed')return 'done';
 if(stage.status==='not_applicable')return 'skipped';
 return 'held';
}
function outcome(item:InboxItem|undefined):{label:string;tone:string}{
 if(!item||item.status==='processing')return {label:'Checking…',tone:'running'};
 if(item.status==='quarantined')return {label:'Quarantined',tone:'amber'};
 if(item.status==='needs_review')return {label:'Needs review',tone:'blue'};
 if(item.status==='rejected')return {label:'Rejected',tone:'grey'};
 const p=item.payment;
 if(p?.settlementStatus==='SETTLED')return {label:'Paid · verified',tone:'paid'};
 if(p&&['PREPARING','PREPARED','SUBMITTED','PENDING'].includes(p.executionStatus))return {label:'Payment pending',tone:'green'};
 if(item.linkedCaseId)return {label:'Ready to approve & pay',tone:'green'};
 return {label:'Cleared',tone:'green'};
}

export default function BatchTracker({ids,onOpen,onDismiss}:{ids:string[];onOpen:(id:string)=>void;onDismiss:()=>void}){
 const queries=useQueries({queries:ids.map(id=>({queryKey:['inbox-item',id],queryFn:()=>request<InboxItem>(`/inbox/${encodeURIComponent(id)}`),refetchInterval:(q:{state:{data?:InboxItem}})=>q.state.data&&q.state.data.status!=='processing'?false:1200}))});
 const items=queries.map(q=>q.data);
 const finished=items.filter(i=>i&&i.status!=='processing').length;
 const counts={cleared:items.filter(i=>i?.status==='approved').length,review:items.filter(i=>i?.status==='needs_review').length,quarantined:items.filter(i=>i?.status==='quarantined').length};
 const percent=ids.length?Math.round(finished/ids.length*100):0,complete=finished===ids.length;
 return <section className="wf-batch" aria-label="Upload batch progress" data-testid="batch-tracker">
  <div className="wf-batch-head">
   <span className="wf-batch-icon">{complete?<Check size={20}/>:<Layers size={20}/>}</span>
   <div><span className="wf-eyebrow">{complete?'BATCH CHECKED':'BATCH IN PROGRESS'}</span><h2>{complete?`All ${ids.length} documents checked`:`Checking ${ids.length} documents`}</h2><p role="status" aria-live="polite">{finished} of {ids.length} decided · {counts.cleared} cleared · {counts.review} need review · {counts.quarantined} quarantined</p></div>
   <button className="wf-batch-dismiss" aria-label="Dismiss batch tracker" onClick={onDismiss}><X size={16}/></button>
  </div>
  <div className="wf-batch-progress" role="progressbar" aria-label="Batch progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}><span style={{width:`${percent}%`}}/></div>
  <div className="wf-batch-legend" aria-hidden="true">{steps.map(([id,label])=><span key={id}>{label}</span>)}<span>Outcome</span></div>
  <ol className="wf-batch-list">{ids.map((id,index)=>{const item=items[index],Icon=item?icons[item.channel]:FileText,result=outcome(item),failed=queries[index]?.isError;
   return <li key={id}><button className="wf-batch-row" onClick={()=>onOpen(id)} aria-label={`Open ${item?clean(item.title):'document'}: ${result.label}`}>
    <span className={`wf-batch-doc ${item?`is-${item.channel}`:''}`}><Icon size={17}/></span>
    <span className="wf-batch-name"><strong>{item?clean(item.title):'Loading…'}</strong><small>{item?`${channelNames[item.channel]}${item.source.channelDetection?.mode==='automatic'?' · detected automatically':''}`:failed?'Could not load':'Registering…'}</small></span>
    <span className="wf-batch-steps" aria-hidden="true">{steps.map(([stepId,label])=>{const s=stepState(item,stepId);return <span key={stepId} className={`wf-step is-${s}`} title={`${label}: ${s}`}>{s==='done'?<Check size={12}/>:s==='held'?<ShieldAlert size={12}/>:s==='running'?<LoaderCircle size={12} className="wf-step-spin"/>:null}</span>;})}</span>
    <span className={`wf-batch-outcome is-${result.tone}`}>{result.tone==='running'&&<LoaderCircle size={13} className="wf-step-spin"/>}{result.label}</span>
    <ArrowUpRight size={16} className="wf-batch-open"/>
   </button></li>;})}</ol>
 </section>;
}
