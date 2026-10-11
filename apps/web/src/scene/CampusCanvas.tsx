import {Suspense,useEffect,useMemo,useRef,useState,type RefObject} from 'react';
import {Canvas,useFrame,useThree,type ThreeEvent} from '@react-three/fiber';
import {Html,Line} from '@react-three/drei';
import * as THREE from 'three';
import {useUI} from '../app/store';
import {processStageLabel,type ProcessStage,type ProcessStageId} from './process';
import {ProcessEquipment,ProcessPlatform} from './ProcessModels';
import ProcessCamera from './ProcessCamera';
import {PROCESS_HOME_POSITION,PROCESS_HOME_TARGET,PROCESS_LABEL_HEIGHT,PROCESS_STAGE_ORDER,getProcessLayout,type ProcessPoint,type ProcessRoute} from './process-layout';

type CampusProps={stages:ProcessStage[];selectedStage:ProcessStageId|null;onSelectStage:(id:ProcessStageId)=>void;onFailure:()=>void;overview?:boolean};
const colors={complete:'#247f63',active:'#38ae82',attention:'#bd8046',waiting:'#aebbb2',unavailable:'#c8d1ca'};
const selectionOutline:ProcessPoint[]=[];
for(let corner=0;corner<4;corner++){
  const centers:[[number,number],[number,number],[number,number],[number,number]]=[[3.67,3.12],[-3.67,3.12],[-3.67,-3.12],[3.67,-3.12]];
  const [x,z]=centers[corner]!;
  for(let step=0;step<=8;step++){const angle=corner*Math.PI/2+step/8*Math.PI/2;selectionOutline.push([x+Math.cos(angle)*.64,.69,z+Math.sin(angle)*.64]);}
}
selectionOutline.push(selectionOutline[0]!);

function Station({stage,index,selected,onSelectStage,portal,overview,position}:{stage:ProcessStage;index:number;selected:boolean;position:ProcessPoint;onSelectStage:(id:ProcessStageId)=>void;portal:RefObject<HTMLDivElement|null>;overview:boolean}){
  const cameraTo=useUI(state=>state.cameraTo);
  const {gl}=useThree();
  const accent=overview?'#277d61':colors[stage.status];
  const select=(event:ThreeEvent<MouseEvent>)=>{event.stopPropagation();onSelectStage(stage.id);};
  const focus=()=>cameraTo({kind:'focus',target:stage.id});
  return <group position={position} onClick={select} onDoubleClick={event=>{event.stopPropagation();onSelectStage(stage.id);focus();}} onPointerOver={event=>{event.stopPropagation();gl.domElement.style.cursor='pointer';}} onPointerOut={()=>{gl.domElement.style.cursor='auto';}}>
    <ProcessPlatform accent={accent} selected={selected}/>
    <ProcessEquipment stage={stage.id} accent={accent}/>
    {selected&&<Line points={selectionOutline} color={accent} lineWidth={2.5} transparent opacity={.9} depthTest={false}/>}
    <Html portal={portal as RefObject<HTMLElement>} position={[0,PROCESS_LABEL_HEIGHT,0]} center zIndexRange={[20,0]}>
      <button type="button" className={`pm-node pm-status-${stage.status} ${selected?'is-selected':''} ${overview?'is-overview':''}`} data-stage={stage.id} aria-pressed={selected} aria-label={`${index+1}. ${stage.title}. ${overview?'Explore stage':processStageLabel(stage)}`} title={stage.summary} onClick={()=>onSelectStage(stage.id)} onDoubleClick={focus}>
        <span className="pm-node-number">{String(index+1).padStart(2,'0')}</span><span className="pm-node-copy"><strong>{stage.title}</strong><small className="pm-node-status">{overview?'Explore':processStageLabel(stage)}</small></span>
      </button>
    </Html>
  </group>;
}

function DirectedParticles({curve,color}:{curve:THREE.CatmullRomCurve3;color:string}){
  const group=useRef<THREE.Group>(null),progress=useRef(0);
  const paused=useUI(state=>state.paused||state.reduced);
  const {invalidate}=useThree();
  const length=useMemo(()=>curve.getLength(),[curve]);
  const position=useMemo(()=>new THREE.Vector3(),[]);
  useEffect(()=>{invalidate();},[paused,curve,invalidate]);
  useFrame((_,delta)=>{
    if(paused||document.hidden||!group.current)return;
    progress.current=(progress.current+Math.min(delta,.05)*.65/length)%1;
    group.current.children.forEach((child,index)=>{curve.getPointAt((progress.current+index/3)%1,position);child.position.copy(position);child.position.y+=.23;});
    invalidate();
  });
  return <group ref={group}>{[0,1,2].map(index=><mesh key={index} position={curve.getPointAt(index/3).add(new THREE.Vector3(0,.23,0))}><sphereGeometry args={[.1,10,8]}/><meshStandardMaterial color="#e4ffe9" emissive={color} emissiveIntensity={1.7} roughness={.3} toneMapped={false}/></mesh>)}</group>;
}
function Connection({route,from,to,overview}:{route:ProcessRoute;from:ProcessStage|undefined;to:ProcessStage|undefined;overview:boolean}){
  const curve=useMemo(()=>new THREE.CatmullRomCurve3(route.points.map(point=>new THREE.Vector3(...point)),false,'centripetal'),[route]);
  const lightCurve=useMemo(()=>new THREE.CatmullRomCurve3(route.points.map(point=>new THREE.Vector3(point[0],point[1]+.19,point[2])),false,'centripetal'),[route]);
  const body=useMemo(()=>new THREE.TubeGeometry(curve,32,.23,10,false),[curve]);
  const light=useMemo(()=>new THREE.TubeGeometry(lightCurve,32,.068,8,false),[lightCurve]);
  useEffect(()=>()=>{body.dispose();light.dispose();},[body,light]);
  const reached=from?.status==='complete',complete=reached&&to?.status==='complete',active=reached&&to?.status==='active';
  const attention=reached&&to?.status==='attention';
  const color=overview||complete||active?'#299a75':attention?'#bb8248':'#becbc2';
  const arrows=useMemo(()=>[.35,.69].map(progress=>{
    const position=lightCurve.getPointAt(progress);position.y+=.055;
    const tangent=lightCurve.getTangentAt(progress).normalize();
    return {position,quaternion:new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),tangent)};
  }),[lightCurve]);
  return <group>
    <mesh geometry={body} castShadow receiveShadow><meshStandardMaterial color="#fbfdf9" roughness={.64}/></mesh>
    <mesh geometry={light}><meshStandardMaterial color={color} emissive={color} emissiveIntensity={(overview||active||complete)?0.45:0.08} roughness={.35}/></mesh>
    {arrows.map((arrow,index)=><mesh key={index} position={arrow.position} quaternion={arrow.quaternion}><coneGeometry args={[.16,.36,3]}/><meshStandardMaterial color={color} emissive={color} emissiveIntensity={.15}/></mesh>)}
    {!overview&&(complete||active)&&<DirectedParticles curve={curve} color={color}/>}
  </group>;
}

