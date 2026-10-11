import {Component, lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode} from 'react';
import {useQuery, useQueryClient} from '@tanstack/react-query';
import {ArrowRight, Check, ChevronDown, ChevronLeft, ChevronRight, CircleHelp, FileCheck2, Focus, Inbox, Landmark, Maximize2, Minimize2, MousePointer2, Pause, Play, RotateCcw, RotateCw, ScanLine, ShieldCheck, Workflow, X, ZoomIn, ZoomOut} from 'lucide-react';
import {amount, request} from '../../app/api';
import type {CaseDTO} from '../../app/types';
import {useUI} from '../../app/store';
import {useInbox} from '../inbox/InboxPages';
import {channelNames, type InboxItem} from '../inbox/types';
import {deriveProcessJourney, processStageLabel, type ProcessStageId} from '../../scene/process';
import './operations.css';

const CampusCanvas = lazy(() => import('../../scene/CampusCanvas'));
const icons = {receive: Inbox, security: ShieldCheck, finance: ScanLine, decision: Check, payment: Landmark, report: FileCheck2};
const clean = (text: string) => text.replace(/0x[a-fA-F0-9]{8,64}/g, '[reference]');

class MapBoundary extends Component<{children: ReactNode; onFailure: () => void}, {failed: boolean}> {
  state = {failed: false};
  static getDerivedStateFromError() {return {failed: true};}
  componentDidCatch() {this.props.onFailure();}
  render() {return this.state.failed ? null : this.props.children;}
}

