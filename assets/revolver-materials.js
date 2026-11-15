import * as THREE from '../vendor/three/build/three.module.js';

// Small, deterministic surface maps: generated once, with no image downloads.
export function createRevolverMaterials(renderer) {
  const size=256;
  let seed=9173;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  function surface(wood=false,roughness=false){
    const canvas=document.createElement('canvas');canvas.width=canvas.height=size;
    const ctx=canvas.getContext('2d');const data=ctx.createImageData(size,size);
    for(let y=0;y<size;y++)for(let x=0;x<size;x++){
      const u=x/size*Math.PI*2,v=y/size*Math.PI*2;
      const grain=Math.sin(u*19+Math.sin(v)*1.8+Math.sin(v*3)*.4);
      const fine=Math.sin(u*61+Math.sin(v*2)*2);
      const noise=(random()-.5)*5;
      const variation=wood?grain*8+fine*2+noise:Math.sin(v*88)*1.5+noise;
      const base=roughness?(wood?[178,178,178]:[132,132,132]):(wood?[99,53,29]:[76,87,100]);
      const i=(y*size+x)*4;
      for(let c=0;c<3;c++)data.data[i+c]=base[c]+variation;
      data.data[i+3]=255;
    }
    ctx.putImageData(data,0,0);
    if(!wood){
      for(let i=0;i<50;i++){
        ctx.strokeStyle=roughness?'rgba(210,210,210,.18)':'rgba(177,187,196,.09)';
        ctx.lineWidth=.5;const x=random()*size,y=random()*size;
        ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+3+random()*24,y+random());ctx.stroke();
      }
    }
    const texture=new THREE.CanvasTexture(canvas);
    texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
    texture.anisotropy=Math.min(4,renderer.capabilities.getMaxAnisotropy());
    if(!roughness)texture.colorSpace=THREE.SRGBColorSpace;
    return texture;
  }
  const metalMap=surface(),metalRoughness=surface(false,true);
  const woodMap=surface(true),woodRoughness=surface(true,true);
  const metal=new THREE.MeshStandardMaterial({map:metalMap,color:0x727e8c,
    metalness:.82,roughness:.85,roughnessMap:metalRoughness,
    bumpMap:metalRoughness,bumpScale:.025,envMapIntensity:.35});
  const wood=new THREE.MeshStandardMaterial({map:woodMap,color:0xbca18c,
    metalness:0,roughness:.95,roughnessMap:woodRoughness,
    bumpMap:woodRoughness,bumpScale:.11,envMapIntensity:.3});
  return {metal,wood};
}

// Project in the assembled model's coordinates, independent of its tiny pixel
// atlas. Per-face dominant planes prevent stretching on barrel/cylinder ends.
export function projectSurfaceUVs(object) {
  const geometry=object.geometry.index?object.geometry.toNonIndexed():object.geometry.clone();
  const positions=geometry.attributes.position;
  const uv=new Float32Array(positions.count*2);
  const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3();
  const normal=new THREE.Vector3(),edge=new THREE.Vector3();
  for(let i=0;i<positions.count;i+=3){
    a.fromBufferAttribute(positions,i).applyMatrix4(object.matrixWorld);
    b.fromBufferAttribute(positions,i+1).applyMatrix4(object.matrixWorld);
    c.fromBufferAttribute(positions,i+2).applyMatrix4(object.matrixWorld);
    normal.subVectors(b,a).cross(edge.subVectors(c,a));
    const nx=Math.abs(normal.x),ny=Math.abs(normal.y),nz=Math.abs(normal.z);
    for(const [j,p] of [a,b,c].entries()){
      const axis=nx>ny&&nx>nz?'x':ny>nz?'y':'z';
      uv[(i+j)*2]=(axis==='x'?p.z:p.x)/100;
      uv[(i+j)*2+1]=(axis==='y'?p.z:p.y)/100;
    }
  }
  geometry.setAttribute('uv',new THREE.BufferAttribute(uv,2));
  object.geometry=geometry;
}
