import {useEffect,useMemo} from 'react';
import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import type {ProcessStageId} from './process';
import type {ProcessPoint} from './process-layout';

const white='#fbfcf9',shell='#edf2ec',forest='#174c40',ink='#15382f',mint='#bad8c7',metal='#c8d4cf',paper='#ffffff';
const rounded=new RoundedBoxGeometry(1,1,1,3,.1);
const box=new THREE.BoxGeometry(1,1,1);
const cylinder=new THREE.CylinderGeometry(1,1,1,32);
const torus=new THREE.TorusGeometry(1,.055,8,48);
const shieldShape=new THREE.Shape();shieldShape.moveTo(-.82,.75);shieldShape.lineTo(0,1);shieldShape.lineTo(.82,.75);shieldShape.lineTo(.72,-.25);shieldShape.quadraticCurveTo(.52,-.8,0,-1.12);shieldShape.quadraticCurveTo(-.52,-.8,-.72,-.25);shieldShape.closePath();
const shield=new THREE.ExtrudeGeometry(shieldShape,{depth:.13,bevelEnabled:true,bevelSize:.055,bevelThickness:.035,bevelSegments:2,steps:1});
type Part={p:ProcessPoint;s:ProcessPoint;c:string;r?:ProcessPoint;geometry?:THREE.BufferGeometry;metal?:number;glow?:boolean};
const block=(p:ProcessPoint,s:ProcessPoint,c=white,extra:Partial<Part>={}):Part=>({p,s,c,...extra});
const disc=(p:ProcessPoint,s:ProcessPoint,c:string,r:ProcessPoint=[0,0,0]):Part=>block(p,s,c,{geometry:cylinder,r});
const stroke=(p:ProcessPoint,s:ProcessPoint,c=forest,r:ProcessPoint=[0,0,0]):Part=>block(p,s,c,{geometry:box,r});

/** Bake each model's fixed parts into a few vertex-colored meshes. */
function Parts({parts}:{parts:Part[]}) {
  const batches=useMemo(()=>{
    const buckets=new Map<string,{parts:THREE.BufferGeometry[];metal:number;emissive:string}>();
    const transform=new THREE.Object3D();
    for(const part of parts){
      const source=part.geometry||rounded,geometry=source.index?source.toNonIndexed():source.clone();
      for(const attribute of Object.keys(geometry.attributes))if(!['position','normal'].includes(attribute))geometry.deleteAttribute(attribute);
      transform.position.set(...part.p);transform.scale.set(...part.s);transform.rotation.set(...(part.r||[0,0,0]));transform.updateMatrix();geometry.applyMatrix4(transform.matrix);
      const color=new THREE.Color(part.c),colors=new Float32Array(geometry.getAttribute('position').count*3);
      for(let i=0;i<colors.length;i+=3){colors[i]=color.r;colors[i+1]=color.g;colors[i+2]=color.b;}
      geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));
      const emissive=part.glow?part.c:'#000000',metalness=part.metal||0,key=`${emissive}:${metalness}`;
      if(!buckets.has(key))buckets.set(key,{parts:[],metal:metalness,emissive});
      buckets.get(key)!.parts.push(geometry);
    }
    return Array.from(buckets,([key,bucket])=>{
      const geometry=mergeGeometries(bucket.parts,false);bucket.parts.forEach(part=>part.dispose());
      if(!geometry)throw new Error('Process model geometry could not be assembled.');
      geometry.computeBoundingSphere();geometry.computeBoundingBox();
      return {key,geometry,metal:bucket.metal,emissive:bucket.emissive};
    });
  },[parts]);
  useEffect(()=>()=>batches.forEach(batch=>batch.geometry.dispose()),[batches]);
  return <>{batches.map(batch=><mesh key={batch.key} geometry={batch.geometry} castShadow receiveShadow><meshStandardMaterial vertexColors roughness={batch.metal?0.42:0.72} metalness={batch.metal} emissive={batch.emissive} emissiveIntensity={.55}/></mesh>)}</>;
}

function checkMark(p:ProcessPoint,scale=1,color=white):Part[]{return [stroke([p[0]-.19*scale,p[1]-.04*scale,p[2]],[.16*scale,.54*scale,.09*scale],color,[0,0,Math.PI/4]),stroke([p[0]+.18*scale,p[1]+.13*scale,p[2]],[.16*scale,.95*scale,.09*scale],color,[0,0,-Math.PI/4])];}
function page(p:ProcessPoint,w=1.2,d=.9):Part[]{return [block(p,[w,.07,d],paper),...[-.2,0,.2].map(z=>stroke([p[0],p[1]+.041,p[2]+z],[w*.64,.015,.025],mint))];}
function screen(p:ProcessPoint,w:number,h:number):Part[]{return [block(p,[w+.18,h+.18,.14],forest),block([p[0],p[1],p[2]+.08],[w,h,.035],'#d1ebd9'),stroke([p[0]-.23*w,p[1]+.15*h,p[2]+.104],[.2*w,.09,.016],forest),stroke([p[0]-.06*w,p[1]-.12*h,p[2]+.104],[.52*w,.055,.016],'#91b9a0')];}

