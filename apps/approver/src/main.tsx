import React,{useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {createWalletClient,custom,recoverTypedDataAddress,type EIP1193Provider} from 'viem';
import {paymentTypedData,paymentGuardAbi} from '@secure-finance/chain';
import {decodeBase64,MAX_PACKET_BYTES,type ApprovalRequestFile} from '@secure-finance/evidence';
import {formatAmount} from '@secure-finance/shared';
import {inspectPacket,type Registry} from './verify';
import {acceptsBridgeEvent,bridgeMessage} from '../../web/src/features/cases/approval-bridge';
import {installDemoWallet} from '../../web/src/app/demo-wallet';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import './styles.css';
declare const __DEPLOYMENT__:unknown;
declare const __REGISTRY__:Registry|null;
declare const __MAIN_ORIGIN__:string;
declare const __DEMO_WALLET_AVAILABLE__:boolean;
const injected=()=> (window as unknown as {ethereum?:EIP1193Provider}).ethereum;
function signedTime(value:string){const millis=BigInt(value)*1000n;return millis<=8640000000000000n?new Date(Number(millis)).toISOString():`${value} Unix seconds (outside calendar display range)`}
function download(name:string,value:unknown){const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));const anchor=document.createElement('a');anchor.href=url;anchor.download=name;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
function downloadArtifact(path:string,base64:string,mediaType:string){const bytes=decodeBase64(base64);const url=URL.createObjectURL(new Blob([new Uint8Array(bytes)],{type:mediaType}));const anchor=document.createElement('a');anchor.href=url;anchor.download=path.split('/').at(-1)??'source';anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
function artifactPreview(base64:string,mediaType?:string){if(mediaType==='application/pdf')return 'Open the original PDF and inspect the extracted page text in the audit below.';try{return new TextDecoder().decode(decodeBase64(base64))}catch{return 'These artifact bytes could not be decoded. This package cannot be signed.'}}
function issueText(issue:string){const code=issue.split(':')[0];return ({RPC_UNAVAILABLE:'We cannot check the network right now. Refresh the checks before signing.',WRONG_DEPLOYMENT:'This request does not match the payment policy pinned into this approval client.',BUSINESS_FACTS_MISMATCH:'The request differs from the independently reviewed supplier or invoice records.',FUTURE_ISSUANCE:'The request starts in the future. Ask for a correctly timed request.',INVALID_TIME_WINDOW:'The signing window is invalid for this payment policy.',APPROVAL_EXPIRED:'This request has expired. You can still inspect it or cancel an unused nonce.',LESS_THAN_60_SECONDS_REMAINING:'Less than one minute remains. Resolve this request and create a fresh one.',NONCE_UNAVAILABLE:'This authorization has already been used or cancelled.',INVOICE_ALREADY_SETTLED:'This invoice already has a payment recorded onchain.',AMOUNT_EXCEEDS_POLICY:'The amount exceeds the permitted payment limit.'} as Record<string,string>)[code!]??issue}
type Inspection=Awaited<ReturnType<typeof inspectPacket>>;
type ExportedFile={name:string;payload:unknown;kind:'signature'|'cancellation'};
function App(){
 const [packet,setPacket]=useState<ApprovalRequestFile>(),[inspection,setInspection]=useState<Inspection>(),[message,setMessage]=useState('Open a request from your case, or choose an approval request file below.'),[busy,setBusy]=useState(false),[ack,setAck]=useState(false),[wallet,setWallet]=useState(''),[exported,setExported]=useState<ExportedFile>(),[returned,setReturned]=useState(false),[demoInstalled,setDemoInstalled]=useState(false);
 const locked=useRef(false),acceptedPacket=useRef(false);
 const nonce=useRef(new URLSearchParams(window.location.hash.slice(1)).get('review')??'');
 const opener=useRef(window.opener as Window|null);
 const bridgeActive=!!opener.current&&/^[0-9a-f-]{36}$/i.test(nonce.current);
 const pin=__DEPLOYMENT__ as {chainId?:string;environment?:string;rpcUrl?:string}|null;
 async function inspectInput(input:unknown){if(locked.current)return;locked.current=true;setBusy(true);setInspection(undefined);setPacket(undefined);setAck(false);setExported(undefined);setReturned(false);try{const result=await inspectPacket(input,__DEPLOYMENT__,__REGISTRY__);setInspection(result);if(result.packet)setPacket(result.packet);setMessage(result.integrityValid?'Request verified. Check the supplier, amount and source, then sign if everything is correct.':'This request could not be verified. Signing is disabled.')}catch(error){setMessage(error instanceof Error?error.message:'Invalid request')}finally{locked.current=false;setBusy(false)}}
 useEffect(()=>{
  if(!bridgeActive)return;
  const expected={source:opener.current,origin:__MAIN_ORIGIN__,nonce:nonce.current};
  const receive=(event:MessageEvent)=>{
   if(acceptsBridgeEvent(event,expected,'request')&&!acceptedPacket.current){acceptedPacket.current=true;void inspectInput(event.data.payload)}
   if(acceptsBridgeEvent(event,expected,'received')){setReturned(true);setMessage('The main application received and verified your result. Return to the case to continue.');}
  };
  window.addEventListener('message',receive);opener.current!.postMessage(bridgeMessage('ready',nonce.current),__MAIN_ORIGIN__);
  return()=>window.removeEventListener('message',receive);
 },[]);
 async function load(file:File){if(file.size>MAX_PACKET_BYTES){setMessage('The request exceeds the 32 MiB limit.');return}try{await inspectInput(JSON.parse(await file.text()))}catch{setMessage('Choose a valid JSON approval request exported by the main application.')}}
 async function refresh(){if(!packet||locked.current)return;locked.current=true;setBusy(true);try{setInspection(await inspectPacket(packet,__DEPLOYMENT__,__REGISTRY__));setMessage('Payment eligibility has been checked again.')}catch(error){setInspection(undefined);setMessage(error instanceof Error?error.message:'Current checks are unavailable.')}finally{locked.current=false;setBusy(false)}}
 async function connect(){const provider=injected();if(!provider)throw new Error('No wallet is connected. Unlock your approval wallet, or choose the isolated demo wallet when available.');const client=createWalletClient({transport:custom(provider)});const [account]=await client.requestAddresses();if(!account)throw new Error('The wallet did not provide an address.');setWallet(account);return {client,account}}
 function deliver(file:ExportedFile){setExported(file);setReturned(false);if(bridgeActive&&!opener.current?.closed){opener.current!.postMessage(bridgeMessage(file.kind,nonce.current,file.payload),__MAIN_ORIGIN__);setMessage('Your result was sent to the main application for verification. You can also save a backup file below.')}else{download(file.name,file.payload);setMessage(file.kind==='signature'?'Signature downloaded. Import it into your case to continue with the payment.':'Cancellation observation downloaded. Import it into your case for confirmation.')}}
 async function act(action:'sign'|'cancel'){
  if(!packet||!inspection||locked.current)return;locked.current=true;setBusy(true);
  try{const {client,account}=await connect();const current=await inspectPacket(packet,__DEPLOYMENT__,__REGISTRY__);setInspection(current);
   if(account.toLowerCase()!==current.deployment.approver)throw new Error('Connect the approval wallet shown in the payment policy. This wallet is not eligible.');
   if(String(await client.getChainId())!==current.deployment.chainId)throw new Error('Switch your wallet to the network shown in this request, then try again.');
   if(action==='sign'){
    if(!current.canSign||!ack)throw new Error('Review the findings and acknowledge the exact transfer before signing.');
    const signature=await client.signTypedData({account,...paymentTypedData(packet.manifest.domain,packet.payment)});
    const signer=(await recoverTypedDataAddress({...paymentTypedData(packet.manifest.domain,packet.payment),signature})).toLowerCase();if(signer!==current.deployment.approver)throw new Error('The signature did not come from the eligible approval wallet.');
    deliver({kind:'signature',name:`approval-signature-${packet.manifest.proposalId}.json`,payload:{schemaVersion:'secure-finance.approval-signature.v1',proposalId:packet.manifest.proposalId,typedDigest:packet.typedDigest,signer,signature}});
   }else{
    if(!current.canCancel)throw new Error('Cancellation is unavailable because the nonce is resolved or the policy could not be verified.');
    const transactionHash=await client.writeContract({account,chain:null,address:current.deployment.vault,abi:paymentGuardAbi,functionName:'cancelNonce',args:[BigInt(packet.payment.authorizationNonce)]});
    deliver({kind:'cancellation',name:`cancellation-${packet.manifest.proposalId}.json`,payload:{schemaVersion:'secure-finance.cancellation-observation.v1',proposalId:packet.manifest.proposalId,chainId:current.deployment.chainId,vault:current.deployment.vault,authorizationNonce:packet.payment.authorizationNonce,transactionHash}});
   }
  }catch(error){setMessage(error instanceof Error?error.message:'The wallet action was not completed.')}finally{locked.current=false;setBusy(false)}
 }
 async function demoWallet(){if(locked.current)return;locked.current=true;setBusy(true);try{await installDemoWallet({demoLoginAvailable:__DEMO_WALLET_AVAILABLE__,chainId:pin?.chainId,appEnv:pin?.environment,rpcUrl:pin?.rpcUrl});setDemoInstalled(true);setMessage('Isolated local demo wallet selected. No personal wallet or real funds are used.')}catch(error){setMessage(error instanceof Error?error.message:'The local demo wallet is unavailable.')}finally{locked.current=false;setBusy(false)}}
 const m=packet?.manifest,p=packet?.payment,source=packet?.artifacts.filter(artifact=>m?.artifacts.find(meta=>meta.path===artifact.path)?.kind==='SOURCE')??[],audit=packet?.artifacts.filter(artifact=>m?.artifacts.find(meta=>meta.path===artifact.path)?.kind!=='SOURCE')??[];
 const supplier=p?__REGISTRY__?.suppliers.find(item=>item.supplierKey===p.supplierKey):undefined,payable=p?__REGISTRY__?.payables.find(item=>item.invoiceKey===p.invoiceKey):undefined;
 const signReason=!inspection?.integrityValid?'A verified request is required.':!inspection.canSign?'Resolve the findings above or refresh the checks.':!ack?'Confirm that you have reviewed the supplier, amount and source.':exported?.kind==='signature'?'Your signature is already available below.':null;
 return <><header><span className="mark">◇</span><div><strong>Secure Finance</strong><span className="subtitle">Payment approval</span></div><span className="pill">{bridgeActive?'Connected to your case':'Independent review'}</span></header><main>
  <div className="intro"><div><p className="eyebrow">ONE HUMAN DECISION</p><h1>Review. Sign. Return.</h1><p>The agents have prepared the facts. Your wallet authorizes the exact payment.</p></div><div className="pin"><strong>{bridgeActive?'Your request arrives here automatically':'Open the request from your case'}</strong><p>{bridgeActive?'After signing, the result returns to the main application for verification. Payment is submitted separately.':'You can also import an approval request file. The same independent checks apply.'}</p><small>{__DEPLOYMENT__?'Payment policy and supplier records are pinned into this build.':'No payment policy is configured. Signing is disabled.'}</small></div></div>
  <ol className="review-progress" aria-label="Approval progress"><li className={packet?'complete':'active'}>1 <span>Receive request</span></li><li className={exported?'complete':packet?'active':''}>2 <span>Review and sign</span></li><li className={returned?'complete':exported?'active':''}>3 <span>Return to your case</span></li></ol>
  <details className="file-fallback" open={!bridgeActive&&!packet}><summary>Import a request file instead</summary><div className="import"><label htmlFor="packet">Approval request file</label><input id="packet" type="file" accept=".json,application/json" disabled={busy} onChange={event=>{const file=event.target.files?.[0];event.currentTarget.value='';if(file)void load(file)}}/></div></details>
  <p className="notice" role="status" aria-live="polite">{busy?'Checking the request or waiting for your wallet…':message}</p>
  {inspection&&<div className="verdicts"><span className={inspection.integrityValid?'good':'bad'}>{inspection.integrityValid?'Evidence verified':'Evidence could not be verified'}</span><span className={inspection.canSign?'good':'wait'}>{inspection.canSign?'Eligible at last chain check':'Signing unavailable'}</span><button className="compact" onClick={()=>void refresh()} disabled={busy}>Refresh checks</button></div>}
  {inspection?.eligibilityErrors.map(issue=><p className="error" key={issue}>{issueText(issue)}</p>)}
  {m&&p&&<>
   <section className="payment-review"><div className="payment-topline"><div><p className="eyebrow">{payable?.invoiceReference??'UNRECOGNIZED INVOICE'}</p><h2>Exact payment terms</h2><p className="supplier-name">{supplier?.name??'Unrecognized supplier'}</p></div><div className="amount">{formatAmount(p.amountAtomic)} <span>DEMO</span></div></div><p className="subtle">Synthetic data · Valueless test tokens · {m.domain.chainId==='43113'?'Avalanche Fuji':'Local demonstration'}</p>
    <dl className="essential-terms"><div><dt>Pay to</dt><dd>{supplier?.name??'Unknown supplier'}<small>The exact address and payment policy are available under all signed fields.</small></dd></div><div><dt>Exact amount</dt><dd>{formatAmount(p.amountAtomic)} DEMO <small>{p.amountAtomic} atomic units</small></dd></div><div><dt>Sign before</dt><dd>{signedTime(p.deadline)}</dd></div></dl>
    <details><summary>All signed fields and payment policy</summary><dl>{Object.entries({'Invoice reference':payable?.invoiceReference??'Unknown','Invoice key':p.invoiceKey,'Supplier key':p.supplierKey,'Recipient':p.recipient,'Token contract':p.token,'Amount (atomic units)':p.amountAtomic,'Chain ID':m.domain.chainId,'Vault':m.domain.verifyingContract,'Issued at':`${signedTime(p.issuedAt)} (${p.issuedAt})`,'Deadline':`${signedTime(p.deadline)} (${p.deadline})`,'Authorization nonce':p.authorizationNonce,'Policy ID':p.policyId,'Evidence commitment':p.evidenceCommitment,'Typed digest':packet.typedDigest,'Proposal version':m.proposalVersion,'Eligible approval wallet':inspection?.deployment.approver??'Unavailable'}).map(([key,value])=><div key={key}><dt>{key}</dt><dd>{value}</dd></div>)}</dl></details>
   </section>
   <section><h2>Check the source</h2><p>Document text and agent recommendations are evidence. They do not provide payment authority.</p>{source.map(artifact=>{const meta=m.artifacts.find(item=>item.path===artifact.path);return <details key={artifact.path}><summary>{artifact.path.split('/').at(-1)}</summary><button className="compact" disabled={!inspection?.integrityValid} onClick={()=>downloadArtifact(artifact.path,artifact.bytesBase64,meta?.mediaType??'application/octet-stream')}>Download verified source</button><pre>{artifactPreview(artifact.bytesBase64,meta?.mediaType)}</pre></details>})}<details><summary>Agent findings, checked records and audit ({audit.length})</summary>{audit.map(artifact=><details key={artifact.path}><summary>{artifact.path}</summary><pre>{artifactPreview(artifact.bytesBase64,m.artifacts.find(meta=>meta.path===artifact.path)?.mediaType)}</pre></details>)}</details></section>
   <section className="sign-section"><h2>{exported?.kind==='signature'?'Your signature is ready':'Confirm the payment'}</h2>
    {__DEMO_WALLET_AVAILABLE__&&pin?.chainId==='31337'&&<div className="demo-wallet"><div><strong>Isolated local demonstration</strong><p>Use the public test approver wallet for this demo. This option is unavailable on Fuji.</p></div><button disabled={busy||demoInstalled} onClick={()=>void demoWallet()}>{demoInstalled?'Demo wallet selected':'Use demo approval wallet'}</button></div>}
    <label className="ack"><input type="checkbox" checked={ack} disabled={busy||exported?.kind==='signature'} onChange={event=>setAck(event.target.checked)}/>I reviewed the source, supplier and exact amount, including any flagged instructions. I authorize this specific transfer.</label>
    <div className="actions"><button className="primary" disabled={busy||!!signReason} onClick={()=>void act('sign')}>Sign exact payment</button>{exported&&<button onClick={()=>download(exported.name,exported.payload)}>Download {exported.kind==='signature'?'signed approval':'cancellation observation'}</button>}{bridgeActive&&exported&&<button onClick={()=>{opener.current?.focus();window.close()}}>Return to case</button>}</div>{signReason&&<p className="action-reason">{signReason}</p>}
    {wallet&&<details><summary>Connected wallet</summary><code>{wallet}</code></details>}
    <details><summary>Cancel this authorization</summary><p>Cancel nonce <code>{p.authorizationNonce}</code> with the eligible wallet. This sends a real transaction, uses gas, and cannot reverse a payment that already executed.</p><button className="danger" disabled={busy||!inspection?.canCancel} onClick={()=>void act('cancel')}>Cancel nonce in wallet</button>{!inspection?.canCancel&&<p className="action-reason">Cancellation is unavailable while chain checks fail or this nonce is already consumed or cancelled.</p>}</details>
   </section>
  </>}
  <footer>The approval client checks its own pinned configuration. A shared deployment administrator could still replace both applications. This demonstration does not support real-money treasury operations.</footer>
 </main></>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
