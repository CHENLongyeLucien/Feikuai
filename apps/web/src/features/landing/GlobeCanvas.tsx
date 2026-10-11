import {useEffect,useLayoutEffect,useMemo,useRef,useState,type RefObject} from 'react';
import {Canvas,useFrame,useThree} from '@react-three/fiber';
import {OrbitControls} from '@react-three/drei';
import {BackSide,DoubleSide,Group,Mesh,PerspectiveCamera,TubeGeometry,Vector3} from 'three';
import {createLandGeometry,illustrativeRoute} from './globe-geometry';

export type GlobeCommand={kind:'left'|'right'|'up'|'down'|'in'|'out'|'reset';nonce:number};
type Props={hashes:string[];activityLive:boolean;highlight:string|null;paused:boolean;reduced:boolean;entering:boolean;expanded:boolean;anchor:RefObject<HTMLDivElement|null>;command:GlobeCommand;onFailure:()=>void;onZoomIn:()=>void};

function ActivityArc({hash,highlighted,moving}:{hash:string;highlighted:boolean;moving:boolean}){
  const pulse=useRef<Mesh>(null),progress=useRef((parseInt(hash.slice(-4),16)%100)/100);
  const {invalidate}=useThree();
  const route=useMemo(()=>{
    const {start,end,curve}=illustrativeRoute(hash);
    return {start,end,curve,geometry:new TubeGeometry(curve,56,.01,6,false)};
  },[hash]);
  const position=useMemo(()=>new Vector3(),[]);
  useEffect(()=>()=>route.geometry.dispose(),[route]);
  useEffect(()=>{invalidate();},[moving,invalidate]);
  useFrame((_,delta)=>{
    if(!moving||document.hidden||!pulse.current)return;
    progress.current=(progress.current+Math.min(delta,.05)*.13)%1;
    route.curve.getPointAt(progress.current,position);pulse.current.position.copy(position);invalidate();
  });
  const color=highlighted?'#c96c55':'#5a9580';
  return <group>
    <mesh geometry={route.geometry}><meshBasicMaterial color={color} transparent opacity={highlighted ? .95 : .66}/></mesh>
    {[route.start,route.end].map((point,index)=><mesh key={index} position={point}><sphereGeometry args={[highlighted ? .043 : .026,10,8]}/><meshBasicMaterial color={color}/></mesh>)}
    <mesh ref={pulse} position={route.curve.getPointAt(progress.current)}><sphereGeometry args={[highlighted ? .043 : .031,10,8]}/><meshBasicMaterial color={highlighted?'#b65b46':'#f7f9e9'}/></mesh>
  </group>;
}

