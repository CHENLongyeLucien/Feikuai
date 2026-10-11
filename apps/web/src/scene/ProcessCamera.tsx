import {useCallback,useEffect,useMemo,useRef} from 'react';
import {useThree} from '@react-three/fiber';
import {CameraControls,CameraControlsImpl} from '@react-three/drei';
import {Box3,OrthographicCamera,Vector3} from 'three';
import {useUI,type ViewMode} from '../app/store';
import {getProcessLayout,PROCESS_POSITIONS} from './process-layout';
import type {ProcessStageId} from './process';

const ACTION=CameraControlsImpl.ACTION;
const TOP_DOWN_POLAR=.001;
const MIN_ZOOM=.1;
const MAX_ZOOM=80;

function stageId(target:string|undefined,selectedStage:ProcessStageId|null):ProcessStageId|null{
 const id=target==='selected'?selectedStage:target==='intake'?'receive':target;
 return id&&Object.hasOwn(PROCESS_POSITIONS,id)?id as ProcessStageId:null;
}

/** Project all bounds into the intended camera view; fit both axes with room for labels. */
export function processCameraFrame(bounds:Box3,viewMode:ViewMode,width:number,height:number){
 const target=bounds.getCenter(new Vector3());
 const layout=getProcessLayout(width<600);
 const offset=viewMode==='2d'?new Vector3(0,60,.06):new Vector3(...layout.homePosition).sub(new Vector3(...layout.homeTarget));
 const normal=offset.clone().normalize();
 const right=new Vector3().crossVectors(new Vector3(0,1,0),normal).normalize();
 const up=new Vector3().crossVectors(normal,right).normalize();
 let halfWidth=0,halfHeight=0;
 const corner=new Vector3();
 for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z]){
  corner.set(x,y,z).sub(target);
  halfWidth=Math.max(halfWidth,Math.abs(corner.dot(right)));
  halfHeight=Math.max(halfHeight,Math.abs(corner.dot(up)));
 }
 const horizontalMargin=width<600?32:56;
 const verticalMargin=height<360?28:48;
 const zoom=Math.max(MIN_ZOOM,Math.min(MAX_ZOOM,(Math.max(1,width-horizontalMargin*2))/(halfWidth*2),(Math.max(1,height-verticalMargin*2))/(halfHeight*2)));
 return {target,position:target.clone().add(offset),zoom};
}

export default function ProcessCamera({selectedStage}:{selectedStage:ProcessStageId|null}){
 const control=useRef<CameraControls>(null);
 const command=useUI(s=>s.camera);
 const reduced=useUI(s=>s.reduced);
 const viewMode=useUI(s=>s.viewMode);
 const {camera,size,invalidate}=useThree();
 const lastCommand=useRef(-1);
 const frameIntent=useRef<ProcessStageId|null>(null);
 const initialized=useRef(false);
 const portrait=size.width<600;
 const layout=useMemo(()=>getProcessLayout(portrait),[portrait]);
 const mapBounds=useMemo(()=>new Box3(new Vector3(...layout.bounds.min),new Vector3(...layout.bounds.max)),[layout]);
 // Keep the point under the camera over a station, even after a long drag.
 const panBounds=useMemo(()=>new Box3(new Vector3(layout.bounds.min[0]+4,.5,layout.bounds.min[2]+3.75),new Vector3(layout.bounds.max[0]-4,4,layout.bounds.max[2]-3.75)),[layout]);
 const home=useMemo(()=>processCameraFrame(mapBounds,viewMode,size.width,size.height),[mapBounds,viewMode,size.width,size.height]);
 const mouseButtons=useMemo(()=>({left:ACTION.SCREEN_PAN,middle:ACTION.SCREEN_PAN,right:ACTION.ROTATE,wheel:ACTION.ZOOM}),[]);
 const touches=useMemo(()=>({one:ACTION.TOUCH_SCREEN_PAN,two:ACTION.TOUCH_ZOOM,three:ACTION.TOUCH_ROTATE}),[]);

 const frame=useCallback((id:ProcessStageId|null,smooth:boolean)=>{
  const controls=control.current;
  if(!controls)return;
  let next=home;
  if(id){
   const [x,,z]=layout.positions[id];
   next=processCameraFrame(new Box3(new Vector3(x-5,0,z-4.5),new Vector3(x+5,6.5,z+4.5)),viewMode,size.width,size.height);
  }
  // Fiber normally uses a pixel-sized orthographic frustum. Account for an explicit frustum too.
  const zoom=camera instanceof OrthographicCamera?next.zoom*Math.min((camera.right-camera.left)/Math.max(1,size.width),(camera.top-camera.bottom)/Math.max(1,size.height)):next.zoom;
  void controls.setLookAt(...next.position.toArray(),...next.target.toArray(),smooth);
  void controls.zoomTo(zoom,smooth);
  invalidate();
 },[camera,home,invalidate,layout,size.width,size.height,viewMode]);

 useEffect(()=>{
  const controls=control.current;
  if(!controls)return;
  if(camera instanceof OrthographicCamera){camera.clearViewOffset();camera.updateProjectionMatrix();}
  controls.setBoundary(panBounds);
  controls.minZoom=Math.max(MIN_ZOOM,home.zoom*.65);
  // Inspector ResizeObserver updates may arrive after a focus click. Refit its
  // resolved station so a late resize cannot replace an already-consumed command.
  frame(frameIntent.current,initialized.current&&!reduced);
  initialized.current=true;
 },[camera,frame,home.zoom,panBounds,reduced]);

 useEffect(()=>{
  const controls=control.current;
  if(!controls||lastCommand.current===command.nonce)return;
  lastCommand.current=command.nonce;
  const smooth=!reduced&&command.nonce>0;
  if(command.kind==='zoom'){
   // Add to the pending zoom so rapid button presses are not lost during a transition.
   void controls.zoom(camera.zoom*(command.value===-1?-.2:.2),smooth);
  }else if(command.kind==='rotate'){
   controls.normalizeRotations();
   void controls.rotate((command.value===-1?-1:1)*Math.PI/4,0,smooth);
  }else{
   frameIntent.current=command.kind==='focus'?stageId(command.target,selectedStage):null;
   frame(frameIntent.current,smooth);
  }
  invalidate();
 },[camera,command,frame,invalidate,reduced,selectedStage]);

 return <CameraControls ref={control} makeDefault minPolarAngle={viewMode==='2d'?TOP_DOWN_POLAR:Math.PI/7} maxPolarAngle={viewMode==='2d'?TOP_DOWN_POLAR:Math.PI/2.35} minZoom={Math.max(MIN_ZOOM,home.zoom*.65)} maxZoom={MAX_ZOOM} minDistance={20} maxDistance={100} smoothTime={reduced?0:.24} draggingSmoothTime={0} truckSpeed={1} dollySpeed={.7} dollyToCursor boundaryFriction={0} mouseButtons={mouseButtons} touches={touches}/>;
}
