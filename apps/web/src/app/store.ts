import { create } from 'zustand';
import type {Selection} from './types';
export type CameraCommand={kind:'home'|'focus'|'rotate'|'zoom';target?:string;value?:number;nonce:number};
type UIState={selection:Selection;paused:boolean;reduced:boolean;camera:CameraCommand;select:(s:Selection)=>void;setPaused:(b:boolean)=>void;setReduced:(b:boolean)=>void;cameraTo:(c:Omit<CameraCommand,'nonce'>)=>void};
export const useUI=create<UIState>((set)=>({selection:{kind:'station',id:'overview'},paused:false,reduced:typeof window!=='undefined'&&window.matchMedia('(prefers-reduced-motion: reduce)').matches,camera:{kind:'home',nonce:0},select:(selection)=>set({selection}),setPaused:(paused)=>set({paused}),setReduced:(reduced)=>set({reduced}),cameraTo:(camera)=>set(s=>({camera:{...camera,nonce:s.camera.nonce+1}}))}));