function scanner(accent:string):Part[]{
  const parts:Part[]=[block([0,1.05,.3],[5.8,.42,2.5],shell),block([0,1.29,.3],[5.45,.1,1.78],forest)];
  for(const x of [-2.25,2.25])for(const z of [-.58,1.18])parts.push(block([x,.72,z],[.23,.6,.23],metal));
  for(let x=-2.55;x<2.7;x+=.37)parts.push(disc([x,1.38,.3],[.095,1.65,.095],metal,[Math.PI/2,0,0]));
  for(const z of [-.88,1.48])parts.push(block([.15,2.31,z],[.8,2.18,.42]),block([.15,2.32,z+.23],[.26,1.65,.045],forest));
  parts.push(block([.15,3.34,.3],[1.12,.48,2.95]),block([.15,3.6,.3],[1.36,.11,3.08],shell),stroke([.15,3.07,.3],[.16,.06,1.98],accent),block([2.25,1.85,1.42],[1.05,1.05,.2],shell),...screen([2.25,2.04,1.55],.7,.4));
  parts.push(...page([-1.65,1.58,.3],1.18,1.18),...page([1.7,1.53,.3],.98,1.18));
  parts.push(block([-2.3,1.17,-2.05],[1.3,1.13,1.02],forest),block([-2.3,1.74,-2.05],[1.38,.12,1.1],metal));
  for(let i=0;i<3;i++)parts.push(block([-2.3+i*.08,1.85+i*.1,-2.05],[1.1,.055,.81],paper));
  parts.push(block([2.24,1.73,1.57],[.18,.07,.035],accent,{glow:true}));
  return parts;
}
function security(accent:string):Part[]{
  const parts:Part[]=[block([0,.93,.2],[4.4,.46,3.8],shell),block([0,1.2,.2],[3.32,.07,3.32],forest)];
  for(const x of [-1.85,1.85])parts.push(block([x,2.6,.15],[.61,3.03,1.08]),stroke([x,2.65,.71],[.13,2.4,.035],accent));
  parts.push(block([0,4.14,.15],[4.31,.49,1.15]),block([0,4.39,.15],[4.59,.09,1.24],shell),block([0,2.74,.54],[1.65,1.65,1],forest,{geometry:shield}),...checkMark([0,2.63,.77],.74));
  parts.push(block([-2.82,1.73,1.58],[.6,1.9,.6],shell),disc([-2.82,2.72,1.58],[.21,.09,.21],accent),block([2.82,1.73,1.58],[.6,1.9,.6],shell),disc([2.82,2.72,1.58],[.21,.09,.21],accent));
  for(const z of [-.9,-.35,.2,.75,1.3])parts.push(stroke([0,1.25,z],[2.5,.025,.035],metal));
  return parts;
}
function finance(accent:string):Part[]{
  const parts:Part[]=[block([0,1.05,.2],[5.8,.59,3.7],shell),block([0,.72,.2],[4.9,.2,3.05],metal),block([1.15,2.06,.17],[2.24,1.98,2.28]),block([1.15,3.08,.17],[2.32,.11,2.38],shell),...screen([1.15,2.61,1.36],1.78,.54)];
  for(let row=0;row<3;row++)for(let col=0;col<4;col++)parts.push(block([.45+col*.47,2.14-row*.31,1.36],[.32,.21,.11],col===3?forest:metal));
  parts.push(block([1.15,1.18,1.37],[1.88,.12,.09],accent,{glow:true}));
  for(let i=0;i<3;i++)parts.push(block([-1.7,1.43+i*.3,.06],[1.7,.25,2.45],i===1?mint:forest),block([-1.64,1.45+i*.3,.08],[1.47,.15,2.26],paper));
  parts.push(block([-1.7,2.35,-.08],[1.78,.08,2.48],forest));
  for(let i=0;i<4;i++)parts.push(stroke([-1.7,2.401,-.77+i*.42],[1.25,.014,.035],mint));
  parts.push(block([-1.7,2.45,-1.02],[.61,.04,.3],paper),block([-2.91,1.97,1.32],[.18,1.31,.18],forest,{r:[0,0,-.18]}));
  return parts;
}
function decision(accent:string):Part[]{
  const parts:Part[]=[block([0,1.92,.28],[5.55,.34,2.7]),block([-2.02,1.17,.23],[1.15,1.24,2.15],shell),block([2.02,1.17,.23],[1.15,1.24,2.15],shell),block([-2.02,1.25,1.34],[.69,.06,.055],forest),block([2.02,1.25,1.34],[.69,.06,.055],forest)];
  parts.push(block([1.15,2.78,-.29],[2.04,1.27,.15],forest),...screen([1.15,2.79,-.18],1.8,1),block([1.15,2.23,-.22],[.16,.8,.17],metal),block([1.15,2.14,-.05],[1.02,.08,.65],metal));
  parts.push(block([-1.28,2.15,.51],[1.5,.08,1.69],forest),...page([-1.28,2.22,.52],1.34,1.5),block([-1.28,2.28,-.19],[.6,.1,.14],metal));
  parts.push(block([-1.02,3.17,-.69],[1.48,1.9,.13],paper),block([-1.02,3.14,-.59],[.91,.91,.045],accent),...checkMark([-1.02,3.13,-.53],.62));
  parts.push(block([.05,1.66,-1.62],[1.15,.25,1.01],forest),block([.05,2.2,-2.03],[1.18,1.11,.19],forest),disc([.05,1.14,-1.62],[.12,.75,.12],metal),disc([.05,.8,-1.62],[.65,.1,.65],metal));
  parts.push(block([2.4,2.2,1.09],[.2,.06,.2],accent,{glow:true}));
  return parts;
}
function vault(accent:string):Part[]{
  const parts:Part[]=[block([0,.91,0],[4.74,.49,3.94],metal),block([0,2.38,0],[4.2,2.92,3.52]),block([0,3.87,0],[4.41,.18,3.7],shell),block([0,2.32,1.79],[3.64,2.54,.19],forest),block([0,2.32,1.91],[3.25,2.22,.1],metal)];
  parts.push(disc([-.28,2.32,2.06],[.93,.17,.93],forest,[Math.PI/2,0,0]),disc([-.28,2.32,2.17],[.78,.12,.78],shell,[Math.PI/2,0,0]),block([-.28,2.32,2.26],[.5,.5,1],forest,{geometry:torus}));
  for(let i=0;i<3;i++){const angle=i*Math.PI*2/3;parts.push(stroke([-.28+Math.sin(angle)*.19,2.32+Math.cos(angle)*.19,2.29],[.07,.5,.075],forest,[0,0,-angle]));}
  for(const x of [-1.43,1.43])for(const y of [1.44,3.2])parts.push(disc([x,y,2.01],[.065,.065,.065],ink,[Math.PI/2,0,0]));
  parts.push(block([1.11,2.6,2.02],[.51,.59,.09],forest),block([1.11,2.72,2.08],[.3,.1,.035],accent,{glow:true}));
  for(let i=0;i<3;i++)parts.push(block([1.02+i*.09,2.45,2.083],[.045,.05,.025],paper));
  parts.push(block([-2.7,1.06,1.18],[.79,.6,.98],shell));
  for(let i=0;i<4;i++)parts.push(disc([-2.7,1.44+i*.13,1.18],[.31,.1,.31],i%2?mint:forest));
  return parts;
}
function archive(accent:string):Part[]{
  const parts:Part[]=[block([0,.92,-.48],[5.45,.46,3.48],shell),block([-2.35,2.43,-.55],[.24,2.72,2.79]),block([2.35,2.43,-.55],[.24,2.72,2.79]),block([0,2.43,-1.92],[4.92,2.72,.2],shell)];
  for(const y of [1.22,2.44,3.77])parts.push(block([0,y,-.55],[4.94,.16,2.93]));
  for(let row=0;row<2;row++)for(let i=0;i<6;i++){const x=-1.92+i*.75;parts.push(block([x,1.84+row*1.23,-.37],[.52,.91,1.86],i%3===0?forest:i%3===1?mint:'#d9e4d8'),block([x,1.91+row*1.23,.583],[.28,.33,.035],paper),stroke([x,1.92+row*1.23,.608],[.15,.03,.02],metal));}
  parts.push(block([1.33,1.64,1.7],[1.53,1.78,.17],forest),block([1.33,1.65,1.81],[1.29,1.52,.035],paper),block([1.33,2.18,1.85],[.75,.15,.025],accent));
  for(let i=0;i<4;i++)parts.push(stroke([1.3,1.86-i*.21,1.855],[.82-(i%2)*.2,.05,.024],metal));
  parts.push(...page([-1.49,1.15,1.78],1.37,1.24),...page([-1.4,1.23,1.77],1.37,1.24));
  return parts;
}
const builders:Record<ProcessStageId,(accent:string)=>Part[]>={receive:scanner,security,finance,decision,payment:vault,report:archive};

export function ProcessEquipment({stage,accent}:{stage:ProcessStageId;accent:string}){
  const parts=useMemo(()=>builders[stage](accent),[stage,accent]);
  return <Parts parts={parts}/>;
}
export function ProcessPlatform({accent,selected}:{accent:string;selected:boolean}){
  const parts=useMemo<Part[]>(()=>[
    block([0,.19,0],[8.63,.28,7.53],'#d8e2d9'),block([0,.42,0],[8.6,.34,7.5],white),block([0,.61,0],[8.28,.045,7.17],'#f4f7f1'),
    block([0,.6,3.74],[5.4,.065,.065],selected?accent:metal,{glow:selected}),
    ...[-1,1].flatMap(x=>[-1,1].map(z=>disc([x*3.62,.665,z*3.07],[.085,.04,.085],metal))),
  ],[accent,selected]);
  return <Parts parts={parts}/>;
}
