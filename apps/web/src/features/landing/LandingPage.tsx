import {Component,lazy,Suspense,useCallback,useEffect,useRef,useState,type ReactNode} from 'react';
import {useQuery} from '@tanstack/react-query';
import {ArrowDown,ArrowRight,ArrowUpRight,Check,ChevronLeft,ChevronRight,Globe2,Leaf,Pause,Play,RefreshCw,RotateCcw} from 'lucide-react';
import type {NetworkActivity} from '@secure-finance/shared';
import {request} from '../../app/api';
import {useUI} from '../../app/store';
import type {GlobeCommand} from './GlobeCanvas';
import './landing.css';

const GlobeCanvas=lazy(()=>import('./GlobeCanvas'));
class GlobeBoundary extends Component<{children:ReactNode;onFailure:()=>void},{failed:boolean}>{
  state={failed:false};
  static getDerivedStateFromError(){return {failed:true};}
  componentDidCatch(){this.props.onFailure();}
  render(){return this.state.failed?null:this.props.children;}
}
const shortHash=(value:string)=>`${value.slice(0,6)}…${value.slice(-4)}`;
function webglUnavailable(){try{const canvas=document.createElement('canvas'),context=canvas.getContext('webgl2');if(!context)return true;context.getExtension('WEBGL_lose_context')?.loseContext();return false;}catch{return true;}}
function valueLabel(value:string){
  const [whole,fraction='']=value.split('.');
  if(BigInt(whole||'0')>=1000n)return `${Number(whole).toLocaleString('en',{maximumFractionDigits:0})} AVAX`;
  const significant=fraction.replace(/0+$/,'');
  if(whole==='0'&&significant&&/^0{4}/.test(significant))return '<0.0001 AVAX';
  return `${whole}${significant?'.'+significant.slice(0,4):''} AVAX`;
}
function clockTime(timestamp:string){const date=new Date(timestamp);return Number.isFinite(date.getTime())?date.toLocaleTimeString('en',{hour:'2-digit',minute:'2-digit',second:'2-digit'}):'Time unavailable';}

