import {useRef,useState,type MouseEvent} from 'react';
import {useQuery} from '@tanstack/react-query';
import {AlertCircle,ArrowUpRight,CheckCircle2,ChevronDown,Download,FileCheck2,FileText,FileUp,LoaderCircle,RefreshCw,Search,ShieldCheck} from 'lucide-react';
import type {verifyApprovalRequest} from '@secure-finance/evidence';
import type {CaseDTO} from '../../app/types';
import {amount,download,request} from '../../app/api';
import {Badge,Button,Empty} from '../../components/ui';
import {channelNames,statusNames,type InboxList} from '../inbox/types';
import {downloadPdfReport} from './report-download';
import './evidence.css';

type Coverage=Awaited<ReturnType<typeof verifyApprovalRequest>>['coverage'];
type VerificationResult={
  fileName:string;
  kind:'bundle'|'request';
  integrity:'VALID'|'INCOMPLETE'|'INVALID';
  signature:'VALID'|'INVALID'|'MISSING'|'REQUEST_ONLY'|'NOT_CHECKED';
  coverage:Coverage;
  errors:string[];
  details:unknown;
};
const emptyCoverage=():Coverage=>({included:[],missing:[],redacted:[],unsupported:[]});
function recordedDate(value?:string){const date=value?new Date(value):null;return date&&!Number.isNaN(date.getTime())?new Intl.DateTimeFormat('en',{dateStyle:'medium'}).format(date):'Date not recorded';}
function issueSummary(error:string){
  if(error.startsWith('MISSING_ARTIFACT:'))return 'A document listed in the evidence inventory is missing.';
  if(error.includes('HASH_MISMATCH')||error.includes('CHECKSUM_MISMATCH')||error.includes('ARCHIVE_ARTIFACT_MISMATCH'))return 'A file is missing or its contents differ from the recorded checksum.';
  if(error.includes('PAYMENT_MANIFEST_MISMATCH')||error.includes('PAYMENT_COPY_MISMATCH'))return 'The payment terms differ between records in this package.';
  if(error.includes('MANIFEST_COPY_MISMATCH'))return 'The package contains inconsistent copies of its evidence manifest.';
  if(error.includes('TYPED_DIGEST_MISMATCH'))return 'The recorded signing digest does not match the payment request.';
  if(error.includes('UNINVENTORIED')||error.includes('UNINDEXED')||error.includes('DUPLICATE'))return 'The package inventory contains unexpected or duplicate entries.';
  if(error==='Package exceeds the 32 MiB limit')return error;
  return 'The package format or contents could not be validated. Technical details are available below.';
}