function Scene({stages,selectedStage,onSelectStage,onFailure,overview=false,portal}:CampusProps&{portal:RefObject<HTMLDivElement|null>}){
  const {gl,invalidate,camera,size}=useThree();
  const layout=getProcessLayout(size.width<600);
  const alive=useRef(true),renderedFrames=useRef(0);
  useFrame(()=>{
    const frame=++renderedFrames.current;
    // Read diagnostics after Three has rendered this frame, including a static first frame.
    queueMicrotask(()=>{if(alive.current)gl.domElement.dataset.camera=JSON.stringify({frame,position:camera.position.toArray(),rotation:camera.rotation.toArray().slice(0,3),zoom:camera.zoom,drawCalls:gl.info.render.calls,orthographic:camera instanceof THREE.OrthographicCamera});});
  });
  useEffect(()=>{
    alive.current=true;const canvas=gl.domElement;
    const lost=(event:Event)=>{event.preventDefault();onFailure();};
    const visible=()=>{if(!document.hidden)invalidate();};
    canvas.addEventListener('webglcontextlost',lost);document.addEventListener('visibilitychange',visible);
    invalidate();
    return()=>{alive.current=false;canvas.removeEventListener('webglcontextlost',lost);document.removeEventListener('visibilitychange',visible);canvas.style.cursor='auto';};
  },[gl,invalidate,onFailure]);
  return <>
    <color attach="background" args={['#eaf0e9']}/>
    <ambientLight intensity={.8}/><hemisphereLight args={['#fffef5','#b9cbc1',.55]}/>
    <directionalLight position={[-12,26,18]} color="#fffdf4" intensity={2} castShadow shadow-mapSize={[2048,2048]} shadow-camera-left={-26} shadow-camera-right={26} shadow-camera-top={24} shadow-camera-bottom={-24} shadow-camera-near={1} shadow-camera-far={80} shadow-normalBias={.035} shadow-bias={-.00008} shadow-radius={5}/>
    <ProcessCamera selectedStage={selectedStage}/>
    <mesh rotation={[-Math.PI/2,0,0]} position={[0,.025,0]} receiveShadow><planeGeometry args={[240,240]}/><meshStandardMaterial color="#eaf0e8" roughness={1}/></mesh>
    {layout.routes.map(route=><Connection key={`${size.width<600?'portrait':'landscape'}-${route.from}-${route.to}`} route={route} from={stages.find(stage=>stage.id===route.from)} to={stages.find(stage=>stage.id===route.to)} overview={overview}/>)}
    {PROCESS_STAGE_ORDER.map((id,index)=>{const stage=stages.find(value=>value.id===id);return stage?<Station key={id} stage={stage} position={layout.positions[id]} index={index} selected={selectedStage===id} onSelectStage={onSelectStage} portal={portal} overview={overview}/>:null;})}
  </>;
}

export default function CampusCanvas(props:CampusProps){
  const labelPortal=useRef<HTMLDivElement>(null);
  const [available]=useState(()=>{try{const probe=document.createElement('canvas'),context=probe.getContext('webgl2')||probe.getContext('webgl');const supported=!!context;context?.getExtension('WEBGL_lose_context')?.loseContext();return supported;}catch{return false;}});
  useEffect(()=>{if(!available)props.onFailure();},[available,props.onFailure]);
  if(!available)return null;
  return <div className="campus-canvas pm-canvas" data-testid="campus-canvas"><div ref={labelPortal} className="scene-html-layer"/><Canvas orthographic camera={{position:PROCESS_HOME_POSITION,zoom:20,near:.1,far:400}} shadows="soft" dpr={[1,1.5]} frameloop="demand" gl={{antialias:true,alpha:false,powerPreference:'high-performance'}} onCreated={({camera})=>{camera.lookAt(...PROCESS_HOME_TARGET);camera.updateProjectionMatrix();}}><Suspense fallback={null}><Scene {...props} portal={labelPortal}/></Suspense></Canvas></div>;
}
