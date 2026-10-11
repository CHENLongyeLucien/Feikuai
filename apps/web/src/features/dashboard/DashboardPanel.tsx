import {useId,useState,type ReactNode} from 'react';
import {useQuery} from '@tanstack/react-query';
import {ArrowUpRight,BadgeCheck,ChartNoAxesCombined,CheckCheck,Clock3,FileSearch,FileText,Inbox,Landmark,Lock,PenLine,RefreshCw,ScanSearch,Send,ShieldAlert,ShieldCheck,UserCheck,Wallet} from 'lucide-react';
import type {DashboardDTO} from '@secure-finance/shared';
import {request} from '../../app/api';
import {chartRatio,dashboardAmount,maximumAtomic} from './amounts';
import './dashboard.css';

type Props={authenticated:boolean;onLogin:()=>void;navigate:(path:string)=>void};
type ChartMode='payments'|'arrivals'|'approvals'|'threats';
const channelNames={invoice:'Invoices',email:'Emails',voice:'Voice notes',text:'Messages'};
const chartNames:Record<ChartMode,string>={payments:'Verified payments',arrivals:'Items received',approvals:'Workflow approvals',threats:'Threats quarantined'};
const clean=(value:string)=>value.replace(/0x[a-fA-F0-9]{8,64}/g,'[reference]');
const shortHash=(value:string)=>`${value.slice(0,8)}…${value.slice(-4)}`;
function date(value:string,withTime=false){const d=new Date(value);return Number.isNaN(d.getTime())?'Date not recorded':new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'short',...(withTime?{hour:'2-digit',minute:'2-digit'}:{}),timeZone:'UTC'}).format(d);}
function status(value:string){const labels:Record<string,string>={SETTLED:'Verified payment',VERIFIED:'Verified payment',settled:'Verified payment',approved:'Cleared',needs_review:'Needs review',quarantined:'Quarantined',processing:'Processing',rejected:'Rejected'};return labels[value]||value.toLowerCase().replaceAll('_',' ');}
function duration(ms:number|null){if(ms===null)return '—';if(ms<1000)return `${Math.max(1,Math.round(ms))} ms`;if(ms<60000)return `${(ms/1000).toFixed(1)} s`;return `${Math.round(ms/60000)} min`;}
function Money({value,token}:{value:string;token:DashboardDTO['token']}){return <span className="dx-money">{dashboardAmount(value,token.decimals)} <small>{token.symbol}</small></span>;}

/** A tiny trend line; decorative (the exact figures are in the daily table). */
function Sparkline({values,tone}:{values:number[];tone:string}){
 const max=Math.max(1,...values),w=120,h=36;
 const points=values.map((v,i)=>`${values.length>1?i/(values.length-1)*w:w/2},${h-2-(v/max)*(h-6)}`).join(' ');
 return <svg className={`dx-spark dx-tone-${tone}`} viewBox={`0 0 ${w} ${h}`} aria-hidden="true" preserveAspectRatio="none"><polyline points={points}/></svg>;
}
function Kpi({icon,label,value,note,tone,spark,highlight}:{icon:ReactNode;label:string;value:ReactNode;note:string;tone:string;spark:number[];highlight?:boolean}){
 return <section className={`dx-kpi ${highlight?'is-highlight':''}`}><div className="dx-kpi-top"><span className={`dx-badge dx-tone-${tone}`}>{icon}</span><Sparkline values={spark} tone={highlight?'light':tone}/></div><span className="dx-kpi-label">{label}</span><strong className="dx-kpi-value">{value}</strong><p>{note}</p></section>;
}

