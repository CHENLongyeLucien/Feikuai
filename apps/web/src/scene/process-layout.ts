import type {ProcessStageId} from './process';

export type ProcessPoint = [number, number, number];
export type ProcessRoute = {from:ProcessStageId;to:ProcessStageId;points:ProcessPoint[]};
export const PROCESS_POSITIONS: Record<ProcessStageId, ProcessPoint> = {
  receive: [-12, 0, -6], security: [0, 0, -6], finance: [12, 0, -6],
  decision: [12, 0, 7], payment: [0, 0, 7], report: [-12, 0, 7],
};
export const PROCESS_PORTRAIT_POSITIONS: Record<ProcessStageId, ProcessPoint> = {
  receive: [-6, 0, -12], security: [6, 0, -12], finance: [6, 0, 0],
  decision: [-6, 0, 0], payment: [-6, 0, 12], report: [6, 0, 12],
};
export const PROCESS_HOME_TARGET: ProcessPoint = [0, 1.3, .5];
export const PROCESS_HOME_POSITION: ProcessPoint = [30, 31, 38];
export const PROCESS_PORTRAIT_HOME_TARGET: ProcessPoint = [0, 1.3, 0];
export const PROCESS_PORTRAIT_HOME_POSITION: ProcessPoint = [3, 70, 45];
export const PROCESS_STAGE_ORDER: ProcessStageId[] = ['receive','security','finance','decision','payment','report'];
export const PROCESS_LABEL_HEIGHT = 5.25;

function connect(positions:Record<ProcessStageId,ProcessPoint>):ProcessRoute[]{
  return PROCESS_STAGE_ORDER.slice(0,-1).map((from,index)=>{
    const to=PROCESS_STAGE_ORDER[index+1]!,a=positions[from],b=positions[to];
    const horizontal=a[2]===b[2],axis=horizontal?0:2,direction=Math.sign(b[axis]-a[axis]);
    const inset=horizontal?4.35:3.75;
    const start:ProcessPoint=[a[0],.55,a[2]],end:ProcessPoint=[b[0],.55,b[2]];
    start[axis]+=direction*inset;end[axis]-=direction*inset;
    return {from,to,points:[start,[(start[0]+end[0])/2,.4,(start[2]+end[2])/2],end]};
  });
}
export const PROCESS_ROUTES=connect(PROCESS_POSITIONS);
export const PROCESS_PORTRAIT_ROUTES=connect(PROCESS_PORTRAIT_POSITIONS);
const landscape={positions:PROCESS_POSITIONS,routes:PROCESS_ROUTES,homePosition:PROCESS_HOME_POSITION,homeTarget:PROCESS_HOME_TARGET,bounds:{min:[-18,0,-11] as ProcessPoint,max:[18,6.5,12] as ProcessPoint}};
const portrait={positions:PROCESS_PORTRAIT_POSITIONS,routes:PROCESS_PORTRAIT_ROUTES,homePosition:PROCESS_PORTRAIT_HOME_POSITION,homeTarget:PROCESS_PORTRAIT_HOME_TARGET,bounds:{min:[-11,0,-16.5] as ProcessPoint,max:[11,6.5,16.5] as ProcessPoint}};
export function getProcessLayout(isPortrait:boolean){return isPortrait?portrait:landscape;}