function VerificationReport({result}:{result:VerificationResult}){
  const passed=result.integrity==='VALID';
  const heading=passed?'Integrity checks passed':result.integrity==='INCOMPLETE'?'Evidence package is incomplete':'Integrity checks failed';
  const issues=[...new Set(result.errors.map(issueSummary))];
  const signature=result.signature==='VALID'
    ?{title:'Matches this request',copy:'The signature matches the supplied payment request and claimed signer. This does not establish permission to approve.',tone:'pass'}
    :result.signature==='INVALID'
      ?{title:'Signature check failed',copy:'The signature could not be validated against this request and its claimed signer.',tone:'fail'}
      :result.signature==='REQUEST_ONLY'
        ?{title:'Unsigned approval request',copy:'Approval request JSON does not include a signature. No signature was checked.',tone:'neutral'}
        :result.signature==='NOT_CHECKED'
          ?{title:'Not checked',copy:'The package could not be read safely enough to check a signature.',tone:'neutral'}
          :{title:'No signature included',copy:'The bundle has no payment signature to check. Integrity alone does not authorize a payment.',tone:'neutral'};
  return <section className="evidence-report" aria-label="Verification result" aria-live="polite">
    <div className={`evidence-outcome ${passed?'pass':'fail'}`}>
      <span className="evidence-outcome-icon">{passed?<CheckCircle2 size={26}/>:<AlertCircle size={26}/>}</span>
      <div><p className="evidence-kicker">OFFLINE INTEGRITY RESULT</p><h3>{heading}</h3><p className="evidence-file-name">{result.fileName}</p></div>
    </div>
    <p className="evidence-outcome-copy">{passed
      ?result.kind==='bundle'
        ?'Included artifact bytes, manifest commitments, payment terms and archive checksums are internally consistent.'
        :'Included artifact bytes, the manifest commitment, payment terms and signing digest are internally consistent.'
      :'Do not rely on this package as intact evidence. Obtain a complete, unchanged export and check it again.'}</p>
    {issues.length>0&&<ul className="evidence-issues">{issues.map(issue=><li key={issue}>{issue}</li>)}</ul>}
    <div className="evidence-check-grid">
      <article className={`evidence-check ${signature.tone}`}><span>Signature correspondence</span><h4>{signature.title}</h4><p>{signature.copy}</p></article>
      <article className="evidence-check"><span>Signer authority</span><h4>Not checked</h4><p>No independently trusted deployment configuration was supplied. A bundled configuration does not establish authority.</p></article>
      <article className="evidence-check"><span>Blockchain settlement</span><h4>Not checked offline</h4><p>No blockchain RPC was contacted. Saved receipts do not prove that a payment settled.</p></article>
    </div>
    <div className="evidence-coverage"><h4>Artifact coverage</h4><dl>
      <div><dt>Included</dt><dd>{result.coverage.included.length}</dd></div>
      <div><dt>Missing</dt><dd>{result.coverage.missing.length}</dd></div>
      <div><dt>Redacted</dt><dd>{result.coverage.redacted.length}</dd></div>
      <div><dt>Unsupported</dt><dd>{result.coverage.unsupported.length}</dd></div>
    </dl><p>Counts describe the verifier’s reported inventory. Included files are not necessarily valid when integrity checks fail.</p></div>
    <div className="evidence-coverage-note"><ShieldCheck size={19}/><p>Business facts remain application reported. Only manifest artifacts are bound by a matching payment signature; later export checksums are not signatures. These checks do not establish real-world invoice accuracy, current approval eligibility or settlement.</p></div>
    <details className="evidence-details"><summary>Technical verification details</summary><pre className="verification-result">{JSON.stringify(result.details,null,2)}</pre></details>
  </section>;
}

