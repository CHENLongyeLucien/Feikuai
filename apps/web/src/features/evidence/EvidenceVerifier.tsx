import {useRef,useState} from 'react';
import {AlertCircle,CheckCircle2,Download,FileCheck2,FileUp,ShieldCheck} from 'lucide-react';
import type {verifyApprovalRequest} from '@secure-finance/evidence';
import type {CaseDTO} from '../../app/types';
import {download} from '../../app/api';
import {Badge,Button,Empty} from '../../components/ui';
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

export default function EvidenceVerifier({cases,onNotice}:{cases:CaseDTO[];onNotice:(s:string)=>void}){
  const [result,setResult]=useState<VerificationResult>();
  const [busy,setBusy]=useState(false);
  const verifying=useRef(false);
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
  return <div className="page-content evidence-page">
    <div className="page-title"><div><div className="eyebrow">A RECORD YOU CAN INSPECT</div><h1>Evidence library</h1><p>Inspect frozen records, check file integrity and see exactly what an export proves.</p></div><Badge>Business facts · application reported</Badge></div>
    <div className="panel evidence-bundles"><h2><FileCheck2 size={21}/> Case bundles</h2>
      {cases.some(c=>c.latestProposal)?<div className="evidence-list">{cases.filter(c=>c.latestProposal).map(c=><div key={c.id}>
        <div><strong>{c.invoiceReference}</strong><p>{c.supplierName} · {c.settlementStatus==='SETTLED'?'Application reports a verified settlement':'No verified settlement reported'}</p></div>
        <Button onClick={()=>void download(`/cases/${c.id}/evidence`,`evidence-${c.invoiceReference}.zip`).catch(e=>onNotice(e.message))}><Download size={15}/> Export bundle</Button>
      </div>)}</div>:<Empty icon={<FileCheck2/>} title="No frozen evidence packages">A proposal freezes the invoice, checked records and agent artifacts into one committed manifest.</Empty>}
    </div>
    <section className="panel verifier-panel" aria-busy={busy}>
      <h2>Verify a downloaded package</h2><p>Integrity and signature correspondence have separate coverage. An offline receipt is not proof of settlement.</p>
      <label className={`file-drop evidence-upload ${busy?'busy':''}`}><span className="evidence-upload-icon"><FileUp size={25}/></span><strong>{busy?'Verifying package…':'Choose an evidence ZIP or approval request JSON'}</strong><span>Original bytes remain on your device · up to 32 MiB</span>
        <input type="file" aria-label="Choose an evidence ZIP or approval request JSON" accept=".json,.zip" disabled={busy} onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file)void verify(file)}}/>
      </label>
      {result&&<VerificationReport result={result}/>}
      <details className="evidence-details evidence-online"><summary>Verify settlement with the command line</summary><p>Online verification is a separate step. Use an independently trusted deployment manifest and an available RPC connection to check chain state, the transaction and its settlement evidence.</p><code className="command">pnpm evidence:verify -- &lt;bundle&gt; --online --deployment &lt;trusted-manifest&gt;</code><p>This browser check does not run that command or contact the blockchain.</p></details>
    </section>
  </div>;
}
