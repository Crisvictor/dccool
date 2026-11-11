import * as THREE from '../vendor/three/build/three.module.js';
import { FBXLoader } from '../vendor/three/examples/jsm/loaders/FBXLoader.js';
import { RoomEnvironment } from '../vendor/three/examples/jsm/environments/RoomEnvironment.js';

export async function createRevolverViewer(stage) {
  const renderer = new THREE.WebGLRenderer({alpha:true,antialias:true});
  renderer.setPixelRatio(Math.min(devicePixelRatio,2));
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=.85;
  renderer.shadowMap.enabled=true;
  renderer.shadowMap.type=THREE.PCFShadowMap;
  renderer.domElement.className='revolver-webgl';
  renderer.domElement.setAttribute('aria-label','3D左輪模型，可拖曳轉動視角');
  const scene=new THREE.Scene();
  const camera=new THREE.PerspectiveCamera(43,1,.1,100);
  camera.up.set(0,0,1);
  camera.position.set(0,-4.6,10.8);
  // Higher virtual composition / wider field of view, without changing the square layout.
  camera.lookAt(0,0,.66);
  const pmrem=new THREE.PMREMGenerator(renderer);
  const environment=new RoomEnvironment();
  const envMap=pmrem.fromScene(environment,.04);
  scene.environment=envMap.texture;
  environment.dispose();pmrem.dispose();
  scene.add(new THREE.AmbientLight(0xc4d4df,.8));
  const key=new THREE.DirectionalLight(0xffedcf,2.2);key.position.set(0,0,8);scene.add(key);
  key.castShadow=true;
  key.shadow.mapSize.set(1024,1024);
  Object.assign(key.shadow.camera,{left:-4,right:4,top:4,bottom:-4,near:.1,far:20});
  key.shadow.camera.updateProjectionMatrix();
  key.shadow.bias=-.0002;
  key.shadow.normalBias=.015;
  key.shadow.radius=3;
  let model;
  try { model=await new FBXLoader().loadAsync(new URL('./revolver/Colt32-20.fbx',import.meta.url).href); }
  catch(error){envMap.dispose();renderer.dispose();throw error;}
  const cylinder=model.getObjectByName('Drum_Mag');
  const hammer=model.getObjectByName('Hammer');
  const trigger=model.getObjectByName('Trigger');
  if(!cylinder||!hammer||!trigger)throw Error('模型缺少可動零件');
  const cylinderRest=cylinder.quaternion.clone();
  const cylinderPosition=cylinder.position.clone();
  const hammerRest=hammer.quaternion.clone();
  const triggerRest=trigger.quaternion.clone();
  model.updateMatrixWorld(true);
  // Preserve the author's mesh, UVs and independent parts; replace materials for this site.
  model.traverse(object=>{
    if(!object.isMesh)return;
    object.castShadow=true;
    object.receiveShadow=true;
    const positions=object.geometry.attributes.position;
    const point=new THREE.Vector3();
    const metal=new THREE.MeshStandardMaterial({color:0x1b242e,metalness:.72,roughness:.42,envMapIntensity:.4});
    object.material=metal;
    if(object.name==='Body') {
      const wood=new THREE.MeshStandardMaterial({color:0x482516,metalness:.03,roughness:.78});
      object.material=[metal,wood];
      const geometry=object.geometry;const index=geometry.index;
      const count=index?index.count:positions.count;
      geometry.clearGroups();let groupStart=0;let previous=-1;
      const centroid=new THREE.Vector3();
      for(let i=0;i<count;i+=3){
        centroid.set(0,0,0);
        for(let j=0;j<3;j++)centroid.add(point.fromBufferAttribute(positions,index?index.getX(i+j):i+j).applyMatrix4(object.matrixWorld));
        centroid.divideScalar(3);
        const materialIndex=centroid.x>90&&centroid.y<5?1:0;
        if(previous!==materialIndex){if(previous>=0)geometry.addGroup(groupStart,i-groupStart,previous);groupStart=i;previous=materialIndex;}
      }
      geometry.addGroup(groupStart,count-groupStart,previous);
    }
  });
  const box=new THREE.Box3().setFromObject(model);
  const center=box.getCenter(new THREE.Vector3());
  const size=box.getSize(new THREE.Vector3());
  const modelRoot=new THREE.Group();
  model.position.sub(center);modelRoot.add(model);
  modelRoot.scale.setScalar(4.5/size.x);modelRoot.rotation.z=-.18;
  scene.add(modelRoot);
  // XY is the real table plane, Z is height. The overhead light stays fixed in world space.
  modelRoot.updateMatrixWorld(true);
  const modelBounds=new THREE.Box3().setFromObject(modelRoot);
  modelRoot.position.z=.025-modelBounds.min.z;
  // Approximate the real revolver's collision hull from its mesh, rather than
  // using only a single axis-aligned bounding-box height. Collision samples
  // are stored in root-local space so they rotate together with the firearm.
  const collisionCandidates=[];
  modelRoot.updateMatrixWorld(true);
  model.traverse(part=>{
    if(!part.isMesh || !part.geometry?.attributes?.position)return;
    const attr=part.geometry.attributes.position;
    const stride=Math.max(1,Math.floor(attr.count/900));
    for(let i=0;i<attr.count;i+=stride){
      const v=new THREE.Vector3().fromBufferAttribute(attr,i);
      part.localToWorld(v);modelRoot.worldToLocal(v);
      if(Number.isFinite(v.x)&&Number.isFinite(v.y)&&Number.isFinite(v.z))collisionCandidates.push(v);
    }
  });
  // Capture vertices on the extremities in 74 directions. This is an
  // efficient contact hull (instead of testing the entire mesh every frame).
  const collisionPoints=[];
  const collisionUnique=new Set();
  const directions=[];
  for(let a=0;a<12;a++)for(let b=0;b<6;b++){
    const az=2*Math.PI*a/12,polar=Math.PI*(b+.5)/6;
    directions.push(new THREE.Vector3(Math.cos(az)*Math.sin(polar),Math.sin(az)*Math.sin(polar),Math.cos(polar)));
  }
  directions.push(new THREE.Vector3(0,0,1),new THREE.Vector3(0,0,-1));
  for(const dir of directions){
    let highest=-Infinity,best=-1;
    for(let i=0;i<collisionCandidates.length;i++){
      const dot=collisionCandidates[i].dot(dir);
      if(dot>highest){highest=dot;best=i;}
    }
    if(best>=0&&!collisionUnique.has(best)){
      collisionUnique.add(best);collisionPoints.push(collisionCandidates[best]);
    }
  }
  // The root is placed at the mesh bounding-box centre. A visual hull radius
  // is used for the table's invisible circular guard.
  const collisionScale=modelRoot.scale.x;
  const hullRadius=Math.max(...collisionPoints.map(v=>Math.hypot(v.x,v.y,v.z)*collisionScale));
  const initialRotation=modelRoot.quaternion.clone();
  const initialHeight=modelRoot.position.z;
  const initialXY=modelRoot.position.clone();
  const woodCanvas=document.createElement('canvas');woodCanvas.width=woodCanvas.height=512;
  const ctx=woodCanvas.getContext('2d');ctx.fillStyle='#4f3323';ctx.fillRect(0,0,512,512);
  for(let i=0;i<160;i++){
    ctx.strokeStyle=i%3===0?'rgba(34,17,8,.16)':'rgba(209,165,112,.12)';ctx.lineWidth=i%5===0?2:1;
    ctx.beginPath();for(let x=0;x<=512;x+=4){const y=i*3.3+Math.sin(x*.018+i*.17)*5+Math.sin(x*.045+i)*1.8;if(x===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);}ctx.stroke();
  }
  const woodTexture=new THREE.CanvasTexture(woodCanvas);woodTexture.colorSpace=THREE.SRGBColorSpace;
  const tabletop=new THREE.Mesh(new THREE.CylinderGeometry(3.05,3.05,.22,96),[
    new THREE.MeshStandardMaterial({color:0x39291d,roughness:.8}),
    new THREE.MeshStandardMaterial({map:woodTexture,roughness:.8,metalness:0}),
    new THREE.MeshStandardMaterial({color:0x302319,roughness:.9})
  ]);
  tabletop.rotation.x=Math.PI/2;tabletop.position.z=-.11;tabletop.receiveShadow=true;scene.add(tabletop);
  const tableRim=new THREE.Mesh(new THREE.TorusGeometry(3.02,.045,12,96),new THREE.MeshStandardMaterial({color:0x9b7745,roughness:.55,metalness:.3}));
  tableRim.position.z=.005;tableRim.receiveShadow=true;scene.add(tableRim);
  const ammunition=new THREE.Group();scene.add(ammunition);
  const brass=new THREE.MeshStandardMaterial({color:0xc19336,metalness:.7,roughness:.3});
  const copper=new THREE.MeshStandardMaterial({color:0xb96735,metalness:.65,roughness:.38});
  const caseGeometry=new THREE.CylinderGeometry(.07,.07,.25,16);
  const tipGeometry=new THREE.SphereGeometry(.07,16,8,0,Math.PI*2,0,Math.PI/2);
  const baseGeometry=new THREE.CylinderGeometry(.08,.08,.025,16);
  function setAmmoCount(count){
    ammunition.clear();
    for(let i=0;i<count;i++){
      const round=new THREE.Group();
      const casing=new THREE.Mesh(caseGeometry,brass);round.add(casing);
      const tip=new THREE.Mesh(tipGeometry,copper);tip.position.y=.125;round.add(tip);
      const base=new THREE.Mesh(baseGeometry,brass);base.position.y=-.125;round.add(base);
      round.position.set((i-(count-1)/2)*.34,-1.9,.085);
      round.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});
      ammunition.add(round);
    }
    stage.dataset.tableAmmo=String(count);render();
  }
  stage.appendChild(renderer.domElement);
  stage.classList.add('model-loaded');
  stage.dataset.modelState='ready';
  stage.dataset.modelParts='Body,Pin,Drum_Mag,Hammer,Trigger';
  function render(){ if(!stage.hidden)renderer.render(scene,camera); }
  function resize(){const rect=stage.getBoundingClientRect();if(rect.width<1||rect.height<1)return;renderer.setSize(rect.width,rect.height,false);camera.aspect=rect.width/rect.height;camera.updateProjectionMatrix();render();}
  const observer=new ResizeObserver(resize);observer.observe(stage);
  // The table and camera stay in world coordinates; only the revolver is draggable.
  // Dragging lifts the revolver visibly, then rotates it around its own centre.
  const raycaster=new THREE.Raycaster();
  const pointer=new THREE.Vector2();
  const worldUp=new THREE.Vector3(0,0,1);
  const cameraRight=new THREE.Vector3();
  const drag={active:false,id:null,x:0,y:0};
  let interactionEnabled=true;
  let liftAnimation=0;
  const liftDistance=1.24;
  let shotLocked=false;
  const edgeRadius=2.82;
  const gravity=17;
  let fallSequence=0;
  function keepInsideTable(){
    // Invisible circular wall for the model footprint: the centre may not leave the table.
    const x=modelRoot.position.x,y=modelRoot.position.y;
    const distance=Math.hypot(x,y);
    if(distance>edgeRadius){const factor=edgeRadius/distance;modelRoot.position.x=x*factor;modelRoot.position.y=y*factor;}
  }
  function cancelMovement(){++liftAnimation;++fallSequence;}
  function groundHeight(){
    const previous=modelRoot.position.z;
    modelRoot.updateMatrixWorld(true);
    const bottom=new THREE.Box3().setFromObject(modelRoot).min.z;
    return previous-bottom+.025;
  }
  // Contact-based rigid-body settling: gravity, rotation, impact impulses,
  // friction and damping. The gun cannot pass through the wood plane.
  const pointWorld=new THREE.Vector3();
  const impulseAxis=new THREE.Vector3();
  const angularVelocity=new THREE.Vector3();
  function lowestContacts(){
    let min=Infinity;
    const contacts=[];
    for(const local of collisionPoints){
      pointWorld.copy(local).multiplyScalar(collisionScale).applyQuaternion(modelRoot.quaternion);
      const z=pointWorld.z+modelRoot.position.z;
      if(z<min)min=z;
      contacts.push({offset:pointWorld.clone(),z});
    }
    return {min,contacts:contacts.filter(c=>c.z<=min+.095)};
  }
  function dropByGravity(onSettled=()=>{}){
    cancelMovement();
    const token=fallSequence;
    let previous=performance.now(),verticalSpeed=0;
    let elapsed=0,stillFrames=0;
    angularVelocity.set(0,0,0);
    const floorZ=.025;
    stage.dataset.modelAirborne='true';
    function step(now){
      if(token!==fallSequence)return;
      let dt=Math.min(.038,Math.max(0,(now-previous)/1000));previous=now;
      dt=Math.max(dt,.001);
      const substeps=3, h=dt/substeps;
      for(let sub=0;sub<substeps;sub++){
        elapsed+=h;
        verticalSpeed-=gravity*h;
        modelRoot.position.z+=verticalSpeed*h;
        const spin=angularVelocity.length()*h;
        if(spin>1e-7){
          impulseAxis.copy(angularVelocity).normalize();
          modelRoot.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(impulseAxis,Math.min(spin,.12))).normalize();
        }
        keepInsideTable();
        const {min,contacts}=lowestContacts();
        const penetration=floorZ-min;
        if(penetration>=-.025){
          if(penetration>0)modelRoot.position.z+=penetration;
          // Multiple sampled contact patches approximate a rigid non-point gun.
          // Off-centre contact forces tip the gun over after the first impact.
          const count=Math.max(1,contacts.length);
          for(const contact of contacts){
            const r=contact.offset;
            const contactSpeed=verticalSpeed+(angularVelocity.x*r.y-angularVelocity.y*r.x);
            if(contactSpeed<0){
              const bounce=Math.abs(contactSpeed)>.7?.24:0;
              const inertia=.42+(.18*r.lengthSq());
              const effective=1+(r.x*r.x+r.y*r.y)/inertia;
              const j=-(1+bounce)*contactSpeed/effective/count;
              verticalSpeed+=j;
              angularVelocity.x+=r.y*j/inertia;
              angularVelocity.y-=r.x*j/inertia;
            }
            // Gravity acts through the centre of mass; contact underneath an
            // end of the barrel therefore creates a real overturning moment.
            const inertia=.55+(.15*r.lengthSq());
            angularVelocity.x+=(r.y*gravity*h/inertia)/count;
            angularVelocity.y+=(-r.x*gravity*h/inertia)/count;
          }
          if(Math.abs(verticalSpeed)<.16)verticalSpeed=0;
          angularVelocity.multiplyScalar(Math.exp(-4.4*h));
          if(Math.abs(verticalSpeed)<.06&&angularVelocity.length()<.075)stillFrames++;
          else stillFrames=0;
        } else {
          angularVelocity.multiplyScalar(Math.exp(-.18*h));
          stillFrames=0;
        }
        if(angularVelocity.length()>8)angularVelocity.setLength(8);
      }
      render();
      // The tabletop remains stationary throughout the entire animation.
      if(stillFrames>25||elapsed>7){
        const contacts=lowestContacts();
        if(contacts.min<floorZ)modelRoot.position.z+=floorZ-contacts.min;
        stage.dataset.modelAirborne='false';
        render();onSettled();return;
      }
      requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }
  function bottomHeight(){
    modelRoot.updateMatrixWorld(true);
    return new THREE.Box3().setFromObject(modelRoot).min.z;
  }
  function restHeight(){return groundHeight();}
  function animateHeight(destination,duration=240){
    ++fallSequence;
    const token=++liftAnimation;
    const origin=modelRoot.position.z;
    const started=performance.now();
    function update(now){
      if(token!==liftAnimation)return;
      const t=Math.min(1,(now-started)/duration);
      const ease=t*t*(3-2*t);
      modelRoot.position.z=origin+(destination-origin)*ease;
      render();
      if(t<1)requestAnimationFrame(update);
    }
    requestAnimationFrame(update);
  }
  function pointerOnRevolver(event){
    const rect=renderer.domElement.getBoundingClientRect();
    pointer.set(((event.clientX-rect.left)/rect.width)*2-1,-((event.clientY-rect.top)/rect.height)*2+1);
    raycaster.setFromCamera(pointer,camera);
    return raycaster.intersectObject(modelRoot,true).length>0;
  }
  renderer.domElement.style.cursor='grab';
  renderer.domElement.addEventListener('pointerdown',event=>{
    if(!interactionEnabled||drag.active||event.button!==0||!pointerOnRevolver(event))return;
    event.preventDefault();
    drag.active=true;drag.id=event.pointerId;drag.x=event.clientX;drag.y=event.clientY;
    renderer.domElement.setPointerCapture(event.pointerId);
    renderer.domElement.style.cursor='grabbing';
    stage.dataset.modelDragging='true';
    stage.dataset.modelAirborne='true';
    animateHeight(restHeight()+liftDistance,220);
  });
  renderer.domElement.addEventListener('pointermove',event=>{
    if(!drag.active||event.pointerId!==drag.id)return;
    const dx=event.clientX-drag.x,dy=event.clientY-drag.y;
    drag.x=event.clientX;drag.y=event.clientY;
    camera.getWorldDirection(cameraRight);
    cameraRight.cross(worldUp).normalize();
    const yaw=new THREE.Quaternion().setFromAxisAngle(worldUp,-dx*.009);
    const pitch=new THREE.Quaternion().setFromAxisAngle(cameraRight,-dy*.009);
    modelRoot.quaternion.premultiply(yaw).premultiply(pitch);
    modelRoot.position.z=Math.max(modelRoot.position.z,groundHeight()+.18);
    keepInsideTable();
    render();
  });
  function finishDrag(event){
    if(!drag.active||(event&&event.pointerId!==drag.id))return;
    drag.active=false;drag.id=null;
    renderer.domElement.style.cursor='grab';
    stage.dataset.modelDragging='false';
    if(!shotLocked)dropByGravity();
  }
  renderer.domElement.addEventListener('pointerup',finishDrag);
  renderer.domElement.addEventListener('pointercancel',finishDrag);
  renderer.domElement.addEventListener('lostpointercapture',finishDrag);
  function setInteractionEnabled(value){
    interactionEnabled=value;
    if(!value)finishDrag();
    renderer.domElement.style.cursor=value?'grab':'default';
  }
  renderer.domElement.addEventListener('webglcontextlost',event=>{event.preventDefault();stage.dataset.modelState='context-lost';});
  renderer.domElement.addEventListener('webglcontextrestored',()=>{stage.dataset.modelState='ready';resize();});
  const localAxis=new THREE.Vector3(0,0,1);
  function setCylinderAngle(degrees){
    cylinder.quaternion.copy(cylinderRest).multiply(new THREE.Quaternion().setFromAxisAngle(localAxis,THREE.MathUtils.degToRad(degrees)));
    stage.dataset.cylinderAngle=String(degrees);render();
  }
  function tween(duration,frame){return new Promise(resolve=>{const started=performance.now();function tick(now){const t=Math.min(1,(now-started)/duration);frame(t);render();if(t<1)requestAnimationFrame(tick);else resolve();}requestAnimationFrame(tick);});}
  resize();
  return {
    setAmmoCount,
    reset(){cylinder.position.copy(cylinderPosition);setCylinderAngle(0);hammer.quaternion.copy(hammerRest);trigger.quaternion.copy(triggerRest);render();},
    resetView(){finishDrag();cancelMovement();shotLocked=false;modelRoot.quaternion.copy(initialRotation);modelRoot.position.copy(initialXY);modelRoot.position.z=initialHeight;stage.dataset.modelAirborne='false';resize();},
    // Called on every trigger press, so any manually dragged angle is discarded.
    async raiseForShot(reduced=false,quick=false){
      shotLocked=true;setInteractionEnabled(false);cancelMovement();
      modelRoot.quaternion.copy(initialRotation);
      modelRoot.position.x=initialXY.x;modelRoot.position.y=initialXY.y;
      stage.dataset.modelAirborne='true';
      const from=modelRoot.position.z;
      const destination=groundHeight()+liftDistance;
      if(reduced){modelRoot.position.z=destination;render();}
      else await tween(quick ? 190 : 400,t=>{const k=t*t*(3-2*t);modelRoot.position.z=from+(destination-from)*k;});
    },
    async aimAtCamera(reduced=false,quick=false){
      const from=modelRoot.quaternion.clone();
      // The FBX barrel points along local -X. Aim that axis at the fixed camera.
      const towardCamera=camera.position.clone().sub(modelRoot.position).normalize();
      const target=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(-1,0,0),towardCamera);
      if(reduced){modelRoot.quaternion.copy(target);modelRoot.position.z=groundHeight()+liftDistance;render();return;}
      await tween(quick ? 230 : 520,t=>{
        const k=t*t*(3-2*t);modelRoot.quaternion.copy(from).slerp(target,k);
        // Rotation changes the underside; keep the model above the fixed tabletop.
        modelRoot.position.z=Math.max(modelRoot.position.z,groundHeight()+.76);
      });
    },
    lowerAfterShot(reduced=false){
      if(!shotLocked)return;
      // Unlock the trigger as soon as the falling animation starts. The next
      // shot cancels the previous fall and immediately raises the model.
      shotLocked=false;
      if(reduced){
        modelRoot.position.z=groundHeight();
        stage.dataset.modelAirborne='false';
        render();
      }else{
        dropByGravity();
      }
      setInteractionEnabled(true);
    },
    async loadAmmo(count,reduced=false){
      setAmmoCount(count);setInteractionEnabled(false);stage.dataset.loadingAmmo='true';
      try{
        const openPosition=cylinderPosition.clone().add(new THREE.Vector3(0,-60,15));
        if(!reduced)await tween(280,t=>cylinder.position.lerpVectors(cylinderPosition,openPosition,t*t*(3-2*t)));
        else cylinder.position.copy(openPosition);
        for(const round of [...ammunition.children]){
          modelRoot.updateMatrixWorld(true);
          const destination=cylinder.getWorldPosition(new THREE.Vector3());
          const start=round.position.clone();
          if(!reduced)await tween(360,t=>{
            const eased=t*t*(3-2*t);
            round.position.lerpVectors(start,destination,eased);
            round.position.z+=Math.sin(t*Math.PI)*.6;
            round.rotation.z=-Math.PI/2*eased;
            round.scale.setScalar(1-.4*eased);
          });
          ammunition.remove(round);stage.dataset.tableAmmo=String(ammunition.children.length);render();
        }
        if(!reduced)await tween(280,t=>cylinder.position.lerpVectors(openPosition,cylinderPosition,t*t*(3-2*t)));
      }finally{cylinder.position.copy(cylinderPosition);setInteractionEnabled(true);stage.dataset.loadingAmmo='false';render();}
    },
    async spinCylinder(from,to,duration,reduced=false){
      if(stage.dataset.modelState!=='ready')throw Error('3D畫面暫時無法使用，請重新載入頁面');
      setInteractionEnabled(false);
      try{await tween(duration,t=>{const eased=1-Math.pow(1-t,3);setCylinderAngle(reduced?(t===1?to:from):from+(to-from)*eased);});setCylinderAngle(to);}
      finally{if(!shotLocked)setInteractionEnabled(true);}
    },
    async fire(reduced=false,quick=false){if(reduced)return;await tween(quick ? 110 : 180,t=>{
      const pull=Math.sin(t*Math.PI);
      hammer.quaternion.copy(hammerRest).multiply(new THREE.Quaternion().setFromAxisAngle(localAxis,-.25*pull));
      trigger.quaternion.copy(triggerRest).multiply(new THREE.Quaternion().setFromAxisAngle(localAxis,.18*pull));
    });},
  };
}