function GlobeScene({hashes,activityLive,highlight,paused,reduced,entering,expanded,anchor,command,onFailure,onZoomIn}:Props){
  const planet=useRef<Group>(null),frames=useRef(0),entryTime=useRef(0),entryDistance=useRef(8.5);
  const fittedDistance=useRef<number|null>(null);
  const [cameraDistance,setCameraDistance]=useState(8.8);
  const {camera,size,gl,invalidate}=useThree();
  const land=useMemo(createLandGeometry,[]);
  const moving=!paused&&!reduced;
  useEffect(()=>()=>land.dispose(),[land]);
  useLayoutEffect(()=>{
    const element=anchor.current;
    if(!element||!(camera instanceof PerspectiveCamera))return;
    const project=()=>{
      const frame=element.getBoundingClientRect(),surface=gl.domElement.getBoundingClientRect();
      if(frame.width<=0||frame.height<=0||surface.width<=0||surface.height<=0)return;
      const halfFov=camera.fov*Math.PI/360,aspect=frame.width/frame.height;
      const distance=2.72/Math.sin(Math.atan(Math.tan(halfFov)*Math.min(1,aspect)));
      const previous=fittedDistance.current;
      // Fit against the original layout, never the expanded render surface.
      // During exploration, changing the surface cannot undo the user's zoom.
      if(previous===null){camera.position.set(0,0,distance);camera.lookAt(0,0,0);}
      else if(!entering&&!expanded&&distance!==previous)camera.position.setLength(Math.max(3.05,camera.position.length()*distance/previous));
      fittedDistance.current=distance;setCameraDistance(current=>current===distance?current:distance);
      if(expanded||entering){
        // Extend the original camera image beyond its frame. Its focal length
        // and screen-space center stay fixed while the globe grows behind UI.
        camera.setViewOffset(frame.width,frame.height,surface.left-frame.left,surface.top-frame.top,surface.width,surface.height);
      }else{
        camera.clearViewOffset();camera.aspect=aspect;camera.updateProjectionMatrix();
      }
      invalidate();
    };
    project();
    const observer=new ResizeObserver(project);observer.observe(element);
    window.addEventListener('resize',project);window.addEventListener('scroll',project,{passive:true,capture:true});
    return()=>{observer.disconnect();window.removeEventListener('resize',project);window.removeEventListener('scroll',project,true);};
    // R3F writes camera.aspect when its renderer resizes. Reapply the anchored
    // projection after that update, even if the anchor itself did not resize.
  },[anchor,camera,size.width,size.height,gl,entering,expanded,invalidate]);
  useEffect(()=>{
    if(!planet.current)return;
    if(command.kind==='reset'){planet.current.rotation.set(0,.42,-.14);camera.position.set(0,0,fittedDistance.current??8.8);camera.lookAt(0,0,0);}
    else if(command.kind==='in'||command.kind==='out'){camera.position.setLength(Math.max(3.05,Math.min((fittedDistance.current??8.8)*1.7,camera.position.length()*(command.kind==='in'?.8:1.25))));}
    else if(command.kind==='left'||command.kind==='right')planet.current.rotation.y+=(command.kind==='left'?-1:1)*.3;
    else planet.current.rotation.x+=(command.kind==='up'?-1:1)*.2;
    invalidate();
  },[command,camera,invalidate]);
  useEffect(()=>{if(entering){entryTime.current=0;entryDistance.current=camera.position.length();}invalidate();},[entering,camera,invalidate]);
  useEffect(()=>{
    const canvas=gl.domElement;
    const lost=(event:Event)=>{event.preventDefault();onFailure();};
    const visible=()=>{if(!document.hidden)invalidate();};
    canvas.addEventListener('webglcontextlost',lost);document.addEventListener('visibilitychange',visible);invalidate();
    return()=>{canvas.removeEventListener('webglcontextlost',lost);document.removeEventListener('visibilitychange',visible);};
  },[gl,invalidate,onFailure]);
  useEffect(()=>{invalidate();},[moving,invalidate]);
  useFrame((_,delta)=>{
    const frame=++frames.current;
    if(planet.current&&!document.hidden){
      if(entering){
        entryTime.current=Math.min(1,entryTime.current+Math.min(delta,.05)/.95);
        const ease=entryTime.current*entryTime.current*(3-2*entryTime.current);
        camera.position.setLength(entryDistance.current+(2.62-entryDistance.current)*ease);
        invalidate();
      }else if(moving){planet.current.rotation.y+=Math.min(delta,.05)*.023;invalidate();}
    }
    queueMicrotask(()=>{gl.domElement.dataset.globe=JSON.stringify({frame,drawCalls:gl.info.render.calls,rotation:planet.current?.rotation.toArray().slice(0,3),distance:camera.position.length(),transactionCount:hashes.length,arcMotion:moving&&activityLive&&!entering});});
  });
  return <>
    <ambientLight intensity={.82}/><hemisphereLight args={['#fffff4','#a7c6b5',.7]}/>
    <directionalLight position={[-5,6,6]} intensity={2.05} color="#fff9e9"/><directionalLight position={[4,-1,-3]} intensity={.7} color="#e4f7ef"/>
    <group ref={planet} rotation={[0,.42,-.14]}>
      <mesh><sphereGeometry args={[2.5,112,80]}/><meshStandardMaterial color="#b9d5cc" roughness={.78} metalness={0}/></mesh>
      <mesh geometry={land}><meshStandardMaterial vertexColors roughness={.94} metalness={0} side={DoubleSide}/></mesh>
      <mesh><sphereGeometry args={[2.559,72,48]}/><meshBasicMaterial color="#e8f6ed" side={BackSide} transparent opacity={.16} depthWrite={false}/></mesh>
      {hashes.map(hash=><ActivityArc key={hash} hash={hash} highlighted={highlight===hash} moving={moving&&activityLive&&!entering}/>) }
    </group>
    <OrbitControls makeDefault enabled={!entering} enablePan={false} enableDamping={moving} dampingFactor={.09} rotateSpeed={.65} minDistance={3.05} maxDistance={cameraDistance*1.7} minPolarAngle={.15} maxPolarAngle={Math.PI-.15} onChange={()=>{if(!expanded&&!entering&&fittedDistance.current&&camera.position.length()<fittedDistance.current*.97)onZoomIn();}}/>
  </>;
}

export default function GlobeCanvas(props:Props){
  return <Canvas className="sg-globe-canvas" data-testid="landing-globe" camera={{position:[0,0,8.8],fov:36,near:.1,far:80}} dpr={[1,1.5]} frameloop="demand" gl={{alpha:true,antialias:true,powerPreference:'high-performance'}} onCreated={({camera,gl})=>{if(!(camera instanceof PerspectiveCamera))props.onFailure();gl.setClearColor('#f4f6f0',0);}}><GlobeScene {...props}/></Canvas>;
}