export default function LandingPage({onStart}:{onStart:()=>void}){
  const reduced=useUI(state=>state.reduced),paused=useUI(state=>state.paused),setPaused=useUI(state=>state.setPaused);
  const [failed,setFailed]=useState(webglUnavailable),[entering,setEntering]=useState(false),[highlight,setHighlight]=useState<string|null>(null);
  const [command,setCommand]=useState<GlobeCommand>({kind:'reset',nonce:0});
  const [clientNow,setClientNow]=useState(Date.now),[online,setOnline]=useState(()=>navigator.onLine);
  const timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined),entryLock=useRef(false),globeRegion=useRef<HTMLDivElement>(null);
  const fail=useCallback(()=>setFailed(true),[]);
  const network=useQuery({queryKey:['public-network-activity'],queryFn:({signal})=>request<NetworkActivity>('/network/activity',{signal}),retry:1,refetchInterval:query=>Math.max(10000,query.state.data?.nextRefreshAfterMs??10000),refetchIntervalInBackground:false});
  const data=network.data,transactions=data?.transactions??[];
  const clientAge=typeof data?.ageMs==='number'?data.ageMs+Math.max(0,clientNow-network.dataUpdatedAt):Infinity;
  const fresh=!!data&&data.status==='fresh'&&!network.isError&&online&&clientAge<=30000;
  const stale=!!data&&!fresh&&!!data.fetchedAt;
  const stateLabel=fresh?'Live network':stale?'Last recorded activity':network.isPending?'Connecting to network':'Network unavailable';
  const turn=(kind:GlobeCommand['kind'])=>setCommand(current=>({kind,nonce:current.nonce+1}));
  const cancel=useCallback(()=>{clearTimeout(timer.current);entryLock.current=false;setEntering(false);setCommand(current=>({kind:'reset',nonce:current.nonce+1}));},[]);
  useEffect(()=>()=>clearTimeout(timer.current),[]);
  useEffect(()=>{
    const update=()=>{setClientNow(Date.now());setOnline(navigator.onLine);};
    const tick=setInterval(()=>{if(!document.hidden)update();},5000);
    document.addEventListener('visibilitychange',update);window.addEventListener('online',update);window.addEventListener('offline',update);
    return()=>{clearInterval(tick);document.removeEventListener('visibilitychange',update);window.removeEventListener('online',update);window.removeEventListener('offline',update);};
  },[]);
  useEffect(()=>{if(!entering)return;const escape=(event:KeyboardEvent)=>{if(event.key==='Escape')cancel();};window.addEventListener('keydown',escape);return()=>window.removeEventListener('keydown',escape);},[entering,cancel]);
  const start=()=>{
    if(entryLock.current)return;
    entryLock.current=true;
    if(reduced||paused||failed){onStart();return;}
    setEntering(true);timer.current=setTimeout(()=>onStart(),1050);
  };
  const currentHashes=transactions.slice(0,7).map(transaction=>transaction.hash);

  return <main className={`sg-landing ${entering?'sg-entering':''}`} data-testid="landing-page" data-network-state={fresh?'fresh':stale?'stale':'unavailable'}>
    <header className="sg-header">
      <a className="sg-brand" href="/" aria-label="SecureFinance home"><span><Leaf size={23} strokeWidth={1.6}/></span>SecureFinance</a>
      <span className="sg-header-note">A wider view. A clearer decision.</span>
      <a className="sg-header-link" href="#network-activity">Network activity <ArrowDown size={14}/></a>
    </header>

    <section className="sg-hero" aria-labelledby="landing-title">
      <div className="sg-editorial">
        <p className="sg-eyebrow"><span/>FINANCE, IN PERSPECTIVE</p>
        <h1 id="landing-title">Every payment.<br/>A clearer<br/><em>picture.</em></h1>
        <p className="sg-introduction">Bring the message, the checks and the decision into one calm workspace.</p>
        <div className="sg-start-group"><button className="sg-start" onClick={start} disabled={entering} data-testid="landing-start"><span>{entering?'Opening workspace':'Start'}</span><span className="sg-start-arrow"><ArrowUpRight size={23} strokeWidth={1.6}/></span></button>{entering?<button className="sg-cancel" onClick={cancel}>Cancel</button>:<span className="sg-start-note">Your workspace starts here.</span>}</div>
        <div className="sg-promise"><span><Check size={13}/>Understand the source</span><span><Check size={13}/>Keep the decision</span></div>
      </div>

      <div className="sg-world">
        <div className="sg-world-coordinate" aria-hidden="true"><span>GLOBAL CONTEXT</span><span>DRAG TO ROTATE</span></div>
        <div ref={globeRegion} className="sg-globe-region" role="group" tabIndex={0} aria-label="Interactive Earth. Drag to rotate, or use the arrow keys. Home resets the view." onKeyDown={event=>{if(entering)return;const keys:Record<string,GlobeCommand['kind']>={ArrowLeft:'left',ArrowRight:'right',ArrowUp:'up',ArrowDown:'down',Home:'reset'};const action=keys[event.key];if(action){event.preventDefault();turn(action);}}}>
          <div className="sg-earth-shadow"/>
          {failed?<div className="sg-globe-fallback" data-testid="globe-fallback"><Globe2 size={100} strokeWidth={.5}/><p>Interactive globe unavailable</p></div>:<GlobeBoundary onFailure={fail}><Suspense fallback={<div className="sg-globe-loading"><Globe2 size={42} strokeWidth={.7}/><span>Opening the world…</span></div>}><GlobeCanvas hashes={currentHashes} activityLive={fresh} highlight={highlight} paused={paused} reduced={reduced} entering={entering} command={command} onFailure={fail}/></Suspense></GlobeBoundary>}
        </div>
        <div className="sg-globe-controls" aria-label="Globe controls">
          <span>Drag to explore</span><button aria-label="Rotate globe left" title="Rotate left" disabled={failed||entering} onClick={()=>turn('left')}><ChevronLeft size={17}/></button><button aria-label="Rotate globe right" title="Rotate right" disabled={failed||entering} onClick={()=>turn('right')}><ChevronRight size={17}/></button><button aria-label="Reset globe view" title="Reset view" disabled={failed||entering} onClick={()=>turn('reset')}><RotateCcw size={15}/></button><i/><button aria-label={reduced?'Globe motion reduced in Settings':paused?'Resume globe motion':'Pause globe motion'} title={reduced?'Reduced motion enabled':paused?'Resume motion':'Pause motion'} disabled={reduced||failed||entering} onClick={()=>setPaused(!paused)}>{paused&&!reduced?<Play size={15}/>:<Pause size={15}/>}</button>
        </div>
      </div>

      <aside className="sg-activity" id="network-activity" aria-labelledby="activity-title">
        <div className="sg-activity-heading"><span className="sg-avalanche-mark" aria-hidden="true">▲</span><div><h2 id="activity-title">Avalanche</h2><p>C-Chain · Public mainnet</p></div><span className={`sg-network-light ${fresh?'is-fresh':''}`} title={stateLabel}/></div>
        <div className="sg-feed-state"><span>{stateLabel}</span>{network.isFetching&&<RefreshCw size={11} className={reduced||paused?'':'sg-turning'}/>}</div>
        <ol className="sg-transactions" aria-label="Recent public transactions">
          {transactions.slice(0,4).map((transaction,index)=><li key={transaction.hash}><a href={transaction.explorerUrl} target="_blank" rel="noopener noreferrer" aria-label={`View transaction ${transaction.hash} in the explorer`} onMouseEnter={()=>setHighlight(transaction.hash)} onMouseLeave={()=>setHighlight(null)} onFocus={()=>setHighlight(transaction.hash)} onBlur={()=>setHighlight(null)}><span className="sg-tx-number">{String(index+1).padStart(2,'0')}</span><span className="sg-tx-detail"><strong>{valueLabel(transaction.valueAvax)}</strong><small>{shortHash(transaction.hash)}<span>·</span>{clockTime(transaction.timestamp)}</small></span><ArrowUpRight size={14}/></a></li>)}
        </ol>
        {!transactions.length&&<p className="sg-feed-empty">{network.isPending?'Reading recent finalized blocks…':fresh?'The latest sampled blocks contain no transactions.':'Public activity is unavailable right now. Your workspace is still ready.'}</p>}
        {(stale||network.isError||data?.status==='unavailable')&&<button className="sg-feed-retry" onClick={()=>void network.refetch()} disabled={network.isFetching}><RefreshCw size={12}/>Try again</button>}
        {data?.latestBlock&&<a className="sg-block" href={data.latestBlock.explorerUrl} target="_blank" rel="noopener noreferrer"><span>Finalized block</span><strong>#{BigInt(data.latestBlock.number).toLocaleString('en')}</strong><ArrowUpRight size={12}/></a>}
        <p className="sg-activity-disclaimer">Block inclusion only. <br/>Transaction outcomes are not checked.</p>
      </aside>
    </section>

    <footer className="sg-footer"><div className="sg-footer-story"><span className="sg-footer-icon"><Globe2 size={19} strokeWidth={1.4}/></span><p>A live network.<br/><strong>A deliberate decision.</strong></p></div><p className="sg-placement-note">Arcs illustrate real transaction records. <br/>Positions are illustrative, never sender locations.</p><p className="sg-workspace-note">Public mainnet activity is separate from <br/>your synthetic, test-token workspace.</p></footer>
    {entering&&<div className="sg-entry-wash" aria-hidden="true"/>}
    <span className="sg-sr-only" role="status">{entering?'Opening your workspace. Press Escape to cancel.':''}</span>
  </main>;
}