export default function OperationsPage({cases, authenticated, connected, navigate, onLogin}: {cases: CaseDTO[]; authenticated: boolean; connected: boolean; navigate: (path: string) => void; onLogin: () => void}) {
  const inbox = useInbox(authenticated);
  const selection = useUI(s => s.selection);
  const cameraTo = useUI(s => s.cameraTo);
  const viewMode = useUI(s => s.viewMode), setViewMode = useUI(s => s.setViewMode);
  const paused = useUI(s => s.paused), setPaused = useUI(s => s.setPaused), reduced = useUI(s => s.reduced);
  const [chosen, setChosen] = useState(() => selection?.kind === 'case' || selection?.kind === 'payment' ? `case:${selection.id}` : '');
  const [selectedStage, setSelectedStage] = useState<ProcessStageId | null>(() => selection?.kind === 'agent' ? selection.id === 'finance' ? 'finance' : 'receive' : null);
  const [failed, setFailed] = useState(false), [attempt, setAttempt] = useState(0), [help, setHelp] = useState(false), [expanded, setExpanded] = useState(false);
  const [fullscreenError, setFullscreenError] = useState('');
  const root = useRef<HTMLElement>(null);
  const items = inbox.data?.items || [];
  const selectedInboxId = chosen.startsWith('item:') ? chosen.slice(5) : null;
  const listedItem = selectedInboxId ? items.find(item => item.id === selectedInboxId) : items.find(item => item.linkedCaseId === chosen.slice(5));
  const queryClient = useQueryClient();
  const selectedDetail = useQuery({
    queryKey: ['inbox-item', selectedInboxId],
    queryFn: () => request<InboxItem>(`/inbox/${encodeURIComponent(selectedInboxId!)}`),
    enabled: authenticated && !!selectedInboxId && !listedItem,
    initialData: selectedInboxId ? listedItem : undefined,
    initialDataUpdatedAt: inbox.dataUpdatedAt,
    refetchInterval: 5000,
    retry: 1,
  });
  useEffect(() => {
    if (selectedInboxId && listedItem) queryClient.setQueryData<InboxItem>(['inbox-item', selectedInboxId], current => current && current.version > listedItem.version ? current : listedItem);
  }, [queryClient, selectedInboxId, listedItem]);
  const selectedItem = listedItem || (selectedInboxId ? selectedDetail.data : undefined);
  const selectedDetailFailed = !!selectedInboxId && !listedItem && selectedDetail.isError;
  const selectedCase = cases.find(c => c.id === (selectedItem?.linkedCaseId || (chosen.startsWith('case:') ? chosen.slice(5) : '')));
  const journey = useMemo(() => deriveProcessJourney(selectedCase, selectedItem), [selectedCase, selectedItem]);
  const stage = journey.stages.find(s => s.id === selectedStage);
  const stageIndex = journey.stages.findIndex(s => s.id === selectedStage);
  const standaloneCases = cases.filter(c => !items.some(item => item.linkedCaseId === c.id));
  const title = selectedItem?.title || selectedCase?.invoiceReference;
  const fail = useCallback(() => setFailed(true), []);
  useEffect(() => {const change = () => setExpanded(document.fullscreenElement === root.current); document.addEventListener('fullscreenchange', change); return () => document.removeEventListener('fullscreenchange', change);}, []);
  useEffect(() => {if (selectedStage && window.innerWidth <= 900) root.current?.querySelector('.pm-inspector')?.scrollIntoView({block: 'nearest', behavior: reduced ? 'instant' : 'smooth'});}, [selectedStage, reduced]);
  const choose = (key: string) => {setChosen(key); setSelectedStage(null); cameraTo({kind: 'home'});};
  const inspect = (id: ProcessStageId) => {setSelectedStage(id);};
  const closeStage = () => {setSelectedStage(null); root.current?.querySelector<HTMLButtonElement>(`.pm-step[data-stage="${selectedStage}"]`)?.focus({preventScroll: true});};
  const openRecord = () => {if (selectedItem) navigate(`/inbox/${selectedItem.id}`); else if (selectedCase) navigate(`/cases/${selectedCase.id}`);};
  const focus = () => {if (selectedStage) {cameraTo({kind: 'focus', target: selectedStage}); if (window.innerWidth <= 900) root.current?.querySelector('.pm-scene')?.scrollIntoView({block: 'start', behavior: reduced ? 'instant' : 'smooth'});}};
  async function fullscreen() {try {setFullscreenError(''); if (document.fullscreenElement) await document.exitFullscreen(); else await root.current?.requestFullscreen();} catch {setFullscreenError('Full screen is unavailable in this browser. The map controls still work.');}}

  return <main className="pm-page" ref={root}>
    <header className="pm-heading">
      <div><span className="pm-eyebrow">OPERATIONS CAMPUS</span><h1>Follow the flow<span>.</span></h1><p>One journey, from arrival to outcome.</p></div>
      <div className="pm-source-picker">
        <label htmlFor="process-item">Follow an item</label>
        <div><Workflow size={18}/><select id="process-item" value={chosen.startsWith('case:') && selectedItem ? `item:${selectedItem.id}` : chosen} onChange={event => choose(event.target.value)} disabled={!authenticated}>
          <option value="">Explore the process</option>
          {items.length > 0 && <optgroup label="Inbox items">{items.map(item => <option key={item.id} value={`item:${item.id}`}>{channelNames[item.channel]} · {clean(item.title)}</option>)}</optgroup>}
          {selectedInboxId && !listedItem && <optgroup label="Selected item"><option value={`item:${selectedInboxId}`}>{selectedItem ? `${channelNames[selectedItem.channel]} · ${clean(selectedItem.title)}` : selectedDetailFailed ? 'Selected item unavailable' : 'Loading selected item…'}</option></optgroup>}
          {standaloneCases.length > 0 && <optgroup label="Invoice cases">{standaloneCases.map(c => <option key={c.id} value={`case:${c.id}`}>{clean(c.invoiceReference)} · {clean(c.supplierName)}</option>)}</optgroup>}
        </select><ChevronDown size={15}/></div>
      </div>
    </header>
    {inbox.isError && <div className="pm-notice" role="alert">Inbox journeys could not load. Invoice cases remain available.<button onClick={() => void inbox.refetch()}>Try again</button></div>}
    {selectedDetailFailed && <div className="pm-notice" role="alert">{selectedItem ? 'This item could not refresh. Showing its last recorded state.' : 'The selected item could not load. Retry or choose another item.'}<button disabled={selectedDetail.isFetching} onClick={() => void selectedDetail.refetch()}>{selectedDetail.isFetching ? 'Retrying…' : 'Retry selected item'}</button></div>}
    {!authenticated && <div className="pm-notice">Explore each stage, or sign in to follow your items.<button onClick={onLogin}>Sign in</button></div>}
    {chosen && <div className="pm-following" data-testid="process-outcome"><div><span className={selectedDetailFailed ? 'pm-idle-dot' : 'pm-live-dot'}/><strong>{clean(title || (selectedDetailFailed ? 'Selected item unavailable' : 'Loading item…'))}</strong><span>{clean(journey.headline)}</span></div>{selectedCase && <span className="pm-amount">{amount(selectedCase.amountAtomic)} DEMO</span>}<button onClick={openRecord} disabled={!title}>Open review <ArrowRight size={15}/></button></div>}
    <section className={`pm-workspace ${stage ? 'pm-has-inspector' : ''}`} aria-label="Interactive process map">
      <div className="pm-scene" data-view-mode={viewMode}>
        {!failed ? <MapBoundary key={attempt} onFailure={fail}><Suspense fallback={<div className="pm-loading"><Workflow size={28}/><p>Opening the process map…</p></div>}><CampusCanvas stages={journey.stages} selectedStage={selectedStage} onSelectStage={inspect} onFailure={fail} overview={!journey.hasSelection}/></Suspense></MapBoundary> : <div className="pm-fallback" data-testid="process-fallback"><div><h2>Your process, step by step</h2><p>3D is unavailable. You can still inspect every stage.</p><button onClick={() => {setFailed(false); setAttempt(a => a + 1);}}>Retry 3D</button></div><ol>{journey.stages.map((s,i) => <li key={s.id}><button onClick={() => inspect(s.id)} aria-pressed={s.id === selectedStage}><span>{i + 1}</span><strong>{s.title}</strong><small>{journey.hasSelection ? processStageLabel(s) : 'Explore stage'}</small></button></li>)}</ol></div>}
        <div className="pm-map-top"><span className="pm-map-caption"><span className={authenticated && connected ? 'pm-live-dot' : 'pm-idle-dot'}/>{journey.hasSelection ? connected ? 'Recorded journey · live updates' : 'Recorded journey' : 'Process overview'}</span><div className="pm-view-switch" aria-label="Map view"><button aria-pressed={viewMode === '3d'} disabled={failed} onClick={() => setViewMode('3d')}>3D</button><button aria-pressed={viewMode === '2d'} disabled={failed} onClick={() => setViewMode('2d')}>2D</button></div></div>
        {!failed && <div className="pm-map-bottom">
          <div className="pm-camera-controls" aria-label="Map controls">
            <button aria-label="Zoom in" title="Zoom in" onClick={() => cameraTo({kind: 'zoom', value: 1})}><ZoomIn size={18}/></button>
            <button aria-label="Zoom out" title="Zoom out" onClick={() => cameraTo({kind: 'zoom', value: -1})}><ZoomOut size={18}/></button>
            <span/>
            <button aria-label="Rotate left" title="Rotate left" onClick={() => cameraTo({kind: 'rotate', value: -1})}><RotateCcw size={17}/></button>
            <button aria-label="Rotate right" title="Rotate right" onClick={() => cameraTo({kind: 'rotate', value: 1})}><RotateCw size={17}/></button>
            <button aria-label="Fit map" title="Fit map" onClick={() => cameraTo({kind: 'home'})}><Focus size={18}/></button>
            <button aria-label={reduced ? 'Motion reduced in Settings' : paused ? 'Resume scene motion' : 'Pause scene motion'} disabled={reduced} title={reduced ? 'Reduced motion is enabled in Settings' : paused ? 'Resume motion' : 'Pause motion'} onClick={() => setPaused(!paused)}>{paused && !reduced ? <Play size={16}/> : <Pause size={16}/>}</button>
          </div>
          <div className="pm-secondary-controls"><button aria-label="Map help" title="Map help" aria-expanded={help} onClick={() => setHelp(!help)}><CircleHelp size={18}/></button>{typeof document.documentElement.requestFullscreen === 'function' && <button aria-label={expanded ? 'Exit full screen' : 'Full screen map'} title={expanded ? 'Exit full screen' : 'Full screen'} onClick={() => void fullscreen()}>{expanded ? <Minimize2 size={18}/> : <Maximize2 size={18}/>}</button>}</div>
        </div>}
        {help && <div className="pm-help"><strong>Explore at your pace</strong><p>Drag to move. Scroll or pinch to zoom. Right-drag to rotate. Select a station to inspect it.</p><p>Choose an item above to see its recorded checks. Map controls never change a review or payment.</p><button onClick={() => setHelp(false)}>Got it</button></div>}
      </div>
      {stage && <aside className="pm-inspector" aria-label="Stage details" data-testid="process-inspector" onKeyDown={event => {if (event.key === 'Escape') {event.preventDefault(); closeStage();}}}>
        <div className="pm-inspector-top"><span>STAGE {String(stageIndex + 1).padStart(2, '0')} / 06</span><button aria-label="Close stage details" onClick={closeStage}><X size={18}/></button></div>
        <div className={`pm-stage-symbol pm-status-${stage.status}`}>{(() => {const Icon = icons[stage.id]; return <Icon size={27}/>;})()}</div>
        <h2>{stage.title}</h2>
        {journey.hasSelection && <span className={`pm-stage-badge pm-status-${stage.status}`}>{processStageLabel(stage)}</span>}
        <p>{clean(stage.summary)}</p>
        {stage.detail && <details><summary>What this means</summary><p>{clean(stage.detail)}</p></details>}
        <div className="pm-stage-actions">{!failed && <button onClick={focus}><Focus size={16}/>Focus station</button>}{journey.hasSelection && <button className="pm-primary" onClick={openRecord}>Open review<ArrowRight size={16}/></button>}</div>
        <div className="pm-stage-pagination"><button aria-label="Previous stage" disabled={stageIndex === 0} onClick={() => inspect(journey.stages[stageIndex - 1]!.id)}><ChevronLeft size={17}/>Previous</button><button aria-label="Next stage" disabled={stageIndex === 5} onClick={() => inspect(journey.stages[stageIndex + 1]!.id)}>Next<ChevronRight size={17}/></button></div>
      </aside>}
    </section>
    <nav className="pm-stage-nav" aria-label="Process stages">{journey.stages.map((s, i) => {const Icon = icons[s.id];return <button key={s.id} data-stage={s.id} className={`pm-step pm-status-${journey.hasSelection ? s.status : 'waiting'}`} aria-pressed={selectedStage === s.id} aria-label={`${i + 1}. ${s.title}${journey.hasSelection ? `: ${processStageLabel(s)}` : ''}`} onClick={() => inspect(s.id)}><span className="pm-step-number">{journey.hasSelection && s.status === 'complete' ? <Check size={15}/> : String(i + 1).padStart(2, '0')}</span><span><strong>{s.title}</strong>{journey.hasSelection && <small>{processStageLabel(s)}</small>}</span><Icon className="pm-step-icon" size={16}/></button>;})}</nav>
    <footer className="pm-footer"><span><MousePointer2 size={13}/>{stage ? 'Select another station to explore.' : 'Select a station, or follow an item above.'}</span>{journey.hasSelection ? <div><span><i className="pm-key-complete"/>Recorded</span><span><i className="pm-key-attention"/>Needs attention</span><span><i className="pm-key-waiting"/>Not reached</span></div> : <span>Map exploration never changes a payment.</span>}</footer>
    {inbox.data && inbox.data.total > items.length && <p className="pm-footnote">The item selector shows the latest {items.length} inbox items. Older records remain in your inbox.</p>}
    {fullscreenError && <p className="pm-footnote" role="status">{fullscreenError}</p>}
  </main>;
}