function ActivityChart({data}:{data:DashboardDTO}){
 const [mode,setMode]=useState<ChartMode>('arrivals');
 const id=useId(),financial=data.coverage.financialsAvailable;
 const values=data.daily.map(day=>mode==='payments'?day.verifiedPaidAtomic:String(mode==='arrivals'?day.inboxCount:mode==='approvals'?day.workflowApprovedCount:day.threatCount));
 const max=maximumAtomic(values),sum=values.reduce((total,value)=>total+BigInt(value),0n);
 const height=150,bottom=176,span=684,start=18;
 const points=values.map((value,index)=>({x:start+(values.length>1?index/(values.length-1)*span:span/2),y:bottom-chartRatio(value,max)*height,value}));
 const plotted=points.map(point=>`${point.x},${point.y}`).join(' ');
 const unavailable=mode==='payments'&&!financial;
 const total=mode==='payments'?`${dashboardAmount(sum.toString(),data.token.decimals)} ${data.token.symbol}`:sum.toString();
 const modeLabel=chartNames[mode];
 return <section className="dx-card dx-chart" aria-label="Activity over time">
  <div className="dx-card-head"><div><h3>Activity over time</h3><p>{date(data.window.from)} – {date(data.window.to)} · UTC</p></div><div className="dx-segmented" aria-label="Chart measure">{(['arrivals','threats','approvals','payments'] as const).map(key=><button key={key} aria-pressed={mode===key} onClick={()=>setMode(key)}>{key==='payments'?'Payments':key==='arrivals'?'Arrivals':key==='approvals'?'Approvals':'Threats'}</button>)}</div></div>
  <div className="dx-chart-total"><strong>{unavailable?'Unavailable':total}</strong><span>{modeLabel.toLowerCase()} in this period</span></div>
  {unavailable?<p className="dx-muted">Payment data is unavailable for this workspace configuration. Source activity is still available.</p>:<>
   <svg viewBox="0 0 720 206" role="img" aria-labelledby={`${id}-title ${id}-desc`} className={`dx-plot dx-plot-${mode}`}>
    <title id={`${id}-title`}>{modeLabel} over {data.window.days} days</title><desc id={`${id}-desc`}>{total} recorded in this period. Exact figures are in the daily figures table below.</desc>
    <defs><linearGradient id={`${id}-fill`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" className="dx-fill-top"/><stop offset="100%" className="dx-fill-bottom"/></linearGradient></defs>
    {[26,76,126,176].map(y=><line key={y} x1="18" y1={y} x2="702" y2={y} className="dx-grid-line"/>)}
    {sum>0n&&<polygon points={`18,${bottom} ${plotted} 702,${bottom}`} fill={`url(#${id}-fill)`}/>}
    <polyline points={plotted} className="dx-line"/>
    {points.map((point,index)=>point.value!=='0'&&<circle key={data.daily[index]!.date} cx={point.x} cy={point.y} r={4} className="dx-dot"><title>{date(data.daily[index]!.date)}: {mode==='payments'?`${dashboardAmount(point.value,data.token.decimals)} ${data.token.symbol}`:point.value}</title></circle>)}
    {data.daily.length>0&&<><text x="18" y="200">{date(data.daily[0]!.date)}</text><text x="702" y="200" textAnchor="end">{date(data.daily.at(-1)!.date)}</text></>}
   </svg>
   {sum===0n&&<p className="dx-muted">No {modeLabel.toLowerCase()} recorded in this period.</p>}
  </>}
  <details className="dx-details"><summary>View daily figures</summary><div className="dx-table-scroll" role="region" aria-label="Daily activity figures" tabIndex={0}><table><caption>Exact recorded activity · UTC observation dates</caption><thead><tr><th scope="col">Date</th><th scope="col">Received</th><th scope="col">Quarantined</th><th scope="col">Approved</th><th scope="col">Paid count</th><th scope="col">Verified paid · {data.token.symbol}</th></tr></thead><tbody>{data.daily.map(day=><tr key={day.date}><th scope="row">{date(day.date)}</th><td>{day.inboxCount}</td><td>{day.threatCount}</td><td>{day.workflowApprovedCount}</td><td>{financial?day.verifiedPaidCount:'Unavailable'}</td><td>{financial?dashboardAmount(day.verifiedPaidAtomic,data.token.decimals):'Unavailable'}</td></tr>)}</tbody></table></div></details>
 </section>;
}

function Outcomes({data}:{data:DashboardDTO}){
 const o=data.outcomes,parts=[['Cleared',o.approved,'green'],['Needs review',o.needsReview,'blue'],['Quarantined',o.quarantined,'amber'],['Rejected',o.rejected,'grey'],['Processing',o.processing,'pale']] as const;
 const total=parts.reduce((s,[,n])=>s+n,0),r=54,c=2*Math.PI*r;let offset=0;
 return <section className="dx-card dx-outcomes" aria-label="Decision outcomes"><div className="dx-card-head"><div><h3>Decision outcomes</h3><p>All recorded requests</p></div></div>
  <div className="dx-donut-row"><svg viewBox="0 0 140 140" className="dx-donut" role="img" aria-label={`${total} requests: ${parts.map(([l,n])=>`${n} ${l.toLowerCase()}`).join(', ')}`}><circle cx="70" cy="70" r={r} className="dx-donut-track"/>{total>0&&parts.map(([label,n,tone])=>{if(!n)return null;const len=n/total*c,el=<circle key={label} cx="70" cy="70" r={r} className={`dx-donut-seg dx-stroke-${tone}`} strokeDasharray={`${len} ${c-len}`} strokeDashoffset={-offset} transform="rotate(-90 70 70)"/>;offset+=len;return el;})}</svg><div className="dx-donut-center"><strong>{total}</strong><span>requests</span></div></div>
  <ul className="dx-legend">{parts.map(([label,n,tone])=><li key={label}><span className={`dx-dot-key dx-bg-${tone}`}/>{label}<strong>{n}</strong><small>{total?Math.round(n/total*100):0}%</small></li>)}</ul>
  <div className="dx-chip"><Clock3 size={15}/>Median time to decision <strong>{duration(data.decisionTime.medianMs)}</strong></div>
 </section>;
}

const stageIcons=[Inbox,FileSearch,ShieldCheck,Landmark,UserCheck,PenLine,Send,BadgeCheck];
function Pipeline({data}:{data:DashboardDTO}){
 return <section className="dx-card dx-pipeline" aria-label="Payment pipeline"><div className="dx-card-head"><div><h3>Payment pipeline</h3><p>How many requests reached each stage · held items stop with a reason</p></div><span className="dx-pill"><Lock size={13}/>Human signature on every payment</span></div>
  <ol>{data.pipeline.map((stage,index)=>{const Icon=stageIcons[index]??Inbox;return <li key={stage.id}><span className={`dx-stage-icon ${stage.id==='paid'?'is-paid':stage.id==='signed'?'is-human':''}`}><Icon size={20}/></span><strong>{stage.count}</strong><span>{stage.label}</span>{stage.held>0?<small className="dx-held">{stage.held} held</small>:<small className="dx-held is-empty">—</small>}</li>;})}</ol>
 </section>;
}

function Threats({data}:{data:DashboardDTO}){
 const max=Math.max(1,...data.threats.map(t=>t.count));
 return <section className="dx-card dx-threats" aria-label="Threats detected"><div className="dx-card-head"><div><h3>Threats detected</h3><p>Findings on quarantined and held items</p></div><ShieldAlert size={20} className="dx-head-icon"/></div>
  {!data.threats.length?<p className="dx-muted">No threats recorded yet.</p>:<ul>{data.threats.map(t=><li key={t.code}><div><span>{t.title}</span><strong>{t.count}</strong></div><span className="dx-bar" aria-hidden="true"><span style={{width:`${t.count/max*100}%`}}/></span></li>)}</ul>}
 </section>;
}

function Payments({data,navigate}:{data:DashboardDTO;navigate:Props['navigate']}){
 const explorer=data.workspace.environment==='fuji';
 return <section className="dx-card dx-payments" aria-label="Verified payments"><div className="dx-card-head"><div><h3>Verified payments</h3><p>Paid only after the receipt is checked</p></div><Wallet size={20} className="dx-head-icon"/></div>
  {!data.payments.length?<p className="dx-muted">No verified payments yet.</p>:<ul>{data.payments.map(p=><li key={p.id}><span className="dx-pay-mark"/><div><strong>{clean(p.supplierName)}</strong><p>{p.invoiceReference}{p.occurredAt?` · ${date(p.occurredAt,true)}`:''}</p>{p.txHash&&(explorer?<a href={`https://testnet.snowtrace.io/tx/${p.txHash}`} target="_blank" rel="noreferrer">tx {shortHash(p.txHash)} <ArrowUpRight size={12}/></a>:<code>tx {shortHash(p.txHash)}</code>)}</div><span className="dx-pay-amount"><Money value={p.amountAtomic} token={data.token}/></span>{(p.caseId||p.itemId)&&<button aria-label={`Open payment ${p.invoiceReference}`} onClick={()=>navigate(p.itemId?`/inbox/${encodeURIComponent(p.itemId)}`:`/cases/${encodeURIComponent(p.caseId!)}`)}><ArrowUpRight size={16}/></button>}</li>)}</ul>}
 </section>;
}

function Sources({data}:{data:DashboardDTO}){
 const all=data.channels.reduce((s,c)=>s+c.count,0);
 return <section className="dx-card dx-sources" aria-label="Source breakdown"><div className="dx-card-head"><div><h3>Where requests come from</h3><p>Detected automatically on arrival</p></div><ScanSearch size={20} className="dx-head-icon"/></div>
  {all===0?<p className="dx-muted">No sources recorded yet.</p>:<><div className="dx-stack" aria-hidden="true">{data.channels.map(c=>c.count>0&&<span key={c.channel} className={`dx-bg-${c.channel}`} style={{width:`${c.count/all*100}%`}}/>)}</div><ul className="dx-legend">{data.channels.map(c=><li key={c.channel}><span className={`dx-dot-key dx-bg-${c.channel}`}/>{channelNames[c.channel]}<strong>{c.count}</strong><small>{Math.round(c.count/all*100)}%</small></li>)}</ul></>}
 </section>;
}

function Recent({data,navigate}:{data:DashboardDTO;navigate:Props['navigate']}){
 const tone=(s:string)=>s==='quarantined'?'amber':s==='needs_review'?'blue':s==='settled'?'green':s==='approved'?'green':'grey';
 return <section className="dx-card dx-recent" aria-label="Recent activity"><div className="dx-card-head"><div><h3>Recent activity</h3><p>Latest records</p></div></div>
  {!data.recentActivity.length?<p className="dx-muted">No activity recorded yet.</p>:<ol>{data.recentActivity.slice(0,8).map(a=><li key={a.id}><span className={`dx-badge dx-tone-${tone(a.status)}`}>{a.kind==='payment'?<CheckCheck size={16}/>:a.status==='quarantined'?<ShieldAlert size={16}/>:<FileText size={16}/>}</span><div><strong>{clean(a.title)}</strong><p>{status(a.status)} · {date(a.occurredAt,true)} UTC</p></div>{(a.itemId||a.caseId)&&<button aria-label={`Open ${clean(a.title)}`} title="Open in workflow" onClick={()=>navigate(a.itemId?`/inbox/${encodeURIComponent(a.itemId)}`:`/cases/${encodeURIComponent(a.caseId!)}`)}><ArrowUpRight size={16}/></button>}</li>)}</ol>}
 </section>;
}

export default function DashboardPanel({authenticated,onLogin,navigate}:Props){
 const [days,setDays]=useState<7|30|90>(30);
 const query=useQuery({queryKey:['dashboard',days],queryFn:()=>request<DashboardDTO>(`/dashboard?days=${days}`),enabled:authenticated,refetchInterval:30000,retry:false});
 if(!authenticated)return <div className="dx-state" data-testid="dashboard-panel"><ChartNoAxesCombined size={34}/><h2>Your workspace at a glance.</h2><p>Sign in to see threats, decisions and verified payments.</p><button onClick={onLogin}>Sign in to view Dashboard</button></div>;
 if(query.isPending)return <div className="dx-state" role="status" data-testid="dashboard-panel"><ChartNoAxesCombined size={34}/><h2>Loading your Dashboard…</h2><p>Gathering recorded activity and verified payments.</p></div>;
 if(!query.data)return <div className="dx-state" role="alert" data-testid="dashboard-panel"><ShieldAlert size={34}/><h2>Dashboard couldn’t load.</h2><p>No balances or payment outcomes have been inferred.</p><button onClick={()=>void query.refetch()} disabled={query.isFetching}>{query.isFetching?'Retrying…':'Retry Dashboard'}</button></div>;
 const data=query.data,financial=data.coverage.financialsAvailable,t=data.totals;
 return <div className="dx-dashboard" data-testid="dashboard-panel" aria-busy={query.isFetching}>
  <header className="dx-header"><div><span className="dx-eyebrow">{clean(data.workspace.name)} · {data.workspace.environment==='fuji'?'Avalanche Fuji':'Local demonstration'} · DEMO test tokens</span><h2>Security &amp; payments overview</h2><p>Every request, every decision, every verified payment.</p></div>
   <div className="dx-header-actions"><div className="dx-segmented" aria-label="Dashboard period">{([7,30,90] as const).map(value=><button key={value} aria-pressed={days===value} onClick={()=>setDays(value)}>{value} days</button>)}</div><button className="dx-refresh" aria-label="Refresh Dashboard" title="Refresh Dashboard" onClick={()=>void query.refetch()} disabled={query.isFetching}><RefreshCw size={16} className={query.isFetching?'dx-spinning':''}/></button></div></header>
  {query.isError&&<p className="dx-warning" role="alert">Refresh failed. Showing the last recorded snapshot. <button onClick={()=>void query.refetch()}>Try again</button></p>}
  {!financial&&<p className="dx-warning" role="status">Financial data is unavailable for the configured payment network. Source counts remain available.</p>}
  <div className="dx-kpis">
   <Kpi icon={<Inbox size={19}/>} tone="green" label="Requests received" value={t.inboxCount} note={`${data.outcomes.approved} cleared automatically`} spark={data.daily.map(d=>d.inboxCount)}/>
   <Kpi icon={<ShieldAlert size={19}/>} tone="amber" label="Threats quarantined" value={t.securityHoldCount} note={`${data.threats.reduce((s,x)=>s+x.count,0)} findings recorded`} spark={data.daily.map(d=>d.threatCount)}/>
   <Kpi icon={<UserCheck size={19}/>} tone="blue" label="Waiting for a person" value={t.needsReviewCount} note={`${t.unresolvedPaymentCount} payment outcomes to reconcile`} spark={data.daily.map(d=>d.reviewCount)}/>
   <Kpi highlight icon={<CheckCheck size={19}/>} tone="lime" label="Verified paid" value={financial?<Money value={t.verifiedPaidAtomic} token={data.token}/>:'Unavailable'} note={financial?`${t.verifiedPaidCount} of ${t.registeredPayablesCount} registered invoices`:'No verified total available'} spark={data.daily.map(d=>d.verifiedPaidCount)}/>
  </div>
  {t.inboxCount===0&&t.registeredPayablesCount===0&&<div className="dx-empty"><Inbox size={22}/><div><strong>No recorded activity yet.</strong><p>Add an item in the workflow to begin.</p></div></div>}
  <div className="dx-grid-main"><ActivityChart data={data}/><Outcomes data={data}/></div>
  <Pipeline data={data}/>
  <div className="dx-grid-three"><Threats data={data}/><Payments data={data} navigate={navigate}/><Sources data={data}/></div>
  <Recent data={data} navigate={navigate}/>
  <details className="dx-details dx-method"><summary>About these figures</summary><div><p>{data.coverage.basis}</p><p>Only verified settlements count as paid. A workflow clearance is not a payment. Review and security counts may overlap.</p>{data.coverage.limitations.map((limitation,index)=><p key={index}>{limitation}</p>)}<p>Registered: {financial?<Money value={t.registeredPayablesAtomic} token={data.token}/>:'—'} · Not yet verified: {financial?<Money value={t.unpaidRegisteredAtomic} token={data.token}/>:'—'} · Snapshot {date(data.generatedAt,true)} UTC</p></div></details>
 </div>;
}
