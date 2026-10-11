import {useId,useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {ArrowUpRight,ChartNoAxesCombined,CheckCheck,Clock3,FileText,Inbox,RefreshCw,ShieldAlert} from 'lucide-react';
import type {DashboardDTO} from '@secure-finance/shared';
import {request} from '../../app/api';
import {chartRatio,dashboardAmount,maximumAtomic} from './amounts';
import './dashboard.css';

type Props={authenticated:boolean;onLogin:()=>void;navigate:(path:string)=>void};
type ChartMode='payments'|'arrivals'|'approvals';
const channelNames={invoice:'Invoices',email:'Emails',voice:'Voice notes',text:'Messages'};
const chartNames:Record<ChartMode,string>={payments:'Verified payments',arrivals:'Items received',approvals:'Workflow approvals'};
const clean=(value:string)=>value.replace(/0x[a-fA-F0-9]{8,64}/g,'[reference]');
function date(value:string,withTime=false){const d=new Date(value);return Number.isNaN(d.getTime())?'Date not recorded':new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'short',...(withTime?{hour:'2-digit',minute:'2-digit'}:{}),timeZone:'UTC'}).format(d);}
function status(value:string){const labels:Record<string,string>={SETTLED:'Verified payment',VERIFIED:'Verified payment',settled:'Verified payment',approved:'Checks completed',needs_review:'Needs review',quarantined:'Security hold',processing:'Processing',rejected:'Declined'};return labels[value]||value.toLowerCase().replaceAll('_',' ');}
function Money({value,token}:{value:string;token:DashboardDTO['token']}){return <span className="df-money">{dashboardAmount(value,token.decimals)} <small>{token.symbol}</small></span>;}

function ActivityChart({data}:{data:DashboardDTO}){
 const [mode,setMode]=useState<ChartMode>('payments');
 const id=useId(),financial=data.coverage.financialsAvailable;
 const values=data.daily.map(day=>mode==='payments'?day.verifiedPaidAtomic:String(mode==='arrivals'?day.inboxCount:day.workflowApprovedCount));
 const max=maximumAtomic(values),sum=values.reduce((total,value)=>total+BigInt(value),0n);
 const height=144,bottom=172,span=684,start=18;
 const points=values.map((value,index)=>({x:start+(values.length>1?index/(values.length-1)*span:span/2),y:bottom-chartRatio(value,max)*height,value}));
 const plotted=points.map(point=>`${point.x},${point.y}`).join(' ');
 const unavailable=mode==='payments'&&!financial;
 const total=mode==='payments'?`${dashboardAmount(sum.toString(),data.token.decimals)} ${data.token.symbol}`:sum.toString();
 const modeLabel=chartNames[mode];
 return <section className="df-chart df-card" aria-label="Activity over time">
  <div className="df-section-heading"><div><h3>Activity over time</h3><p>{date(data.window.from)} – {date(data.window.to)} · UTC</p></div><div className="df-chart-modes" aria-label="Chart measure">{(['payments','arrivals','approvals'] as const).map(key=><button key={key} aria-pressed={mode===key} onClick={()=>setMode(key)}>{key==='payments'?'Payments':key==='arrivals'?'Arrivals':'Approvals'}</button>)}</div></div>
  <div className="df-chart-total"><strong>{unavailable?'Unavailable':total}</strong><span>{modeLabel.toLowerCase()} in this period</span></div>
  {unavailable?<p className="df-chart-empty">Payment data is unavailable for this workspace configuration. Source activity is still available.</p>:<>
   <svg viewBox="0 0 720 206" role="img" aria-labelledby={`${id}-title ${id}-desc`} className="df-plot">
    <title id={`${id}-title`}>{modeLabel} over {data.window.days} days</title><desc id={`${id}-desc`}>{total} recorded in this period. Each point represents one UTC observation date. Exact figures are in the daily figures table below.</desc>
    {[28,100,172].map(y=><line key={y} x1="18" y1={y} x2="702" y2={y} className="df-grid-line"/>)}
    {sum>0n&&<polygon points={`18,${bottom} ${plotted} 702,${bottom}`} className="df-chart-area"/>}
    <polyline points={plotted} className="df-chart-line"/>
    {points.map((point,index)=><circle key={data.daily[index]!.date} cx={point.x} cy={point.y} r={point.value==='0'?2:3.5} className="df-chart-dot"><title>{date(data.daily[index]!.date)}: {mode==='payments'?`${dashboardAmount(point.value,data.token.decimals)} ${data.token.symbol}`:point.value}</title></circle>)}
    {data.daily.length>0&&<><text x="18" y="198">{date(data.daily[0]!.date)}</text><text x="702" y="198" textAnchor="end">{date(data.daily.at(-1)!.date)}</text></>}
   </svg>
   {sum===0n&&<p className="df-zero-note">No {modeLabel.toLowerCase()} recorded in this period.</p>}
  </>}
  <p className="df-chart-note">Dates reflect when records were observed, which may differ from the payment’s network date.{mode==='approvals'?' First recorded workflow clearance. A workflow approval is a completed review, not a payment.':''}</p>
  <details className="df-details"><summary>View daily figures</summary><div className="df-table-scroll" role="region" aria-label="Daily activity figures" tabIndex={0}><table><caption>Exact recorded activity · UTC observation dates</caption><thead><tr><th scope="col">Date</th><th scope="col">Received</th><th scope="col">Approved</th><th scope="col">Paid count</th><th scope="col">Verified paid · {data.token.symbol}</th></tr></thead><tbody>{data.daily.map(day=><tr key={day.date}><th scope="row">{date(day.date)}</th><td>{day.inboxCount}</td><td>{day.workflowApprovedCount}</td><td>{financial?day.verifiedPaidCount:'Unavailable'}</td><td>{financial?dashboardAmount(day.verifiedPaidAtomic,data.token.decimals):'Unavailable'}</td></tr>)}</tbody></table></div></details>
 </section>;
}

