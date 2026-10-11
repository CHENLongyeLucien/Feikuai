import { create } from 'zustand';
import type {Selection} from './types';
export type CameraCommand={kind:'home'|'focus'|'rotate'|'zoom';target?:string;value?:number;nonce:number};
export type ViewMode='2d'|'3d';
type UIState={selection:Selection;paused:boolean;reduced:boolean;viewMode:ViewMode;camera:CameraCommand;select:(s:Selection)=>void;setPaused:(b:boolean)=>void;setReduced:(b:boolean)=>void;setViewMode:(mode:ViewMode)=>void;cameraTo:(c:Omit<CameraCommand,'nonce'>)=>void};
export const useUI=create<UIState>((set)=>({selection:{kind:'station',id:'overview'},paused:false,reduced:typeof window!=='undefined'&&window.matchMedia('(prefers-reduced-motion: reduce)').matches,viewMode:'3d',camera:{kind:'home',nonce:0},select:(selection)=>set({selection}),setPaused:(paused)=>set({paused}),setReduced:(reduced)=>set({reduced}),setViewMode:(viewMode)=>set({viewMode}),cameraTo:(camera)=>set(s=>({camera:{...camera,nonce:s.camera.nonce+1}}))}));
