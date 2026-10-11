import {BufferGeometry,Color,Curve,Float32BufferAttribute,ShapeUtils,Vector2,Vector3} from 'three';
import landJson from './assets/ne_110m_land.geojson?raw';

type Coordinate=[number,number];
type Land={features:Array<{geometry:{type:'Polygon'|'MultiPolygon';coordinates:Coordinate[][]|Coordinate[][][]}}>};
const RADIUS=2.5;

export function globePoint(latitude:number,longitude:number,radius=RADIUS){
  const lat=latitude*Math.PI/180,lon=longitude*Math.PI/180;
  return new Vector3(Math.cos(lat)*Math.sin(lon)*radius,Math.sin(lat)*radius,Math.cos(lat)*Math.cos(lon)*radius);
}

/** Geographic polygons are subdivided before projection so triangles follow the sphere. */
export function createLandGeometry(){
  const positions:number[]=[],normals:number[]=[],colors:number[]=[];
  const ivory=new Color('#e9dfc9'),sage=new Color('#dce4d2'),polar=new Color('#f1eee0');
  const point=new Vector3(),color=new Color();
  function vertex(coordinate:Coordinate){
    const [longitude,latitude]=coordinate;
    point.copy(globePoint(latitude,longitude,2.526));positions.push(point.x,point.y,point.z);
    point.normalize();normals.push(point.x,point.y,point.z);
    color.copy(ivory).lerp(sage,Math.min(1,Math.abs(latitude-22)/62)*.65).lerp(polar,Math.max(0,(Math.abs(latitude)-58)/30));
    colors.push(color.r,color.g,color.b);
  }
  function triangle(a:Coordinate,b:Coordinate,c:Coordinate,depth=0){
    const lengths=[Math.hypot(a[0]-b[0],a[1]-b[1]),Math.hypot(b[0]-c[0],b[1]-c[1]),Math.hypot(c[0]-a[0],c[1]-a[1])];
    const longest=Math.max(...lengths);
    if(longest<=4||depth>=12){vertex(a);vertex(b);vertex(c);return;}
    const index=lengths.indexOf(longest),start=[a,b,c][index]!,end=[b,c,a][index]!,other=[c,a,b][index]!;
    const mid:Coordinate=[(start[0]+end[0])/2,(start[1]+end[1])/2];
    triangle(start,mid,other,depth+1);triangle(mid,end,other,depth+1);
  }
  const data=JSON.parse(landJson) as Land;
  for(const feature of data.features){
    const polygons=feature.geometry.type==='Polygon'?[feature.geometry.coordinates as Coordinate[][]]:feature.geometry.coordinates as Coordinate[][][];
    for(const polygon of polygons){
      const rings=polygon.map(ring=>{const points=ring.map(([x,y])=>new Vector2(x,y));if(points[0]?.equals(points.at(-1)!))points.pop();return points;});
      if(!rings[0]||rings[0].length<3)continue;
      const vertices=rings.flat();
      for(const face of ShapeUtils.triangulateShape(rings[0],rings.slice(1))){
        const [a,b,c]=face.map(index=>vertices[index]!) as [Vector2,Vector2,Vector2];
        triangle([a.x,a.y],[b.x,b.y],[c.x,c.y]);
      }
    }
  }
  const geometry=new BufferGeometry();
  geometry.setAttribute('position',new Float32BufferAttribute(positions,3));geometry.setAttribute('normal',new Float32BufferAttribute(normals,3));geometry.setAttribute('color',new Float32BufferAttribute(colors,3));
  geometry.computeBoundingSphere();return geometry;
}

/** Blockchain hashes identify real records; these coordinates intentionally have no geographic meaning. */
export function illustrativeRoute(hash:string){
  const seed=(salt:number)=>{let value=(2166136261^salt)>>>0;for(const character of hash)value=Math.imul(value^character.charCodeAt(0),16777619)>>>0;return value;};
  const start=globePoint((seed(11)%100)-40,(seed(23)%145)-85,2.55),end=globePoint((seed(37)%100)-45,(seed(53)%145)-75,2.55);
  if(start.angleTo(end)<.2)end.applyAxisAngle(new Vector3(0,1,0),.65);
  return {start,end,curve:new SurfaceArc(start,end)};
}

class SurfaceArc extends Curve<Vector3>{
  private readonly start:Vector3;
  private readonly axis:Vector3;
  private readonly angle:number;
  constructor(start:Vector3,end:Vector3){super();this.start=start.clone().normalize();this.axis=new Vector3().crossVectors(start,end).normalize();this.angle=start.angleTo(end);}
  getPoint(t:number,target=new Vector3()){
    const radius=2.55+Math.sin(Math.PI*t)*(.2+this.angle*.23);
    return target.copy(this.start).applyAxisAngle(this.axis,this.angle*t).multiplyScalar(radius);
  }
}
