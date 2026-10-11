import {useQuery} from '@tanstack/react-query';
import {AlertTriangle,Check,ChevronDown,LoaderCircle,RefreshCw,ShieldCheck} from 'lucide-react';
import type {AgentGuardProjection} from '../../../../api/src/agentguard/types';
import {request} from '../../app/api';
import IncidentDraft from './IncidentDraft';
import './authority-summary.css';

const authorityNames={HUMAN_WALLET:'Human wallet approval',EXACT_REGISTERED_POLICY:'Exact registered policy',NONE:'No payment workflow'};
const sourceNames={EXTERNAL_DOCUMENT:'Imported document',EXTERNAL_MESSAGE:'Imported message',EXTERNAL_TRANSCRIPT:'Imported transcript',UNKNOWN:'Source not recorded'};
const paymentNames={VERIFIED:'Payment receipt verified',UNRESOLVED:'Payment needs investigation',NOT_RECORDED:'No verified payment recorded',NOT_APPLICABLE:'No linked payment workflow'};
function recordedAt(value:string|null){if(!value)return 'Observation time not recorded';const date=new Date(value);return Number.isFinite(date.getTime())?date.toLocaleString():'Observation time not recorded';}

/** Explains recorded authority; this component cannot sign, pay, pause or release a hold. */
export default function AuthoritySummary({itemId,caseId}:{itemId?:string|null;caseId?:string|null}){
 const kind=itemId?'inbox':'cases',id=itemId||caseId;
 const query=useQuery({queryKey:['agentguard-authority',kind,id],queryFn:()=>request<AgentGuardProjection>(`/agentguard/${kind}/${encodeURIComponent(id!)}`),enabled:!!id,refetchInterval:15000,retry:false});
 const data=query.data;
 if(!id)return null;
 return <section className="wf-authority" aria-labelledby="authority-heading" data-testid="authority-summary" aria-busy={query.isFetching}>
  <div className="wf-authority-heading"><span className="wf-authority-icon"><ShieldCheck size={21}/></span><div><h2 id="authority-heading">Payment authority</h2><p>{data?.authority.summary||'How payment permission is recorded for this item.'}</p></div></div>
  {query.isPending&&<p className="wf-authority-busy" role="status"><LoaderCircle className="wf-authority-spin" size={16}/>Checking recorded authority…</p>}
  {query.isError&&<div className="wf-authority-error" role="alert"><AlertTriangle size={17}/><p>{data?'The latest authority check is unavailable. Details below are from the last recorded response.':'Payment authority could not be loaded. No permission or payment outcome has been inferred.'}</p><button className="wf-authority-refresh" onClick={()=>void query.refetch()} disabled={query.isFetching}><RefreshCw size={13}/>Retry authority check</button></div>}
  {data&&<>
   <dl className="wf-authority-facts"><div><dt>Source</dt><dd><strong>{sourceNames[data.provenance.sourceKind]}</strong><small>Sender and instruction origin are not verified.</small></dd></div><div><dt>Payment permission</dt><dd><strong>{authorityNames[data.authority.model]}</strong><small>Agents cannot grant payment permission.</small></dd></div><div><dt>Payment outcome</dt><dd><strong>{paymentNames[data.payment.status]}</strong><small>{data.payment.summary}</small></dd></div></dl>
   {data.decision.hold&&<div className="wf-authority-error"><AlertTriangle size={17}/><p><strong>Recorded hold: </strong>{data.decision.hold}</p></div>}
   <details><summary>Policy and evidence details<ChevronDown size={16}/></summary><div className="wf-authority-details">
    <p className="wf-authority-note"><strong>Current vault controls.</strong> {data.authority.enforcement==='CONTRACT_PAYMENT_TERMS'?'Payment terms are enforced by the existing payment contract.':'This source has no payment workflow.'} The proposed AgentGuard extension is not deployed.</p>
    <dl className="wf-authority-limits"><div><dt>Delegated agent authority</dt><dd>Not implemented</dd></div><div><dt>Daily budget / frequency limit</dt><dd>Not available in the current vault</dd></div><div><dt>Global circuit breaker</dt><dd>Not implemented</dd></div><div><dt>Source-origin attestation</dt><dd>Not recorded</dd></div></dl>
    <h3>Recorded checks</h3><p>{data.decision.checksCurrent===false?'These checks are not current for the selected source.':data.decision.checksCurrent===null?'Current check coverage is not recorded.':'These checks describe the recorded source review.'}</p>
    {data.decision.checks.length>0&&<ul className="wf-authority-rules">{data.decision.checks.map((check,index)=><li className={check.passed?'':'is-held'} key={`${check.code}-${index}`}>{check.passed?<Check size={15}/>:<AlertTriangle size={15}/>}<span>{check.summary}</span></li>)}</ul>}
    <p className="wf-authority-footnote">{data.provenance.summary}</p><p className="wf-authority-footnote">{data.evidence.summary}</p>
    {data.payment.observedAt&&<p className="wf-authority-footnote">Payment observation: {recordedAt(data.payment.observedAt)}{data.payment.blockNumber?` · block ${data.payment.blockNumber}`:''}.</p>}
    <p className="wf-authority-footnote">Review priority supports triage; it does not authorize a payment.</p>
   </div></details>
   {itemId&&data.incident.relevant&&data.incident.draftEligible&&<IncidentDraft itemId={itemId} expectedVersion={data.subject.version} reason={data.incident.reason} onRefresh={async()=>{const refreshed=await query.refetch({throwOnError:true});if(!refreshed.data)throw new Error('Recorded findings are unavailable. Please try again.');return refreshed.data.subject.version;}}/>}
  </>}
 </section>;
}