export default function EvidenceVerifier({cases,onNotice,authenticated,navigate}:{cases:CaseDTO[];onNotice:(s:string)=>void;authenticated:boolean;navigate?:(path:string)=>void}){
  const [result,setResult]=useState<VerificationResult>();
  const [busy,setBusy]=useState(false);
  const [filter,setFilter]=useState<'all'|'sources'|'payments'>('all');
  const [search,setSearch]=useState('');
  const [downloading,setDownloading]=useState<string|null>(null);
  const [downloadError,setDownloadError]=useState<{message:string;path:string;filename:string;id:string}|null>(null);
  const [downloadMessage,setDownloadMessage]=useState('');
  const downloadLock=useRef(false);
  const sources=useQuery({queryKey:['inbox'],queryFn:()=>request<InboxList>('/inbox?limit=100'),enabled:authenticated,refetchInterval:15000,retry:1});
  const caseHistory=useQuery({queryKey:['cases'],queryFn:()=>request<{cases:CaseDTO[]}>('/cases'),enabled:authenticated,refetchInterval:15000,retry:1});
  const verifying=useRef(false);
  const savedCases=caseHistory.data?.cases||cases;
  const query=search.trim().toLowerCase();
  const sourceRows=(sources.data?.items||[]).filter(item=>`${item.title} ${item.sender} ${channelNames[item.channel]}`.toLowerCase().includes(query));
  const caseRows=savedCases.filter(item=>`${item.invoiceReference} ${item.supplierName}`.toLowerCase().includes(query));
  const openReview=(event:MouseEvent<HTMLAnchorElement>,path:string)=>{if(navigate&&!event.metaKey&&!event.ctrlKey&&!event.shiftKey&&!event.altKey){event.preventDefault();navigate(path);}};
  async function exportPdf(id:string,path:string,filename:string){
    if(downloadLock.current)return;
    downloadLock.current=true;setDownloading(id);setDownloadError(null);setDownloadMessage('');
    try{await downloadPdfReport(path,filename);setDownloadMessage('Your PDF download has started.');}
    catch(error){setDownloadError({id,path,filename,message:error instanceof Error?error.message:'The PDF could not be downloaded. Please try again.'});}
    finally{downloadLock.current=false;setDownloading(null);}
  }
  function paymentState(item:CaseDTO){const payment=item.automationPayment||item;return payment.settlementStatus==='SETTLED'?{label:'Payment verified',tone:'green'}:payment.executionStatus==='UNKNOWN'?{label:'Payment outcome unknown',tone:'amber'}:['HELD','INCONSISTENT','REVERTED'].includes(payment.executionStatus)||item.workflowStatus==='HELD'?{label:'Needs attention',tone:'amber'}:item.authorizationStatus==='VALID'?{label:'Approval verified',tone:'neutral'}:{label:'No verified payment',tone:'neutral'};}
  async function verify(file:File){
    if(verifying.current)return;
    verifying.current=true;setBusy(true);setResult(undefined);
    const kind=file.name.toLowerCase().endsWith('.zip')?'bundle':'request';
    try{
      if(file.size>32*1024*1024){onNotice('Package exceeds the 32 MiB limit');throw new Error('Package exceeds the 32 MiB limit');}
      const pkg=await import('@secure-finance/evidence');
      if(kind==='bundle'){
        const findings=await pkg.verifyBundle(new Uint8Array(await file.arrayBuffer()));
        const {packet,...publicFindings}=findings;
        setResult({fileName:file.name,kind,integrity:findings.artifactIntegrity==='VALID'?'VALID':findings.artifactIntegrity==='INCOMPLETE'?'INCOMPLETE':'INVALID',signature:!packet?'NOT_CHECKED':findings.signatureCorrespondence==='VALID'?'VALID':findings.signatureCorrespondence==='INVALID'?'INVALID':'MISSING',coverage:findings.coverage,errors:findings.errors,details:publicFindings});
      }else{
        const findings=await pkg.verifyApprovalRequest(JSON.parse(await file.text()));
        const {packet:_,...publicFindings}=findings;
        setResult({fileName:file.name,kind,integrity:findings.integrityValid?'VALID':findings.coverage.missing.length?'INCOMPLETE':'INVALID',signature:findings.packet?'REQUEST_ONLY':'NOT_CHECKED',coverage:findings.coverage,errors:findings.errors,details:publicFindings});
      }
    }catch(error){
      const message=error instanceof Error?error.message:String(error);
      setResult({fileName:file.name,kind,integrity:'INVALID',signature:'NOT_CHECKED',coverage:emptyCoverage(),errors:[message],details:{integrity:'INVALID',message}});
    }finally{verifying.current=false;setBusy(false);}
  }
  return <div className="page-content evidence-page reports-page">
    <div className="page-title"><div><h1>History &amp; reports</h1><p>Open a saved review or download its PDF.</p></div></div>
    {!authenticated?<section className="panel reports-empty"><Empty icon={<FileCheck2/>} title="Your reports belong to your workspace">Sign in to find your saved reviews and payment reports.</Empty><a className="button" href="/" onClick={event=>openReview(event,'/')}>Go to inbox<ArrowUpRight size={15}/></a></section>:<section className="panel reports-library" aria-label="Saved reports">
      <div className="reports-toolbar"><div className="reports-tabs" aria-label="Filter reports">{([['all','All reports'],['sources','Inbox reviews'],['payments','Payments']] as const).map(([id,title])=><button key={id} aria-pressed={filter===id} className={filter===id?'active':''} onClick={()=>setFilter(id)}>{title}</button>)}</div><label className="reports-search"><Search size={16}/><input aria-label="Find a report" placeholder="Find a message, invoice or supplier" value={search} onChange={event=>setSearch(event.target.value)}/></label></div>
      {downloadError&&<div className="reports-feedback error" role="alert"><AlertCircle size={18}/><span><strong>We couldn’t download this report.</strong>{downloadError.message}</span><Button onClick={()=>void exportPdf(downloadError.id,downloadError.path,downloadError.filename)} disabled={!!downloading}>Try again<RefreshCw size={14}/></Button></div>}
      {downloadMessage&&<div className="reports-feedback success" role="status"><CheckCircle2 size={18}/><span>{downloadMessage}</span></div>}
      {filter!=='payments'&&<section className="reports-section" aria-labelledby="source-reports-heading"><div className="reports-section-heading"><div><h2 id="source-reports-heading">Inbox review reports</h2></div>{sources.data&&<span>{sourceRows.length} shown</span>}</div>
        {sources.isLoading?<div className="reports-loading" role="status"><LoaderCircle className="spin" size={21}/>Loading your review history…</div>:sources.isError?<div className="reports-feedback error" role="alert"><AlertCircle size={18}/><span>We couldn’t load inbox reports. Your saved records have not changed.</span><Button onClick={()=>void sources.refetch()} busy={sources.isFetching}>Try again<RefreshCw size={14}/></Button></div>:sourceRows.length?<div className="reports-list">{sourceRows.map(item=>{const key=`source-${item.id}`,status=item.status==='approved'?'green':['quarantined','needs_review'].includes(item.status)?'amber':item.status==='rejected'?'red':'neutral';return <article className="report-row" key={item.id}><span className="report-kind-icon"><FileText size={21}/></span><div className="report-description"><span className="report-kind">{channelNames[item.channel]} review</span><h3><a href={`/inbox/${item.id}`} onClick={event=>openReview(event,`/inbox/${item.id}`)}>{item.title}</a></h3><p>{item.sender||'Imported source'}<span>·</span>{recordedDate(item.createdAt)}</p><Badge tone={status}>{statusNames[item.status]}</Badge>{item.payment?.settlementStatus==='SETTLED'&&<Badge tone="green">Payment verified</Badge>}</div><div className="report-actions"><a href={`/inbox/${item.id}`} onClick={event=>openReview(event,`/inbox/${item.id}`)}>Read review<ArrowUpRight size={14}/></a><Button className="primary" busy={downloading===key} disabled={!!downloading} onClick={()=>void exportPdf(key,`/inbox/${item.id}/report.pdf`,`review-report-${item.title}.pdf`)}>{downloading===key?'Preparing PDF…':<><Download size={15}/>Download PDF</>}</Button></div></article>;})}</div>:<Empty icon={<FileText/>} title={query?'No matching inbox reports':'Your review history starts here'}>{query?'Try another subject or supplier name.':'A report will be available after you add a source to your inbox.'}</Empty>}
        {sources.data&&sources.data.total>sources.data.items.length&&<p className="reports-page-note">Showing the latest {sources.data.items.length} of {sources.data.total} inbox reviews. Older sources still have a report available from their review page.</p>}
      </section>}
      {filter!=='sources'&&<section className="reports-section" aria-labelledby="payment-reports-heading"><div className="reports-section-heading"><div><h2 id="payment-reports-heading">Payment reports</h2></div><span>{caseHistory.isLoading?'Loading…':caseHistory.isError?'Unavailable':`${caseRows.length} shown`}</span></div>{caseHistory.isLoading&&!cases.length?<div className="reports-loading" role="status"><LoaderCircle className="spin" size={21}/>Loading your payment history…</div>:caseHistory.isError?<div className="reports-feedback error" role="alert"><AlertCircle size={18}/><span>We couldn’t load payment reports. Your saved records have not changed.</span><Button onClick={()=>void caseHistory.refetch()} busy={caseHistory.isFetching}>Try again<RefreshCw size={14}/></Button></div>:caseRows.length?<div className="reports-list">{caseRows.map(item=>{const key=`case-${item.id}`,status=paymentState(item);return <article className="report-row" key={item.id}><span className="report-kind-icon payment"><FileCheck2 size={21}/></span><div className="report-description"><span className="report-kind">Payment review</span><h3><a href={`/cases/${item.id}`} onClick={event=>openReview(event,`/cases/${item.id}`)}>{item.invoiceReference}</a></h3><p>{item.supplierName}<span>·</span>{amount(item.amountAtomic)} DEMO</p><Badge tone={status.tone}>{status.label}</Badge></div><div className="report-actions"><a href={`/cases/${item.id}`} onClick={event=>openReview(event,`/cases/${item.id}`)}>Read review<ArrowUpRight size={14}/></a><Button className="primary" busy={downloading===key} disabled={!!downloading} onClick={()=>void exportPdf(key,`/cases/${item.id}/report.pdf`,`payment-report-${item.invoiceReference}.pdf`)}>{downloading===key?'Preparing PDF…':<><Download size={15}/>Download PDF</>}</Button></div></article>;})}</div>:<Empty icon={<FileCheck2/>} title={query?'No matching payment reports':'No payment reviews yet'}>{query?'Try another invoice reference or supplier name.':'Payment reports appear when an invoice has a saved case. An approved message alone does not mean a payment occurred.'}</Empty>}</section>}
    </section>}
    <details className="reports-advanced"><summary><span><ShieldCheck size={19}/><strong>Advanced verification</strong></span><span>Original files and independent checks<ChevronDown size={17}/></span></summary><div className="reports-advanced-content">
      <section className="panel evidence-bundles"><h2><FileCheck2 size={21}/> Original evidence packages</h2><p className="reports-page-note">These technical exports support independent verification. For an everyday record, use the PDF reports above.</p>{savedCases.some(item=>item.latestProposal)?<div className="evidence-list">{savedCases.filter(item=>item.latestProposal).map(item=><div key={item.id}><div><strong>{item.invoiceReference}</strong><p>{item.supplierName}</p></div><Button busy={downloading===`bundle-${item.id}`} disabled={!!downloading} onClick={()=>{if(downloadLock.current)return;downloadLock.current=true;setDownloading(`bundle-${item.id}`);void download(`/cases/${item.id}/evidence`,`evidence-${item.invoiceReference}.zip`).then(()=>onNotice('Evidence package download started.')).catch(error=>onNotice(error instanceof Error?error.message:'The evidence package could not be downloaded.')).finally(()=>{downloadLock.current=false;setDownloading(null);});}}><Download size={15}/>Download evidence ZIP</Button></div>)}</div>:<Empty icon={<FileCheck2/>} title="No frozen evidence packages">A payment request freezes the source, checked records and agent artifacts into a committed manifest.</Empty>}</section>
      <section className="panel verifier-panel" aria-busy={busy}>
        <h2>Verify a downloaded package</h2><p>Integrity and signature correspondence have separate coverage. An offline receipt is not proof of settlement.</p>
        <label className={`file-drop evidence-upload ${busy?'busy':''}`}><span className="evidence-upload-icon"><FileUp size={25}/></span><strong>{busy?'Verifying package…':'Choose an evidence ZIP or approval request JSON'}</strong><span>Original bytes remain on your device · up to 32 MiB</span><input type="file" aria-label="Choose an evidence ZIP or approval request JSON" accept=".json,.zip" disabled={busy} onChange={event=>{const file=event.target.files?.[0];event.target.value='';if(file)void verify(file)}}/></label>
        {result&&<VerificationReport result={result}/>}
        <details className="evidence-details evidence-online"><summary>Verify settlement with the command line</summary><p>Online verification is a separate step. Use an independently trusted deployment manifest and an available RPC connection to check chain state, the transaction and its settlement evidence.</p><code className="command">pnpm evidence:verify -- &lt;bundle&gt; --online --deployment &lt;trusted-manifest&gt;</code><p>This browser check does not run that command or contact the blockchain.</p></details>
      </section>
    </div></details>
  </div>;
}
