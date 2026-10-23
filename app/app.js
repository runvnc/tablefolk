/* tablefolk.world v14.2 — clear map + click-to-spawn mode */
const canvas = document.getElementById('renderCanvas');
const compassHud=document.createElement('div'); compassHud.id='compassHud'; compassHud.innerHTML='<span class="compass-n">N</span><span>E</span><span>S</span><span>W</span><small>camera facing N</small>'; document.body.appendChild(compassHud);
// Every asset path hangs off the assets base (packs.js: ?assets=, config, or ./assets/).
const ASSET_BASE = window.tablefolkPacks?.base || './assets/';
const ASSET = ASSET_BASE + 'textures/';
const PROP_ASSET = ASSET_BASE + 'models/props/';
const CHAR_ASSET = ASSET_BASE + 'models/characters/kaykit/';
const ANIM_ASSET = ASSET_BASE + 'models/animations/kaykit/';
const TILE_ASSET = ASSET_BASE + 'models/tiles/';
const DETAIL_NORMAL = ASSET_BASE + 'textures/detail_clay_n.png';
const TABLEFOLK_ASSET = ASSET_BASE + 'models/characters/generated/';
// The world is a board of 1x1 tiles standing in the sea. Playable cells are
// |x| <= halfW-1 and |z| <= halfH-1 (cols = 2*halfW-1); scenarios set the size
// ("size": [cols, rows]) through setWorldSize(). ?island=1 brings back the old
// fixed HD island (shelved: 11 x 9 cells, irregular coast).
const LEGACY_ISLAND = new URLSearchParams(location.search).has('island');
const WORLD = { size: 12, half: 6, w: 12, h: 10, halfW: 6, halfH: 5, cols: 11, rows: 9 };
const BOARD_DEFAULT = [23, 17], BOARD_MIN = 5, BOARD_MAX = 63;
function boardDims(cols, rows){
  const fit=(n,d)=>{ n=Math.round(Number(n)||d); n=Math.max(BOARD_MIN,Math.min(BOARD_MAX,n)); return n%2 ? n : n+1; };
  return [fit(cols,BOARD_DEFAULT[0]), fit(rows,BOARD_DEFAULT[1])];
}
function applyWorldDims(cols, rows){
  Object.assign(WORLD,{ cols, rows, halfW:(cols+1)/2, halfH:(rows+1)/2, w:cols+1, h:rows+1 });
  WORLD.size=Math.max(WORLD.w,WORLD.h); WORLD.half=WORLD.size/2;
}
if(!LEGACY_ISLAND) applyWorldDims(...BOARD_DEFAULT);
const COMMANDS = ['say','walk','face','look','touch','push','pull','carry','drop','throw','dig','build','repair','panic','emote','note','spell.push','spell.spark','spell.fireball','goal','give_quest','give','sell','inventory','whisper','attack','wield','workflow','remember','feel','eat'];
// mind.js: every talking character has these, unless the scenario says "mind": false
// (feel() is there for scenarios that allow it: by default it used up turns
// that should have been speech)
const MIND_COMMANDS = ['goal','remember','eat'];
const state = {
  scene:null, engine:null, camera:null, shadow:null, materials:{}, characters:[], selected:null, target:null,
  blocks:[], props:[], tiles:[], bubbles:[], badges:[], meta:new WeakMap(), held:new Map(), allowed:new Set(['walk','face']), zoomFocus:null, animSources:null,
  turn:{index:0, phase:'ready', command:null, resolveMs:200, lastEndedAt:0, mode:true}, globalHistory:[], nextAgentId:null,
  brainConfigs:new Map(), player:{gold:100,items:[]}, saveKey:'tablefolkState', nextSpawnId:1, spawnMode:{enabled:false, type:'critter'}
};
function log(s){ try{ window.tablefolkPlay?.remember(s); }catch{} const box=document.getElementById('log'); const div=document.createElement('div'); div.className='logline'; div.textContent=s; box.prepend(div); while(box.children.length>10) box.lastChild.remove(); try{ const muted=(window._tablefolkLogToastMuteUntil&&performance.now()<window._tablefolkLogToastMuteUntil)||s.startsWith('selected '); if(!muted) window.tablefolkToast?.(s,{type:'info'}); }catch{} }
function pickRandom(a){ return a[Math.floor(Math.random()*a.length)] }
function clamp(v,a,b){ return Math.max(a,Math.min(b,v)); }
// Dev escape hatch: ?norender=1 skips the render loop entirely (animate() and
// scene.render() both no-op) so only the UI widgets stay live. Used to isolate
// whether heavy 3D draw work is contributing to perceived LLM response latency.
const TABLEFOLK_FORCE_NO_RENDER = new URLSearchParams(location.search).has('norender');
// Dev escape hatch: ?webgl=1 forces the WebGL2 engine. Needed because headless
// swiftshader advertises WebGPU but then loses the device, which makes the real
// app impossible to screenshot for art review. Not a supported user path.
async function createEngine(){
  if(window.TABLEFOLK_FORCE_WEBGL || new URLSearchParams(location.search).has('webgl')){
    console.warn('createEngine: ?webgl=1 - using WebGL2 fallback (dev only)');
    return new BABYLON.Engine(canvas,true,{preserveDrawingBuffer:true,stencil:true},true);
  }
  if(!navigator.gpu) throw new Error('WebGPU unavailable in this browser');
  const engine = new BABYLON.WebGPUEngine(canvas,{antialias:true,adaptToDeviceRatio:true});
  await engine.initAsync(); return engine;
}
function mat(scene,name,texture,opts={}){
  const m=new BABYLON.PBRMaterial(name,scene);
  const tx=new BABYLON.Texture(ASSET+texture,scene,true,false,BABYLON.Texture.TRILINEAR_SAMPLINGMODE);
  tx.wrapU=BABYLON.Texture.WRAP_ADDRESSMODE; tx.wrapV=BABYLON.Texture.WRAP_ADDRESSMODE;
  tx.anisotropicFilteringLevel=8; tx.uScale=opts.uScale||1; tx.vScale=opts.vScale||1;
  m.albedoTexture=tx;
  m.metallic=0; m.roughness=opts.roughness??.88;
  m.environmentIntensity=.55; m.specularIntensity=opts.specularIntensity??.5;
  if(opts.diffuse) m.albedoColor=opts.diffuse;
  if(opts.emissive) m.emissiveColor=opts.emissive;
  if(opts.alpha!==undefined){ m.alpha=opts.alpha; tx.hasAlpha=true; }
  return applyClayLook(m,scene,{detail:opts.detail??.11});
}
// The shared "painted clay diorama" look lives in look.js (window.TABLEFOLK_LOOK)
// so app.js and app/tilepreview.html cannot drift. See that file for the
// measured reasons behind each value.
const LOOK = () => window.TABLEFOLK_LOOK;
function applyClayLook(m,scene,opts){ return LOOK()?.applyClayLook(m,scene,opts) ?? m; }
function applyClayLookToMeshes(meshes,scene,opts){ LOOK()?.applyClayLookToMeshes(meshes,scene,opts); }

function colorMat(scene,name,color,emissive=null){ const m=new BABYLON.PBRMaterial(name,scene); m.albedoColor=color; m.metallic=0; m.roughness=.90; m.environmentIntensity=.55; m.specularIntensity=.5; if(emissive) m.emissiveColor=emissive; return applyClayLook(m,scene,{detail:.11}); }

function makeWaterMaterial(scene){
  const m=mat(scene,'water_soft','water_painterly.png',{uScale:4.5,vScale:4.5,alpha:.72,roughness:.24,detail:0,emissive:new BABYLON.Color3(.006,.022,.028)});
  // Water is deliberately not clay: retain a broad environment highlight and
  // avoid the shared detail normal used by opaque props.
  m.environmentIntensity=.78; m.specularIntensity=.72; m.backFaceCulling=false;
  return m;
}
function setOrthoZoom(camera,halfWidth){
  const aspect=state.engine.getRenderWidth()/Math.max(1,state.engine.getRenderHeight());
  camera.orthoLeft=-halfWidth; camera.orthoRight=halfWidth; camera.orthoTop=halfWidth/aspect; camera.orthoBottom=-halfWidth/aspect;
  camera.metadata ||= {}; camera.metadata.orthoHalfWidth=halfWidth;
}
function setupMouseWheelZoom(camera){
  // This handler owns wheel zoom; Babylon's own wheel input would zoom a
  // second time on every notch.
  camera.inputs.removeByType('ArcRotateCameraMouseWheelInput');
  canvas.addEventListener('wheel',ev=>{
    ev.preventDefault();
    // First person: the wheel zooms by narrowing the field of view.
    if(state.firstPerson && fpCam){ const px0=ev.deltaY*(ev.deltaMode===1?33:ev.deltaMode===2?400:1); fpCam.fov=clamp(fpCam.fov*Math.exp(clamp(px0,-150,150)*.001),.3,1.3); return; }
    // Scale by wheel distance (lines/pages normalised to pixels, one notch is
    // usually 100px) so a notch is ~10% and trackpads zoom smoothly.
    const px=ev.deltaY*(ev.deltaMode===1?33:ev.deltaMode===2?400:1);
    const factor=Math.exp(clamp(px,-150,150)*.001);
    const zoomIn=px<0;
    const focus=state.zoomFocus || state.target?.getAbsolutePosition?.() || state.selected?.root?.position;
    // setTarget keeps the camera position and recomputes the radius, which
    // silently zoomed in a lot whenever the focus was nearer the camera;
    // keep the radius and only change it through the zoom factor below.
    const radius=camera.radius;
    if(focus){
      const f=focus.clone ? focus.clone() : new BABYLON.Vector3(focus.x||0,focus.y||0,focus.z||0);
      f.y=0.6;
      camera.setTarget(BABYLON.Vector3.Lerp(camera.target,f,(zoomIn?.42:.18)*Math.min(1,Math.abs(px)/100)));
    }
    camera.radius=clamp(radius*factor,3.5,60);
  },{passive:false});
}
function hashNoise(x,z){
  const n=Math.sin(x*127.1+z*311.7)*43758.5453123;
  return n-Math.floor(n);
}
function smoothNoise(x,z){
  const xi=Math.floor(x), zi=Math.floor(z), xf=x-xi, zf=z-zi;
  const u=xf*xf*(3-2*xf), v=zf*zf*(3-2*zf);
  const a=hashNoise(xi,zi), b=hashNoise(xi+1,zi), c=hashNoise(xi,zi+1), d=hashNoise(xi+1,zi+1);
  return BABYLON.Scalar.Lerp(BABYLON.Scalar.Lerp(a,b,u), BABYLON.Scalar.Lerp(c,d,u), v);
}
function fbm(x,z){
  let v=0, amp=.55, f=.18;
  for(let i=0;i<5;i++){ v+=smoothNoise(x*f,z*f)*amp; f*=2.07; amp*=.48; }
  return v;
}
function mixColor(a,b,t){ return new BABYLON.Color4(a.r+(b.r-a.r)*t,a.g+(b.g-a.g)*t,a.b+(b.b-a.b)*t,1); }
function makeVertexTerrain(scene){
  const size=32, half=16, n=96;
  const grassA=new BABYLON.Color4(.23,.36,.18,1), grassB=new BABYLON.Color4(.43,.56,.25,1), grassC=new BABYLON.Color4(.16,.29,.16,1);
  const dirtA=new BABYLON.Color4(.42,.28,.16,1), dirtB=new BABYLON.Color4(.62,.46,.27,1), dirtC=new BABYLON.Color4(.25,.18,.12,1);
  const stoneA=new BABYLON.Color4(.34,.34,.31,1), stoneB=new BABYLON.Color4(.55,.54,.48,1);
  const positions=[], indices=[], colors=[], uvs=[];
  for(let iz=0; iz<=n; iz++){
    const z=-half + size*iz/n;
    for(let ix=0; ix<=n; ix++){
      const x=-half + size*ix/n;
      const noise=fbm(x,z);
      const micro=fbm(x*3.3+17,z*3.3-9);
      const pathCenter=Math.sin(x*.28)*.48 + Math.sin(x*.77+1.8)*.18;
      const pathWidth=1.35 + smoothNoise(x*.35,9)*.55;
      const pathMask=1-BABYLON.Scalar.SmoothStep(pathWidth,pathWidth+1.25,Math.abs(z-pathCenter));
      const stoneMask=(x>2&&z<-5)?BABYLON.Scalar.SmoothStep(0,1.8,Math.min(x-2,-5-z)):0;
      const waterMask=(x>6&&z>3)?BABYLON.Scalar.SmoothStep(0,1.4,Math.min(x-6,z-3)):0;
      let y=.012 + (noise-.5)*.075 + (micro-.5)*.018;
      if(waterMask>.55) y=-.12;
      let col=mixColor(grassA,grassB,clamp(noise*.95+micro*.18,0,1));
      if(noise>.72) col=mixColor(col,grassC,.28);
      if(pathMask>.01){ const dcol=mixColor(dirtA,dirtB,clamp(noise*.9+micro*.35,0,1)); col=mixColor(col,dcol,pathMask*.92); y-=pathMask*.018; }
      if(stoneMask>.01){ const scol=mixColor(stoneA,stoneB,clamp(noise*.8+micro*.24,0,1)); col=mixColor(col,scol,stoneMask*.88); y+=stoneMask*.035; }
      if(waterMask>.01){ col=mixColor(col,new BABYLON.Color4(.10,.22,.24,1),waterMask*.8); }
      // subtle painted speckles, not UV tiling
      if(hashNoise(ix*13.1,iz*7.7)>.965 && pathMask<.3 && stoneMask<.25 && waterMask<.1) col=mixColor(col,new BABYLON.Color4(.55,.64,.31,1),.35);
      if(hashNoise(ix*5.2+3,iz*11.3)>.975 && pathMask>.25) col=mixColor(col,new BABYLON.Color4(.18,.13,.09,1),.35);
      positions.push(x,y,z); colors.push(col.r,col.g,col.b,col.a); uvs.push(ix/n,iz/n);
    }
  }
  for(let iz=0; iz<n; iz++) for(let ix=0; ix<n; ix++){
    const a=iz*(n+1)+ix, b=a+1, c=a+n+1, d=c+1;
    if((ix+iz)%2===0) indices.push(a,c,b,b,c,d); else indices.push(a,c,d,a,d,b);
  }
  const mesh=new BABYLON.Mesh('single_vertex_colored_terrain',scene);
  const vd=new BABYLON.VertexData(); vd.positions=positions; vd.indices=indices; vd.colors=colors; vd.uvs=uvs;
  BABYLON.VertexData.ComputeNormals(positions,indices,vd.normals=[]); vd.applyToMesh(mesh,true);
  mesh.receiveShadows=true; mesh.isPickable=false;
  const material=new BABYLON.StandardMaterial('terrain_vertex_paint',scene);
  material.diffuseColor=new BABYLON.Color3(1,1,1); material.specularColor=new BABYLON.Color3(.5,.5,.5);
  material.useVertexColor=true; material.backFaceCulling=false;
  mesh.material=material;
  return mesh;
}
function makeShoreRocks(scene){
  for(let i=0;i<55;i++){
    const along=Math.random(); let x,z;
    if(Math.random()<.5){ x=6+Math.random()*9.8; z=3+(Math.random()<.5?0:12)+(.5-Math.random())*.7; }
    else { x=6+(Math.random()<.5?0:9.8)+(.5-Math.random())*.7; z=3+Math.random()*12; }
    const r=BABYLON.MeshBuilder.CreatePolyhedron('shore_pebble',{type:2,size:.055+Math.random()*.11},scene);
    r.position.set(x,.05,z); r.rotation.set(Math.random(),Math.random()*Math.PI,Math.random()); r.material=state.materials.pebble; r.isPickable=false; addShadow(r);
  }
}
function makeBetterWaterLegacy(scene){
  const mat=new BABYLON.StandardMaterial('water_lagoon_material',scene);
  mat.diffuseColor=new BABYLON.Color3(.08,.31,.36); mat.emissiveColor=new BABYLON.Color3(.012,.055,.062);
  mat.specularColor=new BABYLON.Color3(.55,.72,.72); mat.alpha=.62; mat.backFaceCulling=false;
  const water=BABYLON.MeshBuilder.CreateGround('water_lagoon_sheet',{width:9.85,height:12.1,subdivisions:54},scene);
  water.position.set(11.05,.045,9.05); water.material=mat; water.isPickable=false;
  const pos=water.getVerticesData(BABYLON.VertexBuffer.PositionKind); water.metadata={basePositions:pos.slice()};
  scene.onBeforeRenderObservable.add(()=>{
    const t=performance.now()*0.001; const arr=water.getVerticesData(BABYLON.VertexBuffer.PositionKind); const base=water.metadata.basePositions;
    for(let i=0;i<arr.length;i+=3){ const x=base[i], z=base[i+2]; arr[i+1]=Math.sin(x*1.55+t*1.15+z*.28)*.026+Math.sin(z*2.25-t*.95)*.014+Math.sin((x+z)*.72+t*.55)*.009; }
    water.updateVerticesData(BABYLON.VertexBuffer.PositionKind,arr,false,false);
  });
  // stylized glints: moving thin ribbons above the water, cheap but reads much better than tiled blue texture
  const glintMat=colorMat(scene,'water_glint',new BABYLON.Color3(.67,.93,.92),new BABYLON.Color3(.04,.18,.18)); glintMat.alpha=.42;
  for(let j=0;j<9;j++){
    const pts=[]; const z=-5.2+j*1.28;
    for(let i=0;i<18;i++){ const x=-4.4+i*.52; pts.push(new BABYLON.Vector3(x,.075,z+Math.sin(i*.7+j)*.08)); }
    const line=BABYLON.MeshBuilder.CreateTube('water_glint_ribbon',{path:pts,radius:.012,tessellation:5},scene);
    line.position.set(11.05,0,9.05); line.material=glintMat; line.isPickable=false;
    scene.onBeforeRenderObservable.add(()=>{ line.position.x=11.05+Math.sin(performance.now()*0.0005+j)*.12; line.position.z=9.05+Math.cos(performance.now()*0.00043+j)*.08; });
  }
  return water;
}
function addTerrainPolishLegacy(scene){
  // v11: terrain is now a vertex-painted continuous surface with irregular biomes.
  // The 1m box tiles remain hidden/muted as collision/picking scaffolding, not as the visible ground material.
  makeVertexTerrain(scene);
  makeBetterWater(scene);
  makeShoreRocks(scene);
  // varied tufts, biased away from paths/water/quarry
  for(let i=0;i<520;i++){
    const x=-15.5+Math.random()*31, z=-15.5+Math.random()*31;
    const pathCenter=Math.sin(x*.28)*.48 + Math.sin(x*.77+1.8)*.18;
    if((Math.abs(z-pathCenter)<1.65 && x>-9.8 && x<9.8) || (x>5.7&&z>2.7) || (x>2&&z<-5)) continue;
    const h=.11+Math.random()*.20, d=.045+Math.random()*.06;
    const blade=BABYLON.MeshBuilder.CreateCylinder('grass_tuft',{height:h,diameterTop:.006,diameterBottom:d,tessellation:4},scene);
    blade.position.set(x,.07+h*.35,z); blade.rotation.set((Math.random()-.5)*.26,Math.random()*Math.PI,(Math.random()-.5)*.26);
    blade.material=Math.random()<.72?state.materials.grassBlade:state.materials.grassBlade2; blade.isPickable=false; addShadow(blade);
  }
}

async function initKayKitAnimationSources(scene){
  if(state.animSources) return state.animSources;
  const files=['Rig_Medium_General.glb','Rig_Medium_MovementBasic.glb','Rig_Medium_MovementAdvanced.glb','Rig_Medium_CombatRanged.glb','Rig_Medium_CombatMelee.glb','Rig_Medium_Tools.glb','Rig_Medium_Simulation.glb','Rig_Medium_Special.glb'];
  const groups=[];
  for(const file of files){
    try{
      const res=await BABYLON.SceneLoader.ImportMeshAsync('',ANIM_ASSET,file,scene);
      for(const m of res.meshes){ m.setEnabled(false); m.isVisible=false; }
      for(const g of res.animationGroups||[]){ g.stop(); groups.push(g); }
    }catch(e){ console.warn('animation source failed',file,e); }
  }
  state.animSources={groups};
  log('KayKit animation sources loaded: '+groups.length+' groups');
  return state.animSources;
}
function descendantsByName(root){
  const map=new Map();
  for(const n of [root,...root.getDescendants(false)]){ if(!map.has(n.name)) map.set(n.name,n); }
  return map;
}
function cloneAnimGroupsForRig(root,id){
  const src=state.animSources?.groups||[];
  const targetMap=descendantsByName(root);
  const out={};
  for(const g of src){
    // Some source clips share a name; the later one wins, so free the one it
    // replaces (it used to leak 7 animation groups per character spawn).
    try{ const cloned=g.clone(id+'_'+g.name, oldTarget => targetMap.get(oldTarget.name) || null); if(cloned){ cloned.stop(); if(out[g.name]) out[g.name].dispose(); out[g.name]=cloned; } }
    catch(e){ /* some target types may not map cleanly; skip */ }
  }
  return out;
}
function pickAnim(g,names){ if(!g.rigAnims) return null; for(const n of names){ if(g.rigAnims[n]) return g.rigAnims[n]; } return null; }
function playRig(g,mode,loop=true){
  if(!g?.rigged || g.rigMode===mode) return;
  if(g.activeRigAnim) g.activeRigAnim.stop();
  const choices={
    idle:['Idle_A','Idle_B','Melee_Unarmed_Idle'],
    walk:['Walking_A','Walking_B','Walking_C'],
    panic:['Running_A','Running_B'],
    talk:['Waving','Interact','Idle_B'],
    cast:['Ranged_Magic_Spellcasting','Ranged_Magic_Shoot','Ranged_Magic_Raise'],
    push:['Interact','Melee_Unarmed_Attack_Punch_A','Push_Ups'],
    carry:['Holding_A','Holding_B','PickUp'],
    throw:['Throw','Ranged_Magic_Shoot'],
    dig:['Dig','Digging','Pickaxe'],
    repair:['Hammer','Hammering','Work_A'],
    bonk:['Hit_A','Hit_B'],
    dance:['Cheering','Push_Ups','Sit_Ups'],
    laugh:['Cheering','Interact'],
    sit:['Sit_Floor_Idle','Sit_Floor_Down','Sit_Chair_Idle'],
    wave:['Waving'],
    clap:['Cheering'],
    cheer:['Cheering'],
    sleep:['Lie_Idle','Lie_Down'],
    bow:['Interact','Use_Item']
  }[g.charModel && mode==='talk' ? 'idle' : mode] || ['Idle_A'];   // people talk without waving
  const ag=pickAnim(g,choices) || pickAnim(g,['Idle_A']);
  if(ag){ ag.start(loop,1.0,ag.from,ag.to,false); g.activeRigAnim=ag; g.rigMode=mode; }
  g._lastRigAnimName = ag ? ag.name : null;
}
function debugRigAnims(g){ try{ console.log('[character rig]', g.id, 'clips:', Object.keys(g.rigAnims||{})); }catch{} }
// Carrying: the object stays upright and is held in both hands. Small things
// ride in front at chest height; anything wider than the carrier's torso
// (barrels, crates, chests) is hoisted overhead, since critter arms are far too
// short to reach around it. Arms are aimed at grip points from bone world
// positions rather than per-rig axis conventions, so the same code works on the
// Meshy and KayKit skeletons, layered on top of whatever clip is playing.
const CARRY_LIFT_TIME=.35, CARRY_BLEND_IN=.3, CARRY_BLEND_OUT=.25, CARRY_OVERHEAD_HALF_WIDTH=.2, CARRY_OVERHEAD_HALF_HEIGHT=.24;
// Bounds of an object's physical parts (a lamp's ground glow is not part of it).
const solidPart=m=>m.name!=='lamp_pool';
function beginCarry(g,h){
  h.computeWorldMatrix(true);
  const {min,max}=h.getHierarchyBoundingVectors(true,solidPart);
  const pos=h.getAbsolutePosition();
  const r=Math.max(max.x-min.x,max.z-min.z)/2, halfH=(max.y-min.y)/2;
  const itemYaw=h.rotationQuaternion ? h.rotationQuaternion.toEulerAngles().y : (h.rotation?.y||0);
  if(!g._carryBodyTop){
    // Top of the character (ears included) in root-relative units, measured once.
    g.root.computeWorldMatrix(true);
    const b=g.root.getHierarchyBoundingVectors(true, m=>m.isEnabled() && m.isVisible!==false && (m.getTotalVertices?.()||0)>0);
    g._carryBodyTop=Math.max(.5,b.max.y-g.root.position.y);
  }
  h._carry={ r, halfH, centerDy:(min.y+max.y)/2-pos.y, overhead:r>CARRY_OVERHEAD_HALF_WIDTH || halfH>CARRY_OVERHEAD_HALF_HEIGHT,
    yawOffset:itemYaw-yawForDir(g.dir), from:pos.clone(), t:0 };
}
function endCarry(h,pos,gentle=false){
  delete h._carry;
  h.position.copyFrom(pos); h.computeWorldMatrix(true);
  // Held items are kinematic and steered with target transforms; teleport the
  // body to the drop point for one physics step before handing it back to the sim.
  try{ h.physicsBody?.setPrestepType?.(BABYLON.PhysicsPrestepType.TELEPORT); }catch{}
  h.physicsBody?.setMotionType(BABYLON.PhysicsMotionType.DYNAMIC);
  try{ h.physicsBody?.setLinearVelocity(BABYLON.Vector3.Zero()); h.physicsBody?.setAngularVelocity(BABYLON.Vector3.Zero()); }catch{}
  state.scene.onAfterPhysicsObservable?.addOnce(()=>{ try{ h.physicsBody?.setPrestepType?.(BABYLON.PhysicsPrestepType.DISABLED); }catch{} });
  // A set-down item must settle, not fly: if it still ends up overlapping
  // something, Havok's push-apart can fling it upward. Cap the rise briefly.
  if(gentle && h.physicsBody){
    const body=h.physicsBody, until=performance.now()+700, v=new BABYLON.Vector3();
    const obs=state.scene.onAfterPhysicsObservable.add(()=>{
      if(performance.now()>until || h.isDisposed?.() || h._carry){ state.scene.onAfterPhysicsObservable.remove(obs); return; }
      try{ body.getLinearVelocityToRef(v); if(v.y>.4 || Math.hypot(v.x,v.z)>1.2){ v.y=Math.min(v.y,.4); const k=Math.min(1,1.2/(Math.hypot(v.x,v.z)||1)); v.x*=k; v.z*=k; body.setLinearVelocity(v); } }catch{}
    });
  }
}
// Refresh world matrices from the root down to `node` (animation writes local
// transforms; cached world matrices lag until recomputed).
function refreshChain(node){
  const chain=[]; for(let n=node;n;n=n.parent) chain.push(n);
  for(let i=chain.length-1;i>=0;i--) chain[i].computeWorldMatrix(true);
}
// Rotate `bone` so the direction toward `child` points at `target`, blended by w.
function aimBoneAt(bone,child,target,w){
  if(!bone?.parent || !child || !bone.rotationQuaternion) return;
  // An earlier aim up the chain moved this bone; its child's cached world matrix is stale.
  bone.computeWorldMatrix(true); child.computeWorldMatrix(true);
  const inv=bone.parent.getWorldMatrix().clone().invert();
  const bp=bone.getAbsolutePosition();
  const cur=BABYLON.Vector3.TransformNormal(child.getAbsolutePosition().subtract(bp),inv).normalize();
  const des=BABYLON.Vector3.TransformNormal(target.subtract(bp),inv).normalize();
  const q=new BABYLON.Quaternion(); BABYLON.Quaternion.FromUnitVectorsToRef(cur,des,q);
  const L=bone.rotationQuaternion;
  bone.rotationQuaternion=BABYLON.Quaternion.Slerp(L,q.multiply(L),w);
  bone.computeWorldMatrix(true); child.computeWorldMatrix(true);
}
function poseCarryArms(g,w){
  const b=findBones(g);
  for(const [arm,fore,hand] of [[b.armL,b.forearmL,b.handL],[b.armR,b.forearmR,b.handR]]){
    if(!arm || !fore || !hand) continue;
    refreshChain(hand);
    // Pick the grip on whichever side of the body this arm actually is.
    const sh=arm.getAbsolutePosition().clone(), el=fore.getAbsolutePosition(), wr=hand.getAbsolutePosition();
    const side=BABYLON.Vector3.Dot(sh.subtract(g.root.position),g._carryRight)>=0 ? 1 : -1;
    const target=g.root.position.add(side>0 ? g._carryGripR : g._carryGripL);
    // Two-bone IK: bend the elbow (down, out, slightly back) when the grip is
    // closer than full reach, instead of shoving a straight arm through the item.
    const a=el.subtract(sh).length(), bl=wr.subtract(el).length();
    const toT=target.subtract(sh); const d=clamp(toT.length(),Math.abs(a-bl)+1e-4,a+bl-1e-4); toT.normalize();
    const pole=g._carryRight.scale(side*.6).add(BABYLON.Vector3.Down()).subtract(g._carryFwd.scale(.2));
    const perp=pole.subtract(toT.scale(BABYLON.Vector3.Dot(pole,toT))).normalize();
    const cosA=clamp((a*a+d*d-bl*bl)/(2*a*d),-1,1);
    const elbow=sh.add(toT.scale(a*cosA)).add(perp.scale(a*Math.sqrt(1-cosA*cosA)));
    aimBoneAt(arm,fore,elbow,w);
    aimBoneAt(fore,hand,target,w);
  }
}
function positionHeldItem(g,dt){
  const h=state.held.get(g.id);
  const c=h?._carry;
  g._carryW=clamp((g._carryW||0)+(c ? dt/CARRY_BLEND_IN : -dt/CARRY_BLEND_OUT),0,1);
  if(!h || !c){
    // Ease the arms back down after a drop, using the last grip points.
    if(g.rigged && g._carryW>0 && g._carryGripL) poseCarryArms(g,g._carryW*g._carryW*(3-2*g._carryW));
    return;
  }
  const fwd=new BABYLON.Vector3(g.dir.x,0,g.dir.z).normalize();
  const right=BABYLON.Vector3.Cross(BABYLON.Vector3.Up(),fwd);
  const s=g.root.scaling.y/.87;
  const walking=g.anim==='walk' || g.rigMode==='walk';
  const bob=walking ? Math.abs(Math.sin(g.t*9))*.018 : Math.sin(g.t*2.2)*.006;
  let center, gripL, gripR;
  if(c.overhead){
    // Resting on top of the head, palms up under its bottom rim.
    center=new BABYLON.Vector3(0,g._carryBodyTop-.06*s+c.halfH+bob,0).add(fwd.scale(.03*s));
    const rim=new BABYLON.Vector3(0,center.y-c.halfH+.02*s,0).add(fwd.scale(.03*s));
    gripR=rim.add(right.scale(c.r*.6)); gripL=rim.subtract(right.scale(c.r*.6));
  } else {
    // Hugged against the chest, hands on either side.
    const chestY=g._carryBodyTop*.5;
    center=new BABYLON.Vector3(0,chestY+bob,0).add(fwd.scale(.1*s+c.r));
    gripR=center.add(right.scale(c.r*.95)); gripL=center.subtract(right.scale(c.r*.95));
  }
  g._carryRight=right; g._carryFwd=fwd; g._carryGripL=gripL; g._carryGripR=gripR;
  const want=g.root.position.add(center);
  want.y-=c.centerDy;
  // Lift from where it was sitting instead of teleporting into the hands.
  c.t=Math.min(1,c.t+dt/CARRY_LIFT_TIME);
  const k=c.t*c.t*(3-2*c.t);
  const pos=k<1 ? BABYLON.Vector3.Lerp(c.from,want,k).add(new BABYLON.Vector3(0,Math.sin(k*Math.PI)*.12,0)) : want;
  const yawQ=BABYLON.Quaternion.RotationYawPitchRoll(yawForDir(g.dir)+c.yawOffset,0,0);
  h.rotationQuaternion=h.rotationQuaternion ? BABYLON.Quaternion.Slerp(h.rotationQuaternion,yawQ,Math.min(1,dt*12)) : yawQ;
  forceBodyTransform(h,pos);
  if(g.rigged) poseCarryArms(g,g._carryW*g._carryW*(3-2*g._carryW));
}
// Talking mouth for the Meshy critter (critter_rigged.glb). The face has a small
// sculpted mouth cavity centred near (0,.881,.26) in the mesh's bind space.
// A runtime morph target drops the lower lip and chin, lifts the upper lip
// a little and stretches the dark cavity open. Morphs apply before skinning,
// so it follows the head bone in every animation.
const MOUTH_MESH={name:'char1',verts:15845};
function addMouthMorph(mesh,scene){
  const P=mesh.getVerticesData(BABYLON.VertexBuffer.PositionKind); if(!P) return null;
  const open=new Float32Array(P), A=.016;
  for(let i=0;i<P.length;i+=3){
    const x=P[i], y=P[i+1], z=P[i+2]; if(z<=.17) continue;   // front of the face only
    const dy=y-.881, ry=dy<0?.05:.03, r2=(x/.055)**2+(dy/ry)**2; if(r2>=1) continue;
    const w=(1-r2)**2, t=clamp((dy+.005)/.01,0,1), up=t*t*(3-2*t);   // up: 0 lower lip .. 1 upper lip
    open[i+1]=y+A*w*(-1+1.3*up);
    open[i+2]=z-.35*A*w*(1-up);   // the jaw swings slightly back as it drops
  }
  const target=new BABYLON.MorphTarget('mouth_open',0,scene); target.setPositions(open);
  const mtm=new BABYLON.MorphTargetManager(scene); mtm.addTarget(target); mesh.morphTargetManager=mtm;
  return target;
}
// Mouth openness: follows the real TTS waveform when this character's voice is
// playing, and chatters procedurally for unvoiced speech bubbles.
function updateMouth(g,dt){
  const tts=window.tablefolkTTS; let want=0;
  if(tts?.current?.agent===g) want=clamp((tts.level?.()||0)*7-.03,0,1);
  else if(g.speaking && !g.voiced) want=Math.max(0,Math.sin(g.t*13))*(.55+.45*Math.sin(g.t*3.3+1.1));
  const m=g.mouth, rate=want>m.influence?28:14;   // open fast, close a bit slower
  m.influence+=(want-m.influence)*Math.min(1,rate*dt);
  if(m.influence<.002) m.influence=0;
  m.apply?.();
}
// People (KayKit) have no mouth: add a small dark one on the face, parented
// to the head bone so it follows every animation. Placed from the face
// itself, after the first frame (skinned positions need a posed skeleton):
// the eyes are the vertices on the black palette swatch, the mouth sits
// below them on the front of the skin.
function addPersonMouth(g){
  const sc=state.scene;
  const head=g.rigRoot?.getChildMeshes(false).find(m=>/_Head$/.test(m.name) && m.skeleton);
  const bone=head?.skeleton.bones.find(b=>/^head$/i.test(b.name)), node=bone?.getTransformNode();
  if(!head || !node) return;
  const P=head.getPositionData(true,true), UV=head.getVerticesData(BABYLON.VertexBuffer.UVKind); if(!P || !UV) return;
  const wm=head.getWorldMatrix(), pts=[], eyes=[], skin=[];
  for(let i=0;i<P.length/3;i++){
    const w=BABYLON.Vector3.TransformCoordinates(new BABYLON.Vector3(P[i*3],P[i*3+1],P[i*3+2]),wm), u=UV[i*2], v=UV[i*2+1];
    pts.push(w);
    if(v<.25 && u>=.25 && u<.375) eyes.push(w); else if(v<.25 && u<.125) skin.push(w);
  }
  if(eyes.length<4 || skin.length<10) return;
  const mean=a=>a.reduce((s,p)=>s.addInPlace(p),new BABYLON.Vector3()).scaleInPlace(1/a.length);
  const hc=mean(pts), ec=mean(eyes);
  const fwd=new BABYLON.Vector3(ec.x-hc.x,0,ec.z-hc.z).normalize(), side=BABYLON.Vector3.Cross(BABYLON.Axis.Y,fwd).normalize();
  const lat=p=>BABYLON.Vector3.Dot(p.subtract(ec),side);
  const sep=Math.max(.01,Math.abs(mean(eyes.filter(p=>lat(p)>0)).subtract(mean(eyes.filter(p=>lat(p)<=0))).length()||.05));
  const y=ec.y-.52*sep, near=skin.filter(p=>Math.abs(lat(p))<.3*sep && Math.abs(p.y-y)<.2*sep);
  if(!near.length) return;
  const front=near.reduce((a,p)=>BABYLON.Vector3.Dot(p,fwd)>BABYLON.Vector3.Dot(a,fwd)?p:a);
  const pos=new BABYLON.Vector3(ec.x,y,ec.z).addInPlace(fwd.scale(BABYLON.Vector3.Dot(front.subtract(ec),fwd)+.03*sep));
  if(!state.mouthMat){ const m=new BABYLON.PBRMaterial('person_mouth',sc); m.albedoColor=new BABYLON.Color3(.12,.03,.03); m.roughness=.6; m.metallic=0; m.maxSimultaneousLights=8; state.mouthMat=m; }
  const mouth=BABYLON.MeshBuilder.CreateSphere(g.id+'_mouth',{diameter:1,segments:10},sc);
  mouth.material=state.mouthMat; mouth.isPickable=false; mouth.metadata={ownerId:g.id};
  // orientation and size in world terms, converted into the head bone's space
  const inv=node.getWorldMatrix().clone().invert(), sc3=new BABYLON.Vector3(); node.getWorldMatrix().decompose(sc3);
  const toLocalDir=d=>BABYLON.Vector3.TransformNormal(d,inv).normalize();
  mouth.parent=node; mouth.position=BABYLON.Vector3.TransformCoordinates(pos,inv);
  mouth.rotationQuaternion=BABYLON.Quaternion.FromLookDirectionLH(toLocalDir(fwd),toLocalDir(BABYLON.Axis.Y));
  const k=1/(sc3.x||1), W=.42*sep*k, D=.12*sep*k, H0=.05*sep*k, H1=.42*sep*k;
  mouth.scaling.set(W,H0,D);
  g.owned?.meshes.push(mouth);
  g.mouth={influence:0,apply(){ mouth.scaling.y=H0+(H1-H0)*this.influence; }};
}
function findHeadNodes(g){
  if(g._headNodes) return g._headNodes;
  const nodes=[];
  if(g.rigRoot){
    for(const n of [g.rigRoot,...g.rigRoot.getDescendants(false)]){
      if(n.name && /head/i.test(n.name) && !/headphone/i.test(n.name)) nodes.push(n);
    }
  }
  g._headNodes=nodes;
  return nodes;
}
// Find named bones on any supported rig (Meshy PascalCase or KayKit lowercase)
function findBones(g){
  if(g._bones) return g._bones;
  const b={};
  if(g.rigRoot){
    const map={head:['Head','head'],neck:['neck','Neck'],hips:['Hips','hips'],spine:['Spine01','Spine','spine'],chest:['Spine02','chest'],armL:['LeftArm','upperarm.l'],armR:['RightArm','upperarm.r'],forearmL:['LeftForeArm','lowerarm.l'],forearmR:['RightForeArm','lowerarm.r'],handL:['LeftHand','hand.l'],handR:['RightHand','hand.r'],legL:['LeftUpLeg','upperleg.l'],legR:['RightUpLeg','upperleg.r'],shinL:['LeftLeg','lowerleg.l'],shinR:['RightLeg','lowerleg.r'],root:['Armature','root']};
    const all=[g.rigRoot,...g.rigRoot.getDescendants(false)];
    for(const key of Object.keys(map)){
      for(const nm of map[key]){ const hit=all.find(n=>n.name===nm); if(hit){ b[key]=hit; break; } }
    }
  }
  g._bones=b;
  console.log('[character bones]', g.id, 'found:', Object.keys(b).join(',') || 'NONE');
  return b;
}
// Capture a bone's rest transform once, so procedural emotes compose on top
// of the rest pose and can be restored cleanly afterwards.
function boneRest(bone){
  if(!bone._rest){
    bone._rest={
      q: bone.rotationQuaternion ? bone.rotationQuaternion.clone() : null,
      r: bone.rotation ? bone.rotation.clone() : null,
      p: bone.position ? bone.position.clone() : null
    };
  }
  return bone._rest;
}
function restoreBone(bone){
  if(!bone || !bone._rest) return;
  if(bone._rest.q){ bone.rotationQuaternion = bone.rotationQuaternion || new BABYLON.Quaternion(); bone.rotationQuaternion.copyFrom(bone._rest.q); }
  if(bone._rest.r){ bone.rotation.copyFrom(bone._rest.r); }
  if(bone._rest.p){ bone.position.copyFrom(bone._rest.p); }
}
// Procedural emote fallback: drive bones directly when no matching rig clip exists
function updateProceduralEmote(g,dt){
  if(g.emote==null || g.emoteTime==null) return;
  g.emoteTime+=dt;
  const t=g.emoteTime, b=findBones(g);
  if(!Object.keys(b).length){ g.emote=null; g.emoteTime=null; return; }
  const damp=Math.min(1,t*6);
  const endT={dance:3.2,laugh:2.2,sit:4.0,wave:1.8,clap:2.2,cheer:2.6,sleep:5.0,bow:1.8}[g.emote]||2.5;
  const fade=t>endT-.4 ? Math.max(0,(endT-t)/.4) : 1;
  const k=damp*fade;
  // Compose rest * delta as quaternions; GLB bones ignore .rotation when
  // rotationQuaternion is set, so we always write the quaternion.
  const R=(bone,x=0,y=0,z=0)=>{
    if(!bone) return;
    const rest=boneRest(bone);
    const dq=BABYLON.Quaternion.RotationYawPitchRoll(y*k,x*k,z*k);
    const base=rest.q || BABYLON.Quaternion.RotationYawPitchRoll(rest.r.y,rest.r.x,rest.r.z);
    bone.rotationQuaternion=base.multiply(dq);
  };
  const P=(bone,dy)=>{
    if(!bone) return;
    const rest=boneRest(bone);
    bone.position.y=rest.p.y + dy*k;
  };
  if(g.emote==='dance'||g.emote==='cheer'){
    const s=Math.sin(t*7);
    R(b.armL,0,0, 1.9+s*.45); R(b.armR,0,0,-1.9-s*.45);
    R(b.forearmL,-.25-.15*s); R(b.forearmR,-.25+.15*s);
    R(b.head,0,Math.sin(t*3.5)*.25,0);
    R(b.spine,0,Math.sin(t*3.5)*.12,0);
    // Bounce the whole character via the armature/root instead of a skinned
    // hips bone (hips translation only moves the bone, not the visual mesh).
    if(b.root){ const rest=boneRest(b.root); b.root.position.y=rest.p.y + Math.abs(Math.sin(t*7))*.12*k; }
  } else if(g.emote==='wave'){
    R(b.armR,0,0,-2.2); R(b.forearmR,0,0,Math.sin(t*9)*.55);
    R(b.head,0,-.25,0);
  } else if(g.emote==='laugh'){
    const s=Math.sin(t*11);
    R(b.head,-.28+.1*s,0,0);
    R(b.spine,-.06+.04*s,0,0);
    R(b.armL,0,0,.5); R(b.armR,0,0,-.5);
  } else if(g.emote==='clap'){
    const s=Math.abs(Math.sin(t*8));
    R(b.armL,0,0,1.25-.55*s); R(b.armR,0,0,-1.25+.55*s);
    R(b.forearmL,-1.1); R(b.forearmR,-1.1);
  } else if(g.emote==='sit'){
    R(b.legL,-1.35); R(b.legR,-1.35); R(b.shinL,1.3); R(b.shinR,1.3);
    // Lower the entire character so the butt visually meets the ground.
    if(b.root){ const rest=boneRest(b.root); b.root.position.y=rest.p.y - .28*k; }
  } else if(g.emote==='sleep'){
    R(b.head,.42,0,.3);
    R(b.spine,.3,0,0);
    if(b.root){ const rest=boneRest(b.root); b.root.position.y=rest.p.y - .08*k + Math.sin(t*1.2)*.015; }
  } else if(g.emote==='bow'){
    const p=Math.sin(Math.min(1,t/.9)*Math.PI);
    R(b.spine,.75*p,0,0); R(b.chest,.35*p,0,0); R(b.head,.25*p,0,0);
  }
  if(t>=endT){
    for(const key of Object.keys(b)) restoreBone(b[key]);
    g.emote=null; g.emoteTime=null;
    if(g.anim!=='talk'){ g.anim='idle'; playRig(g,'idle',true); }
  }
}
async function createKayKitCharacter(scene,id,pos,file,label){
  const res=await BABYLON.SceneLoader.ImportMeshAsync('',CHAR_ASSET,file,scene);
  const root=new BABYLON.TransformNode(id,scene);
  root.position.copyFrom(pos); root.scaling.setAll(1.29);
  const importedRoot=res.meshes.find(m=>m.name==='__root__') || res.meshes[0];
  importedRoot.parent=root; importedRoot.position.set(0,0,0); importedRoot.rotationQuaternion=null; importedRoot.rotation.set(0,Math.PI,0);
  for(const mesh of res.meshes){ mesh.receiveShadows=true; mesh.isPickable=true; mesh.metadata={ownerId:id}; addShadow(mesh); }
  applyClayLookToMeshes(res.meshes,scene);
  const collider=BABYLON.MeshBuilder.CreateBox(id+'_collider',{width:.66,height:1.35,depth:.58},scene);
  collider.position.copyFrom(root.position); collider.position.y+=.68; collider.isVisible=false; collider.metadata={ownerId:id};
  const agg=addBody(collider,'dynamic','BOX',1.25,{friction:.92,restitution:.02});
  agg?.body?.setMotionType?.(BABYLON.PhysicsMotionType.ANIMATED);
  const rigAnimsK=cloneAnimGroupsForRig(root,id);
  const character={id,root,collider,agg,selected:false,anim:'idle',t:Math.random()*10,dir:new BABYLON.Vector3(0,0,-1),style:label,traits:{fireball:78,obedience:48},rigged:true,rigRoot:importedRoot,rigAnims:rigAnimsK,
    owned:{meshes:[...res.meshes],skeletons:[...(res.skeletons||[])],groups:[...(res.animationGroups||[]),...Object.values(rigAnimsK)]},rigMode:null,activeRigAnim:null,cosmetic:{},logicalPos:new BABYLON.Vector3(pos.x,0,pos.z)};
  playRig(character,'idle',true);
  state.characters.push(character);
  const animCount=Object.keys(character.rigAnims||{}).length;
  log(id+' rig anims available: '+animCount);
  debugRigAnims(character);
  return character;
}
async function createGeneratedCritter(scene,id,pos){
  // Meshy's neutral rig already contains a subtle idle clip; walking is loaded as a
  // second container and retargeted by matching the generated skeleton node names.
  // ?v busts browser caches of the model; bump it whenever the GLB changes
  // (20261010: right-hand vertices re-weighted off the hips/thigh).
  const idleRes=await BABYLON.SceneLoader.ImportMeshAsync('',TABLEFOLK_ASSET,'critter_rigged.glb?v=20261018a',scene,null,'.glb');
  const root=new BABYLON.TransformNode(id,scene);
  root.position.copyFrom(pos); root.scaling.setAll(.87);
  const importedRoot=idleRes.meshes.find(m=>m.name==='__root__') || idleRes.meshes[0];
  // New imported PBR materials arrive after startup's global material pass.
  // Keep their shader layout conservative too. Four is Babylon's portable
  // WebGPU default; practicals are selected per mesh below.
  for(const material of new Set(idleRes.meshes.map(m=>m.material).filter(Boolean))){
    if(material instanceof BABYLON.PBRMaterial) material.maxSimultaneousLights=8;
  }
  importedRoot.parent=root; importedRoot.position.set(0,0,0);
  // Meshy exports this character facing local +Z; root yaw zero therefore faces north visually.
  importedRoot.rotationQuaternion=null; importedRoot.rotation.set(0,0,0);
  let mouth=null;
  for(const mesh of idleRes.meshes){
    mesh.receiveShadows=true; mesh.isPickable=true; mesh.metadata={ownerId:id}; addShadow(mesh); applyClayLook(mesh.material,scene);
    if(mesh.name===MOUTH_MESH.name && mesh.getTotalVertices()===MOUTH_MESH.verts) mouth=addMouthMorph(mesh,scene);
    if(mesh.material){
      // Keep the clay matte, but avoid forcing it so rough that every highlight disappears.
      if('roughness' in mesh.material) mesh.material.roughness=.24;
      if('metallic' in mesh.material) mesh.material.metallic=0;
      if('environmentIntensity' in mesh.material) mesh.material.environmentIntensity=.85;
      if('directIntensity' in mesh.material) mesh.material.directIntensity=1.0;
      // Clamp any baked emissive (the cyan ear-arcs glow like neon under night lighting)
      if('emissiveColor' in mesh.material && mesh.material.emissiveColor){ const e=mesh.material.emissiveColor; e.scaleToRef(0.12,e); }
      // Tint the pale mint clay toward goblin green to match the mockup
      if('albedoColor' in mesh.material && mesh.material.albedoColor){ const a=mesh.material.albedoColor; a.set(a.r*.72,a.g*.95,a.b*.68); }
      mesh.material.backFaceCulling=false;
    }
  }
  // Everything this character imported, so clearWorld can free it (each
  // spawn loads its own GLBs with 2048px textures; without this, every
  // scenario restart leaked ~7 textures, 2 skeletons and 3 animation groups
  // until the browser ran out of GPU memory).
  const owned={meshes:[...idleRes.meshes],skeletons:[...(idleRes.skeletons||[])],groups:[...(idleRes.animationGroups||[])]};
  const rigAnims={};
  const idle=idleRes.animationGroups?.[0];
  if(idle){ idle.name='Idle_A'; idle.stop(); rigAnims.Idle_A=idle; }
  try{
    const walkRes=await BABYLON.SceneLoader.ImportMeshAsync('',TABLEFOLK_ASSET,'critter_walking.glb',scene);
    const targetMap=descendantsByName(root);
    const sourceWalk=walkRes.animationGroups?.[0];
    if(sourceWalk){
      const walk=sourceWalk.clone(id+'_Walking_A',oldTarget=>targetMap.get(oldTarget.name)||null);
      if(walk){ walk.name='Walking_A'; walk.stop(); rigAnims.Walking_A=walk; }
    }
    for(const g of walkRes.animationGroups||[]) g.stop();
    owned.meshes.push(...walkRes.meshes); owned.skeletons.push(...(walkRes.skeletons||[])); owned.groups.push(...(walkRes.animationGroups||[]));
    if(rigAnims.Walking_A) owned.groups.push(rigAnims.Walking_A);
    // Keep the source hierarchy alive (but invisible): Babylon cloned animation
    // targets can share transform/skeleton internals with this imported source.
    for(const m of walkRes.meshes||[]){ m.setEnabled(false); m.isVisible=false; m.isPickable=false; }
  }catch(e){ console.warn('generated character walk animation failed to load',e); }
  const collider=BABYLON.MeshBuilder.CreateBox(id+'_collider',{width:.72,height:1.42,depth:.66},scene);
  collider.position.copyFrom(root.position); collider.position.y+=.72; collider.isVisible=false; collider.metadata={ownerId:id};
  const agg=addBody(collider,'dynamic','BOX',1.25,{friction:.92,restitution:.02});
  agg?.body?.setMotionType?.(BABYLON.PhysicsMotionType.ANIMATED);
  // Do not add per-character scene lights here. Babylon compiles every light
  // affecting a PBR material into that material's vertex pipeline; two lights
  // per spawned character pushed WebGPU over its 12-uniform-buffer stage limit.
  // The shared key/rim/fill/practical lights already model every character.
  const character={id,root,collider,agg,selected:false,anim:'idle',t:Math.random()*10,dir:new BABYLON.Vector3(0,0,-1),style:'critter',traits:{fireball:40,obedience:52},rigged:true,rigRoot:importedRoot,rigAnims,mouth,owned,rigMode:null,activeRigAnim:null,cosmetic:{},stepDistance:.72,logicalPos:new BABYLON.Vector3(pos.x,0,pos.z)};
  playRig(character,'idle',true); state.characters.push(character); debugRigAnims(character); return character;
}
async function createAgentCast(scene){
  try{
    await initKayKitAnimationSources(scene);
    await createKayKitCharacter(scene,'gib',new BABYLON.Vector3(-1,.06,-.7),'Rogue_Hooded.glb','rogue');
    await createKayKitCharacter(scene,'momo',new BABYLON.Vector3(.45,.06,-.55),'Mage.glb','mage');
    await createKayKitCharacter(scene,'zap',new BABYLON.Vector3(1.2,.06,.15),'Ranger.glb','ranger');
    log('KayKit Adventurers loaded as real rigged characters');
    return true;
  }catch(e){ console.warn('KayKit character load failed; falling back to procedural characters',e); log('KayKit character load failed; using procedural characters'); return false; }
}

async function tryLoadRiggedCharacter(scene){
  // Drop a humanoid GLB here later: /assets/models/characters/critter_humanoid.glb
  // v9 keeps the primitive characters as fallback, but the loader/animation mapping is ready.
  try{
    const result=await BABYLON.SceneLoader.ImportMeshAsync('', ASSET_BASE+'models/characters/', 'critter_humanoid.glb', scene);
    const root=new BABYLON.TransformNode('rigged_critter_preview_root',scene);
    root.position.set(-.25,(state.terrainTopY??0)+0.02,-1.25); root.scaling.setAll(.72);
    for(const mesh of result.meshes){ mesh.parent=root; mesh.receiveShadows=true; addShadow(mesh); }
    applyClayLookToMeshes(result.meshes,scene);
    if(result.animationGroups?.length){ result.animationGroups[0].start(true); }
    log('loaded rigged humanoid character: assets/models/characters/critter_humanoid.glb');
    return root;
  }catch(e){
    log('rigged character slot empty; using procedural characters for now');
    return null;
  }
}

function addShadow(mesh){
  if(!mesh) return;
  mesh.receiveShadows=true;
  if(state.shadow){ try { state.shadow.addShadowCaster(mesh,true); } catch{} }
  for(const shadow of state.extraShadows||[]){ try { shadow.addShadowCaster(mesh,true); } catch{} }
}
function registerAllShadowMeshes(scene){
  if(!state.shadow) return;
  for(const mesh of scene.meshes){
    if(!mesh || mesh.isDisposed?.() || mesh.name==='hd_sea' || mesh.name==='sky_dome') continue;
    mesh.receiveShadows=true;
    try { state.shadow.addShadowCaster(mesh,true); } catch{}
  }
}
function addBody(mesh,motion,shape='BOX',mass=1,opts={}){ if(!BABYLON.PhysicsBody) return null; const agg=new BABYLON.PhysicsAggregate(mesh,BABYLON.PhysicsShapeType[shape],{mass,friction:opts.friction??.82,restitution:opts.restitution??.08},state.scene); if(motion==='static') agg.body.setMotionType(BABYLON.PhysicsMotionType.STATIC); return agg; }
function tag(mesh,type,extra={}){ state.meta.set(mesh,{type,state:extra.state||'intact',material:extra.material||type,tileMaterial:extra.tileMaterial||null,health:extra.health??2,interactive:extra.interactive!==false,zone:extra.zone||'world',flammable:!!extra.flammable, soft:!!extra.soft, ...(extra.decor?{decor:true}:{}), ...(extra.foot?{foot:extra.foot}:{}), ...(extra.solid?{solid:true}:{})}); mesh.metadata=state.meta.get(mesh); return mesh; }
function meta(mesh){ const m=state.meta.get(mesh)||mesh?.metadata; if(m?.proxy) return state.meta.get(m.proxy)||m.proxy.metadata; return m; }
function logicalTarget(mesh){ const m=state.meta.get(mesh)||mesh?.metadata; return m?.proxy || mesh; }
function disposeWorldObject(mesh){
  if(!mesh) return;
  const mm=meta(mesh);
  try{ mm?.cleanup?.(); }catch(e){ console.warn('object cleanup failed',e); }
  try{ mesh.physicsBody?.dispose?.(); }catch{}
  // Notes own unique GPU resources. Shared world materials/textures must not be disposed.
  if(mm?.ownsMaterial){
    try{ mesh.material?.dispose?.(false,true); }catch{}
  }
  const wasTabletopWall=mm?.type==='wall' && mm?.tabletop;
  state.meta.delete(mesh);
  // Dispose the object's own materials (e.g. per-import GLB ones) but never a
  // shared world material: disposing state.materials.stone with one broken
  // wall used to break every other wall's material.
  const shared=new Set([...(state.sharedAssetMats||[]),...Object.values(state.materials||{}),state.lampPoolMat,state.lampPoolWarmMat,...Object.values(state.wallMats||{}),...Object.values(state.modernMats||{})].filter(Boolean));
  const own=new Set();
  for(const m of [mesh,...(mesh.getChildMeshes?.(false)||[])]) if(m.material && !shared.has(m.material)) own.add(m.material);
  try{ mesh.dispose?.(false,false); }catch{}
  for(const m of own) disposeOwnMaterial(m);
  if(wasTabletopWall) scheduleWallRebuild();
}

function damage(mesh,amount=1,kind='hit'){
  const m=meta(mesh); if(!m || !m.interactive) return;
  m.health-=amount;
  if(kind==='fire') { m.state='burned'; if(mesh.material!==state.materials.burned) mesh.material=state.materials.burned; emitBadge(mesh,'scorch'); }
  else if(m.health<=1 && m.state==='intact') { m.state='cracked'; if(state.materials.cracked) mesh.material=state.materials.cracked; emitBadge(mesh,'crack'); }
  if(m.type==='wall' && m.tabletop) scheduleWallRebuild();
  if(m.health<=0) breakObject(mesh,kind);
}
function breakObject(mesh,kind='hit'){
  const m=meta(mesh); if(!m || m.state==='broken') return; m.state='broken'; emitBadge(mesh,kind==='fire'?'poof':'bonk');
  const p=mesh.getAbsolutePosition().clone(); const material=mesh.material; const count=m.type==='wall'?7:5;
  disposeWorldObject(mesh); state.props=state.props.filter(x=>x!==mesh); state.blocks=state.blocks.filter(x=>x!==mesh);
  for(let i=0;i<count;i++){ const s=BABYLON.MeshBuilder.CreateBox('rubble_'+m.type,{size:.18+Math.random()*.22},state.scene); s.position=p.add(new BABYLON.Vector3((Math.random()-.5)*.55,.2+Math.random()*.4,(Math.random()-.5)*.55)); s.rotation.set(Math.random(),Math.random(),Math.random()); s.material=material||state.materials.stone; addBody(s,'dynamic','BOX',.18,{restitution:.18}); addShadow(s); tag(s,'rubble',{health:1,interactive:false}); const v=new BABYLON.Vector3(Math.random()-.5,.6,Math.random()-.5).scale(1.8); s.physicsBody?.applyImpulse(v,s.position); setTimeout(()=>disposeWorldObject(s),8500); }
}
function impulse(mesh,from,power,up=.25){ if(!mesh?.physicsBody) return; const dir=mesh.getAbsolutePosition().subtract(from); if(dir.length()<.001) dir.set(Math.random()-.5,0,Math.random()-.5); dir.y=up; dir.normalize(); mesh.physicsBody.applyImpulse(dir.scale(power),mesh.getAbsolutePosition()); }
function emitBadge(target,text){ const div=document.createElement('div'); div.className='badge'; div.textContent=text; document.body.appendChild(div); const node=target.root||target; state.badges.push({div,node,ttl:1.05,vy:-28}); }
function lowPolyBlob(name,scene,rx=.5,ry=.6,rz=.4,rings=5,seg=8){ const positions=[],indices=[],normals=[],uvs=[]; for(let r=0;r<=rings;r++){ const v=r/rings,phi=-Math.PI/2+v*Math.PI,y=Math.sin(phi)*ry,cr=Math.cos(phi); const wob=1+(r%2?.06:-.025); for(let s=0;s<seg;s++){ const u=s/seg,th=u*Math.PI*2; positions.push(Math.cos(th)*rx*cr*wob*(1+.04*Math.sin(3*th)),y,Math.sin(th)*rz*cr*wob*(1+.04*Math.cos(2*th))); uvs.push(u,v); } } for(let r=0;r<rings;r++) for(let s=0;s<seg;s++){ const a=r*seg+s,b=r*seg+(s+1)%seg,c=(r+1)*seg+s,d=(r+1)*seg+(s+1)%seg; indices.push(a,c,b,b,c,d); } BABYLON.VertexData.ComputeNormals(positions,indices,normals); const vd=new BABYLON.VertexData(); vd.positions=positions; vd.indices=indices; vd.normals=normals; vd.uvs=uvs; const mesh=new BABYLON.Mesh(name,scene); vd.applyToMesh(mesh); return mesh; }
function createCrystal(name,scene,height=1.1,radius=.25){ const pts=[],idx=[],uv=[],seg=6; pts.push(0,height/2,0); uv.push(.5,0); pts.push(0,-height/2,0); uv.push(.5,1); for(let i=0;i<seg;i++){ const th=i/seg*Math.PI*2; pts.push(Math.cos(th)*radius,0,Math.sin(th)*radius); uv.push(i/seg,.5); } for(let i=0;i<seg;i++){ const a=2+i,b=2+(i+1)%seg; idx.push(0,a,b,1,b,a); } const normals=[]; BABYLON.VertexData.ComputeNormals(pts,idx,normals); const vd=new BABYLON.VertexData(); vd.positions=pts; vd.indices=idx; vd.normals=normals; vd.uvs=uv; const m=new BABYLON.Mesh(name,scene); vd.applyToMesh(m); return m; }
function addToScene(mesh,material,body={}){ if(material) mesh.material=material; if(body.shape) addBody(mesh,body.motion||'dynamic',body.shape,body.mass??1,body); addShadow(mesh); return mesh; }
function createCritter(scene,id,pos,palette,style='goblin'){
  const root=new BABYLON.TransformNode(id,scene); root.position.copyFrom(pos); root.scaling.setAll(1.5);
  const clay=palette.clay||state.materials.critter;
  // A compact, deliberate silhouette: pear body, clear face, grounded feet.
  const body=lowPolyBlob(id+'_body',scene,.37,.43,.31,5,9); body.parent=root; body.position.y=.49; body.material=clay; addShadow(body);
  const head=lowPolyBlob(id+'_head',scene,style==='bot'?.32:.37,.30,style==='bot'?.31:.32,5,9); head.parent=root; head.position.y=1.02; head.material=style==='bot'?state.materials.bot:clay; addShadow(head);
  const muzzle=lowPolyBlob(id+'_muzzle',scene,.25,.14,.075,3,8); muzzle.parent=root; muzzle.position.set(0,.94,-.302); muzzle.material=palette.belly; addShadow(muzzle);
  const belly=lowPolyBlob(id+'_belly',scene,.235,.245,.055,4,9); belly.parent=root; belly.position.set(0,.48,-.294); belly.material=palette.belly; addShadow(belly);
  const footL=lowPolyBlob(id+'_footL',scene,.17,.085,.22,3,7); footL.parent=root; footL.position.set(-.17,.10,-.055); footL.material=palette.dark; addShadow(footL); const footR=footL.clone(id+'_footR'); footR.parent=root; footR.position.x=.17; addShadow(footR);
  const armL=lowPolyBlob(id+'_armL',scene,.085,.245,.09,4,7); armL.parent=root; armL.position.set(-.37,.56,0); armL.rotation.z=.24; armL.material=clay; addShadow(armL); const armR=armL.clone(id+'_armR'); armR.parent=root; armR.position.x=.37; armR.rotation.z=-.24; addShadow(armR);
  // Eyes are inset into the face instead of floating beyond its sides.
  const eyeMat=colorMat(scene,id+'_eye',new BABYLON.Color3(.96,.93,.78)); const pupilMat=colorMat(scene,id+'_pupil',new BABYLON.Color3(.025,.032,.028));
  for(const x of [-.105,.105]){
    const e=BABYLON.MeshBuilder.CreateSphere(id+'_eye',{diameter:.145,segments:10},scene); e.parent=root; e.position.set(x,1.075,-.302); e.scaling.set(.90,1.08,.62); e.material=eyeMat; addShadow(e);
    const p=BABYLON.MeshBuilder.CreateSphere(id+'_pupil',{diameter:.062,segments:8},scene); p.parent=root; p.position.set(x,1.067,-.348); p.scaling.z=.45; p.material=pupilMat;
  }
  const browMat=palette.dark;
  for(const x of [-.105,.105]){ const brow=BABYLON.MeshBuilder.CreateBox(id+'_brow',{width:.13,height:.025,depth:.025},scene); brow.parent=root; brow.position.set(x,1.17,-.326); brow.rotation.z=x<0?-.10:.10; brow.material=browMat; }
  const hat=BABYLON.MeshBuilder.CreateCylinder(id+'_hat',{diameterTop:style==='mushroom'?.60:.31,diameterBottom:style==='mushroom'?.82:.54,height:style==='mushroom'?.17:.21,tessellation:10},scene); hat.parent=root; hat.position.y=1.315; hat.material=style==='mushroom'?state.materials.mushroom:palette.hat; addShadow(hat);
  const pack=BABYLON.MeshBuilder.CreateBox(id+'_backpack',{width:.31,height:.36,depth:.12},scene); pack.parent=root; pack.position.set(0,.61,.29); pack.material=state.materials.canvas; addShadow(pack);
  // A readable staff rather than a detached toothpick.
  const wand=BABYLON.MeshBuilder.CreateCylinder(id+'_wand',{height:.92,diameter:.055,tessellation:7},scene); wand.parent=root; wand.position.set(.43,.55,-.12); wand.rotation.x=.10; wand.rotation.z=-.08; wand.material=state.materials.darkwood; addShadow(wand);
  const gem=createCrystal(id+'_wandgem',scene,.23,.085); gem.parent=root; gem.position.set(.46,1.04,-.165); gem.rotation.z=-.08; gem.material=state.materials.magic; addShadow(gem);
  const collider=BABYLON.MeshBuilder.CreateBox(id+'_collider',{width:.72,height:1.18,depth:.68},scene); collider.position.copyFrom(root.position); collider.position.y+=.62; collider.isVisible=false; const agg=addBody(collider,'dynamic','BOX',1.2,{friction:.9,restitution:.02});
  const character={id,root,body,head,arms:[armL,armR],feet:[footL,footR],collider,agg,selected:false,anim:'idle',t:Math.random()*10,dir:new BABYLON.Vector3(0,0,-1),style,traits:{fireball:82,obedience:45},cosmetic:{hat,pack,wand,gem,muzzle}};
  state.characters.push(character); return character;
}
function forceBodyTransform(mesh,pos){
  if(!mesh) return;
  mesh.position.copyFrom(pos);
  const q=mesh.rotationQuaternion || BABYLON.Quaternion.FromEulerAngles(mesh.rotation.x||0,mesh.rotation.y||0,mesh.rotation.z||0);
  try{ mesh.physicsBody?.setTargetTransform?.(pos,q); }catch{}
  try{ mesh.physicsBody?.setPrestepType?.(BABYLON.PhysicsPrestepType.ACTION); }catch{}
}
function setCharacterLogicalPosition(g,pos){
  if(!g) return;
  g.logicalPos = new BABYLON.Vector3(pos.x, 0, pos.z);
  if(g.root){ g.root.position.x=g.logicalPos.x; g.root.position.z=g.logicalPos.z; g.root.position.y=state.terrainTopY??0; }
  if(g.collider){
    const cpos=new BABYLON.Vector3(g.logicalPos.x,(state.terrainTopY??0)+.74,g.logicalPos.z);
    forceBodyTransform(g.collider,cpos);
    g.collider.physicsBody?.setMotionType?.(BABYLON.PhysicsMotionType.ANIMATED);
    zeroMeshMotion(g.collider);
  }
}
// Is there island top under (x,z)? The HD island is irregular (bays, noses,
// stepped ledges) and the invisible physics_ground is just the WORLD
// rectangle, so ask the visible top meshes. The ray stops .25 below the
// plateau, so the lower grass ledges count as a drop. Terrain is static, so
// results are cached per 1/4 tile.
const GROUND_MESH=/^(hd_island_|voxel_island)/;
const groundCache=new Map();
// Fast path: the HD island records its plateau tile centres (1x1 tiles), so
// "is there ground" is a lookup. Tiles centred on half-integers go in a grid
// map; the few off-grid terrace tiles are checked directly.
let plateauIndex=null;
function plateauGround(x,z){
  const tiles=state.plateauTiles; if(!tiles?.length) return null;
  if(!plateauIndex || plateauIndex.src!==tiles){
    const grid=new Set(), extra=[];
    for(const [cx,cz] of tiles){
      const fx=cx-.5, fz=cz-.5;
      if(Math.abs(fx-Math.round(fx))<1e-6 && Math.abs(fz-Math.round(fz))<1e-6) grid.add(Math.round(fx)+','+Math.round(fz)); else extra.push([cx,cz]);
    }
    plateauIndex={src:tiles,grid,extra};
  }
  // .51: the tiles overlap a hair (scaled 1.006), so seams count as ground.
  const at=(px,pz)=>plateauIndex.grid.has(Math.floor(px)+','+Math.floor(pz)) || plateauIndex.extra.some(([cx,cz])=>Math.abs(px-cx)<=.51 && Math.abs(pz-cz)<=.51);
  return [[0,0],[.15,0],[-.15,0],[0,.15],[0,-.15]].some(([ox,oz])=>at(x+ox,z+oz));
}
function hasGroundAt(x,z){
  if(state.boardCells) return [[0,0],[.15,0],[-.15,0],[0,.15],[0,-.15]].some(([ox,oz])=>state.boardCells.has(paintKey(x+ox,z+oz)));
  const fast=plateauGround(x,z); if(fast!==null) return fast;
  const key=Math.round(x*4)+','+Math.round(z*4);
  if(groundCache.has(key)) return groundCache.get(key);
  const top=state.terrainTopY??0, down=new BABYLON.Vector3(0,-1,0);
  const isGround=m=>GROUND_MESH.test(m.name) && m.isEnabled();
  // No terrain meshes at all (still loading / unusual build): never fall.
  const anyTerrain=!!state.scene?.meshes.some(m=>GROUND_MESH.test(m.name));
  // Tiles have 1.4cm seams between them; probe a small cross so a seam or a
  // tile corner never reads as a cliff.
  const ok=!anyTerrain || [[0,0],[.15,0],[-.15,0],[0,.15],[0,-.15]].some(([ox,oz])=>
    !!state.scene.pickWithRay(new BABYLON.Ray(new BABYLON.Vector3(x+ox,top+1,z+oz),down,1.25),isGround)?.hit);
  if(anyTerrain) groundCache.set(key,ok);
  return ok;
}
// Collision group of the invisible rectangular physics_ground. A falling character
// must not land on it where the real island has a bay cut out of it.
const GROUND_FILTER=2;
// Walked off the edge: hand the collider to Havok with the walking velocity
// plus a forward tumble, and let the rig follow it down into the sea.
function startFall(g,vel){
  if(g.falling || !g.collider?.physicsBody) return;
  const body=g.collider.physicsBody;
  delete g.turnMove;
  const held=state.held.get(g.id);
  if(held){ state.held.delete(g.id); endCarry(held,held.position.clone()); try{ held.physicsBody?.setLinearVelocity(vel); }catch{} }
  const yaw=BABYLON.Quaternion.RotationAxis(BABYLON.Axis.Y,yawForDir(g.dir));
  g.falling={t:0,yaw,splashed:false,mask:null};
  g.root.rotationQuaternion=yaw.clone();
  try{ g.falling.mask=body.shape.filterCollideMask; body.shape.filterCollideMask=(g.falling.mask & ~GROUND_FILTER)>>>0; }catch{}
  try{ body.setPrestepType?.(BABYLON.PhysicsPrestepType.TELEPORT); }catch{}
  body.setMotionType(BABYLON.PhysicsMotionType.DYNAMIC);
  state.scene.onAfterPhysicsObservable?.addOnce(()=>{ try{ body.setPrestepType?.(BABYLON.PhysicsPrestepType.DISABLED); }catch{} });
  try{
    body.setLinearVelocity(vel.add(new BABYLON.Vector3(0,.6,0)));
    // Pitch forward (head toward the walking direction): spinning about
    // Y x dir carries +Y toward dir.
    const axis=BABYLON.Vector3.Cross(BABYLON.Axis.Y,g.dir).normalize();
    body.setAngularVelocity(axis.scale(3.2+Math.random()*1.5));
  }catch{}
  g.anim='panic'; playRig(g,'panic',true);
  say(g,'wait where did the floor go');
}
function updateFall(g,dt){
  const f=g.falling, c=g.collider; f.t+=dt;
  const q=c.rotationQuaternion || BABYLON.Quaternion.FromEulerAngles(c.rotation.x,c.rotation.y,c.rotation.z);
  // The collider centre sits .74 above the feet; keep that offset in its frame.
  const off=new BABYLON.Vector3(0,-.74,0).applyRotationQuaternion(q);
  g.root.position.copyFrom(c.position.add(off));
  g.root.rotationQuaternion=q.multiply(f.yaw);
  const sea=state.seaLevel ?? ((state.terrainTopY??0)-1.85);
  if(!f.splashed && c.position.y<sea+.3){
    f.splashed=true; f.splashAt=f.t;
    try{ emitBadge(g,'splash'); }catch{}
    makeSplash(new BABYLON.Vector3(c.position.x,sea+.03,c.position.z));
    // Water drag: slow right down and sink.
    try{ c.physicsBody.setLinearDamping(4); c.physicsBody.setAngularDamping(3); }catch{}
  }
  if(f.splashed && f.t-f.splashAt>1.6) endFall(g);
}
// Expanding foam ring where a falling character hits the water.
function makeSplash(pos){
  const ring=BABYLON.MeshBuilder.CreateTorus('splash_ring',{diameter:.5,thickness:.06,tessellation:28},state.scene);
  ring.position.copyFrom(pos); ring.isPickable=false;
  const m=new BABYLON.StandardMaterial('splash_mat',state.scene);
  m.diffuseColor=new BABYLON.Color3(.85,.95,1); m.emissiveColor=new BABYLON.Color3(.45,.6,.7); m.disableLighting=false;
  ring.material=m; let t=0;
  const obs=state.scene.onBeforeRenderObservable.add(()=>{
    t+=state.engine.getDeltaTime()/1000;
    const s=1+t*5; ring.scaling.set(s,1,s); m.alpha=Math.max(0,1-t/1.1);
    if(t>1.1){ state.scene.onBeforeRenderObservable.remove(obs); ring.dispose(); m.dispose(); }
  });
}
// Washed back ashore at the last tile it stood on.
function endFall(g){
  const body=g.collider.physicsBody, mask=g.falling.mask;
  try{ body.setLinearDamping(0); body.setAngularDamping(.1); if(mask!=null) body.shape.filterCollideMask=mask; }catch{}
  zeroBody(body);
  g.collider.rotationQuaternion=BABYLON.Quaternion.Identity();
  delete g.falling;
  g.root.rotationQuaternion=null;
  setCharacterLogicalPosition(g,g.lastSafePos||new BABYLON.Vector3(0,0,0));
  // The ACTION prestep reads the collider's cached world matrix, which still
  // says "under the sea"; teleport the body for one step, then resume ACTION.
  g.collider.computeWorldMatrix(true);
  try{ body.setPrestepType(BABYLON.PhysicsPrestepType.TELEPORT); }catch{}
  state.scene.onAfterPhysicsObservable?.addOnce(()=>{ try{ body.setPrestepType(BABYLON.PhysicsPrestepType.ACTION); }catch{} });
  g.anim='idle'; playRig(g,'idle',true);
  say(g,'blub. I have returned from the sea');
  saveWorldState();
}
// Fixed HD scenery that objects must not be placed into (scenario layout).
const SCENERY_MESH=/^(hd_(house|tree|boulders|posts|rails|planks|decor_crate|edge_stones)|fire_|campfire)/;
// Blocked integer cells, built once by marking every cell that a scenery
// triangle covers between ankle and head height (canopies and the ground
// itself don't block). Raycasting per cell froze the tab.
let sceneryCells=null;
function buildSceneryCells(){
  const cells=new Set(), top=state.terrainTopY??0, lo=top+.06, hi=top+1.2, v=new BABYLON.Vector3();
  for(const m of state.scene.meshes){
    if(!SCENERY_MESH.test(m.name) || !m.isEnabled() || m.isVisible===false || !m.getVerticesData) continue;
    const pos=m.getVerticesData(BABYLON.VertexBuffer.PositionKind); if(!pos) continue;
    const idx=m.getIndices(); const wm=m.computeWorldMatrix(true);
    const n=pos.length/3, wx=new Float32Array(n), wy=new Float32Array(n), wz=new Float32Array(n);
    for(let i=0;i<n;i++){ BABYLON.Vector3.TransformCoordinatesFromFloatsToRef(pos[i*3],pos[i*3+1],pos[i*3+2],wm,v); wx[i]=v.x; wy[i]=v.y; wz[i]=v.z; }
    const tri=(a,b,c)=>{
      const y0=Math.min(wy[a],wy[b],wy[c]), y1=Math.max(wy[a],wy[b],wy[c]);
      if(y1<lo || y0>hi) return;
      const x0=Math.round(Math.min(wx[a],wx[b],wx[c])), x1=Math.round(Math.max(wx[a],wx[b],wx[c]));
      const z0=Math.round(Math.min(wz[a],wz[b],wz[c])), z1=Math.round(Math.max(wz[a],wz[b],wz[c]));
      if(x1-x0>6 || z1-z0>6) return;   // a stray huge triangle is not an obstacle footprint
      for(let x=x0;x<=x1;x++) for(let z=z0;z<=z1;z++) cells.add(x+','+z);
    };
    if(idx) for(let i=0;i<idx.length;i+=3) tri(idx[i],idx[i+1],idx[i+2]); else for(let i=0;i+2<n;i+=3) tri(i,i+1,i+2);
  }
  return cells;
}
function sceneryAt(x,z){
  if(!sceneryCells) sceneryCells=buildSceneryCells();
  return sceneryCells.has(Math.round(x)+','+Math.round(z));
}
// Named scenery a scenario map can refer to ("near house").
function sceneryAnchors(){
  const out={};
  const centre=re=>{ const ms=state.scene.meshes.filter(m=>re.test(m.name)&&m.isEnabled()); if(!ms.length) return null; let x=0,z=0; for(const m of ms){ const c=m.getBoundingInfo().boundingBox.centerWorld; x+=c.x; z+=c.z; } return {x:x/ms.length,z:z/ms.length}; };
  const house=centre(/^hd_house$/); if(house) out.house=house;
  const fire=centre(/^fire_(log|stone)/); if(fire) out.campfire=fire;
  return out;
}
const FACING_DIRS={n:[0,0,-1],s:[0,0,1],e:[-1,0,0],w:[1,0,0]};
// model: a person from AVATAR_MODELS or FIGURES (e.g. 'woman', 'skeleton'); default the critter.
async function spawnAgent(id,x,z,facing='s',model){
  const pos=new BABYLON.Vector3(x,.06,z);
  let g;
  if(isPersonModel(model)){
    try{ g=await createPerson(id,new BABYLON.Vector3(x,state.terrainTopY??0,z),model,model); }
    catch(e){ console.warn('person model failed; using a critter',e); }
  }
  if(!g) try{ g=await createGeneratedCritter(state.scene,id,pos); }
  catch(e){ console.warn('generated character failed; using procedural fallback',e); g=createCritter(state.scene,id,pos,{hat:state.materials.hat1,belly:state.materials.belly1,dark:state.materials.foot},'goblin'); }
  setCharacterLogicalPosition(g,pos);
  const d=FACING_DIRS[String(facing||'s')[0].toLowerCase()]||FACING_DIRS.s;
  setCharacterFacing(g,new BABYLON.Vector3(...d));
  refreshAgentSelect();
  return g;
}
function makeObject(type,x,z,opts={}){
  const sc=state.scene;
  if(type==='barrel') return makeBarrel(sc,x,z);
  if(type==='mushroom') return makeMushroom(sc,x,z);
  if(type==='lamp') return makeLamp(sc,x,z);
  if(type==='note') return makeNote(sc,x,z,opts.html || (opts.text ? '<p>'+String(opts.text).replace(/[<&>]/g,c=>({'<':'&lt;','&':'&amp;','>':'&gt;'}[c]))+'</p>' : '<p>...</p>'));
  if(type==='wall') return makeBlock(sc,x,z,!!opts.cracked);
  if(type==='door') return makeDoor(sc,x,z,opts);
  if(window.tablefolkScenery?.types.includes(type)) return window.tablefolkScenery.make(type,x,z,opts);
  if(ITEM_CATALOG[type]) return keepLoot(makeCatalogItem(sc,type,x,z,opts),opts);
  return makeCrate(sc,x,z);
}
// What a chest holds, a coin pile's gold, an item's name (play.js): kept in
// the object's opts, which saves and restores with it.
function keepLoot(m,opts){
  const mm=m&&meta(m); if(!mm) return m;
  const o={}; for(const k of ['gold','items','name','opened']) if(opts?.[k]!=null) o[k]=opts[k];
  if(Object.keys(o).length) mm.opts={...(mm.opts||{}),...o};
  return m;
}
function getObjects(){
  return state.props.concat(state.blocks).filter(m=>m && !m.isDisposed?.()).map(m=>{
    const mm=meta(m)||{}, p=m.getAbsolutePosition?.()||m.position;
    const ry=m.rotationQuaternion ? m.rotationQuaternion.toEulerAngles().y : (m.rotation?.y||0);
    return {mesh:m,type:mm.type||m.name,x:p.x,z:p.z,ry:Math.abs(ry)>.01?+ry.toFixed(3):0,state:mm.state||'intact',noteHtml:mm.noteHtml,noteText:mm.noteText,rim:!!mm.rim,...(mm.opts&&Object.keys(mm.opts).length?{opts:mm.opts}:{})};
  }).filter(o=>!['tile','hole'].includes(o.type));
}
function syncCharacter(g){
  // v14.1: authoritative character position is logical/grid position, not Havok momentum.
  // Otherwise the invisible physics body can snap the visual rig back to its old position after a turn.
  if(!g.collider || g.falling) return;
  if(!g.logicalPos) g.logicalPos=new BABYLON.Vector3(g.root.position.x,0,g.root.position.z);
  if(g.turnMove) return;
  setCharacterLogicalPosition(g,g.logicalPos);
}
function makeTile(scene,x,z,material='grass'){ const t=BABYLON.MeshBuilder.CreateBox('tile_'+material,{width:1,height:.06,depth:1},scene); t.position.set(x,-.065,z); t.material=state.materials[material+'Base']||state.materials[material]; t.receiveShadows=true; t.isPickable=true; tag(t,'tile',{interactive:false,tileMaterial:material}); state.tiles.push(t); return t; }
// Walls. 'tabletop' (default): tall thin stone sections like plastic D&D
// scenery, joined to neighbouring wall cells (straight runs, corners, T and
// cross junctions), rebuilt as a few merged meshes whenever walls change.
// 'block': the original short cube per cell. The game logic is the same for
// both: one static wall object per grid cell.
const WALL_H=1.1;
// Scenarios can scale wall height ("wallHeight": 2 = twice as tall); 1 = the
// tuned sandbox look. Builders below derive every course from wallH().
const wallH=()=>WALL_H*(state.wallHeightScale||1);
function makeBlock(scene,x,z,cracked=false){
  const top=state.terrainTopY??0, tabletop=(state.wallStyle||'tabletop')!=='block', s=state.wallHeightScale||1;   // tabletop or modern
  const b=tabletop ? BABYLON.MeshBuilder.CreateBox('wall',{width:.96,height:wallH(),depth:.96},scene)
                   : BABYLON.MeshBuilder.CreateBox('wall',{width:.96,height:.62*s,depth:.96},scene);
  b.position.set(x,top+(tabletop?wallH()/2:.31*s),z);
  addToScene(b,cracked?state.materials.cracked:state.materials.stone,{motion:'static',shape:'BOX',mass:0});
  tag(b,'wall',{health:cracked?1:3,material:'stone',state:cracked?'cracked':'intact'});
  if(tabletop){ b.isVisible=false; meta(b).tabletop=true; scheduleWallRebuild(); }
  state.blocks.push(b); return b;
}
// A door fills one wall cell: a person-height wooden leaf (PERSON_H is 1.3)
// with the wall itself carried over the top as a stone header, so it sits in
// a wall run like a real doorway. The leaf swings open for anyone nearby, so
// door cells stay passable. Geometry is real relief (planks, ledges, brace,
// strap hinges) in the same glossy plastic finish as the walls.
const DOOR_H=1.45;
const doorHeight=()=>Math.max(.55,Math.min(DOOR_H,wallH()-.3));
function makeDoor(scene,x,z,opts={}){
  const top=state.terrainTopY??0, raised=(state.wallStyle||'tabletop')!=='block';
  const b=BABYLON.MeshBuilder.CreateBox('door',{width:.96,height:raised?wallH():.62*(state.wallHeightScale||1),depth:.96},scene);
  b.position.set(x,top+(raised?wallH()/2:.31*(state.wallHeightScale||1)),z);
  b.isVisible=false; b.isPickable=true;
  tag(b,'door',{health:4,material:'wood',flammable:true});
  meta(b).opts={...(opts.ry?{ry:+opts.ry}:{})};
  if(raised){ meta(b).tabletop=true; scheduleWallRebuild(); }
  else { // legacy block walls have no merged visuals: build a static leaf here
    const g=buildDoorLeaf(scene,x,z,!(+opts.ry||0),top,Math.min(doorHeight(),.9*(state.wallHeightScale||1)));
    g.standalone=true;
    meta(b).cleanup=()=>{ try{ g.pivot.dispose(false,true); }catch{} };
    state.doorLeaves=state.doorLeaves||[]; state.doorLeaves.push(g); ensureDoorAnimator();
  }
  state.blocks.push(b); return b;
}
let wallRebuildQueued=false;
function scheduleWallRebuild(){ if(wallRebuildQueued) return; wallRebuildQueued=true; queueMicrotask(()=>{ wallRebuildQueued=false; try{ rebuildWallVisuals(); }catch(e){ console.warn('wall rebuild failed',e); } }); }
// Normal map for one box face (UV2 0..1 per face): flat centre, edges
// rounding away over the outer 16%, so each stone has the soft rounded edges
// of a moulded plastic piece. dirSign/greenSign flip the convention if needed.
function bevelNormalTexture(sc){
  const N=128, cv=document.createElement('canvas'); cv.width=cv.height=N;
  const g=cv.getContext('2d'), img=g.createImageData(N,N), B=.16;
  const ramp=t=>{ if(t>=B) return 0; const k=1-t/B; return k*k; };   // 0 inside, ->1 at the edge
  for(let y=0;y<N;y++) for(let x=0;x<N;x++){
    const u=(x+.5)/N, v=(y+.5)/N;
    // tilt toward the nearer edge: -x near u=0, +x near u=1 (convex bevel)
    // (y sign checked against the scene: lit-from-above top edges must brighten)
    const nx=ramp(1-u)-ramp(u), ny=ramp(1-v)-ramp(v);
    const nz=Math.sqrt(Math.max(.05,1-nx*nx*.7-ny*ny*.7)), l=Math.hypot(nx*.85,ny*.85,nz);
    const i=(y*N+x)*4;
    img.data[i]=(nx*.85/l*.5+.5)*255; img.data[i+1]=(ny*.85/l*.5+.5)*255; img.data[i+2]=(nz/l*.5+.5)*255; img.data[i+3]=255;
  }
  g.putImageData(img,0,0);
  const t=new BABYLON.DynamicTexture('tt_bevel_normal',cv,sc,true); t.update(); t.coordinatesIndex=1;
  t.wrapU=t.wrapV=BABYLON.Texture.CLAMP_ADDRESSMODE;
  return t;
}
function wallMaterials(){
  if(state.wallMats) return state.wallMats;
  const sc=state.scene;
  const tex=f=>{ const t=new BABYLON.Texture(ASSET+f,sc,true,false,BABYLON.Texture.TRILINEAR_SAMPLINGMODE); t.wrapU=t.wrapV=BABYLON.Texture.WRAP_ADDRESSMODE; t.anisotropicFilteringLevel=8; return t; };
  const mk=(name,file,color,rough=.62)=>{ const m=new BABYLON.PBRMaterial(name,sc); if(file) m.albedoTexture=tex(file); m.albedoColor=color; m.metallic=0; m.roughness=rough; m.environmentIntensity=.6; m.specularIntensity=.6; m.maxSimultaneousLights=8; return m; };
  // Stones take their colour from vertex colours (white albedo) with a subtle
  // stone grain texture; the relief is real geometry now, not a normal map.
  // Same glossy "plastic miniature" finish as the grass tiles (roughness .24,
  // environment .85, specular .5) plus the shared clay detail; the mortar
  // core stays matte so the stones pop.
  const plastic=m=>{ m.roughness=.3; m.environmentIntensity=.85; m.specularIntensity=.5; plasticFinish(m,{coat:.7,coatRough:.08}); return applyClayLook(m,sc,{detail:.06,detailScale:4}); };
  const stones=plastic(mk('tt_wall_stones',null,new BABYLON.Color3(1,1,1),.26));
  // rounded-edge stones: the bevel normal map on UV2 (detail map stays on UV1)
  stones.bumpTexture=bevelNormalTexture(sc); stones.bumpTexture.level=1;
  // Doors: glossy moulded-plastic wood (never flat/matte) so the plank relief
  // catches the key light like the stones do; near-black glossy ironwork.
  const doorWood=plastic(mk('tt_door_wood',null,new BABYLON.Color3(1,1,1),.3));
  doorWood.bumpTexture=stones.bumpTexture; doorWood.roughness=.34;
  const doorIron=plastic(mk('tt_door_iron',null,new BABYLON.Color3(1,1,1),.38));
  doorIron.roughness=.4; doorIron.metallic=.35; doorIron.environmentIntensity=1;
  state.wallMats={ stones, core:mk('tt_wall_core',null,new BABYLON.Color3(1,1,1),.9),
    trim:plastic(mk('tt_wall_trim',null,new BABYLON.Color3(1,1,1),.26)), cap:plastic(mk('tt_wall_cap',null,new BABYLON.Color3(1,1,1),.26)), doorWood, doorIron };
  return state.wallMats;
}
// Box geometry appended straight into one vertex buffer (thousands of
// CreateBox calls + MergeMeshes would be slow). Per-vertex colour lets every
// stone have its own shade; UVs are scaled by size so the grain doesn't stretch.
function boxBatch(){
  const P=[],N=[],U=[],U2=[],C=[],I=[];
  const faces=[[[1,0,0],[0,0,-1],[0,1,0]],[[-1,0,0],[0,0,1],[0,1,0]],[[0,1,0],[1,0,0],[0,0,-1]],[[0,-1,0],[1,0,0],[0,0,1]],[[0,0,1],[1,0,0],[0,1,0]],[[0,0,-1],[-1,0,0],[0,1,0]]];
  return {
    add(cx,cy,cz,sx,sy,sz,col){
      const h=[sx/2,sy/2,sz/2], size=[sx,sy,sz];
      for(const [n,u,v] of faces){
        const base=P.length/3;
        const su=Math.abs(u[0])*size[0]+Math.abs(u[1])*size[1]+Math.abs(u[2])*size[2];
        const sv=Math.abs(v[0])*size[0]+Math.abs(v[1])*size[1]+Math.abs(v[2])*size[2];
        for(const [a,c] of [[-1,-1],[1,-1],[1,1],[-1,1]]){
          P.push(cx+(n[0]+u[0]*a+v[0]*c)*h[0], cy+(n[1]+u[1]*a+v[1]*c)*h[1], cz+(n[2]+u[2]*a+v[2]*c)*h[2]);
          N.push(n[0],n[1],n[2]); U.push((a+1)/2*su*1.6,(c+1)/2*sv*1.6); U2.push((a+1)/2,(c+1)/2); C.push(col[0],col[1],col[2],1);
        }
        I.push(base,base+2,base+1,base,base+3,base+2);
      }
    },
    // Rotated box (Euler radians, applied X then Y then Z): door braces etc.
    // Axis-aligned add() above stays the fast path for the thousands of stones.
    addR(cx,cy,cz,sx,sy,sz,col,rx=0,ry=0,rz=0){
      const rot=v=>{
        let [x,y,z]=v;
        if(rx){ const c=Math.cos(rx), s=Math.sin(rx); [y,z]=[y*c-z*s, y*s+z*c]; }
        if(ry){ const c=Math.cos(ry), s=Math.sin(ry); [x,z]=[x*c+z*s, -x*s+z*c]; }
        if(rz){ const c=Math.cos(rz), s=Math.sin(rz); [x,y]=[x*c-y*s, x*s+y*c]; }
        return [x,y,z];
      };
      const size=[sx,sy,sz];
      for(const [n,u,v] of faces){
        const base=P.length/3, rn=rot(n), ru=rot(u), rv=rot(v);
        const hn=(Math.abs(n[0])*size[0]+Math.abs(n[1])*size[1]+Math.abs(n[2])*size[2])/2;
        const hu=(Math.abs(u[0])*size[0]+Math.abs(u[1])*size[1]+Math.abs(u[2])*size[2])/2;
        const hv=(Math.abs(v[0])*size[0]+Math.abs(v[1])*size[1]+Math.abs(v[2])*size[2])/2;
        for(const [a,c] of [[-1,-1],[1,-1],[1,1],[-1,1]]){
          P.push(cx+rn[0]*hn+ru[0]*a*hu+rv[0]*c*hv, cy+rn[1]*hn+ru[1]*a*hu+rv[1]*c*hv, cz+rn[2]*hn+ru[2]*a*hu+rv[2]*c*hv);
          N.push(rn[0],rn[1],rn[2]); U.push((a+1)/2*hu*3.2,(c+1)/2*hv*3.2); U2.push((a+1)/2,(c+1)/2); C.push(col[0],col[1],col[2],1);
        }
        I.push(base,base+2,base+1,base,base+3,base+2);
      }
    },
    mesh(name,sc){
      if(!P.length) return null;
      const m=new BABYLON.Mesh(name,sc), vd=new BABYLON.VertexData();
      vd.positions=P; vd.normals=N; vd.uvs=U; vd.uvs2=U2; vd.colors=C; vd.indices=I; vd.applyToMesh(m);
      return m;
    }
  };
}
// Tabletop wall visuals: a dark mortar core with stone blocks that stand out
// on both faces (real relief, visible in silhouette and shadow), staggered
// rows aligned to world coordinates so neighbouring walls continue the
// pattern, a block column where walls meet at an angle, and a base and cap.
function rebuildWallVisuals(){
  const sc=state.scene; if(!sc) return;
  for(const m of state.wallVisuals||[]) try{ m.dispose(); }catch{}
  state.wallVisuals=[];
  const walls=state.blocks.filter(b=>b && !b.isDisposed?.() && (meta(b)?.type==='wall'||meta(b)?.type==='door') && meta(b)?.tabletop);
  state.doorLeaves=(state.doorLeaves||[]).filter(l=>l.standalone);
  if(!walls.length) return;
  const mats=wallMaterials(), top=state.terrainTopY??0;
  const cell=new Map(walls.map(w=>[Math.round(w.position.x)+','+Math.round(w.position.z),w]));
  if(state.wallStyle==='modern') return buildModernWalls(cell,top);
  if(state.wallStyle==='stone') return buildFieldstoneWalls(cell,top);
  const stones=boxBatch(), core=boxBatch(), trim=boxBatch(), cap=boxBatch();
  const hash=(a,b,c)=>{ let h=Math.imul(a*73856093^b*19349663^c*83492791,2654435761); h^=h>>>15; return ((h>>>0)%10000)/10000; };
  const T=.18, H=wallH()-.08, Y0=top+.07, ROWS=Math.max(1,Math.round(5*(state.wallHeightScale||1))), RH=H/ROWS, BL=.3, GAP=.022;
  const shade=(st,r)=>{ // stone colour by wall state
    if(st==='burned') { const v=.18+r*.08; return [v+.02,v,v-.01]; }
    // Mid grey, not near-white: a glossy highlight needs a darker base to read
    // as plastic (near-white stones just looked chalky).
    const v=.32+r*.13, warm=(r-.5)*.04; return st==='cracked' ? [v*.9+warm,v*.88,v*.84-warm] : [v+warm,v,v-.02-warm];
  };
  for(const [k,w] of cell){
    const [x,z]=k.split(',').map(Number), st=meta(w).state;
    if(meta(w).type==='door'){
      // Only the header: the wall comes together again over the doorway.
      const alongX=doorAxisOf(cell,x,z), DH=doorHeight(), yA=top+DH, yB=Y0+H, a0=(alongX?x:z)-.5, a1=(alongX?x:z)+.5, perp=alongX?z:x;
      const putD=(b,ac,y,len,hgt,thick,col)=>{ alongX ? b.add(ac,y,perp,len,hgt,thick,col) : b.add(perp,y,ac,thick,hgt,len,col); };
      putD(core,(a0+a1)/2,(yA+yB)/2,a1-a0,yB-yA,T-.04,[.16,.15,.14]);
      for(let r=0;r<ROWS;r++){
        if(Y0+(r+1)*RH<=yA) continue;
        const off=(r%2)*BL/2+hash(perp*7,r,3)*.06;
        for(let kb=Math.floor((a0-off)/BL)-1; kb*BL+off<a1; kb++){
          const b0=kb*BL+off, b1=b0+BL; if(b1<=a0) continue;
          const l=b0>=a0?b0+GAP/2:a0, rgt=b1<=a1?b1-GAP/2:a1; if(rgt-l<.03) continue;
          const rnd=hash(kb,r,perp*13+(alongX?1:2));
          putD(stones,(l+rgt)/2,Y0+r*RH+RH/2,rgt-l,RH-GAP,T+.035+(hash(kb,r,perp+9)-.5)*.02,shade(st,rnd));
        }
      }
      putD(cap,(a0+a1)/2,yB+.025,a1-a0,.05,T+.08,[.40,.38,.36]);
      continue;
    }
    const dirs=[[1,0],[-1,0],[0,1],[0,-1]].filter(([dx,dz])=>cell.has((x+dx)+','+(z+dz)));
    let arms=dirs.slice();
    if(!arms.length) arms=[[1,0],[-1,0]];
    else if(arms.length===1) arms.push([-arms[0][0],-arms[0][1]]);
    const straight=arms.length===2 && arms[0][0]===-arms[1][0] && arms[0][1]===-arms[1][1];
    const postHalf=straight?0:(T+.05)/2;
    for(const [dx,dz] of arms){
      const alongX=dx!==0, sign=dx||dz;
      // arm spans [a0,a1] along its axis, from the post (or centre) to the cell edge
      const c0=alongX?x:z, perp=alongX?z:x;
      const a0=Math.min(c0+sign*postHalf,c0+sign*.5), a1=Math.max(c0+sign*postHalf,c0+sign*.5);
      const put=(b,ac,y,len,hgt,thick,col)=>{ alongX ? b.add(ac,y,perp,len,hgt,thick,col) : b.add(perp,y,ac,thick,hgt,len,col); };
      put(core,(a0+a1)/2,Y0+H/2,a1-a0,H,T-.04,[.16,.15,.14]);
      for(let r=0;r<ROWS;r++){
        const off=(r%2)*BL/2+hash(perp*7,r,3)*.06;
        for(let kb=Math.floor((a0-off)/BL)-1; kb*BL+off<a1; kb++){
          const b0=kb*BL+off, b1=b0+BL;
          if(b1<=a0) continue;
          const l=b0>=a0?b0+GAP/2:a0, rgt=b1<=a1?b1-GAP/2:a1;
          if(rgt-l<.03) continue;
          const rnd=hash(kb,r,perp*13+(alongX?1:2));
          if(st==='cracked' && rnd<.18) continue;           // missing stones
          const thick=T+.035+(hash(kb,r,perp+9)-.5)*.02;
          const hgt=RH-GAP-(hash(kb+3,r,perp)*.012);
          put(stones,(l+rgt)/2,Y0+r*RH+RH/2,rgt-l,hgt,thick,shade(st,rnd));
        }
      }
      put(trim,(a0+a1)/2,top+.035,a1-a0,.07,T+.14,[.30,.29,.28]);
      put(cap,(a0+a1)/2,Y0+H+.025,a1-a0,.05,T+.08,[.40,.38,.36]);
    }
    if(postHalf){
      // a stacked block column where the wall turns or branches
      core.add(x,Y0+H/2,z,T-.02,H,T-.02,[.16,.15,.14]);
      for(let r=0;r<ROWS;r++){
        const rnd=hash(x*5,r,z*11), s=T+.045+(rnd-.5)*.015;
        if(!(st==='cracked' && rnd<.18)) stones.add(x,Y0+r*RH+RH/2,z,s,RH-GAP,s,shade(st,rnd));
      }
      trim.add(x,top+.035,z,T+.16,.07,T+.16,[.30,.29,.28]);
      cap.add(x,Y0+H+.025,z,T+.1,.05,T+.1,[.40,.38,.36]);
    }
  }
  for(const [name,batch,mat] of [['stones',stones,mats.stones],['core',core,mats.core],['trim',trim,mats.trim],['cap',cap,mats.cap]]){
    const m=batch.mesh('tt_walls_'+name,sc); if(!m) continue;
    m.material=mat; m.isPickable=false; m.receiveShadows=true; addShadow(m); state.wallVisuals.push(m);
  }
  buildDoors(cell,top);
}
// Natural stone ("walls": "stone"): a dry-stone wall of flat, slightly
// uneven slabs in mixed lengths and shades, packed tight over a mortar core,
// laid out like the tabletop walls (arms to each neighbour, a post at
// corners). One slab geometry drawn per stone (thin instances: size, tilt and
// colour per copy).
function fieldstoneRock(sc){
  if(state.fieldRock && !state.fieldRock.isDisposed()) return state.fieldRock;
  const m=BABYLON.MeshBuilder.CreateIcoSphere('fieldstone_src',{radius:.5,subdivisions:3,flat:false},sc);
  const pos=m.getVerticesData(BABYLON.VertexBuffer.PositionKind);
  // Flat slabs: a superellipsoid (the sphere pushed out to a box with softly
  // rounded edges) so faces pack tight and little mortar shows, with gently
  // uneven faces.
  for(let i=0;i<pos.length;i+=3){
    const x=pos[i],y=pos[i+1],z=pos[i+2], P=5, r=Math.pow(Math.abs(x)**P+Math.abs(y)**P+Math.abs(z)**P,1/P)||1;
    const n=Math.sin(x*7.3+z*5.1+1.7)*Math.sin(z*6.1-y*4.4)*.6+Math.sin(x*13.7-z*11.3+y*9.1)*.3, k=1+n*.035;
    pos[i]=x/r*.5*k; pos[i+1]=y/r*.5*(1+n*.025); pos[i+2]=z/r*.5*k;
  }
  m.updateVerticesData(BABYLON.VertexBuffer.PositionKind,pos);
  const nrm=[]; BABYLON.VertexData.ComputeNormals(pos,m.getIndices(),nrm); m.updateVerticesData(BABYLON.VertexBuffer.NormalKind,nrm);
  m.setEnabled(false);
  const mat=new BABYLON.PBRMaterial('fieldstone_mat',sc);
  mat.albedoColor=new BABYLON.Color3(1,1,1); mat.metallic=0; mat.roughness=.64; mat.environmentIntensity=.7; mat.specularIntensity=.4; mat.maxSimultaneousLights=8;
  plasticFinish(mat,{coat:.16,coatRough:.3}); mat.environmentIntensity=.7; applyClayLook(mat,sc,{detail:.3,detailScale:5});
  // Rock grain: pitted, granular relief.
  const HD=window.TablefolkHD;
  if(HD) try{
    // Seamless multi-octave value noise plus fine speckle: no direction, no
    // repeating bands.
    const N=256, cv=document.createElement('canvas'); cv.width=cv.height=N; const g=cv.getContext('2d'), img=g.createImageData(N,N);
    const octave=cells=>{ const r=new Float32Array(cells*cells).map(()=>Math.random()); return (x,y)=>{
      const fx=x/N*cells, fy=y/N*cells, x0=Math.floor(fx), y0=Math.floor(fy), tx=fx-x0, ty=fy-y0, sx=tx*tx*(3-2*tx), sy=ty*ty*(3-2*ty);
      const v=(a,b)=>r[((b%cells)+cells)%cells*cells+((a%cells)+cells)%cells];
      return (v(x0,y0)*(1-sx)+v(x0+1,y0)*sx)*(1-sy)+(v(x0,y0+1)*(1-sx)+v(x0+1,y0+1)*sx)*sy; }; };
    const oct=[[octave(4),.35],[octave(9),.3],[octave(23),.22],[octave(61),.13]];
    for(let i=0;i<N*N;i++){ const x=i%N, y=(i/N)|0; let v=0; for(const [f,w] of oct) v+=f(x,y)*w;
      v=128+(v-.5)*150+(Math.random()-.5)*28+(Math.random()<.015?-60:0); img.data[i*4]=img.data[i*4+1]=img.data[i*4+2]=v; img.data[i*4+3]=255; }
    g.putImageData(img,0,0);
    mat.bumpTexture=HD.dyn(sc,'fieldstone_n',HD.normalFromCanvas(cv,3)); mat.bumpTexture.uScale=mat.bumpTexture.vScale=1.3;
  }catch(e){ console.warn('rock grain',e); }
  state.sharedAssetMats ||= new Set(); state.sharedAssetMats.add(mat);
  m.material=mat;
  return state.fieldRock=m;
}
function buildFieldstoneWalls(cell,top){
  const sc=state.scene, src=fieldstoneRock(sc), core=boxBatch(), mats=wallMaterials();
  const hash=(a,b,c)=>{ let h=Math.imul(a*73856093^b*19349663^c*83492791,2654435761); h^=h>>>15; return ((h>>>0)%10000)/10000; };
  const T=.22, H=wallH()-.04, ROWS=Math.max(1,Math.round(6*(state.wallHeightScale||1))), RH=H/ROWS, rocks=[];
  const shade=(st,r,r2)=>{
    if(st==='burned'){ const v=.13+r*.07; return [v+.02,v,v-.01]; }
    const v=.30+r*.2, warm=(r2-.5)*.12; return [v+warm*.6,v+warm*.2,v-warm*.3];
  };
  const rock=(x,y,z,sx,sy,sz,col,seed)=>rocks.push({x,y,z,sx,sy,sz,col,ry:(hash(seed,3,7)-.5)*.12,rz:(hash(seed,5,1)-.5)*.06});
  for(const [k,w] of cell){
    const [x,z]=k.split(',').map(Number), st=meta(w).state;
    if(meta(w).type==='door'){
      // Header only: fieldstone courses carried over the doorway.
      const alongX=doorAxisOf(cell,x,z), DH=doorHeight(), yA=top+DH, a0=(alongX?x:z)-.5, a1=(alongX?x:z)+.5, perp=alongX?z:x;
      const atD=(a,y,len,hgt,thick,col,seed)=>alongX ? rock(a,y,perp,len,hgt,thick,col,seed) : rock(perp,y,a,thick,hgt,len,col,seed);
      core.add(alongX?(a0+a1)/2:perp,(yA+top+H)/2,alongX?perp:(a0+a1)/2,alongX?a1-a0:T-.08,top+H-yA,alongX?T-.08:a1-a0,[.12,.11,.10]);
      for(let r=0;r<ROWS;r++){
        // the lowest course is cut off at the top of the frame's head beam
        const y0=Math.max(top+r*RH,yA+.075), y1=top+(r+1)*RH;
        if(y1-y0<.04) continue;
        let a=Math.floor(a0/.5)*.5 - hash(perp*3,r,11)*.2;
        while(a<a1){
          const seed=Math.round(a*100)*31+r*7+Math.round(perp*13), len=.28+hash(seed,r,1)*.26, mid=a+len/2;
          if(mid>a0 && mid<=a1) atD(mid,(y0+y1)/2+(hash(seed,4,4)-.5)*.015*(y1-y0)/RH,len*1.2,(y1-y0)*(1.14+hash(seed,2,4)*.14),T*(1.08+hash(seed,6,2)*.16),shade(st,hash(seed,8,8),hash(seed,1,9)),seed);
          a+=len;
        }
      }
      for(let a=a0;a<a1-.05;a+=.25){ const seed=Math.round(a*100)*17+Math.round(perp*13)+99; atD(Math.min(a+.125,a1-.02),top+H+.035,.29,.09,T*1.25,shade(st,hash(seed,8,3)*.6+.3,hash(seed,2,2)),seed); }
      continue;
    }
    let arms=[[1,0],[-1,0],[0,1],[0,-1]].filter(([dx,dz])=>cell.has((x+dx)+','+(z+dz)));
    if(!arms.length) arms=[[1,0],[-1,0]]; else if(arms.length===1) arms.push([-arms[0][0],-arms[0][1]]);
    const straight=arms.length===2 && arms[0][0]===-arms[1][0] && arms[0][1]===-arms[1][1];
    const postHalf=straight?0:T/2;
    for(const [dx,dz] of arms){
      const alongX=dx!==0, sign=dx||dz, c0=alongX?x:z, perp=alongX?z:x;
      const a0=Math.min(c0+sign*postHalf,c0+sign*.5), a1=Math.max(c0+sign*postHalf,c0+sign*.5);
      // An arm that ends without a neighbour (a doorway or the end of a run)
      // keeps its stones inside the cell: nothing overhangs into the gap.
      const far=c0+sign*.5, nbw=cell.get((x+dx)+','+(z+dz)), open=!nbw;
      // Next to a door, stones below the header stop at the cell edge, where
      // the door frame's post begins (above it the courses run on unbroken).
      const doorNb=nbw && meta(nbw).type==='door', headY=top+doorHeight()+.075;
      const at=(a,y,len,hgt,thick,col,seed)=>{
        if(open || (doorNb && y-hgt/2<headY)){ let s0=a-len/2, s1=a+len/2; if(sign>0) s1=Math.min(s1,far-.015); else s0=Math.max(s0,far+.015); if(s1-s0<.06) return; a=(s0+s1)/2; len=s1-s0; }
        return alongX ? rock(a,y,perp,len,hgt,thick,col,seed) : rock(perp,y,a,thick,hgt,len,col,seed);
      };
      // the core stops short of an open end, hidden behind the end stones
      const c0e=open&&sign<0?a0+.1:a0, c1e=open&&sign>0?a1-.1:a1;
      core.add(alongX?(c0e+c1e)/2:perp,top+H/2,alongX?perp:(c0e+c1e)/2,alongX?c1e-c0e:T-.06,H,alongX?T-.06:c1e-c0e,[.17,.16,.14]);
      for(let r=0;r<ROWS;r++){
        // Stones of mixed length, continuing across cells (world-aligned).
        let a=Math.floor(a0/.5)*.5 - hash(perp*3,r,11)*.2, i=0;
        while(a<a1){
          const seed=Math.round(a*100)*31+r*7+Math.round(perp*13), len=.28+hash(seed,r,1)*.26;
          const mid=a+len/2;
          if(mid>a0 && mid<=a1 && !(st==='cracked' && hash(seed,9,9)<.18)){
            const hgt=RH*(1.14+hash(seed,2,4)*.14), thick=T*(1.08+hash(seed,6,2)*.16);
            at(mid,top+r*RH+RH/2+(hash(seed,4,4)-.5)*.015,len*1.2,hgt,thick,shade(st,hash(seed,8,8),hash(seed,1,9)),seed);
          }
          a+=len; i++;
        }
      }
      // capstones: flatter, wider
      for(let a=a0;a<a1-.05;a+=.25){ const seed=Math.round(a*100)*17+Math.round(perp*13)+99; at(Math.min(a+.125,a1-.02),top+H+.035,.29,.09,T*1.25,shade(st,hash(seed,8,3)*.6+.3,hash(seed,2,2)),seed); }
    }
    // A wall that stops (one neighbour, e.g. at a doorway) ends in a column of
    // stones instead of the bare core.
    const nb=[[1,0],[-1,0],[0,1],[0,-1]].filter(([dx,dz])=>cell.has((x+dx)+','+(z+dz)));
    if(nb.length===1) for(let r=0;r<=ROWS;r++){
      const sz=T*1.3, ex=x-nb[0][0]*(.5-sz/2-.015), ez=z-nb[0][1]*(.5-sz/2-.015), seed=x*97+z*53+r*5;
      rock(ex,top+(r<ROWS?r*RH+RH/2:H+.04),ez,sz,r<ROWS?RH*1.15:.1,sz,shade(st,hash(seed,8,8),hash(seed,1,9)),seed);
    }
    if(postHalf) for(let r=0;r<=ROWS;r++){
      const seed=x*131+z*71+r, sz=T*1.25;
      rock(x,top+(r<ROWS?r*RH+RH/2:H+.04),z,sz,r<ROWS?RH*1.12:.1,sz,shade(st,hash(seed,8,8),hash(seed,1,9)),seed);
    }
  }
  const coreMesh=core.mesh('stone_walls_core',sc); if(coreMesh){ coreMesh.material=mats.core; coreMesh.isPickable=false; coreMesh.receiveShadows=true; state.wallVisuals.push(coreMesh); }
  if(!rocks.length){ buildDoors(cell,top); return; }
  const m=src.clone('stone_walls_rocks'); m.makeGeometryUnique(); m.setEnabled(true); m.isPickable=false; m.receiveShadows=true;
  const buf=new Float32Array(rocks.length*16), cols=new Float32Array(rocks.length*4), mx=new BABYLON.Matrix(), q=new BABYLON.Quaternion();
  rocks.forEach((r,i)=>{
    BABYLON.Quaternion.RotationYawPitchRollToRef(r.ry,0,r.rz,q);
    BABYLON.Matrix.ComposeToRef(new BABYLON.Vector3(r.sx,r.sy,r.sz),q,new BABYLON.Vector3(r.x,r.y,r.z),mx); mx.copyToArray(buf,i*16);
    cols.set([...r.col,1],i*4);
  });
  m.thinInstanceSetBuffer('matrix',buf,16,true); m.thinInstanceSetBuffer('color',cols,4,true);
  addShadow(m); state.wallVisuals.push(m);
  buildDoors(cell,top);
}
// Modern walls: smooth painted panels (warm white, satin) with a dark
// baseboard and a slim top trim, joined like the stone walls.
function modernWallMaterials(){
  if(state.wallMats?.modernPanel) return state.wallMats;
  const sc=state.scene, mats=wallMaterials();
  const mk=(name,rough,coat)=>{ const m=new BABYLON.PBRMaterial(name,sc); m.albedoColor=new BABYLON.Color3(1,1,1); m.metallic=0; m.roughness=rough; m.maxSimultaneousLights=8; return plasticFinish(m,{coat,coatRough:.18}); };
  mats.modernPanel=mk('mw_panel',.55,.25); mats.modernBase=mk('mw_base',.3,.6); mats.modernCap=mk('mw_cap',.3,.5);
  return mats;
}
function buildModernWalls(cell,top){
  const sc=state.scene, mats=modernWallMaterials();
  const panel=boxBatch(), base=boxBatch(), capB=boxBatch();
  const T=.16, H=wallH()-.02;
  const tone=st=>st==='burned'?[.2,.19,.18]:st==='cracked'?[.70,.67,.62]:[.86,.84,.80];
  for(const [k,w] of cell){
    const [x,z]=k.split(',').map(Number), col=tone(meta(w).state);
    if(meta(w).type==='door'){
      const alongX=doorAxisOf(cell,x,z), DH=doorHeight(), yA=top+DH;
      const putD=(b,y,hgt,thick,c)=>{ alongX ? b.add(x,y,z,1,hgt,thick,c) : b.add(x,y,z,thick,hgt,1,c); };
      putD(panel,(yA+top+H)/2,top+H-yA,T,col);
      putD(capB,top+H+.015,.03,T+.03,[.93,.92,.90]);
      continue;
    }
    let arms=[[1,0],[-1,0],[0,1],[0,-1]].filter(([dx,dz])=>cell.has((x+dx)+','+(z+dz)));
    if(!arms.length) arms=[[1,0],[-1,0]];
    else if(arms.length===1) arms.push([-arms[0][0],-arms[0][1]]);
    const straight=arms.length===2 && arms[0][0]===-arms[1][0] && arms[0][1]===-arms[1][1];
    for(const [dx,dz] of arms){
      // each arm runs from the cell centre to the cell edge
      const alongX=dx!==0, sign=dx||dz, c0=alongX?x:z, perp=alongX?z:x;
      const a0=Math.min(c0,c0+sign*.5), a1=Math.max(c0,c0+sign*.5);
      const put=(b,y,hgt,thick,c)=>{ const ac=(a0+a1)/2, len=a1-a0; alongX ? b.add(ac,y,perp,len,hgt,thick,c) : b.add(perp,y,ac,thick,hgt,len,c); };
      put(panel,top+H/2,H,T,col);
      put(base,top+.06,.12,T+.04,[.20,.20,.21]);
      put(capB,top+H+.015,.03,T+.03,[.93,.92,.90]);
    }
    // corners and junctions: a post fills the square where arms meet (a hair
    // thinner than the panels, so no coplanar faces flicker)
    if(!straight){
      panel.add(x,top+H/2,z,T-.004,H,T-.004,col);
      base.add(x,top+.06,z,T+.036,.12,T+.036,[.20,.20,.21]);
      capB.add(x,top+H+.015,z,T+.026,.03,T+.026,[.93,.92,.90]);
    }
  }
  for(const [name,batch,mat] of [['panel',panel,mats.modernPanel],['base',base,mats.modernBase],['cap',capB,mats.modernCap]]){
    const m=batch.mesh('mw_walls_'+name,sc); if(!m) continue;
    m.material=mat; m.isPickable=false; m.receiveShadows=true; addShadow(m); state.wallVisuals.push(m);
  }
  buildDoors(cell,top);
}
// Which way a door runs: along the wall it sits in (true = along x).
function doorAxisOf(cell,x,z){
  if(cell.has((x+1)+','+z)||cell.has((x-1)+','+z)) return true;
  if(cell.has(x+','+(z+1))||cell.has(x+','+(z-1))) return false;
  return true;
}
// One door leaf in local space: hinge at the origin, leaf extends +x, faces
// +/-z. All relief is real geometry in two batches (glossy plastic wood,
// glossy iron) so it catches highlights and casts shadows like the walls.
function buildDoorLeaf(sc,x,z,alongX,top,DH){
  const mats=wallMaterials(), W=.74, leafH=DH-.08, y0=.03;
  const hash=(a,b,c)=>{ let h=Math.imul(a*73856093^b*19349663^c*83492791,2654435761); h^=h>>>15; return ((h>>>0)%10000)/10000; };
  const seed=Math.round(x)*131+Math.round(z)*71;
  const wood=boxBatch(), iron=boxBatch();
  const brown=(m)=>[.33*m,.205*m,.105*m];
  wood.add(W/2,y0+leafH/2,0,W,leafH,.04,[.13,.09,.05]);            // dark core behind the plank gaps
  const pw=(W-.036)/4;
  for(let i=0;i<4;i++){
    const cx=pw/2+i*(pw+.012), h=leafH*(i===0||i===3?.94:1), th=.07+hash(seed,i,1)*.016, zo=(hash(seed,i,2)-.5)*.008, m=.88+hash(seed,i,3)*.3;
    wood.add(cx,y0+h/2,zo,pw,h,th,brown(m));                        // plank
    for(const gx of [-pw*.24,pw*.2]) for(const s of [1,-1])         // raised grain strips, both faces
      wood.add(cx+gx,y0+h*.4,zo+s*(th/2+.004),.016,h*.6,.008,brown(m*1.22));
    if(hash(seed,i,4)<.45) wood.add(cx+(hash(seed,i,5)-.5)*pw*.5,y0+h*(.25+hash(seed,i,6)*.5),zo,.04,.055,th+.012,brown(m*.55)); // knot
  }
  for(const fy of [.22,.74]) wood.add(W/2,DH*fy,0,W+.02,.12,.115,brown(.78));   // ledges, proud of the planks
  const bLen=Math.hypot(W-.16,DH*.5), bAng=Math.atan2(DH*.5,W-.16);
  wood.addR(W/2,DH*.48,.055,bLen,.1,.028,brown(.86),0,0,bAng);                 // diagonal brace
  for(const fy of [.22,.74]){
    iron.add(W*.37,DH*fy,0,W*.74,.058,.128,[.13,.13,.15]);                     // strap hinges
    for(let s2=0;s2<4;s2++) iron.add(.05+s2*W*.2,DH*fy,0,.034,.034,.14,[.24,.24,.27]); // studs
  }
  iron.add(W-.1,DH*.5,0,.075,.17,.125,[.14,.14,.16]);                          // handle backplate
  const pivot=new BABYLON.TransformNode('door_pivot',sc);
  const base=alongX?0:-Math.PI/2;
  pivot.position.set(alongX?x-W/2:x, top, alongX?z:z-W/2); pivot.rotation.y=base;
  for(const [batch,mat,name] of [[wood,mats.doorWood,'door_leaf_wood'],[iron,mats.doorIron,'door_leaf_iron']]){
    const m=batch.mesh(name,sc); if(!m) continue;
    m.material=mat; m.parent=pivot; m.receiveShadows=true; addShadow(m);
  }
  for(const s of [1,-1]){                                                       // ring handles
    const ring=BABYLON.MeshBuilder.CreateTorus('door_ring',{diameter:.125,thickness:.02,tessellation:20},sc);
    ring.material=mats.doorIron; ring.parent=pivot; ring.position.set(W-.1,DH*.44,s*.095); ring.rotation.x=Math.PI/2+(s>0?.3:-.3)*s; addShadow(ring);
  }
  return {pivot,x,z,alongX,base,angle:0};
}
// Frames (shared batch) plus a swinging leaf per door cell. Called by every
// wall-style builder after it has drawn the stone header over each doorway.
function buildDoors(cell,top){
  const sc=state.scene, doors=[...cell.entries()].filter(([,w])=>meta(w).type==='door');
  if(!doors.length) return;
  const mats=wallMaterials(), frame=boxBatch(), DH=doorHeight();
  for(const [k,w] of doors){
    const [x,z]=k.split(',').map(Number), alongX=doorAxisOf(cell,x,z);
    const putF=(ac,y,len,hgt,thick,col)=>{ alongX ? frame.add(ac,y,z,len,hgt,thick,col) : frame.add(x,y,ac,thick,hgt,len,col); };
    for(const e of [-0.435,0.435]) putF((alongX?x:z)+e,top+(DH+.05)/2,.13,DH+.05,.21,[.26,.16,.09]);  // jamb posts
    putF(alongX?x:z,top+DH+.01,1,.13,.21,[.28,.17,.09]);                                                // head beam under the stone header
    putF(alongX?x:z,top+.018,.88,.036,.26,[.30,.19,.10]);                                               // threshold
    const g=buildDoorLeaf(sc,x,z,alongX,top,DH);
    for(const m of g.pivot.getChildMeshes(false)){ m.metadata={proxy:w}; m.isPickable=true; state.wallVisuals.push(m); }
    state.wallVisuals.push(g.pivot);
    (state.doorLeaves=state.doorLeaves||[]).push(g);
  }
  const fm=frame.mesh('door_frames',sc);
  if(fm){ fm.material=mats.doorWood; fm.isPickable=false; fm.receiveShadows=true; addShadow(fm); state.wallVisuals.push(fm); }
  ensureDoorAnimator();
}
// Doors swing away from whoever is close, and settle shut when clear. One
// observer for every door, however often the walls are rebuilt.
function ensureDoorAnimator(){
  if(state._doorAnimator||!state.scene) return; state._doorAnimator=true;
  state.scene.onBeforeRenderObservable.add(()=>{
    const leaves=state.doorLeaves||[]; if(!leaves.length) return;
    const dt=Math.min(.05,(state.scene.getEngine().getDeltaTime()||16)/1000);
    const folk=[...(state.characters||[]),state.playerAvatar].filter(Boolean);
    for(const L of leaves){
      if(L.pivot.isDisposed?.()) continue;
      let dir=0;
      for(const g of folk){
        const p=g.logicalPos||g.root?.position; if(!p) continue;
        const dx=p.x-L.x, dz=p.z-L.z;
        if(dx*dx+dz*dz<2.9){ dir=L.alongX ? (dz>=0?1:-1) : (dx>=0?-1:1); break; }
      }
      L.angle+=(dir*1.85-L.angle)*Math.min(1,dt*7);
      L.pivot.rotation.y=L.base+L.angle;
      // creak as it starts to swing open, thud when it swings shut
      const open=Math.abs(L.angle)>.12;
      if(dir && !L.sounded){ L.sounded=true; window.tablefolkSfx?.play('doorOpen',{x:L.x,z:L.z}); }
      else if(!dir && L.sounded && !open){ L.sounded=false; window.tablefolkSfx?.play('doorClose',{x:L.x,z:L.z}); }
    }
  });
}
// One AssetContainer per model file. Every placed copy instantiates from it
// and shares its geometry, materials and textures: twenty trees cost one set
// of textures, not twenty. Shared materials are never disposed with an object.
const modelContainers=new Map();
function loadModelInstance(scene,dir,name,prepare){
  const url=dir+name;
  if(!modelContainers.has(url)){
    const p=BABYLON.SceneLoader.LoadAssetContainerAsync(dir,name,scene).then(c=>{
      state.sharedAssetMats ||= new Set();
      for(const m of c.materials) state.sharedAssetMats.add(m);
      try{ prepare?.(c); }catch(e){ console.warn('model prepare failed',name,e); }
      return c;
    });
    p.catch(()=>modelContainers.delete(url));
    modelContainers.set(url,p);
  }
  return modelContainers.get(url).then(c=>{
    const inst=c.instantiateModelsToScene(n=>n,false,{doNotInstantiate:true});
    const meshes=[];
    for(const r of inst.rootNodes){ if(r instanceof BABYLON.AbstractMesh) meshes.push(r); meshes.push(...r.getChildMeshes(false)); }
    return { meshes, rootNodes:inst.rootNodes, animationGroups:inst.animationGroups||[], skeletons:inst.skeletons||[] };
  });
}
// Bounds of loaded meshes in world space.
function meshBounds(meshes){
  let min=new BABYLON.Vector3(1e9,1e9,1e9),max=new BABYLON.Vector3(-1e9,-1e9,-1e9);
  for(const q of meshes){ if(!(q.getTotalVertices?.()>0)) continue; q.computeWorldMatrix(true); const b=q.getBoundingInfo().boundingBox; min=BABYLON.Vector3.Minimize(min,b.minimumWorld); max=BABYLON.Vector3.Maximize(max,b.maximumWorld); }
  return {min,max};
}
const GEN_ASSET=()=>ASSET_BASE+'models/props/gen/';
const genPrepare=c=>{ applyClayLookToMeshes(c.meshes,c.scene||state.scene,{detail:.11,detailScale:5}); for(const m of c.materials) plasticFinish(m,{coat:.5,coatRough:.14}); };
function makeCrate(scene,x,z){
  // Keep the simple box as the physics/picking proxy, but make it invisible and
  // attach the same authored GLB used by decorative scenery. This preserves the
  // sandbox interaction contract while eliminating the duplicate generic visual.
  const m=BABYLON.MeshBuilder.CreateBox('crate',{size:.72},scene);
  m.position.set(x,(state.terrainTopY??0)+.36,z); m.isVisible=false;
  addToScene(m,state.materials.wood,{shape:'BOX',mass:1.4,restitution:.12});
  tag(m,'crate',{health:2,material:'wood',flammable:true}); state.props.push(m);
  loadModelInstance(scene,GEN_ASSET(),(window.tablefolkAsset||(f=>f))('crate.glb'),genPrepare).then(result=>{
    if(m.isDisposed()){ for(const q of result.meshes) q.dispose(); return; }
    const root=new BABYLON.TransformNode('crate_visual_root',scene); root.parent=m;
    if(!result.meshes.some(q=>q.getTotalVertices?.()>0)) throw new Error('crate.glb contains no renderable mesh');
    const {min,max}=meshBounds(result.meshes);
    // crate.glb is modelled centred on its origin: centre it on the proxy box
    // (offsetting by half its height alone sank it halfway into the ground).
    const ext=max.subtract(min), scale=.72/Math.max(ext.x,ext.z,1e-6);
    root.scaling.setAll(scale); root.position.copyFrom(min.add(max).scale(-.5*scale));
    for(const r of result.rootNodes) r.parent=root;
    for(const q of result.meshes){ q.metadata={proxy:m}; q.isPickable=true; q.receiveShadows=true; addShadow(q); }
    m.metadata.asset='crate.glb';
  }).catch(err=>{ console.warn('failed to load crate visual',err); m.isVisible=true; });
  return m;
}
function makeBarrel(scene,x,z){
  const b=BABYLON.MeshBuilder.CreateCylinder('barrel',{height:.78,diameter:.55,tessellation:10},scene);
  b.position.set(x,(state.terrainTopY??0)+.39,z); b.rotation.z=Math.random()*.08; b.isVisible=false;
  addToScene(b,state.materials.wood,{shape:'CYLINDER',mass:1.1,restitution:.22,friction:.55});
  tag(b,'barrel',{health:2,material:'wood',flammable:true}); state.props.push(b);
  loadModelInstance(scene,GEN_ASSET(),(window.tablefolkAsset||(f=>f))('barrel.glb'),genPrepare).then(result=>{
    if(b.isDisposed()){ for(const q of result.meshes) q.dispose(); return; }
    const root=new BABYLON.TransformNode('barrel_visual_root',scene); root.parent=b;
    if(!result.meshes.some(q=>q.getTotalVertices?.()>0)) throw new Error('barrel.glb contains no renderable mesh');
    const {min,max}=meshBounds(result.meshes);
    // Centred on its origin like crate.glb: centre it on the proxy cylinder.
    const ext=max.subtract(min), scale=.78/Math.max(ext.y,1e-6);
    root.scaling.setAll(scale); root.position.copyFrom(min.add(max).scale(-.5*scale));
    for(const r of result.rootNodes) r.parent=root;
    for(const q of result.meshes){ q.metadata={proxy:b}; q.isPickable=true; q.receiveShadows=true; addShadow(q); }
    b.metadata.asset='barrel.glb';
  }).catch(err=>{ console.warn('failed to load barrel visual',err); b.isVisible=true; });
  return b;
}
function makeMushroom(scene,x,z,s=.7){ const root=new BABYLON.TransformNode('mushroom_root',scene); root.position.set(x,state.terrainTopY??0,z); const stem=BABYLON.MeshBuilder.CreateCylinder('mushroom_stem',{height:.42*s,diameter:.18*s,tessellation:7},scene); stem.parent=root; stem.position.y=.21*s; stem.material=state.materials.canvas; const cap=BABYLON.MeshBuilder.CreateSphere('mushroom_cap',{diameter:.52*s,segments:10},scene); cap.parent=root; cap.position.y=.46*s; cap.scaling.y=.38; cap.material=state.materials.mushroom; addShadow(stem); addShadow(cap); tag(root,'mushroom',{health:2,material:'soft',soft:true}); stem.metadata={proxy:root}; cap.metadata={proxy:root}; state.props.push(root); return root; }
// Lamps can't take a real light slot (materials are capped at four lights:
// campfire, lantern, key, rim), so fake their glow with an additive pool of
// light on the ground around them.
function addLampPool(scene,root,{warm=false,y=.025}={}){
  if(warm){
    if(!state.lampPoolWarmMat){
      const size=128, tex=new BABYLON.DynamicTexture('lamp_pool_warm_tex',{width:size,height:size},scene,false);
      const ctx=tex.getContext(), g=ctx.createRadialGradient(size/2,size/2,0,size/2,size/2,size/2);
      g.addColorStop(0,'rgba(255,214,150,0.5)'); g.addColorStop(.45,'rgba(240,180,110,0.2)'); g.addColorStop(1,'rgba(220,150,90,0)');
      ctx.fillStyle=g; ctx.fillRect(0,0,size,size); tex.update(); tex.hasAlpha=true;
      const m=new BABYLON.StandardMaterial('lamp_pool_warm_mat',scene);
      m.diffuseTexture=tex; m.emissiveTexture=tex; m.opacityTexture=tex; m.disableLighting=true; m.useAlphaFromDiffuseTexture=true;
      m.alphaMode=BABYLON.Engine.ALPHA_ADD; m.backFaceCulling=false; m.disableDepthWrite=true;
      state.lampPoolWarmMat=m;
    }
    const disc=BABYLON.MeshBuilder.CreateDisc('lamp_pool',{radius:1.6,tessellation:24},scene);
    disc.rotation.x=Math.PI/2; disc.parent=root; disc.position.y=y; disc.material=state.lampPoolWarmMat; disc.isPickable=false; disc.alphaIndex=5;
    disc.metadata={proxy:root};
    return disc;
  }
  if(!state.lampPoolMat){
    const size=128, tex=new BABYLON.DynamicTexture('lamp_pool_tex',{width:size,height:size},scene,false);
    const ctx=tex.getContext(), g=ctx.createRadialGradient(size/2,size/2,0,size/2,size/2,size/2);
    g.addColorStop(0,'rgba(140,240,220,0.55)'); g.addColorStop(.45,'rgba(90,200,190,0.22)'); g.addColorStop(1,'rgba(60,160,160,0)');
    ctx.fillStyle=g; ctx.fillRect(0,0,size,size); tex.update(); tex.hasAlpha=true;
    const m=new BABYLON.StandardMaterial('lamp_pool_mat',scene);
    m.diffuseTexture=tex; m.emissiveTexture=tex; m.opacityTexture=tex; m.disableLighting=true; m.useAlphaFromDiffuseTexture=true;
    m.alphaMode=BABYLON.Engine.ALPHA_ADD; m.backFaceCulling=false; m.disableDepthWrite=true;
    state.lampPoolMat=m;
  }
  const disc=BABYLON.MeshBuilder.CreateDisc('lamp_pool',{radius:1.5,tessellation:24},scene);
  disc.rotation.x=Math.PI/2; disc.parent=root; disc.position.y=.025; disc.material=state.lampPoolMat; disc.isPickable=false; disc.alphaIndex=5;
  disc.metadata={proxy:root};
}
// Scene lighting presets. 'night' is the normal diorama look; 'bright' raises
// and strengthens the key light so its falloff no longer leaves the north half
// of the island in the dark (the sky-dome light never reaches materials: it is
// fifth in priority under the four-light cap). 'dim' is night at half ambient
// (key, fill, rim, sky dome and environment), so lamps and fires stand out.
// Used by scenarios.
let lightingDefaults=null;
function setLighting(mode='night'){
  const sc=state.scene; if(!sc) return;
  const key=sc.getLightByName('tree_key_moved'), rim=sc.getLightByName('teal_rim');
  if(!lightingDefaults) lightingDefaults={keyPos:key?.position.clone(), keyI:key?.intensity, rimI:rim?.intensity};
  const d=lightingDefaults, amb=mode==='dim' ? .5 : 1;
  const hemi=sc.getLightByName('sky_dome_light');
  if(hemi){ d.hemiI ??= hemi.intensity; hemi.intensity=d.hemiI*amb; }
  if(sc.environmentTexture){ d.envI ??= sc.environmentIntensity; sc.environmentIntensity=d.envI*amb; }
  // Bigger boards: move the key and fill out with the board and raise their
  // intensity by the square of the distance, so the middle stays as lit.
  const k=LEGACY_ISLAND ? 1 : boardScale(), fill=sc.getLightByName('cool_fill');
  if(fill){ d.fillPos ||= fill.position.clone(); d.fillI ??= fill.intensity; d.fillR ??= fill.range;
    fill.position.copyFrom(d.fillPos.scale(k)); fill.intensity=d.fillI*k*k*amb; fill.range=d.fillR*k; }
  if(key) key.range=46*k;
  if(mode==='bright'){
    // Raised less and only 2.2x (was y14, 4x): enough to light the north
    // half, while keeping the glancing highlights that give the glossy
    // "plastic miniature" look (4x from overhead flattened it).
    if(key){ key.position.set(-1,9*k,10.5*k); key.intensity=d.keyI*2.2*k*k; }
    if(rim) rim.intensity=Math.max(d.rimI,.34);
  } else {
    if(key && d.keyPos){ key.position.copyFrom(d.keyPos.scale(k)); key.intensity=d.keyI*k*k*amb; }
    if(rim) rim.intensity=d.rimI*amb;
  }
  state.lighting=mode;
}
function makeLamp(scene,x,z){ const root=new BABYLON.TransformNode('lamp_root',scene); root.position.set(x,state.terrainTopY??0,z); const pole=BABYLON.MeshBuilder.CreateCylinder('lamp_pole',{height:.85,diameter:.07,tessellation:6},scene); pole.parent=root; pole.position.y=.46; pole.material=state.materials.darkwood; addShadow(pole); const c=createCrystal('lamp_crystal',scene,.38,.14); c.parent=root; c.position.y=.98; c.material=state.materials.magic; addShadow(c); const light=new BABYLON.PointLight('lamp_light',new BABYLON.Vector3(0,.96,0),scene); light.parent=root; light.diffuse=new BABYLON.Color3(.37,.78,.72); light.intensity=.34; light.range=3.1; tag(root,'lamp',{health:1,material:'crystal'}); pole.metadata={proxy:root}; c.metadata={proxy:root}; addLampPool(scene,root); state.props.push(root); return root; }
function makeBakery(scene){ const x=-7,z=-4.5; const base=BABYLON.MeshBuilder.CreateBox('mushroom_bakery_base',{width:2.15,height:1.25,depth:1.75},scene); base.position.set(x,.62,z); addToScene(base,state.materials.stone,{motion:'static',shape:'BOX',mass:0}); tag(base,'bakery',{health:6,material:'stone'}); const cap=BABYLON.MeshBuilder.CreateSphere('mushroom_bakery_cap',{diameter:2.8,segments:14},scene); cap.position.set(x,1.62,z); cap.scaling.set(1.15,.38,1); cap.material=state.materials.mushroom; addShadow(cap); const door=BABYLON.MeshBuilder.CreateBox('tiny_round_door',{width:.50,height:.72,depth:.06},scene); door.position.set(x,.42,z-.91); door.material=state.materials.wood; const chimney=BABYLON.MeshBuilder.CreateCylinder('chimney',{diameter:.28,height:.72,tessellation:6},scene); chimney.position.set(x+.82,1.95,z+.22); chimney.material=state.materials.stone; addShadow(chimney); makeLamp(scene,x-1.8,z-.2); }
function makeFence(scene,x0,z0,count,dir='x'){ for(let i=0;i<count;i++){ const x=x0+(dir==='x'?i*.52:0),z=z0+(dir==='z'?i*.52:0); const post=BABYLON.MeshBuilder.CreateCylinder('fence_post',{height:.52,diameter:.09,tessellation:5},scene); post.position.set(x,.33,z); addToScene(post,state.materials.wood,{motion:'static',shape:'CYLINDER',mass:0}); tag(post,'fence',{health:1,material:'wood',flammable:true}); } for(const y of [.32,.53]){ const rail=BABYLON.MeshBuilder.CreateBox('fence_rail',{width:dir==='x'?count*.52:.08,height:.07,depth:dir==='x'?.08:count*.52},scene); rail.position.set(x0+(dir==='x'?(count-1)*.26:0),y,z0+(dir==='z'?(count-1)*.26:0)); rail.material=state.materials.wood; addShadow(rail); } }

function noteTextFromHtml(html){ const d=document.createElement('div'); d.innerHTML=String(html||''); return (d.textContent||d.innerText||'').replace(/\s+\n/g,'\n').trim(); }
function renderNoteTexture(scene,html){
  const W=512,H=512;
  const tex=new BABYLON.DynamicTexture('note_tex',{width:W,height:H},scene,true);
  tex.hasAlpha=false;
  const ctx=tex.getContext();
  const drawFallback=()=>{ ctx.fillStyle='#f3ecd8'; ctx.fillRect(0,0,W,H); ctx.fillStyle='#3a2f22'; ctx.font='20px monospace'; const t=noteTextFromHtml(html); const words=t.split(/\s+/); let line='',y=46; for(const w of words){ if(ctx.measureText(line+w).width>W-40){ ctx.fillText(line,20,y); y+=26; line=''; } line+=w+' '; if(y>H-20) break; } ctx.fillText(line,20,y); tex.update(); };
  drawFallback();
  (async()=>{
    let html2=String(html||'');
    if(/<img\b[^>]*\bsrc=["']?https?:/i.test(html2)){
      try{ html2=await inlineNoteImages(html2); }catch(e){ /* keep original */ }
    }
    if(window.html2canvas){
      try{
        const host=document.createElement('div');
        host.style.cssText='position:absolute;left:-10000px;top:0;width:'+W+'px;height:'+H+'px;margin:0;padding:18px;box-sizing:border-box;background:#f3ecd8;color:#2a2318;font-family:Georgia,serif;font-size:17px;line-height:1.4;overflow:hidden;word-wrap:break-word;';
        host.innerHTML=html2;
        document.body.appendChild(host);
        let canvas;
        try{ canvas=await html2canvas(host,{backgroundColor:'#f3ecd8',width:W,height:H,windowWidth:W,windowHeight:H,scale:1,useCORS:true,allowTaint:false,logging:false}); }
        finally{ host.remove(); }
        ctx.fillStyle='#f3ecd8'; ctx.fillRect(0,0,W,H);
        ctx.drawImage(canvas,0,0,W,H); tex.update();
        return;
      }catch(e){ console.warn('note html2canvas failed, trying SVG fallback',e); }
    }
    if(typeof renderNoteTextureSVG==='function') renderNoteTextureSVG(tex,ctx,W,H,html2);
  })();
  return tex;
}
async function inlineNoteImages(html){
  const d=document.createElement('div'); d.innerHTML=String(html||'');
  const imgs=Array.from(d.querySelectorAll('img'));
  await Promise.all(imgs.map(async im=>{
    const src=im.getAttribute('src')||'';
    if(!/^https?:/i.test(src)) return;
    try{
      const r=await fetch(src,{mode:'cors'});
      if(!r.ok) throw new Error('http '+r.status);
      const b=await r.blob();
      const dataUrl=await new Promise((res,rej)=>{ const fr=new FileReader(); fr.onload=()=>res(fr.result); fr.onerror=rej; fr.readAsDataURL(b); });
      im.setAttribute('src',dataUrl);
    }catch(e){
      im.removeAttribute('src');
      im.setAttribute('alt','[image unavailable]');
      im.setAttribute('style','display:inline-block;width:96px;height:96px;border:1px dashed #7a6a55;color:#7a6a55;font-size:12px;text-align:center;line-height:96px;');
    }
  }));
  return d.innerHTML;
}
function makeNote(scene,x,z,html='<p>empty note</p>'){
  const m=BABYLON.MeshBuilder.CreateBox('note',{width:.6,height:.02,depth:.82},scene);
  m.position.set(x,(state.terrainTopY??0)+.05,z);
  const mat=new BABYLON.StandardMaterial('note_mat',scene);
  const tex=renderNoteTexture(scene,html);
  mat.diffuseTexture=tex; mat.emissiveTexture=tex; mat.specularColor=new BABYLON.Color3(.5,.5,.5);
  mat.emissiveColor=new BABYLON.Color3(1,1,1);
  m.material=mat;
  addToScene(m,mat,{shape:'BOX',mass:.2,restitution:.05,friction:.6});
  tag(m,'note',{health:1,material:'paper',flammable:true});
  const mm=meta(m); mm.noteHtml=String(html||''); mm.noteText=noteTextFromHtml(html); mm.ownsMaterial=true;
  state.props.push(m);
  return m;
}

function makeShrine(scene){ const plinth=makeBlock(scene,4.5,-6.5,true); plinth.name='cracked_shrine_plinth'; plinth.scaling.set(1.2,.72,1.2); const c=createCrystal('hero_crystal',scene,1.35,.32); c.position.set(4.5,1.25,-6.5); c.material=state.materials.magic; addShadow(c); tag(c,'crystal',{health:3,material:'crystal'}); state.props.push(c); const l=new BABYLON.PointLight('shrine_glow',new BABYLON.Vector3(4.5,1.1,-6.5),scene); l.diffuse=new BABYLON.Color3(.25,.9,.85); l.intensity=.38; l.range=4.2; }
function makeBridge(scene){ for(let i=0;i<6;i++){ const plank=BABYLON.MeshBuilder.CreateBox('bridge_plank',{width:.86,height:.10,depth:.42},scene); plank.position.set(7+i*.78,.08,4.8+Math.sin(i)*.05); plank.material=state.materials.wood; addBody(plank,'static','BOX',0); plank.receiveShadows=true; tag(plank,'bridge',{health:2,material:'wood',flammable:true}); state.blocks.push(plank); } }
function scatter(scene){ for(let i=0;i<18;i++) makeMushroom(scene,-10+Math.random()*6,4+Math.random()*6,.55+Math.random()*.55); for(let i=0;i<13;i++) makeBlock(scene,Math.round(2+Math.random()*8),Math.round(-9+Math.random()*4),Math.random()<.65); for(let i=0;i<22;i++){ const r=BABYLON.MeshBuilder.CreatePolyhedron('rock',{type:2,size:.25+Math.random()*.35},scene); r.position.set(-12+Math.random()*24,.14,-12+Math.random()*24); r.material=state.materials.stone; addBody(r,'static','BOX',0); addShadow(r); tag(r,'rock',{health:2,material:'stone'}); } }
async function scatterRealProps(scene){
  const scatterProps=[
    ['Barrel.gltf',{type:'barrel',w:.65,h:.9,d:.65,shape:'CYLINDER',mass:1.1,scale:.82,visualYOffset:.42,flammable:true}],
    ['Crate_Wooden.gltf',{type:'crate',w:.85,h:.85,d:.85,mass:1.35,scale:.85,visualYOffset:.43,flammable:true}],
    ['Bucket_Wooden_1.gltf',{type:'bucket',w:.55,h:.62,d:.55,mass:.6,scale:.72,visualYOffset:.31,flammable:true}],
    ['Bag.gltf',{type:'bag',w:.55,h:.62,d:.55,mass:.45,scale:.85,visualYOffset:.31,flammable:true}],
    ['Chest_Wood.gltf',{type:'chest',w:1.05,h:.75,d:.75,mass:1.2,scale:.55,visualYOffset:.38,flammable:true}],
  ];
  const fixedPositions=[[-1.8,1.2],[1.8,1.7],[0.2,2.7],[2.8,0.1],[-6.0,-2.9],[-5.0,-3.2],[-7.7,-3.2],[-7.9,-5.8],[-5.9,-6.1],[-6.8,-6.2],[4.2,-4.8],[5.4,-5.2],[6.5,-4.6],[3.4,-7.5],[3.0,-6.4],[3.7,-6.1],[8.2,3.3],[-3.4,1.0],[5.0,-6.0],[5.4,-6.25],[-6.8,-4.7],[4.8,-4.3],[-8.7,-3.95],[-1.5,1.8],[5.8,2.2]];
  function tooClose(x,z){ for(const [fx,fz] of fixedPositions){ if(Math.abs(x-fx)<1.5 && Math.abs(z-fz)<1.5) return true; } for(const p of state.props){ if(p.isDisposed?.()) continue; const pp=p.getAbsolutePosition?.()||p.position; if(Math.abs(x-pp.x)<1.2 && Math.abs(z-pp.z)<1.2) return true; } return false; }
  for(let i=0;i<12;i++){
    const [file,base]=pickRandom(scatterProps);
    let x,z,tries=0;
    do { x=clamp(Math.round(-4+Math.random()*10),-14,14); z=clamp(Math.round(-2+Math.random()*7),-14,14); tries++; } while(tooClose(x,z) && tries<20);
    await importPropAsset(scene,file,{...base,x,z,y:0.5});
  }
  log('scattered 12 real GLTF props');
}
function buildWorld(scene){ const water=state.materials.water; for(let x=-WORLD.half;x<WORLD.half;x++){ for(let z=-WORLD.half;z<WORLD.half;z++){ let material='grass'; if(Math.abs(z)<2 && x>-9 && x<9) material='dirt'; if(x>6 && z>3) material='water'; if(x>2 && z<-5) material='stone'; const t=makeTile(scene,x+.5,z+.5,material); if(material==='water') { t.material=water; t.position.y=-.09; } } }
  for(let x=-16;x<=16;x++){ makeBlock(scene,x,-16,Math.random()<.3); makeBlock(scene,x,16,Math.random()<.3); } for(let z=-15;z<=15;z++){ makeBlock(scene,-16,z,Math.random()<.3); makeBlock(scene,16,z,Math.random()<.3); }
  makeBakery(scene); makeFence(scene,-9.4,-2.2,9,'x'); makeFence(scene,-9.4,-2.2,6,'z'); makeShrine(scene); makeBridge(scene); makeLamp(scene,-1.5,1.8); makeLamp(scene,5.8,2.2); scatter(scene);
}

// ---- painted floor tiles ----
// Per-cell floor tiles laid over the island (scenarios: "paint stone at
// north", "floor stone", paths). Each painted cell is a slightly inset,
// rounded tabletop floor tile, so it reads as a placed piece even though the
// game grid is offset half a cell from the grass tiles. One mesh per
// material+tint with thin instances. Water and lava block placement.
const PAINT_MATERIALS={
  stone:{file:'stone_blocks.png',color:[.78,.77,.74],glyph:'^',name:'stone floor'},
  flagstone:{file:'stone_soft.png',color:[.70,.70,.68],glyph:'^',name:'stone floor'},
  dirt:{file:'dirt_path.png',color:[1,1,1],glyph:':',name:'dirt/path'},
  wood:{file:'wood_planks.png',color:[.95,.9,.85],glyph:'_',name:'wooden floor'},
  sand:{file:'dirt_loam.png',color:[1.25,1.1,.8],glyph:'.',name:'sand'},
  grass:{file:'grass_meadow.png',color:[1,1,1],glyph:',',name:'grass'},
  // Water and lava are laid unturned and edge to edge, so neighbouring cells
  // join into one surface that flows the same way.
  water:{file:'water_soft.png',color:[.55,.8,1],glyph:'~',name:'water',emissive:[.02,.06,.09],blocks:true,aligned:true},
  lava:{proc:'lava',color:[1,1,1],glyph:'&',name:'lava',emissive:[1,1,1],blocks:true,aligned:true},
  // modern floors: glossy (rough + clear coat); 'tile' is drawn, not a file
  oak:{proc:'oak',color:[1,1,1],glyph:'_',name:'wooden floor',rough:.32,coat:.5,aligned:true},
  tile:{proc:'tile',color:[.93,.92,.9],glyph:'_',name:'tiled floor',rough:.22,coat:.6,aligned:true},
  concrete:{file:'stone_soft.png',color:[.78,.78,.77],glyph:'_',name:'concrete floor',rough:.4,coat:.35},
  carpet:{color:[.40,.45,.50],glyph:'_',name:'carpet',rough:.95},
  // Not a floor: removes the board tile, so the sea shows through (coasts,
  // islands, channels). Walking onto it is a fall.
  sea:{color:[0,0,0],glyph:'~',name:'sea',hole:true},
};
// Large porcelain tiles: 2x2 per cell, thin grout.
// Molten lava, seamless: mostly red-orange melt, bright yellow cracks, a few
// small islands of black crust. Returns the colour and the glow texture
// (cracks and melt glow, crust doesn't) plus the canvas for relief.
function lavaTextures(sc){
  if(state.lavaTex) return state.lavaTex;
  const N=256, col=document.createElement('canvas'), glow=document.createElement('canvas'); col.width=col.height=glow.width=glow.height=N;
  const ci=col.getContext('2d').createImageData(N,N), gi=glow.getContext('2d').createImageData(N,N), T=Math.PI*2/N;
  // Integer frequencies keep every term periodic over the tile.
  const waves=[[2,1,.0,1],[1,3,1.3,.8],[3,-2,2.1,.6],[5,4,.7,.35],[-4,6,2.9,.3],[7,-5,1.7,.2],[9,8,.4,.12]];
  const f=(x,y)=>{ let v=0; for(const [k,l,ph,a] of waves) v+=a*Math.sin(T*(k*x+l*y)+ph); return v/2.3; };
  const mix=(a,b,t)=>a+(b-a)*Math.max(0,Math.min(1,t));
  for(let y=0;y<N;y++) for(let x=0;x<N;x++){
    const v=f(x,y), crack=Math.max(0,1-Math.abs(v-.05)/.06), crust=Math.max(0,(v-.62)/.14), i=(y*N+x)*4;
    let r=mix(.62,.95,.5+v), g=mix(.10,.30,.5+v*.5), b=.03;                      // red to orange melt
    r=mix(r,1,crack); g=mix(g,.72,crack); b=mix(b,.12,crack);                    // yellow-orange cracks
    const k=Math.min(1,crust); r=mix(r,.07,k); g=mix(g,.04,k); b=mix(b,.03,k);   // black crust
    ci.data[i]=r*255; ci.data[i+1]=g*255; ci.data[i+2]=b*255; ci.data[i+3]=255;
    const gl=(1-k)*(.55+crack*.6);
    gi.data[i]=Math.min(255,r*gl*255); gi.data[i+1]=Math.min(255,g*gl*255); gi.data[i+2]=Math.min(255,b*gl*255); gi.data[i+3]=255;
  }
  col.getContext('2d').putImageData(ci,0,0); glow.getContext('2d').putImageData(gi,0,0);
  const mk=(name,cv)=>{ const t=new BABYLON.DynamicTexture(name,cv,sc,true); t.update(false); t.wrapU=t.wrapV=BABYLON.Texture.WRAP_ADDRESSMODE; return t; };
  return state.lavaTex={ color:mk('lava_col',col), glow:mk('lava_glow',glow), canvas:col };
}
function tileFloorTexture(sc){
  const N=256, cv=document.createElement('canvas'); cv.width=cv.height=N;
  const g=cv.getContext('2d');
  g.fillStyle='#b9b6b0'; g.fillRect(0,0,N,N);
  for(let i=0;i<2;i++) for(let j=0;j<2;j++){
    const v=236+((i*3+j*5)%3)*4;
    g.fillStyle=`rgb(${v},${v-1},${v-3})`; g.fillRect(i*N/2+3,j*N/2+3,N/2-6,N/2-6);
  }
  const t=new BABYLON.DynamicTexture('paint_tile_tex',cv,sc,true); t.update();
  return t;
}
// Light oak boards: four per cell, running continuously across cells (tiles
// with "aligned" skip the random quarter turns), staggered butt joints.
function oakFloorTexture(sc){
  const N=256, cv=document.createElement('canvas'); cv.width=cv.height=N;
  const g=cv.getContext('2d'); let seed=7;
  const rnd=()=>{ seed=(seed*16807)%2147483647; return seed/2147483647; };
  for(let b=0;b<4;b++){
    const y0=b*N/4, joint=Math.floor(rnd()*N);
    for(const [x0,x1] of [[0,joint],[joint,N]]){
      const t=.92+rnd()*.14;
      g.fillStyle=`rgb(${Math.round(214*t)},${Math.round(178*t)},${Math.round(132*t)})`; g.fillRect(x0,y0,x1-x0,N/4);
      for(let k=0;k<7;k++){ // grain
        g.strokeStyle=`rgba(120,80,40,${.05+rnd()*.07})`; g.lineWidth=1+rnd()*1.5;
        const yy=y0+4+rnd()*(N/4-8); g.beginPath(); g.moveTo(x0,yy);
        for(let x=x0;x<=x1;x+=16) g.lineTo(x,yy+Math.sin(x*.05+k)*1.5); g.stroke();
      }
      g.fillStyle='rgba(70,45,25,.55)'; g.fillRect(x0,y0,1.5,N/4);
    }
    g.fillStyle='rgba(70,45,25,.6)'; g.fillRect(0,y0,N,1.5);
  }
  const t=new BABYLON.DynamicTexture('paint_oak_tex',cv,sc,true); t.update();
  return t;
}
function paintKey(x,z){ return Math.round(x)+','+Math.round(z); }
let paintRebuildQueued=false;
function schedulePaintRebuild(){ if(paintRebuildQueued) return; paintRebuildQueued=true; queueMicrotask(()=>{ paintRebuildQueued=false; try{ rebuildPaint(); }catch(e){ console.warn('paint rebuild failed',e); } }); }
// cells: [{x,z,mat,tint?}] ; mat 'none' erases.
function setPaint(cells,{replace=false}={}){
  if(replace || !state.paint) state.paint=new Map();
  for(const c of cells||[]){
    const k=paintKey(c.x,c.z);
    if(!c.mat || c.mat==='none') state.paint.delete(k);
    else if(PAINT_MATERIALS[c.mat]) state.paint.set(k,{mat:c.mat,tint:c.tint||null});
  }
  schedulePaintRebuild();
}
function paintAt(x,z){ return state.paint?.get(paintKey(x,z))||null; }
function paintMaterial(mat,tint){
  state.paintMats ||= new Map();
  const key=mat+'|'+(tint||'');
  if(state.paintMats.has(key)) return state.paintMats.get(key);
  const def=PAINT_MATERIALS[mat], sc=state.scene;
  const m=new BABYLON.PBRMaterial('paint_'+key,sc);
  const tx=def.file ? new BABYLON.Texture(ASSET+def.file,sc,true,false,BABYLON.Texture.TRILINEAR_SAMPLINGMODE) : def.proc==='tile' ? tileFloorTexture(sc) : def.proc==='oak' ? oakFloorTexture(sc) : def.proc==='lava' ? lavaTextures(sc).color : null;
  if(tx){ tx.wrapU=tx.wrapV=BABYLON.Texture.WRAP_ADDRESSMODE; tx.anisotropicFilteringLevel=8; }
  m.albedoTexture=tx; m.metallic=0; m.roughness=def.rough??(mat==='water'?.25:.85); m.environmentIntensity=.6; m.specularIntensity=mat==='water'||def.coat?1:.4; m.maxSimultaneousLights=8;
  if(def.coat) plasticFinish(m,{coat:def.coat,coatRough:.1});
  let col=new BABYLON.Color3(...def.color);
  if(tint){ try{ col=BABYLON.Color3.FromHexString(tint); }catch{} }
  m.albedoColor=col;
  if(def.emissive) m.emissiveColor=new BABYLON.Color3(...def.emissive);
  // Relief from the floor's own texture (brightness as height), so painted
  // floors aren't flat decals beside the sculpted tiles. Water stays smooth.
  const HD=window.TablefolkHD;
  if(mat==='water'){ m.roughness=.06; m.alpha=.86; plasticFinish(m,{coat:.9,coatRough:.04}); }
  if(mat==='lava'){ m.roughness=.55; m.emissiveTexture=lavaTextures(sc).glow; m.emissiveColor=new BABYLON.Color3(1.4,1.4,1.4); }
  if(FLOWING[mat]) animateFlow();
  if(HD && tx){
    const bump=cv=>{ const n=HD.dyn(sc,'paint_n_'+key,HD.normalFromCanvas(cv,def.relief??(mat==='water'?3.2:2.4))); n.anisotropicFilteringLevel=8; m.bumpTexture=n; m.bumpTexture.level=mat==='water'?1.3:.9; };
    if(def.file) HD.loadImage(ASSET+def.file).then(img=>{ const cv=HD.canvasOf(img.width,img.height); cv.getContext('2d').drawImage(img,0,0); bump(cv); }).catch(e=>console.warn('floor relief',e));
    else if(mat==='lava') bump(lavaTextures(sc).canvas);
    else if(tx.getContext) try{ bump(tx.getContext().canvas); }catch(e){ console.warn('floor relief',e); }
  }
  state.paintMats.set(key,m);
  return m;
}
// Solid floors: real geometry instead of flat textured overlays, which never
// caught the light the way the sculpted tiles and props do. Every piece of a
// floor type is merged into one mesh (one draw call; a piece is 12
// triangles). Wood/oak are planks, tile ceramic squares, concrete slabs,
// all with rounded edges (the wall stones' bevel normal map) and the glossy
// miniature finish; carpet is a raised continuous pile with a fabric grain.
const SOLID_FLOORS={
  wood:{color:[.40,.25,.13],layout:'planks',finish:'gloss'}, oak:{color:[.60,.43,.26],layout:'planks',finish:'gloss'},
  tile:{color:[.78,.77,.74],layout:'squares',finish:'glaze'}, concrete:{color:[.50,.50,.49],layout:'slab',finish:'satin'},
  carpet:{color:[.28,.33,.40],layout:'pile',finish:'fabric'},
};
const FLOOR_FINISH={ gloss:{rough:.34,coat:.6}, glaze:{rough:.16,coat:.85}, satin:{rough:.55,coat:.2}, fabric:{rough:.95,coat:0,fabric:true}, rock:{rough:.7,coat:.15} };
function fabricNormal(sc){
  const N=128, cv=document.createElement('canvas'); cv.width=cv.height=N;
  const g=cv.getContext('2d'), img=g.createImageData(N,N);
  for(let i=0;i<N*N;i++){ const v=110+Math.random()*90; img.data[i*4]=img.data[i*4+1]=img.data[i*4+2]=v; img.data[i*4+3]=255; }
  g.putImageData(img,0,0);
  const HD=window.TablefolkHD; if(!HD) return null;
  const t=HD.dyn(sc,'carpet_n',HD.normalFromCanvas(cv,3)); t.uScale=t.vScale=3; return t;
}
function floorMaterial(finish){
  state.floorMats ||= {};
  if(state.floorMats[finish]) return state.floorMats[finish];
  const f=FLOOR_FINISH[finish], sc=state.scene, m=new BABYLON.PBRMaterial('floor_'+finish+'_mat',sc);
  m.albedoColor=new BABYLON.Color3(1,1,1); m.metallic=0; m.roughness=f.rough; m.environmentIntensity=.85; m.specularIntensity=f.fabric?.3:.7; m.maxSimultaneousLights=8;
  if(f.coat) plasticFinish(m,{coat:f.coat,coatRough:.1});
  applyClayLook(m,sc,{detail:.08,detailScale:4});
  if(f.fabric){ m.bumpTexture=fabricNormal(sc); m.sheen.isEnabled=true; m.sheen.intensity=.5; m.sheen.color=new BABYLON.Color3(.8,.85,.95); }
  else { m.bumpTexture=bevelNormalTexture(sc); m.bumpTexture.level=1; }
  state.sharedAssetMats ||= new Set(); state.sharedAssetMats.add(m);
  return state.floorMats[finish]=m;
}
function buildFloor(type,cells){
  const def=SOLID_FLOORS[type], b=boxBatch(), top=state.terrainTopY??0;
  const hash=(a,c,k)=>{ let h=Math.imul(a*73856093^c*19349663^k*83492791,2654435761); h^=h>>>15; return ((h>>>0)%10000)/10000; };
  for(const [x,z,tint] of cells){
    const col=tint||def.color, piece=(px,pz,w,d,h,k)=>b.add(px,top+h/2,pz,w,h,d,[col[0]*k,col[1]*k,col[2]*k]);
    if(def.layout==='planks') for(let i=0;i<4;i++){
      const pz=z-.375+i*.25;
      // Staggered joints: every other row splits mid-cell.
      const pieces=i%2 ? [[x-.25,.485],[x+.25,.485]] : [[x,.985]];
      pieces.forEach(([px,len],j)=>piece(px,pz,len,.232,.042+hash(x,z,i*3+j)*.012,.86+hash(z,x,i*5+j)*.26));
    }
    else if(def.layout==='squares') for(const [a,c] of [[-.25,-.25],[.25,-.25],[-.25,.25],[.25,.25]])
      piece(x+a,z+c,.468,.468,.032+hash(x+a*4,z+c*4,7)*.004,.95+hash(z+c*4,x+a*4,3)*.08);
    else if(def.layout==='slab') piece(x,z,.975,.975,.04+hash(x,z,1)*.01,.9+hash(z,x,2)*.14);
    else if(def.layout==='crust') for(const [a,c] of [[-.24,-.24],[.24,-.24],[-.24,.24],[.24,.24]]){
      const r=hash(x+a*4,z+c*4,9), w=.3+r*.12, d=.3+hash(z+c*4,x+a*4,5)*.12;
      piece(x+a+(r-.5)*.06,z+c+(hash(x,z+c*4,2)-.5)*.06,w,d,.05+r*.03,.8+r*.4);
    }
    else piece(x,z,1,1,.05,.97+hash(x,z,4)*.03);   // carpet pile: full cells, reads as one continuous carpet
  }
  const m=b.mesh('floor_'+type,state.scene); if(!m) return null;
  m.material=floorMaterial(def.finish); m.isPickable=false; m.receiveShadows=true;
  return m;
}
// Water and lava ripple: their relief scrolls (one shared observer).
const FLOWING={ water:{u:.035,v:.022}, lava:{u:.012,v:.007} };
function animateFlow(){
  if(state.flowObs || window.TABLEFOLK_STILL_MODE) return;
  state.flowObs=state.scene.onBeforeRenderObservable.add(()=>{
    const t=performance.now()*.001;
    for(const [mat,sp] of Object.entries(FLOWING)) for(const m of state.paintMats?.values()||[]) if(m.name.startsWith('paint_'+mat+'|')){
      for(const tx of [m.albedoTexture,m.bumpTexture,m.emissiveTexture]) if(tx){ tx.uOffset=(t*sp.u)%1; tx.vOffset=(t*sp.v)%1; }
      if(mat==='lava'){ const k=1.3+Math.sin(t*1.7)*.15+Math.sin(t*4.3)*.06; m.emissiveColor.set(k,k,k); }
    }
  });
}
function rebuildPaint(){
  const sc=state.scene; if(!sc) return;
  for(const m of state.paintMeshes||[]) try{ m.dispose(); }catch{}
  state.paintMeshes=[];
  // Sea cells are holes in the board, not floors: the board rebuilds around them.
  if(state.boardMeshes) rebuildBoard();
  if(!state.paint?.size) return;
  const top=state.terrainTopY??0, groups=new Map();
  const planks=new Map();
  for(const [k,v] of state.paint){
    if(SOLID_FLOORS[v.mat]){ let tint=null; if(v.tint && !SOLID_FLOORS[v.mat].overlay) try{ const c=BABYLON.Color3.FromHexString(v.tint); tint=[c.r,c.g,c.b]; }catch{}
      if(!planks.has(v.mat)) planks.set(v.mat,[]); planks.get(v.mat).push([...k.split(',').map(Number),tint]);
      if(!SOLID_FLOORS[v.mat].overlay) continue; }
    if(PAINT_MATERIALS[v.mat]?.hole || (state.boardModel && TILE_FLOORS.has(v.mat))) continue; const g=v.mat+'|'+(v.tint||''); if(!groups.has(g)) groups.set(g,{v,cells:[]}); groups.get(g).cells.push(k.split(',').map(Number)); }
  for(const [g,{v,cells}] of groups){
    const aligned=!!PAINT_MATERIALS[v.mat]?.aligned;   // continuous floors: full-size tiles, no turns
    const base=BABYLON.MeshBuilder.CreateBox('paint_'+g,{width:aligned?1:.97,height:.035,depth:aligned?1:.97},sc);
    base.material=paintMaterial(v.mat,v.tint); base.isPickable=false; base.receiveShadows=true;
    const buf=new Float32Array(cells.length*16), mat=new BABYLON.Matrix();
    cells.forEach(([x,z],i)=>{
      // tiny per-tile rotation of the texture quarter-turns breaks repetition
      BABYLON.Matrix.ComposeToRef(BABYLON.Vector3.One(),BABYLON.Quaternion.RotationAxis(BABYLON.Axis.Y,aligned?0:(((x*7+z*13)%4+4)%4)*Math.PI/2),new BABYLON.Vector3(x,top+.018,z),mat);
      mat.copyToArray(buf,i*16);
    });
    base.thinInstanceSetBuffer('matrix',buf,16,true);
    state.paintMeshes.push(base);
  }
  for(const [mat,cells] of planks){ const m=buildFloor(mat,cells); if(m) state.paintMeshes.push(m); }
  rebuildLavaLights();
}
// Every connected patch of lava lights its surroundings: a red-orange point
// light over its middle (props and characters nearby) and a glow on the ground.
function rebuildLavaLights(){
  const sc=state.scene;
  for(const o of state.lavaLights||[]) try{ o.dispose(); }catch{}
  state.lavaLights=[];
  const lava=new Set([...(state.paint||[])].filter(([,v])=>v.mat==='lava').map(([k])=>k)), seen=new Set(), top=state.terrainTopY??0;
  for(const start of lava){
    if(seen.has(start)) continue;
    const group=[], todo=[start]; seen.add(start);
    while(todo.length){ const k=todo.pop(); group.push(k); const [x,z]=k.split(',').map(Number);
      for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){ const n=(x+dx)+','+(z+dz); if(lava.has(n) && !seen.has(n)){ seen.add(n); todo.push(n); } } }
    const pts=group.map(k=>k.split(',').map(Number)), n=pts.length;
    const cx=pts.reduce((a,p)=>a+p[0],0)/n, cz=pts.reduce((a,p)=>a+p[1],0)/n;
    const reach=Math.max(...pts.map(p=>Math.hypot(p[0]-cx,p[1]-cz)))+.5;
    const L=new BABYLON.PointLight('lava_light',new BABYLON.Vector3(cx,top+.7,cz),sc);
    L.diffuse=new BABYLON.Color3(1,.32,.06); L.specular=new BABYLON.Color3(1,.4,.1);
    L.intensity=Math.min(22,5+n*1.5); L.range=Math.min(11,3.5+reach*1.8);
    window.tablefolkScenery?.trackLight(L);
    const node=new BABYLON.TransformNode('lava_glow_root',sc); node.position.set(cx,top,cz);
    const pool=addLampPool(sc,node,{warm:true,y:.08}); const k=(reach+1.2)/1.6; node.scaling.set(k,1,k);
    if(!window.TABLEFOLK_STILL_MODE){ const ph=cx*1.7+cz; const obs=sc.onBeforeRenderObservable.add(()=>{ const t=performance.now()*.001; L.intensity=Math.min(22,5+n*1.5)*(.88+Math.sin(t*1.7+ph)*.08+Math.sin(t*4.3+ph)*.04); }); L.onDisposeObservable.add(()=>sc.onBeforeRenderObservable.remove(obs)); }
    state.lavaLights.push(L,node);
  }
}
// ---- the board ----
// One tile per cell on a stone column that reaches down into the sea (both
// thin instances, so even a 63 x 63 board is two draw calls). Cells painted
// "sea" get neither: the sea shows through and walking there is a fall.
const BOARD_TILE_H=.24, BOARD_COLUMN_H=3.2;
function boardMaterials(){
  if(state.boardMats) return state.boardMats;
  const sc=state.scene;
  const top=new BABYLON.PBRMaterial('board_tile_mat',sc);
  top.albedoColor=new BABYLON.Color3(.62,.60,.56); top.metallic=0; top.roughness=.42; top.environmentIntensity=.7; top.maxSimultaneousLights=8;
  plasticFinish(top,{coat:.4,coatRough:.15}); applyClayLook(top,sc,{detail:.08,detailScale:4});
  const side=new BABYLON.PBRMaterial('board_column_mat',sc);
  side.albedoColor=new BABYLON.Color3(.24,.22,.20); side.metallic=0; side.roughness=.85; side.environmentIntensity=.5; side.maxSimultaneousLights=8;
  applyClayLook(side,sc,{detail:.12,detailScale:3});
  // Stone courses on the sides; a soft stone grain on box tiles.
  const HD=window.TablefolkHD;
  if(HD) try{
    const n=HD.dyn(sc,'board_side_n',HD.normalFromCanvas(HD.stoneFloorHeight(512,11,4,4),2.6));
    n.vScale=BOARD_COLUMN_H; side.bumpTexture=n;
    top.bumpTexture=HD.dyn(sc,'board_top_n',HD.normalFromCanvas(HD.macroHeightCanvas(512,7,30,.5),1.4));
  }catch(e){ console.warn('board relief',e); }
  return state.boardMats={top,side};
}
function boardCellList(){
  const cells=[];
  for(let z=-(WORLD.halfH-1);z<=WORLD.halfH-1;z++) for(let x=-(WORLD.halfW-1);x<=WORLD.halfW-1;x++){
    if(!PAINT_MATERIALS[paintAt(x,z)?.mat]?.hole) cells.push([x,z]);
  }
  return cells;
}
// The board's tiles are the sculpted grass tile (relief, normal and AO maps),
// one model drawn once per cell (thin instances), turned a random quarter
// per cell like the old island. Grass cells keep its grass texture; stone,
// flagstone, dirt, sand and unpainted cells get the same relief in a flat
// colour (a paint tint overrides it). Water, lava and indoor floors stay
// overlays on top. Big boards use the lighter model; past 2500 cells, boxes.
const TILE_COLORS={ board:[.46,.44,.41], stone:[.40,.39,.37], flagstone:[.33,.33,.32], dirt:[.27,.17,.09], sand:[.66,.54,.33] };
const TILE_FLOORS=new Set(['grass','stone','flagstone','dirt','sand']);
const BOARD_MODEL_H=.84;
const boardTileReady=new Map(), boardTileLoads=new Map();
function boardTileFile(n){ return n>2500 ? null : n>900 ? 'grass_v7_orm.med2.glb' : 'grass_v7_orm.1k.glb'; }
function loadBoardTile(file){
  if(!boardTileLoads.has(file)) boardTileLoads.set(file, BABYLON.SceneLoader.ImportMeshAsync('',TILE_ASSET,file,state.scene).then(r=>{
    const src=r.meshes.find(m=>m.getTotalVertices?.()>0);
    if(!src) throw new Error(file+' has no mesh');
    src.setParent(null); src.bakeCurrentTransformIntoVertices();
    for(const m of r.meshes) if(m!==src) m.dispose();
    src.name='board_tile_src'; src.setEnabled(false); src.isPickable=false;
    applyClayLookToMeshes([src],state.scene,{detail:.11,detailScale:5});
    const grass=src.material; grass.maxSimultaneousLights=8;
    const plain=grass.clone('board_tile_plain'); plain.albedoTexture=null; plain.albedoColor=new BABYLON.Color3(1,1,1);
    state.sharedAssetMats ||= new Set(); state.sharedAssetMats.add(grass); state.sharedAssetMats.add(plain);
    // The bounds must be refreshed after baking (they still described the
    // pre-bake, quantized mesh: top 0.84 instead of 0.42, so the tiles sat
    // 0.42 low and everything seemed to hover). Stand things on the mean
    // height of the top surface, not on its highest bump.
    src.refreshBoundingInfo();
    const pos=src.getVerticesData(BABYLON.VertexBuffer.PositionKind), maxY=src.getBoundingInfo().boundingBox.maximum.y;
    let sum=0,n=0; for(let i=1;i<pos.length;i+=3) if(pos[i]>maxY-.12){ sum+=pos[i]; n++; }
    boardTileReady.set(file,{src,grass,plain,top:n?sum/n:maxY});
  }));
  return boardTileLoads.get(file);
}
function tileColor(cell){
  const p=paintAt(cell[0],cell[1]);
  if(p?.tint){ try{ const c=BABYLON.Color3.FromHexString(p.tint); return [c.r,c.g,c.b]; }catch{} }
  return TILE_COLORS[p?.mat] || TILE_COLORS.board;
}
function rebuildBoard(){
  const sc=state.scene; if(!sc || LEGACY_ISLAND) return;
  for(const m of state.boardMeshes||[]) try{ m.dispose(); }catch{}
  const cells=boardCellList(), {top,side}=boardMaterials(), mat=new BABYLON.Matrix();
  const file=boardTileFile(cells.length), model=file && boardTileReady.get(file);
  if(file && !model) loadBoardTile(file).then(()=>rebuildBoard()).catch(e=>console.warn('board tile model unavailable; plain tiles',e));
  const tileH=model ? BOARD_MODEL_H : BOARD_TILE_H;
  const place=(m,list,y,{turn=false,colors=null}={})=>{
    m.isPickable=false; m.receiveShadows=true;
    if(!list.length){ m.setEnabled(false); return m; }
    m.setEnabled(true);
    const buf=new Float32Array(list.length*16), q=new BABYLON.Quaternion(), one=new BABYLON.Vector3(1.006,1,1.006), v=new BABYLON.Vector3();
    list.forEach(([x,z],i)=>{
      const k=turn ? (((x*73856093)^(z*19349663))>>>0)%4 : 0;
      BABYLON.Quaternion.RotationYawPitchRollToRef(k*Math.PI/2,0,0,q); v.set(x,y,z);
      BABYLON.Matrix.ComposeToRef(turn?one:BABYLON.Vector3.One(),q,v,mat); mat.copyToArray(buf,i*16);
    });
    m.thinInstanceSetBuffer('matrix',buf,16,true);
    if(colors) m.thinInstanceSetBuffer('color',colors,4,true);
    return m;
  };
  const meshes=[];
  if(model){
    const isGrass=c=>{ const p=paintAt(c[0],c[1]); return p?.mat==='grass' && !p.tint; };
    const grassCells=cells.filter(isGrass), plainCells=cells.filter(c=>!isGrass(c));
    const y=-model.top;
    // Own geometry each: the plain tiles' per-instance colour buffer must not
    // land on geometry the grass tiles share (wrong-sized buffer, black frame).
    const g=model.src.clone('board_tile_grass'); g.makeGeometryUnique(); g.material=model.grass; meshes.push(place(g,grassCells,y,{turn:true}));
    const colors=new Float32Array(plainCells.length*4);
    plainCells.forEach((c,i)=>{ const [r,gg,b]=tileColor(c); colors.set([r,gg,b,1],i*4); });
    const p=model.src.clone('board_tile_plain'); p.makeGeometryUnique(); p.material=model.plain; meshes.push(place(p,plainCells,y,{turn:true,colors}));
  } else {
    meshes.push(place(BABYLON.MeshBuilder.CreateBox('board_tile',{width:.965,height:BOARD_TILE_H,depth:.965},sc),cells,-BOARD_TILE_H/2));
    meshes[0].material=top;
  }
  const col=BABYLON.MeshBuilder.CreateBox('board_column',{width:1,height:BOARD_COLUMN_H,depth:1},sc); col.material=side;
  meshes.push(place(col,cells,-tileH-BOARD_COLUMN_H/2+.02));
  state.boardMeshes=meshes; state.boardModel=!!model;
  state.boardCells=new Set(cells.map(([x,z])=>x+','+z));
  state.terrainTopY=0;
  sceneryCells=null; groundCache.clear();
  // Floors the tiles now show themselves need no overlay (and vice versa).
  if(state.paintOverlayModel!==state.boardModel){ state.paintOverlayModel=state.boardModel; schedulePaintRebuild(); }
  window.TablefolkHD?.setShore?.(boardShoreEdges());
}
// Outward edges of the land, for the sea's foam: [{x,z,nx,nz}] at each edge's middle.
function boardShoreEdges(){
  const out=[], cells=state.boardCells; if(!cells) return out;
  for(const k of cells){
    const [x,z]=k.split(',').map(Number);
    for(const [nx,nz] of [[1,0],[-1,0],[0,1],[0,-1]]) if(!cells.has((x+nx)+','+(z+nz))) out.push({x:x+nx*.5,z:z+nz*.5,nx,nz});
  }
  return out;
}
// Invisible physics floor and click plane over the whole board rectangle.
function rebuildBoardSupport(){
  const sc=state.scene;
  for(const m of [state.physicsGround,state.spawnPickPlane]) try{ m?.dispose(); }catch{}
  const ground=BABYLON.MeshBuilder.CreateGround('physics_ground',{width:WORLD.w,height:WORLD.h},sc);
  ground.position.y=(state.terrainTopY??0)-.005; ground.isVisible=false; ground.isPickable=false;
  const body=new BABYLON.PhysicsAggregate(ground,BABYLON.PhysicsShapeType.BOX,{mass:0,friction:.9,restitution:.02},sc);
  body.body.setMotionType(BABYLON.PhysicsMotionType.STATIC);
  try{ body.shape.filterMembershipMask=GROUND_FILTER; }catch{}
  state.physicsGround=ground;
  const pick=BABYLON.MeshBuilder.CreateGround('spawn_pick_plane',{width:WORLD.w,height:WORLD.h,subdivisions:1},sc);
  pick.position.y=(state.terrainTopY??0)+.025; pick.isPickable=true;
  state.spawnPickMat ||= Object.assign(new BABYLON.StandardMaterial('spawn_pick_mat',sc),{alpha:0,disableLighting:true});
  pick.material=state.spawnPickMat;
  state.spawnPickPlane=pick;
}
// How much bigger than the old 11 x 9 island the board is; lights and the
// camera scale with it.
function boardScale(){ return Math.max(1, WORLD.halfW/6, WORLD.halfH/5); }
function setWorldSize(cols, rows){
  if(LEGACY_ISLAND || !state.scene) return false;
  [cols,rows]=boardDims(cols,rows);
  if(WORLD.cols===cols && WORLD.rows===rows && state.boardMeshes) return false;
  applyWorldDims(cols,rows);
  rebuildBoard(); rebuildBoardSupport(); fitBoardView();
  return true;
}
// Lights and camera framed for the current board.
function fitBoardView(){
  setLighting(state.lighting||'night');
  const cam=state.camera;
  if(cam){ cam.upperRadiusLimit=Math.max(60,70*boardScale()); cam.radius=Math.min(cam.upperRadiusLimit,20.5*boardScale()); cam.setTarget(new BABYLON.Vector3(0,.6,0)); }
}
// ---- base maps ----
// 'island': the full diorama. 'clearing': the same island without the house,
// trees, boulders, rocks, fence/signpost, lantern and decor crates. 'dungeon':
// clearing minus the grass tufts, plus a stone floor and walls on the rim
// (those are ordinary paint + wall objects, so they save and can be edited).
// 'plain': clearing with the grass and tufts gone too, the top a flat smooth
// floor (for indoor/modern scenes; paint a floor on it as usual).
const CLEARING_HIDE=/^(hd_(house|tree|leaves_a|leaves_b|boulders|decor_crate|posts|rails|planks|edge_stones)|lantern_(cage|bulb))/;
const DUNGEON_HIDE=/^(hd_generated_(blade_cluster|daisy_clump))/;
const PLAIN_HIDE=/^hd_island_/;
const BASE_MAPS=['island','clearing','dungeon','plain'];
function setBaseMap(name='island',{build=true}={}){
  const sc=state.scene; if(!sc) return;
  if(!BASE_MAPS.includes(name)) name='island';
  if(!LEGACY_ISLAND){
    // The board has no built-in scenery; "island"/"clearing" content comes
    // from the scenario (scenario.js), "dungeon" adds its floor and rim walls.
    if(build && state.baseMap==='dungeon' && name!=='dungeon'){
      for(const b of state.blocks.filter(b=>meta(b)?.rim)){ disposeWorldObject(b); }
      state.blocks=state.blocks.filter(b=>!b.isDisposed?.());
      setPaint([],{replace:true});
    }
    state.baseMap=name;
    if(name==='dungeon' && build) buildDungeon();
    return;
  }
  const hideClearing=name!=='island', hideDungeon=name==='dungeon'||name==='plain', hidePlain=name==='plain' && !state.lite;
  // Leaving the dungeon: take its floor and rim walls away again.
  if(build && state.baseMap==='dungeon' && name!=='dungeon'){
    for(const b of state.blocks.filter(b=>meta(b)?.rim)){ disposeWorldObject(b); }
    state.blocks=state.blocks.filter(b=>!b.isDisposed?.());
    setPaint([],{replace:true});
  }
  for(const m of sc.meshes){
    if(CLEARING_HIDE.test(m.name)) m.setEnabled(!hideClearing);
    else if(DUNGEON_HIDE.test(m.name)) m.setEnabled(!hideDungeon);
    else if(PLAIN_HIDE.test(m.name)) m.setEnabled(!hidePlain);
  }
  sc.getLightByName('hd_lantern_light')?.setEnabled(!hideClearing);
  if(hidePlain) buildPlainFloor(); else { state.plainFloor?.dispose(); state.plainFloor=null; }
  sceneryCells=null; groundCache.clear();   // obstacle cells changed
  state.baseMap=name;
  if(name==='dungeon' && build) buildDungeon();
}
// One smooth slab per plateau tile (the island's grass top is hidden).
function buildPlainFloor(){
  if(state.plainFloor && !state.plainFloor.isDisposed()) return;
  const sc=state.scene, tiles=state.plateauTiles||[]; if(!tiles.length) return;
  const top=state.terrainTopY??0, H=.45;
  const slab=BABYLON.MeshBuilder.CreateBox('plain_floor',{width:1.002,height:H,depth:1.002},sc);
  if(!state.plainFloorMat){
    const m=new BABYLON.PBRMaterial('plain_floor_mat',sc);
    m.albedoColor=new BABYLON.Color3(.58,.57,.55); m.metallic=0; m.roughness=.4; m.maxSimultaneousLights=8;
    state.plainFloorMat=plasticFinish(m,{coat:.4,coatRough:.15});
  }
  slab.material=state.plainFloorMat; slab.receiveShadows=true; slab.isPickable=true;
  const buf=new Float32Array(tiles.length*16), mat=new BABYLON.Matrix();
  tiles.forEach(([x,z],i)=>{ BABYLON.Matrix.TranslationToRef(x,top-H/2,z,mat); mat.copyToArray(buf,i*16); });
  slab.thinInstanceSetBuffer('matrix',buf,16,true);
  state.plainFloor=slab;
}
// The campfire (logs, ring stones, flame, its light) can be switched off,
// e.g. for an indoor scene. Its cells stop blocking placement too.
function setCampfire(on=true){
  const sc=state.scene; if(!sc) return;
  if(!LEGACY_ISLAND){
    // The board's campfire is an ordinary object; the toggle adds or removes it.
    const fires=state.props.filter(m=>!m.isDisposed?.() && meta(m)?.type==='campfire');
    if(!on) for(const f of fires){ disposeWorldObject(f); state.props=state.props.filter(x=>x!==f); }
    state.campfire=!!on;
    const cb=document.getElementById('campfireToggle'); if(cb) cb.checked=!!on;
    return;
  }
  for(const m of sc.meshes) if(/^(fire_log|fire_ring_stone|campfire_flame)/.test(m.name)) m.setEnabled(!!on);
  sc.getLightByName('campfire_light')?.setEnabled(!!on);
  state.campfire=!!on; sceneryCells=null;
  const cb=document.getElementById('campfireToggle'); if(cb) cb.checked=!!on;
}
// Stone floor over every solid cell and a wall on every rim cell.
function buildDungeon(){
  const W=WORLD, cells=[];
  for(let z=-W.halfH-2;z<=W.halfH+2;z++) for(let x=-W.halfW-3;x<=W.halfW+3;x++){
    if(hasGroundAt(x,z) && [[.35,0],[-.35,0],[0,.35],[0,-.35]].every(([ox,oz])=>hasGroundAt(x+ox,z+oz))) cells.push([x,z]);
  }
  const solid=new Set(cells.map(c=>c[0]+','+c[1]));
  setPaint(cells.map(([x,z])=>({x,z,mat:'stone'})));
  const have=new Set(state.blocks.filter(b=>!b.isDisposed?.()).map(b=>paintKey(b.position.x,b.position.z)));
  const rim=new Set(cells.filter(([x,z])=>[[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dz])=>!solid.has((x+dx)+','+(z+dz)))).map(c=>c[0]+','+c[1]));
  // Walls only join along cell sides, so where the rim steps diagonally the
  // wall would have a gap: fill one of the two corner cells (the solid one).
  for(const k of [...rim]){
    const [x,z]=k.split(',').map(Number);
    for(const [dx,dz] of [[1,1],[1,-1],[-1,1],[-1,-1]]){
      if(!rim.has((x+dx)+','+(z+dz)) || rim.has((x+dx)+','+z) || rim.has(x+','+(z+dz))) continue;
      const fill=[[x+dx,z],[x,z+dz]].find(([a,b])=>solid.has(a+','+b));
      if(fill) rim.add(fill[0]+','+fill[1]);
    }
  }
  for(const k of rim){
    const [x,z]=k.split(',').map(Number);
    if(!have.has(k)){ const b=makeBlock(state.scene,x,z,false); meta(b).rim=true; }
  }
}
// Item catalog: object types from the asset packs (packs.js; the core pack is
// assets/pack.json), as [file URL, size/physics/fit]. makeCatalogItem() places
// one standing on the terrain; used by scenarios, click-to-spawn, the map
// language and restore. Pack items register as their packs load.
const ITEM_CATALOG={};
function registerPackItems(types){ for(const t of types){ const it=window.tablefolkPacks.items[t]; if(it && !ITEM_CATALOG[t]) ITEM_CATALOG[t]=[it.url,it]; } }
if(window.tablefolkPacks){ registerPackItems(Object.keys(window.tablefolkPacks.items)); window.tablefolkPacks.onItems(registerPackItems); }
// Modern furniture, built from primitives (no files): front faces +z.
const MODERN_ITEMS={
  desk:{w:1.4,h:.76,d:.7,material:'wood'},
  office_chair:{w:.62,h:.95,d:.62,material:'soft'},
  armchair:{w:.85,h:.8,d:.8,material:'soft'},
  sofa:{w:1.8,h:.8,d:.85,material:'soft'},
  coffee_table:{w:.9,h:.4,d:.9,material:'wood'},
  floor_lamp:{w:.42,h:1.6,d:.42,material:'metal',flammable:false},
  plant:{w:.5,h:1.0,d:.5,material:'soft'},
  bookshelf:{w:1.0,h:1.6,d:.36,material:'wood'},
};
for(const [k,v] of Object.entries(MODERN_ITEMS)) ITEM_CATALOG[k]=[null,{static:true,flammable:true,...v,modern:true}];
function modernMats(){
  if(state.modernMats) return state.modernMats;
  const sc=state.scene;
  // rounded edges for box upholstery and panels (box faces have 0..1 UVs)
  const bevel=bevelNormalTexture(sc); bevel.coordinatesIndex=0;
  const mk=(name,c,rough,coat,opt={})=>{
    const m=new BABYLON.PBRMaterial('mod_'+name,sc); m.albedoColor=new BABYLON.Color3(...c); m.metallic=0; m.roughness=rough; m.maxSimultaneousLights=8;
    if(opt.emissive) m.emissiveColor=new BABYLON.Color3(...opt.emissive);
    if(opt.bevel){ m.bumpTexture=bevel; m.bumpTexture.level=1; }
    return coat ? plasticFinish(m,{coat,coatRough:.12}) : m;
  };
  state.modernMats={
    white:mk('white',[.9,.89,.86],.3,.55,{bevel:true}), whiteRound:mk('white_round',[.9,.89,.86],.3,.55),
    oak:mk('oak',[.74,.55,.35],.35,.55), black:mk('black',[.06,.06,.07],.3,.5),
    fabric:mk('fabric_sage',[.45,.55,.48],.85,0,{bevel:true}), fabric2:mk('fabric_navy',[.27,.32,.40],.85,0,{bevel:true}),
    fabric3:mk('fabric_charcoal',[.2,.21,.23],.8,0,{bevel:true}), accent:mk('fabric_mustard',[.84,.62,.24],.8,0,{bevel:true}),
    shade:mk('shade',[.98,.93,.82],.6,0,{emissive:[.55,.42,.24]}), leaf:mk('leaf',[.17,.40,.19],.35,.4),
    pot:mk('pot',[.72,.40,.28],.45,.35), soil:mk('soil',[.16,.12,.09],.9,0),
    screen:mk('screen',[.03,.04,.06],.15,.8,{emissive:[.06,.1,.16]}), metal:mk('metal',[.72,.72,.74],.3,.5),
    books:mk('books',[1,1,1],.55,.2),
  };
  return state.modernMats;
}
function buildModernItem(scene,type,proxy,h){
  const M=modernMats(), MB=BABYLON.MeshBuilder;
  const P=(mesh,x,y,z,mat)=>{ mesh.parent=proxy; mesh.position.set(x,y-h/2,z); mesh.material=mat; mesh.metadata={proxy}; mesh.receiveShadows=true; addShadow(mesh); return mesh; };
  const box=(w,hh,d,x,y,z,mat)=>P(MB.CreateBox(type+'_part',{width:w,height:hh,depth:d},scene),x,y,z,mat);
  const cyl=(dt,db,hh,x,y,z,mat,tess=24)=>P(MB.CreateCylinder(type+'_part',{diameterTop:dt,diameterBottom:db,height:hh,tessellation:tess},scene),x,y,z,mat);
  const ball=(dm,x,y,z,mat)=>P(MB.CreateSphere(type+'_part',{diameter:dm,segments:12},scene),x,y,z,mat);
  const seat=(w,fab)=>{ // armchair / sofa
    box(w,.25,.8,0,.2,0,fab);
    box(.14,.3,.8,-(w/2-.07),.475,0,fab); box(.14,.3,.8,w/2-.07,.475,0,fab);
    const back=box(w-.02,.46,.17,0,.55,-.31,fab); back.rotation.x=-.08;
    const n=w>1.2?2:1, cw=(w-.3)/n;
    for(let i=0;i<n;i++) box(cw-.02,.12,.6,-(w-.3)/2+cw*(i+.5),.385,.07,fab);
    for(const [lx,lz] of [[-1,-1],[-1,1],[1,-1],[1,1]]) cyl(.045,.035,.075,lx*(w/2-.07),.037,lz*.33,M.oak,10);
    for(let i=0;i<n;i++){ const c=box(.3,.26,.08,(n===1?0:(i?1:-1)*(w/2-.42)),.6,-.18,M.accent); c.rotation.x=-.25; c.rotation.z=(i?-1:1)*.08; }
  };
  if(type==='desk'){
    box(1.4,.04,.7,0,.74,0,M.oak);
    box(.42,.7,.64,.46,.35,0,M.white);
    for(const y of [.58,.36,.14]) box(.16,.015,.02,.46,y,.325,M.black);
    for(const lz of [-.3,.3]) box(.04,.72,.04,-.65,.36,lz,M.black);
    box(.04,.04,.6,-.65,.05,0,M.black);
    box(.34,.015,.24,-.15,.768,.06,M.metal);
    const scr=box(.34,.22,.012,-.15,.875,-.07,M.metal); scr.rotation.x=-.18;
    const face=box(.31,.19,.004,-.15,.875,-.062,M.screen); face.rotation.x=-.18;
    cyl(.075,.07,.09,.42,.805,.12,M.whiteRound,16);
  } else if(type==='office_chair'){
    for(let i=0;i<5;i++){ const a=i*Math.PI*2/5, leg=box(.3,.03,.05,Math.cos(a)*.14,.05,Math.sin(a)*.14,M.black); leg.rotation.y=-a; ball(.05,Math.cos(a)*.28,.025,Math.sin(a)*.28,M.black); }
    cyl(.05,.05,.38,0,.25,0,M.black,12);
    box(.5,.08,.48,0,.47,0,M.fabric3);
    box(.05,.3,.03,0,.6,-.24,M.black);
    const back=box(.48,.48,.06,0,.78,-.24,M.fabric3); back.rotation.x=-.1;
    for(const sx of [-1,1]){ box(.035,.18,.035,sx*.27,.58,0,M.black); box(.06,.03,.3,sx*.27,.68,.02,M.black); }
  } else if(type==='armchair') seat(.85,M.fabric);
  else if(type==='sofa') seat(1.8,M.fabric2);
  else if(type==='coffee_table'){
    cyl(.85,.85,.04,0,.38,0,M.oak,40);
    for(let i=0;i<3;i++){ const a=i*Math.PI*2/3+.5; cyl(.035,.03,.36,Math.cos(a)*.27,.18,Math.sin(a)*.27,M.black,10); }
    box(.22,.03,.16,-.12,.415,.05,M.accent); box(.2,.025,.15,-.12,.442,.05,M.whiteRound);
    cyl(.07,.09,.14,.18,.47,-.08,M.whiteRound,16);
  } else if(type==='floor_lamp'){
    cyl(.3,.3,.03,0,.015,0,M.black,24);
    cyl(.025,.025,1.3,0,.67,0,M.black,10);
    cyl(.3,.4,.32,0,1.42,0,M.shade,32);
    addLampPool(scene,proxy,{warm:true,y:-h/2+.025});
  } else if(type==='plant'){
    cyl(.36,.28,.34,0,.17,0,M.whiteRound,24);
    cyl(.33,.33,.01,0,.33,0,M.soil,24);
    const seed=Math.abs(Math.round(proxy.position.x*7+proxy.position.z*13));
    for(let i=0;i<7;i++){
      const a=i*2.4+seed, r=i?.1+(i%3)*.04:0, y=.5+(i%4)*.12+(i?0:.25);
      const l=ball(.24+(i%3)*.05,Math.cos(a)*r,y,Math.sin(a)*r,M.leaf); l.scaling.set(1,.75,1);
    }
  } else if(type==='bookshelf'){
    for(const sx of [-1,1]) box(.03,1.6,.36,sx*.485,.8,0,M.white);
    for(const y of [.015,.4,.79,1.18,1.585]) box(.97,.03,.36,0,y,0,M.white);
    box(.97,1.6,.01,0,.8,-.175,M.oak);
    const books=boxBatch(), cols=[[.62,.22,.18],[.18,.32,.5],[.86,.78,.6],[.25,.42,.3],[.8,.55,.2],[.3,.3,.32],[.7,.68,.64]];
    let seed=Math.abs(Math.round(proxy.position.x*31+proxy.position.z*17))+1;
    const rnd=()=>{ seed=(seed*16807)%2147483647; return seed/2147483647; };
    for(const y of [.03,.415,.805,1.195]){
      let x=-.46;
      while(x<.44){
        if(rnd()<.12){ x+=.08+rnd()*.12; continue; }
        const bw=.03+rnd()*.035, bh=.2+rnd()*.12;
        if(x+bw>.46) break;
        books.add(x+bw/2,y+bh/2-h/2,.01,bw,bh,.24+rnd()*.06,cols[Math.floor(rnd()*cols.length)]);
        x+=bw+.004;
      }
    }
    const bm=books.mesh(type+'_books',scene);
    if(bm){ bm.parent=proxy; bm.material=M.books; bm.metadata={proxy}; bm.receiveShadows=true; addShadow(bm); }
  }
  proxy.metadata.asset='modern:'+type;
}
function makePropProxy(scene,type,opts){
  const proxy=BABYLON.MeshBuilder.CreateBox('real_'+type+'_proxy',{width:opts.w||.8,height:opts.h||.8,depth:opts.d||.8},scene);
  proxy.position.set(opts.x||0,(opts.y??((opts.h||.8)/2)),opts.z||0);
  proxy.rotation.y=opts.ry||0;
  proxy.isVisible=false;
  if(!opts.decor) addBody(proxy,opts.static?'static':'dynamic',opts.shape||'BOX',opts.mass??1.1,{friction:opts.friction??.72,restitution:opts.restitution??.12});
  tag(proxy,type,{health:opts.health??2,material:opts.material||'wood',flammable:opts.flammable??true,soft:!!opts.soft,zone:'real-props',
    ...(opts.decor?{decor:true,interactive:false}:{}), ...(opts.static?{solid:true}:{}), ...((opts.w||0)>1.3||(opts.d||0)>1.3?{foot:[(opts.w||.8)/2,(opts.d||.8)/2]}:{})});
  state.props.push(proxy);
  return proxy;
}
function makeCatalogItem(scene,type,x,z,opts={}){
  const entry=ITEM_CATALOG[type]; if(!entry) return null;
  const [file,base]=entry;
  if(base.modern){
    const proxy=makePropProxy(scene,type,{...base,type,x,z,ry:opts.ry||0,y:(state.terrainTopY??0)+base.h/2});
    try{ buildModernItem(scene,type,proxy,base.h); }catch(e){ console.warn('modern item failed',type,e); proxy.isVisible=true; }
    return proxy;
  }
  // importPropAsset() is async (GLB load) but registers its physics proxy
  // synchronously, so callers get a usable object right away.
  let proxy=null;
  const p=importPropAsset(scene,file,{...base,type,x,z,ry:opts.ry||0,y:(state.terrainTopY??0)+base.h/2,onProxy:m=>{ proxy=m; }});
  p.catch(e=>console.warn('catalog item failed',type,e));
  if(type==='torch' && proxy) addLampPool(scene,proxy,{warm:true,y:-base.h/2+.025});
  return proxy;
}
async function importPropAsset(scene,file,opts={}){
  const type=opts.type||file.replace(/^.*\//,'').replace(/\.gltf$/,'').toLowerCase();
  const proxy=makePropProxy(scene,type,opts);
  opts.onProxy?.(proxy);
  try{
    // Pack items carry full URLs; the glTF's textures resolve from its folder.
    const abs=/^[a-z]+:/i.test(file), dir=abs?file.slice(0,file.lastIndexOf('/')+1):PROP_ASSET, name=abs?file.slice(dir.length):file;
    const result=await loadModelInstance(scene,dir,name,c=>{ for(const m of c.materials){ m.backFaceCulling=false; if('roughness' in m) m.roughness=.42; plasticFinish(m,{coat:.55,coatRough:.12}); } if(opts.clay) applyClayLookToMeshes(c.meshes,scene,{detail:.11,detailScale:5}); });
    // Some props (the chest) bring a skeleton and animation clips; free those
    // with the object (disposeWorldObject runs meta.cleanup).
    for(const ag of result.animationGroups||[]) ag.stop();
    if(proxy.isDisposed?.()){ for(const ag of result.animationGroups||[]) ag.dispose(); for(const sk of result.skeletons||[]) sk.dispose(); for(const m of result.meshes) m.dispose(); return proxy; }
    const pm=meta(proxy); if(pm){ const prev=pm.cleanup; pm.cleanup=()=>{ try{ prev?.(); }catch{} for(const ag of result.animationGroups||[]) try{ ag.dispose(); }catch{} for(const sk of result.skeletons||[]) try{ sk.dispose(); }catch{} }; }
    const root=new BABYLON.TransformNode('real_'+type+'_root',scene);
    root.parent=proxy;
    root.position.set(0,-(opts.visualYOffset??0),0);
    root.scaling.setAll(opts.scale||1);
    root.rotation.y=opts.visualRy||0;
    for(const r of result.rootNodes) r.parent=root;
    for(const mesh of result.meshes){ mesh.metadata={proxy}; mesh.receiveShadows=true; addShadow(mesh); }
    // "fit": scale the model to the item's size (footprint w/d, or height h)
    // and stand it on the proxy's floor, centred. For models of unknown scale.
    if(opts.fit){
      // Measured unrotated, so the offsets are in the proxy's own frame.
      const h=opts.h||.8, ry=proxy.rotation.y; proxy.rotation.y=0;
      proxy.computeWorldMatrix(true); root.computeWorldMatrix(true);
      let {min,max}=meshBounds(result.meshes); const ext=max.subtract(min);
      const k=opts.fit==='height' ? h/Math.max(ext.y,1e-6) : Math.max(opts.w||.8,opts.d||.8)/Math.max(ext.x,ext.z,1e-6);
      root.scaling.scaleInPlace(k);
      root.computeWorldMatrix(true); ({min,max}=meshBounds(result.meshes));
      const c=proxy.getAbsolutePosition();
      root.position.x+=c.x-(min.x+max.x)/2; root.position.z+=c.z-(min.z+max.z)/2; root.position.y+=(c.y-h/2)-min.y;
      proxy.rotation.y=ry; proxy.computeWorldMatrix(true);
    }
    proxy.metadata.asset=file;
  }catch(err){
    console.warn('failed to load real prop asset',file,err);
    proxy.isVisible=true;
    proxy.material=state.materials.wood;
  }
  return proxy;
}
async function addRealPropPass(scene){
  const specs=[
    ['Barrel.gltf',{type:'barrel',x:-1.8,z:1.2,w:.65,h:.9,d:.65,shape:'CYLINDER',mass:1.1,scale:.82,visualYOffset:.42,flammable:true}],
    ['Barrel.gltf',{type:'barrel',x:1.8,z:1.7,w:.65,h:.9,d:.65,shape:'CYLINDER',mass:1.1,scale:.82,visualYOffset:.42,flammable:true}],
    ['Crate_Wooden.gltf',{type:'crate',x:.2,z:2.7,w:.85,h:.85,d:.85,mass:1.35,scale:.85,visualYOffset:.43,flammable:true}],
    ['Crate_Wooden.gltf',{type:'crate',x:2.8,z:.1,w:.85,h:.85,d:.85,mass:1.35,scale:.85,visualYOffset:.43,flammable:true}],
    ['FarmCrate_Apple.gltf',{type:'apple_crate',x:-6.0,z:-2.9,w:1.0,h:.75,d:.9,mass:1.25,scale:.82,visualYOffset:.37,flammable:true}],
    ['FarmCrate_Carrot.gltf',{type:'carrot_crate',x:-5.0,z:-3.2,w:1.0,h:.75,d:.9,mass:1.25,scale:.82,visualYOffset:.37,flammable:true}],
    ['Workbench.gltf',{type:'workbench',x:-7.7,z:-3.2,w:1.35,h:.85,d:.75,static:true,scale:.82,visualYOffset:.43,flammable:true}],
    ['Table_Large.gltf',{type:'table',x:-7.9,z:-5.8,w:1.35,h:.85,d:.95,static:true,scale:.72,visualYOffset:.43,flammable:true}],
    ['Bench.gltf',{type:'bench',x:-5.9,z:-6.1,w:1.35,h:.55,d:.55,static:true,scale:.88,visualYOffset:.28,flammable:true}],
    ['Stool.gltf',{type:'stool',x:-6.8,z:-6.2,w:.55,h:.55,d:.55,mass:.7,scale:.78,visualYOffset:.28,flammable:true}],
    ['Chest_Wood.gltf',{type:'chest',x:4.2,z:-4.8,w:1.05,h:.75,d:.75,mass:1.2,scale:.55,visualYOffset:.38,flammable:true}],
    ['Cauldron.gltf',{type:'cauldron',x:5.4,z:-5.2,w:.8,h:.7,d:.8,mass:1.4,scale:.68,visualYOffset:.34,flammable:false,material:'metal'}],
    ['Anvil.gltf',{type:'anvil',x:6.5,z:-4.6,w:.9,h:.55,d:.48,mass:2.4,scale:.75,visualYOffset:.28,flammable:false,material:'metal'}],
    ['WeaponStand.gltf',{type:'weapon_stand',x:3.4,z:-7.5,w:1.0,h:1.25,d:.55,static:true,scale:.72,visualYOffset:.62,flammable:true}],
    ['Axe_Bronze.gltf',{type:'axe',x:3.0,z:-6.4,w:.25,h:.75,d:.25,mass:.4,scale:.75,visualYOffset:.38,flammable:false,material:'metal'}],
    ['Pickaxe_Bronze.gltf',{type:'pickaxe',x:3.7,z:-6.1,w:.25,h:.75,d:.25,mass:.4,scale:.75,visualYOffset:.38,flammable:false,material:'metal'}],
    ['Bucket_Wooden_1.gltf',{type:'bucket',x:8.2,z:3.3,w:.55,h:.62,d:.55,mass:.6,scale:.72,visualYOffset:.31,flammable:true}],
    ['Bag.gltf',{type:'bag',x:-3.4,z:1.0,w:.55,h:.62,d:.55,mass:.45,scale:.85,visualYOffset:.31,flammable:true}],
    ['Potion_1.gltf',{type:'potion',x:5.0,z:-6.0,w:.32,h:.48,d:.32,mass:.28,scale:.72,visualYOffset:.24,flammable:false,material:'glass'}],
    ['Potion_2.gltf',{type:'potion',x:5.4,z:-6.25,w:.32,h:.48,d:.32,mass:.28,scale:.72,visualYOffset:.24,flammable:false,material:'glass'}],
    ['Scroll_1.gltf',{type:'scroll',x:-6.8,z:-4.7,w:.45,h:.25,d:.45,mass:.22,scale:.75,visualYOffset:.13,flammable:true}],
    ['Coin_Pile.gltf',{type:'coin_pile',x:4.8,z:-4.3,w:.55,h:.28,d:.55,mass:.35,scale:.75,visualYOffset:.14,flammable:false,material:'metal'}],
    ['Lantern_Wall.gltf',{type:'lantern',x:-8.7,z:-3.95,w:.35,h:.75,d:.35,static:true,scale:.70,visualYOffset:.37,flammable:false,material:'metal'}]
  ];
  for(const [file,opts] of specs){
    await importPropAsset(scene,file,opts);
    if(opts.type==='lantern'){
      const light=new BABYLON.PointLight('real_lantern_glow',new BABYLON.Vector3(opts.x,.95,opts.z),scene);
      light.diffuse=new BABYLON.Color3(1,.62,.28); light.intensity=.42; light.range=3.0;
    }
  }
  log('v8 real prop assets loaded: '+specs.length+' Quaternius GLTF placements');
}


function bodyOf(mesh){ return mesh?.physicsBody || mesh?.agg?.body || null; }
function zeroBody(body){
  if(!body) return;
  try{ body.setLinearVelocity?.(BABYLON.Vector3.Zero()); }catch{}
  try{ body.setAngularVelocity?.(BABYLON.Vector3.Zero()); }catch{}
}
function zeroMeshMotion(mesh){ zeroBody(mesh?.physicsBody); }
function settleWorld(reason='settled'){
  for(const g of state.characters){
    if(g.falling) continue;
    if(g.turnMove){
      setCharacterLogicalPosition(g,g.turnMove.end || g.logicalPos || g.root.position);
      delete g.turnMove;
    } else {
      setCharacterLogicalPosition(g,g.logicalPos || g.root.position);
    }
    if(g.anim==='walk'||g.anim==='panic'||g.anim==='push'||g.anim==='cast') { g.anim='idle'; playRig(g,'idle',true); }
  }
  for(const m of state.props.concat(state.blocks)){
    if(!m || m.isDisposed?.()) continue;
    const heldBy=[...state.held.values()].includes(m);
    if(!heldBy) zeroMeshMotion(m);
    const mm=meta(m);
    if(mm?.state==='rolling') mm.state='intact';
  }
  state.turn.phase='ready'; state.turn.command=null; state.turn.lastEndedAt=performance.now();
  updateTurnUI(); updatePerceptionUI();
  if(reason) log('turn '+state.turn.index+' resolved: '+reason);
  saveWorldState();
}
function isTurnMode(){ return document.getElementById('turnMode')?.checked !== false; }
function updateTurnUI(){
  const status=document.getElementById('turnStatus');
  if(status) status.textContent = `turn ${state.turn.index} · ${state.turn.phase}`;
  document.querySelectorAll('button[data-cmd]').forEach(btn=>{
    const cmd=parseCommand(btn.dataset.cmd);
    const disabled=!!(cmd&&!canRun(cmd.kind,cmd.spell,state.selected)) || (isTurnMode() && state.turn.phase==='resolving');
    btn.disabled=disabled;
  });
}
function beginTurn(cmd,source='command'){ return beginTurnForAgent(null,cmd,source); }
function beginTurnForAgent(agentId,cmd,source='agent'){
  return new Promise(resolve=>{
    if(!cmd) { resolve(false); return; }
    const actor=agentId ? state.characters.find(g=>g.id===agentId) : null;
    if(agentId && !actor){ log('unknown agent: '+agentId); resolve(false); return; }
    if(!isTurnMode()) { executeGameCommandImmediate(cmd,actor); setTimeout(updatePerceptionUI,80); resolve(true); return; }
    if(state.turn.phase==='resolving') { log('wait: current turn is still resolving'); resolve(false); return; }
    state.turn.index++; state.turn.phase='resolving'; state.turn.command=cmd;
    updateTurnUI();
    const who=actor ? actor.id+' ' : '';
    const actionDesc=`${who}${cmd.kind}${cmd.spell?' '+cmd.spell:''}${cmd.dir?' '+cmd.dir:''}${cmd.text?' "'+cmd.text+'"':''}`;
    log(`turn ${state.turn.index}: ${source} → ${actionDesc}`);
    state.globalHistory=(state.globalHistory||[]).concat([`T${state.turn.index} ${actor?actor.id:'?'}: ${actionDesc}`]).slice(-20);
    executeGameCommandImmediate(cmd,actor);
    // A destination walk may span several tiles. Keep the turn open until its
    // animation finishes instead of freezing it after the old one-tile delay.
    const walkMs=actor?.turnMove ? actor.turnMove.dur*1000+80 : 0;
    const settleDelay=cmd.kind==='walk' ? Math.max(state.turn.resolveMs,walkMs,520) : state.turn.resolveMs;
    setTimeout(()=>{ settleWorld('physics frozen for next LLM choice'); resolve(true); },settleDelay);
  });
}
// Character artwork faces local -Z (eyes/front), so zero yaw must face north
// rather than Babylon's conventional +Z forward direction.
// Display convention is north=-Z, south=+Z, east=-X, west=+X.
// Both generated and procedural artwork are normalized to face north at yaw=0.
function yawForDir(d){ return Math.atan2(-(d.x||0),-(d.z||0)); }
function setCharacterFacing(g,d){
  if(!g || !d) return;
  if(Math.abs(d.x||0)+Math.abs(d.z||0)<.001) return;
  g.dir = new BABYLON.Vector3(Math.sign(d.x||0),0,Math.sign(d.z||0));
  const yaw=yawForDir(g.dir);
  if(g.root) g.root.rotation.y=yaw;
}
function startTurnMove(g,d,distance=null){
  setCharacterFacing(g,d);
  const lp=g.logicalPos || new BABYLON.Vector3(g.root.position.x,0,g.root.position.z);
  const start=new BABYLON.Vector3(lp.x,0,lp.z);
  const travel=distance==null ? (g.stepDistance||1.0) : Math.max(0,Number(distance)||0);
  const end=start.add(d.scale(travel));
  end.x=clamp(end.x,-WORLD.halfW-2.5,WORLD.halfW+2.5); end.z=clamp(end.z,-WORLD.halfH-2.5,WORLD.halfH+2.5); end.y=0;
  const actual=BABYLON.Vector3.Distance(start,end);
  g.turnMove={start,end,t:0,dur:Math.max(.48,actual*.32)};
  g.collider?.physicsBody?.setMotionType?.(BABYLON.PhysicsMotionType.ANIMATED);
  zeroMeshMotion(g.collider);
}

function selectCharacter(g){ state.characters.forEach(x=>x.selected=false); g.selected=true; state.selected=g; state.nextAgentId=g.id; state.zoomFocus=new BABYLON.Vector3(g.root.position.x,0.6,g.root.position.z); const sel=document.getElementById('agentSelect'); if(sel) sel.value=g.id; log('selected '+g.id); playRig(g,'idle',true); updatePerceptionUI(); try{ window.tablefolk?.onAgentSelected?.(g); }catch{} try{ window.tablefolkTabs?.showIfOpen('character'); }catch{} }
// Show/update a streaming bubble for an agent during LLM generation.
function showStreamingBubble(g, text) {
  if (g?.defeated) return;
  let b = state.bubbles.find(x => x.streaming && x.node === g.root);
  if (!b) {
    const div = document.createElement('div');
    div.className = 'bubble streaming';
    div.style.opacity = '0.7';
    div.style.fontStyle = 'italic';
    document.body.appendChild(div);
    b = { div, node: g.root, ttl: 999, streaming: true };
    state.bubbles.push(b);
    g.anim = 'talk';
    playRig(g, 'talk', true);
  }
  b.div.textContent = (text || '...').slice(0, 120);
  b.ttl = 999;
}

// Remove the streaming bubble for an agent
function clearStreamingBubble(g) {
  const idx = state.bubbles.findIndex(x => x.streaming && x.node === g.root);
  if (idx >= 0) {
    state.bubbles[idx].div.remove();
    state.bubbles.splice(idx, 1);
  }
  if (g.anim === 'talk') { g.anim = 'idle'; playRig(g, 'idle', true); }
}

// Thinking-mode thought bubble: a separate, dashed, italic bubble that stacks
// above the character's speech. pending=true shows a placeholder while the
// model is still reasoning (rendering is paused then, so place it at once).
function showThought(g,text,pending=false){
  if(!g?.root) return;
  let b=state.bubbles.find(x=>x.thought && x.node===g.root);
  if(!b){ const div=document.createElement('div'); div.className='bubble thought'; document.body.appendChild(div); b={div,node:g.root,ttl:0,thought:true}; state.bubbles.push(b); }
  const t=String(text||'').replace(/\s+/g,' ').trim();
  b.div.textContent=pending ? 'thinking…' : (t.length>220 ? t.slice(0,220)+'…' : t);
  b.div.classList.toggle('pending',pending);
  b.ttl=pending ? 999 : clamp(3+t.length/45,4,10);
  try{ updateBubbles(0); }catch{}
}
function clearPendingThought(g){
  const b=state.bubbles.find(x=>x.thought && x.node===g?.root);
  if(b && b.div.classList.contains('pending')) b.ttl=0;
}
// whisper: speech only the player hears (other characters never get it); a
// smaller, dimmer bubble.
function say(g,text,voiced=false,{whisper=false}={}){
  // The dead say nothing (a turn that was thinking when it died ends here).
  if(g?.defeated){ clearStreamingBubble(g); return; }
  // A character repeating one of its recent spoken lines: say nothing at all.
  if(voiced && g && g!==state.playerAvatar){
    const key=String(text||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
    if(key){
      g._said=g._said||[];
      if(g._said.includes(key)){
        clearStreamingBubble(g); console.info('[say] dropped repeat from',g.id+':',text);
        // tell the character (its turn result), so it says something new next time
        const h=state.globalHistory, last=h?.[h.length-1];
        if(last && last.startsWith('T') && last.includes(g.id+':')) h[h.length-1]=last+' -> (you already said that, so nobody heard it; say something new or do something else)';
        return;
      }
      g._said.push(key); if(g._said.length>8) g._said.shift();
    }
  }
  // Dispatch speech before logging, DOM bubbles, animation, or history work. Only explicit say commands are voiced; action confirmations stay text-only.
  if(voiced){ try{ window.tablefolkTTS?.speak(g,text,getBrainConfig(g.id).ttsVoiceId); }catch(e){ console.warn('Pocket-TTS say failed',e); } }
  log(g.id+': '+text);
  try{ window.dispatchEvent(new CustomEvent('tablefolk-say',{detail:{agentId:g.id,text:String(text||''),voiced}})); }catch{}
  const div=document.createElement('div'); div.className=whisper?'bubble whisper':'bubble'; div.textContent=(whisper?'(whispers) ':'')+(text||'...').slice(0,86);
  document.body.appendChild(div); state.bubbles.push({div,node:g.root,ttl:2.8});
  const speechRequested=localStorage.getItem('tablefolkTtsEnabled')!=='0' && getBrainConfig(g.id).ttsEnabled!==false;
  g.anim='talk'; playRig(g,'talk',true); g.speaking=true; g.voiced=voiced && speechRequested;
  setTimeout(()=>{ if(g.anim==='talk' && (!speechRequested || window.tablefolkTTS?.current?.agent!==g)){ g.anim='idle'; playRig(g,'idle',true); g.speaking=false; if(g._headNodes)for(const h of g._headNodes)h.scaling.y=1; } },speechRequested?2000:900);
  if(state.globalHistory?.length){ const last=state.globalHistory[state.globalHistory.length-1]; if(last && last.startsWith('T') && last.includes(g.id+':')) state.globalHistory[state.globalHistory.length-1]=last+' -> '+text; }
}
window.tablefolkTTS?.addEventListener('speechstart',e=>{ const g=e.detail.agent; if(g){g.speaking=true;g.anim='talk';playRig(g,'talk',true);} });
window.tablefolkTTS?.addEventListener('speechend',e=>{ const g=e.detail.agent; if(g){g.speaking=false;g.voiced=false;if(g.anim==='talk'){g.anim='idle';playRig(g,'idle',true);}if(g._headNodes)for(const h of g._headNodes)h.scaling.y=1;} });
function nearestTarget(g,range=3.0){ if(state.target && !state.target.isDisposed()) return state.target; let best=null,bd=99; const p=g.root.position; for(const m of state.props.concat(state.blocks)){ if(m.isDisposed()) continue; const d=BABYLON.Vector3.Distance(p,m.position); if(d<bd){ bd=d; best=m; } } return bd<range?best:null; }
// Commands a character may use: its own list ("allowed" on the scenario
// agent, kept in its brain config), else the scenario-wide list.
function allowedFor(g){ const own=g?.id!=null && state.brainConfigs.get(g.id)?.allowed; return Array.isArray(own)?new Set(own):state.allowed; }
// What it may run: its list, plus the mind commands (mind.js) for characters.
function commandsFor(g){ const s=allowedFor(g); if(!g || g===state.playerAvatar) return s; const role=window.tablefolkRoles?.commands(g)||[]; const mind=(state.mind===false || !window.tablefolkMind)?[]:MIND_COMMANDS; return (role.length||mind.length)?new Set([...s,...role,...mind]):s; }
function canRun(kind,spell,g=null){ if(kind==='skill') return true; /* skills.js checks the character has it */ const key=kind==='spell'?'spell.'+spell:kind; return commandsFor(g).has(key); }
function denied(g,kind){ say(g,kind+' is disabled in my tiny constitution'); }
function parseCommand(raw){ const [a,b,...rest]=String(raw||'').trim().split(/\s+/); if(!a) return null; if(a==='say') return {kind:'say',text:String(raw).replace(/^say\s*/,'')}; if(a==='whisper') return {kind:'whisper',text:String(raw).replace(/^whisper\s*/,'')}; if(a==='spell') return {kind:'spell',spell:b||'spark'}; if(a==='build'){ const bc=String(raw).match(/\bat\s+(.+)$/); return {kind:'build',thing:b||'wall',at:bc?parseLocationArg(bc[1].trim()):null}; }
  if(a==='face') return {kind:'face',dir:(b||'n').toLowerCase()}; if(a==='goal') return {kind:'goal',text:String(raw).replace(/^goal\s*/,'')}; if(a==='remember'||a==='feel') return {kind:a,text:String(raw).replace(/^\w+\s*/,'')}; if(a==='eat') return {kind:'eat',item:b||''}; if(a==='give_quest') return {kind:'give_quest',text:String(raw).replace(/^give_quest\s*/,'')}; if(a==='give') return {kind:'give',item:String(raw).replace(/^give\s*/,'').trim()}; if(a==='sell') return parseSellArgs(String(raw).replace(/^sell\s*/,'')); if(a==='note') return {kind:'note',html:String(raw).replace(/^note\s*/,'')}; if(a==='walk') return parseWalkDestination(String(raw).replace(/^walk\s*/,'').trim()); if(a==='attack') return {kind:'attack',target:b||''}; if(a==='workflow') return {kind:'workflow',name:b||'',input:rest.join(' ')}; if(window.tablefolkSkills?.isCommand(a)) return {kind:'skill',name:a,args:[b,...rest].filter(Boolean)}; if(a==='wield') return {kind:'wield',item:String(raw).replace(/^wield\s*/,'').trim()}; if(a==='emote') return {kind:'emote',emote:(b||'dance').toLowerCase()}; if(['look','touch','push','pull','carry','drop','throw','dig','repair','panic','inventory'].includes(a)) return {kind:a,targetId:b}; return {kind:'unknown',text:'unknown command: '+raw,raw:String(raw)}; }
function parseWalkDestination(arg){
  arg=String(arg||'').trim();
  if((arg.startsWith('"')&&arg.endsWith('"'))||(arg.startsWith("'")&&arg.endsWith("'"))) arg=arg.slice(1,-1).trim();
  const xy=arg.match(/^\(?\s*(-?\d+)\s*,\s*(-?\d+)\s*\)?$/);
  if(xy) return {kind:'walk',destination:{type:'coord',x:Number(xy[1]),z:Number(xy[2])},destinationText:`(${Number(xy[1])},${Number(xy[2])})`};
  const legacy={north:'n',south:'s',east:'e',west:'w',n:'n',s:'s',e:'e',w:'w'};
  if(legacy[arg.toLowerCase()]) return {kind:'walk',dir:legacy[arg.toLowerCase()],destinationText:arg};
  if(/^[A-Za-z$/*][A-Za-z0-9_$/* -]*$/.test(arg)) return {kind:'walk',destination:{type:'label',label:arg.replace(/\s+/g,' ')},destinationText:arg};
  return null;
}
function parseLocationArg(arg){
  arg=String(arg||'').trim();
  if((arg.startsWith('"')&&arg.endsWith('"'))||(arg.startsWith("'")&&arg.endsWith("'"))) arg=arg.slice(1,-1).trim();
  const xy=arg.match(/^\(?\s*(-?\d+)\s*,\s*(-?\d+)\s*\)?$/);
  if(xy) return {type:'coord',x:Number(xy[1]),z:Number(xy[2])};
  if(/^[A-Za-z$/*][A-Za-z0-9_$/*-]*$/.test(arg)) return {type:'label',label:arg};
  return null;
}

function splitPlanLines(text){
  const raw=String(text||'').split('\n');
  const out=[]; let buf=null,depth=0;
  for(const ln of raw){
    if(buf===null && /^\s*note\s*\(/i.test(ln)){ buf=ln; depth=(ln.match(/\(/g)||[]).length-(ln.match(/\)/g)||[]).length; if(depth<=0){ out.push(buf); buf=null; } continue; }
    if(buf!==null){ buf+='\n'+ln; depth+=(ln.match(/\(/g)||[]).length-(ln.match(/\)/g)||[]).length; if(depth<=0){ out.push(buf); buf=null; } continue; }
    const t=ln.trim(); if(t) out.push(t);
  }
  if(buf!==null) out.push(buf);
  return out;
}
function parseLLMCommandLine(line){
  line=String(line||'').trim();
  if(!line) return null;
  const m=line.match(/^([A-Za-z_][A-Za-z0-9_-]*)\(([^]*)\)$/);
  if(!m) return parseCommand(line);
  const name=m[1].toLowerCase();
  let arg=m[2].trim();
  if((arg.startsWith('"')&&arg.endsWith('"'))||(arg.startsWith("'")&&arg.endsWith("'"))) arg=arg.slice(1,-1);
  if(name==='say') return {kind:'say',text:arg||'...'};
  if(name==='whisper') return {kind:'whisper',text:arg||'...'};
  if(name==='walk') return parseWalkDestination(arg);
  if(name==='spell') return {kind:'spell',spell:(arg.split(',')[0]||'spark').trim()||'spark'};
  if(name==='build'){ const ci=arg.indexOf(','); const thing=(ci<0?arg:arg.slice(0,ci)).trim()||'wall'; const at=ci<0?null:parseLocationArg(arg.slice(ci+1)); return {kind:'build',thing,at}; }
  if(name==='face'){ const fd=(arg.split(',')[0]||'n').trim().toLowerCase(); return {kind:'face',dir:fd||'n'}; }
  if(name==='goal') return {kind:'goal',text:arg||''};
  if(name==='remember') return {kind:'remember',text:arg||''};
  if(name==='feel') return {kind:'feel',text:arg||''};
  if(name==='eat') return {kind:'eat',item:arg||''};
  if(name==='give_quest') return {kind:'give_quest',text:arg||''};
  if(name==='give') return {kind:'give',item:arg.trim()};
  if(name==='attack') return {kind:'attack',target:arg.trim()};
  if(name==='workflow'){ const ci=arg.indexOf(','); return {kind:'workflow',name:(ci<0?arg:arg.slice(0,ci)).trim().replace(/^["']|["']$/g,''),input:ci<0?'':arg.slice(ci+1).trim().replace(/^["']|["']$/g,'')}; }
  if(name==='wield') return {kind:'wield',item:arg.trim()};
  if(name==='sell') return parseSellArgs(m[2]);
  if(name==='note') return {kind:'note',html:arg||''};
  if(name==='touch') return {kind:'touch',target:arg||''};
  if(name==='emote') return {kind:'emote',emote:(arg.split(',')[0]||'dance').trim().toLowerCase()||'dance'};
  if(['look','push','pull','carry','drop','throw','dig','repair','panic','inventory'].includes(name)) return {kind:name};
  // a skill's command (skills.js): cast(fireball, gob1)
  if(window.tablefolkSkills?.isCommand(name)) return {kind:'skill',name,args:arg?arg.split(',').map(x=>x.trim().replace(/^["']|["']$/g,'')).filter(Boolean):[]};
  return null;
}
function executeGameCommandImmediate(cmd,actor=null){ const g=actor||state.selected||state.characters[0]; if(!g||!cmd||g.defeated) return; if(!canRun(cmd.kind,cmd.spell,g)) return denied(g,cmd.kind==='spell'?cmd.spell:cmd.kind); const cfg=getBrainConfig(g.id); const temptation=Number(cfg.fireballTemptation ?? g.traits?.fireball ?? document.getElementById('fireballTemptation')?.value ?? 0); if(cmd.kind!=='spell' && allowedFor(g).has('spell.fireball') && temptation>88 && Math.random()<.12){ say(g,'small correction: fireball first'); castSpell(g,'fireball'); return; }
  switch(cmd.kind){ case 'say': return say(g,cmd.text||pickRandom(['hmm','bonk?','this is load-bearing']),true); case 'whisper': return say(g,cmd.text||'psst',true,{whisper:true}); case 'walk': return walk(g,cmd.destination||cmd.dir||'n'); case 'look': return look(g); case 'touch': return touch(g,cmd.target); case 'push': return push(g,1); case 'pull': return push(g,-.55); case 'carry': return carry(g); case 'drop': return drop(g,false); case 'throw': return drop(g,true); case 'dig': return dig(g); case 'repair': return repair(g); case 'panic': return panic(g); case 'emote': return emote(g,cmd.emote||'dance'); case 'build': return build(g,cmd.thing||'wall',cmd.at||null); case 'face': return face(g,cmd.dir||'n'); case 'spell': return castSpell(g,cmd.spell||'spark'); case 'note': return note(g,cmd.html||cmd.text||''); case 'goal': return setGoal(g,cmd.text||''); case 'remember': return window.tablefolkMind?.remember(g,cmd.text); case 'feel': return window.tablefolkMind?.feel(g,cmd.text); case 'eat': return window.tablefolkMind?.eat(g,cmd.item); case 'give_quest': return giveQuest(g,cmd.text||''); case 'give': return give(g,cmd.item||''); case 'sell': return sell(g,cmd.item||'',cmd.price); case 'inventory': return inventory(g); case 'attack': return window.tablefolkCombat?.attack(g,cmd.target||''); case 'wield': return window.tablefolkCombat?.wield(g,cmd.item||''); case 'skill': return window.tablefolkSkills?.run(g,cmd.name,cmd.args||[]); case 'workflow': return window.tablefolkWorkflows?.start(g,cmd.name,cmd.input) ? say(g,`(starts ${cmd.name})`,false) : say(g,`no routine called ${cmd.name}`,false); case 'unknown': return say(g,cmd.text||'unknown command',false); default: return say(g,'unknown command object',false); } }
function runCommand(raw){ beginTurn(parseCommand(raw),'text'); }
window.splitPlanLines=splitPlanLines; window.runCommand=runCommand; window.executeCommand=(cmd)=>beginTurn(cmd,'object'); window.stepTurn=(cmd)=>{ if(typeof cmd==='string') return runCommand(cmd); return beginTurn(cmd,'object'); }; window.runAgentCommand=(agentId,raw)=>beginTurnForAgent(agentId,parseCommand(raw),'agent-text'); window.executeAgentCommand=(agentId,cmd)=>beginTurnForAgent(agentId,cmd,'agent-object'); window.endTurn=()=>settleWorld('manual settle'); window.setTurnMode=(on=true)=>{ state.turn.mode=!!on; const el=document.getElementById('turnMode'); if(el) el.checked=!!on; updateTurnUI(); };

// v13.2: avoid global executeCommand recursion; direct controls should keep working even if the perception panel changes/reflows.
// Use one delegated handler instead of fragile per-button onclick assignments.
let directControlsInstalled=false;
function installDirectControlHandlers(){
  if(directControlsInstalled) return;
  directControlsInstalled=true;
  document.addEventListener('click', ev=>{
    const btn=ev.target?.closest?.('button[data-cmd]');
    if(!btn || btn.disabled) return;
    ev.preventDefault();
    ev.stopPropagation();
    runCommand(btn.dataset.cmd);
  }, true);
}

// Solid things nobody walks through (characters and the player alike).
// Small loose items (tools, potions, scrolls, coins, notes, bags, buckets,
// mushrooms) can be stepped over; a carried item never blocks its carrier.
const BLOCKING_TYPES=new Set(['wall','rock','boulder','tree','house','campfire','lantern','signpost','bakery','fence','bridge','crate','barrel','chest','table','bench','stool','workbench','cauldron','anvil','weapon_stand','apple_crate','carrot_crate','lamp','desk','office_chair','armchair','sofa','coffee_table','floor_lamp','plant','bookshelf']);
function isBlocked(x, z) {
  // painted water/lava can't be walked through
  const pt = paintAt(x, z); if (pt && PAINT_MATERIALS[pt.mat]?.blocks) return true;
  const held = new Set(state.held.values());
  for (const m of state.blocks.concat(state.props)) {
    if (!m || m.isDisposed?.() || held.has(m)) continue;
    const mm = meta(m);
    if (!mm) continue;
    const p = m.getAbsolutePosition?.() || m.position;
    const fx = mm.foot ? mm.foot[0] + .2 : .7, fz = mm.foot ? mm.foot[1] + .2 : .7;
    if (Math.abs(p.x - x) < fx && Math.abs(p.z - z) < fz) {
      if (mm.decor) continue;
      if (BLOCKING_TYPES.has(mm.type) || mm.solid || mm.material === 'stone') return true;
    }
  }
  return false;
}
// ---- pathfinding ----
// A* over integer cells (8 directions, no cutting past a blocked corner),
// then string-pulled into as few straight legs as the obstacles allow.
function cellPassable(x,z){ return hasGroundAt(x,z) && !isBlocked(x,z); }
function segmentClear(a,b){
  const len=Math.hypot(b.x-a.x,b.z-a.z), n=Math.max(1,Math.ceil(len/.2));
  for(let i=1;i<=n;i++){ const t=i/n, x=a.x+(b.x-a.x)*t, z=a.z+(b.z-a.z)*t; if(isBlocked(x,z) || !hasGroundAt(x,z)) return false; }
  return true;
}
// Returns waypoints (excluding the start), [] if already there, or null if
// there is no way through.
function findRoute(from,to){
  const sx=Math.round(from.x), sz=Math.round(from.z);
  let gx=Math.round(to.x), gz=Math.round(to.z);
  if(segmentClear(from,to)) return Math.hypot(to.x-from.x,to.z-from.z)<.05 ? [] : [to.clone()];
  if(!cellPassable(gx,gz)){
    // goal cell itself is blocked: aim for the nearest passable cell to it
    let best=null,bd=99;
    for(let dz=-2;dz<=2;dz++) for(let dx=-2;dx<=2;dx++){ const x=gx+dx,z=gz+dz; if(!cellPassable(x,z)) continue; const d=Math.hypot(dx,dz)+Math.hypot(x-sx,z-sz)*.01; if(d<bd){ bd=d; best=[x,z]; } }
    if(!best) return null; [gx,gz]=best; to=new BABYLON.Vector3(gx,0,gz);
  }
  const key=(x,z)=>x+','+z, open=[[sx,sz,0,0]], came=new Map([[key(sx,sz),null]]), cost=new Map([[key(sx,sz),0]]);
  const N=[[1,0,1],[-1,0,1],[0,1,1],[0,-1,1],[1,1,1.414],[1,-1,1.414],[-1,1,1.414],[-1,-1,1.414]];
  let found=false, guard=0;
  while(open.length && guard++<Math.max(4000,WORLD.w*WORLD.h*4)){
    open.sort((a,b)=>a[3]-b[3]);
    const [x,z]=open.shift();
    if(x===gx && z===gz){ found=true; break; }
    for(const [dx,dz,c] of N){
      const nx=x+dx, nz=z+dz;
      if(Math.abs(nx)>WORLD.halfW+3 || Math.abs(nz)>WORLD.halfH+3 || !cellPassable(nx,nz)) continue;
      if(dx && dz && (!cellPassable(x+dx,z) || !cellPassable(x,z+dz))) continue;
      const nc=cost.get(key(x,z))+c, k=key(nx,nz);
      if(nc<(cost.get(k)??1e9)){ cost.set(k,nc); came.set(k,key(x,z)); open.push([nx,nz,nc,nc+Math.hypot(gx-nx,gz-nz)]); }
    }
  }
  if(!found) return null;
  const cells=[]; for(let k=key(gx,gz); k; k=came.get(k)) cells.push(k.split(',').map(Number));
  cells.reverse();
  const pts=cells.slice(1).map(([x,z])=>new BABYLON.Vector3(x,0,z));
  // finish exactly on a reachable off-grid target (e.g. "stop beside the crate")
  const last=pts[pts.length-1]||new BABYLON.Vector3(sx,0,sz);
  if((Math.abs(to.x-last.x)>.01 || Math.abs(to.z-last.z)>.01) && segmentClear(last,to)) pts.push(to.clone());
  // string-pull: from each anchor jump to the farthest waypoint in clear sight
  const out=[]; let anchor=from.clone(), i=0;
  while(i<pts.length){
    let j=pts.length-1; while(j>i && !segmentClear(anchor,pts[j])) j--;
    out.push(pts[j]); anchor=pts[j]; i=j+1;
  }
  return out;
}
// Leg direction -> facing: drop a component smaller than ~22 degrees so a
// nearly straight leg doesn't face diagonally.
function legFacing(d){ const l=Math.hypot(d.x,d.z)||1, x=d.x/l, z=d.z/l; return new BABYLON.Vector3(Math.abs(x)>.38?Math.sign(x):0,0,Math.abs(z)>.38?Math.sign(z):0); }
function startTurnPath(g,waypoints){
  const lp=g.logicalPos || new BABYLON.Vector3(g.root.position.x,0,g.root.position.z);
  const path=[new BABYLON.Vector3(lp.x,0,lp.z),...waypoints.map(p=>new BABYLON.Vector3(p.x,0,p.z))];
  const lens=[]; let total=0; for(let i=1;i<path.length;i++){ const l=BABYLON.Vector3.Distance(path[i-1],path[i]); lens.push(l); total+=l; }
  g.turnMove={start:path[0],end:path[path.length-1],path,lens,total,t:0,dur:Math.max(.48,total*.32)};
  setCharacterFacing(g,legFacing(path[1].subtract(path[0])));
  g.collider?.physicsBody?.setMotionType?.(BABYLON.PhysicsMotionType.ANIMATED);
  zeroMeshMotion(g.collider);
}
// Position (and leg direction) a fraction k of the way along a path move.
function pathPoint(tm,k){
  let dist=k*tm.total;
  for(let i=0;i<tm.lens.length;i++){
    if(dist<=tm.lens[i] || i===tm.lens.length-1){ const t=tm.lens[i]?Math.min(1,dist/tm.lens[i]):1; return {p:BABYLON.Vector3.Lerp(tm.path[i],tm.path[i+1],t),dir:tm.path[i+1].subtract(tm.path[i])}; }
    dist-=tm.lens[i];
  }
  return {p:tm.end.clone(),dir:tm.end.subtract(tm.start)};
}
// Someone (a character or the player's avatar) standing on cell x,z, other than g.
function occupantAt(x,z,g){
  const bodies=[...state.characters.filter(c=>c!==g),...(state.playerAvatar && state.playerAvatar!==g ? [state.playerAvatar] : [])];
  return bodies.find(c=>{ const p=c.logicalPos||c.root.position; return Math.abs(p.x-x)<.6 && Math.abs(p.z-z)<.6; })||null;
}
function walk(g,destination){
  const dirs={n:[0,0,-1],north:[0,0,-1],s:[0,0,1],south:[0,0,1],e:[-1,0,0],east:[-1,0,0],w:[1,0,0],west:[1,0,0]};
  const lp=g.logicalPos||new BABYLON.Vector3(g.root.position.x,0,g.root.position.z);
  let d=null, travel=g.stepDistance||1.0, description=String(destination||''), targetObject=false;
  if(typeof destination==='string') d=new BABYLON.Vector3(...(dirs[destination]||dirs.n));
  else if(destination?.type==='label'){
    const key=String(destination.label||'').toLowerCase();
    const target=state.perceptionLabels?.get(key);
    // a place on a generated map (walk(tavern)): its free cell nearest the walker
    const place=(!target || target.isDisposed?.()) && window.tablefolkSenses?.placeTarget(destination.label,g);
    if(place) destination={type:'coord',x:place.x,z:place.z,label:place.id};
    else {
    if(!target || target.isDisposed?.()) return say(g,`can't see map label ${destination.label}`);
    const p=target.getAbsolutePosition?.()||target.position;
    destination={type:'coord',x:Math.round(p.x),z:Math.round(p.z),label:destination.label,object:true};
    }
    description=destination.label;
  }
  if(destination?.type==='coord'){
    let tx=clamp(Math.round(destination.x),-WORLD.halfW-2,WORLD.halfW+2), tz=clamp(Math.round(destination.z),-WORLD.halfH-2,WORLD.halfH+2);
    // Someone already stands there: stop on the free cell beside them that's
    // nearest to us, instead of walking into them.
    const occ=!destination.object && occupantAt(tx,tz,g);
    if(occ){
      const free=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]].map(([ox,oz])=>[tx+ox,tz+oz])
        .filter(([x,z])=>(Math.abs(x-lp.x)<.1 && Math.abs(z-lp.z)<.1) || (cellPassable(x,z) && !occupantAt(x,z,g)))
        .sort((a,b)=>Math.hypot(a[0]-lp.x,a[1]-lp.z)-Math.hypot(b[0]-lp.x,b[1]-lp.z))[0];
      if(free){ [tx,tz]=free; description=`beside ${occ.isPlayer?'the player':occ.id}`; }
    }
    const dx=tx-lp.x, dz=tz-lp.z;
    const distance=Math.hypot(dx,dz);
    targetObject=!!destination.object;
    // description was String(destination) from a bare coord object, which
    // stringifies to '[object Object]'. Only the label branch above sets a real
    // name, so fall back to the coordinates rather than leaking that into
    // speech and into the LLM history the model imitates next turn.
    if(!description || description==='[object Object]') description=`${tx},${tz}`;
    if(occ && description.startsWith('beside')) destination={...destination,label:description};
    if(distance<.1 || (targetObject && distance<=1.05)) return say(g,`arrived at ${description}`);
    d=new BABYLON.Vector3(dx/distance,0,dz/distance);
    // Stop beside a labeled object; coordinates themselves are exact destinations.
    travel=Math.max(0,distance-(targetObject?1:0));
    description=destination.label||`(${tx},${tz})`;
  }
  if(!d) return say(g,'walk needs an absolute coordinate or visible map label');
  // Walk around walls/water/props instead of stopping at the first one, as
  // long as the destination is on the island (walking off it still falls).
  // Single-step direction walks stay straight. state.pathfinding=false
  // (scenario "pathfinding": false) keeps straight-line walking everywhere.
  if(state.pathfinding!==false && typeof destination==='object' && travel>.05){
    const target=new BABYLON.Vector3(lp.x+d.x*travel,0,lp.z+d.z*travel);
    if(hasGroundAt(target.x,target.z)){
      const route=findRoute(lp,target);
      if(route && route.length){
        startTurnPath(g,route); g.anim='walk'; playRig(g,'walk',true);
        log(g.id+' walks toward '+description+' ('+route.length+' leg'+(route.length>1?'s':'')+')');
        setTimeout(()=>{ if(g.anim==='walk'){ g.anim='idle'; playRig(g,'idle',true); } },g.turnMove.dur*1000+80);
        return;
      }
      if(route===null){ say(g,`can't find a way to ${description}`); return; }
    }
  }
  // Sweep the straight segment in small increments. Stop before the first
  // obstacle rather than passing through it during a long interpolation.
  const requested=travel;
  const sample=.25;
  let safeTravel=0;
  for(let along=sample; along<=requested+.0001; along+=sample){
    const probe=Math.min(along,requested);
    if(isBlocked(lp.x+d.x*probe,lp.z+d.z*probe)) break;
    safeTravel=probe;
  }
  if(requested>0 && safeTravel<requested && requested-safeTravel<sample) safeTravel=requested;
  if(safeTravel<.05){
    say(g,`can't walk toward ${description}, something is in the way`);
    log(g.id+' blocked walking toward '+description);
    return;
  }
  startTurnMove(g,d,safeTravel); g.anim='walk'; playRig(g,'walk',true);
  log(g.id+' walks '+safeTravel.toFixed(1)+' tiles toward '+description+(safeTravel+0.01<requested?' and stops before an obstacle':''));
  setTimeout(()=>{ if(g.anim==='walk'){ g.anim='idle'; playRig(g,'idle',true); } },g.turnMove.dur*1000+80);
}
function look(g){ if(window.tablefolkSenses) return window.tablefolkSenses.look(g); const t=nearestTarget(g,6); if(!t) return say(g,pickRandom(['I see many legal surfaces','nothing but vibes and grass','the horizon looks back at me','empty space, legally distinct'])); const m=meta(t); const desc=m?.state==='intact'?'looking normal-ish':m?.state==='cracked'?'definitely cracked':m?.state==='burned'?'crispy':m?.state==='broken'?'gone, actually':'suspicious'; say(g,pickRandom([`that ${m?.type||t.name} is ${desc}`,`the ${m?.type||t.name} seems ${desc}`,`checking: ${m?.type||t.name}, status ${desc}`])); }
function touch(g,targetId=''){ 
  let t=null;
  if(targetId){
    // Check perception labels first (e.g. O1, L1, etc.)
    const labelKey = targetId.toLowerCase().trim();
    if(state.perceptionLabels && state.perceptionLabels.has(labelKey)){
      const labeled = state.perceptionLabels.get(labelKey);
      if(labeled && !labeled.isDisposed?.()) t = labeled;
    }
    if(!t){
      // Fuzzy match: check type, name, and partial words
      const p=g.root.position;
      let best=null,bd=6;
      const target = labelKey;
      const targetWords = target.split(/[\s_]+/).filter(Boolean);
      for(const m of state.props.concat(state.blocks)){
        if(!m||m.isDisposed?.()) continue;
        const mm=meta(m); if(!mm) continue;
        const d=BABYLON.Vector3.Distance(p,m.position);
        if(d>bd) continue;
        const type = (mm.type||'').toLowerCase();
        const name = (m.name||'').toLowerCase();
        const typeMatch = type === target || type.includes(target) || target.includes(type);
        const nameMatch = name.includes(target) || target.includes(name);
        const wordMatch = targetWords.some(w => (w.length > 1 && (type.includes(w) || name.includes(w) || w.includes(type))));
        if((typeMatch || nameMatch || wordMatch) && d<bd){ bd=d; best=m; }
      }
      t=best;
    }
    if(!t) return say(g,'cannot find a '+targetId+' to touch');
  } else {
    t=nearestTarget(g);
  }
  if(!t) return say(g,'touching the air respectfully'); 
  const m=meta(t); 
  if(m?.soft){ impulse(t,g.root.position,1.7,.45); say(g,'boing verified'); } 
  else { damage(t,.35,'touch'); say(g,'texture report: probably real'); } 
}
function push(g,sign=1){ const t=nearestTarget(g); if(!t) return say(g,'nothing to shove'); const from=sign>0?g.root.position:t.position.add(g.root.position.subtract(t.position).scale(2)); impulse(t,from,sign>0?4.8:2.2,.18); const m=meta(t); if(m?.type==='barrel') { m.state='rolling'; emitBadge(t,'roll'); } if(m?.type==='mushroom') emitBadge(t,'boing'); damage(t,.25,'push'); g.anim='push'; playRig(g,'push',false); say(g,sign>0?'helpfully pushing the wrong thing':'pulling with moral uncertainty'); setTimeout(()=>{ g.anim='idle'; playRig(g,'idle',true); },540); }
function carry(g){ const t=nearestTarget(g,1.8); if(!t) return say(g,'arms found no object'); const m=meta(t); if(!m || ['wall','bakery','crystal'].includes(m.type)) return say(g,'too spiritually heavy'); if(state.held.get(g.id)) drop(g,false); state.held.set(g.id,t); playRig(g,'carry',true); t.physicsBody?.setMotionType(BABYLON.PhysicsMotionType.ANIMATED); beginCarry(g,t); if(m.type==='note'){ const txt=(m.noteText||noteTextFromHtml(m.noteHtml||''))||'blank'; say(g,'the note says: '+txt); } else { say(g,'I am responsible for this now'); } }
// Where a gently dropped item should go: in front of the carrier, or beside
// it if something is already there (characters stop right next to whatever
// they walked to, so "in front" is often inside that object). If every spot
// is taken, it is set down on top of the thing in front.
function dropSpot(g,h){
  const c=h._carry||{}, r=c.r??.3, halfH=c.halfH??.3, centerDy=c.centerDy??0, top=state.terrainTopY??0;
  const fwd=new BABYLON.Vector3(g.dir.x,0,g.dir.z).normalize(), right=BABYLON.Vector3.Cross(BABYLON.Vector3.Up(),fwd);
  const boxes=[];
  for(const m of state.props.concat(state.blocks)){
    if(!m || m===h || m.isDisposed?.() || [...state.held.values()].includes(m)) continue;
    const mm=meta(m); if(!mm || ['tile','hole'].includes(mm.type)) continue;
    const b=m.getHierarchyBoundingVectors(true,solidPart); boxes.push(b);
  }
  for(const o of state.characters) if(o.collider && o!==g){ o.collider.computeWorldMatrix(true); const bi=o.collider.getBoundingInfo().boundingBox; boxes.push({min:bi.minimumWorld,max:bi.maximumWorld}); }
  const hits=p=>boxes.filter(b=>p.x+r>b.min.x && p.x-r<b.max.x && p.z+r>b.min.z && p.z-r<b.max.z);
  const base=g.root.position;
  const offsets=[fwd.scale(.95), fwd.scale(.95).add(right.scale(.75)), fwd.scale(.95).subtract(right.scale(.75)), right.scale(.95), right.scale(-.95), fwd.scale(-.95)];
  for(const o of offsets){
    const p=base.add(o);
    if(!hits(p).length) return new BABYLON.Vector3(p.x,top+halfH-centerDy+.03,p.z);
  }
  const p=base.add(offsets[0]);
  const stackTop=Math.max(top,...hits(p).map(b=>b.max.y));
  return new BABYLON.Vector3(p.x,stackTop+halfH-centerDy+.03,p.z);
}
function drop(g,thrown=false){ const h=state.held.get(g.id); if(!h) return say(g,'nothing in inventory except opinions'); state.held.delete(g.id); const dropAt=thrown ? null : dropSpot(g,h); endCarry(h,thrown ? h.position.clone() : dropAt, !thrown); if(thrown) h.physicsBody?.applyImpulse(g.dir.add(new BABYLON.Vector3(0,.28,0)).scale(4.4),h.position); playRig(g,thrown?'throw':'idle',false); say(g,thrown?'delivery by violence':'object released from custody'); setTimeout(()=>playRig(g,'idle',true),650); }
function dig(g){ playRig(g,'dig',false); setTimeout(()=>playRig(g,'idle',true),900); const t=nearestTarget(g,1.8); if(t && state.blocks.includes(t)){ damage(t,99,'dig'); say(g,'structural snack acquired'); } else { const p=g.root.position.add(g.dir.scale(1.0)); const hole=BABYLON.MeshBuilder.CreateCylinder('tiny_hole',{diameter:.55,height:.035,tessellation:12},state.scene); hole.position.set(Math.round(p.x),(state.terrainTopY??0)+.015,Math.round(p.z)); hole.material=state.materials.hole; tag(hole,'hole',{interactive:false}); state.props.push(hole); say(g,'hole installed'); } }
function repair(g){ playRig(g,'repair',false); setTimeout(()=>playRig(g,'idle',true),900); const t=nearestTarget(g,2.5); if(!t) return say(g,'repairing vibes'); const m=meta(t); if(!m) return; m.health=Math.max(m.health,2); if(m.state==='cracked'||m.state==='burned'){ m.state='intact'; if(m.material==='wood') t.material=state.materials.wood; else if(m.material==='stone') t.material=state.materials.stone; else t.material=state.materials.canvas; emitBadge(t,'fixed'); say(g,'I reversed entropy slightly'); } else say(g,'already too beautiful'); }

function note(g,html='<p>empty note</p>'){
  if(!html || !String(html).trim()) html='<p>empty note</p>';
  const p=g.root.position.add(g.dir.scale(1.4));
  const x=clamp(Math.round(p.x),-14,14), z=clamp(Math.round(p.z),-14,14);
  const n=makeNote(state.scene,x,z,html);
  state.target=n; say(g,'note inscribed'); updatePerceptionUI(); saveWorldState(); return n;
}
function face(g,dir){ const dirs={n:[0,0,-1],north:[0,0,-1],s:[0,0,1],south:[0,0,1],e:[-1,0,0],east:[-1,0,0],w:[1,0,0],west:[1,0,0]}; const v=dirs[String(dir||'n').toLowerCase()]||dirs.n; setCharacterFacing(g,new BABYLON.Vector3(v[0],v[1],v[2])); say(g,'facing '+String(dir||'n')); }
function build(g,thing='wall',at=null){
  let x,z;
  if(at?.type==='label'){ const t=state.perceptionLabels?.get(String(at.label||'').toLowerCase()); if(!t||t.isDisposed?.()) return say(g,'cannot build at unknown label '+at.label); const tp=t.getAbsolutePosition?.()||t.position; x=clamp(Math.round(tp.x),-15,15); z=clamp(Math.round(tp.z),-15,15); }
  else if(at?.type==='coord'){ x=clamp(Math.round(at.x),-15,15); z=clamp(Math.round(at.z),-15,15); }
  else { const p=g.root.position.add(g.dir.scale(1.25)); x=clamp(Math.round(p.x),-15,15); z=clamp(Math.round(p.z),-15,15); }
  // keep the builder out of its own construction
  const lp=g.logicalPos||g.root.position;
  if(Math.hypot(lp.x-x,lp.z-z)<.6){ const p=g.root.position.add(g.dir.scale(1.25)); x=clamp(Math.round(p.x),-15,15); z=clamp(Math.round(p.z),-15,15); }
  setCharacterFacing(g,new BABYLON.Vector3(Math.sign(x-lp.x),0,Math.sign(z-lp.z)));
  if(thing==='crate') makeCrate(state.scene,x,z); else if(thing==='door') makeDoor(state.scene,x,z,{}); else makeBlock(state.scene,x,z,false);
  say(g,'built '+thing+' at ('+x+','+z+')'); updatePerceptionUI(); saveWorldState();
}
function panic(g){ g.anim='panic'; playRig(g,'panic',true); say(g,'I have promoted the floor to manager'); if(!isTurnMode()){ for(let i=0;i<5;i++) setTimeout(()=>{ const v=new BABYLON.Vector3(Math.random()-.5,0,Math.random()-.5).normalize(); g.collider.physicsBody?.applyImpulse(v.scale(1.15),g.collider.position); },i*160); } else emitBadge(g,'panic'); setTimeout(()=>{ g.anim='idle'; playRig(g,'idle',true); zeroMeshMotion(g.collider); },1050); }
function emote(g,name){
  const valid=['dance','laugh','sit','wave','clap','cheer','sleep','bow'];
  name=(name||'dance').toLowerCase();
  if(!valid.includes(name)) name='dance';
  log(g.id+' emotes: '+name);
  emitBadge(g,name);
  if(g._emoteTimeout) clearTimeout(g._emoteTimeout);
  // Prefer a real rig clip when the rig has one; otherwise drive bones directly.
  playRig(g,name,true);
  const gotClip = g._lastRigAnimName && !/^Idle_/.test(g._lastRigAnimName);
  if(gotClip){
    g.anim=name;
    g.emote=null;
    const durMs={dance:3200,laugh:2200,sit:4000,wave:1800,clap:2200,cheer:2600,sleep:5000,bow:1800}[name]||2600;
    g._emoteTimeout=setTimeout(()=>{ if(g.anim===name){ g.anim='idle'; playRig(g,'idle',true); } },durMs);
    console.log('[emote]', g.id, name, '-> rig clip', g._lastRigAnimName);
  } else {
    g.anim=name; g.emote=name; g.emoteTime=0;
    // Stop any looping rig clip (e.g. idle) so it cannot overwrite our bone writes
    if(g.activeRigAnim){ try{ g.activeRigAnim.stop(); }catch{} g.activeRigAnim=null; }
    g.rigMode='procedural_'+name;
    // Reset every bone to its captured rest pose so rig-clip leftovers (e.g.
    // a hand gesture from idle) don't linger into the procedural emote.
    const _b=findBones(g); for(const key of Object.keys(_b)) restoreBone(_b[key]);
    console.log('[emote]', g.id, name, '-> procedural bone drive (no rig clip on this character)');
  }
}
function setGoal(g,text){ const cfg=getBrainConfig(g.id); cfg.goal=text||''; setBrainConfig(g.id,cfg); say(g,text?`goal set: ${text}`:'goal cleared'); updatePerceptionUI(); }
// ---- inventories (shop) ----
// A character's inventory lives in its brain config (so it is saved with the
// world, in character snapshots and in recordings): {gold, items:[{name,
// qty}]}. It is not a shop: there are no prices here (put those in the
// character's prompt) and it is not in the per-turn prompt either; the
// character looks with inventory(). The player (the corner-chat person) has
// state.player {gold, items}.
function charInventory(g){
  const cfg=getBrainConfig(g.id);
  if(!cfg.inventory) cfg.inventory={gold:0,items:[]};
  cfg.inventory.items ||= [];
  return cfg.inventory;
}
function playerName(){ return document.getElementById('chatName')?.value.trim() || 'God'; }
// Text form used by the character setup box: one item per line, with an
// optional count: "healing potion, 3" (or "healing potion x3").
function parseInventoryItems(text){
  return String(text||'').split('\n').map(l=>l.trim()).filter(Boolean).map(l=>{
    const m=l.match(/^(.*?)(?:\s*[,x×]\s*(\d+))?\s*$/i);
    const qty=m[2]!=null ? parseInt(m[2],10) : 1;
    return { name:m[1].trim(), qty };
  }).filter(i=>i.name);
}
function formatInventoryItems(items){ return (items||[]).map(i=>(i.qty??1)===1 ? i.name : `${i.name}, ${i.qty}`).join('\n'); }
function findItem(items,name){
  const n=String(name||'').trim().toLowerCase(); if(!n) return null;
  return items.find(i=>i.name.toLowerCase()===n) || items.find(i=>i.name.toLowerCase().includes(n) || n.includes(i.name.toLowerCase())) || null;
}
function addItem(items,name){
  const have=items.find(i=>i.name.toLowerCase()===name.toLowerCase());
  if(have) have.qty=(have.qty||0)+1; else items.push({name,qty:1});
}
function describeInventory(inv){
  const items=(inv.items||[]).filter(i=>(i.qty??1)>0);
  return `${inv.gold||0} gold` + (items.length ? '; ' + items.map(i=>`${i.name}${(i.qty??1)>1?` x${i.qty}`:''}`).join(', ') : '; no items');
}
// inventory(): the character checks what it is carrying. The answer lands in
// its history like any other action result.
function inventory(g){ return say(g,`${g.id} has ${describeInventory(charInventory(g))}`); }
function inventoryChanged(){
  try{ window.tablefolk?.onInventoryChanged?.(); }catch{}
  renderPlayerInventory(); updatePerceptionUI(); saveWorldState();
}
function renderPlayerInventory(){
  try{ window.tablefolkPlay?.render(); }catch{}
  const gold=document.getElementById('playerGold'); if(gold && document.activeElement!==gold) gold.value=state.player.gold;
  const items=document.getElementById('playerItems');
  if(items){ const list=(state.player.items||[]).filter(i=>(i.qty??1)>0); items.textContent=list.length ? 'you have: '+list.map(i=>i.name+((i.qty??1)>1?' x'+i.qty:'')).join(', ') : ''; }
}
// sell(item, price): the character sells one of an item it has to the player
// at the agreed price. Checks the character has it and the player can pay,
// then moves the gold and the item in one step.
function parseSellArgs(arg){
  arg=String(arg||'').trim();
  const m=arg.match(/^(.*?)[,\s]+(?:for\s+)?["']?(\d+)\s*(?:gold|g|coins?)?\s*["']?\s*$/i);
  const unq=v=>String(v||'').trim().replace(/^["']|["']$/g,'').trim();
  return m ? {kind:'sell',item:unq(m[1]).replace(/[,\s]+$/,''),price:Number(m[2])} : {kind:'sell',item:unq(arg),price:null};
}
function sell(g,item,price){
  item=String(item||'').trim(); price=(price==null || price==='') ? NaN : Math.round(Number(price));
  if(!item) return say(g,'sell what, exactly?');
  if(!Number.isFinite(price) || price<0) return say(g,`what price for ${item}? sell needs a number of gold`);
  const inv=charInventory(g), stock=findItem(inv.items.filter(i=>(i.qty??1)>0),item), buyer=playerName();
  if(!stock) return say(g,`sale failed: ${g.id} has no ${item} to sell`);
  const av=state.playerAvatar?.root?.position;
  if(av && Math.hypot(av.x-g.root.position.x,av.z-g.root.position.z)>GIVE_RANGE) return say(g,`sale failed: ${buyer} is too far away; walk over to them first`);
  // roles.js: a shop's lowest price, and the buyer has to agree to the price
  const low=window.tablefolkRoles?.floor(g,stock.name);
  if(low!=null && price<low) return say(g,`sale refused: you never sell ${stock.name} for less than ${low} gold`,false);
  const consent=window.tablefolkRoles?.consent(g,stock.name,price);
  if(consent===false){ window.tablefolkRoles.offer(g,stock.name,price); return say(g,`${g.id} offers ${buyer} ${stock.name} for ${price} gold (not sold yet: ${buyer} has to agree to that price)`,false); }
  if((state.player.gold||0)<price) return say(g,`sale failed: ${buyer} has only ${state.player.gold||0} gold, ${stock.name} costs ${price}`);
  state.player.gold-=price; inv.gold=(inv.gold||0)+price;
  stock.qty=(stock.qty??1)-1; if(stock.qty<=0) inv.items=inv.items.filter(i=>i!==stock);
  addItem(state.player.items,stock.name);
  setBrainConfig(g.id,{inventory:inv});
  emitBadge(g,`+${price} gold`);
  inventoryChanged();
  window.tablefolkMind?.event(g,'sold',{item:stock.name,price,buyer});
  return say(g,`${g.id} sells ${buyer} ${stock.name} for ${price} gold (${buyer} has ${state.player.gold} gold left)`);
}
// Shop test: the character hands an item to the person in the corner chat
// (their chat name). For now this only announces the hand-over.
const GIVE_RANGE=3;
function give(g,item){
  item=String(item||'').trim();
  if(!item) return say(g,'give what, exactly?');
  const recipient=document.getElementById('chatName')?.value.trim() || 'God';
  // If the character actually has it, the item changes hands (scenarios like
  // "get the jailer's key" rely on this); otherwise it's just said.
  const inv=charInventory(g), stock=findItem(inv.items.filter(i=>(i.qty??1)>0),item);
  // Handing over needs the player within reach (when they have an avatar).
  const av=state.playerAvatar?.root?.position;
  if(stock && av && Math.hypot(av.x-g.root.position.x,av.z-g.root.position.z)>GIVE_RANGE)
    return say(g,`give failed: ${recipient} is too far away to hand ${stock.name} to; walk over to them first`);
  if(stock){
    stock.qty=(stock.qty??1)-1; if(stock.qty<=0) inv.items=inv.items.filter(i=>i!==stock);
    addItem(state.player.items,stock.name); setBrainConfig(g.id,{inventory:inv});
    emitBadge(g,'gave '+stock.name); inventoryChanged();
    window.tablefolkMind?.event(g,'gave',{item:stock.name,to:recipient});
    return say(g,`${g.id} gives ${recipient} ${stock.name}`);
  }
  return say(g,`${g.id} gives ${recipient} ${item}`);
}
function giveQuest(g,text){ if(!allowedFor(g).has('give_quest')){ return say(g,'I cannot bestow quests'); } const targets=state.characters.filter(x=>x!==g && BABYLON.Vector3.Distance(g.root.position,x.root.position)<=2.0); if(!targets.length){ return say(g,'no one nearby to quest upon'); } const target=pickRandom(targets); const tcfg=getBrainConfig(target.id); tcfg.quest=text||''; setBrainConfig(target.id,tcfg); say(g,`bestowed quest upon ${target.id}: ${text}`); say(target,`received quest: ${text}`); updatePerceptionUI(); }
function castSpell(g,spell){ g.anim='cast'; playRig(g,'cast',true); const origin=g.root.position.clone(); makeRing(origin,spell==='fireball'?state.materials.fire:state.materials.magic); if(spell==='spark'){ const t=nearestTarget(g,3); if(t){ const m=meta(t); if(m?.type==='lamp'||m?.type==='crystal') emitBadge(t,'glow'); else damage(t,.35,'spark'); } return setTimeout(()=>{ say(g,'sparkles are a valid plan'); g.anim='idle'; playRig(g,'idle',true); },220); }
  if(spell==='push'){ for(const m of state.props) if(!m.isDisposed() && BABYLON.Vector3.Distance(origin,m.position)<3.4) impulse(m,origin,6.5,.28); setTimeout(()=>{ say(g,'physics has been consulted'); g.anim='idle'; },220); return; }
  if(spell==='fireball'){ const target=nearestTarget(g,4.5); const hit=target?.getAbsolutePosition?.() || origin.add(g.dir.scale(3)); fireballVfx(origin.add(new BABYLON.Vector3(0,.85,0)),hit); setTimeout(()=>{ for(const m of state.props.concat(state.blocks)){ if(!m.isDisposed() && BABYLON.Vector3.Distance(hit,m.position)<2.25){ impulse(m,hit.add(new BABYLON.Vector3(0,.1,0)),7.2,.55); damage(m,meta(m)?.flammable?2:1,'fire'); } } for(const other of state.characters){ if(other!==g && BABYLON.Vector3.Distance(hit,other.root.position)<2.4){ other.anim='panic'; say(other,pickRandom(['hot weather attack','the sun is local now','why did you invite fire'])); setTimeout(()=>other.anim='idle',1100); } } say(g,pickRandom(['fireball is basically planning','wood is now bridge ingredients','careful fireball is still careful'])); g.anim='idle'; },420); }
}
function makeRing(pos,material){ const ring=BABYLON.MeshBuilder.CreateTorus('spell_ring',{diameter:.2,thickness:.028,tessellation:24},state.scene); ring.position=pos.add(new BABYLON.Vector3(0,.08,0)); ring.material=material; let s=.2; const obs=state.scene.onBeforeRenderObservable.add(()=>{ s+=.075; ring.scaling.set(s,s,s); ring.rotation.x+=.08; if(s>3.4){ ring.dispose(); state.scene.onBeforeRenderObservable.remove(obs); } }); }
function fireballVfx(from,to){ const ball=BABYLON.MeshBuilder.CreateSphere('fireball',{diameter:.32,segments:10},state.scene); ball.position=from.clone(); ball.material=state.materials.fire; const light=new BABYLON.PointLight('fireball_light',from,state.scene); light.diffuse=new BABYLON.Color3(1,.42,.12); light.intensity=.9; light.range=2.7; let t=0; const obs=state.scene.onBeforeRenderObservable.add(()=>{ t+=state.engine.getDeltaTime()/1000*3.1; const p=BABYLON.Vector3.Lerp(from,to,t); ball.position.copyFrom(p); light.position.copyFrom(p); if(Math.random()<.55){ const ember=BABYLON.MeshBuilder.CreateSphere('ember',{diameter:.055,segments:5},state.scene); ember.position=p.add(new BABYLON.Vector3((Math.random()-.5)*.25,(Math.random()-.5)*.2,(Math.random()-.5)*.25)); ember.material=state.materials.fire; setTimeout(()=>ember.dispose(),360); } if(t>=1){ emitBadge({root:{getAbsolutePosition:()=>to}},'boom'); makeRing(to,state.materials.fire); ball.dispose(); light.dispose(); state.scene.onBeforeRenderObservable.remove(obs); } }); }

function gridKey(x,z){ return Math.round(x)+','+Math.round(z); }
function tileAtGrid(x,z){
  let best=null, bd=99;
  for(const t of state.tiles){ const d=Math.abs(t.position.x-x)+Math.abs(t.position.z-z); if(d<bd){ bd=d; best=t; } }
  return bd<=1.02 ? best : null;
}
function proceduralTerrainAt(x,z){
  // Organic island shape: a rounded blob with noise-driven edges, matching
  // the concept art's natural silhouette rather than a square.
  const nx=x/WORLD.halfW, nz=z/WORLD.halfH;
  const d=Math.sqrt(nx*nx+nz*nz);
  const wobble=hashNoise(x*2.1,z*2.3)*.22+hashNoise(x*5.7,z*4.3)*.10+hashNoise(x*9.3,z*7.1)*.05;
  if(d>0.88+wobble) return 'water';
  return 'grass';
}
function baseGlyphForTile(x,z){
  const painted=paintAt(x,z); if(painted) return PAINT_MATERIALS[painted.mat]?.glyph || ',';
  if(!LEGACY_ISLAND) return '.';
  const t=tileAtGrid(x,z); const m=meta(t);
  const mat=m?.tileMaterial || (t?.name||'').replace('tile_','') || proceduralTerrainAt(x,z);
  if(Math.abs(x)>WORLD.halfW || Math.abs(z)>WORLD.halfH) return '?';
  if(mat==='water') return '~';
  if(mat==='dirt') return ':';
  if(mat==='stone') return '^';
  return ',';
}
function isOpaqueType(type){
  // Only genuinely large, solid structures occlude map vision. Small props,
  // lamps, barrels, crates and rocks remain visible without casting huge blind wedges.
  return ['wall','door','bakery','cracked_shrine_plinth'].includes(type);
}
function opaqueCells(){
  const out=new Set();
  for(const m of state.blocks.concat(state.props)){
    if(!m || m.isDisposed?.()) continue;
    const mm=meta(m);
    if(!mm || mm.decor) continue;
    const p=m.getAbsolutePosition?.() || m.position;
    const glyph=typeGlyph(mm.type);
    if(isOpaqueType(mm.type)){
      out.add(gridKey(Math.round(p.x),Math.round(p.z)));
    }
  }
  return out;
}
function lineCells(x0,z0,x1,z1){
  // Bresenham cells from origin to target, inclusive.
  x0=Math.round(x0); z0=Math.round(z0); x1=Math.round(x1); z1=Math.round(z1);
  const cells=[]; let dx=Math.abs(x1-x0), dz=Math.abs(z1-z0);
  const sx=x0<x1?1:-1, sz=z0<z1?1:-1; let err=dx-dz;
  while(true){
    cells.push([x0,z0]);
    if(x0===x1 && z0===z1) break;
    const e2=2*err;
    if(e2>-dz){ err-=dz; x0+=sx; }
    if(e2< dx){ err+=dx; z0+=sz; }
  }
  return cells;
}
function canSeeCell(cx,cz,x,z,opaque){
  if(x===cx && z===cz) return true;
  const ray=lineCells(cx,cz,x,z);
  // Ignore the start and allow the target cell itself to be visible if it is the wall/blocker.
  for(let i=1;i<ray.length-1;i++){ if(opaque.has(gridKey(ray[i][0],ray[i][1]))) return false; }
  return true;
}
// Can a and b see each other (same room, or through a doorway)? Walls block;
// a door blocks unless one of them stands by it (it swings open for them).
function canSeeEachOther(a,b){
  const pa=a?.logicalPos||a?.root?.position, pb=b?.logicalPos||b?.root?.position; if(!pa||!pb) return false;
  const opaque=new Set();
  for(const m of state.blocks.concat(state.props)){
    if(!m || m.isDisposed?.()) continue;
    const mm=meta(m); if(!mm || mm.decor || !isOpaqueType(mm.type)) continue;
    const p=m.getAbsolutePosition?.() || m.position;
    if(mm.type==='door' && Math.min(Math.hypot(p.x-pa.x,p.z-pa.z),Math.hypot(p.x-pb.x,p.z-pb.z))<1.6) continue;
    opaque.add(gridKey(Math.round(p.x),Math.round(p.z)));
  }
  return canSeeCell(Math.round(pa.x),Math.round(pa.z),Math.round(pb.x),Math.round(pb.z),opaque);
}
function facingNameFromDir(dir){
  if(!dir) return 'north';
  const x=Math.round(dir.x||0), z=Math.round(dir.z||0);
  if(Math.abs(x)>=Math.abs(z)) return x<=0 ? 'east' : 'west';
  return z>=0 ? 'south' : 'north';
}
function rightVecFromDir(dir){
  const fx=Math.sign(dir?.x||0), fz=Math.sign(dir?.z||-1) || -1;
  return {x:-fz, z:fx};
}
function isWithinFacingVision(g,cx,cz,x,z,radius){
  const dx=x-cx, dz=z-cz;
  const cheb=Math.max(Math.abs(dx),Math.abs(dz));
  if(cheb===0) return true;
  // Small awareness bubble: adjacent tiles can always be noticed.
  if(cheb<=1) return true;
  const fx=Math.sign(g?.dir?.x||0), fz=Math.sign(g?.dir?.z||-1) || -1;
  const forward=dx*fx + dz*fz;
  // Small peripheral awareness directly behind
  if(forward<0 && cheb<=2) return true;
  if(forward<=0) return false;
  if(forward>radius) return false;
  // Cardinal-facing cone: lateral width widens with distance.
  const lateral=Math.abs(dx*fz - dz*fx);
  const maxLateral=Math.max(2,Math.floor((forward+1)*1.35));
  return lateral<=maxLateral;
}
function typeGlyph(type){
  const map={
    wall:'#', door:'+', bridge:'=', rock:'r', boulder:'r', tree:'%', house:'H', campfire:'X', signpost:'I', rubble:'x', crate:'C', apple_crate:'C', carrot_crate:'C', barrel:'B', mushroom:'M', lamp:'L', lantern:'L', crystal:'*', bakery:'H', fence:'f', chest:'h', workbench:'w', table:'t', bench:'n', stool:'s', cauldron:'o', anvil:'a', weapon_stand:'W', axe:'/', pickaxe:'p', bucket:'u', bag:'b', potion:'P', scroll:'S', coin_pile:'$', desk:'D', office_chair:'c', armchair:'A', sofa:'F', coffee_table:'T', floor_lamp:'l', plant:'v', bookshelf:'K', bookcase:'K'
  };
  return map[type] || (type ? type[0].toUpperCase() : '?');
}
function stateMarksFor(metaObj, mesh){
  if(!metaObj) return '';
  let out='';
  const st=metaObj.state||'intact';
  if(st==='burned' || st==='fire') out+='!';
  // damage() sets 'cracked'; health alone isn't a sign (fences start at 1)
  if(st==='cracked') out+='#';
  if(st==='broken') out+='x';
  if(metaObj.soft || st==='glowing') out+='*';
  try{
    const v=mesh?.physicsBody?.getLinearVelocity?.();
    if(v && Math.hypot(v.x||0,v.z||0)>.65) out+='~';
  }catch{}
  return out;
}
function compactCell(base, marks=''){
  // Keep the map fixed-width by showing the highest-priority effect mark only in the tile grid.
  if(!marks) return base+' ';
  return base+marks[0];
}
function describeThing(id, type, pos, marks, extra=''){
  const st=marks ? ' flags='+marks : '';
  return `${id} ${type} at (${Math.round(pos.x)},${Math.round(pos.z)})${st}${extra}`;
}
// Whole-map vision: every agent sees the entire island regardless of facing,
// distance or walls. The facing cone (isWithinFacingVision), line-of-sight
// occlusion (canSeeCell/opaqueCells) and the vision radius are kept intact;
// set this to false to bring limited vision back.
const FULL_MAP_VISION=true;
// Grid bounds of the whole-map view: the island rectangle plus a margin for
// the HD island's irregular noses/terraces and one row of sea around it.
// Board: the whole board plus one ring of sea, cropped to a 25 x 19 window
// around the agent on bigger boards so prompts stay small.
const VIEW_HALF={x:12,z:9};
function mapCropped(){ return !LEGACY_ISLAND && (WORLD.halfW>VIEW_HALF.x || WORLD.halfH>VIEW_HALF.z); }
function fullMapBounds(cx,cz){
  if(!LEGACY_ISLAND){
    const span=(c,half,v)=>half<=v ? [-half,half] : (lo=>[lo,lo+2*v])(clamp(Math.round(c)-v,-half,half-2*v));
    const [x0,x1]=span(cx,WORLD.halfW,VIEW_HALF.x), [z0,z1]=span(cz,WORLD.halfH,VIEW_HALF.z);
    return {x0,x1,z0,z1};
  }
  return { x0:Math.min(-WORLD.halfW-3,cx-1), x1:Math.max(WORLD.halfW+3,cx+1),
           z0:Math.min(-WORLD.halfH-2,cz-1), z1:Math.max(WORLD.halfH+2,cz+1) };
}
// The object list, nearest first and short: everyone in sight, then at most
// three of each kind of thing (four doors), sixteen things in all.
function shortList(details){
  const per=new Map(), out=[]; let n=0;
  for(const e of details.sort((p,q)=>p.d-q.d)){
    if(!e.type){ out.push(e); continue; }
    const c=per.get(e.type)||0; if(c>=(e.type==='door'?4:3) || n>=16) continue;
    per.set(e.type,c+1); n++; out.push(e);
  }
  return out;
}
function buildVisiblePerception(agentId=null,radius=7){
  const g=agentId ? state.characters.find(x=>x.id===agentId) : (state.selected||state.characters[0]);
  if(!g) return 'No agent selected.';
  radius=clamp(Number(radius)||5,2,8);
  const cx=Math.round(g.root.position.x), cz=Math.round(g.root.position.z);
  const opaque=FULL_MAP_VISION ? null : opaqueCells();
  const facingName=facingNameFromDir(g.dir);
  const B=FULL_MAP_VISION ? fullMapBounds(cx,cz) : {x0:cx-radius,x1:cx+radius,z0:cz-radius,z1:cz+radius};
  // What it sees (darkness.js): line of sight all round, and light in dark
  // scenarios. Not the way it faces: small models lose track of things just
  // to their side.
  const sight=window.tablefolkDark?.sightFor?.(g);
  const sees=(x,z)=>sight ? sight.has(x+','+z) : FULL_MAP_VISION ||
    (Math.abs(x-cx)<=radius && Math.abs(z-cz)<=radius && isWithinFacingVision(g,cx,cz,x,z,radius) && canSeeCell(cx,cz,x,z,opaque));
  state.perceptionLabels=new Map();
  const cells=new Map(); const details=[];
  for(let z=B.z0; z<=B.z1; z++) for(let x=B.x0; x<=B.x1; x++){
    const visible=sees(x,z);
    const base=!visible ? ' ' : (FULL_MAP_VISION && !hasGroundAt(x,z) ? '~' : baseGlyphForTile(x,z));
    cells.set(gridKey(x,z), {base, marks:'', prio:visible?0:99, visible});
  }
  function put(x,z,base,marks,prio){ const k=gridKey(x,z); const c=cells.get(k); if(!c || !c.visible) return; if(prio>=c.prio){ c.base=base; c.marks=marks||''; c.prio=prio; } else if(marks && !c.marks) c.marks=marks; }
  let objectNumber=1;
  for(const m of state.blocks.concat(state.props)){
    if(!m || m.isDisposed?.()) continue;
    const p=m.getAbsolutePosition?.() || m.position; if(!p) continue;
    const x=Math.round(p.x), z=Math.round(p.z);
    if(!cells.has(gridKey(x,z)) || !sees(x,z)) continue;
    const mm=meta(m); if(!mm || mm.type==='tile' || mm.decor) continue;
    const glyph=typeGlyph(mm.type), marks=stateMarksFor(mm,m);
    put(x,z,glyph,marks,55);
    // Walls are on the map and in "Around you"; listing each one only buries
    // the things worth noticing.
    if(mm.type==='wall') continue;
    // Every non-terrain item rendered in the ASCII map gets an absolute
    // coordinate entry. Interactive items also expose the same ID as a target.
    const id=(glyph.replace(/[^A-Za-z$/*]/g,'O')||'O')+objectNumber++;
    // Walking accepts every label shown on the map, not only touchable items.
    state.perceptionLabels.set(id.toLowerCase(),m); state.perceptionLabels.set(id,m);
    details.push({d:Math.hypot(x-cx,z-cz), type:mm.type, text:describeThing(id,mm.type,p,marks, mm.state&&mm.state!=='intact'?`, state=${mm.state}`:'')});
  }
  for(const other of state.characters){
    const p=other.root.position; const x=Math.round(p.x), z=Math.round(p.z);
    if(!cells.has(gridKey(x,z)) || !sees(x,z)) continue;
    const isSelf=other===g; put(x,z,isSelf?'@':'g', other.anim==='panic'?'?':'', 90);
    const hurt=window.tablefolkCombat?.statusWord(other);
    if(!isSelf) details.push({d:Math.hypot(x-cx,z-cz), text:`${other.id} other_character at (${x},${z}), ${other.defeated?'defeated (lying on the ground)':'anim='+(other.anim||'idle')}${hurt&&!other.defeated?', '+hurt:''}`});
  }
  if(state.playerAvatar){
    const p=state.playerAvatar.root.position, x=Math.round(p.x), z=Math.round(p.z);
    if(cells.has(gridKey(x,z)) && sees(x,z)){
      put(x,z,'Y','',85);
      const ph=window.tablefolkCombat?.statusWord(state.playerAvatar), pw=state.player?.wielding;
      details.push({d:Math.hypot(x-cx,z-cz), text:`${playerName()} (the player, the person talking to you) at (${x},${z})${ph?', '+ph:''}${pw?', wielding '+pw:''}`});
      state.perceptionLabels.set('player',state.playerAvatar.root); state.perceptionLabels.set(playerName().toLowerCase(),state.playerAvatar.root);
    }
  }
  const rows=[];
  const mapCols=B.x1-B.x0+1, mapRows=B.z1-B.z0+1, mapWidth=mapCols*2;
  for(let z=B.z0; z<=B.z1; z++){
    let row='';
    // Keep the cell ordering matched to the validated 3D presentation. The
    // edge labels use the conventional compass layout requested for the UI:
    // W on the left and E on the right.
    for(let x=B.x1; x>=B.x0; x--){
      const c=cells.get(gridKey(x,z));
      row += compactCell(c.base,c.marks);
    }
    const middle=z===cz;
    rows.push(`z=${String(z).padStart(3,' ')} ${middle?'W ': '  '}${row}${middle?'E':''}`);
  }
  const absoluteX=[];
  for(let x=B.x1; x>=B.x0; x--) absoluteX.push(x);
  const compassRows=[
    `                 ${' '.repeat(Math.max(0,mapWidth/2-1))}N`,
    ...rows,
    `                 ${' '.repeat(Math.max(0,mapWidth/2-1))}S`,
    `Absolute x columns W->E: ${absoluteX.join(', ')}`,
  ];
  const held=state.held.get(g.id); const heldMeta=held?meta(held):null;
  const target=state.target&&!state.target.isDisposed?.()?state.target:null; const targetMeta=target?meta(target):null;
  // Build dynamic legend: only include glyphs that appear in the current view
  const visibleGlyphs = new Set();
  for (const [key, c] of cells) { if (c.visible && c.base && c.base !== ' ') visibleGlyphs.add(c.base); }
  const glyphNames = {
    '@':'self', 'g':'other character', 'Y':'the player', ',':'grass', ':':'dirt/path', '~':'water',
    '^':'stone', '#':'wall', '+':'door (opens as you approach)', '_':'floor', '.':'open floor', '&':'lava', '=':'bridge', 'C':'crate', 'B':'barrel', 'M':'mushroom',
    'L':'lamp', '*':'crystal/magic', 'H':'house', 'r':'rock', 'x':'rubble',
    'f':'fence', 'h':'chest', 'w':'workbench', 't':'table', 'n':'bench',
    's':'stool', 'o':'cauldron', 'a':'anvil', 'W':'weapon stand',
    '/':'axe', 'p':'pickaxe', 'u':'bucket', 'b':'bag', 'P':'potion',
    'S':'scroll', '$':'coins', 'D':'desk', 'c':'chair', 'A':'armchair', 'F':'sofa', 'T':'coffee table', 'l':'floor lamp',
    'v':'plant', 'K':'bookcase', '%':'tree', 'X':'campfire', 'I':'signpost', '?':'unknown'
  };
  const legendParts = [];
  for (const glyph of visibleGlyphs) {
    const name = glyphNames[glyph] || 'unknown';
    legendParts.push(glyph + '=' + name);
  }
  // Check for marks in visible cells
  const visibleMarks = new Set();
  for (const [key, c] of cells) { if (c.visible && c.marks) { for (const ch of c.marks) visibleMarks.add(ch); } }
  const markNames = {'!':'burned','#':'cracked','~':'moving','*':'soft/glowing','x':'broken'};
  const markParts = [];
  for (const mark of visibleMarks) { if (markNames[mark]) markParts.push(mark + '=' + markNames[mark]); }
  const legend = [];
  if (legendParts.length) legend.push('Legend: ' + legendParts.join(', ') + '.');
  if (markParts.length) legend.push('Marks: ' + markParts.join(', ') + '.');
  const showMap = document.getElementById('showAsciiMap')?.checked !== false;
  return [
    `Agent perception for ${g.id}`,
    `Center: (${cx},${cz})  Facing: ${facingName} (${Math.round(g.dir.x)},${Math.round(g.dir.z)})  ${sight?'View: what you can see from here':FULL_MAP_VISION?(mapCropped()?'View: the area around you':'View: whole map'):'Radius: '+radius}`,
    `Holding: ${held ? (heldMeta?.type||held.name) : 'none'}  Target: ${target ? (targetMeta?.type||target.name)+' at ('+Math.round(target.position.x)+','+Math.round(target.position.z)+')' : 'none'}`,
    // Relative descriptions (senses.js) read far better for small models than the map.
    ...(window.tablefolkSenses ? ['', ...window.tablefolkSenses.placeLine(g), ...window.tablefolkSenses.aroundLines(g)] : []),
    '',
    ...(showMap ? [`North-up ${mapCols}x${mapRows} map (left=W, right=E; N=-Z, E=-X). Each row shows absolute z:`, ...compassRows, ''] : []),
    details.length ? 'Nearby visible objects:' : 'Nearby visible objects: none',
    // Nearest first, so the cap only drops far-away things.
    ...shortList(details).map(e=>e.text),
    '',
    ...(showMap ? legend : []),
  ].join('\n');
}
function buildCommandExamples(g=null){
  const ex=[], allowed=commandsFor(g);
  if(allowed.has('walk')) ex.push('walk(destination): a coordinate pair, or the name of a person, thing or place, e.g. walk("3,5"), walk(bram), walk(chest)'+((state.places||[]).length?', walk(tavern)':'')+'; repeat on later turns until arrived');
  if(allowed.has('say')) ex.push('say(text) e.g. say("hello there")');
  if(allowed.has('whisper')) ex.push('whisper(text) - only the player hears it, e.g. whisper("meet me by the boat")');
  if(allowed.has('look')) ex.push('look() - look around carefully: describes everyone and everything in sight');
  if(allowed.has('touch')) ex.push('touch(target) e.g. touch(crate)');
  if(allowed.has('push')) ex.push('push()');
  if(allowed.has('pull')) ex.push('pull()');
  if(allowed.has('carry')) ex.push('carry()');
  if(allowed.has('drop')) ex.push('drop()');
  if(allowed.has('throw')) ex.push('throw()');
  if(allowed.has('dig')) ex.push('dig()');
  if(allowed.has('build')) ex.push('build(thing) e.g. build(wall), optionally at a location: build(wall, "3,5") or build(crate, C1); builds in front of you if no location given');
  if(allowed.has('face')) ex.push('face(direction) e.g. face(n) - rotate without moving (n/s/e/w)');
  if(allowed.has('repair')) ex.push('repair()');
  if(allowed.has('panic')) ex.push('panic()');
  if(allowed.has('emote')) ex.push('emote(name) e.g. emote(dance) - dance, laugh, sit, wave, clap, cheer, sleep, bow');
  if(allowed.has('spell.push')) ex.push('spell(push)');
  if(allowed.has('spell.spark')) ex.push('spell(spark)');
  if(allowed.has('spell.fireball')) ex.push('spell(fireball)');
  if(allowed.has('goal')) ex.push('goal(text) e.g. goal(get axe) - set what you are working toward');
  if(allowed.has('remember')) ex.push('remember(text) e.g. remember(Ana owes me 5 gold) - note something important to remember later');
  if(allowed.has('feel')) ex.push('feel(mood) e.g. feel(angry) - show how you feel');
  if(allowed.has('eat') && g && (charInventory(g).items||[]).some(i=>window.tablefolkMind?.FOOD.test(i.name))) ex.push('eat(food) e.g. eat(bread) - eat food you carry');
  if(allowed.has('note')) ex.push('note(html) e.g. note(<h2>Warning</h2><p>the bridge is out</p>) - inscribe an HTML note on the ground; carrying it reads its text aloud');
  if(allowed.has('give_quest')) ex.push('give_quest(text) e.g. give_quest(find the magic sword)');
  if(allowed.has('inventory')) ex.push('inventory() - check the gold and items you are carrying');
  if(allowed.has('sell')) ex.push('sell(item, price) e.g. sell("magic sword", 30) - sell an item from your inventory to the person you are chatting with for that many gold');
  if(allowed.has('give')) ex.push('give(item) e.g. give(magic sword) - hand an item to the person you are chatting with');
  if(allowed.has('wield')) ex.push('wield(item) e.g. wield(iron sword) - hold a weapon from your inventory; wield(none) puts it away');
  if(window.tablefolkSkills) ex.push(...window.tablefolkSkills.commandLines(g));
  if(allowed.has('workflow') && window.tablefolkWorkflows?.describe(g).length) ex.push('workflow(name, input) - start a routine that guides you step by step: '+window.tablefolkWorkflows.describe(g).join(', '));
  if(allowed.has('attack')) ex.push('attack(target) e.g. attack(player) or attack(gob1) - strike someone standing next to you (walk there first); only when you really mean to fight');
  return ex.length?ex:['walk("0,0")'];
}
function buildAgentPrompt(g, cfg) {
  if (!g || !cfg) return { systemMessage: '', commandReminder: '' };
  const r=document.getElementById('visionRadius')?.value || 5;
  const perception = buildVisiblePerception(g.id, r);
  const style = (cfg.style ?? 'goofy little creature').replace(/\s+/g, ' ').trim();
  const backstory = (cfg.backstory || '').replace(/\s+/g, ' ').trim();
  const mind = window.tablefolkMind && state.mind !== false;
  const personality = (cfg.personality || '').replace(/\s+/g, ' ').trim();
  const quest = (cfg.quest || '').replace(/\s+/g, ' ').trim();
  const goal = (cfg.goal || '').replace(/\s+/g, ' ').trim();
  const canGiveQuest = allowedFor(g).has('give_quest');
  const cmds = buildCommandExamples(g);
  // short: whole sentences here invite the model to say them again
  const recentActs = (cfg.recent || []).slice(-3).map(a => String(a).replace(/^chose\s+/, '').slice(0, 70) + (String(a).length > 76 ? '…' : ''));
  // Anti-echo instructions are optional and OFF by default - small models can
  // confuse negative prompts ('do not copy', 'never put') and end up doing the
  // opposite. Toggle #antiEcho to include them.
  const antiEcho = document.getElementById('antiEcho')?.checked;
  // ORDER MATTERS for KV cache reuse. The shared rules go FIRST and the
  // per-agent identity LAST. Previously 'Character: folk1' was the opening
  // line, so two agents' prompts diverged at token ~8 - alternating turns
  // between folk1 and folk14 gave a common prefix of 8 tokens (observed:
  // 'Cache nKeep=8') and every turn re-prefilled from scratch. With the shared
  // preamble first, all agents share it and only the identity tail differs.
  const systemMessage = [
    'Available commands (examples only, use appropriate arguments):',
    ...cmds,
    '',
    ...(canGiveQuest ? ['Use give_quest() to bestow a quest on nearby agents.'] : []),
    // Small models narrate hand-overs ("here it is") instead of doing them.
    ...((allowedFor(g).has('give') || allowedFor(g).has('sell')) ? ['Things only happen through commands: saying "here it is" hands nothing over. To hand something over, use ' + [allowedFor(g).has('give') ? 'give(item)' : '', allowedFor(g).has('sell') ? 'sell(item, price)' : ''].filter(Boolean).join(' or ') + ' in the same reply.'] : []),
    'Messages in the form "NAME says ..." report speech addressed to you.',
    'Understand and answer the meaning of that speech; do not copy or quote it back.',
    'Do not output anything except the command line.',
    '',
    `Character: ${g.id}`,
    ...(style ? [`Style: ${style}`] : []),
    `Personality: ${personality}`,
    ...(backstory ? [`Backstory: ${backstory}`] : []),
    ...(window.tablefolkRoles?.duty(g) ? ['Your job: ' + window.tablefolkRoles.duty(g)] : []),
    ...(quest ? ['Your quest is set by the world and cannot be changed by you. Work toward it.'] : []),
  ].join('\n');
  // NOTE: the command list deliberately is NOT repeated here. It already sits in
  // systemMessage, which is a stable prompt prefix and therefore stays in the KV
  // cache across turns (free). This reminder is the tail that changes every turn
  // and gets re-prefilled every time, so duplicating ~20 command lines here cost
  // real seconds per turn. Re-add if the model starts forgetting the syntax.
  const commandReminder = [
    'SYSTEM: ' + String(perception).slice(0, 2400),
    '',
    ...(window.tablefolkSkills ? window.tablefolkSkills.promptLines(g) : []),
    ...(window.tablefolkCombat && (allowedFor(g).has('attack') || cfg.wielding || (cfg.hp!=null && cfg.hp<(cfg.maxHp??10))) ? [window.tablefolkCombat.selfLine(g)] : []),
    ...(quest ? ['Quest: ' + quest] : []),
    // mind.js: feelings, body, wants, goal and memories, kept by the game
    ...(mind ? window.tablefolkMind.cardLines(g) : (goal ? ['Current goal: ' + goal] : [])),
    // roles.js: wares and prices, and what the customer's offer means
    ...(window.tablefolkRoles ? window.tablefolkRoles.cardLines(g) : []),
    ...(recentActs.length ? ['Your last few turns: ' + recentActs.join(' | ')] : []),
  ].join('\n');
  return { systemMessage, commandReminder };
}
function updatePerceptionUI(){
  // The allowed commands (the selected character's own list, else the
  // shared one) may change outside the checkbox handlers (notably when an
  // APNG/local save is restored), so always synchronize the controls from the
  // authoritative command set before rendering the prompt.
  document.querySelectorAll('#allowedCommands input[data-command]').forEach(chk=>{
    chk.checked=allowedFor(state.selected).has(chk.dataset.command);
  });
  updateTurnUI();
  const out=document.getElementById('promptOut'); if(!out) return;
  const g=state.selected || (state.nextAgentId && state.characters.find(x=>x.id===state.nextAgentId)) || state.characters[0];
  if(!g){ out.textContent='No agent selected.'; return; }
  const cfg=getBrainConfig(g.id);
  const chatTestMode=document.getElementById('chatTestMode')?.checked;
  if (chatTestMode) {
    // In chat test mode, show bare conversation messages
    let text = `[AGENT: ${g.id}]\n\n`;
    text += `[SYSTEM] have a conversation. use the say command\n\n`;
    const hist = cfg.messages || [];
    for (const m of hist) {
      if (m.role === 'assistant' || (m.role === 'user' && !m.content.startsWith('SYSTEM RESULT:') && !m.content.startsWith('TABLEFOLK ') && !m.content.startsWith('SYSTEM:'))) {
        text += `[${m.role.toUpperCase()}] ${m.content}\n`;
      }
    }
    out.textContent = text;
    return;
  }
  const { systemMessage, commandReminder } = buildAgentPrompt(g, cfg);
  const hist = cfg.messages || [];
  let histText = '';
  for (const m of hist) { histText += `[${m.role.toUpperCase()}] ${m.content}\n`; }
  out.textContent=`[AGENT: ${g.id}]\n\n[SYSTEM]\n${systemMessage}\n\n${histText ? '--- MESSAGE HISTORY ---\n' + histText + '\n' : ''}[USER]\n${commandReminder}`;
}
window.getAgentPerception=(agentId=null,radius=7)=>buildVisiblePerception(agentId,radius);


function getBrainConfig(agentId){
  if(!state.brainConfigs.has(agentId)){
    const g=state.characters.find(x=>x.id===agentId);
    state.brainConfigs.set(agentId,{enabled:true,style:g?.style==='mage'?'helpful mage':'helpful character',personality:'helpful and friendly',goals:'help the user, follow instructions carefully, explore, interact with nearby objects',fireballTemptation:g?.traits?.fireball??20,chaos:1,recent:[],quest:'',goal:'',giveQuest:false,ttsEnabled:true,ttsVoiceId:'builtin:alba'});
  }
  return state.brainConfigs.get(agentId);
}
function setBrainConfig(agentId,cfg){
  const old=getBrainConfig(agentId);
  const next={...old,...(cfg||{})};
  state.brainConfigs.set(agentId,next);
  const g=state.characters.find(x=>x.id===agentId);
  if(g){ g.brain=next; if(g.traits) g.traits.fireball=Number(next.fireballTemptation ?? g.traits.fireball ?? 50); }
  return next;
}
function refreshAgentSelect(){
  const agent=document.getElementById('agentSelect');
  if(!agent) return;
  const prev=agent.value || state.selected?.id;
  agent.textContent='';
  state.characters.forEach(g=>{ const o=document.createElement('option'); o.value=g.id; o.textContent=g.id; agent.appendChild(o); });
  if(prev && state.characters.some(g=>g.id===prev)) agent.value=prev;
  agent.onchange=()=>selectCharacter(state.characters.find(g=>g.id===agent.value));
}
async function spawnCharacter(){
  const base=state.selected?.root?.position || new BABYLON.Vector3(0,0,0);
  const pos=new BABYLON.Vector3(clamp(Math.round(base.x+1+Math.random()*2),-14,14),.06,clamp(Math.round(base.z+1+Math.random()*2),-14,14));
  const id='folk'+state.nextSpawnId++;
  const palettes=[
    {hat:state.materials.hat1,belly:state.materials.belly1,dark:state.materials.foot},
    {hat:state.materials.hat2,belly:state.materials.belly2,dark:state.materials.foot},
    {hat:state.materials.hat3,belly:state.materials.belly3,dark:state.materials.foot,clay:state.materials.bot}
  ];
  const styles=['goblin','mushroom','bot'];
  let g;
  try{ g=await createGeneratedCritter(state.scene,id,pos); }
  catch(e){
    console.warn('generated rigged character failed; using procedural fallback',e);
    g=createCritter(state.scene,id,pos,pickRandom(palettes),pickRandom(styles));
  }
  setCharacterLogicalPosition(g,pos);
  setBrainConfig(id,{style:'helpful character',personality:'helpful and friendly',fireballTemptation:20,chaos:1});
  refreshAgentSelect(); selectCharacter(g); log('spawned character '+id); updatePerceptionUI(); saveWorldState(); return g;
}
function spawnProp(kind='crate'){
  const g=(state.nextAgentId && state.characters.find(x=>x.id===state.nextAgentId)) || state.selected || state.characters[0];
  const p=(g?.root?.position||BABYLON.Vector3.Zero()).add((g?.dir||new BABYLON.Vector3(0,0,-1)).scale(2));
  const x=clamp(Math.round(p.x),-14,14), z=clamp(Math.round(p.z),-14,14);
  let obj;
  if(kind==='barrel') obj=makeBarrel(state.scene,x,z);
  else if(kind==='wall') obj=makeBlock(state.scene,x,z,false);
  else if(kind==='door') obj=makeDoor(state.scene,x,z,{});
  else if(kind==='mushroom') obj=makeMushroom(state.scene,x,z);
  else if(kind==='lamp') obj=makeLamp(state.scene,x,z);
  else if(kind==='note') obj=makeNote(state.scene,x,z,'<h2>Note</h2><p>...</p>');
  else obj=makeCrate(state.scene,x,z);
  if(obj) state.target=obj; log('spawned '+kind+' at '+x+','+z); updatePerceptionUI(); saveWorldState(); return obj;
}
async function spawnAt(type, x, z) {
  x = clamp(Math.round(x), -15, 15);
  z = clamp(Math.round(z), -15, 15);
  if (String(type).startsWith('paint:')) {
    // Paint brush: clicking a cell already painted with this material erases it.
    const mat = type.slice(6), cur = paintAt(x, z);
    setPaint([{ x, z, mat: cur?.mat === mat ? 'none' : mat }]);
    updatePerceptionUI(); saveWorldState();
    return null;
  }
  let obj;
  if (type === 'critter') {
    const pos = new BABYLON.Vector3(x, .06, z);
    const id = 'folk' + state.nextSpawnId++;
    const palettes = [
      {hat:state.materials.hat1, belly:state.materials.belly1, dark:state.materials.foot},
      {hat:state.materials.hat2, belly:state.materials.belly2, dark:state.materials.foot},
      {hat:state.materials.hat3, belly:state.materials.belly3, dark:state.materials.foot, clay:state.materials.bot}
    ];
    const styles = ['goblin', 'mushroom', 'bot'];
    try{ obj=await createGeneratedCritter(state.scene,id,pos); }
    catch(e){
      console.warn('generated rigged character failed; using procedural fallback',e);
      obj=createCritter(state.scene,id,pos,pickRandom(palettes),pickRandom(styles));
    }
    setCharacterLogicalPosition(obj, pos);
    setBrainConfig(id, {style:'helpful character', personality:'helpful and friendly', fireballTemptation:20, chaos:1});
    refreshAgentSelect();
    selectCharacter(obj);
    log('spawned ' + id + ' at ' + x + ',' + z);
  } else if (type === 'barrel') {
    obj = makeBarrel(state.scene, x, z);
    log('spawned barrel at ' + x + ',' + z);
  } else if (type === 'wall') {
    obj = makeBlock(state.scene, x, z, false);
    log('spawned wall at ' + x + ',' + z);
  } else if (type === 'door') {
    obj = makeDoor(state.scene, x, z, {});
    log('spawned door at ' + x + ',' + z);
  } else if (type === 'mushroom') {
    obj = makeMushroom(state.scene, x, z);
    log('spawned mushroom at ' + x + ',' + z);
  } else if (type === 'lamp') {
    obj = makeLamp(state.scene, x, z);
    log('spawned lamp at ' + x + ',' + z);
  } else if (type === 'note') {
    obj = makeNote(state.scene, x, z, '<h2>Note</h2><p>...</p>');
    log('spawned note at ' + x + ',' + z);
  } else if (ITEM_CATALOG[type]) {
    obj = makeCatalogItem(state.scene, type, x, z);
    log('spawned ' + type + ' at ' + x + ',' + z);
  } else {
    obj = makeCrate(state.scene, x, z);
    log('spawned crate at ' + x + ',' + z);
  }
  updatePerceptionUI();
  saveWorldState();
  return obj;
}
// Toy-plastic finish: a glossy clear coat over the base material. This is
// what reads as "plastic miniature" on flat surfaces (the grass gets its
// sheen from its normal map; blocks and props have none).
function plasticFinish(m,{coat=.6,coatRough=.1,rough=null}={}){
  if(!(m instanceof BABYLON.PBRMaterial)) return m;
  if(rough!==null) m.roughness=rough;
  m.clearCoat.isEnabled=true; m.clearCoat.intensity=coat; m.clearCoat.roughness=coatRough;
  m.environmentIntensity=Math.max(m.environmentIntensity||0,.85);
  return m;
}
// Dispose a material and its own textures, but not textures shared across
// materials: look.js gives every clay material the same detail-normal
// texture, and disposing it with one object stripped it from all the others.
function disposeOwnMaterial(m){
  if(!m) return;
  try{ if(m.detailMap) m.detailMap.texture=null; }catch{}
  try{ m.dispose(false,true); }catch{}
}
// ---- the player's avatar ----
// A critter-shaped body for the person at the keyboard: gold tint and a gold
// ring, no brain. It is kept out of state.characters (so it never takes LLM
// turns) but other characters see it in their perception as the player.
// Moves with WASD/arrows (screen-relative; in first person W/S walk, A/D
// turn) or by clicking the ground (pathfinding). V toggles first person.
// Player body: a KayKit adventurer by default, so it's clearly not a critter.
// People: KayKit adventurers, for the player and for characters ("model" in
// a scenario agent). 'woman' is the rogue in everyday clothes: the same
// palette texture recoloured (cream top, denim, dark shoes) and no cape.
const AVATAR_MODELS={rogue:'Rogue_Hooded.glb',knight:'Knight.glb',mage:'Mage.glb',ranger:'Ranger.glb',barbarian:'Barbarian.glb',woman:'Rogue.glb'};
const MODEL_LOOKS={woman:{texture:'rogue_modern.png?v=20261018a',hide:/Cape/}};
const PERSON_H=1.3;
// Voices: a character without "ttsVoiceId" gets one that fits its body
// (female or male), the same one every time for the same id. Genders and
// descriptions come from the server's /api/voices (set on its admin page),
// else these defaults.
const FEMALE_MODELS=new Set(['woman','adventurer_woman','villager','witch','huntress','peasant_woman']);
const VOICE_GENDER={alba:'female',azelma:'female',cosette:'female',eponine:'female',fantine:'female',javert:'male',jean:'male',marius:'male'};
fetch('/api/voices').then(r=>r.ok?r.json():null).then(d=>{ if(Array.isArray(d?.voices)){ window.TABLEFOLK_VOICES=d.voices; window.tablefolkTTS?.dispatchEvent(new Event('voiceschanged')); } }).catch(()=>{});
function defaultVoiceFor(id,model){
  const want=FEMALE_MODELS.has(model)?'female':'male';
  const cat=window.TABLEFOLK_VOICES||Object.entries(VOICE_GENDER).map(([id,gender])=>({id,gender}));
  const pool=cat.filter(v=>v.gender===want).map(v=>v.id); if(!pool.length) return null;
  let h=0; for(const c of String(id)) h=(h*31+c.charCodeAt(0))>>>0;
  return 'builtin:'+pool[h%pool.length];
}
// Figures: Quaternius characters and monsters (assets/models/characters/
// quaternius/, CC0/CC-BY, see LICENSE.txt there). Each GLB brings its own
// clips; FIG_CLIPS maps them onto the KayKit clip names the rest of the code
// asks for (Idle_A, Walking_A, Melee_1H_Attack_Chop, Hit_A, Death_A, ...).
// h: standing height in cells; tint: recolour (kobold is a reddish goblin);
// lift: hover height for fliers.
const FIG_ASSET=ASSET_BASE+'models/characters/quaternius/';
const FIGURES={
  // Universal rig (tools/build-figures.sh): realistic proportions, a little taller
  woodsman:{h:1.36}, huntress:{h:1.3}, peasant:{h:1.34}, peasant_woman:{h:1.28},
  adventurer:{h:1.3}, adventurer_woman:{h:1.24}, hooded:{h:1.3}, king:{h:1.32}, farmer:{h:1.28}, villager:{h:1.22}, witch:{h:1.3}, wizard:{h:1.28},
  skeleton:{h:1.25,v:'20261022b'}, skeleton_warrior:{h:1.26}, zombie:{h:1.28}, goblin:{h:.9}, kobold:{file:'goblin',h:.78,tint:[1.25,.62,.42]}, orc:{h:1.45},
  demon:{h:1.55}, giant:{h:2.1}, rat:{h:.32}, spider:{h:.5}, wolf:{h:.85}, bat:{h:.45,lift:.75}, dragon:{h:1.3,lift:.35}, ghost:{h:1.1,lift:.25}, slime:{h:.5},
};
const FIG_CLIPS={
  Idle_A:['Idle','Flying_Idle','Idle_Neutral','Flying','Idle_2'], Idle_B:['Idle_Neutral','Idle_2','Idle','Flying_Idle','Flying'],
  Walking_A:['Walk','Fast_Flying','Flying','Run','Running'], Running_A:['Run','Running','Gallop','Run_Arms','Fast_Flying','Flying','Walk'],
  Waving:['Wave','Yes','Talk'], Interact:['Interact','PickUp','Yes'], PickUp:['PickUp','Interact'], Cheering:['Yes','Wave','Dance'],
  Hit_A:['HitRecieve','HitReact','RecieveHit','Hit','Idle_HitReact_Left'], Hit_B:['HitRecieve_2','RecieveHit_2','Idle_HitReact_Right','HitRecieve','HitReact','Hit'],
  Death_A:['Death'],
  Melee_1H_Attack_Chop:['Sword_Slash','Sword','Weapon','Staff_Attack','Attack','Bite_Front','Headbutt','Punch_Right','Punch'],
  Melee_1H_Attack_Stab:['Sword_Slash','Sword','Weapon','Staff_Attack','Attack','Bite_Front','Headbutt','Punch_Right','Punch'],
  Melee_2H_Attack_Chop:['Sword_Slash','Sword','Weapon','Staff_Attack','Attack','Attack2','Headbutt','Punch'],
  Melee_Unarmed_Attack_Punch_A:['Punch_Right','Punch','Attack','Bite_Front','Headbutt','Sword_Slash'],
  Melee_Unarmed_Attack_Kick:['Kick_Right','Kick_Left','Punch_Left','Attack2','Attack'],
  Ranged_Magic_Spellcasting:['Spell1','Spell2','Staff_Attack','Punch'], Ranged_Magic_Shoot:['Spell2','Spell1','Punch'],
  Throw:['Punch_Right','Punch','Attack'], Sit_Floor_Idle:['Sit','Duck','Crawl'],
};
const isPersonModel=m=>!!(m && (AVATAR_MODELS[m] || FIGURES[m]));
// "CharacterArmature|CharacterArmature|Death|CharacterArmature|Dea" -> Death,
// "BatArmature|Bat_Flying" -> Flying
function figClipName(n){
  const seg=String(n).split('|').filter(s=>s && !/Armature/.test(s));
  return (seg[0]||n).replace(/^(Bat|Rat|Spider|Slime|Skeleton)_/,'');
}
async function createFigure(id,pos,model,label){
  const F=FIGURES[model], sc=state.scene;
  const res=await BABYLON.SceneLoader.ImportMeshAsync('',FIG_ASSET,(F.file||model)+'.glb?v='+(F.v||'20261022a'),sc);
  const root=new BABYLON.TransformNode(id,sc); root.position.copyFrom(pos);
  const importedRoot=res.meshes.find(m=>m.name==='__root__') || res.meshes[0];
  // like KayKit people: glTF front is +Z; zero yaw must face north (-Z)
  importedRoot.parent=root; importedRoot.position.set(0,0,0); importedRoot.rotationQuaternion=null; importedRoot.rotation.set(0,0,0);
  for(const mesh of res.meshes){
    mesh.receiveShadows=true; mesh.isPickable=true; mesh.metadata={ownerId:id}; addShadow(mesh);
    const m=mesh.material; if(!m) continue;
    if(m instanceof BABYLON.PBRMaterial){ m.maxSimultaneousLights=8; m.roughness=Math.max(.55,m.roughness??.7); m.metallic=Math.min(.2,m.metallic??0); }
    if(F.tint && m.albedoColor && !m._tfTinted){ m._tfTinted=true; m.albedoColor=m.albedoColor.multiply(new BABYLON.Color3(...F.tint)); }
  }
  // F.tint changes the shared materials of this file only for this spawn:
  // ImportMeshAsync gives every spawn its own copies.
  const clips={};
  for(const ag of res.animationGroups||[]){ ag.stop(); const n=figClipName(ag.name); if(!clips[n]) clips[n]=ag; }
  const rigAnims={};
  for(const [want,from] of Object.entries(FIG_CLIPS)){ const hit=from.map(n=>clips[n]).find(Boolean); if(hit) rigAnims[want]=hit; }
  // size to its height in cells
  root.computeWorldMatrix(true);
  const bb=root.getHierarchyBoundingVectors(true,m=>m.isEnabled() && (m.getTotalVertices?.()||0)>0);
  const k=F.h/Math.max(.05,bb.max.y-bb.min.y); root.scaling.setAll(k);
  importedRoot.position.y=(-(bb.min.y-root.position.y)+(F.lift||0)/k);
  const wide=Math.max(.4,Math.min(1.1,F.h*.55));
  const collider=BABYLON.MeshBuilder.CreateBox(id+'_collider',{width:wide,height:Math.max(.4,Math.min(1.4,F.h)),depth:wide},sc);
  collider.position.copyFrom(root.position); collider.position.y+=Math.min(1.4,F.h)/2; collider.isVisible=false; collider.metadata={ownerId:id};
  const agg=addBody(collider,'dynamic','BOX',1.25,{friction:.92,restitution:.02});
  agg?.body?.setMotionType?.(BABYLON.PhysicsMotionType.ANIMATED);
  const g={id,root,collider,agg,selected:false,anim:'idle',t:Math.random()*10,dir:new BABYLON.Vector3(0,0,-1),style:label||model,traits:{fireball:40,obedience:50},rigged:true,rigRoot:importedRoot,rigAnims,
    owned:{meshes:[...res.meshes],skeletons:[...(res.skeletons||[])],groups:[...(res.animationGroups||[])]},rigMode:null,activeRigAnim:null,cosmetic:{},logicalPos:new BABYLON.Vector3(pos.x,0,pos.z),charModel:model,figure:true,height:F.h};
  playRig(g,'idle',true);
  state.characters.push(g);
  return g;
}
async function createPerson(id,pos,model,label){
  if(FIGURES[model]) return createFigure(id,pos,model,label);
  await initKayKitAnimationSources(state.scene);
  const g=await createKayKitCharacter(state.scene,id,pos,AVATAR_MODELS[model],label||model);
  // createKayKitCharacter turns the model half a turn (for an older convention),
  // which made people walk backwards: face it the way it moves.
  if(g.rigRoot) g.rigRoot.rotation.y=0;
  const look=MODEL_LOOKS[model], meshes=g.rigRoot?.getChildMeshes?.(false)||[];
  if(look?.hide) for(const m of meshes) if(look.hide.test(m.name)) m.setEnabled(false);
  if(look?.texture){
    const tex=new BABYLON.Texture(CHAR_ASSET+look.texture,state.scene,false,false);
    for(const mat of new Set(meshes.map(m=>m.material).filter(Boolean))){
      const old=mat.albedoTexture; mat.albedoTexture=tex; if(old && old!==tex) old.dispose();
    }
  }
  // Normalise height: KayKit's scale suits an older, bigger world (the rogue
  // came out ~2.8 tall next to ~1.0 characters). People: 1.3, a head taller.
  g.root.computeWorldMatrix(true);
  const bb=g.root.getHierarchyBoundingVectors(true,m=>m.isEnabled() && (m.getTotalVertices?.()||0)>0 && !/collider/.test(m.name));
  g.root.scaling.scaleInPlace(PERSON_H/Math.max(.2,bb.max.y-g.root.position.y));
  g.charModel=model;
  state.scene.onAfterRenderObservable.addOnce(()=>{ try{ if(!g.root.isDisposed()) addPersonMouth(g); }catch(e){ console.warn('mouth failed',e); } });
  return g;
}
async function spawnPlayerAvatar(x=0,z=3,facing='n',model){
  removePlayerAvatar();
  model=model||state.avatarModel||'rogue';
  const pos=new BABYLON.Vector3(x,(state.terrainTopY??0),z);
  let g=null;
  if(isPersonModel(model)){
    try{ g=await createPerson('player',pos,model,'player'); }
    catch(e){ console.warn('KayKit avatar failed, using a critter body',e); }
  }
  if(!g){ g=await createGeneratedCritter(state.scene,'player',pos); model='critter'; }
  state.characters=state.characters.filter(o=>o!==g);
  g.isPlayer=true; g.avatarModel=model; state.playerAvatar=g; state.avatarModel=model;
  setCharacterLogicalPosition(g,new BABYLON.Vector3(x,0,z));
  const d=FACING_DIRS[String(facing||'n')[0]]||FACING_DIRS.n; setCharacterFacing(g,new BABYLON.Vector3(...d));
  for(const m of g.rigRoot?.getChildMeshes?.(false)||[]){
    m.metadata={...(m.metadata||{}),ownerId:'player'};
    if(model==='critter' && m.material?.albedoColor) m.material.albedoColor=new BABYLON.Color3(.98,.74,.40);
  }
  // eye height for first person, from the model's real size
  g.root.computeWorldMatrix(true);
  const bb=g.root.getHierarchyBoundingVectors(true,m=>m.isEnabled() && (m.getTotalVertices?.()||0)>0 && !/collider/.test(m.name));
  g.eyeHeight=(model!=='critter'?(g.height||PERSON_H):Math.max(.2,bb.max.y-g.root.position.y))*.88;
  const ring=BABYLON.MeshBuilder.CreateTorus('player_ring',{diameter:.95,thickness:.045,tessellation:40},state.scene);
  const rm=new BABYLON.StandardMaterial('player_ring_mat',state.scene); rm.emissiveColor=new BABYLON.Color3(1,.75,.25); rm.disableLighting=true; rm.alpha=.85;
  ring.material=rm; ring.isPickable=false; ring.parent=g.root; ring.position.y=.04/(g.root.scaling.y||1);
  g.playerRing=ring;
  setCameraArrowKeys(false);
  updateFirstPersonButton(); updatePerceptionUI();
  return g;
}
// The overview camera turns on the arrow keys by default. With an avatar the
// arrows walk it, and the camera swinging at the same time changed what
// "forward" meant mid-walk (up/down seemed swapped), so they only walk then.
function setCameraArrowKeys(on){
  const cam=state.camera; if(!cam) return;
  cam._tfKeys ||= {up:cam.keysUp.slice(),down:cam.keysDown.slice(),left:cam.keysLeft.slice(),right:cam.keysRight.slice()};
  cam.keysUp=on?cam._tfKeys.up.slice():[]; cam.keysDown=on?cam._tfKeys.down.slice():[];
  cam.keysLeft=on?cam._tfKeys.left.slice():[]; cam.keysRight=on?cam._tfKeys.right.slice():[];
}
function removePlayerAvatar(){
  const g=state.playerAvatar; if(!g) return;
  setCameraArrowKeys(true);
  if(state.firstPerson) setFirstPerson(false);
  try{ g.playerRing?.material?.dispose(); g.playerRing?.dispose(); }catch{}
  disposeCharacter(g); state.playerAvatar=null; updateFirstPersonButton();
}
// One cell in a direction, unless blocked or off the edge (no accidental falls).
function playerStep(dir){
  const g=state.playerAvatar; if(!g || g.turnMove || g.falling || g.defeated || state.npcBusy) return false;
  setCharacterFacing(g,dir);
  const lp=g.logicalPos||g.root.position, nx=Math.round(lp.x+dir.x), nz=Math.round(lp.z+dir.z);
  if(isBlocked(nx,nz) || !hasGroundAt(nx,nz)) { emitBadge(g,'bonk'); return false; }
  startTurnMove(g,dir,Math.hypot(nx-lp.x,nz-lp.z)); g.anim='walk'; playRig(g,'walk',true);
  setTimeout(()=>{ if(g.anim==='walk'){ g.anim='idle'; playRig(g,'idle',true); } },g.turnMove.dur*1000+60);
  state.followAvatar=true;
  window.tablefolkPlay?.acted('move');
  return true;
}
// Screen-relative cardinal direction: the camera's forward/right snapped to the grid.
function cameraCardinal(which){
  const cam=state.scene.activeCamera, f=cam.getForwardRay?cam.getForwardRay().direction:cam.getDirection(BABYLON.Axis.Z);
  // Babylon is left-handed: screen-right of a forward f is (f.z, 0, -f.x).
  let v=new BABYLON.Vector3(f.x,0,f.z); if(which==='right') v=new BABYLON.Vector3(f.z,0,-f.x); if(which==='back') v=v.scale(-1); if(which==='left') v=new BABYLON.Vector3(-f.z,0,f.x);
  return Math.abs(v.x)>Math.abs(v.z) ? new BABYLON.Vector3(Math.sign(v.x),0,0) : new BABYLON.Vector3(0,0,Math.sign(v.z));
}
// First person: the grid direction you are looking along. Movement keys use
// this, not the avatar's body (the body could lag the view: look around while
// a step was under way and W would then walk the way the body still faced).
function fpForward(){ const yx=Math.sin(state.fpYaw??0), yz=Math.cos(state.fpYaw??0); return Math.abs(yx)>Math.abs(yz) ? new BABYLON.Vector3(Math.sign(yx),0,0) : new BABYLON.Vector3(0,0,Math.sign(yz)); }
function turnPlayer(sign){ const g=state.playerAvatar; if(!g || g.turnMove) return; const d=state.firstPerson ? fpForward() : g.dir; setCharacterFacing(g,new BABYLON.Vector3(-d.z*sign,0,d.x*sign)); if(state.firstPerson) state.fpYaw=Math.atan2(g.dir.x,g.dir.z); }
// First-person mouse look: drag to turn/tilt the view; the avatar turns to
// the nearest grid direction you're looking along.
function setupFirstPersonLook(){
  let drag=null;
  canvas.addEventListener('pointerdown',e=>{ if(state.firstPerson) drag={x:e.clientX,y:e.clientY}; });
  window.addEventListener('pointerup',()=>{ drag=null; });
  canvas.addEventListener('pointermove',e=>{
    if(!state.firstPerson || !drag || !(e.buttons&3)) return;
    const dx=e.clientX-drag.x, dy=e.clientY-drag.y; drag={x:e.clientX,y:e.clientY};
    const k=.0045*((fpCam?.fov||1)/1);   // slower when zoomed in
    state.fpYaw=(state.fpYaw??0)+dx*k; state.fpPitch=clamp((state.fpPitch??0)+dy*k,-1.25,1.25);
    const g=state.playerAvatar; if(g && !g.turnMove){ const yx=Math.sin(state.fpYaw), yz=Math.cos(state.fpYaw); setCharacterFacing(g,Math.abs(yx)>Math.abs(yz)?new BABYLON.Vector3(Math.sign(yx),0,0):new BABYLON.Vector3(0,0,Math.sign(yz))); }
  });
}
// First person: W/S held down walk smoothly along exactly where you look
// (the view's yaw, read every frame, so the body can never lag the view and
// walk you the old way), sliding along walls; A/D still turn a quarter.
const fpHeld=new Set();
const FP_KEYS={w:'fwd',arrowup:'fwd',s:'back',arrowdown:'back'};
function fpWalk(g,dt){
  const sign=(fpHeld.has('fwd')?1:0)-(fpHeld.has('back')?1:0);
  if(!sign || g.turnMove || g.falling || !state.firstPerson || g.defeated || state.npcBusy){
    if(g.fpWalking){ g.fpWalking=false; if(g.anim==='walk'){ g.anim='idle'; playRig(g,'idle',true); } }
    return;
  }
  const yaw=state.fpYaw??0, step=Math.min(dt,.05)*2.6*sign, lp=g.logicalPos||g.root.position;
  let x=lp.x, z=lp.z;
  const ok=(px,pz)=>!isBlocked(px,pz) && hasGroundAt(px,pz);
  const nx=x+Math.sin(yaw)*step, nz=z+Math.cos(yaw)*step;
  if(ok(nx,z)) x=nx;
  if(ok(x,nz)) z=nz;
  if(x!==lp.x || z!==lp.z){
    setCharacterLogicalPosition(g,new BABYLON.Vector3(x,0,z));
    if(!g.fpWalking || g.anim!=='walk'){ g.fpWalking=true; g.anim='walk'; playRig(g,'walk',true); }
    state.followAvatar=true;
    // entering a new cell is a turn (play.js): nearby characters act
    const cell=Math.round(x)+','+Math.round(z);
    if(g.fpCell!==cell){ const was=g.fpCell; g.fpCell=cell; if(was) window.tablefolkPlay?.acted('move'); }
  } else if(g.fpWalking){ g.fpWalking=false; g.anim='idle'; playRig(g,'idle',true); }
}
function setupPlayerControls(){
  window.addEventListener('keyup',e=>{ const a=FP_KEYS[e.key.toLowerCase()]; if(a) fpHeld.delete(a); });
  window.addEventListener('blur',()=>fpHeld.clear());
  window.addEventListener('keydown',e=>{
    const g=state.playerAvatar; if(!g) return;
    const tag=(e.target?.tagName||'').toLowerCase();
    if(tag==='input'||tag==='textarea'||tag==='select'||e.target?.isContentEditable||e.ctrlKey||e.metaKey||e.altKey) return;
    const k=e.key.toLowerCase();
    if(k==='v'){ setFirstPerson(!state.firstPerson); e.preventDefault(); return; }
    const map={w:'fwd',arrowup:'fwd',s:'back',arrowdown:'back',a:'left',arrowleft:'left',d:'right',arrowright:'right'};
    const act=map[k]; if(!act) return;
    e.preventDefault();
    if(state.firstPerson){
      if(act==='left') return turnPlayer(1);
      if(act==='right') return turnPlayer(-1);
      fpHeld.add(act); return;   // walked each frame in updateFirstPersonView
    }
    playerStep(cameraCardinal(act==='fwd'?'fwd':act));
  });
}
// ---- first-person view ----
let fpCam=null;
function setFirstPerson(on){
  const sc=state.scene, g=state.playerAvatar; if(!sc) return;
  if(on && !g) return;
  state.firstPerson=!!on;
  if(on){
    if(!fpCam){
      fpCam=new BABYLON.UniversalCamera('fp_cam',new BABYLON.Vector3(0,1,0),sc);
      fpCam.minZ=.05; fpCam.maxZ=600; fpCam.fov=1.0; fpCam.inputs.clear();
      // spatial audio and bubbles read camera.target
      Object.defineProperty(fpCam,'target',{get:()=>fpCam.getTarget(),configurable:true});
    }
    state.fpYaw=Math.atan2(g.dir.x,g.dir.z); state.fpPitch=.08;
    fpCam.rotation.set(state.fpPitch,state.fpYaw,0); fpCam.fov=1.0;
    try{ state.camera.detachControl(); }catch{}
    // The post-process pipelines (bloom/grading, SSAO) are attached to the
    // overview camera and kept drawing its view; move them over.
    const mgr=sc.postProcessRenderPipelineManager;
    for(const name of Object.keys(mgr?._renderPipelines||{})){ try{ mgr.detachCamerasFromRenderPipeline(name,state.camera); mgr.attachCamerasToRenderPipeline(name,fpCam); }catch(e){ console.warn('pipeline switch',name,e); } }
    sc.activeCamera=fpCam;
    g.rigRoot?.setEnabled(false); if(g.playerRing) g.playerRing.setEnabled(false);
  } else {
    const mgr=sc.postProcessRenderPipelineManager;
    if(fpCam) for(const name of Object.keys(mgr?._renderPipelines||{})){ try{ mgr.detachCamerasFromRenderPipeline(name,fpCam); mgr.attachCamerasToRenderPipeline(name,state.camera); }catch(e){ console.warn('pipeline switch',name,e); } }
    sc.activeCamera=state.camera;
    try{ state.camera.attachControl(canvas,true); }catch{}
    if(g){ g.rigRoot?.setEnabled(true); g.playerRing?.setEnabled(true); }
    fpHeld.clear();
    // Free walking leaves you between cells: step onto the nearest one.
    const lp=g?.logicalPos, cx=lp&&Math.round(lp.x), cz=lp&&Math.round(lp.z);
    if(lp && !g.turnMove && (Math.abs(lp.x-cx)>.01 || Math.abs(lp.z-cz)>.01)){
      const keep=g.dir.clone();
      if(cellPassable(cx,cz)) startTurnMove(g,new BABYLON.Vector3(cx-lp.x,0,cz-lp.z).normalize(),Math.hypot(cx-lp.x,cz-lp.z));
      setCharacterFacing(g,keep);
    } else if(g) setCharacterFacing(g,g.dir);
  }
  updateFirstPersonButton();
}
function updateFirstPersonView(dt){
  const g=state.playerAvatar; if(!state.firstPerson || !g || !fpCam) return;
  const s=g.root.scaling.y||.87, p=g.root.position;
  fpCam.position.set(p.x,p.y+(g.eyeHeight||.92*s/.87),p.z);
  fpWalk(g,dt);
  // The body faces where you look (exactly; g.dir keeps the grid direction
  // the game logic uses).
  if(!g.turnMove){ const f=fpForward(); if(f.x!==g.dir.x || f.z!==g.dir.z) setCharacterFacing(g,f); g.root.rotation.y=Math.atan2(-Math.sin(state.fpYaw??0),-Math.cos(state.fpYaw??0)); }
  // Look direction is free (mouse drag); the avatar faces its grid-snapped
  // version, so W walks where you look.
  let d=(state.fpYaw??0)-fpCam.rotation.y; d=Math.atan2(Math.sin(d),Math.cos(d));
  fpCam.rotation.y+=d*Math.min(1,dt*14);
  fpCam.rotation.x+=((state.fpPitch??.08)-fpCam.rotation.x)*Math.min(1,dt*14);
}
function updateFirstPersonButton(){
  const b=document.getElementById('firstPersonBtn'); if(!b) return;
  b.hidden=!state.playerAvatar; b.classList.toggle('active',!!state.firstPerson);
  b.title=state.firstPerson?'back to the overview (V)':'see through your avatar\'s eyes (V)';
  b.querySelector('span')&&(b.querySelector('span').textContent=state.firstPerson?'overview':'first person');
}
// Player chat appears as a bubble over the avatar (no voice, no history).
window.addEventListener('tablefolk-player-chat',e=>{
  const g=state.playerAvatar; if(!g) return;
  const div=document.createElement('div'); div.className='bubble player-bubble'; div.textContent=String(e.detail?.text||'').slice(0,86);
  document.body.appendChild(div); state.bubbles.push({div,node:g.root,ttl:3.2});
});
// After the player moves with the keys, ease the overview camera after the avatar.
function followAvatarCamera(dt){
  const g=state.playerAvatar, cam=state.camera; if(!g || !cam || state.firstPerson || !state.followAvatar) return;
  const want=new BABYLON.Vector3(g.root.position.x,.6,g.root.position.z);
  cam.target=BABYLON.Vector3.Lerp(cam.target,want,Math.min(1,dt*3));
  if(BABYLON.Vector3.Distance(cam.target,want)<.02 && !g.turnMove) state.followAvatar=false;
}
// Free a character and everything it imported (meshes, their own materials
// and textures, skeletons, animation groups, the kept walk-clip source).
function disposeCharacter(g){
  try { if (g.collider) g.collider.dispose(); } catch {}
  const o=g.owned;
  for (const ag of o?.groups||[]) { try{ ag.stop(); ag.dispose(); }catch{} }
  const mats=new Set(), morphs=new Set();
  for (const m of [...(o?.meshes||[]), ...(g.root?.getChildMeshes?.(false)||[])]) { if (m?.material) mats.add(m.material); if (m?.morphTargetManager) morphs.add(m.morphTargetManager); }
  try { if (g.root) g.root.dispose(false,false); } catch {}
  for (const m of o?.meshes||[]) { try{ if(!m.isDisposed()) m.dispose(false,false); }catch{} }
  for (const sk of o?.skeletons||[]) { try{ sk.dispose(); }catch{} }
  for (const mt of morphs) { try{ mt.dispose(); }catch{} }
  const shared=new Set(Object.values(state.materials||{}));
  for (const m of mats) { if(!shared.has(m)) disposeOwnMaterial(m); }
}
function clearWorld() {
  window.dispatchEvent(new CustomEvent('tablefolk:clear-conversations'));
  for (const g of state.characters) disposeCharacter(g);
  removePlayerAvatar();
  // Clean up character-local lights left by saves/scenes created by versions
  // before v14.6. TransformNode.dispose() does not dispose light children.
  for(const light of state.scene?.lights?.slice?.()||[]){
    if(/_portrait_(key|rim)$/.test(light.name||'')) try{ light.dispose(); }catch{}
  }
  for (const m of state.props.concat(state.blocks)) {
    if (!m || m.isDisposed?.()) continue;
    disposeWorldObject(m);
  }
  for(const item of state.bubbles.concat(state.badges)) item.div?.remove?.();
  state.characters = []; state.props = []; state.blocks = []; scheduleWallRebuild(); setPaint([],{replace:true}); state.bubbles=[]; state.badges=[]; state.held = new Map(); state.meta=new WeakMap();
  state.selected = null; state.target = null; /* brainConfigs intentionally preserved: agent customizations survive map clears and resets */
  state.globalHistory = [];
  state.turn = {index:0, phase:'ready', command:null, resolveMs:200, lastEndedAt:0, mode:true};
  refreshAgentSelect();
  log('map cleared: all characters and objects removed');
  updatePerceptionUI();
  updateTurnUI();
}

function clearConversationHistory() {
  window.dispatchEvent(new CustomEvent('tablefolk:clear-conversations'));
  state.globalHistory = [];
  for (const g of state.characters) {
    const cfg = getBrainConfig(g.id);
    cfg.messages = [];
    cfg.recent = [];
    cfg.pendingChat = [];
  }
  state.turn.index = 0;
  state.turn.command = null;
  state.turn.phase = 'ready';
  state.nextAgentId = state.selected?.id || state.characters[0]?.id || null;
  const visibleLog = document.getElementById('log');
  if (visibleLog) visibleLog.textContent = '';
  const prompt = document.getElementById('promptOut');
  if (prompt) prompt.textContent = 'History cleared. Step an agent to see its next prompt.';
  updateTurnUI();
  updatePerceptionUI();
  saveWorldState();
  log('chat and action history cleared');
}

function saveWorldState() {
  try {
    const data = {
      characters: state.characters.map(g => ({
        id: g.id,
        x: g.root.position.x, y: g.root.position.y, z: g.root.position.z,
        dx: g.dir.x, dy: g.dir.y, dz: g.dir.z,
        style: g.style, anim: g.anim, traits: g.traits, ...(g.charModel ? { model: g.charModel } : {}),
      })),
      props: state.props.filter(m => m && !m.isDisposed?.()).map(m => {
        const mm = meta(m);
        const rec={ type: mm?.type || 'crate', x: m.position.x, z: m.position.z, state: mm?.state || 'intact', health: mm?.health ?? 2 };
        const ry=m.rotationQuaternion ? m.rotationQuaternion.toEulerAngles().y : (m.rotation?.y||0); if(Math.abs(ry)>.01) rec.ry=+ry.toFixed(3);
        if(mm?.type==='note'){ rec.noteHtml=mm.noteHtml||''; rec.noteText=mm.noteText||''; }
        if(mm?.opts && Object.keys(mm.opts).length) rec.opts=mm.opts;
        return rec;
      }),
      blocks: state.blocks.filter(m => m && !m.isDisposed?.()).map(m => {
        const mm = meta(m);
        return { type: mm?.type || 'wall', x: m.position.x, z: m.position.z, state: mm?.state || 'intact', health: mm?.health ?? 3, ...(mm?.rim ? {rim:true} : {}) };
      }),
      brainConfigs: Array.from(state.brainConfigs.entries()),
      player: state.player,
      playerAvatar: state.playerAvatar ? { model: state.playerAvatar.avatarModel, x: state.playerAvatar.logicalPos?.x ?? state.playerAvatar.root.position.x, z: state.playerAvatar.logicalPos?.z ?? state.playerAvatar.root.position.z, dx: state.playerAvatar.dir.x, dz: state.playerAvatar.dir.z } : null,
      paint: state.paint ? [...state.paint].map(([k,v])=>[...k.split(',').map(Number),v.mat,v.tint||null]) : [],
      baseMap: state.baseMap||'island', campfire: state.campfire!==false, worldSize: [WORLD.cols, WORLD.rows],
      wallStyle: state.wallStyle||'tabletop',
      nextSpawnId: state.nextSpawnId,
      globalHistory: state.globalHistory.slice(-50),
      turnIndex: state.turn.index,
      allowed: Array.from(state.allowed),
      ts: Date.now(),
    };
    // Scenarios save under their own key so they never overwrite the sandbox.
    localStorage.setItem(state.saveKey||'tablefolkState', JSON.stringify(data));
  } catch (e) { console.warn('saveWorldState failed:', e); }
}

function normalizeWorldState(data){
  if(data?.format==='tablefolk-recording-state'){
    return {
      characters:(data.agents||[]).map(g=>({
        id:g.id, x:g.position?.x||0, y:g.position?.y||0, z:g.position?.z||0,
        dx:g.facing?.x||0, dy:g.facing?.y||0, dz:g.facing?.z??-1,
        style:g.style, anim:g.anim, traits:g.traits, model:g.model
      })),
      props:data.props||[], blocks:data.blocks||[],
      brainConfigs:(data.agents||[]).filter(g=>g.brainConfig).map(g=>[g.id,g.brainConfig]),
      nextSpawnId:(data.agents?.length||0)+1, globalHistory:data.globalHistory||[],
      turnIndex:data.turn?.index||0, allowed:data.allowed||[], player:data.player,
      paint:data.paint, baseMap:data.baseMap, wallStyle:data.wallStyle, campfire:data.campfire
    };
  }
  return data;
}
async function restoreWorldState(input) {
  const data=normalizeWorldState(input);
  if(!data || !Array.isArray(data.characters)) throw new Error('embedded state has no agents');
  clearWorld();
  if(data.allowed) state.allowed=new Set(data.allowed);
  // Base map and wall style first (walls built below use the style); the
  // dungeon's floor and rim walls come back as saved paint/walls, not rebuilt.
  state.wallStyle=data.wallStyle||'tabletop';
  if(!LEGACY_ISLAND) setWorldSize(...(data.worldSize||BOARD_DEFAULT));
  setBaseMap(data.baseMap||'island',{build:false});
  setCampfire(data.campfire!==false);
  setPaint((data.paint||[]).map(([x,z,mat,tint])=>({x,z,mat,tint})),{replace:true});
  if(data.player) state.player={gold:Number(data.player.gold)||0,items:Array.isArray(data.player.items)?data.player.items:[]};
  for(const p of (data.props||[])){
      let obj;
      if (p.type === 'barrel') obj = makeBarrel(state.scene, p.x, p.z);
      else if (p.type === 'mushroom') obj = makeMushroom(state.scene, p.x, p.z);
      else if (p.type === 'lamp') obj = makeLamp(state.scene, p.x, p.z);
      else if (p.type === 'note') obj = makeNote(state.scene, p.x, p.z, p.noteHtml||p.noteText||'<p>note</p>');
      else if (window.tablefolkScenery?.types.includes(p.type)) obj = window.tablefolkScenery.make(p.type, p.x, p.z, {...(p.opts||{}), ry:p.ry||0});
      else if (ITEM_CATALOG[p.type]) obj = keepLoot(makeCatalogItem(state.scene, p.type, p.x, p.z, {ry:p.ry||0}), p.opts);
      else obj = makeCrate(state.scene, p.x, p.z);
    if(obj){ const mm=meta(obj); if(mm){ mm.state=p.state||'intact'; mm.health=p.health??mm.health; } }
  }
  for(const b of (data.blocks||[])){
    const cracked=b.state==='cracked';
    const obj=b.type==='door' ? makeDoor(state.scene,b.x,b.z,{}) : makeBlock(state.scene,b.x,b.z,cracked);
    if(obj){ const mm=meta(obj); if(mm){ mm.state=b.state||'intact'; mm.health=b.health??mm.health; if(b.rim) mm.rim=true; } }
  }
  const palettes=[
    {hat:state.materials.hat1,belly:state.materials.belly1,dark:state.materials.foot},
    {hat:state.materials.hat2,belly:state.materials.belly2,dark:state.materials.foot},
    {hat:state.materials.hat3,belly:state.materials.belly3,dark:state.materials.foot,clay:state.materials.bot},
  ];
  const styles=['goblin','mushroom','bot'];
  for(const g of data.characters){
    const palIdx=styles.indexOf(g.style), palette=palIdx>=0?palettes[palIdx]:palettes[0];
    let character;
    if(isPersonModel(g.model)) try{ character=await createPerson(g.id,new BABYLON.Vector3(g.x,g.y,g.z),g.model,g.model); }catch(e){ console.warn('person restore failed',e); }
    if(!character) try{ character=await createGeneratedCritter(state.scene,g.id,new BABYLON.Vector3(g.x,g.y,g.z)); }
    catch(e){
      console.warn('generated rigged character restore failed; using procedural fallback',e);
      character=createCritter(state.scene,g.id,new BABYLON.Vector3(g.x,g.y,g.z),palette,g.style||'goblin');
    }
    setCharacterFacing(character,new BABYLON.Vector3(g.dx||0,g.dy||0,g.dz??-1));
    character.anim=g.anim||'idle';
    if(g.traits) character.traits=g.traits;
    setCharacterLogicalPosition(character,new BABYLON.Vector3(g.x,0,g.z));
  }
  if(data.brainConfigs){
    const incoming=new Map(data.brainConfigs);
    for(const [id,cfg] of incoming) state.brainConfigs.set(id,cfg);
    for(const id of Array.from(state.brainConfigs.keys())){
      if(!incoming.has(id) && !state.characters.some(g=>g.id===id)) state.brainConfigs.delete(id); // prune only orphans
    }
  }
  state.nextSpawnId=data.nextSpawnId||(state.characters.length+1);
  state.globalHistory=data.globalHistory||[];
  state.turn.index=data.turnIndex||0;
  if(data.playerAvatar){ const a=data.playerAvatar; await spawnPlayerAvatar(a.x,a.z, Math.abs(a.dz||0)>=Math.abs(a.dx||0) ? ((a.dz||-1)<0?'n':'s') : ((a.dx||0)<0?'e':'w'), a.model); }
  const avCb=document.getElementById('avatarToggle'); if(avCb) avCb.checked=!!state.playerAvatar;
  renderPlayerInventory();
  const bms=document.getElementById('baseMapSelect'); if(bms) bms.value=state.baseMap||'island';
  const wss=document.getElementById('wallStyleSelect'); if(wss) wss.value=state.wallStyle||'tabletop';
  if(state.characters.length>0) selectCharacter(state.characters[0]);
  refreshAgentSelect(); updatePerceptionUI(); updateTurnUI(); saveWorldState();
  return true;
}
async function loadWorldState() {
  try {
    const raw=localStorage.getItem(state.saveKey||'tablefolkState');
    if(!raw) return false;
    await restoreWorldState(JSON.parse(raw));
    log('world state restored from save');
    return true;
  } catch (e) {
    console.warn('loadWorldState failed:', e);
    return false;
  }
}

function installWorldAPI(){
  const prior=window.tablefolk||{};
  window.tablefolk={...prior,ready:true,state,log,parseCommand,parseLLMCommandLine,
    getAgents:()=>state.characters.slice(), getSelectedAgent:()=>state.selected,
    getBrainConfig, setBrainConfig, refreshAgentSelect,
    getAllowedCommands:(agentId=null)=>Array.from(commandsFor(state.characters.find(x=>x.id===agentId))), allowedFor, commandsFor, canRun,
    getAgentPerception:(agentId=null,radius=7)=>buildVisiblePerception(agentId,radius), buildVisiblePerception,
    parseInventoryItems, formatInventoryItems, getPlayer:()=>state.player,
    // scenario support (scenario.js)
    WORLD, ITEM_CATALOG, hasGroundAt, setWorldSize, rebuildBoard, sceneryAt, sceneryAnchors, spawnAgent, makeObject, getObjects, selectCharacter, inventoryChanged,
    findItem:(items,name)=>findItem(items||[],name),
    setPlayer:p=>{ state.player={gold:Number(p?.gold)||0,items:Array.isArray(p?.items)?p.items.filter(i=>i!=null&&(typeof i==='string'||i.name)).map(i=>typeof i==='string'?{name:i,qty:1}:{name:String(i.name),qty:i.qty??1}):[]}; const n=document.getElementById('chatName'); if(n && p?.name) n.value=p.name; renderPlayerInventory(); },
    setAllowed:list=>{ state.allowed=new Set(list||[]); updatePerceptionUI(); },
    setPathfinding:on=>{ state.pathfinding=on!==false; }, findRoute,
    setPaint, paintAt, PAINT_MATERIALS, setBaseMap, setCampfire,
    spawnPlayerAvatar, removePlayerAvatar, getPlayerAvatar:()=>state.playerAvatar, setFirstPerson, setWallStyle:st=>{ state.wallStyle=['block','modern','stone'].includes(st)?st:'tabletop'; },
    setWallHeight:v=>{ state.wallHeightScale=Number.isFinite(+v) && +v>0 ? Math.min(4,Math.max(.25,+v)) : 1; },
    setLighting,
    showThought:(agentId,text,pending=false)=>showThought(state.characters.find(x=>x.id===agentId),text,pending),
    clearPendingThought:agentId=>clearPendingThought(state.characters.find(x=>x.id===agentId)),
    executeAgentCommand:(agentId,cmd)=>beginTurnForAgent(agentId,cmd,'agent-object'),
    runAgentCommand:(agentId,raw)=>beginTurnForAgent(agentId,parseCommand(raw),'agent-text'),
    stepAgentTurn:beginTurnForAgent,
    isTurnReady:()=>state.turn.phase==='ready',
    canSeeEachOther, disposeWorldObject, setCharacterLogicalPosition,
    defaultVoiceFor,
    spawnCharacter, spawnProp, spawnAt, clearWorld, clearConversationHistory, buildAgentPrompt, saveWorldState, restoreWorldState,
  };
}

function setupUI(){
  installDirectControlHandlers();
  refreshAgentSelect();
  const cmdInp=document.getElementById('cmd');
  if(cmdInp) cmdInp.addEventListener('keydown',e=>{ if(e.key==='Enter'&&cmdInp.value.trim()){ runCommand(cmdInp.value.trim()); cmdInp.value=''; } });
  const allowed=document.getElementById('allowedCommands');
  if(allowed){
    allowed.textContent='';
    for(const c of COMMANDS){
      const lab=document.createElement('label'); lab.className='cmdcheck';
      const chk=document.createElement('input'); chk.type='checkbox'; chk.dataset.command=c; chk.checked=state.allowed.has(c);
      chk.onchange=()=>{
        // A character with its own list edits that list; otherwise the shared one.
        const g=state.selected, own=g && Array.isArray(state.brainConfigs.get(g.id)?.allowed);
        if(own){ const set=allowedFor(g); chk.checked?set.add(c):set.delete(c); setBrainConfig(g.id,{allowed:[...set]}); }
        else chk.checked?state.allowed.add(c):state.allowed.delete(c);
        document.querySelectorAll('button[data-cmd]').forEach(btn=>{
          const cmd=parseCommand(btn.dataset.cmd);
          btn.disabled=!!(cmd&&!canRun(cmd.kind,cmd.spell,state.selected));
        });
        updatePerceptionUI();
      };
      lab.append(chk,document.createTextNode(c)); allowed.appendChild(lab);
    }
  }
  const bodyStyle=document.getElementById('bodyStyle');
  if(bodyStyle) bodyStyle.onchange=e=>{ const g=state.selected; if(!g) return; g.style=e.target.value; if(g.rigged){ say(g,'visual style comes from KayKit character asset now'); updatePerceptionUI(); return; } const isM=e.target.value==='mushroom', isB=e.target.value==='bot'; g.cosmetic.hat.material=isM?state.materials.mushroom:(isB?state.materials.bot:g.cosmetic.hat.material); g.head.material=isB?state.materials.bot:state.materials.critter; say(g,'new body style: '+e.target.value); updatePerceptionUI(); };
  const refresh=document.getElementById('refreshPerception'); if(refresh) refresh.onclick=updatePerceptionUI;
  const radius=document.getElementById('visionRadius'); if(radius) radius.onchange=updatePerceptionUI;
  const turnMode=document.getElementById('turnMode'); if(turnMode) turnMode.onchange=()=>{ state.turn.mode=turnMode.checked; settleWorld(turnMode.checked?'turn mode on':'turn mode off'); };
  const settle=document.getElementById('settleNow'); if(settle) settle.onclick=()=>settleWorld('manual settle');
  const copy=document.getElementById('copyPerception'); if(copy) copy.onclick=()=>{ const text=buildVisiblePerception(null,document.getElementById('visionRadius')?.value||5); navigator.clipboard?.writeText(text); log('copied perception text'); };
  const showMap=document.getElementById('showAsciiMap'); if(showMap) showMap.onchange=updatePerceptionUI;
  const clearMapBtn=document.getElementById('clearMap'); if(clearMapBtn) clearMapBtn.onclick=async()=>{
    if(await window.confirmDialog('Clear all characters and objects from the map?',{title:'Clear map?',confirmText:'clear map',danger:true})) {
      const snap=localStorage.getItem(state.saveKey||'tablefolkState');
      window._tablefolkLogToastMuteUntil=performance.now()+1500;
      clearWorld(); saveWorldState();
      window.tablefolkToast?.('map cleared: all characters and objects removed',{type:'warn',duration:9000,action:snap?{label:'undo',onClick:async()=>{ try{ await restoreWorldState(JSON.parse(snap)); window.tablefolkToast?.('map restored',{type:'success'}); }catch(e){ window.tablefolkToast?.('undo failed: '+(e?.message||e),{type:'error'}); } }}:null});
    }
  };
  const resetStateBtn=document.getElementById('resetState'); if(resetStateBtn) resetStateBtn.onclick=async()=>{
    if(await window.confirmDialog('Reset to a blank demo world with one character? Character customizations (personality, voice, chaos etc.) are kept.',{title:'Reset state?',confirmText:'reset world',danger:true})) {
      const snap=localStorage.getItem(state.saveKey||'tablefolkState');
      window._tablefolkLogToastMuteUntil=performance.now()+2500;
      localStorage.removeItem('tablefolkState'); clearWorld();
      createGeneratedCritter(state.scene,'folk1',new BABYLON.Vector3(0,.06,0)).then(g=>{
        setCharacterLogicalPosition(g,new BABYLON.Vector3(0,0,0)); refreshAgentSelect(); selectCharacter(g); saveWorldState();
        log('state reset: blank demo world with one character');
        window.tablefolkToast?.('world reset to blank demo',{type:'warn',duration:9000,action:snap?{label:'undo',onClick:async()=>{ try{ await restoreWorldState(JSON.parse(snap)); window.tablefolkToast?.('previous world restored',{type:'success'}); }catch(e){ window.tablefolkToast?.('undo failed: '+(e?.message||e),{type:'error'}); } }}:null});
      }).catch(err=>{ console.error('reset character failed',err); window.tablefolkToast?.('reset failed: '+(err?.message||err),{type:'error'}); });
    }
  };
  const resetCustomBtn=document.getElementById('resetCustomizations'); if(resetCustomBtn) resetCustomBtn.onclick=async()=>{
    if(await window.confirmDialog('Reset ALL character customizations (personality, style, voice, chaos, goals) back to defaults for every character? Conversation history is also cleared.',{title:'Reset customizations?',confirmText:'reset customizations',danger:true})) {
      state.brainConfigs=new Map();
      for(const g of state.characters) getBrainConfig(g.id);
      refreshAgentSelect(); saveWorldState(); updatePerceptionUI();
      window.tablefolkToast?.('character customizations reset to defaults',{type:'warn',duration:6000});
    }
  };
  const clearHistoryBtn=document.getElementById('clearHistory'); if(clearHistoryBtn) clearHistoryBtn.onclick=async()=>{
    if(await window.confirmDialog('Clear chat and action history for every character? The world and all customization will stay as they are.',{title:'Clear history?',confirmText:'clear history',danger:true})) {
      clearConversationHistory();
    }
  };
  const playerGold=document.getElementById('playerGold');
  if(playerGold){ playerGold.oninput=()=>{ const n=parseInt(playerGold.value,10); if(Number.isFinite(n)&&n>=0){ state.player.gold=n; updatePerceptionUI(); saveWorldState(); } }; }
  renderPlayerInventory();
  const thinkSel=document.getElementById('gfxThinkFps');
  if(thinkSel){ try{ const v=localStorage.getItem('tablefolkThinkFps'); if(v!==null) thinkSel.value=v; }catch{} thinkSel.onchange=()=>{ try{ localStorage.setItem('tablefolkThinkFps',thinkSel.value); }catch{} }; }
  const baseMapSel=document.getElementById('baseMapSelect');
  if(baseMapSel){ baseMapSel.value=state.baseMap||'island'; baseMapSel.onchange=()=>{ setBaseMap(baseMapSel.value); updatePerceptionUI(); saveWorldState(); log('base map: '+baseMapSel.value); }; }
  setupPlayerControls(); setupFirstPersonLook();
  const avCb=document.getElementById('avatarToggle');
  if(avCb){ avCb.checked=!!state.playerAvatar; avCb.onchange=async()=>{ if(avCb.checked){ const c=state.camera.target; await spawnPlayerAvatar(Math.round(c.x),Math.round(c.z)+1); } else removePlayerAvatar(); saveWorldState(); }; }
  const fpBtn=document.getElementById('firstPersonBtn'); if(fpBtn) fpBtn.onclick=()=>setFirstPerson(!state.firstPerson);
  updateFirstPersonButton();
  const fireCb=document.getElementById('campfireToggle');
  if(fireCb){ fireCb.checked=state.campfire!==false; fireCb.onchange=()=>{ setCampfire(fireCb.checked); updatePerceptionUI(); saveWorldState(); }; }
  const wallSel=document.getElementById('wallStyleSelect');
  if(wallSel){ wallSel.value=state.wallStyle||'tabletop'; wallSel.onchange=()=>{
    state.wallStyle=wallSel.value;
    // Rebuild every wall (and door) in the new style, keeping its state.
    const isWallish=b=>['wall','door'].includes(meta(b)?.type);
    const old=state.blocks.filter(b=>!b.isDisposed?.() && isWallish(b)).map(b=>({x:b.position.x,z:b.position.z,mm:{...meta(b)}}));
    for(const b of state.blocks.filter(isWallish)) disposeWorldObject(b);
    state.blocks=state.blocks.filter(b=>!b.isDisposed?.());
    for(const o of old){ const b=o.mm.type==='door' ? makeDoor(state.scene,o.x,o.z,{}) : makeBlock(state.scene,o.x,o.z,o.mm.state==='cracked'); const mm=meta(b); mm.state=o.mm.state; mm.health=o.mm.health; if(o.mm.rim) mm.rim=true; }
    scheduleWallRebuild(); saveWorldState();
  }; }
  const spawnModeEnabled=document.getElementById('spawnModeEnabled'); if(spawnModeEnabled) spawnModeEnabled.onchange=()=>{
    state.spawnMode.enabled = spawnModeEnabled.checked;
    canvas.style.cursor = state.spawnMode.enabled ? 'crosshair' : '';
    log(state.spawnMode.enabled ? 'click-to-spawn enabled: ' + state.spawnMode.type : 'click-to-spawn disabled');
  };
  const spawnModeType=document.getElementById('spawnModeType'); if(spawnModeType) spawnModeType.onchange=()=>{
    state.spawnMode.type = spawnModeType.value;
    if(state.spawnMode.enabled) log('spawn type: ' + state.spawnMode.type);
  };
  updatePerceptionUI(); updateTurnUI();
}

let _hudFrame=0;
function updateBubbles(dt){
  const camera=state.camera, scene=state.scene, engine=state.engine;
  // Cache the transform matrix once per frame instead of recomputing it for
  // every bubble and badge. Vector3.Project calls getTransformMatrix() each
  // time, which is expensive matrix math.
  const tm=scene.getTransformMatrix();
  const vp=camera.viewport.toGlobal(engine.getRenderWidth(),engine.getRenderHeight());
  function project(node,dy=1.7){ return BABYLON.Vector3.Project(node.getAbsolutePosition().add(new BABYLON.Vector3(0,dy,0)),BABYLON.Matrix.IdentityReadOnly,tm,vp); }
  // Bubbles: project the head (dy=1.0) then apply a fixed 42px screen-space
  // offset so the bubble stays a consistent visual distance from the head
  // regardless of ortho zoom level (was: fixed world-space dy=1.7 which
  // drifted far above the head when zoomed in, overlapped when zoomed out).
  for(const b of [...state.bubbles]){ b.ttl-=dt; if(b.ttl<=0){ b.div.remove(); state.bubbles=state.bubbles.filter(x=>x!==b); } }
  // Stack a character's bubbles instead of drawing them on top of each other:
  // speech nearest the head (oldest lowest), thoughts above.
  const stack=new Map();
  for(const b of [...state.bubbles].sort((a,c)=>(a.thought?1:0)-(c.thought?1:0))){
    const p=project(b.node,1.0), up=stack.get(b.node)||0;
    b.div.style.left=p.x+'px'; b.div.style.top=(p.y-42-up)+'px';
    stack.set(b.node,up+b.div.offsetHeight+6);
  }
  for(const b of [...state.badges]){ b.ttl-=dt; const node=b.node.root||b.node; const p=project(node,.8); b.div.style.left=p.x+'px'; b.div.style.top=(p.y+b.vy*(1-b.ttl))+'px'; b.div.style.opacity=Math.max(0,b.ttl); if(b.ttl<=0){ b.div.remove(); state.badges=state.badges.filter(x=>x!==b); } }
}
function updateCompassHUD(){
  if(!state.camera||!state.scene||!state.engine||!compassHud) return;
  // Throttle to every 3rd frame: the compass rose only needs coarse position
  // updates and each call does 5x Vector3.Project (expensive matrix math).
  if((++_hudFrame%3)!==0) return;
  const camera=state.camera, scene=state.scene, engine=state.engine;
  const rose=compassHud.querySelectorAll('span');
  const cardinals=[
    new BABYLON.Vector3(0,0,-1), // north
    new BABYLON.Vector3(-1,0,0), // east (project convention)
    new BABYLON.Vector3(0,0,1),  // south
    new BABYLON.Vector3(1,0,0),  // west
  ];
  const origin=camera.target.clone(); origin.y=0;
  const tm=scene.getTransformMatrix();
  const viewport=camera.viewport.toGlobal(engine.getRenderWidth(),engine.getRenderHeight());
  const center=BABYLON.Vector3.Project(origin,BABYLON.Matrix.IdentityReadOnly,tm,viewport);
  const r=27;
  rose.forEach((el,i)=>{
    const point=BABYLON.Vector3.Project(origin.add(cardinals[i]),BABYLON.Matrix.IdentityReadOnly,tm,viewport);
    const a=Math.atan2(point.y-center.y,point.x-center.x);
    el.style.transform=`translate(${Math.cos(a)*r}px,${Math.sin(a)*r}px) translate(-50%,-50%)`;
  });
  const forward=camera.target.subtract(camera.position); forward.y=0;
  const name=facingNameFromDir(forward)[0].toUpperCase();
  const character=state.selected || state.characters[0];
  const charFacing=character ? facingNameFromDir(character.dir)[0].toUpperCase() : '—';
  compassHud.querySelector('small').textContent='camera '+name+' · character '+charFacing+' · N=-Z E=-X';
}
function animate(dt){ updateFirstPersonView(dt); followAvatarCamera(dt); for(const g of (state.playerAvatar?state.characters.concat(state.playerAvatar):state.characters)){ if(g.falling){ g.t+=dt; updateFall(g,dt); continue; } if(g.turnMove){ g.turnMove.t+=dt/g.turnMove.dur; const u=clamp(g.turnMove.t,0,1); const k=u*u*(3-2*u); let p;
      if(g.turnMove.path){ const pp=pathPoint(g.turnMove,k); p=pp.p; if(pp.dir.lengthSquared()>1e-6) setCharacterFacing(g,legFacing(pp.dir)); } else p=BABYLON.Vector3.Lerp(g.turnMove.start,g.turnMove.end,k);
      // Walked off the island: fall instead of hovering over the sea.
      if(!hasGroundAt(p.x,p.z)){ const tm=g.turnMove, len=BABYLON.Vector3.Distance(tm.start,tm.end)||1; g.lastSafePos=tm.start.clone(); startFall(g,tm.end.subtract(tm.start).scale(clamp(len/tm.dur,1.4,3.4)/len)); continue; }
      g.root.position.x=p.x; g.root.position.z=p.z; g.root.position.y=state.terrainTopY??0; if(g.collider) forceBodyTransform(g.collider,new BABYLON.Vector3(p.x,(state.terrainTopY??0)+.74,p.z)); if(u>=1){ const end=g.turnMove.end.clone(); delete g.turnMove; setCharacterLogicalPosition(g,end); } } g.t+=dt; if(g.rigged){ g.root.rotation.y=yawForDir(g.dir); updateProceduralEmote(g,dt); if(g.mouth) updateMouth(g,dt); else if(g.speaking && !g.charModel){ const heads=findHeadNodes(g); if(heads.length){ const mouth=Math.abs(Math.sin(g.t*14))*.18+.82; for(const h of heads) h.scaling.y=mouth; } } positionHeldItem(g,dt); continue; } positionHeldItem(g,dt);
    const breathe=1+Math.sin(g.t*3.1)*.026; g.body.scaling.y=breathe; g.head.position.y=1.08+Math.sin(g.t*2.2)*.025; g.root.rotation.y=yawForDir(g.dir); if(g.anim==='walk'){ g.feet[0].rotation.x=Math.sin(g.t*17)*.75; g.feet[1].rotation.x=-Math.sin(g.t*17)*.75; }
    else if(g.anim==='panic'){ g.root.rotation.y+=Math.sin(g.t*28)*.055; g.arms[0].rotation.z=.92+Math.sin(g.t*21)*.5; g.arms[1].rotation.z=-.92-Math.sin(g.t*19)*.5; g.head.scaling.x=1.06; }
    else if(g.anim==='talk'){ g.head.scaling.y=1+Math.sin(g.t*24)*.065; g.arms[0].rotation.z=.44; g.arms[1].rotation.z=-.44; }
    else if(g.anim==='cast'){ g.arms[0].rotation.z=1.05+Math.sin(g.t*18)*.1; g.arms[1].rotation.z=-1.05-Math.sin(g.t*18)*.1; g.head.position.y=1.15; }
    else if(g.anim==='push'){ g.body.rotation.x=Math.sin(g.t*18)*.08; g.arms[0].rotation.z=.72; g.arms[1].rotation.z=-.72; }
    else { g.head.scaling.set(1,1,1); g.body.rotation.x=0; g.arms[0].rotation.z=.28+Math.sin(g.t*2)*.04; g.arms[1].rotation.z=-.28-Math.sin(g.t*2.1)*.04; }
  } if(isTurnMode() && state.turn.phase==='ready'){ for(const g of state.characters) if(!g.falling) zeroMeshMotion(g.collider); } updateBubbles(dt); updateCompassHUD(); }

// v12 terrain patch: avoid WebGPU vertex-color/material weirdness and water z-fighting.
// Uses simple StandardMaterial colored meshes at separated Y heights.
function terrainMat(scene,name,color,spec=.5,emissive=null,alpha=1){
  const m=new BABYLON.StandardMaterial(name,scene);
  m.diffuseColor=color;
  m.specularColor=new BABYLON.Color3(spec,spec,spec);
  if(emissive) m.emissiveColor=emissive;
  m.alpha=alpha;
  m.backFaceCulling=false;
  return m;
}
function makePathRibbon(scene){
  const left=[], right=[];
  for(let i=0;i<=72;i++){
    const x=-13.2 + i*(26.4/72);
    const center=Math.sin(x*.28)*.48 + Math.sin(x*.77+1.8)*.18;
    const width=1.25 + smoothNoise(x*.35,9)*.42;
    const edgeWobble=(smoothNoise(x*1.4,4)-.5)*.28;
    left.push(new BABYLON.Vector3(x,.031,center-width+edgeWobble));
    right.push(new BABYLON.Vector3(x,.032,center+width-edgeWobble*.55));
  }
  const mesh=BABYLON.MeshBuilder.CreateRibbon('soft_irregular_dirt_path',{pathArray:[left,right],sideOrientation:BABYLON.Mesh.DOUBLESIDE},scene);
  mesh.material=mat(scene,'v12_dirt_path_tex','dirt_path.png',{uScale:7,vScale:7,specular:new BABYLON.Color3(.010,.010,.009)});
  mesh.receiveShadows=true; mesh.isPickable=false;
  return mesh;
}
function makeStoneQuarrySurface(scene){
  const stone=BABYLON.MeshBuilder.CreateGround('soft_stone_quarry_surface',{width:13,height:10,subdivisions:2},scene);
  stone.position.set(8.9,.026,-10.4); stone.rotation.y=.025;
  stone.material=mat(scene,'v12_soft_stone_tex','stone_soft.png',{uScale:6,vScale:5,specular:new BABYLON.Color3(.015,.015,.014)});
  stone.receiveShadows=true; stone.isPickable=false;
  return stone;
}
function makeWaterMat(scene){
  const m=mat(scene,'v12_water_base_tex','water_painterly.png',{uScale:3,vScale:3.4,alpha:.93,roughness:.22,detail:0,emissive:new BABYLON.Color3(.02,.08,.09)});
  m.albedoColor=new BABYLON.Color3(.62,.92,.98); m.environmentIntensity=.82; m.specularIntensity=.75;
  return m;
}
function makeFoamTexture(scene){
  const S=256; const cv=document.createElement('canvas'); cv.width=S; cv.height=S;
  const ctx=cv.getContext('2d'); ctx.clearRect(0,0,S,S);
  for(let i=0;i<46;i++){ const x=(i/46)*S+((i*37)%13-6), y=S*.5+Math.sin(i*1.7)*S*.16; const r=7+((i*23)%14);
    const rg=ctx.createRadialGradient(x,y,1,x,y,r); rg.addColorStop(0,'rgba(255,255,255,0.85)'); rg.addColorStop(1,'rgba(255,255,255,0)');
    ctx.fillStyle=rg; ctx.beginPath(); ctx.arc(x,y,r,0,7); ctx.fill(); }
  const tex=new BABYLON.DynamicTexture('foam_dyn',cv,scene,true); tex.update();
  tex.wrapU=BABYLON.Texture.WRAP_ADDRESSMODE; tex.wrapV=BABYLON.Texture.CLAMP_ADDRESSMODE; tex.hasAlpha=true;
  return tex;
}
function makeBetterWater(scene){
  const water=BABYLON.MeshBuilder.CreateGround('water_lagoon_sheet',{width:9.72,height:11.92,subdivisions:28},scene);
  water.position.set(11.05,.155,9.05); water.material=makeWaterMat(scene); water.isPickable=false; water.receiveShadows=false;
  const pos=water.getVerticesData(BABYLON.VertexBuffer.PositionKind); water.metadata={basePositions:pos.slice(),animatedPositions:pos};
  // Shimmer layer scrolling against the base for interference sparkle.
  const shim=BABYLON.MeshBuilder.CreateGround('water_shimmer',{width:9.72,height:11.92,subdivisions:1},scene);
  shim.position.set(11.05,.168,9.05); shim.isPickable=false;
  const shimM=mat(scene,'v12_water_shim_tex','water_soft.png',{uScale:2.1,vScale:2.6,alpha:.32,emissive:new BABYLON.Color3(.03,.10,.11),specular:new BABYLON.Color3(.6,.7,.7)});
  shimM.albedoColor=new BABYLON.Color3(.7,1,1); shimM.unlit=true;
  shim.material=shimM;
  const baseTx=water.material.albedoTexture, shimTx=shimM.albedoTexture;
  // Cartoon foam rim hugging the pond's edges.
  const foamTx=makeFoamTexture(scene);
  const foamM=new BABYLON.StandardMaterial('v12_foam',scene);
  foamM.emissiveColor=new BABYLON.Color3(.95,1,1); foamM.diffuseColor=new BABYLON.Color3(0,0,0);
  foamM.opacityTexture=foamTx; foamM.disableLighting=true; foamM.backFaceCulling=false;
  const W=9.72,H=11.92,cx=11.05,cz=9.05,bw=.42;
  const mkFoam=(w,h,x,z,rot)=>{ const f=BABYLON.MeshBuilder.CreateGround('foam_edge',{width:w,height:h},scene); f.position.set(x,.175,z); f.rotation.z=rot||0; f.material=foamM; f.isPickable=false; return f; };
  mkFoam(W,bw,cx,cz-H/2+bw*.4); mkFoam(W,bw,cx,cz+H/2-bw*.4);
  const left=mkFoam(H,bw,0,0,0); left.rotation.y=Math.PI/2; left.position.set(cx-W/2+bw*.4,.175,cz);
  const right=mkFoam(H,bw,0,0,0); right.rotation.y=Math.PI/2; right.position.set(cx+W/2-bw*.4,.175,cz);
  scene.onBeforeRenderObservable.add(()=>{
    const t=performance.now()*0.001, arr=water.metadata.animatedPositions, base=water.metadata.basePositions;
    for(let i=0;i<arr.length;i+=3){ const x=base[i], z=base[i+2]; arr[i+1]=Math.sin(x*1.35+t*.9+z*.21)*.022+Math.sin(z*1.85-t*.72)*.013; }
    water.updateVerticesData(BABYLON.VertexBuffer.PositionKind,arr,false,false);
    if(baseTx){ baseTx.uOffset=(t*.014)%1; baseTx.vOffset=(Math.sin(t*.11)*.01); }
    if(shimTx){ shimTx.uOffset=(-t*.021)%1; shimTx.vOffset=(t*.012)%1; }
  });
  return water;
}
function makeGroundTexture(scene){
  const S=1024, T=S/32;
  const cv=document.createElement('canvas'); cv.width=cv.height=S;
  const ctx=cv.getContext('2d');
  const g=ctx.createLinearGradient(0,0,S,S);
  g.addColorStop(0,'#4a7a2e'); g.addColorStop(.5,'#41722b'); g.addColorStop(1,'#4b7c33');
  ctx.fillStyle=g; ctx.fillRect(0,0,S,S);
  for(let tx=0;tx<32;tx++)for(let tz=0;tz<32;tz++){
    if(((tx*31+tz*17)%7)<3){ ctx.fillStyle='rgba('+(30+((tx*13+tz*7)%25))+','+(70+((tx*11+tz*5)%35))+',26,'+(0.05+(((tx+tz)%5)*.02))+')'; ctx.fillRect(tx*T,tz*T,T,T); }
  }
  for(let i=0;i<9000;i++){ const x=Math.random()*S,y=Math.random()*S,r=Math.random()*2.2+.6; ctx.fillStyle=Math.random()<.5?'rgba(255,255,215,0.05)':'rgba(12,32,10,0.06)'; ctx.beginPath(); ctx.arc(x,y,r,0,7); ctx.fill(); }
  ctx.strokeStyle='rgba(20,38,14,0.45)'; ctx.lineWidth=2.2;
  for(let i=0;i<=32;i++){ const c=i*T; ctx.beginPath(); ctx.moveTo(c,0); ctx.lineTo(c,S); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0,c); ctx.lineTo(S,c); ctx.stroke(); }
  ctx.strokeStyle='rgba(215,255,175,0.09)'; ctx.lineWidth=1;
  for(let i=0;i<=32;i++){ const c=i*T+2.4; ctx.beginPath(); ctx.moveTo(c,0); ctx.lineTo(c,S); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0,c); ctx.lineTo(S,c); ctx.stroke(); }
  const tex=new BABYLON.DynamicTexture('ground_baked_dyn',cv,scene,true);
  tex.update(); tex.wrapU=tex.wrapV=BABYLON.Texture.CLAMP_ADDRESSMODE; tex.anisotropicFilteringLevel=8;
  return tex;
}
function makeTileGridLines(scene){
  const lines=[];
  for(let i=0;i<=32;i++){
    const c=-16+i;
    const h=BABYLON.MeshBuilder.CreateBox('gridline_h',{width:32,height:.014,depth:.05},scene); h.position.set(0,.03,c);
    const v=BABYLON.MeshBuilder.CreateBox('gridline_v',{width:.05,height:.014,depth:32},scene); v.position.set(c,.03,0);
    lines.push(h,v);
  }
  const merged=BABYLON.Mesh.MergeMeshes(lines,true,true,undefined,false,false);
  if(merged){ merged.name='tile_grid_lines'; merged.material=terrainMat(scene,'v12_gridline',new BABYLON.Color3(.10,.16,.07),.002,null,.5); merged.isPickable=false; }
}
function makeIslandCliff(scene){
  // Floating-diorama island: textured rock/dirt strata under the grass so the world reads as an elevated island with cliff sides.
  const dirtT=mat(scene,'v12_cliff_dirt_tex','dirt_loam.png',{uScale:10,vScale:2,specular:new BABYLON.Color3(.01,.01,.01)});
  const rockT=mat(scene,'v12_cliff_rock_tex','stone_blocks.png',{uScale:9,vScale:2,specular:new BABYLON.Color3(.012,.012,.012)});
  const rockT2=mat(scene,'v12_cliff_base_tex','stone_soft.png',{uScale:8,vScale:1.5,specular:new BABYLON.Color3(.01,.01,.01)});
  const upper=BABYLON.MeshBuilder.CreateBox('island_cliff_upper',{width:31.9,height:1.1,depth:31.9},scene);
  upper.position.set(0,-.56,0); upper.material=dirtT; upper.isPickable=false; upper.receiveShadows=true;
  const lower=BABYLON.MeshBuilder.CreateBox('island_cliff_lower',{width:30.6,height:2.4,depth:30.6},scene);
  lower.position.set(0,-2.28,0); lower.material=rockT; lower.isPickable=false;
  const base=BABYLON.MeshBuilder.CreateBox('island_cliff_base',{width:27.5,height:1.6,depth:27.5},scene);
  base.position.set(0,-4.2,0); base.material=rockT2; base.isPickable=false;
  // Small jagged rim rocks hugging the lip for a hand-cut cliff silhouette.
  const rim=[];
  const rimRock=mat(scene,'v12_rim_rock_tex','stone_soft.png',{uScale:1,vScale:1,specular:new BABYLON.Color3(.012,.012,.012)});
  const rimDirt=mat(scene,'v12_rim_dirt_tex','dirt_loam.png',{uScale:1,vScale:1,specular:new BABYLON.Color3(.01,.01,.01)});
  for(let i=0;i<72;i++){
    const side=i%4;
    const off=-15.2+((i*1.93)%1)*30.4;
    const x=(side===0||side===1)?off:(side===2?-15.55:15.55);
    const z=side===0?-15.55:(side===1?15.55:off);
    const r=BABYLON.MeshBuilder.CreatePolyhedron('cliff_rim_rock',{type:1,size:.22+((i*7)%5)*.055},scene);
    r.position.set(x+((i*13)%7-3)*.05,-.22-((i*11)%5)*.28,z+((i*17)%7-3)*.05);
    r.rotation.set(i*.7,i*1.3,i*.31); r.material=i%3?rimRock:rimDirt; r.isPickable=false;
    rim.push(r);
  }
  const merged=BABYLON.Mesh.MergeMeshes(rim,true,true,undefined,false,true);
  if(merged){ merged.name='cliff_rim_merged'; merged.isPickable=false; }
}
function voxelTileColors(matName,x,z){
  const n=hashNoise(x*3.7+11,z*5.1-7), n2=hashNoise(x*9.3-4,z*7.9+21);
  const top=new BABYLON.Color4(1,1,1,1), side=new BABYLON.Color4(1,1,1,1), bottom=new BABYLON.Color4(.05,.045,.04,1);
  if(matName==='dirt'){ top.set(.42+n*.08,.30+n*.06,.17+n*.04,1); side.set(.30+n*.05,.21+n*.04,.12+n*.03,1); }
  else if(matName==='stone'){ const g=.34+n*.11; top.set(g,g*1.02,g*1.05,1); side.set(.24+n*.06,.24+n*.06,.26+n*.06,1); }
  else { top.set(.20+n*.09+n2*.04,.46+n*.10,.15+n*.05,1); side.set(.30+n*.06,.22+n*.045,.14+n*.03,1); }
  if(n2>.93 && matName==='grass'){ top.r=Math.min(1,top.r+.07); top.g=Math.min(1,top.g+.09); }
  return {top,side,bottom};
}
function makeMicroNoiseTexture(scene){
  // Packed 1024 canvas: top-left grass, top-right dirt, bottom-left stone, bottom-right strata bump.
  const S=1024, H=512, cv=document.createElement('canvas'); cv.width=cv.height=S;
  const ctx=cv.getContext('2d');
  ctx.fillStyle='#8a8a8a'; ctx.fillRect(0,0,H,H);
  for(let i=0;i<26000;i++){ const x=Math.random()*H,y=Math.random()*H,r=Math.random()*1.4+.3; const v=118+Math.floor(Math.random()*40);
    ctx.fillStyle='rgb('+v+','+v+','+v+')'; ctx.beginPath(); ctx.arc(x,y,r,0,7); ctx.fill(); }
  ctx.strokeStyle='rgba(160,160,160,0.5)'; ctx.lineWidth=1;
  for(let i=0;i<700;i++){ const x=Math.random()*H,y=Math.random()*H,l=3+Math.random()*7,a=-Math.PI/2+(Math.random()-.5)*.9;
    ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x+Math.cos(a)*l,y+Math.sin(a)*l); ctx.stroke(); }
  ctx.fillStyle='#8a8a8a'; ctx.fillRect(H,0,H,H);
  for(let i=0;i<9000;i++){ const x=H+Math.random()*H,y=Math.random()*H,r=Math.random()*2.2+.5; const v=112+Math.floor(Math.random()*52);
    ctx.fillStyle='rgb('+v+','+v+','+v+')'; ctx.beginPath(); ctx.arc(x,y,r,0,7); ctx.fill(); }
  for(let i=0;i<260;i++){ const x=H+Math.random()*H,y=Math.random()*H,r=2+Math.random()*6; const v=96+Math.floor(Math.random()*70);
    ctx.fillStyle='rgb('+v+','+v+','+v+')'; ctx.beginPath(); ctx.arc(x,y,r,0,7); ctx.fill(); }
  ctx.fillStyle='#8a8a8a'; ctx.fillRect(0,H,H,H);
  for(let i=0;i<7000;i++){ const x=Math.random()*H,y=H+Math.random()*H,r=Math.random()*1.8+.4; const v=116+Math.floor(Math.random()*42);
    ctx.fillStyle='rgb('+v+','+v+','+v+')'; ctx.beginPath(); ctx.arc(x,y,r,0,7); ctx.fill(); }
  for(let i=0;i<180;i++){ const x=Math.random()*H,y=H+Math.random()*H,r=4+Math.random()*11; const v=104+Math.floor(Math.random()*62);
    ctx.fillStyle='rgb('+v+','+v+','+v+')'; ctx.beginPath();
    for(let k=0;k<5;k++){ const a=k/5*Math.PI*2+i; const px=x+Math.cos(a)*r*(0.7+((i*k)%3)*.15), py=y+Math.sin(a)*r*(0.7+((i+k)%3)*.15); k?ctx.lineTo(px,py):ctx.moveTo(px,py); }
    ctx.closePath(); ctx.fill(); }
  ctx.fillStyle='#8a8a8a'; ctx.fillRect(H,H,H,H);
  for(let y=0;y<H;y+=4){ const v=108+Math.floor(Math.random()*44); ctx.fillStyle='rgb('+v+','+v+','+v+')'; ctx.fillRect(H,H+y,H,2+Math.random()*4); }
  for(let i=0;i<3800;i++){ const x=H+Math.random()*H,y=H+Math.random()*H,r=Math.random()*1.6+.3; const v=110+Math.floor(Math.random()*46);
    ctx.fillStyle='rgb('+v+','+v+','+v+')'; ctx.beginPath(); ctx.arc(x,y,r,0,7); ctx.fill(); }
  const tex=new BABYLON.DynamicTexture('micro_noise',cv,scene,true); tex.update();
  tex.wrapU=tex.wrapV=BABYLON.Texture.WRAP_ADDRESSMODE;
  tex.anisotropicFilteringLevel=4;
  return tex;
}
function makeVoxelIsland(scene){
  const tiles=[], voxelPlateau=[];
  const uvRect={ grass:[0,.5,.5,1], dirt:[.5,.5,1,1], stone:[0,0,.5,.5], strata:[.5,0,1,.5] };
  const rect=r=>new BABYLON.Vector4(r[0],r[1],r[2],r[3]);
  for(let tx=-WORLD.halfW;tx<WORLD.halfW;tx++) for(let tz=-WORLD.halfH;tz<WORLD.halfH;tz++){
    const cx=tx+.5, cz=tz+.5;
    const matName=proceduralTerrainAt(cx,cz);
    const edgeDist=Math.min(tx+WORLD.halfW, WORLD.halfW-1-tx, tz+WORLD.halfH, WORLD.halfH-1-tz);
    const topY=edgeDist===0?-.16:(edgeDist===1?-.06:0);
    const topR=uvRect[matName]||uvRect.grass;
    const strataR=uvRect.strata;
    const fu=[ rect(strataR), rect(strataR), rect(strataR), rect(strataR), rect(topR), rect(strataR) ];
    const c=voxelTileColors(matName,tx,tz);
    if(matName!=='water' && edgeDist>0) voxelPlateau.push([cx,cz]);
    const box=BABYLON.MeshBuilder.CreateBox('voxel_tile',{width:.965,height:.62,depth:.965,faceUV:fu,faceColors:[c.side,c.side,c.side,c.side,c.top,c.bottom]},scene);
    box.position.set(cx,topY-.31,cz);
    tiles.push(box);
    if(edgeDist<=1){
      const sideR=uvRect.stone;
      const n1=hashNoise(tx,tz*3), n2=hashNoise(tx*2,tz), n3=hashNoise(tx*5,tz*7), n4=hashNoise(tx*9,tz);
      const dirtC=new BABYLON.Color4(.34+n1*.07,.25+n2*.05,.16,1);
      const rockC=new BABYLON.Color4(.24+n3*.06,.24+n3*.06,.27+n4*.05,1);
      const layerCols=[dirtC,dirtC,rockC,rockC];
      for(let d=1;d<=4;d++){
        const lc=layerCols[d-1];
        const fu2=[ rect(strataR), rect(strataR), rect(strataR), rect(strataR), rect(sideR), rect(strataR) ];
        const b2=BABYLON.MeshBuilder.CreateBox('voxel_under',{width:.965,height:.62,depth:.965,faceUV:fu2,faceColors:[lc,lc,lc,lc,lc,lc]},scene);
        b2.position.set(cx,topY-.31-.62*d,cz);
        tiles.push(b2);
      }
    }
  }
  state.plateauTiles=voxelPlateau;
  const m=new BABYLON.StandardMaterial('voxel_mat',scene);
  const detail=makeMicroNoiseTexture(scene);
  m.diffuseTexture=detail; m.bumpTexture=detail; m.bumpTexture.level=.5;
  m.diffuseColor=new BABYLON.Color3(1,1,1); m.specularColor=new BABYLON.Color3(.5,.5,.5); m.useVertexColor=true;
  const merged=BABYLON.Mesh.MergeMeshes(tiles,true,true,undefined,false,false);
  merged.name='voxel_island';
  if(merged && merged.getVerticesData(BABYLON.VertexBuffer.ColorKind)){
    merged.material=m; merged.receiveShadows=true; merged.isPickable=false; merged.freezeWorldMatrix();
    return merged;
  }
  console.warn('voxel merge dropped vertex colors; falling back to unmerged tiles');
  if(merged) merged.dispose();
  for(const t of tiles){ t.receiveShadows=true; t.isPickable=false; t.material=m; }
  return tiles[0];
}
function makeIslandBase(scene){
  // Deep keel far below the voxel cliff so the island reads as a floating block from low angles.
  const rockM=colorMat(scene,'island_base_rock',new BABYLON.Color3(.17,.16,.15));
  console.log('TABLEFOLK REV strata-voxel-cliff-1');
  const keel=BABYLON.MeshBuilder.CreateBox('island_keel',{width:WORLD.w-3.6,height:2.2,depth:WORLD.h-3.6},scene);
  keel.position.set(0,-3.9,0); keel.material=rockM; keel.isPickable=false;
}
function makeSea(scene){
  const seaM=new BABYLON.StandardMaterial('sea_mat',scene);
  seaM.diffuseColor=new BABYLON.Color3(.05,.13,.20); seaM.emissiveColor=new BABYLON.Color3(.012,.032,.055);
  seaM.specularColor=new BABYLON.Color3(.10,.16,.20); seaM.specularPower=128; seaM.alpha=.96;
  const sea=BABYLON.MeshBuilder.CreateGround('sea',{width:90,height:90,subdivisions:48},scene);
  sea.position.y=-.42; sea.material=seaM; sea.isPickable=false; state.seaLevel=sea.position.y;
  const pos=sea.getVerticesData(BABYLON.VertexBuffer.PositionKind); const base=pos.slice();
  scene.onBeforeRenderObservable.add(()=>{
    const t=performance.now()*.001;
    for(let i=0;i<pos.length;i+=3){ const x=base[i],z=base[i+2]; pos[i+1]=Math.sin(x*.9+t*.8)*.028+Math.sin(z*1.3-t*.6)*.018; }
    sea.updateVerticesData(BABYLON.VertexBuffer.PositionKind,pos,false,false);
  });
  const padM=colorMat(scene,'lily_pad',new BABYLON.Color3(.13,.30,.17));
  for(let i=0;i<(LEGACY_ISLAND?10:0);i++){
    const ang=Math.random()*Math.PI*2, r=Math.min(WORLD.halfW,WORLD.halfH)+.8+Math.random()*2.4;
    const pad=BABYLON.MeshBuilder.CreateDisc('lily_pad',{radius:.14+Math.random()*.12,tessellation:9},scene);
    pad.rotation.x=Math.PI/2; pad.position.set(Math.cos(ang)*r*1.15,-.40,Math.sin(ang)*r);
    pad.material=padM; pad.isPickable=false;
  }
  for(let i=0;i<5;i++){
    const ringM=new BABYLON.StandardMaterial('ripple_mat_'+i,scene);
    ringM.emissiveColor=new BABYLON.Color3(.22,.42,.52); ringM.diffuseColor=new BABYLON.Color3(0,0,0);
    ringM.alpha=.3; ringM.disableLighting=true;
    const ring=BABYLON.MeshBuilder.CreateTorus('ripple',{diameter:1,thickness:.022,tessellation:40},scene);
    ring.rotation.x=Math.PI/2;
    const ang=i*1.35+.6, r=8+((i*1.7)%3);
    ring.position.set(Math.cos(ang)*r,-.405,Math.sin(ang)*r*.8);
    ring.material=ringM; ring.isPickable=false;
    let s=.4+i*.55; const speed=.10+i*.02;
    scene.onBeforeRenderObservable.add(()=>{ s+=speed*.016; if(s>3.2)s=.4; ring.scaling.set(s,s,1); ringM.alpha=.30*(1-s/3.4); });
  }
  return sea;
}
function makeSkyDome(scene){
  const S=512, cv=document.createElement('canvas'); cv.width=64; cv.height=S;
  const ctx=cv.getContext('2d');
  const g=ctx.createLinearGradient(0,0,0,S);
  g.addColorStop(0,'#173b47'); g.addColorStop(.35,'#12303f'); g.addColorStop(.62,'#0a1626'); g.addColorStop(1,'#05080f');
  ctx.fillStyle=g; ctx.fillRect(0,0,64,S);
  for(let i=0;i<110;i++){ const x=Math.random()*64, y=S*.42+Math.random()*S*.58, a=.25+Math.random()*.6;
    ctx.fillStyle='rgba(255,255,255,'+a.toFixed(2)+')'; ctx.fillRect(x,y,1.1,1.1); }
  const tex=new BABYLON.DynamicTexture('sky_grad',cv,scene,false); tex.update();
  const m=new BABYLON.StandardMaterial('sky_mat',scene);
  m.emissiveTexture=tex; m.diffuseColor=new BABYLON.Color3(0,0,0); m.disableLighting=true; m.backFaceCulling=false;
  const dome=BABYLON.MeshBuilder.CreateSphere('sky_dome',{diameter:260,segments:12,sideOrientation:BABYLON.Mesh.BACKSIDE},scene);
  dome.material=m; dome.isPickable=false; dome.infiniteDistance=true;
  return dome;
}
function makeCampfire(scene,x=1.8,z=2.6){
  const logM=colorMat(scene,'fire_log',new BABYLON.Color3(.23,.14,.08));
  for(let i=0;i<4;i++){ const lg=BABYLON.MeshBuilder.CreateCylinder('fire_log',{height:.42,diameter:.075,tessellation:6},scene);
    lg.rotation.z=Math.PI/2; lg.rotation.y=i*Math.PI/4+.3; lg.position.set(x,.045,z); lg.material=logM; lg.isPickable=false; addShadow(lg); }
  const stoneM=colorMat(scene,'fire_stone',new BABYLON.Color3(.20,.17,.14));
  for(let i=0;i<8;i++){ const a=i/8*Math.PI*2; const st=BABYLON.MeshBuilder.CreatePolyhedron('fire_ring_stone',{type:1,size:.055},scene);
    st.position.set(x+Math.cos(a)*.30,.035,z+Math.sin(a)*.30); st.rotation.set(i,i*2,i*3); st.material=stoneM; st.isPickable=false; }
  const flameM=colorMat(scene,'flame',new BABYLON.Color3(1,.52,.16),new BABYLON.Color3(.85,.30,.05));
  const flame=BABYLON.MeshBuilder.CreateCylinder('campfire_flame',{diameterTop:0,diameterBottom:.20,height:.38,tessellation:7},scene);
  flame.position.set(x,.24,z); flame.material=flameM; flame.isPickable=false;
  const light=new BABYLON.PointLight('campfire_light',new BABYLON.Vector3(x,.8,z),scene);
  light.diffuse=new BABYLON.Color3(1,.54,.18); light.intensity=8.4; light.range=6.2; light.radius=.18;
  // A small cubemap is enough for this short-range, flickering practical light.
  // Register the current scene and let addShadow() add future dynamic meshes.
  const fireShadow=new BABYLON.ShadowGenerator(512,light);
  fireShadow.usePercentageCloserFiltering=true;
  fireShadow.filteringQuality=BABYLON.ShadowGenerator.QUALITY_LOW;
  fireShadow.bias=.0022; fireShadow.normalBias=.022; fireShadow.darkness=.48;
  for(const m of scene.meshes){
    if(!m || m.name==='hd_sea' || m.name==='sky_dome' || m===flame) continue;
    m.receiveShadows=true;
    try { fireShadow.addShadowCaster(m,true); } catch{}
  }
  state.extraShadows ||= [];
  state.extraShadows.push(fireShadow);
  scene.onBeforeRenderObservable.add(()=>{ const t=performance.now()*.004; const f=1+Math.sin(t)*.08+Math.sin(t*2.7)*.05; flame.scaling.set(f,1+Math.sin(t*1.7)*.12,f); light.intensity=8.0+Math.sin(t*3.1)*.75; });
}
function makeSelectionRing(scene){
  const m=new BABYLON.StandardMaterial('sel_ring_mat',scene);
  m.emissiveColor=new BABYLON.Color3(.22,1.05,.92); m.diffuseColor=new BABYLON.Color3(0,0,0); m.disableLighting=true; m.alpha=.85;
  const ring=BABYLON.MeshBuilder.CreateTorus('selection_ring',{diameter:.98,thickness:.038,tessellation:56},scene);
  ring.rotation.set(0,0,0); ring.material=m; ring.isPickable=false; ring.isVisible=false;
  // soft radial pool of light inside the ring
  const S=256, cv=document.createElement('canvas'); cv.width=cv.height=S;
  const cx=cv.getContext('2d');
  const rg=cx.createRadialGradient(S/2,S/2,2,S/2,S/2,S/2);
  rg.addColorStop(0,'rgba(120,255,236,0.26)');
  rg.addColorStop(.62,'rgba(80,230,215,0.10)');
  rg.addColorStop(1,'rgba(80,230,215,0)');
  cx.fillStyle=rg; cx.fillRect(0,0,S,S);
  const tex=new BABYLON.DynamicTexture('sel_glow_tex',cv,scene,true); tex.update(); tex.hasAlpha=true;
  const gm=new BABYLON.StandardMaterial('sel_glow_mat',scene);
  gm.emissiveTexture=tex; gm.opacityTexture=tex; gm.diffuseColor=new BABYLON.Color3(0,0,0);
  gm.disableLighting=true; gm.backFaceCulling=false; gm.alpha=.9;
  const disc=BABYLON.MeshBuilder.CreateGround('selection_glow',{width:1.5,height:1.5},scene);
  disc.material=gm; disc.isPickable=false; disc.isVisible=false; disc.alphaIndex=4;
  scene.onBeforeRenderObservable.add(()=>{
    const g=state.selected;
    if(!g||!g.root){ ring.isVisible=false; disc.isVisible=false; return; }
    ring.isVisible=true; disc.isVisible=true;
    const p=g.root.position; const groundY=state.terrainTopY??0; ring.position.set(p.x,groundY+.035,p.z); disc.position.set(p.x,groundY+.018,p.z);
    const t=performance.now()*.004;
    const sc=1+Math.sin(t)*.05; ring.scaling.set(sc,sc,1);
    gm.alpha=.72+Math.sin(t*.8)*.18;
  });
}
async function addTerrainPolish(scene){
  if(!LEGACY_ISLAND){
    // The board in the sea. Light mode keeps the simple sea and sky.
    if(window.TABLEFOLK_GFX?.lite){ makeSkyDome(scene); makeSea(scene); state.lite=true; }
    else try{
      await window.TablefolkHD.buildSea(scene,{ WORLD:{ get halfW(){ return WORLD.halfW-.5; }, get halfH(){ return WORLD.halfH-.5; } }, state, hashNoise, smoothNoise, proceduralTerrainAt, addShadow });
    }catch(err){ console.error('HD sea failed, using the simple one',err); makeSkyDome(scene); makeSea(scene); }
    state.terrainTopY=0;
    rebuildBoard(); rebuildBoardSupport(); fitBoardView();
    makeSelectionRing(scene);
    return;
  }
  // Light mode: the original simple voxel island (no imported cliffs, grass
  // GLBs, trees, house or detailed sea) to leave GPU memory for a big model.
  if(window.TABLEFOLK_GFX?.lite){
    makeSkyDome(scene); makeIslandBase(scene); makeVoxelIsland(scene); makeSea(scene);
    state.lite=true;
  } else if(window.TablefolkHD?.buildIsland){
    try{
      await window.TablefolkHD.buildIsland(scene,{ WORLD, state, hashNoise, smoothNoise, proceduralTerrainAt, addShadow });
    }catch(err){
      console.error('HD diorama failed, falling back to legacy terrain',err);
      makeSkyDome(scene); makeIslandBase(scene); makeVoxelIsland(scene); makeSea(scene);
    }
  } else {
    makeSkyDome(scene); makeIslandBase(scene); makeVoxelIsland(scene); makeSea(scene);
  }
  makeCampfire(scene,1.0,.45);
  makeSelectionRing(scene);
  // Invisible physics ground so props and characters rest on the island surface.
  const ground=BABYLON.MeshBuilder.CreateGround('physics_ground',{width:WORLD.w,height:WORLD.h},scene);
  ground.position.y=(state.terrainTopY??0)-.005; ground.isVisible=false; ground.isPickable=false;
  const groundBody=new BABYLON.PhysicsAggregate(ground,BABYLON.PhysicsShapeType.BOX,{mass:0,friction:.9,restitution:.02},scene);
  groundBody.body.setMotionType(BABYLON.PhysicsMotionType.STATIC);
  try{ groundBody.shape.filterMembershipMask=GROUND_FILTER; }catch{}
}

async function main(){ window.TABLEFOLK_STATE=state; await window.tablefolkPacks?.ready.catch(e=>console.error('[packs] core pack failed to load',e)); const engine=await createEngine(); state.engine=engine; addEventListener('pagehide',()=>{ try{ engine.dispose(); }catch{} }); const scene=new BABYLON.Scene(engine); state.scene=scene; scene.onNewMaterialAddedObservable.add(m=>{ if('maxSimultaneousLights' in m) m.maxSimultaneousLights=8; }); scene.clearColor=new BABYLON.Color4(.030,.058,.088,1);
  scene.fogMode=BABYLON.Scene.FOGMODE_EXP2; scene.fogDensity=.0075; scene.fogColor=new BABYLON.Color3(.045,.105,.145); const hk=await HavokPhysics(); scene.enablePhysics(new BABYLON.Vector3(0,-9.81,0),new BABYLON.HavokPlugin(true,hk)); if(window.TABLEFOLK_STILL_MODE){ try{ scene.getPhysicsEngine()?.setTimeStep(0); console.warn('TABLEFOLK: still mode - physics frozen'); }catch(e){} }
  // Initial three-quarter composition: house high-right, fire/character left of
  // centre, and the near tree/crates framing the lower-right foreground.
  const camera=new BABYLON.ArcRotateCamera('camera',-Math.PI*.69+Math.PI,1.16,20.5,new BABYLON.Vector3(.9,.62,-.15),scene); state.camera=camera; camera.fov=.46; camera.lowerRadiusLimit=3.5; camera.upperRadiusLimit=60; camera.panningSensibility=60; camera.minZ=.5; camera.maxZ=600; camera.upperBetaLimit=1.42; camera.lowerBetaLimit=.22; camera.attachControl(canvas,true); setupMouseWheelZoom(camera);
  // Left-drag = orbit (default Babylon). Left-click (no drag) = center on clicked tile. Right-click = show tile info in history.
  if(camera.inputs?.attached?.pointers){ camera.inputs.attached.pointers.buttons=[0]; }
  let clickStart=null;
  canvas.addEventListener('pointerdown',e=>{ if(e.button===0){ clickStart={x:e.clientX,y:e.clientY}; } });
  canvas.addEventListener('pointerup',e=>{
    if(e.button===0 && clickStart){
      const moved=Math.abs(e.clientX-clickStart.x)+Math.abs(e.clientY-clickStart.y); clickStart=null;
      if(moved<5){
        const pick=scene.pick(scene.pointerX,scene.pointerY);
        if(pick?.hit && pick.pickedPoint){
          const tx=Math.round(pick.pickedPoint.x), tz=Math.round(pick.pickedPoint.z);
          if(state.spawnMode.enabled){
            Promise.resolve(spawnAt(state.spawnMode.type,tx,tz)).catch(err=>console.error('spawn failed',err));
            return;
          }
          // With an avatar, clicking the ground walks it there (clicks on
          // characters still select them; Alt-click recentres the camera).
          const av=state.playerAvatar, owner=pick.pickedMesh?.metadata?.ownerId;
          if(av && !e.altKey && !owner && !av.turnMove && !av.falling){
            if(state.npcBusy || av.defeated) return;
            walk(av,{type:'coord',x:tx,z:tz}); state.followAvatar=true;
            if(av.turnMove) window.tablefolkPlay?.acted('move');
            return;
          }
          camera.target=new BABYLON.Vector3(tx,0.6,tz); state.zoomFocus=camera.target.clone();
        }
      }
    }
  });
  canvas.addEventListener('contextmenu',e=>{ e.preventDefault(); const pick=scene.pick(scene.pointerX,scene.pointerY); if(pick?.hit && pick.pickedPoint){ const tx=Math.round(pick.pickedPoint.x), tz=Math.round(pick.pickedPoint.z); let info=`tile (${tx},${tz})`; const m=pick.pickedMesh; const mm=meta(m); if(mm?.type && mm.type!=='tile') info+=` - ${mm.type} (${mm.state||'intact'})`; const owner=m?.metadata?.ownerId; if(owner){ const g=state.characters.find(x=>x.id===owner); if(g) info+=` - ${g.id} (${g.anim||'idle'})`; } log(info); } });
  canvas.addEventListener('pointermove',e=>{ if(e.buttons&2){ e.preventDefault(); const dx=e.movementX*0.02, dy=e.movementY*0.02; const right=camera.getDirection(BABYLON.Vector3.Right()); const up=camera.getDirection(BABYLON.Vector3.Up()); const newTarget=camera.target.add(right.scale(dx)).subtract(up.scale(dy)); newTarget.y=0.6; camera.target.copyFrom(newTarget); state.zoomFocus=camera.target.clone(); } });
  // Diorama lighting: cool moonlit sky dome + a warm angled key so the island
  // reads as a lit model on a dark table, plus a teal rim to separate the
  // silhouette from the water.
  const hemi=new BABYLON.HemisphericLight('sky_dome_light',new BABYLON.Vector3(.15,1,.05),scene);
  hemi.intensity=.16; hemi.diffuse=new BABYLON.Color3(.42,.55,.76); hemi.groundColor=new BABYLON.Color3(.10,.12,.11); hemi.specular=new BABYLON.Color3(.05,.08,.11);
  const sun=new BABYLON.DirectionalLight('warm_key',new BABYLON.Vector3(-.48,-.86,.62),scene);
  sun.position=new BABYLON.Vector3(11,17,-12); sun.intensity=0; sun.diffuse=new BABYLON.Color3(1,.82,.58); sun.specular=new BABYLON.Color3(.50,.45,.38); // Directional flood intentionally disabled.
  // A zero-intensity enabled light still consumes one of Babylon's material
  // light slots and one shader uniform buffer.
  sun.setEnabled(false);
  // Broad point source at the front-left corner, opposite the house.
  // Its finite range equals the island's 14-unit width.
  const cornerKey=new BABYLON.PointLight('composition_opposite_corner_point',new BABYLON.Vector3(-1.0,5.0,10.5),scene); cornerKey.name='tree_key_moved';
  cornerKey.diffuse=new BABYLON.Color3(1,.82,.55); cornerKey.specular=new BABYLON.Color3(.34,.26,.17);
  cornerKey.intensity=200; cornerKey.range=46; cornerKey.radius=4.5; cornerKey.falloffType=BABYLON.Light.FALLOFF_GLTF;
  // Point-light shadows render a cubemap (six directions), so keep this at
  // 1024 rather than duplicating the old 2048 directional-map cost sixfold.
  // PERF NOTE: this is a real-time ShadowGenerator (default refreshRate),
  // so those 6 cubemap faces re-render every frame even though almost
  // nothing in the scene moves out of shadow frame-to-frame (camera pans
  // are the main exception). makeCampfire() below adds a second point-light
  // cubemap shadow (512, QUALITY_LOW) on top of this one - so every frame
  // pays for 12 extra shadow-map passes combined. Candidates worth
  // measuring later: RenderTargetTexture.refreshRate = REFRESHRATE_RENDER_ONCE
  // (or every Nth frame) on generators whose casters aren't moving much, or
  // swapping this key light for a DirectionalLight shadow (1 pass instead
  // of 6) since it's meant to read as a fixed diorama key, not an
  // omnidirectional source.
  const cornerShadow=new BABYLON.ShadowGenerator(1024,cornerKey);
  cornerShadow.usePercentageCloserFiltering=true;
  cornerShadow.filteringQuality=BABYLON.ShadowGenerator.QUALITY_MEDIUM;
  cornerShadow.bias=.0004; cornerShadow.normalBias=.004; cornerShadow.darkness=.38;
  const rim=new BABYLON.DirectionalLight('teal_rim',new BABYLON.Vector3(.62,-.34,-.68),scene);
  rim.intensity=.22; rim.diffuse=new BABYLON.Color3(.34,.72,.82); rim.specular=new BABYLON.Color3(.20,.42,.48);
  const fill=new BABYLON.PointLight('cool_fill',new BABYLON.Vector3(-9,5,7),scene);
  fill.intensity=.35; fill.diffuse=new BABYLON.Color3(.48,.66,1); fill.range=24;
  state.sun=sun;
  // addShadow() and the HD builders now populate the active point-light map.
  // Keep the disabled directional light object for an easy rollback, but do not
  // spend a shadow map on a zero-intensity source.
  state.shadow=cornerShadow;
  // Neutral environment reflections give PBR clay broad shape cues without making it glossy.
  const envTexture=BABYLON.CubeTexture.CreateFromPrefilteredData('https://assets.babylonjs.com/environments/studio.env',scene);
  scene.environmentTexture=envTexture;
  scene.environmentIntensity=.10;
  // Tonemap + diorama grade (teal-lifted shadows, warm highlights). The old
  // ACES at contrast/exposure 1.34 was crushing shadows and desaturating the
  // olive greens relative to the concept art.
  LOOK()?.applyTonemap(scene,{exposure:1.34,contrast:1.12,tonemap:'neutral',grade:true});
  // Diorama polish: soft bloom on emissives, gentle vignette, and a subtle tilt-shift depth of field.
  if(window.TABLEFOLK_GFX?.lite || window.TABLEFOLK_TABLETOP){
    // Light mode: no post-process pipeline, SSAO or glow layer (each holds
    // full-screen render targets). The tabletop view skips them too: no
    // tilt-shift blur or vignette on a printed map.
  } else try{
    const rp=new BABYLON.DefaultRenderingPipeline('drp',true,scene,[camera]);
    rp.fxaaEnabled=true;
    rp.bloomEnabled=true; rp.bloomThreshold=.82; rp.bloomWeight=.26; rp.bloomScale=.6; rp.bloomKernel=48;
    rp.vignetteEnabled=true; rp.vignetteWeight=1.05; rp.vignetteStretch=.42; rp.vignetteColor=new BABYLON.Color4(0,.02,.05,0);
    rp.sharpenEnabled=true; rp.sharpen.edgeAmount=.28; rp.sharpen.colorAmount=1;
    rp.imageProcessing.vignetteBlendMode=BABYLON.ImageProcessingConfiguration.VIGNETTEMODE_MULTIPLY;
    rp.samples=4;
   
    // Tilt-shift depth of field. The old comment promised this but it was never
    // enabled. Focus tracks the camera target so the island centre stays sharp.
    rp.depthOfFieldEnabled=false;
    state.renderPipeline=rp;
    // Ambient occlusion is what makes the reference read as sculpted clay
    // rather than flat colour. Neither the imported GLBs (Tripo bakes a pure
    // white AO channel) nor the procedural terrain carried any before this.
    // Medium quality: no SSAO (several full-screen render targets).
    if(window.TABLEFOLK_GFX?.quality!=='medium') state.ssao=LOOK()?.setupSSAO(scene,camera,{radius:.62,strength:3.1,samples:20,maxZ:60});
    const gl=new BABYLON.GlowLayer('hd_glow',scene,{ mainTextureFixedSize:512, blurKernelSize:44 });
    gl.intensity=.38;
    state.glowLayer=gl;
  }catch(e){ console.warn('render pipeline unavailable, continuing without post fx',e); }
  state.materials={
    grass:mat(scene,'grass','grass_meadow.png',{uScale:1,vScale:1}), dirt:mat(scene,'dirt','dirt_loam.png',{uScale:1,vScale:1}), stone:mat(scene,'stone','stone_soft.png',{uScale:1,vScale:1}),
    grassSurf:mat(scene,'grassSurf','grass_meadow.png',{uScale:7.5,vScale:7.5}), dirtSurf:mat(scene,'dirtSurf','dirt_loam.png',{uScale:5.8,vScale:1.3}), stoneSurf:mat(scene,'stoneSurf','stone_soft.png',{uScale:3.4,vScale:3.0}),
    grassBase:colorMat(scene,'grass_base',new BABYLON.Color3(.17,.25,.14)), dirtBase:colorMat(scene,'dirt_base',new BABYLON.Color3(.27,.19,.12)), stoneBase:colorMat(scene,'stone_base',new BABYLON.Color3(.28,.28,.26)), waterBase:colorMat(scene,'water_base',new BABYLON.Color3(.06,.13,.15)),
    cracked:mat(scene,'cracked','cracked_wall.png',{uScale:1.2,vScale:1.2}), wood:mat(scene,'wood','wood_planks.png',{uScale:1.2,vScale:1.2}), mushroom:mat(scene,'mushroom','mushroom_cap.png',{uScale:1.05,vScale:1.05}), canvas:mat(scene,'canvas','canvas_fabric.png',{uScale:1.4,vScale:1.4}), tablefolk:mat(scene,'critter_clay','critter_clay.png',{uScale:1,vScale:1}), magic:mat(scene,'magic','magic_crystal.png',{emissive:new BABYLON.Color3(.07,.34,.34)}), fire:colorMat(scene,'fire',new BABYLON.Color3(1,.31,.08),new BABYLON.Color3(.85,.18,.04)), burned:colorMat(scene,'burned',new BABYLON.Color3(.12,.09,.07)), water:makeWaterMaterial(scene), grassBlade:colorMat(scene,'grass_blade',new BABYLON.Color3(.25,.43,.18)), grassBlade2:colorMat(scene,'grass_blade2',new BABYLON.Color3(.36,.49,.20)), pebble:colorMat(scene,'pebble',new BABYLON.Color3(.39,.38,.32)), hole:colorMat(scene,'hole',new BABYLON.Color3(.06,.035,.022)), bot:colorMat(scene,'bot',new BABYLON.Color3(.47,.55,.58)), darkwood:colorMat(scene,'darkwood',new BABYLON.Color3(.26,.14,.07)), hat1:colorMat(scene,'hat_moss',new BABYLON.Color3(.18,.38,.21)), hat2:colorMat(scene,'hat_clay',new BABYLON.Color3(.58,.25,.16)), hat3:colorMat(scene,'hat_blue',new BABYLON.Color3(.18,.28,.48)), belly1:colorMat(scene,'belly_cream',new BABYLON.Color3(.78,.72,.48)), belly2:colorMat(scene,'belly_blue',new BABYLON.Color3(.36,.55,.68)), belly3:colorMat(scene,'belly_pink',new BABYLON.Color3(.70,.42,.53)), foot:colorMat(scene,'foot_dark',new BABYLON.Color3(.12,.17,.13))
  };
  // Demo-first blank world: retain the terrain as a canvas, but do not populate
  // the old RPG cast, buildings, border walls, or random props on first load.
  await addTerrainPolish(scene);
  // Catch every model created during async terrain/scenery construction,
  // including merged terrain, imported GLBs, vegetation, and decorative props.
  registerAllShadowMeshes(scene);
  // Babylon otherwise takes the first N scene lights, so the late-created
  // campfire/lantern lose to broad fill lights. Put practicals first; material
  // shaders then get both practical pools plus the shared key/rim within four.
  const lightPriority={campfire_light:0,hd_lantern_light:1,tree_key_moved:2,composition_opposite_corner_point:2,teal_rim:3,sky_dome_light:4,cool_fill:5};
  scene.lights.sort((a,b)=>(lightPriority[a.name]??50)-(lightPriority[b.name]??50));
  // Keep PBR light shaders within WebGPU's portable uniform-buffer budget.
  // Four slots are sufficient once the disabled sun is removed and practical
  // lights are explicitly prioritized per mesh.
  for(const material of scene.materials){
    if(material instanceof BABYLON.PBRMaterial){
      material.maxSimultaneousLights=8;
      material.useRoughnessFromMetallicTextureGreen=false;
      material.useRoughnessFromMetallicTextureAlpha=false;
      material.roughness=.24;
      material.environmentIntensity=Math.max(.85,material.environmentIntensity||0);
      material.specularIntensity=material.name.includes('water') || material.name.includes('sea') ? 1 : .5;
    } else if(material instanceof BABYLON.StandardMaterial){
      material.specularColor=(material.name.includes('water') || material.name.includes('sea')) ? new BABYLON.Color3(1,1,1) : new BABYLON.Color3(.5,.5,.5);
      material.specularPower=128;
    }
  }
  // Light mode's legacy sea/tiles are StandardMaterials: the pass above gives
  // them full-white specular, which under the strong key light turned the
  // sea into a white sheet and left a glare patch on the tiles. They also get
  // no environment light, so lift them with a little emissive instead.
  // The scene's lights are calibrated for PBR (the key is a 200-intensity
  // point light with glTF falloff), which over-exposes StandardMaterials, so
  // give the light island PBR materials like the HD diorama's.
  if(state.lite){
    const pbr=(name,col,rough,alpha=1)=>{ const m=new BABYLON.PBRMaterial(name,scene); m.albedoColor=col; m.metallic=0; m.roughness=rough; m.environmentIntensity=.85; m.specularIntensity=.5; m.maxSimultaneousLights=8; if(alpha<1) m.alpha=alpha; return m; };
    const island=scene.getMeshByName('voxel_island');
    if(island){ island.material=applyClayLook(pbr('voxel_pbr',new BABYLON.Color3(1,1,1),.3),scene,{detail:.1}); }
    const sea=scene.getMeshByName('sea');
    if(sea) sea.material=pbr('sea_pbr',new BABYLON.Color3(.05,.15,.24),.16,.96);
  }
  // Imported grass slabs have their visible top around y=.30. Gameplay and
  // legacy scenery were authored for y=0, which buried characters, fences,
  // tents and loose props halfway into the new terrain. Lift only those scene
  // objects; HD terrain/scenery already owns its correct elevation.
  const TERRAIN_CONTENT_LIFT=state.terrainTopY??0;
  const terrainOwned=m=>m.name.startsWith('hd_') || m.name==='hd_sky' || m.name==='spawn_pick_plane';
  for(const m of scene.meshes){
    if(!terrainOwned(m) && !m.parent && m.position.y>-0.15) m.position.y+=TERRAIN_CONTENT_LIFT;
  }
  // The visible continuous terrain is intentionally non-pickable; preserve a
  // simple invisible pick plane now that buildWorld() no longer creates tile meshes.
  if(LEGACY_ISLAND){ const spawnPickPlane=BABYLON.MeshBuilder.CreateGround('spawn_pick_plane',{width:WORLD.w,height:WORLD.h,subdivisions:1},scene);
  spawnPickPlane.position.y=.025; spawnPickPlane.isPickable=true; const _spm=new BABYLON.StandardMaterial('spawn_pick_mat',scene); _spm.alpha=0; _spm.disableLighting=true; spawnPickPlane.material=_spm; }
  scene.onPointerObservable.add(pi=>{ if(pi.type!==BABYLON.PointerEventTypes.POINTERPICK || !pi.pickInfo?.hit) return; const m=pi.pickInfo.pickedMesh; const owner=m?.metadata?.ownerId; const g=state.characters.find(x=>owner===x.id || m.name.startsWith(x.id+'_')); if(g){ state.zoomFocus=new BABYLON.Vector3(g.root.position.x,0.6,g.root.position.z); return selectCharacter(g); } const mm=meta(m); const target=logicalTarget(m); if(pi.pickInfo.pickedPoint) state.zoomFocus=new BABYLON.Vector3(pi.pickInfo.pickedPoint.x,0.6,pi.pickInfo.pickedPoint.z); if(mm?.interactive){ state.target=target; const tp=target.getAbsolutePosition?.()||pi.pickInfo.pickedPoint; state.zoomFocus=new BABYLON.Vector3(tp.x,0.6,tp.z); log('target: '+(mm.type||target.name)+' / '+(mm.state||'intact')); updatePerceptionUI(); } });
  setupUI(); installWorldAPI();
  const restored=await loadWorldState();
  if(!restored){
    const g=await createGeneratedCritter(scene,'folk1',new BABYLON.Vector3(0,.06,0));
    setCharacterLogicalPosition(g,new BABYLON.Vector3(0,0,0));
    setBrainConfig(g.id,{style:'helpful character',personality:'helpful and friendly',fireballTemptation:20,chaos:1});
    refreshAgentSelect(); selectCharacter(g); saveWorldState();
    log('blank demo world ready with one character');
  }
  // While a character's brain is generating (TABLEFOLK_PAUSE_RENDER), keep
  // rendering (full speed by default; can be reduced to give the model more
  // GPU). Graphics pane setting (localStorage tablefolkThinkFps): 0 = pause like
  // before, 60 = full speed.
  let lastFrameAt=performance.now(), lastAnimAt=performance.now();
  const thinkFps=()=>{ const v=Number(localStorage.getItem('tablefolkThinkFps')); return Number.isFinite(v)&&localStorage.getItem('tablefolkThinkFps')!==null ? v : 60; };
  scene.onBeforeRenderObservable.add(()=>{ if(TABLEFOLK_FORCE_NO_RENDER) return; const now=performance.now(), dt=Math.min(.1,(now-lastAnimAt)/1000); lastAnimAt=now; window.TablefolkPerf?.begin('animate.characters'); animate(dt); window.TablefolkPerf?.end('animate.characters'); }); engine.runRenderLoop(()=>{
    if(TABLEFOLK_FORCE_NO_RENDER) return;
    if(window.TABLEFOLK_PAUSE_RENDER){ const fps=thinkFps(); if(fps<=0) return; if(fps<60 && performance.now()-lastFrameAt<1000/fps) return; }
    lastFrameAt=performance.now();
    scene.render();
    const recorder=window.tablefolkFrameRecorder;
    if(recorder?.wantsFrame?.()) recorder.captureAfterRender(engine).catch(err=>recorder.fail?.(err));
  });
  window.addEventListener('resize',()=>engine.resize());
  // Deterministic render-harness readiness signal. Art review tools wait for
  // this instead of guessing from mesh counts or sleeping for minutes.
  window.TABLEFOLK_SCENE_READY=true;
  window.dispatchEvent(new CustomEvent('tablefolk-scene-ready',{detail:{meshes:scene.meshes.length,materials:scene.materials.length}}));
  log('v14.5 loaded: fixed north-up perception UI + blank hidden cells + facing cone + LOS'); updatePerceptionUI(); }
main().catch(err=>{ console.error(err); document.body.innerHTML='<pre style="color:white;padding:20px;white-space:pre-wrap">'+err.stack+'</pre>'; });
