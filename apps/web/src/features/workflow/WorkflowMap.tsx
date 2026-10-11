import {Component,lazy,Suspense,useCallback,useState,type ReactNode} from 'react';
import {ArrowRight,Check,Focus,Pause,Play,RotateCcw,Workflow,X,ZoomIn,ZoomOut} from 'lucide-react';
import {useUI} from '../../app/store';
import {processStageLabel,type ProcessJourney,type ProcessStageId} from '../../scene/process';
import '../operations/operations.css';
const CampusCanvas=lazy(()=>import('../../scene/CampusCanvas'));
class MapBoundary extends Component<{children:ReactNode;onFailure:()=>void},{failed:boolean}>{
 state={failed:false};static getDerivedStateFromError(){return {failed:true};}
 componentDidCatch(){this.props.onFailure();}render(){return this.state.failed?null:this.props.children;}
}
export default function WorkflowMap({journey,onOpenStage}:{journey:ProcessJourney;onOpenStage:(id:ProcessStageId)=>void}){
 const [selected,setSelected]=useState<ProcessStageId|null>(null),[failed,setFailed]=useState(false),[attempt,setAttempt]=useState(0);
 const cameraTo=useUI(s=>s.cameraTo),view=useUI(s=>s.viewMode),setView=useUI(s=>s.setViewMode),paused=useUI(s=>s.paused),setPaused=useUI(s=>s.setPaused),reduced=useUI(s=>s.reduced);
 const fail=useCallback(()=>setFailed(true),[]),stage=journey.stages.find(s=>s.id===selected);
 return <section className="wf-map" aria-label="Interactive process map">
  <div className="wf-map-heading"><div><span className="wf-eyebrow">THE JOURNEY</span><h2>{journey.hasSelection?'Every step, in view.':'From arrival to assurance.'}</h2></div><div className="pm-view-switch" aria-label="Map view">{(['3d','2d'] as const).map(mode=><button key={mode} disabled={failed} aria-pressed={view===mode} onClick={()=>setView(mode)}>{mode.toUpperCase()}</button>)}</div></div>
  <div className="pm-scene wf-map-scene" data-view-mode={view}>
   {!failed?<MapBoundary key={attempt} onFailure={fail}><Suspense fallback={<div className="pm-loading"><Workflow size={28}/><p>Opening your workflow…</p></div>}><CampusCanvas stages={journey.stages} selectedStage={selected} onSelectStage={setSelected} onFailure={fail} overview={!journey.hasSelection}/></Suspense></MapBoundary>:<div className="wf-map-fallback" data-testid="process-fallback"><Workflow size={36}/><h3>Your journey is still here.</h3><p>Select a step below to inspect its checks.</p><button onClick={()=>{setAttempt(n=>n+1);setFailed(false);}}>Retry 3D</button></div>}
   <div className="wf-map-caption">{journey.hasSelection?journey.headline:'Select a station to explore the process'}</div>
   {!failed&&<div className="pm-camera-controls wf-map-controls" aria-label="Map controls"><button aria-label="Zoom in" onClick={()=>cameraTo({kind:'zoom',value:1})}><ZoomIn size={17}/></button><button aria-label="Zoom out" onClick={()=>cameraTo({kind:'zoom',value:-1})}><ZoomOut size={17}/></button><button aria-label="Rotate map" onClick={()=>cameraTo({kind:'rotate',value:1})}><RotateCcw size={17}/></button><button aria-label="Fit map" onClick={()=>cameraTo({kind:'home'})}><Focus size={17}/></button><button aria-label={reduced?'Motion reduced in Settings':paused?'Resume scene motion':'Pause scene motion'} disabled={reduced} onClick={()=>setPaused(!paused)}>{paused?<Play size={16}/>:<Pause size={16}/>}</button></div>}
  </div>
  <nav className="wf-steps" aria-label="Process stages">{journey.stages.map((s,i)=><button key={s.id} data-stage={s.id} className={`wf-step pm-status-${journey.hasSelection?s.status:'waiting'}`} aria-pressed={selected===s.id} onClick={()=>setSelected(s.id)}><span>{journey.hasSelection&&s.status==='complete'?<Check size={13}/>:i+1}</span><div><strong>{s.title}</strong><small>{journey.hasSelection?processStageLabel(s):'Explore'}</small></div></button>)}</nav>
  {stage&&<div className="wf-stage-detail" data-testid="process-inspector"><div><strong>{stage.title}</strong><p>{stage.summary}</p>{stage.detail&&<details><summary>More detail</summary><p>{stage.detail}</p></details>}<div className="wf-stage-actions">{!failed&&<button onClick={()=>cameraTo({kind:'focus',target:stage.id})}><Focus size={14}/>Focus station</button>}{journey.hasSelection&&<button onClick={()=>onOpenStage(stage.id)}>{stage.id==='report'?'Open reports':stage.id==='payment'?'Go to payment':'Go to review'}<ArrowRight size={14}/></button>}</div></div><button aria-label="Close stage details" onClick={()=>{setSelected(null);document.querySelector<HTMLButtonElement>(`.wf-step[data-stage="${stage.id}"]`)?.focus();}}><X size={17}/></button></div>}
 </section>;
}
