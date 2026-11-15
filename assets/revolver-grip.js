import * as THREE from '../vendor/three/build/three.module.js';

// The imported Body contains separate connected shells. Select the grip shell
// by its lowest assembled vertex, rather than cutting across triangles by XY.
export function assignGripMaterial(object) {
  const geometry=object.geometry,positions=geometry.attributes.position,index=geometry.index;
  const count=index?index.count:positions.count;
  const parents=Array.from({length:count/3},(_,i)=>i),owners=new Map();
  const root=i=>{while(parents[i]!==i){parents[i]=parents[parents[i]];i=parents[i];}return i;};
  const point=new THREE.Vector3();let lowest=Infinity,gripFace=0;
  for(let i=0;i<count;i++){
    point.fromBufferAttribute(positions,index?index.getX(i):i);
    // Weld coincident positions across UV seams without modifying the mesh.
    const key=point.toArray().map(n=>Math.round(n*10000)).join(',');
    const face=Math.floor(i/3);
    if(owners.has(key))parents[root(face)]=root(owners.get(key));
    else owners.set(key,face);
    point.applyMatrix4(object.matrixWorld);
    if(point.y<lowest){lowest=point.y;gripFace=face;}
  }
  const grip=root(gripFace);
  geometry.clearGroups();let start=0,previous=-1;
  for(let i=0;i<count;i+=3){
    const material=root(i/3)===grip?1:0;
    if(previous!==material){
      if(previous>=0)geometry.addGroup(start,i-start,previous);
      start=i;previous=material;
    }
  }
  geometry.addGroup(start,count-start,previous);
}