export default function DashboardPanel({authenticated,onLogin,navigate}:Props){
 const [days,setDays]=useState<7|30|90>(30);
 const query=useQuery({queryKey:['dashboard',days],queryFn:()=>request<DashboardDTO>(`/dashboard?days=${days}`),enabled:authenticated,refetchInterval:30000,retry:false});
 if(!authenticated)return <div className="df-state" data-testid="dashboard-panel"><ChartNoAxesCombined size={34}/><h2>Your workspace at a glance.</h2><p>Sign in to see your recorded activity and finances.</p><button onClick={onLogin}>Sign in to view Dashboard</button></div>;
 if(query.isPending)return <div className="df-state" role="status" data-testid="dashboard-panel"><ChartNoAxesCombined size={34}/><h2>Loading your Dashboard…</h2><p>Gathering recorded activity and verified payments.</p></div>;
 if(!query.data)return <div className="df-state" role="alert" data-testid="dashboard-panel"><ShieldAlert size={34}/><h2>Dashboard couldn’t load.</h2><p>No balances or payment outcomes have been inferred.</p><button onClick={()=>void query.refetch()} disabled={query.isFetching}>{query.isFetching?'Retrying…':'Retry Dashboard'}</button></div>;
 const data=query.data,financial=data.coverage.financialsAvailable,t=data.totals;
 const allChannels=data.channels.reduce((sum,channel)=>sum+channel.count,0);
 const supplierMaximum=maximumAtomic(data.suppliers.map(supplier=>supplier.verifiedPaidAtomic));
 return <div className="df-dashboard" data-testid="dashboard-panel" aria-busy={query.isFetching}>
  <div className="df-overview"><div><span className="df-eyebrow">{clean(data.workspace.name)}</span><h2>Recorded finances.</h2><p>DEMO test tokens · {data.workspace.environment==='fuji'?'Avalanche test network':'Local demonstration'}</p></div><button className="df-refresh" aria-label="Refresh Dashboard" title="Refresh Dashboard" onClick={()=>void query.refetch()} disabled={query.isFetching}><RefreshCw size={16} className={query.isFetching?'df-spinning':''}/></button></div>
  {query.isError&&<p className="df-warning" role="alert">Refresh failed. Showing the last recorded snapshot. <button onClick={()=>void query.refetch()}>Try again</button></p>}
  {!financial&&<p className="df-warning" role="status">Financial data is unavailable for the configured payment network. Source counts remain available.</p>}
  <div className="df-summary-label"><span>All recorded history</span><small>Snapshot {date(data.generatedAt,true)} UTC</small></div>
  <div className="df-totals">
   <section className="df-metric"><span className="df-metric-title"><FileText size={17}/>Registered payables</span><strong>{financial?<Money value={t.registeredPayablesAtomic} token={data.token}/>:<span>Unavailable</span>}</strong><p>{financial?`${t.registeredPayablesCount} trusted obligations`:'No financial total available'}</p></section>
   <section className="df-metric df-metric-paid"><span className="df-metric-title"><CheckCheck size={17}/>Verified payments</span><strong>{financial?<Money value={t.verifiedPaidAtomic} token={data.token}/>:<span>Unavailable</span>}</strong><p>{financial?`${t.verifiedPaidCount} obligations with verified settlement`:'No verified total available'}</p></section>
   <section className="df-metric"><span className="df-metric-title"><Clock3 size={17}/>Not yet verified</span><strong>{financial?<Money value={t.unpaidRegisteredAtomic} token={data.token}/>:<span>Unavailable</span>}</strong><p>{financial?`${t.unpaidRegisteredCount} obligations without verified settlement`:'No remaining total available'}</p></section>
  </div>
  <dl className="df-counts"><div><dt>Items received</dt><dd>{t.inboxCount}</dd></div><div><dt>Need review</dt><dd>{t.needsReviewCount}</dd></div><div><dt>Security holds</dt><dd>{t.securityHoldCount}</dd></div><div><dt>Unresolved payments</dt><dd>{financial?t.unresolvedPaymentCount:'—'}</dd></div></dl>
  {t.inboxCount===0&&t.registeredPayablesCount===0&&<div className="df-empty-inline"><Inbox size={22}/><div><strong>No recorded activity yet.</strong><p>Add an item in the workflow to begin. Your figures will appear here as records become available.</p></div></div>}
  <div className="df-period"><span>Chart period</span><div aria-label="Dashboard period">{([7,30,90] as const).map(value=><button key={value} aria-pressed={days===value} onClick={()=>setDays(value)}>{value} days</button>)}</div></div>
  <ActivityChart data={data}/>
  <div className="df-two-columns">
   <section className="df-card df-sources" aria-label="Source breakdown"><div className="df-section-heading"><div><h3>Where items come from</h3><p>Received · all recorded history</p></div></div>{allChannels===0?<p className="df-muted">No sources recorded in this period.</p>:<ul>{data.channels.map(channel=><li key={channel.channel}><div><span>{channelNames[channel.channel]}</span><strong>{channel.count}</strong></div><span className="df-bar" aria-hidden="true"><span style={{width:`${channel.count/allChannels*100}%`}}/></span></li>)}</ul>}</section>
   <section className="df-card df-supplier" aria-label="Supplier spending"><div className="df-section-heading"><div><h3>Supplier spending</h3><p>Verified payments · all recorded history</p></div></div>{!financial?<p className="df-muted">Financial data is unavailable.</p>:!data.suppliers.length?<p className="df-muted">No registered suppliers yet.</p>:<ul>{data.suppliers.map(supplier=><li key={supplier.supplierKey}><div className="df-supplier-heading"><strong>{clean(supplier.name)}</strong><Money value={supplier.verifiedPaidAtomic} token={data.token}/></div><span className="df-bar" aria-hidden="true"><span style={{width:`${chartRatio(supplier.verifiedPaidAtomic,supplierMaximum)*100}%`}}/></span><p>{supplier.verifiedPaidCount} paid of {supplier.payablesCount} obligations<span>Registered: <Money value={supplier.registeredAtomic} token={data.token}/></span></p></li>)}</ul>}</section>
  </div>
  <section className="df-card df-recent" aria-label="Recent activity"><div className="df-section-heading"><div><h3>Recent activity</h3><p>Latest records · all recorded history</p></div></div>{!data.recentActivity.length?<p className="df-muted">No activity recorded in this period.</p>:<ol>{data.recentActivity.map(activity=><li key={activity.id}><span className={`df-activity-icon ${activity.kind==='payment'?'is-payment':''}`}>{activity.kind==='payment'?<CheckCheck size={17}/>:<Inbox size={17}/>}</span><div><strong>{clean(activity.title)}</strong><p>{activity.kind==='payment'?'Payment':'Source'} · {status(activity.status)}<span>{date(activity.occurredAt,true)} UTC</span></p></div>{(activity.itemId||activity.caseId)&&<button aria-label={`Open ${clean(activity.title)}`} title="Open in workflow" onClick={()=>navigate(activity.itemId?`/inbox/${encodeURIComponent(activity.itemId)}`:`/cases/${encodeURIComponent(activity.caseId!)}`)}><ArrowUpRight size={18}/></button>}</li>)}</ol>}</section>
  <details className="df-method df-details"><summary>About these figures</summary><div><p>{data.coverage.basis}</p><p>Headline totals, supplier spending, source channels and the recent list cover all recorded history. The activity chart uses the selected period.</p><p>Only verified settlements count as paid. “Not yet verified” does not mean overdue. Review and security counts may overlap.</p>{data.coverage.excludedUnverifiedCount>0&&<p>{data.coverage.excludedUnverifiedCount} unverified payment observations are excluded from paid totals.</p>}{data.coverage.undatedSettlementsCount>0&&<p>{data.coverage.undatedSettlementsCount} verified settlements have no observation date and are omitted from daily charts.</p>}{data.coverage.limitations.map((limitation,index)=><p key={index}>{limitation}</p>)}<dl><div><dt>Data</dt><dd>{data.workspace.dataEnvironment==='synthetic'?'Synthetic demonstration records':data.workspace.dataEnvironment}</dd></div><div><dt>Your roles</dt><dd>{data.workspace.accountRoles.length?data.workspace.accountRoles.join(', '):'No roles recorded'}</dd></div></dl></div></details>
 </div>;
}
