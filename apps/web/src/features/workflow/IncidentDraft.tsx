import {useRef,useState,type FormEvent} from 'react';
import {AlertTriangle,ChevronDown,Download,LoaderCircle} from 'lucide-react';
import {doraImpactSchema,doraTimelineSchema} from '@secure-finance/shared';
import {ApiError,request} from '../../app/api';

const flags=[['criticalServicesAffected','Critical services affected'],['successfulMaliciousUnauthorizedAccessMayCauseDataLoss','Successful unauthorized access that may cause data loss']] as const;
const counts=[['affectedClients','Affected clients'],['clientPercent','Affected clients (%)'],['durationHours','Incident duration (hours)'],['criticalServiceDowntimeHours','Critical-service downtime (hours)'],['economicImpactEur','Economic impact (EUR)']] as const;
const extraCounts=[['financialCounterpartPercent','Affected financial counterparts (%)'],['transactionPercent','Affected transaction count (%)'],['transactionValuePercent','Affected transaction value (%)']] as const;
const extraFlags=[['relevantClientsAffected','Relevant clients or counterparts affected'],['reputationalImpact','Reputational impact'],['dataLossBusinessImpact','Data loss affecting business or regulatory duties']] as const;
const dates=[['detectedAt','Actual incident awareness'],['classifiedAt','Formal major-incident classification'],['initialSubmittedAt','Initial notification submitted'],['latestIntermediateSubmittedAt','Latest intermediate report submitted']] as const;
const countries=[['AT','Austria'],['BE','Belgium'],['BG','Bulgaria'],['HR','Croatia'],['CY','Cyprus'],['CZ','Czechia'],['DK','Denmark'],['EE','Estonia'],['FI','Finland'],['FR','France'],['DE','Germany'],['GR','Greece'],['HU','Hungary'],['IE','Ireland'],['IT','Italy'],['LV','Latvia'],['LT','Lithuania'],['LU','Luxembourg'],['MT','Malta'],['NL','Netherlands'],['PL','Poland'],['PT','Portugal'],['RO','Romania'],['SK','Slovakia'],['SI','Slovenia'],['ES','Spain'],['SE','Sweden']] as const;

