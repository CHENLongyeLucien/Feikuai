import {lazy,Suspense,useEffect,useMemo,useRef,useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import * as Dialog from '@radix-ui/react-dialog';
import {ArrowDown,ArrowRight,AudioLines,Bell,ChevronRight,FileCheck2,FileText,Globe2,Inbox,Leaf,LogOut,Mail,MessageSquare,Plus,Search,Settings,ShieldCheck,X} from 'lucide-react';
import {amount,request} from '../../app/api';
import {paymentPresentation} from '../../app/payment-presentation';
import type {CaseDTO,Config,Payable,Session} from '../../app/types';
import {useUI} from '../../app/store';
import {CaseWorkspace} from '../cases/CaseWorkspace';
import {InboxDetail,IntakeDialog,Notifications,useInbox} from '../inbox/InboxPages';
import {channelNames,statusNames,type InboxItem} from '../inbox/types';
import {deriveProcessJourney,type ProcessStageId} from '../../scene/process';
import {normalizeLocation,readWorkflowLocation,workflowUrl} from './location';
import {workflowReviewQueue} from './review-queue';
import WorkflowMap from './WorkflowMap';
import AuthoritySummary from './AuthoritySummary';
import './workflow.css';
const EvidenceVerifier=lazy(()=>import('../evidence/EvidenceVerifier'));
const clean=(text:string)=>text.replace(/0x[a-fA-F0-9]{8,64}/g,'[reference]');
const sourceIcons={invoice:FileText,email:Mail,voice:AudioLines,text:MessageSquare};
type Props={location:string;navigate:(to:string)=>void;authenticated:boolean;cases:CaseDTO[];payables:Payable[];config?:Config;session?:Session;connected:boolean;onLogin:()=>void;onLogout:()=>void;onNotice:(message:string)=>void;unreadCount:number};
function Preferences({config,session,connected}:Pick<Props,'config'|'session'|'connected'>){
 const paused=useUI(s=>s.paused),setPaused=useUI(s=>s.setPaused),reduced=useUI(s=>s.reduced),setReduced=useUI(s=>s.setReduced);
 return <div className="wf-preferences"><section><h3>Display</h3><label className="toggle-row"><span><strong>Reduce motion</strong><small>Immediate transitions and quieter scenes.</small></span><input type="checkbox" checked={reduced} onChange={e=>setReduced(e.target.checked)}/></label><label className="toggle-row"><span><strong>Pause animation</strong><small>Reviews and payments continue in the background.</small></span><input type="checkbox" checked={paused} onChange={e=>setPaused(e.target.checked)}/></label></section><section><h3>Your workspace</h3><dl><div><dt>Environment</dt><dd>{config?.appEnv==='fuji'?'Avalanche test network':'Local demonstration'}</dd></div><div><dt>Account</dt><dd>{session?.authenticated?'Signed in':'Signed out'}</dd></div><div><dt>Background updates</dt><dd>{connected?'Connected':'Reconnecting'}</dd></div><div><dt>Analysis</dt><dd>{config?.agentMode==='live'?'AI + independent checks':'Demonstration + independent checks'}</dd></div><div><dt>Payment network</dt><dd>{config?.rpcAvailable?'Connected':'Unavailable'}</dd></div></dl><p>Payments use valueless test tokens.</p></section></div>;
}
export default function WorkflowPage(props:Props){
 const {location,navigate,authenticated,cases,payables,onLogin,onNotice}=props;
 const state=readWorkflowLocation(location),inbox=useInbox(authenticated),items=authenticated?inbox.data?.items||[]:[];
 const [search,setSearch]=useState(''),[listVisible,setListVisible]=useState(false);
 const panelFocus=useRef<string|null>(null),searchFrame=useRef<number>(0);
 const reviewRef=useRef<HTMLDivElement>(null),paymentRef=useRef<HTMLDivElement>(null),searchRef=useRef<HTMLInputElement>(null);
 const reduced=useUI(s=>s.reduced);
 const detail=useQuery({queryKey:['inbox-item',state.itemId],queryFn:()=>request<InboxItem>(`/inbox/${encodeURIComponent(state.itemId!)}`),enabled:authenticated&&!!state.itemId,refetchInterval:5000});
 const selectedItem=authenticated&&state.itemId?detail.data||items.find(i=>i.id===state.itemId):undefined;
 const caseId=selectedItem?.linkedCaseId||(!state.itemId?state.caseId:null);
 const caseQuery=useQuery({queryKey:['case',caseId],queryFn:()=>request<CaseDTO>(`/cases/${encodeURIComponent(caseId!)}`),enabled:authenticated&&!!caseId,refetchInterval:4000});
 const selectedCase=authenticated&&caseId?caseQuery.data||cases.find(c=>c.id===caseId):undefined;
 const journey=useMemo(()=>deriveProcessJourney(selectedCase,selectedItem),[selectedCase,selectedItem]);
 const selected=authenticated&&!!(state.itemId||state.caseId);
 const title=selectedItem?.title||selectedCase?.invoiceReference||'Selected item';
 const standaloneCases=authenticated?cases.filter(c=>!items.some(i=>i.linkedCaseId===c.id)):[];
 const reviewQueue=useMemo(()=>workflowReviewQueue(items,cases,selectedCase),[items,cases,selectedCase]);
 const matchingItems=items.filter(i=>(state.filter==='all'||state.filter==='review'&&reviewQueue.itemIds.has(i.id)||state.filter==='payments'&&!!i.linkedCaseId)&&`${i.title} ${i.sender||''} ${i.preview}`.toLowerCase().includes(search.toLowerCase()));
 const matchingCases=standaloneCases.filter(c=>(state.filter!=='review'||reviewQueue.caseIds.has(c.id))&&`${c.invoiceReference} ${c.supplierName}`.toLowerCase().includes(search.toLowerCase()));
 const needsReview=reviewQueue.count;
 const update=(changes:Record<string,string|null>)=>navigate(workflowUrl(location,changes));
 const closePanel=()=>update({panel:null});
 function choose(item:string|null,invoice:string|null){update({item,case:invoice,panel:null});setListVisible(false);}
 function navigateInside(to:string){
  const normalized=normalizeLocation(to),next=readWorkflowLocation(normalized);
  // The linked payment is already mounted below this source; keep its wallet bridge alive.
  if(next.caseId&&next.caseId===caseId){closePanel();setTimeout(()=>paymentRef.current?.scrollIntoView({block:'start',behavior:reduced?'instant':'smooth'}),0);return;}
  if(next.itemId){choose(next.itemId,null);return;}
  if(next.caseId){choose(null,next.caseId);return;}
  if(next.panel){update({panel:next.panel});return;}
  update({filter:next.filter,new:next.compose,panel:null});
 }
 function openStage(id:ProcessStageId){
  if(id==='report'){update({panel:'reports'});return;}
  let target:Element|null=null;
  if(id==='payment'&&caseId)target=paymentRef.current;
  else if(id==='receive'){const source=reviewRef.current?.querySelector<HTMLDetailsElement>('.sf-source-panel');if(source){source.open=true;target=source;}}
  else if(id==='security'||id==='finance'){const checks=reviewRef.current?.querySelector<HTMLDetailsElement>('.sf-checks-disclosure');if(checks){checks.open=true;target=checks;}}
  (target||reviewRef.current?.querySelector('.wf-review-body'))?.scrollIntoView({block:'start',behavior:reduced?'instant':'smooth'});
 }
 useEffect(()=>{const key=(e:KeyboardEvent)=>{if((e.metaKey||e.ctrlKey)&&e.key==='k'){e.preventDefault();setListVisible(true);cancelAnimationFrame(searchFrame.current);searchFrame.current=requestAnimationFrame(()=>searchRef.current?.focus());}};window.addEventListener('keydown',key);return()=>{window.removeEventListener('keydown',key);cancelAnimationFrame(searchFrame.current);};},[]);
 useEffect(()=>{if(state.panel)panelFocus.current=state.panel;},[state.panel]);
 const previousSelection=useRef(`${state.itemId||''}:${state.caseId||''}`);
 useEffect(()=>{const key=`${state.itemId||''}:${state.caseId||''}`;if(key!==previousSelection.current&&window.innerWidth<=760&&selected)reviewRef.current?.scrollIntoView({block:'start',behavior:reduced?'instant':'smooth'});previousSelection.current=key;},[state.itemId,state.caseId,selected,reduced]);
 const add=()=>authenticated?update({new:'invoice'}):onLogin();
 return <div className="wf-app" data-testid="workflow-workspace">
  <a className="wf-skip" href="#workspace-content">Skip to workflow</a>
  <header className="wf-header"><button className="wf-brand" onClick={()=>navigate('/')} aria-label="SecureFinance network home"><span><Leaf size={24}/></span><strong>SecureFinance<small>Northstar workspace</small></strong></button><nav className="wf-header-nav" aria-label="Workspace navigation"><button className="wf-network" onClick={()=>navigate('/')}><Globe2 size={16}/>Network</button><span className="wf-header-divider"/><button aria-label="Reports" onClick={()=>update({panel:'reports'})}><FileCheck2 size={17}/><span>Reports</span></button><button aria-label="Alerts" className="wf-alert-button" onClick={()=>update({panel:'alerts'})}><Bell size={18}/>{props.unreadCount>0&&<i aria-label={`${props.unreadCount} unread alerts`}/>}</button><button aria-label="Settings" onClick={()=>update({panel:'settings'})}><Settings size={18}/></button>{authenticated?<button aria-label="Sign out" onClick={props.onLogout}><LogOut size={17}/></button>:<button className="wf-sign-in" onClick={onLogin}>Sign in</button>}</nav></header>
  <main id="workspace-content" className="wf-main">
   <div className="wf-title-row"><div><span className="wf-eyebrow">YOUR WORK, CONNECTED</span><h1>One clear path.</h1><p>Bring it in. Follow the checks. Make the decision.</p></div><button className="wf-primary" onClick={add}><Plus size={18}/>Add item</button></div>
   <div className="wf-layout">
    <aside className={`wf-inbox ${listVisible?'is-open':''}`} aria-label="Your items" data-testid="workflow-list">
     <div className="wf-list-heading"><h2>Your items <span>{authenticated?(inbox.data?.total??items.length)+standaloneCases.length:'—'}</span></h2><button className="wf-mobile-list-toggle" aria-label={listVisible?'Collapse item list':'Expand item list'} aria-expanded={listVisible} onClick={()=>setListVisible(!listVisible)}><ChevronRight size={18}/></button></div>
     <div className="wf-list-content"><label className="wf-search"><Search size={16}/><input ref={searchRef} type="search" placeholder="Find an item…" aria-label="Search items" value={search} onChange={e=>setSearch(e.target.value)}/></label>
      <div className="wf-filters" aria-label="Filter items">{[['all','All items'],['review','Needs review'],['payments','Payments']].map(([key,label])=><button key={key} aria-pressed={state.filter===key} onClick={()=>update({filter:key==='all'?null:key!})}>{label}</button>)}</div>
      {authenticated&&needsReview>0&&<p className="wf-review-count"><span/>{needsReview} need your attention</p>}
      {!authenticated?<div className="wf-list-empty"><Inbox size={28}/><strong>Your work starts here.</strong><p>Sign in to see your saved items.</p><button onClick={onLogin}>Open workspace<ArrowRight size={15}/></button></div>:inbox.isError?<div className="wf-list-empty" role="alert"><strong>Items couldn’t load.</strong><button onClick={()=>void inbox.refetch()}>Try again</button></div>:inbox.isPending?<div className="wf-list-empty" role="status">Loading your items…</div>:<div className="wf-item-list">{matchingItems.map(item=>{const Icon=sourceIcons[item.channel],reviewLabel=reviewQueue.itemLabels.get(item.id),tone=reviewLabel?'needs_review':item.status;return <button key={item.id} data-testid={`workflow-item-${item.id}`} className={`wf-item ${state.itemId===item.id?'is-selected':''}`} aria-pressed={state.itemId===item.id} aria-label={clean(item.title)} onClick={()=>choose(item.id,null)}><span className={`wf-item-icon ${tone}`}><Icon size={18}/></span><span className="wf-item-copy"><strong>{clean(item.title)}</strong><small>{channelNames[item.channel]}{item.sender?` · ${clean(item.sender)}`:''}</small><em className={`wf-item-status ${tone}`}>{reviewLabel||statusNames[item.status]}</em></span><ChevronRight size={14}/></button>;})}{matchingCases.map(c=>{const p=paymentPresentation(c),status=p.settled?'Paid':p.needsHumanReview?'Needs approval':p.uncertain?'Needs investigation':['HELD','NEEDS_INFORMATION'].includes(c.workflowStatus)?'On hold':'Payment review';return <button key={c.id} data-testid={`workflow-case-${c.id}`} className={`wf-item ${caseId===c.id?'is-selected':''}`} aria-pressed={caseId===c.id} aria-label={clean(c.invoiceReference)} onClick={()=>choose(null,c.id)}><span className="wf-item-icon"><FileText size={18}/></span><span className="wf-item-copy"><strong>{clean(c.invoiceReference)}</strong><small>{clean(c.supplierName)} · {amount(c.amountAtomic)} DEMO</small><em className={`wf-item-status ${p.settled?'approved':'needs_review'}`}>{status}</em></span><ChevronRight size={14}/></button>;})}{!matchingItems.length&&!matchingCases.length&&<div className="wf-list-empty"><Inbox size={28}/><strong>{search||state.filter!=='all'?'Nothing in this view.':'A little room for your next item.'}</strong><p>{search||state.filter!=='all'?'Try another filter or search.':'Add an invoice, email, voice note or message.'}</p></div>}</div>}
      {!!inbox.data&&inbox.data.total>items.length&&<p className="wf-list-limit">Latest {items.length} of {inbox.data.total} sources.</p>}
     </div>
    </aside>
    <div className="wf-content" ref={reviewRef} data-testid="workflow-review">
     {selected&&<div className="wf-selected-heading"><div><span className="wf-eyebrow">FOLLOWING THIS ITEM</span><h2>{clean(title)}</h2></div><button onClick={()=>{reviewRef.current?.querySelector('.wf-review-body')?.scrollIntoView({behavior:reduced?'instant':'smooth',block:'start'});}} aria-label="Go to review"><ArrowDown size={18}/></button></div>}
     <WorkflowMap key={`${state.itemId||''}:${state.caseId||''}`} journey={journey} onOpenStage={openStage}/>
     {selected&&<AuthoritySummary key={`authority-${state.itemId||state.caseId}`} itemId={state.itemId} caseId={caseId||state.caseId}/>}
     {selected?<div className="wf-review-body">
      {state.itemId&&<InboxDetail key={state.itemId} id={state.itemId} authenticated={authenticated} navigate={navigateInside} onLogin={onLogin} onNotice={onNotice} embedded paymentEmbedded={!!caseId}/> }
      {caseId&&<section className="wf-payment-review" ref={paymentRef} aria-label="Payment review"><div className="wf-section-label"><ShieldCheck size={16}/><h2>Payment review</h2><span>DEMO test tokens</span></div><CaseWorkspace key={caseId} id={caseId} onNotice={onNotice} navigate={navigateInside}/></section>}
     </div>:<div className="wf-welcome"><div className="wf-welcome-icon"><Inbox size={25}/></div><div><h2>{authenticated?'Choose an item to follow its journey.':'Your next decision, in focus.'}</h2><p>{authenticated?'Its checks, decisions and payment stay together here.':'Sign in, then add an invoice or message. We’ll help with the checks.'}</p></div><button onClick={authenticated?add:onLogin}>{authenticated?'Add an item':'Open workspace'}<ArrowRight size={17}/></button></div>}
    </div>
   </div>
  </main>
  <Dialog.Root open={state.panel!==null} onOpenChange={open=>!open&&closePanel()}><Dialog.Portal><Dialog.Overlay className="wf-drawer-overlay"/><Dialog.Content className="wf-drawer" data-testid="workflow-drawer" onCloseAutoFocus={event=>{event.preventDefault();const name=panelFocus.current;document.querySelector<HTMLButtonElement>(`.wf-header-nav button[aria-label="${name?name[0]!.toUpperCase()+name.slice(1):'Settings'}"]`)?.focus({preventScroll:true});}}><header><div><Dialog.Title>{state.panel==='reports'?'Reports':state.panel==='alerts'?'Alerts':'Settings'}</Dialog.Title><Dialog.Description>{state.panel==='reports'?'Your reviews and downloadable PDF reports.':state.panel==='alerts'?'Updates that need your attention.':'Make this workspace feel right for you.'}</Dialog.Description></div><Dialog.Close aria-label="Close panel"><X size={20}/></Dialog.Close></header><div className="wf-drawer-content">{state.panel==='reports'?<Suspense fallback={<p>Loading reports…</p>}><EvidenceVerifier cases={cases} authenticated={authenticated} onNotice={onNotice} navigate={navigateInside}/></Suspense>:state.panel==='alerts'?<Notifications authenticated={authenticated} navigate={navigateInside} onLogin={onLogin} onNotice={onNotice} embedded/>:<Preferences config={props.config} session={props.session} connected={props.connected}/>}</div></Dialog.Content></Dialog.Portal></Dialog.Root>
  {authenticated&&<IntakeDialog channel={state.compose} onChannelChange={channel=>update({new:channel})} onClose={()=>update({new:null})} payables={payables} onNotice={onNotice} onComplete={id=>{update({item:id,case:null,new:null,panel:null});setListVisible(false);}}/>}
  {!authenticated&&state.compose&&<div className="wf-compose-prompt"><p>Sign in to add your {state.compose}.</p><button onClick={onLogin}>Sign in</button><button aria-label="Dismiss add item" onClick={()=>update({new:null})}><X size={16}/></button></div>}
 </div>;
}
