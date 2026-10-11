import {useCallback,useEffect,useRef,useState} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {Activity,ArrowRight,ArrowUpRight,Banknote,ChevronRight,FileText,Focus,Plus,RefreshCw,ShieldCheck,Wallet,WifiOff,X} from 'lucide-react';
import {amount,post,request,useData,useEvents} from './api';
import type {CaseDTO,Config,Session} from './types';
import {useUI} from './store';
import {Badge,Button,Empty,Field,Modal,Status} from '../components/ui';
import {CaseWorkspace} from '../features/cases/CaseWorkspace';
import Business from '../features/business/Business';
import EvidenceVerifier from '../features/evidence/EvidenceVerifier';

import {paymentPresentation,paymentCases,campusPaymentMetrics} from './payment-presentation';

import {InboxPages,InboxShell,type InboxNotification} from '../features/inbox';
import OperationsPage from '../features/operations/OperationsPage';
type Provider={request:(args:{method:string;params?:unknown[]})=>Promise<unknown>};
declare global{interface Window{ethereum?:Provider}}
function currentPath(){
 const url=new URL(window.location.href);
 if(url.pathname==='/review'){
  url.pathname='/';url.searchParams.set('filter','review');
  window.history.replaceState(window.history.state,'',url.pathname+url.search+url.hash);
 }
 return window.location.pathname;
}
function useLocation(){const [path,setPath]=useState(currentPath);useEffect(()=>{const pop=()=>setPath(currentPath());window.addEventListener('popstate',pop);return()=>window.removeEventListener('popstate',pop)},[]);const navigate=useCallback((to:string)=>{window.history.pushState({},'',to);setPath(currentPath());window.dispatchEvent(new Event('sf:navigate'))},[]);return [path,navigate] as const}
function Workspace({cases,authenticated,onUpload,onLogin,navigate,search}:{cases:CaseDTO[];authenticated:boolean;onUpload:()=>void;onLogin:()=>void;navigate:(p:string)=>void;search:string}){
 const [filter,setFilter]=useState('all');
 const {waiting,paid}=campusPaymentMetrics(cases);
 const settled=paymentCases(cases).filter(c=>paymentPresentation(c).settled);
 const total=settled.reduce((sum,c)=>sum+BigInt(c.amountAtomic),0n).toString();
 const matching=cases.filter(c=>{
  const view=paymentPresentation(c);
  return (filter==='all'||filter==='review'&&view.needsHumanReview||filter==='held'&&(['HELD','NEEDS_INFORMATION'].includes(c.workflowStatus)||['HELD','INCONSISTENT','UNKNOWN','REVERTED'].includes(view.executionStatus))||filter==='settled'&&view.settled)&&`${c.invoiceReference} ${c.supplierName}`.toLowerCase().includes(search.toLowerCase());
 });
 return <div className="page-content finance-page">
  <div className="page-title"><div><h1>Payments</h1><p>Review invoices and track completed payments.</p></div><Button className="primary" onClick={authenticated?onUpload:onLogin}><Plus size={17}/>{authenticated?'Add invoice':'Sign in'}</Button></div>
  <div className="finance-totals" aria-label="Payment summary"><span><strong>{authenticated?waiting:'—'}</strong> need approval</span><span><strong>{authenticated?paid:'—'}</strong> paid</span><span><strong>{authenticated?amount(total):'—'}</strong> DEMO paid</span></div>
  <div className="panel workspace-list"><div className="section-tabs" aria-label="Filter payments">{[['all','All invoices'],['review','Needs approval'],['held','On hold'],['settled','Paid']].map(([key,name])=><button key={key} className={filter===key?'active':''} aria-pressed={filter===key} onClick={()=>setFilter(key!)}>{name}</button>)}</div>
   {matching.length?<div className="table-scroll finance-table"><table><thead><tr><th>Invoice / supplier</th><th>Amount</th><th>Status</th><th><span className="sr-only">Open invoice</span></th></tr></thead><tbody>{matching.map(c=>{const view=paymentPresentation(c);return <tr key={c.id}>
    <td><button className="table-case-button" onClick={()=>navigate(`/cases/${c.id}`)}><span className="table-file-icon"><FileText size={20}/></span><span><strong>{c.invoiceReference}</strong><small>{c.supplierName}</small></span></button></td>
    <td data-label="Amount" className="amount-cell">{amount(c.amountAtomic)} <small>DEMO</small></td>
    <td data-label="Status">{view.settled?<Badge tone="green">Paid</Badge>:view.needsHumanReview?<Badge tone="amber">Needs approval</Badge>:view.uncertain?<Status status={view.executionStatus}/>:['HELD','NEEDS_INFORMATION'].includes(c.workflowStatus)?<Status status={c.workflowStatus}/>:<Status status={view.executionStatus==='NONE'?c.workflowStatus:view.executionStatus}/>}</td>
    <td><button className="icon-button" aria-label={`Open ${c.invoiceReference}`} onClick={()=>navigate(`/cases/${c.id}`)}><ArrowUpRight size={17}/></button></td>
   </tr>})}</tbody></table></div>:<Empty icon={<FileText size={30}/>} title={authenticated?'No invoices in this view':'Sign in to view payments'}>{authenticated?'No invoices match this view. Choose another filter or add an invoice to begin.':'Sign in to see your invoices and verified payments.'}</Empty>}
  </div>
  <div className="finance-footnote"><ShieldCheck size={18}/><span>Only a verified receipt marks a payment complete.</span><button className="finance-link" onClick={()=>navigate('/payments')}>Payment history <ArrowUpRight size={15}/></button></div>
 </div>;
}
function Agents({cases,config,onSelect}:{cases:CaseDTO[];config:Config|undefined;onSelect:(id:string)=>void}){const runs=cases.flatMap(c=>(c.analysis?.runs||[]).map(run=>({...run,invoiceReference:c.invoiceReference,caseId:c.id})));return <div className="page-content"><div className="page-title"><div><h1>Agent activity</h1><p>See which checks ran for each invoice.</p></div><Badge tone={config?.agentMode==='live'?'blue':'amber'}>{config?.agentMode==='live'?'Live agent calls':'Scripted agent fixtures'}</Badge></div><div className="agent-grid">{['intake','finance'].map(id=><section className="panel agent-card" key={id}><span className={`agent-avatar ${id}`}><Activity size={28}/></span><h2>{id==='intake'?'Intake Agent':'Finance Agent'}</h2><p>{id==='intake'?'Extracts source candidates and suspicious spans from bounded invoice text.':'Compares the selected payable, supplier and settlement using scoped read-only tools.'}</p><details className="agent-constraints"><summary>Permissions and limits</summary><Field label="Write access">None</Field><Field label="Signing access">None</Field><Field label="Tool budget">{id==='intake'?'No tools':'3 calls / stage'}</Field><Field label="Model request limit">4 / stage</Field><Field label="Stage deadline">60 seconds maximum</Field></details><Button onClick={()=>onSelect(id)}>Locate carrier <Focus size={15}/></Button></section>)}</div><section className="panel"><h2>Recorded runs <span className="count-pill">{runs.length}</span></h2>{runs.length?runs.map((r,i)=><details className="run-record" key={i}><summary><span>{r.invoiceReference}</span><Badge>{String((r as Record<string,unknown>).agent||(r as Record<string,unknown>).stage||'Agent run')}</Badge><span>{String((r as Record<string,unknown>).mode||config?.agentMode||'')}</span></summary><pre>{JSON.stringify(r,null,2)}</pre></details>):<Empty title="No recorded runs">Upload an invoice to start analysis. Missing model credentials do not create a live run.</Empty>}</section></div>}
function Payments({cases,navigate}:{cases:CaseDTO[];navigate:(p:string)=>void}){const relevant=paymentCases(cases);return <div className="page-content"><div className="page-title"><div><h1>Payment history</h1><p>Only verified receipts mark a payment complete.</p></div><Badge>DEMO · valueless test tokens</Badge></div><div className="panel">{relevant.length?relevant.map(c=><div className="payment-row" key={c.id}><span className="kpi-icon"><Banknote size={24}/></span><div><h3>{c.invoiceReference} · {c.supplierName}</h3><p>{amount(c.amountAtomic)} DEMO</p><details><summary>Transaction details</summary><code>{paymentPresentation(c).txHash||'No broadcast recorded'}</code></details></div><Badge>{paymentPresentation(c).automatic?'Registered policy':'Wallet approval'}</Badge><Status status={paymentPresentation(c).executionStatus}/><Status status={paymentPresentation(c).settlementStatus}/><Button onClick={()=>navigate(`/cases/${c.id}`)}>Inspect <ArrowUpRight size={15}/></Button></div>):<Empty icon={<Banknote size={30}/>} title="No payment attempts">A verified registered policy or human wallet authorization is required before a payment can proceed.</Empty>}</div></div>}
function SettingsPage({config,session,connected}:{config:Config|undefined;session:Session|undefined;connected:boolean}){
 const paused=useUI(s=>s.paused),setPaused=useUI(s=>s.setPaused),reduced=useUI(s=>s.reduced),setReduced=useUI(s=>s.setReduced);
 return <div className="sf-page"><div className="sf-page-heading"><div><h1>Workspace settings.</h1></div></div><div className="settings-grid"><section className="panel"><h2>Your workspace</h2><Field label="Workspace">Northstar Labs</Field><Field label="Environment">{config?.appEnv==='fuji'?'Avalanche test network':'Isolated local demo'}</Field><Field label="Account">{session?.authenticated?'Signed in':'Not signed in'}</Field><Field label="Server">{config?'Connected':'Unavailable'}</Field><Field label="Payment network">{config?.rpcAvailable?'Connected':'Temporarily unavailable'}</Field><Field label="Background updates">{connected?'Live':'Reconnecting'}</Field><Field label="Analysis">{config?.agentMode==='live'?'Live AI + independent checks':'Demonstration fixtures + independent checks'}</Field><p className="muted">This workspace uses synthetic information and valueless test tokens.</p></section><section className="panel"><h2>Display preferences</h2><label className="toggle-row"><span><strong>Pause campus animation</strong><small>Review and payments continue in the background.</small></span><input type="checkbox" checked={paused} onChange={e=>setPaused(e.target.checked)}/></label><label className="toggle-row"><span><strong>Reduce motion</strong><small>Use a quieter interface and immediate camera changes.</small></span><input type="checkbox" checked={reduced} onChange={e=>setReduced(e.target.checked)}/></label></section></div><details className="panel"><summary>Technical configuration</summary><pre className="configuration-json">{JSON.stringify({network:config?.chainId,deployment:config?.deployment,account:session?.user?.address,roles:session?.user?.roles},null,2)}</pre></details></div>;
}
export default function App(){
 const [path,navigate]=useLocation();
 const data=useData(),client=useQueryClient();
 const cases=data.cases.data?.cases||[],authenticated=data.session.data?.authenticated===true;
 const connected=useEvents(authenticated);
 const select=useUI(s=>s.select),cameraTo=useUI(s=>s.cameraTo);
 const [search,setSearch]=useState(''),[debouncedSearch,setDebouncedSearch]=useState('');
 const [login,setLogin]=useState(false),[busy,setBusy]=useState(false),[notice,setNotice]=useState('');
 const actionLock=useRef(false),noticeTimer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
 const notify=useCallback((message:string)=>{setNotice(message);clearTimeout(noticeTimer.current);noticeTimer.current=setTimeout(()=>setNotice(''),10000)},[]);
 const campus=path==='/operations';
 const inboxRoute=['/','/inbox','/notifications','/connections'].includes(path)||path.startsWith('/inbox/');
 const notifications=useQuery({queryKey:['inbox-notifications'],queryFn:()=>request<{notifications:InboxNotification[]}>('/inbox/notifications'),enabled:authenticated,refetchInterval:6000});
 useEffect(()=>{const timer=setTimeout(()=>setDebouncedSearch(search),200);return()=>clearTimeout(timer)},[search]);
 useEffect(()=>{const key=(e:KeyboardEvent)=>{if((e.metaKey||e.ctrlKey)&&e.key==='k'){e.preventDefault();document.querySelector<HTMLInputElement>('.sf-search input')?.focus()}if(e.key==='Escape')setSearch('')};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key)},[]);
 useEffect(()=>{const m=path.match(/^\/cases\/([^/]+)$/);if(m)select({kind:'case',id:m[1]!});window.scrollTo({top:0,behavior:'instant'});},[path,select]);
 useEffect(()=>()=>clearTimeout(noticeTimer.current),[]);
 async function finishLogin(session:Session){client.setQueryData(['session'],session);await client.invalidateQueries({queryKey:['session']});await client.invalidateQueries({queryKey:['inbox']});setLogin(false);}
 async function demoLogin(){
  if(actionLock.current)return;actionLock.current=true;setBusy(true);
  try{const session=await post<Session>('/auth/demo');await finishLogin(session);notify('Welcome to your demo workspace. Try an example to see the checks in action.');}
  catch(e){notify(e instanceof Error?e.message:'The demo could not start. Try again.');}
  finally{actionLock.current=false;setBusy(false);}
 }
 async function signIn(){
  if(actionLock.current)return;actionLock.current=true;setBusy(true);
  try{
   if(!window.ethereum)throw new Error('A wallet is needed for this network. Open this page in a browser with your enrolled wallet. For a wallet-free demonstration, run the isolated demo.');
   const accounts=await window.ethereum.request({method:'eth_requestAccounts'}) as string[];
   const address=accounts[0];if(!address)throw new Error('No account selected. Choose your workspace wallet and try again.');
   const actualChain=await window.ethereum.request({method:'eth_chainId'}) as string;
   const expected=BigInt(data.config.data?.chainId||'31337');
   if(BigInt(actualChain)!==expected)throw new Error(`Switch your wallet to ${expected===43113n?'Avalanche Fuji':'the local demo network'}, then try again.`);
   const challenge=await post<{challengeId:string;message:string}>('/auth/challenge',{address:address.toLowerCase()});
   const hex='0x'+Array.from(new TextEncoder().encode(challenge.message),b=>b.toString(16).padStart(2,'0')).join('');
   const signature=await window.ethereum.request({method:'personal_sign',params:[hex,address]}) as string;
   await finishLogin(await post<Session>('/auth/verify',{challengeId:challenge.challengeId,signature}));
   notify('You are signed in. Signing in does not authorize a payment.');
  }catch(e){notify(e instanceof Error?e.message:'Could not sign in. Please try again.');}
  finally{actionLock.current=false;setBusy(false);}
 }
 async function logout(){try{await post('/auth/logout');client.clear();setLogin(false);navigate('/');notify('Signed out. Your saved work is still here.');}catch(e){notify(e instanceof Error?e.message:'Sign out failed. Please try again.');}}
 const requestLogin=()=>setLogin(true);
 const onNew=()=>navigate('/inbox?new=text');
 return <InboxShell path={path} navigate={navigate} authenticated={authenticated} localDemo={data.config.data?.appEnv==='local'} onLogin={requestLogin} onLogout={()=>void logout()} search={search} onSearch={setSearch} unreadCount={notifications.data?.notifications.filter(n=>!n.read).length||0} onNew={onNew}>
  {data.config.isError&&<div className="connection-banner" role="alert"><WifiOff size={16}/><span>We cannot reach the workspace. Your saved work is unchanged.</span><button onClick={()=>{void data.config.refetch();void data.session.refetch();}}>Try again</button></div>}
  {authenticated&&!connected&&<div className="connection-banner subtle"><RefreshCw size={14}/>Reconnecting to live updates. We are checking for changes in the background.</div>}
  {inboxRoute?<InboxPages path={path} navigate={navigate} authenticated={authenticated} payables={data.payables.data?.payables||[]} config={data.config.data} onLogin={requestLogin} onDemoLogin={()=>void demoLogin()} onNotice={notify} search={debouncedSearch} cases={cases}/>
   :campus?<OperationsPage cases={cases} authenticated={authenticated} connected={connected} navigate={navigate} onLogin={requestLogin}/>
   :<main className="sf-legacy-view">{path.startsWith('/cases/')?<div className="page-content"><button className="breadcrumb" onClick={()=>navigate('/workspace')}>Payments <ChevronRight size={13}/> Invoice review</button><CaseWorkspace id={path.split('/')[2]!} onNotice={notify}/></div>
    :path==='/agents'?<Agents cases={cases} config={data.config.data} onSelect={id=>{select({kind:'agent',id});navigate('/operations');cameraTo({kind:'focus',target:id})}}/>
    :path==='/payments'?<Payments cases={cases} navigate={navigate}/>
    :path==='/evidence'?<EvidenceVerifier cases={cases} onNotice={notify} authenticated={authenticated} navigate={navigate}/>
    :path==='/business'?<Business/>
    :path==='/settings'?<SettingsPage config={data.config.data} session={data.session.data} connected={connected}/>
    :path==='/workspace'?<Workspace cases={cases} authenticated={authenticated} onUpload={()=>navigate('/inbox?new=invoice')} onLogin={requestLogin} navigate={navigate} search={debouncedSearch}/>
    :<Empty title="We couldn't find this page"><button className="sf-btn sf-btn-primary" onClick={()=>navigate('/')}>Back to your inbox</button></Empty>}</main>}
  <Modal open={login} onOpenChange={setLogin} title="Welcome to SecureFinance" description="Choose how to open your workspace.">
   <div className="login-icon"><ShieldCheck size={40}/></div>
   <div className="login-copy"><h3>A little clarity, from the first click.</h3><p>{data.config.data?.demoLoginAvailable?'Explore the local demonstration with example invoices, emails and voice requests. No extension or wallet setup is needed.':'Your workspace uses an enrolled wallet to protect access. The login message only signs you in.'}</p></div>
   {data.config.data?.demoLoginAvailable&&<Button className="primary full-width" busy={busy} onClick={()=>void demoLogin()}>Explore the demo <ArrowRight size={17}/></Button>}
   <Button className={`${data.config.data?.demoLoginAvailable?'':'primary '}full-width`} busy={busy} onClick={()=>void signIn()}><Wallet size={17}/>{data.config.data?.demoLoginAvailable?'Use my own wallet':'Connect & sign login'}</Button>
  </Modal>
  {notice&&<div className="toast" role="status"><span>{notice}</span><button aria-label="Dismiss notification" onClick={()=>setNotice('')}><X size={16}/></button></div>}
 </InboxShell>;
}