export default function IncidentDraft({itemId,expectedVersion,reason,onRefresh}:{itemId:string;expectedVersion:number;reason:string;onRefresh:()=>Promise<number>}){
 const [values,setValues]=useState<Record<string,string>>({}),[geography,setGeography]=useState('unknown'),[states,setStates]=useState<string[]>([]),[notes,setNotes]=useState('');
 const [busy,setBusy]=useState(false),[feedback,setFeedback]=useState<{error:boolean;text:string}|null>(null),locked=useRef(false);
 const [draftVersion,setDraftVersion]=useState(expectedVersion),[conflict,setConflict]=useState(false),versionChanged=conflict||draftVersion!==expectedVersion;
 const set=(key:string,value:string)=>setValues(current=>({...current,[key]:value}));
 const flag=([key,title]:readonly[string,string])=><label key={key}>{title}<select aria-label={title} value={values[key]||''} onChange={event=>set(key,event.target.value)}><option value="">Unknown</option><option value="yes">Yes</option><option value="no">No</option></select></label>;
 const number=([key,title]:readonly[string,string])=><label key={key}>{title}<input type="number" min="0" max={['clientPercent','financialCounterpartPercent'].includes(key)?100:undefined} step={key==='affectedClients'?1:'any'} inputMode="decimal" placeholder="Unknown" value={values[key]||''} onChange={event=>set(key,event.target.value)}/></label>;
 async function prepare(event:FormEvent){
  event.preventDefault();if(locked.current||versionChanged)return;setFeedback(null);
  const raw:Record<string,unknown>={};
  for(const [key] of [...flags,...extraFlags])raw[key]=values[key]==='yes'?true:values[key]==='no'?false:null;
  for(const [key] of [...counts,...extraCounts])raw[key]=values[key]?.trim()?Number(values[key]):null;
  raw.affectedMemberStates=geography==='none'?[]:geography==='countries'?states:null;
  if(geography==='countries'&&!states.length){setFeedback({error:true,text:'Select at least one affected country, or choose Unknown.'});return;}
  const impact=doraImpactSchema.safeParse(raw),timeline=doraTimelineSchema.safeParse(Object.fromEntries(dates.map(([key])=>{const value=values[key],date=value?new Date(value):null;return [key,date?(Number.isFinite(date.getTime())?date.toISOString():'invalid'):null];})));
  if(!impact.success||!timeline.success){setFeedback({error:true,text:!impact.success?'Check the impact figures. Counts must be whole numbers, percentages must be in range, and values cannot be negative.':'Check the reporting dates. Classification and submissions cannot precede the earlier recorded event.'});return;}
  locked.current=true;setBusy(true);
  try{
   const pdf=await request<Blob>(`/agentguard/inbox/${encodeURIComponent(itemId)}/incident-draft`,{method:'POST',body:JSON.stringify({expectedVersion:draftVersion,impact:impact.data,timeline:timeline.data,notes:notes.trim()})});
   if(!(pdf instanceof Blob)||!pdf.type.toLowerCase().includes('application/pdf')||await pdf.slice(0,5).text()!=='%PDF-')throw new Error('The server did not return a readable PDF. Please try again.');
   const url=URL.createObjectURL(pdf),link=document.createElement('a');link.href=url;link.download=`incident-draft-${itemId.replace(/[^a-zA-Z0-9_-]/g,'-')}.pdf`;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
   setFeedback({error:false,text:'Your PDF draft is ready. It has not been filed, saved as an incident determination, or anchored on-chain.'});
  }catch(error){if(error instanceof ApiError&&error.code==='VERSION_CONFLICT')setConflict(true);setFeedback({error:true,text:error instanceof Error?error.message:'The incident draft could not be prepared. Please try again.'});}
  finally{locked.current=false;setBusy(false);}
 }
 async function refresh(){
  if(locked.current)return;locked.current=true;setBusy(true);
  try{const version=await onRefresh();setDraftVersion(version);setConflict(false);setValues({});setGeography('unknown');setStates([]);setNotes('');setFeedback({error:false,text:'Recorded findings refreshed. Review the current source and enter any confirmed impacts again.'});}
  catch(error){setFeedback({error:true,text:error instanceof Error?error.message:'The current findings could not be loaded. Your draft inputs have been retained.'});}
  finally{locked.current=false;setBusy(false);}
 }
 return <details className="wf-incident" data-testid="incident-draft"><summary><AlertTriangle size={16}/>Prepare an incident draft<ChevronDown size={16}/></summary><div className="wf-incident-intro"><p>{reason}</p><p className="wf-authority-footnote">Create a PDF for your compliance reviewer. A blocked request alone does not establish a major incident. Leave unconfirmed facts unknown.</p></div>
  <form onSubmit={event=>void prepare(event)}><fieldset disabled={busy}>
   <details><summary>Impact assessment <ChevronDown size={15}/></summary><div className="wf-incident-form">{flags.map(flag)}{counts.map(number)}<label>EU geographical impact<select aria-label="EU geographical impact" value={geography} onChange={event=>setGeography(event.target.value)}><option value="unknown">Unknown</option><option value="none">No EU member states affected</option><option value="countries">Choose affected member states</option></select></label>{geography==='countries'&&<label className="wf-incident-wide">EU member states meaningfully affected<select aria-label="EU member states meaningfully affected" multiple size={6} value={states} onChange={event=>setStates(Array.from(event.target.selectedOptions,option=>option.value))}>{countries.map(([code,name])=><option key={code} value={code}>{name} ({code})</option>)}</select><small>Choose all countries where meaningful impact is confirmed.</small></label>}</div><details><summary>Additional impact criteria<ChevronDown size={15}/></summary><div className="wf-incident-form">{extraCounts.map(number)}{extraFlags.map(flag)}</div></details></details>
   <details><summary>Reporting dates<ChevronDown size={15}/></summary><p className="wf-authority-footnote">Use actual awareness, formal classification and submission times in your local time zone. Source receipt and draft creation are not these events. Leave unknown dates blank.</p><div className="wf-incident-form">{dates.map(([key,title])=><label key={key}>{title}<input type="datetime-local" value={values[key]||''} onChange={event=>set(key,event.target.value)}/></label>)}</div></details>
   <details><summary>Reviewer notes<ChevronDown size={15}/></summary><div className="wf-incident-form"><label className="wf-incident-wide">Context for the compliance reviewer<textarea aria-label="Context for the compliance reviewer" rows={3} maxLength={2000} value={notes} onChange={event=>setNotes(event.target.value)} placeholder="Confirmed impact, response taken, or facts still to establish."/></label></div></details>
   {versionChanged&&<div className="wf-authority-error" role="alert"><AlertTriangle size={17}/><p>The source changed. Existing draft inputs belong to the earlier version; refresh the findings before preparing a new draft.</p><button type="button" onClick={()=>void refresh()} disabled={busy}>Refresh findings and clear draft</button></div>}
   <div className="wf-incident-actions"><button className="wf-incident-download" type="submit" disabled={busy||versionChanged}>{busy?<LoaderCircle className="wf-authority-spin" size={15}/>:<Download size={15}/>} {busy?'Preparing draft…':'Download incident draft PDF'}</button><small>Draft only · not filed · does not change payment controls</small></div>
  </fieldset>{feedback&&<p className={`wf-incident-feedback ${feedback.error?'error':''}`} role={feedback.error?'alert':'status'}>{feedback.text}</p>}</form>
 </details>;
}
