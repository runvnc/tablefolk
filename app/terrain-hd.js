/* tablefolk.world — HD terrain / diorama renderer (hd1)
 *
 * Replaces the old flat "grey micro-noise + vertex colour" island with a
 * proper textured diorama:
 *   - real 1k albedo textures, colour graded in-canvas for the storybook look
 *   - generated normal maps (Sobel on luminance) so tiles catch the key light
 *   - generated roughness/AO packed maps for PBR
 *   - continuous world-space UVs so grass reads as one meadow, not 168 stamps
 *   - alpha-tested grass tufts, clover, daisies, bushes, bevelled rim rocks
 *
 * Loaded before app.js; app.js calls window.TablefolkHD.buildIsland(scene, api).
 */
(() => {
  'use strict';

  const ASSETS = window.tablefolkPacks?.base || './assets/';
  const TEX = ASSETS + 'textures/';
  const cache = new Map();

  function loadImage(url){
    return new Promise((resolve,reject)=>{
      const img=new Image();
      img.crossOrigin='anonymous';
      img.onload=()=>resolve(img);
      img.onerror=()=>reject(new Error('texture load failed: '+url));
      img.src=url;
    });
  }

  function canvasOf(w,h){ const c=document.createElement('canvas'); c.width=w; c.height=h; return c; }

  /* ---------- colour grading ---------------------------------------- */
  // opts: { sat, bright, contrast, tintR/G/B (multiply), gamma }
  function grade(img, opts={}){
    const S=opts.size||1024;
    const cv=canvasOf(S,S), ctx=cv.getContext('2d');
    ctx.drawImage(img,0,0,S,S);
    const data=ctx.getImageData(0,0,S,S), p=data.data;
    const sat=opts.sat??1, bright=opts.bright??1, contrast=opts.contrast??1;
    const tr=opts.tintR??1, tg=opts.tintG??1, tb=opts.tintB??1, gamma=opts.gamma??1;
    for(let i=0;i<p.length;i+=4){
      let r=p[i]/255, g=p[i+1]/255, b=p[i+2]/255;
      const l=r*.299+g*.587+b*.114;
      r=l+(r-l)*sat; g=l+(g-l)*sat; b=l+(b-l)*sat;
      r=(r-.5)*contrast+.5; g=(g-.5)*contrast+.5; b=(b-.5)*contrast+.5;
      r*=bright*tr; g*=bright*tg; b*=bright*tb;
      if(gamma!==1){ r=Math.pow(Math.max(0,r),gamma); g=Math.pow(Math.max(0,g),gamma); b=Math.pow(Math.max(0,b),gamma); }
      p[i]=Math.max(0,Math.min(255,r*255));
      p[i+1]=Math.max(0,Math.min(255,g*255));
      p[i+2]=Math.max(0,Math.min(255,b*255));
    }
    ctx.putImageData(data,0,0);
    return cv;
  }

  /* ---------- painted detail passes --------------------------------- */
  function paintGrassDetail(cv, seed=1){
    const ctx=cv.getContext('2d'), S=cv.width;
    let s=seed; const rnd=()=>{ s=(s*16807)%2147483647; return s/2147483647; };
    // broad clumps / mown patches (olive graded toward the mockup)
    for(let i=0;i<44;i++){
      const x=rnd()*S, y=rnd()*S, r=S*(.04+rnd()*.10);
      const g=ctx.createRadialGradient(x,y,1,x,y,r);
      const dark=rnd()<.5;
      g.addColorStop(0, dark?'rgba(42,48,20,0.28)':'rgba(150,158,84,0.18)');
      g.addColorStop(1,'rgba(0,0,0,0)');
      ctx.fillStyle=g; ctx.beginPath(); ctx.arc(x,y,r,0,7); ctx.fill();
    }
    // blade strokes
    ctx.lineCap='round';
    for(let i=0;i<9000;i++){
      const x=rnd()*S, y=rnd()*S, len=2.5+rnd()*7, a=-Math.PI/2+(rnd()-.5)*1.1;
      const bright=rnd();
      ctx.strokeStyle = bright<.42 ? 'rgba(48,56,24,0.32)'
                      : bright<.86 ? 'rgba(136,142,72,0.28)'
                                   : 'rgba(190,192,126,0.24)';
      ctx.lineWidth=.7+rnd()*1.2;
      ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x+Math.cos(a)*len,y+Math.sin(a)*len); ctx.stroke();
    }
    // clover dots + tiny blossoms baked at low contrast
    for(let i=0;i<420;i++){
      const x=rnd()*S, y=rnd()*S, r=1+rnd()*2.4;
      ctx.fillStyle=rnd()<.72?'rgba(100,116,52,0.32)':'rgba(226,230,200,0.28)';
      ctx.beginPath(); ctx.arc(x,y,r,0,7); ctx.fill();
    }
    return cv;
  }

  function paintDirtDetail(cv, seed=7){
    const ctx=cv.getContext('2d'), S=cv.width;
    let s=seed; const rnd=()=>{ s=(s*48271)%2147483647; return s/2147483647; };
    for(let i=0;i<52;i++){
      const x=rnd()*S, y=rnd()*S, r=S*(.03+rnd()*.08);
      const g=ctx.createRadialGradient(x,y,1,x,y,r);
      g.addColorStop(0, rnd()<.5?'rgba(58,38,20,0.28)':'rgba(176,142,92,0.20)');
      g.addColorStop(1,'rgba(0,0,0,0)');
      ctx.fillStyle=g; ctx.beginPath(); ctx.arc(x,y,r,0,7); ctx.fill();
    }
    // pebbles
    for(let i=0;i<1500;i++){
      const x=rnd()*S, y=rnd()*S, r=1+rnd()*3.4;
      const v=rnd();
      ctx.fillStyle = v<.5?'rgba(120,104,84,0.42)':'rgba(48,34,22,0.42)';
      ctx.beginPath(); ctx.ellipse(x,y,r,r*(.6+rnd()*.5),rnd()*3,0,7); ctx.fill();
      if(v>=.5){ ctx.fillStyle='rgba(210,196,168,0.20)'; ctx.beginPath(); ctx.arc(x-r*.25,y-r*.3,r*.45,0,7); ctx.fill(); }
    }
    // dried cracks
    ctx.strokeStyle='rgba(40,26,14,0.26)';
    for(let i=0;i<44;i++){
      let x=rnd()*S, y=rnd()*S; ctx.lineWidth=.6+rnd()*1.1; ctx.beginPath(); ctx.moveTo(x,y);
      for(let k=0;k<4;k++){ x+=(rnd()-.5)*26; y+=(rnd()-.5)*26; ctx.lineTo(x,y); }
      ctx.stroke();
    }
    return cv;
  }

  function paintStoneDetail(cv, seed=13){
    const ctx=cv.getContext('2d'), S=cv.width;
    let s=seed; const rnd=()=>{ s=(s*69621)%2147483647; return s/2147483647; };
    for(let i=0;i<220;i++){
      const x=rnd()*S, y=rnd()*S, r=6+rnd()*30;
      ctx.fillStyle=rnd()<.5?'rgba(180,186,196,0.13)':'rgba(46,50,58,0.16)';
      ctx.beginPath();
      for(let k=0;k<6;k++){ const a=k/6*Math.PI*2+rnd()*.4; const px=x+Math.cos(a)*r*(.72+rnd()*.4), py=y+Math.sin(a)*r*(.72+rnd()*.4); k?ctx.lineTo(px,py):ctx.moveTo(px,py); }
      ctx.closePath(); ctx.fill();
    }
    ctx.strokeStyle='rgba(28,32,38,0.32)';
    for(let i=0;i<220;i++){
      let x=rnd()*S, y=rnd()*S; ctx.lineWidth=.7+rnd()*1.4; ctx.beginPath(); ctx.moveTo(x,y);
      for(let k=0;k<3;k++){ x+=(rnd()-.5)*40; y+=(rnd()-.5)*40; ctx.lineTo(x,y); }
      ctx.stroke();
    }
    // moss creeping in from the grass side
    for(let i=0;i<180;i++){
      const x=rnd()*S, y=rnd()*S, r=3+rnd()*11;
      ctx.fillStyle='rgba(74,116,52,0.16)';
      ctx.beginPath(); ctx.arc(x,y,r,0,7); ctx.fill();
    }
    return cv;
  }

  // Chipped-rock detail for the edge cubes: broad tonal patches plus a few
  // sharp light chips and dark pits. Deliberately has no repeating structure,
  // unlike paintStoneDetail() which draws mortar courses.
  function paintStoneChips(cv, seed=71){
    const ctx=cv.getContext('2d'), S=cv.width;
    let s=seed; const rnd=()=>{ s=(s*16807)%2147483647; return s/2147483647; };
    for(let i=0;i<70;i++){
      const x=rnd()*S, y=rnd()*S, r=S*(.05+rnd()*.16);
      const g=ctx.createRadialGradient(x,y,1,x,y,r);
      const up=rnd()<.5;
      g.addColorStop(0,'rgba('+(up?'236,232,222':'52,52,48')+','+(.05+rnd()*.09).toFixed(3)+')');
      g.addColorStop(1,'rgba(0,0,0,0)');
      ctx.fillStyle=g; ctx.beginPath(); ctx.arc(x,y,r,0,7); ctx.fill();
    }
    for(let i=0;i<130;i++){
      const x=rnd()*S, y=rnd()*S, w=2+rnd()*9, h=2+rnd()*7;
      ctx.fillStyle=rnd()<.55
        ? 'rgba(226,222,210,'+(.05+rnd()*.13).toFixed(3)+')'
        : 'rgba(38,38,34,'+(.05+rnd()*.15).toFixed(3)+')';
      ctx.save(); ctx.translate(x,y); ctx.rotate(rnd()*3.14);
      ctx.fillRect(-w*.5,-h*.5,w,h); ctx.restore();
    }
    return cv;
  }

  function paintStrataDetail(cv, seed=29){
    const ctx=cv.getContext('2d'), S=cv.width;
    let s=seed; const rnd=()=>{ s=(s*40692)%2147483647; return s/2147483647; };
    // horizontal sediment bands (v is vertical on the cliff faces)
    for(let y=0;y<S;){
      const h=3+rnd()*26;
      const shade=rnd();
      ctx.fillStyle = shade<.34 ? 'rgba(52,36,22,0.34)'
                    : shade<.7  ? 'rgba(104,84,62,0.24)'
                                : 'rgba(150,132,108,0.18)';
      ctx.fillRect(0,y,S,h);
      y+=h;
    }
    for(let i=0;i<2600;i++){
      const x=rnd()*S, y=rnd()*S, r=1+rnd()*3.6;
      ctx.fillStyle=rnd()<.5?'rgba(30,20,12,0.34)':'rgba(178,160,134,0.24)';
      ctx.beginPath(); ctx.arc(x,y,r,0,7); ctx.fill();
    }
    // vertical chisel marks
    ctx.strokeStyle='rgba(24,16,10,0.22)';
    for(let i=0;i<160;i++){
      const x=rnd()*S, y=rnd()*S, l=8+rnd()*40;
      ctx.lineWidth=.6+rnd()*1.3;
      ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x+(rnd()-.5)*6,y+l); ctx.stroke();
    }
    return cv;
  }

  /* ---------- macro height field (for geometry-only variation) ------ */
  function macroHeightCanvas(size=1024, seed=5, patches=44, contrast=0.5){
    const cv=canvasOf(size,size), ctx=cv.getContext('2d');
    ctx.fillStyle='#808080'; ctx.fillRect(0,0,size,size);
    let s=seed; const rnd=()=>{ s=(s*16807)%2147483647; return s/2147483647; };
    for(let i=0;i<patches;i++){
      const x=rnd()*size, y=rnd()*size, r=size*(.06+rnd()*.14);
      const up=rnd()<.5;
      const a=(.10+rnd()*.16)*contrast;
      const g=ctx.createRadialGradient(x,y,1,x,y,r);
      g.addColorStop(0, up?`rgba(255,255,255,${a.toFixed(3)})`:`rgba(0,0,0,${a.toFixed(3)})`);
      g.addColorStop(1,'rgba(128,128,128,0)');
      ctx.fillStyle=g; ctx.beginPath(); ctx.arc(x,y,r,0,7); ctx.fill();
    }
    return cv;
  }

  /* ---------- stone-floor height field: irregular rectangular tiles --
     Jittered wobbly-edged rectangles (periodic grid), hairline grooves,
     tiny per-cell level offsets + micro bump. No straight machine lines. */
  function stoneFloorHeight(size=512, seed=5, cells=5, groovePx=3){
    let s=seed; const rnd=()=>{ s=(s*16807)%2147483647; return s/2147483647; };
    const cs=size/cells;
    // per-cell rect insets + level offset + bump phase
    const ins=new Float32Array(cells*cells*4), lvl=new Float32Array(cells*cells), ph=new Float32Array(cells*cells);
    for(let i=0;i<cells*cells;i++){
      ins[i*4]=cs*(.03+rnd()*.05); ins[i*4+1]=cs*(.03+rnd()*.05);
      ins[i*4+2]=cs*(.03+rnd()*.05); ins[i*4+3]=cs*(.03+rnd()*.05);
      lvl[i]=(rnd()-.5)*.05;            // tiny height offset per cell
      ph[i]=rnd()*6.28;
    }
    function wob(x,y,f,p){ return Math.sin(x*f+p)*.55+Math.sin(y*f*1.37+p*1.9)*.45; }
    const H=new Float32Array(size*size);
    for(let y=0;y<size;y++){
      for(let x=0;x<size;x++){
        const gx=Math.floor(x/cs), gy=Math.floor(y/cs);
        const i=((gy%cells+cells)%cells)*cells+((gx%cells+cells)%cells);
        const lx=x-gx*cs, ly=y-gy*cs;
        // wobbled edges: perturb distance-to-edge with low-freq noise
        const w1=wob(x,y,.11,ph[i])*1.6, w2=wob(y,x,.097,ph[i]*2.3)*1.6;
        const dL=lx-ins[i*4]+w1, dR=(cs-ins[i*4+1])-lx+w1;
        const dT=ly-ins[i*4+2]+w2, dB=(cs-ins[i*4+3])-ly+w2;
        const b=Math.min(dL,dR,dT,dB);          // >0 inside the rect, 0 at edge
        // hairline groove: ramp only groovePx wide
        let h=Math.min(1,Math.max(0,b)/groovePx);
        h=h*h*(3-2*h);
        // micro bump inside the cell (very subtle)
        const bump=Math.sin(x*.55+ph[i]*3)*Math.sin(y*.49+ph[i])*0.012;
        H[y*size+x]=.82+.18*h+lvl[i]+bump;
      }
    }
    const cv=canvasOf(size,size), ctx=cv.getContext('2d');
    const img=ctx.createImageData(size,size), q=img.data;
    for(let i=0;i<H.length;i++){
      const v=Math.max(0,Math.min(255,H[i]*255));
      q[i*4]=v; q[i*4+1]=v; q[i*4+2]=v; q[i*4+3]=255;
    }
    ctx.putImageData(img,0,0);
    return cv;
  }

  /* ---------- normal map (Sobel on luminance) ----------------------- */
  function normalFromCanvas(src, strength=2.2){
    const S=src.width, H=src.height;
    const sctx=src.getContext('2d');
    const p=sctx.getImageData(0,0,S,H).data;
    const lum=new Float32Array(S*H);
    for(let i=0,j=0;i<p.length;i+=4,j++) lum[j]=(p[i]*.299+p[i+1]*.587+p[i+2]*.114)/255;
    const out=canvasOf(S,H), octx=out.getContext('2d');
    const img=octx.createImageData(S,H), q=img.data;
    const at=(x,y)=>lum[((y+H)%H)*S+((x+S)%S)];
    for(let y=0;y<H;y++){
      for(let x=0;x<S;x++){
        const tl=at(x-1,y-1), t=at(x,y-1), tr=at(x+1,y-1);
        const l=at(x-1,y),               r=at(x+1,y);
        const bl=at(x-1,y+1), b=at(x,y+1), br=at(x+1,y+1);
        const dx=(tr+2*r+br)-(tl+2*l+bl);
        const dy=(bl+2*b+br)-(tl+2*t+tr);
        let nx=-dx*strength, ny=-dy*strength, nz=1;
        const len=Math.hypot(nx,ny,nz)||1;
        nx/=len; ny/=len; nz/=len;
        const o=(y*S+x)*4;
        q[o]  =(nx*.5+.5)*255;
        q[o+1]=(ny*.5+.5)*255;
        q[o+2]=(nz*.5+.5)*255;
        q[o+3]=255;
      }
    }
    octx.putImageData(img,0,0);
    return out;
  }

  /* ---------- metallic/roughness/AO pack (B=metal, G=rough, R=AO) --- */
  function ormFromCanvas(src, roughBase=.86, roughVar=.22, aoStrength=.55){
    const S=src.width, H=src.height;
    const p=src.getContext('2d').getImageData(0,0,S,H).data;
    const out=canvasOf(S,H), octx=out.getContext('2d');
    const img=octx.createImageData(S,H), q=img.data;
    for(let i=0;i<p.length;i+=4){
      const l=(p[i]*.299+p[i+1]*.587+p[i+2]*.114)/255;
      const ao=1-(1-l)*aoStrength;                 // dark pixels read as crevices
      const rough=roughBase+(1-l)*roughVar;
      q[i]  =Math.max(0,Math.min(255,ao*255));
      q[i+1]=Math.max(0,Math.min(255,rough*255));
      q[i+2]=0;                                    // fully dielectric
      q[i+3]=255;
    }
    octx.putImageData(img,0,0);
    return out;
  }

  function dyn(scene,name,cv,{wrap=true,aniso=8,invertY=false}={}){
    const t=new BABYLON.DynamicTexture(name,cv,scene,true);
    t.update(invertY);
    const mode = wrap ? BABYLON.Texture.WRAP_ADDRESSMODE : BABYLON.Texture.CLAMP_ADDRESSMODE;
    t.wrapU=mode; t.wrapV=mode;
    t.anisotropicFilteringLevel=aniso;
    return t;
  }

  /* ---------- PBR surface built from one source png ----------------- */
  async function surface(scene,{name,file,gradeOpts,paint,normalStrength,rough,roughVar,ao,normalSrc,flatColor}){
    const key='surf:'+name;
    if(cache.has(key)) return cache.get(key);
    let albedoCv;
    if(flatColor){ albedoCv=canvasOf(64,64); const fc=albedoCv.getContext('2d'); fc.fillStyle=flatColor; fc.fillRect(0,0,64,64); }
    else { const img=await loadImage(TEX+file); albedoCv=grade(img,gradeOpts); }
    if(paint) paint(albedoCv);
    const m=new BABYLON.PBRMaterial('hd_'+name,scene);
    m.albedoTexture=dyn(scene,'hd_'+name+'_alb',albedoCv);
    m.bumpTexture=dyn(scene,'hd_'+name+'_nrm',normalFromCanvas(normalSrc||albedoCv,normalStrength??2.2));
    m.bumpTexture.level=1.0;
    m.invertNormalMapY=true;
    m.metallicTexture=dyn(scene,'hd_'+name+'_orm',ormFromCanvas(albedoCv,rough??.86,roughVar??.2,ao??.55));
    m.useMetallnessFromMetallicTextureBlue=true;
    m.useRoughnessFromMetallicTextureGreen=true;
    m.useRoughnessFromMetallicTextureAlpha=false;
    m.useAmbientOcclusionFromMetallicTextureRed=true;
    m.metallic=0; m.roughness=.24;
    m.useRoughnessFromMetallicTextureGreen=false;
    m.useRoughnessFromMetallicTextureAlpha=false;
    m.environmentIntensity=.85;
    m.specularIntensity=.5;
    cache.set(key,m);
    return m;
  }

  function roundedTile(name, width, depth, height, radius, scene, topColor, sideColor){
    const w=width*.5, d=depth*.5, r=Math.min(radius,w*.45,d*.45), bevel=.045;
    const m=new BABYLON.Mesh(name,scene);
    const positions=[], indices=[], colors=[];
    const outer=[[-w+r,-d],[w-r,-d],[w,-d+r],[w,d-r],[w-r,d],[-w+r,d],[-w,d-r],[-w,-d+r]];
    const iw=w-bevel, id=d-bevel, ir=Math.max(.02,r-bevel*.35);
    const inner=[[-iw+ir,-id],[iw-ir,-id],[iw,-id+ir],[iw,id-ir],[iw-ir,id],[-iw+ir,id],[-iw,id-ir],[-iw,-id+ir]];
    const push=(x,y,z,c)=>{ positions.push(x,y,z); colors.push(c.r,c.g,c.b,1); return positions.length/3-1; };
    const topCenter=push(0,0,0,topColor), bottomCenter=push(0,-height,0,sideColor);
    const top=[], lip=[], bottom=[];
    const bevelColor=new BABYLON.Color4(topColor.r*.78,topColor.g*.82,topColor.b*.68,1);
    for(let i=0;i<outer.length;i++){
      top.push(push(inner[i][0],0,inner[i][1],topColor));
      lip.push(push(outer[i][0],-bevel,outer[i][1],bevelColor));
      bottom.push(push(outer[i][0],-height,outer[i][1],sideColor));
    }
    for(let i=0;i<outer.length;i++){
      const j=(i+1)%outer.length;
      indices.push(topCenter,top[i],top[j]);
      indices.push(top[i],lip[i],lip[j], top[i],lip[j],top[j]);
      indices.push(lip[i],bottom[i],bottom[j], lip[i],bottom[j],lip[j]);
      indices.push(bottomCenter,bottom[j],bottom[i]);
    }
    const vd=new BABYLON.VertexData();
    vd.positions=positions; vd.indices=indices; vd.colors=colors;
    const normals=[]; BABYLON.VertexData.ComputeNormals(positions,indices,normals); vd.normals=normals;
    vd.applyToMesh(m,true);
    return m;
  }

  window.TablefolkHD = { version:'hd1', surface, normalFromCanvas, ormFromCanvas, grade, dyn, loadImage, macroHeightCanvas, stoneFloorHeight,
                     paintGrassDetail, paintDirtDetail, paintStoneDetail, paintStoneChips, paintStrataDetail, canvasOf, roundedTile };
})();

/* ==================================================================
 * Part 2 — diorama geometry: island, bedrock, vegetation, water, sky
 * ================================================================== */
(() => {
  'use strict';
  const HD = window.TablefolkHD;
  const V3 = (x,y,z) => new BABYLON.Vector3(x,y,z);
  const C3 = (r,g,b) => new BABYLON.Color3(r,g,b);
  const rect = (u0,v0,u1,v1) => new BABYLON.Vector4(u0,v0,u1,v1);

  let API = null; // { WORLD, hashNoise, smoothNoise, proceduralTerrainAt, addShadow, state }

  function noise(x,z){ return API.hashNoise(x,z); }
  function merge(list,name,material,{shadows=true,pickable=false}={}){
    if(!list.length) return null;
    const m = list.length===1 ? list[0] : BABYLON.Mesh.MergeMeshes(list,true,true,undefined,false,false);
    if(!m) return null;
    m.name=name; if(material) m.material=material;
    m.isPickable=pickable; m.receiveShadows=shadows; m.useVertexColors=true;
    return m;
  }


  /* ---------- shared island edge profile ------------------------------
   * ONE deterministic description of the perimeter, consumed by the grass
   * cascade in buildIslandTop(), the stone hem in buildBedrock() and the
   * scatter in buildVegetation(). Interleaving grass, stone and plants is the
   * whole point of the reference edge, and that is only possible if all three
   * builders agree on which cells step down.
   * -------------------------------------------------------------------- */
  const TOP_Y      = .445;          // measured grass slab top
  const CAP_BOTTOM = TOP_Y - .87;   // measured grass slab underside
  // Raised from -3.05. The camera never sees below the waterline (beta .22 to
  // 1.42), so a deep wall was pure cost; a high sea is what makes the edge read
  // as a shallow hem rather than a cliff.
  const SEA_LEVEL  = -1.42;
  // Visible green on the plateau's vertical face before the stone hem starts.
  // The grass slab is 0.87 tall and only its top is green, so without this the
  // edge is dominated by a 0.87-unit dark-green wall rather than by stone.
  const GRASS_LIP  = .26;

  let EDGE_CACHE=null;
  function edgeProfile(){
    if(EDGE_CACHE) return EDGE_CACHE;
    const { WORLD }=API;
    let seed=0x1c3ff5;
    const rnd=()=>{ seed=(seed*1664525+1013904223)>>>0; return seed/4294967296; };
    const cells=[];

    // Deliberately unrelated silhouettes on all four sides. Each entry is the
    // signed displacement of one perimeter tile from the old rectangle: the
    // long east nose, bitten north-west bay and short south shoulder make the
    // island unmistakably lopsided from every useful camera angle.
    const edgeOffsets={
      'x:-1':[-.35,-.80,-1.15,-.95,-.40,.15,.75,1.15,1.00,.35],
      'x:1': [.55,.10,-.35,-.85,-.60,.10,.95,1.65,2.05,1.35],
      'z:-1':[-.65,-.95,-.45,.20,.75,1.15,1.45,1.05,.25,-.55,-1.00,-.55],
      'z:1': [1.55,1.05,.35,-.35,-.95,-1.25,-.70,.05,.75,1.35,.85,.15]
    };
    for(const axis of ['x','z']) for(const side of [-1,1]){
      const alongHalf = axis==='x' ? WORLD.halfW : WORLD.halfH;
      const n=Math.round(alongHalf*2);
      const profile=edgeOffsets[axis+':'+side];
      for(let i=0;i<n;i++){
        const corner = i===0 || i===n-1;
        const shapeOut=profile[i%profile.length];
        // Cascades are biased toward coves; exposed noses carry more bare rock.
        const stepChance=shapeOut<0?.84:.58;
        const step = corner ? 0 : (rnd()<stepChance ? (rnd()<(shapeOut<0?.55:.34)?2:1) : 0);
        const stepOut = .22+rnd()*.28;
        const c={
          axis, side, corner, step, shapeOut,
          along: -alongHalf+.5+i,
          stepOut, stepDrop: .54,
          stepOut2: stepOut+.66, stepDrop2: 1.10,
          stepShift: (rnd()-.5)*.30,
          perch: !corner && rnd()<.26,
          scatter: !corner && rnd()<.16,
          rA: rnd(), rB: rnd(), rC: rnd(), rD: rnd()
        };
        c.cols=[];
        const wide=!corner && !step && rnd()<.26;
        for(let k=0;k<(wide?1:2);k++){
          const along=c.along+(wide?0:(k?.25:-.25));
          if(step){
            const s2 = step===2 && k===1;
            const off  = s2?c.stepOut2:c.stepOut;
            const drop = s2?c.stepDrop2:c.stepDrop;
            c.cols.push({ along, top: TOP_Y-drop-GRASS_LIP-rnd()*.10,
                          out: shapeOut+off+.26+rnd()*.12, r:rnd(), r2:rnd(), wide });
          } else {
            c.cols.push({ along, top: TOP_Y-GRASS_LIP-rnd()*.09,
                          out: shapeOut+(corner?.04:.03)+rnd()*(corner?.10:.20),
                          r:rnd(), r2:rnd(), wide });
          }
        }
        c.ledges=c.cols.map(q=>({ top:q.top, out:q.out }));
        cells.push(c);
      }
    }
    EDGE_CACHE={ cells };
    return EDGE_CACHE;
  }

  /* ---------- 1. island top surface ---------------------------------- */
  async function buildIslandTop(scene){
    const { WORLD } = API;
    const REPEAT = 3.6;
    const GAP = .014;

    const mats = {
      dirt: await HD.surface(scene,{ name:'dirt', file:'dirt_path.png',
        gradeOpts:{ sat:.72, bright:1.10, contrast:1.02, tintR:1.05, tintG:.98, tintB:.86 },
        paint:cv=>HD.paintDirtDetail(cv,31), normalStrength:3.0, rough:.94, roughVar:.08, ao:.62 }),
      stone: await HD.surface(scene,{ name:'stone', file:'stone_blocks.png',
        gradeOpts:{ sat:.66, bright:.74, contrast:1.24, tintR:.98, tintG:1.00, tintB:1.08 },
        paint:cv=>HD.paintStoneDetail(cv,53), normalStrength:3.4, rough:.82, roughVar:.14, ao:.68 })
    };

    // The corrected Tripo grass tile has real baked AO and roughness 0.88.
    // Import it once, clone it for grass cells, and merge the clones. This is
    // intentionally behind ?procedural=1 so the old generated slab remains an
    // immediate A/B/rollback path while the asset is being locked down.
    const useGrassGLB=!new URLSearchParams(location.search).has('procedural');
    let grassProto=null, grassRoot=null;
    if(useGrassGLB){
      try{
        const result=await BABYLON.SceneLoader.ImportMeshAsync('', ASSETS+'models/tiles/', (window.tablefolkAsset||(f=>f))('grass_v7_orm.glb'), scene);
        grassRoot=result.meshes.find(m=>m.getTotalVertices?.()>0) || result.meshes[0];
        if(grassRoot){
          grassProto=grassRoot;
          grassProto.name='hd_grass_proto'; grassProto.isVisible=false; grassProto.setEnabled(false);
          window.TABLEFOLK_LOOK?.applyClayLookToMeshes(result.meshes,scene,{detail:.11,detailScale:5});
        }
      }catch(err){ console.warn('grass GLB unavailable; using procedural slab',err); }
    }
    if(!grassProto){
      mats.grass=await HD.surface(scene,{ name:'grass', flatColor:'#71883a',
        normalSrc:HD.macroHeightCanvas(512,17,34,.52), normalStrength:.72, rough:.94, roughVar:.04, ao:.12 });
    }

    const groups = { grass:[], dirt:[], stone:[] };
    // Centres of every plateau-height tile. app.js's hasGroundAt() looks these
    // up instead of raycasting the merged grass mesh (thousands of picks froze
    // the tab when a scenario laid out a map).
    const plateau=[];
    let yawSeed=0x5eed1234;
    const yawRnd=()=>{ yawSeed=(yawSeed*1664525+1013904223)>>>0; return yawSeed/4294967296; };
    for(let tx=-WORLD.halfW; tx<WORLD.halfW; tx++){
      for(let tz=-WORLD.halfH; tz<WORLD.halfH; tz++){
        const cx=tx+.5, cz=tz+.5;
        const kind = API.proceduralTerrainAt(cx,cz);
        const key = groups[kind] ? kind : 'grass';
        // Cut the plateau itself to the same one-sided silhouette as the cliff.
        // The east nose reaches farther than the west, while the north-west bay
        // takes a deep bite; this is intentionally not mirrored on either axis.
        const east=[.55,.10,-.35,-.85,-.60,.10,.95,1.65,2.05,1.35][Math.max(0,Math.min(9,Math.floor(tz+WORLD.halfH)))];
        const west=[-.35,-.80,-1.15,-.95,-.40,.15,.75,1.15,1.00,.35][Math.max(0,Math.min(9,Math.floor(tz+WORLD.halfH)))];
        const north=[1.55,1.05,.35,-.35,-.95,-1.25,-.70,.05,.75,1.35,.85,.15][Math.max(0,Math.min(11,Math.floor(tx+WORLD.halfW)))];
        const south=[-.65,-.95,-.45,.20,.75,1.15,1.45,1.05,.25,-.55,-1.00,-.55][Math.max(0,Math.min(11,Math.floor(tx+WORLD.halfW)))];
        if(cx>WORLD.halfW+east || cx<-WORLD.halfW-west || cz>WORLD.halfH+north || cz<-WORLD.halfH-south) continue;
        plateau.push([cx,cz]);
        const n=noise(tx*3.1+5,tz*2.7-3);
        const h=.42+n*.025;
        const lift=(noise(tx*7.7,tz*5.3)-.5)*.018;
        let box;
        if(key==='grass' && grassProto){
          box=grassProto.clone('hd_grass_tile');
          box.setEnabled(true); box.isVisible=true; box.isPickable=false;
          box.rotation.y=Math.floor(yawRnd()*4)*Math.PI/2;
          box.scaling.x=(yawRnd()<.5?-1:1)*1.006;
          box.scaling.z=(yawRnd()<.5?-1:1)*1.006;
          // The source footprint is 0.996 x 1.000. A tiny uniform expansion
          // closes sub-pixel gaps without returning to the old inset-tile hack.
          box.scaling.y=1.006;
          box.position.set(cx,lift+.010,cz);
        } else {
          const u0=(tx+WORLD.halfW)/REPEAT, u1=(tx+1+WORLD.halfW)/REPEAT;
          const v0=(tz+WORLD.halfH)/REPEAT, v1=(tz+1+WORLD.halfH)/REPEAT;
          const top=rect(u0,v0,u1,v1), side=rect(u0,0,u1,.55);
          const t=.94+noise(tx*11.3+1,tz*13.7+9)*.13;
          const warm=.97+noise(tx*5.9,tz*3.3)*.07;
          const topC=new BABYLON.Color4(t*warm,t,t*(2-warm),1);
          const sideC=key==='grass' ? new BABYLON.Color4(.27*t,.30*t,.12*t,1) : new BABYLON.Color4(topC.r*.40,topC.g*.37,topC.b*.33,1);
          box=key==='grass'
            ? HD.roundedTile('hd_tile',1-GAP,1-GAP,h,.075,scene,topC,sideC)
            : BABYLON.MeshBuilder.CreateBox('hd_tile',{ width:1-GAP,height:h,depth:1-GAP,
                faceUV:[side,side,side,side,top,side],faceColors:[sideC,sideC,sideC,sideC,topC,new BABYLON.Color4(.10,.09,.07,1)],wrap:true },scene);
          box.position.set(cx,-h/2+lift,cz);
        }
        groups[key].push(box);
      }
    }
    // The three specifically annotated front-shelf cells are complete grass
    // tiles: two across the upper row and one directly below the left tile.
    if(grassProto){
      for(const [x,z] of [[-2.85,WORLD.halfH+.03],[-1.85,WORLD.halfH+.03],[-2.85,WORLD.halfH+1.03],[-3.85,WORLD.halfH+.03],[-3.85,WORLD.halfH+1.03]]){
        const box=grassProto.clone('hd_grass_front_terrace');
        box.setEnabled(true); box.isVisible=true; box.isPickable=false;
        box.rotation.y=0; box.scaling.set(1.006,1.006,1.006);
        box.position.set(x,.010,z); groups.grass.push(box);
        plateau.push([x,z]);
      }
    }

    // Grass cascade. The reference plateau does not stop at a line: part of
    // the perimeter steps down and outward one or two tiles before the stone
    // takes over. These are real grass_v7 clones, not boxes, so they carry the
    // same baked AO and material as the plateau and merge into the same mesh.
    if(grassProto){
      for(const c of edgeProfile().cells){
        if(!c.step) continue;
        const outHalf=c.axis==='x'?WORLD.halfH:WORLD.halfW;
        for(let s=0;s<c.step;s++){
          const off =s?c.stepOut2:c.stepOut;
          const drop=s?c.stepDrop2:c.stepDrop;
          const along=c.along+(s?c.stepShift:0);
          const outward=outHalf+off;
          const x=c.axis==='x'?along:c.side*outward;
          const z=c.axis==='x'?c.side*outward:along;
          const box=grassProto.clone('hd_grass_step');
          box.setEnabled(true); box.isVisible=true; box.isPickable=false;
          box.rotation.y=Math.floor(yawRnd()*4)*Math.PI/2;
          box.scaling.x=(yawRnd()<.5?-1:1)*1.006;
          box.scaling.z=(yawRnd()<.5?-1:1)*1.006;
          box.scaling.y=1.006;
          box.position.set(x,.010-drop,z);
          groups.grass.push(box);
        }
      }
    }

    const out={};
    for(const k of Object.keys(groups)){
      if(!groups[k].length) continue;
      // GLB clones already carry the corrected material; other groups receive
      // their generated PBR surface during merge.
      out[k]=merge(groups[k],'hd_island_'+k,k==='grass'&&grassProto?null:mats[k]);
      if(out[k] && k==='grass' && grassProto) out[k].material=grassProto.material;
    }
    const usedGrassGLB=!!grassProto;
    grassProto?.dispose();
    API.state.hdMaterials=Object.assign(API.state.hdMaterials||{},mats);
    API.state.usingGrassGLB=usedGrassGLB;
    if(out.grass?.material) API.state.hdMaterials.grassGLB=out.grass.material;
    API.state.terrainTopY=TOP_Y;
    API.state.seaLevel=SEA_LEVEL;
    API.state.plateauTiles=plateau;
    return out;
  }

  /* ---------- 2. coherent carved cliff perimeter ---------------------- */
  // Discard every triangle above a local-space height so an accent contributes
  // only its rock buttress. The alternative (sinking the piece) can never work:
  // the cap is the TOP of the asset and the piece projects PAST the wall, so any
  // visible green reads as a second grass ledge.
  // side>0 keeps geometry BELOW limitY, side<0 keeps geometry ABOVE it.
  // Measured: the Tripo cliff assets carry their grass cap at the BOTTOM of
  // local space, not the top, so cutting the top left the green behind.
  function trimSlab(mesh,limitY,side){
    const pos=mesh.getVerticesData(BABYLON.VertexBuffer.PositionKind);
    const idx=mesh.getIndices();
    if(!pos||!idx) return 0;
    const keep=[];
    for(let i=0;i<idx.length;i+=3){
      const a=idx[i],b=idx[i+1],c=idx[i+2];
      const ya=pos[a*3+1],yb=pos[b*3+1],yc=pos[c*3+1];
      const ok = side>0 ? Math.max(ya,yb,yc)<=limitY : Math.min(ya,yb,yc)>=limitY;
      if(ok) keep.push(a,b,c);
    }
    const dropped=(idx.length-keep.length)/3;
    mesh.setIndices(keep);
    mesh.refreshBoundingInfo();
    return dropped;
  }

  async function importCliffAsset(scene,file,name,trimFraction=0,trimSide=1){
    const r=await BABYLON.SceneLoader.ImportMeshAsync('', ASSETS+'models/tiles/', (window.tablefolkAsset||(f=>f))(file), scene);
    const mesh=r.meshes.find(m=>m.getTotalVertices?.()>0);
    if(!mesh) throw new Error('no renderable mesh in '+file);
    mesh.name=name; mesh.parent=null; mesh.setEnabled(true); mesh.isVisible=false; mesh.isPickable=false;
    const b=mesh.getHierarchyBoundingVectors(true), ext=b.max.subtract(b.min);
    // Centre the footprint in x/z but keep the base at y=0, so rotation.y spins
    // about the piece rather than a corner and placement maths stays readable.
    mesh.position.set(-(b.min.x+b.max.x)*.5,-b.min.y,-(b.min.z+b.max.z)*.5);
    const scale=1/Math.max(ext.x,ext.z);
    mesh.scaling.setAll(scale); mesh.bakeCurrentTransformIntoVertices(); mesh.position.set(0,0,0);
    const assetHeight=ext.y*scale;
    mesh.metadata=Object.assign(mesh.metadata||{},{assetHeight});
    if(trimFraction>0){
      // Cut the grass end off and drop the remainder back to y=0 so callers can
      // place the piece by its base like any other block.
      const limit=trimSide>0 ? assetHeight*(1-trimFraction) : assetHeight*trimFraction;
      trimSlab(mesh,limit,trimSide);
      const bb=mesh.getBoundingInfo().boundingBox;
      mesh.position.y=-bb.minimum.y;
      mesh.bakeCurrentTransformIntoVertices();
      mesh.position.set(0,0,0);
      mesh.refreshBoundingInfo();
      mesh.metadata.trimmedHeight=mesh.getBoundingInfo().boundingBox.maximum.y;
    }
    window.TABLEFOLK_LOOK?.applyClayLookToMeshes(r.meshes,scene,{detail:.11,detailScale:5});
    return mesh;
  }

  // World units per masonry texture repeat. Boxes carry real face UVs so the
  // graded stone albedo / generated normal / ORM maps actually resolve; the old
  // roundedTile() path emitted no UVs at all and read as flat brown slabs.
  const STONE_UV = 3.4;

  // Faces are toned separately. A single tone per block made every plane in
  // the terrace equal, so the blocks fused into a wall; the reference reads as
  // cubes precisely because each one's top face is the brightest thing on it.
  function stoneBox(scene,name,w,h,d,x,y,z,mat,tone,ry=0){
    const uw=w/STONE_UV, uh=h/STONE_UV, ud=d/STONE_UV;
    const fz=rect(0,0,uw,uh), fx=rect(0,0,ud,uh), fy=rect(0,0,uw,ud);
    const g=v=>{ const t=Math.min(1.55,tone*v); return new BABYLON.Color4(t,t,t,1); };
    const top=g(1.42), bot=g(.20), lit=g(1.04), shade=g(.60);
    const m=BABYLON.MeshBuilder.CreateBox(name,{ width:w, height:h, depth:d,
      faceUV:[fz,fz,fx,fx,fy,fy],
      faceColors:[lit,shade,lit,shade,top,bot], wrap:true },scene);
    m.position.set(x,y,z);
    if(ry) m.rotation.y=ry;
    m.material=mat; m.isPickable=false; m.receiveShadows=true;
    return m;
  }

  // Faceted rock. An icosphere with jittered vertices and flat shading reads
  // as a quarried boulder under the clay look, and unlike a box it never lines
  // up with the cube grid behind it.
  function boulder(scene,name,r,x,y,z,mat,tone,rnd){
    const m=BABYLON.MeshBuilder.CreateIcoSphere(name,{ radius:r, subdivisions:2, flat:true },scene);
    const p=m.getVerticesData(BABYLON.VertexBuffer.PositionKind);
    // flat:true DUPLICATES vertices per face, so each corner appears five or six
    // times. The displacement must therefore be a function of the ORIGINAL
    // position, not of the array index: jittering the array directly moves each
    // copy of a corner somewhere different and tears the solid into shards.
    const seen=new Map();
    const disp=(vx,vy,vz)=>{
      const key=Math.round(vx*1e4)+'|'+Math.round(vy*1e4)+'|'+Math.round(vz*1e4);
      let d=seen.get(key);
      if(!d){ d=[.82+rnd()*.30, .60+rnd()*.30]; seen.set(key,d); }
      return d;
    };
    for(let i=0;i<p.length;i+=3){
      const d=disp(p[i],p[i+1],p[i+2]);
      p[i]*=d[0]; p[i+1]*=d[0]*d[1]; p[i+2]*=d[0];
    }
    m.updateVerticesData(BABYLON.VertexBuffer.PositionKind,p);
    const cols=new Float32Array((p.length/3)*4);
    for(let i=0;i<cols.length;i+=4){ cols[i]=cols[i+1]=cols[i+2]=tone; cols[i+3]=1; }
    m.setVerticesData(BABYLON.VertexBuffer.ColorKind,cols);
    const nrm=[]; BABYLON.VertexData.ComputeNormals(p,m.getIndices(),nrm);
    m.setVerticesData(BABYLON.VertexBuffer.NormalKind,nrm);
    m.position.set(x,y,z); m.rotation.y=rnd()*Math.PI*2;
    m.material=mat; m.isPickable=false; m.receiveShadows=true;
    return m;
  }

  async function buildBedrock(scene){
    const { WORLD }=API;
    // Plain quarried stone. NOT stone_blocks.png: that texture is a printed
    // grid of small square tiles, so every cube face wore brickwork and a row
    // of them fused into a retaining wall however the geometry was staggered.
    // The reference cubes are unpatterned mottled rock; stone_soft.png has the
    // blotch without the grid.
    const stone=await HD.surface(scene,{ name:'cliff_masonry', file:'stone_soft.png',
      gradeOpts:{ sat:1.02, bright:1.24, contrast:1.26, tintR:1.00, tintG:1.00, tintB:1.01 },
      paint:cv=>HD.paintStoneChips(cv,71), normalStrength:1.9, rough:.90, roughVar:.10, ao:.72 });
    stone.environmentIntensity=1.05;
    // Every cliff face is vertical while the key light points down (-.48,-.86,
    // .62), so lights barely reach them: a large hemi lift measured only about
    // +5 levels. A low emissive copy of the albedo lifts the value into the
    // reference's mid blue-grey while keeping the masonry detail, which a flat
    // ambient term would wash out.
    stone.emissiveTexture=stone.albedoTexture;
    stone.emissiveColor=new BABYLON.Color3(.026,.028,.030);

    const E=edgeProfile();
    const TERRACE_TOP=CAP_BOTTOM+.30;
    const BOT=SEA_LEVEL-.80;

    const blocks=[], shore=[], perches=[];
    let seed=0xbed40c;
    const rnd=()=>{ seed=(seed*1664525+1013904223)>>>0; return seed/4294967296; };
    // Mid values, separated block to block. The reference distinguishes cubes
    // by value, not by hue, and nothing in it is close to black.
    const tone=()=>{ const r=rnd(); return r<.26?.62+rnd()*.12 : r<.74?.80+rnd()*.11 : .96+rnd()*.08; };
    // Depth grading. A uniformly random tone spreads the darks evenly over the
    // whole hem, but the reference concentrates them low down and in recesses,
    // which is where its near-black comes from. y is the block top.
    const depthTone=(y,recess=0)=>{
      const f=Math.min(1,Math.max(0,(TOP_Y-GRASS_LIP-y)/1.5));
      return tone()*(1-f*.46)*(1-recess*.22);
    };

    // Deepest inner face reached by any cube, so the core can be pulled back
    // behind them: a core flush with the plateau edge reads as a continuous
    // back wall through the seams.
    let coreX=0, coreZ=0;

    const put=(list,name,c,along,face,w,h,d,cyTop,t)=>{
      const outward=face-d*.5;
      const inner=face-d;
      if(c.axis==='x') coreZ=Math.max(coreZ,inner); else coreX=Math.max(coreX,inner);
      const x=c.axis==='x'?along:c.side*outward;
      const z=c.axis==='x'?c.side*outward:along;
      const m=stoneBox(scene,name,c.axis==='x'?w:d,h,c.axis==='x'?d:w,
        x,cyTop-h*.5,z,stone,t);
      list.push(m); return m;
    };

    const COURSE=.46;    // cubes read wider than tall, as in the reference
    for(const c of E.cells){
      const outHalf = c.axis==='x' ? WORLD.halfH : WORLD.halfW;
      for(const col of c.cols){
        let top=col.top, ci=0;
        while(top>BOT+.10){
          const last=(top-COURSE)<=BOT+.10;
          const h=last?top-BOT:COURSE*(.92+col.r*.16);
          // Batter: each course steps back slightly, with jitter, and the odd
          // one juts proud so the waterline is not a straight extrusion.
          const jut=(ci>0 && ((ci*7+col.r2*11)%3)<1)?.20:0;
          const out=Math.max(.01, col.out-ci*.05+jut+(rnd()-.5)*.30);
          // Depth derived from the outward offset, so the inner face always
          // lands the same distance inside the plateau edge: that is what makes
          // the terrace void-proof however far a cube steps out.
          const d=out+1.06+rnd()*.16;
          // Seam must be wide enough for SSAO to resolve at review distance;
          // at 0.04 it was finer than the sample radius and contributed nothing.
          const w=(col.wide?.92:.48)+rnd()*.10;
          // Recessed courses take an extra tone cut: a block set back behind
          // its neighbours is in their shadow and the render should say so.
          const recess=Math.max(0,Math.min(1,(col.out-out)*2.2));
          put(blocks,'hd_cliff_block',c,col.along+((ci&1)?.15:-.15)+(rnd()-.5)*.10,
            outHalf+out,w,h,d,top,depthTone(top,recess));
          top-=h; ci++;
        }
      }

      // A loose cube perched on the tread, as in the reference.
      if(c.perch){
        const L=c.cols[0];
        const s=.26+rnd()*.14;
        put(perches,'hd_edge_stone',c,c.along+(rnd()-.5)*.34,
          outHalf+L.out-.06,s,s*(.82+rnd()*.28),s,L.top+s*(.82+rnd()*.10),tone());
      }
    }

    // Rounded boulders scattered ON the plateau. The reference has these well
    // inside the boundary, and they are rocks, not cubes: a cube here just
    // looks like a piece of the wall that escaped.
    for(let i=0;i<26;i++){
      const s=.20+rnd()*.26;
      const edge=rnd()<.45;
      const x=edge?(rnd()<.5?-1:1)*(WORLD.halfW-.3-rnd()*1.6):(rnd()*2-1)*(WORLD.halfW-1.2);
      const z=edge?(rnd()*2-1)*(WORLD.halfH-1.0):(rnd()<.5?-1:1)*(WORLD.halfH-.3-rnd()*1.6);
      if(Math.abs(x)<2.2&&Math.abs(z)<2.2) continue;
      perches.push(boulder(scene,'hd_edge_stone',s,x,TOP_Y+s*.42,z,stone,tone(),rnd));
    }

    // Corner stacks turned 45 degrees so the two runs meet on a cut corner
    // rather than a square tower.
    // Corner stacks. Built from the same half-tile cube grammar as the runs -
    // two cubes per corner across the diagonal, coursed at COURSE - because the
    // previous version was two big 45-degree blocks from the tall-wall era and
    // read as a bastion pasted onto a fine grid.
    for(const sx of [-1,1]) for(const sz of [-1,1]){
      for(let q=0;q<3;q++){
        // q walks the corner: 0 along x, 2 along z, 1 the diagonal cap.
        const diag=q===1;
        const baseOut=.06+rnd()*.16;
        let top=TOP_Y-GRASS_LIP-rnd()*.10, ci=0;
        while(top>BOT+.10){
          const last=(top-COURSE)<=BOT+.10;
          const h=last?top-BOT:COURSE*(.92+rnd()*.16);
          const out=Math.max(.01,baseOut-ci*.05+(rnd()-.5)*.22);
          const s=(diag?.62:.48)+rnd()*.06;
          const d=out+.92+rnd()*.16;
          const ox=diag?out*.72:out, oz=diag?out*.72:out;
          const x=sx*(WORLD.halfW+(q===0?ox:(diag?ox:-.24-rnd()*.10)));
          const z=sz*(WORLD.halfH+(q===2?oz:(diag?oz:-.24-rnd()*.10)));
          const m=stoneBox(scene,'hd_cliff_corner_block',
            q===2?d:s,h,q===2?s:(diag?s:d),
            x,top-h*.5,z,stone,depthTone(top),diag?Math.PI/4:0);
          blocks.push(m);
          top-=h; ci++;
        }
      }
    }

    // The annotated front shelf is grass-only at its top. Do not add the
    // former side-by-side stone fascia here; adjacent staggered cliff blocks
    // support it from below and behind without recreating the crossed-out row.
    API.state.frontGrassTerrace=[{x:-2.85,z:WORLD.halfH+.03},{x:-1.85,z:WORLD.halfH+.03},{x:-2.85,z:WORLD.halfH+1.03},{x:-3.85,z:WORLD.halfH+.03},{x:-3.85,z:WORLD.halfH+1.03}];

    // Solid core. Set well back from the shallowest cube: flush with them it
    // reads as a continuous wall behind the seams, whereas at this depth the
    // seams go dark and the cubes separate. Toned down for the same reason.
    const coreInX=Math.min(coreX+.38,WORLD.halfW-.42), coreInZ=Math.min(coreZ+.38,WORLD.halfH-.42);
    blocks.push(stoneBox(scene,'hd_cliff_core',coreInX*2,TERRACE_TOP-BOT,coreInZ*2,
      0,(TERRACE_TOP+BOT)*.5,0,stone,.30));
    // Secondary staggered infill sits behind every other perimeter cell.
    // It closes the unnatural full-height slots while retaining a voxel edge
    // and irregular shallow seams between individual stones.
    for(const c of E.cells){
      if(c.corner || (Math.floor(c.along+20)&1)) continue;
      const outHalf=c.axis==='x'?WORLD.halfH:WORLD.halfW;
      const h=.72+rnd()*.34, top=TOP_Y-GRASS_LIP-.24-rnd()*.18;
      const out=c.shapeOut-.30+rnd()*.18, d=.82+rnd()*.18, w=.72+rnd()*.20;
      put(blocks,'hd_cliff_infill',c,c.along+.28+(rnd()-.5)*.12,
        outHalf+out,w,h,d,top,depthTone(top,.45));
    }

    // Shallow-water stones so the shoreline is not a clean rectangle meeting a
    // flat plane.
    for(let i=0;i<22;i++){
      const axis=i%2?'x':'z';
      const side=(i>>1)%2?1:-1;
      const half   = axis==='x' ? WORLD.halfW : WORLD.halfH;
      const outHalf= axis==='x' ? WORLD.halfH : WORLD.halfW;
      const along=(rnd()*2-1)*(half-.4);
      const outward=outHalf+.55+rnd()*.75;
      const s=.24+rnd()*.40;
      const x=axis==='x'?along:side*outward, z=axis==='x'?side*outward:along;
      shore.push(boulder(scene,'hd_shore_rock',s*.7,x,SEA_LEVEL-.06+rnd()*.22,z,
        stone,tone(),rnd));
    }

    // The imported cliff_rock_*.glb accents were removed here. They were sized
    // for the old tall wall and dwarfed the half-tile cubes; the reference edge
    // has no such feature. importCliffAsset()/restone.py remain available.
    API.state.generatedCliffSegments=0;

    const wall=merge(blocks,'hd_cliff_wall',stone);
    const rocks=merge(shore,'hd_shore_rocks',stone);
    const loose=merge(perches,'hd_edge_stones',stone);
    API.state.hdMaterials=Object.assign(API.state.hdMaterials||{},{cliff:stone});
    API.state.cliffFaceParts=blocks.length+shore.length+perches.length;
    API.state.cliffBottomY=BOT;
    return { wall, rocks, loose };
  }

  /* ---------- 3. vegetation ------------------------------------------ */
  function tuftTexture(scene){
    const S=256, cv=HD.canvasOf(S,S), ctx=cv.getContext('2d');
    ctx.clearRect(0,0,S,S);
    let s=991; const rnd=()=>{ s=(s*16807)%2147483647; return s/2147483647; };
    for(let i=0;i<26;i++){
      const bx=S*.5+(rnd()-.5)*S*.78;
      const topY=S*(.06+rnd()*.34);
      const w=4+rnd()*7;
      const lean=(rnd()-.5)*S*.34;
      const g=ctx.createLinearGradient(0,S,0,topY);
      const dark=rnd()<.5;
      g.addColorStop(0, dark?'#3c4220':'#4a5226');
      g.addColorStop(.6, dark?'#5e6a33':'#6f7a3c');
      g.addColorStop(1, dark?'#8a9450':'#aab268');
      ctx.fillStyle=g;
      ctx.beginPath();
      ctx.moveTo(bx-w,S);
      ctx.quadraticCurveTo(bx-w*.4+lean*.5,(S+topY)/2, bx+lean, topY);
      ctx.quadraticCurveTo(bx+w*.4+lean*.5,(S+topY)/2, bx+w,S);
      ctx.closePath(); ctx.fill();
    }
    const t=HD.dyn(scene,'hd_tuft_tex',cv,{wrap:false,aniso:4});
    t.hasAlpha=true;
    return t;
  }
  function daisyTexture(scene){
    const S=128, cv=HD.canvasOf(S,S), ctx=cv.getContext('2d');
    ctx.clearRect(0,0,S,S);
    const draw=(cx,cy,r,petal,core)=>{
      for(let k=0;k<6;k++){
        const a=k/6*Math.PI*2;
        ctx.fillStyle=petal;
        ctx.beginPath(); ctx.ellipse(cx+Math.cos(a)*r*.62, cy+Math.sin(a)*r*.62, r*.42, r*.24, a, 0, 7); ctx.fill();
      }
      ctx.fillStyle=core; ctx.beginPath(); ctx.arc(cx,cy,r*.28,0,7); ctx.fill();
    };
    draw(S*.5,S*.42,S*.34,'#f3f7ea','#f2c94c');
    ctx.strokeStyle='#3f7a2a'; ctx.lineWidth=4; ctx.beginPath(); ctx.moveTo(S*.5,S*.6); ctx.lineTo(S*.5,S); ctx.stroke();
    const t=HD.dyn(scene,'hd_daisy_tex',cv,{wrap:false,aniso:4});
    t.hasAlpha=true;
    return t;
  }
  function alphaMat(scene,name,tex,{emissive=0}={}){
    const m=new BABYLON.StandardMaterial(name,scene);
    m.diffuseTexture=tex; m.opacityTexture=tex;
    m.useAlphaFromDiffuseTexture=true;
    m.diffuseTexture.hasAlpha=true;
    m.specularColor=C3(.5,.5,.5);
    m.backFaceCulling=false;
    m.transparencyMode=BABYLON.Material.MATERIAL_ALPHATESTANDBLEND;
    m.alphaCutOff=.34;
    if(emissive) m.emissiveColor=C3(emissive,emissive,emissive);
    return m;
  }


  function crossedQuads(scene,name,w,h,y){
    const a=BABYLON.MeshBuilder.CreatePlane(name,{width:w,height:h,sideOrientation:BABYLON.Mesh.DOUBLESIDE},scene);
    const b=BABYLON.MeshBuilder.CreatePlane(name,{width:w,height:h,sideOrientation:BABYLON.Mesh.DOUBLESIDE},scene);
    a.position.y=y; b.position.y=y; b.rotation.y=Math.PI/2;
    const m=BABYLON.Mesh.MergeMeshes([a,b],true,true,undefined,false,false);
    m.name=name;
    return m;
  }


  async function importScatterAsset(scene,file,name){
    const r=await BABYLON.SceneLoader.ImportMeshAsync('', ASSETS+'models/props/gen/', (window.tablefolkAsset||(f=>f))(file), scene);
    const mesh=r.meshes.find(m=>m.getTotalVertices?.()>0);
    if(!mesh) throw new Error('no renderable mesh in '+file);
    mesh.name=name; mesh.parent=null; mesh.setEnabled(true); mesh.isVisible=true; mesh.isPickable=false;
    const bounds=mesh.getHierarchyBoundingVectors(true);
    mesh.position.y-=bounds.min.y;
    mesh.bakeCurrentTransformIntoVertices(); mesh.position.set(0,0,0);
    window.TABLEFOLK_LOOK?.applyClayLookToMeshes(r.meshes,scene,{detail:.11,detailScale:5});
    return mesh;
  }

  // Scenery is registered in a later closure, so expose the shared generated-
  // asset importer on the HD namespace rather than relying on closure scope.
  HD.importScatterAsset=importScatterAsset;

  async function buildVegetation(scene){
    const { WORLD } = API;
    // Medium quality skips the grass tufts/daisies (~360k vertices).
    if(window.TABLEFOLK_GFX?.quality==='medium') return;
    let tuftProto,daisyProto;
    try{
      [tuftProto,daisyProto]=await Promise.all([
        importScatterAsset(scene,'blade_cluster.glb','hd_blade_cluster_proto'),
        importScatterAsset(scene,'daisy_clump.glb','hd_daisy_clump_proto')
      ]);
    }catch(e){ console.warn('generated vegetation unavailable',e); return; }
    const tufts=[],daisies=[];
    let seed=0x67a55eed;
    const rnd=()=>{ seed=(seed*1664525+1013904223)>>>0; return seed/4294967296; };
    for(let tx=-WORLD.halfW;tx<WORLD.halfW;tx++) for(let tz=-WORLD.halfH;tz<WORLD.halfH;tz++){
      const cx=tx+.5,cz=tz+.5;
      if(API.proceduralTerrainAt(cx,cz)!=='grass') continue;
      const density=noise(tx*2.17+31,tz*1.73-19);
      let count=density<.62?0:density<.89?1:density<.975?2:3;
      if(Math.abs(cx)<2.1&&Math.abs(cz)<2.1) count=0;
      // Keep larger quiet zones around the house and campfire so hero props
      // read against clean grass instead of the old uniform tuft carpet.
      if(Math.hypot(cx-4.15,cz+1.35)<2.0 || Math.hypot(cx-1.0,cz-.45)<1.45) count=0;
      for(let j=0;j<count;j++){
        const c=tuftProto.clone('hd_blade_cluster');
        const scale=.50*(.90+rnd()*.20);
        // Keep blade clusters upright: sideways/inverted modes read as
        // trampled grass. Vary heading plus a gentle one-direction lean only.
        const lean=(rnd()-.5)*.18;
        c.scaling.setAll(scale);
        c.rotationQuaternion=BABYLON.Quaternion.FromEulerAngles(lean,rnd()*Math.PI*2,0);
        c.position.set(cx+(rnd()-.5)*.72,(API.state.terrainTopY??0)+.018,cz+(rnd()-.5)*.72); c.isPickable=false;
        tufts.push(c);
      }
      if(density>.78&&rnd()<.38){
        const c=daisyProto.clone('hd_daisy_clump');
        const scale=.42*(.90+rnd()*.20);
        const mode=Math.floor(rnd()*6);
        const pitch=[0,Math.PI/2,-Math.PI/2,Math.PI,.36,-.36][mode];
        const roll =[0,0,0,0,.45,-.45][mode];
        c.scaling.setAll(scale);
        c.rotationQuaternion=BABYLON.Quaternion.FromEulerAngles(pitch,rnd()*Math.PI*2,roll);
        c.position.set(cx+(rnd()-.5)*.62,(API.state.terrainTopY??0)+.018,cz+(rnd()-.5)*.62); c.isPickable=false;
        daisies.push(c);
      }
    }
    // Vegetation does not stop at the plateau boundary in the reference: it
    // grows on the stepped-down grass caps and out of the seams between the
    // top course of cubes.
    for(const c of edgeProfile().cells){
      const outHalf=c.axis==='x'?WORLD.halfH:WORLD.halfW;
      const spots=[];
      if(c.step){
        spots.push([c.stepOut,(API.state.terrainTopY??TOP_Y)-c.stepDrop+.018,2]);
        if(c.step===2) spots.push([c.stepOut2,(API.state.terrainTopY??TOP_Y)-c.stepDrop2+.018,1]);
      }
      if(!c.corner && c.rD<.72) spots.push([c.ledges[0].out-.24,c.ledges[0].top+.02,2]);
      // Right on the plateau lip, spilling outward over the drop.
      if(!c.corner && c.rC<.95) spots.push([-.14-c.rB*.26,(API.state.terrainTopY??TOP_Y)+.018,3]);
      for(const [off,y,rawCount] of spots){
        const count=Math.max(0,Math.round(rawCount*2/3));
        for(let j=0;j<count;j++){
          const outward=outHalf+off+(rnd()-.5)*.34;
          const along=c.along+(rnd()-.5)*.62;
          const x=c.axis==='x'?along:c.side*outward;
          const z=c.axis==='x'?c.side*outward:along;
          const t=tuftProto.clone('hd_blade_cluster');
          t.scaling.setAll(.46*(.85+rnd()*.28));
          t.rotationQuaternion=BABYLON.Quaternion.FromEulerAngles((rnd()-.5)*.22,rnd()*Math.PI*2,0);
          t.position.set(x,y,z); t.isPickable=false; tufts.push(t);
        }
        if(rnd()<.09){
          const outward=outHalf+off+(rnd()-.5)*.3;
          const along=c.along+(rnd()-.5)*.5;
          const d=daisyProto.clone('hd_daisy_clump');
          d.scaling.setAll(.38*(.9+rnd()*.2));
          d.rotationQuaternion=BABYLON.Quaternion.FromEulerAngles(0,rnd()*Math.PI*2,0);
          d.position.set(c.axis==='x'?along:c.side*outward,y,c.axis==='x'?c.side*outward:along);
          d.isPickable=false; daisies.push(d);
        }
      }
    }

    // Remove the two unsupported vegetation clumps at the annotated front
    // shelf. They were generated from edge/seam scatter and visibly floated
    // over the cliff; no replacement tile is wanted here.
    const floatingFrontPatch=m=>m.position.z>WORLD.halfH-.35 && m.position.z<WORLD.halfH+1.35 && m.position.x>-4.35 && m.position.x<-2.15;
    for(let i=tufts.length-1;i>=0;i--) if(floatingFrontPatch(tufts[i])) tufts.splice(i,1)[0].dispose();
    for(let i=daisies.length-1;i>=0;i--) if(floatingFrontPatch(daisies[i])) daisies.splice(i,1)[0].dispose();

    tuftProto.dispose(); daisyProto.dispose();
    // Keep transformed clones separate. Mesh.MergeMeshes was flattening the
    // imported GLB clones without preserving their authored rotations, making
    // every flower and blade cluster visibly identical.
    for(const c of tufts){ c.receiveShadows=true; c.name='hd_generated_blade_cluster'; API.addShadow(c); }
    for(const c of daisies){ c.receiveShadows=true; c.name='hd_generated_daisy_clump'; API.addShadow(c); }
    API.state.generatedVegetation={tufts:tufts.length,daisies:daisies.length};
  }

  /* ---------- 4. trees, bushes, boulders ----------------------------- */
  async function buildFlora(scene){
    const { WORLD } = API;
    const leafA=new BABYLON.PBRMaterial('hd_leaf_a',scene);
    leafA.albedoColor=C3(.175,.235,.098); leafA.metallic=0; leafA.roughness=.94; leafA.specularIntensity=.5;
    const leafB=new BABYLON.PBRMaterial('hd_leaf_b',scene);
    leafB.albedoColor=C3(.115,.155,.068); leafB.metallic=0; leafB.roughness=.92; leafB.specularIntensity=.5;
    const rockM=new BABYLON.PBRMaterial('hd_boulder',scene);
    rockM.albedoColor=C3(.22,.215,.205); rockM.metallic=0; rockM.roughness=.88; rockM.specularIntensity=.5;

    const leavesA=[], leavesB=[], rocks=[], trees=[];

    // Art-directed image-to-3D asset derived from the master concept. Keeping
    // trees in the same GLB pipeline as other props makes flora reusable by the
    // sandbox and avoids the winding/open-shell failures of bespoke tier meshes.
    let pineProto=null;
    try{
      pineProto=await importScatterAsset(scene,'tree.glb','hd_tree_proto');
      const b=pineProto.getHierarchyBoundingVectors(true);
      const h=Math.max(1e-6,b.max.y-b.min.y);
      // Tripo normalises this asset to about one unit tall; preserve the old
      // pine(x,z,s) call sites, whose nominal tree height was roughly 1.5*s.
      pineProto.scaling.setAll(1.50/h);
      pineProto.bakeCurrentTransformIntoVertices();
      pineProto.scaling.setAll(1); pineProto.position.set(0,0,0);
      pineProto.setEnabled(false);
    }catch(e){ console.warn('generated tree unavailable',e); }

    function pine(x,z,s,seed){
      if(!pineProto) return;
      const t=pineProto.clone('hd_tree');
      t.setEnabled(true); t.isVisible=true; t.isPickable=false;
      t.position.set(x,0,z);
      t.rotation.y=noise(seed,31)*Math.PI*2;
      // Geometric size variation only; no per-instance colour tint jitter.
      t.scaling.setAll(s*(.88+noise(seed,33)*.24));
      t.receiveShadows=true; API.addShadow(t); trees.push(t);
    }

    function paintUniform(mesh,t){
      const n=mesh.getTotalVertices(), c=new Float32Array(n*4);
      for(let i=0;i<n;i++){ c[i*4]=c[i*4+1]=c[i*4+2]=t; c[i*4+3]=1; }
      mesh.setVerticesData(BABYLON.VertexBuffer.ColorKind,c);
    }

    function bush(x,z,s,seed){
      for(let i=0;i<3;i++){
        const b=BABYLON.MeshBuilder.CreateSphere('bush_lobe',{ diameter:(.20+noise(seed,i)*.16)*s, segments:5 },scene);
        b.position.set(x+(noise(seed,i*7)-.5)*.20*s, .09*s+noise(seed,i*11)*.06, z+(noise(seed,i*13)-.5)*.20*s);
        b.scaling.y=.72;
        paintUniform(b,i%2?1:1.12);
        (i%2?leavesB:leavesA).push(b);
      }
    }

    // perimeter forest: reduced by one third to preserve the back line while
    // opening larger gaps around the playable plateau.
    let seed=0;
    for(let i=0;i<29;i++){
      seed++;
      const side=i%4;
      const t=noise(i*1.61,i*.83);
      let x,z;
      if(side===0){ x=-WORLD.halfW+t*WORLD.w; z=-WORLD.halfH+noise(i,3)*1.9; }
      else if(side===1){ x=-WORLD.halfW+t*WORLD.w; z=WORLD.halfH-noise(i,5)*1.9; }
      else if(side===2){ x=-WORLD.halfW+noise(i,7)*1.9; z=-WORLD.halfH+t*WORLD.h; }
      else { x=WORLD.halfW-noise(i,9)*1.9; z=-WORLD.halfH+t*WORLD.h; }
      if(API.proceduralTerrainAt(x,z)!=='grass') continue;
      if(Math.abs(x)<3.0 && Math.abs(z)<3.0) continue;
      if(noise(i*4.7,i*2.9)<.35) continue;
      pine(x,z,.85+noise(i,11)*.95,seed);
    }
    // scattered inner bushes and boulders
    for(let i=0;i<44;i++){
      const x=-WORLD.halfW+noise(i*2.37+21,i*1.11)*WORLD.w;
      const z=-WORLD.halfH+noise(i*1.83+5,i*2.71)*WORLD.h;
      const kind=API.proceduralTerrainAt(x,z);
      if(Math.abs(x)<1.6 && Math.abs(z)<1.6) continue;
      if(kind==='grass' && i%3===0){ bush(x,z,.55+noise(i,17)*.5,100+i); continue; }
      if(kind==='water') continue;
      if(noise(i*3.7+2,i*5.1)<.45) continue;
      const r=BABYLON.MeshBuilder.CreatePolyhedron('hd_boulder',{ type:i%4===0?2:1, size:.075+noise(i,19)*.13 },scene);
      r.position.set(x,.06+noise(i,21)*.05,z);
      r.rotation.set(i*.83,i*1.41,i*.29);
      r.scaling.set(1+noise(i,23)*.5,.72+noise(i,25)*.5,1+noise(i,27)*.5);
      rocks.push(r);
    }

    pineProto?.dispose();
    const l1=merge(leavesA,'hd_leaves_a',leafA);
    const l2=merge(leavesB,'hd_leaves_b',leafB);
    const r1=merge(rocks,'hd_boulders',rockM);
    for(const m of [l1,l2,r1]) if(m) API.addShadow(m);
  }


  /* ---------- 5. water + foam ---------------------------------------- */
  function buildWater(scene){
    const { WORLD } = API;
    const SEA_Y=SEA_LEVEL;

    // Deep translucent sea. Brighter, softer, less plastic than before, with a
    // procedural bump map so the surface carries moving detail instead of a
    // flat reflective shell. The broad ambient + fog do most of the shading.
    const sea=BABYLON.MeshBuilder.CreateGround('hd_sea',{ width:180, height:180, subdivisions:72 },scene);
    sea.position.y=SEA_Y; sea.isPickable=false;
    const m=new BABYLON.PBRMaterial('hd_sea_mat',scene);
    m.albedoColor=C3(.014,.058,.092);
    m.metallic=.05; m.roughness=.48;
    m.emissiveColor=C3(.004,.022,.036);
    m.environmentIntensity=.55; m.alpha=.94;
    const bw=512,bh=512, bcv=HD.canvasOf(bw,bh), bctx=bcv.getContext('2d');
    bctx.fillStyle='#808080'; bctx.fillRect(0,0,bw,bh);
    let wseed=0x1c3ff5; const wr2=()=>{ wseed=(wseed*1664525+1013904223)>>>0; return wseed/4294967296; };
    for(let i=0;i<340;i++){
      const y0=wr2()*bh, x0=wr2()*bw, len=40+wr2()*170, v=Math.floor(80+wr2()*130);
      bctx.strokeStyle='rgba('+v+','+v+','+v+','+(.4+wr2()*.6).toFixed(2)+')';
      bctx.lineWidth=1+wr2()*2.4;
      // Draw each stroke at 3x3 offsets so the pattern wraps seamlessly in
      // both U and V (the texture tiles 30x across the sea). Without this the
      // canvas edges don't match and a seam shows at every wrap boundary.
      for(const ox of [-bw,0,bw]) for(const oy of [-bh,0,bh]){
        bctx.beginPath(); bctx.moveTo(x0+ox,y0+oy);
        for(let j=1;j<=6;j++) bctx.lineTo(x0+ox+len*j/6, y0+oy+Math.sin(j*1.2+wr2()*6)*7);
        bctx.stroke();
      }
    }
    const bumpTex=HD.dyn(scene,'hd_sea_nrm',HD.normalFromCanvas(bcv,2.4));
    bumpTex.uScale=30.0; bumpTex.vScale=30.0;
    m.bumpTexture=bumpTex; m.bumpTexture.level=.5; m.invertNormalMapY=true;
    sea.material=m;

    const pos=sea.getVerticesData(BABYLON.VertexBuffer.PositionKind), base=pos.slice();
    const nrm=sea.getVerticesData(BABYLON.VertexBuffer.NormalKind);
    // Directional swell + two cross-travels + a circular lip so waves read as
    // moving water rather than a wobbling sheet.
    const waveHeight=(x,z,t)=>
      Math.sin(x*.30+z*.42+t*1.10)*.16+           // main swell (NE travel)
      Math.sin(z*.62-x*.22-t*.60)*.11+
      Math.sin((x+z)*1.24+t*1.02)*.05+
      Math.sin(Math.hypot(x+5,z-2)*.90-t*.78)*.04;
    const waveStep=(t)=>{
      for(let i=0;i<pos.length;i+=3) pos[i+1]=waveHeight(base[i],base[i+2],t);
      sea.updateVerticesData(BABYLON.VertexBuffer.PositionKind,pos,false,false);
      BABYLON.VertexData.ComputeNormals(pos,sea.getIndices(),nrm);
      sea.updateVerticesData(BABYLON.VertexBuffer.NormalKind,nrm,false,false);
    };

    // ------------------------------------------------------------------
    // Shoreline foam. A closed ribbon follows the lopsided edgeProfile so the
    // foam collar hugs the actual shore (coves bulging out, noses wrapping),
    // instead of a rectangle around the island. Two bands: a tight bright
    // collar at the waterline and a wider, fainter swell band just outside.
    // Each band is rebuilt every frame (cheap: ~90 verts) with a scalloped
    // radius and a soft alpha gradient across its width.
    // ------------------------------------------------------------------
    const shorePts=[];
    {
      const groups={'x:-1':[],'x:1':[],'z:-1':[],'z:1':[]};
      for(const c of edgeProfile().cells) groups[c.axis+':'+c.side].push(c);
      const order=[['x:-1',false],['z:1',false],['x:1',true],['z:-1',true]];
      for(const [key,rev] of order){
        const arr=groups[key].slice().sort((a,b)=>a.along-b.along);
        const list=rev?arr.reverse():arr;
        for(const c of list){
          const oh=c.axis==='x'?WORLD.halfH:WORLD.halfW;
          const out=oh+c.shapeOut+.42+c.rA*.12;
          shorePts.push([c.axis==='x'?c.along:c.side*out, c.axis==='x'?c.side*out:c.along]);
        }
      }
    }
    const rN=shorePts.length;
    const rbPh=new Float32Array(rN);
    { let s2=0x7f4a7c; for(let i=0;i<rN;i++){ s2=(s2*1664525+1013904223)>>>0; rbPh[i]=(s2/4294967296)*6.283; } }
    function makeRibbon(name,{half,baseY,baseAlpha,extra}) {
      const mesh=new BABYLON.Mesh(name,scene); mesh.isPickable=false; mesh.alphaIndex=9;
      const mat=new BABYLON.StandardMaterial(name+'_mat',scene);
      mat.emissiveColor=C3(1,1,1); mat.diffuseColor=C3(1,1,1); mat.disableLighting=true;
      mat.useVertexColors=true; mat.backFaceCulling=false;
      mat.alpha=baseAlpha; mesh.material=mat;
      const rebuild=(t)=>{
        const P=[], I=[], C=[];
        for(let i=0;i<=rN;i++){
          const j=i%rN;
          const x=shorePts[j][0], z=shorePts[j][1];
          const rad=Math.hypot(x,z)||1, nx=x/rad, nz=z/rad;
          const bx=x+nx*extra, bz=z+nz*extra;
          const sc=1+Math.sin(t*1.35+rbPh[j])*.16;
          const w=half*sc;
          const y=SEA_Y+baseY+Math.sin(t*1.1+rbPh[j])*.015;
          P.push(bx-nx*w, y, bz-nz*w);
          P.push(bx+nx*w, y+(extra?-.012:.014), bz+nz*w);
          C.push(1,1,1,(extra?.22:.58));
          C.push(1,1,1,(extra?.42:.85));
        }
        for(let i=0;i<rN;i++){
          const a=i*2,b=i*2+1,c=a+2,d=b+2;
          I.push(a,b,c, b,d,c);
        }
        const normals=[]; BABYLON.VertexData.ComputeNormals(P,I,normals);
        const vd=new BABYLON.VertexData();
        vd.positions=P; vd.indices=I; vd.colors=C; vd.normals=normals;
        vd.applyToMesh(mesh,true);
      };
      return {mesh,mat,rebuild};
    }
    const foamMain=makeRibbon('hd_foam_main',{half:.30,baseY:.075,baseAlpha:.9,extra:.18});
    const foamWide=makeRibbon('hd_foam_wide',{half:.70,baseY:.045,baseAlpha:.40,extra:.85});
    foamMain.rebuild(0); foamWide.rebuild(0);

    // Broad translucent current bands (kept from the old build - gives the deep
    // water direction and never reads as rings).
    const currentM=[], currentMeshes=[];
    const makeCurrent=(i,pts,color,alpha)=>{
      const cx=pts.reduce((a,p)=>a+p[0],0)/pts.length;
      const cz=pts.reduce((a,p)=>a+p[1],0)/pts.length;
      const positions=[cx,0,cz], indices=[];
      for(const p of pts) positions.push(p[0],0,p[1]);
      for(let j=0;j<pts.length;j++) indices.push(0,1+j,1+((j+1)%pts.length));
      const vd=new BABYLON.VertexData(); vd.positions=positions; vd.indices=indices;
      vd.normals=[]; BABYLON.VertexData.ComputeNormals(positions,indices,vd.normals);
      const poly=new BABYLON.Mesh('hd_water_current_'+i,scene); vd.applyToMesh(poly);
      const cm=new BABYLON.PBRMaterial('hd_water_current_mat_'+i,scene);
      cm.albedoColor=color; cm.emissiveColor=color.scale(.17); cm.metallic=.04;
      cm.roughness=.30; cm.alpha=alpha; cm.backFaceCulling=false;
      poly.position.y=SEA_Y+.018+i*.004; poly.material=cm; poly.isPickable=false; poly.alphaIndex=4+i;
      currentM.push(cm); currentMeshes.push(poly);
    };
    makeCurrent(0,[[-19,-10],[-7,-12],[6,-9],[18,-3],[18,2],[5,-2],[-7,-5],[-19,-3]],C3(.020,.110,.150),.26);
    makeCurrent(1,[[-18,7],[-7,3],[3,4],[18,10],[18,16],[4,10],[-8,10],[-18,14]],C3(.028,.132,.165),.22);
    makeCurrent(2,[[-15,-18],[-10,-7],[-12,4],[-18,15],[-24,15],[-19,2],[-21,-9]],C3(.016,.086,.130),.23);

    // Thin bright glints riding the waves.
    const glintM=new BABYLON.StandardMaterial('hd_water_glint_mat',scene);
    glintM.emissiveColor=C3(.30,.68,.80); glintM.diffuseColor=C3(0,0,0);
    glintM.disableLighting=true; glintM.alpha=.28;
    const glints=[];
    let waterSeed=0xa71ce5;
    const wrnd=()=>{ waterSeed=(waterSeed*1664525+1013904223)>>>0; return waterSeed/4294967296; };
    for(let i=0;i<34;i++){
      const x=(wrnd()*2-1)*20, z=(wrnd()*2-1)*15, len=.35+wrnd()*1.35;
      const line=BABYLON.MeshBuilder.CreateTube('hd_water_glint',{path:[V3(x-len*.5,SEA_Y+.07,z),V3(x+len*.5,SEA_Y+.07,z+.05)],radius:.009+wrnd()*.010,tessellation:4},scene);
      line.material=glintM; line.isPickable=false; line.alphaIndex=9;
      glints.push({mesh:line,x,z,phase:wrnd()*6.28,speed:.10+wrnd()*.15});
    }

    // Whitecap crests: little bright dashes that only show up where a swell
    // stands tall, so the water visibly breaks instead of just bobbing.
    let creSeed=0x3c1e7f;
    const crnd=()=>{ creSeed=(creSeed*1664525+1013904223)>>>0; return creSeed/4294967296; };
    const crestM=new BABYLON.StandardMaterial('hd_water_crest_mat',scene);
    crestM.emissiveColor=C3(.95,1,1); crestM.diffuseColor=C3(0,0,0); crestM.disableLighting=true;
    crestM.alpha=.8;
    const crests=[];
    for(let i=0;i<26;i++){
      const a=crnd()*6.283, r=5+crnd()*8;
      const cr=BABYLON.MeshBuilder.CreateTube('hd_water_crest',{path:[V3(-.18,0,0),V3(.18,0,0)],radius:.05,tessellation:5},scene);
      const cmc=crestM.clone('hd_water_crest_mat_'+i);
      cr.material=cmc; cr.isPickable=false; cr.alphaIndex=10; cr.setEnabled(false);
      crests.push({mesh:cr,x:Math.cos(a)*r,z:Math.sin(a)*r,ph:crnd()*6.283,rot:a});
    }

    // Foam dashes at the very shore, sampled from the edge profile.
    const foamM=new BABYLON.StandardMaterial('hd_shore_foam_mat',scene);
    foamM.emissiveColor=C3(.85,.96,1); foamM.diffuseColor=C3(.05,.12,.13);
    foamM.disableLighting=true; foamM.alpha=.5;
    const foam=[];
    for(const c of edgeProfile().cells){
      if(c.corner) continue;
      const outHalf=c.axis==='x'?WORLD.halfH:WORLD.halfW;
      const out=outHalf+c.shapeOut+.30+c.rA*.18;
      const along=c.along+(c.rB-.5)*.45;
      const x=c.axis==='x'?along:c.side*out, z=c.axis==='x'?c.side*out:along;
      const len=.12+c.rC*.30;
      const dash=BABYLON.MeshBuilder.CreateTube('hd_shore_foam',{path:[V3(x-len,SEA_Y+.085,z),V3(x+len,SEA_Y+.085,z)],radius:.016+c.rD*.014,tessellation:4},scene);
      if(c.axis==='z') dash.rotation.y=Math.PI/2;
      dash.material=foamM; dash.isPickable=false; dash.alphaIndex=10;
      foam.push({mesh:dash,x,z,phase:(c.rA+c.rC)*6.28});
    }

    // Lily pads, gently riding the waves.
    const lilyM=new BABYLON.PBRMaterial('hd_lily_mat',scene);
    lilyM.albedoColor=C3(.09,.24,.10); lilyM.metallic=0; lilyM.roughness=.72; lilyM.specularIntensity=.5;
    lilyM.emissiveColor=C3(.01,.04,.01);
    const lilyStemM=new BABYLON.PBRMaterial('hd_lily_stem_mat',scene);
    lilyStemM.albedoColor=C3(.06,.16,.06); lilyStemM.metallic=0; lilyStemM.roughness=.82; lilyStemM.specularIntensity=.5;
    const lilies=[];
    for(let i=0;i<18;i++){
      const a=wrnd()*Math.PI*2, r=WORLD.halfW+1.4+wrnd()*5.4;
      const x=Math.cos(a)*r+1.3, z=Math.sin(a)*r*.82-.4, padR=.16+wrnd()*.22;
      const pad=BABYLON.MeshBuilder.CreateCylinder('hd_lily_pad',{diameter:padR*2,height:.028,tessellation:10},scene);
      pad.rotation.y=wrnd()*Math.PI*2; pad.position.set(x,SEA_Y+.045,z); pad.material=lilyM; pad.isPickable=false;
      const stem=BABYLON.MeshBuilder.CreateCylinder('hd_lily_stem',{diameter:.024,height:.22,tessellation:5},scene);
      stem.position.set(x,SEA_Y-.08,z); stem.material=lilyStemM; stem.isPickable=false;
      lilies.push({pad,stem,x,z,phase:wrnd()*6.28});
    }

    // PERF NOTE: this whole animate() runs every frame on the main thread and
    // is the single heaviest per-frame CPU cost in the scene (?norender=1
    // skips it entirely, which is why that flag makes the audio glitches go
    // away). Two sub-costs stand out as optimization candidates, left as-is
    // for now per request - not touching behavior yet:
    //   - waveStep(): CPU-displaces every vertex of a 72x72 (~5.3k vert)
    //     ground mesh AND calls BABYLON.VertexData.ComputeNormals over its
    //     ~10.4k triangles, every frame. This is classic vertex-shader work
    //     being done on the CPU; it could move into a custom vertex shader /
    //     material plugin (GPU) with no visual change, or run at a lower
    //     fixed rate (e.g. every 2nd frame) with interpolation.
    //   - foamMain.rebuild()/foamWide.rebuild(): allocates brand-new P/I/C
    //     JS arrays and a new VertexData every frame for two ribbon meshes.
    //     That's continuous GC churn (likely a contributor to audio
    //     glitching - major GC pauses can stall the AudioWorklet too), and
    //     it's unnecessary: the ribbon topology (I) never changes, so P/C
    //     could be preallocated Float32Arrays reused in place via
    //     updateVerticesData() instead of vd.applyToMesh() every frame.
    // Both of these are now user-toggleable from the Graphics tab
    // (graphics-settings.js -> window.TABLEFOLK_GFX.seaWaveEnabled/seaFoamEnabled)
    // as a direct, reversible way to test whether they're contributing to
    // the audio glitch on a given machine, without editing code.
    const animate=(t)=>{
      const gfx=window.TABLEFOLK_GFX;
      if(!gfx || gfx.seaWaveEnabled!==false){
        window.TablefolkPerf?.begin('sea.wave');
        waveStep(t);
        window.TablefolkPerf?.end('sea.wave');
      }
      // Scroll the procedural bump map so the surface detail visibly travels
      // with the swell. The vertex displacement alone is too subtle on a
      // 180-unit sea; a static bump map reads as frozen water.
      bumpTex.uOffset=(t*.05)%1;
      bumpTex.vOffset=(t*.035)%1;
      if(!gfx || gfx.seaFoamEnabled!==false){
        foamMain.mesh.setEnabled(true); foamWide.mesh.setEnabled(true);
        window.TablefolkPerf?.begin('sea.foam');
        foamMain.rebuild(t); foamWide.rebuild(t);
        window.TablefolkPerf?.end('sea.foam');
        foamMain.mat.alpha=.90+Math.sin(t*.9)*.08;
        foamWide.mat.alpha=.34+Math.sin(t*.7+2)*.10;
      } else {
        foamMain.mesh.setEnabled(false); foamWide.mesh.setEnabled(false);
      }
      window.TablefolkPerf?.begin('sea.misc');
      for(let i=0;i<currentMeshes.length;i++){
        currentMeshes[i].position.x=Math.sin(t*.07+i*2.1)*.55;
        currentMeshes[i].position.z=Math.cos(t*.055+i)*.35;
        currentM[i].alpha=(i===0?.26:i===1?.22:.23)*(1+Math.sin(t*.28+i)*.10);
      }
      for(const g of glints){
        g.mesh.position.x=((t*g.speed+g.phase)%4)-2;
        g.mesh.position.y=waveHeight(g.x+g.mesh.position.x,g.z,t)+SEA_Y+.08;
        g.mesh.scaling.x=.70+.30*Math.sin(t*.75+g.phase);
      }
      for(const cr of crests){
        const y=waveHeight(cr.x,cr.z,t);
        const peak=Math.max(0,(y-.030)/.10);
        cr.mesh.setEnabled(peak>.05);
        if(peak>.05){
          cr.mesh.position.set(cr.x, SEA_Y+.065+y, cr.z);
          cr.mesh.rotation.y=cr.rot + t*.2;
          cr.mesh.material.alpha=.35+peak*.55;
        }
        cr.x+=Math.cos(cr.ph)*.022; cr.z+=Math.sin(cr.ph)*.022;
        if(Math.abs(cr.x)>15||Math.abs(cr.z)>11){ cr.x=(crnd()-.5)*26; cr.z=(crnd()-.5)*16; cr.ph=crnd()*6.283; }
      }
      foamM.alpha=.40+Math.sin(t*.92)*.16;
      for(const f of foam) f.mesh.position.y=waveHeight(f.x,f.z,t)+Math.sin(t*1.2+f.phase)*.018;
      for(const l of lilies){
        const y=waveHeight(l.x,l.z,t);
        l.pad.position.y=SEA_Y+.045+y; l.stem.position.y=SEA_Y-.08+y;
        l.pad.rotation.z=Math.sin(t*.65+l.phase)*.035;
      }
      window.TablefolkPerf?.end('sea.misc');
    };
    if(window.TABLEFOLK_STILL_MODE){ animate(0); console.warn('[tablefolk-water] STILL MODE - wave animation frozen'); }
    else {
      let _warned=false;
      scene.onBeforeRenderObservable.add(()=>{
        if(!_warned){ _warned=true; console.log('[tablefolk-water] wave animation running (frame '+(performance.now()*.001).toFixed(2)+')'); }
        animate(performance.now()*.001);
      });
    }
    return sea;
  }

  /* ---------- 6. sky ------------------------------------------------- */
  function buildSky(scene){
    const W=1024, H=1024, cv=HD.canvasOf(W,H), ctx=cv.getContext('2d');
    const g=ctx.createLinearGradient(0,0,0,H);
    g.addColorStop(0,'#0a1c2c');
    g.addColorStop(.30,'#10293c');
    g.addColorStop(.52,'#143a4a');
    g.addColorStop(.68,'#0d2231');
    g.addColorStop(1,'#04070d');
    ctx.fillStyle=g; ctx.fillRect(0,0,W,H);
    let s=4242; const rnd=()=>{ s=(s*16807)%2147483647; return s/2147483647; };
    // soft haze band near the horizon
    for(let i=0;i<40;i++){
      const y=H*.44+rnd()*H*.2, h=6+rnd()*26;
      ctx.fillStyle='rgba(70,150,170,'+(0.02+rnd()*.05).toFixed(3)+')';
      ctx.fillRect(0,y,W,h);
    }
    for(let i=0;i<220;i++){
      const x=rnd()*W, y=rnd()*H*.62, a=.12+rnd()*.4, r=rnd()<.08?2.4:1.4;
      ctx.fillStyle='rgba(240,248,255,'+a.toFixed(2)+')';
      ctx.beginPath(); ctx.arc(x,y,r,0,7); ctx.fill();
    }
    const tex=HD.dyn(scene,'hd_sky_tex',cv,{wrap:false,aniso:2});
    const m=new BABYLON.StandardMaterial('hd_sky_mat',scene);
    m.emissiveTexture=tex; m.diffuseColor=C3(0,0,0); m.disableLighting=true; m.backFaceCulling=false;
    const dome=BABYLON.MeshBuilder.CreateSphere('hd_sky',{ diameter:320, segments:18, sideOrientation:BABYLON.Mesh.BACKSIDE },scene);
    dome.material=m; dome.isPickable=false; dome.infiniteDistance=true;
    return dome;
  }

  /* ---------- entry -------------------------------------------------- */
  async function buildIsland(scene, api){
    API=api;
    buildSky(scene);
    await buildIslandTop(scene);
    await buildBedrock(scene);
    await buildVegetation(scene);
    await buildFlora(scene);
    if(!window.TABLEFOLK_NOWATER) buildWater(scene);
    // Part 3 registers after this closure has run, but before buildIsland() is
    // called. `window.TablefolkHD` was captured as HD in Part 1; use that stable
    // object rather than looking the property up through an optional global.
    // The old lookup silently skipped the entire scenery pass in some harnesses.
    if(HD.buildScenery){
      try{ await HD.buildScenery(scene,API); }catch(e){ console.warn('scenery failed',e); }
    }
    console.log('[character] HD diorama built (hd2)');
  }

  window.TablefolkHD.buildIsland=buildIsland;
  window.TablefolkHD.buildSky=buildSky;
  window.TablefolkHD.buildWater=buildWater;
})();

/* ==================================================================
 * Part 3 — scenery dressing: fence, signpost, tent, lantern, crates
 * ================================================================== */
(() => {
  'use strict';
  const HD=window.TablefolkHD;
  const C3=(r,g,b)=>new BABYLON.Color3(r,g,b);
  const rect=(a,b,c,d)=>new BABYLON.Vector4(a,b,c,d);

  function pbr(scene,name,color,rough,{emissive=null,metallic=0}={}){
    const m=new BABYLON.PBRMaterial(name,scene);
    m.albedoColor=color; m.metallic=metallic; m.roughness=rough;
    if(emissive) m.emissiveColor=emissive;
    m.environmentIntensity=.45;
    return m;
  }


  async function buildScenery(scene, api){
    const { WORLD } = api;
    const noise=api.hashNoise;
    const wood = await HD.surface(scene,{ name:'plank', file:'wood_planks.png',
      gradeOpts:{ sat:.72, bright:1.02, contrast:1.10, tintR:1.02, tintG:.90, tintB:.72 },
      normalStrength:2.8, rough:.90, roughVar:.10, ao:.60 });
    const cloth = await HD.surface(scene,{ name:'tentcloth', file:'canvas_fabric.png',
      gradeOpts:{ sat:.55, bright:1.05, contrast:1.06 },
      normalStrength:2.2, rough:.86, roughVar:.10, ao:.50 });
    const darkWood=pbr(scene,'hd_darkwood',C3(.115,.072,.042),.92);
    const metal=pbr(scene,'hd_lantern_metal',C3(.14,.13,.12),.42,{metallic:.55});
    const glow=pbr(scene,'hd_lantern_glow',C3(.06,.05,.02),.30,{emissive:C3(1.9,1.15,.42)});

    const posts=[], rails=[], planks=[];

    /* --- picket fence hugging the south-west grass edge --- */
    function fenceRun(x0,z0,x1,z1,segs){
      for(let i=0;i<=segs;i++){
        const t=i/segs;
        const x=x0+(x1-x0)*t, z=z0+(z1-z0)*t;
        const h=.62+noise(i*3.1,i*1.7)*.14;
        const p=BABYLON.MeshBuilder.CreateBox('fence_post',{ width:.10, height:h, depth:.10 },scene);
        p.position.set(x,h/2,z); p.rotation.y=(noise(i,5)-.5)*.22; posts.push(p);
      }
      const len=Math.hypot(x1-x0,z1-z0);
      const ang=Math.atan2(x1-x0,z1-z0);
      for(const y of [.24,.46]){
        const r=BABYLON.MeshBuilder.CreateBox('fence_rail',{ width:.055, height:.085, depth:len,
          faceUV:[rect(0,0,len*1.4,.5),rect(0,0,len*1.4,.5),rect(0,0,len*1.4,.5),rect(0,0,len*1.4,.5),rect(0,0,1,1),rect(0,0,1,1)] },scene);
        r.position.set((x0+x1)/2,y,(z0+z1)/2); r.rotation.y=ang; rails.push(r);
      }
    }
    fenceRun(-WORLD.halfW+.55, WORLD.halfH-1.15, -1.9, WORLD.halfH-1.15, 9);
    fenceRun(-WORLD.halfW+.55, WORLD.halfH-1.15, -WORLD.halfW+.55, 1.6, 6);

    /* --- signpost by the path --- */
    const sp=BABYLON.MeshBuilder.CreateBox('signpost',{ width:.11, height:1.0, depth:.11 },scene);
    sp.position.set(-3.42,.5,.22); sp.rotation.y=.24; posts.push(sp);
    for(const [y,dir] of [[.80,1],[.56,-1]]){
      const arm=BABYLON.MeshBuilder.CreateBox('sign_arm',{ width:.62, height:.20, depth:.045,
        faceUV:[rect(0,0,1.6,.6),rect(0,0,1.6,.6),rect(0,0,.3,.6),rect(0,0,.3,.6),rect(0,0,1.6,.4),rect(0,0,1.6,.4)] },scene);
      arm.position.set(-3.42+dir*.30,y,.22+dir*.05); arm.rotation.y=.24+dir*.16; planks.push(arm);
    }

    /* --- reference-derived crate stack (decor, non-interactive) --- */
    // One reusable GLB replaces the old textured boxes. Its source is the
    // master's square-framed, diagonally braced crate; the 5k conversion keeps
    // the broad braces and clean corners from every azimuth better than 3k.
    const crateSpots=[[-1.05,-3.35,.52,0],[-.55,-3.05,.44,.6],[-1.02,-3.30,.40,.3],[3.05,1.85,.50,-.4]];
    try{
      const crateProto=await HD.importScatterAsset(scene,'crate.glb','hd_crate_proto');
      const cb=crateProto.getHierarchyBoundingVectors(true);
      const ce=cb.max.subtract(cb.min);
      const base=Math.max(ce.x,ce.z,1e-6);
      crateProto.scaling.setAll(1/base); crateProto.bakeCurrentTransformIntoVertices();
      crateProto.scaling.setAll(1); crateProto.position.set(0,0,0); crateProto.setEnabled(false);
      crateSpots.forEach((c,i)=>{
        const [x,z,sz,ry]=c;
        const y=(api.state.terrainTopY??0)+(i===2 ? .52 : 0);
        const b=crateProto.clone('hd_decor_crate');
        b.setEnabled(true); b.isVisible=true; b.isPickable=false;
        b.scaling.setAll(sz); b.rotation.y=ry; b.position.set(x,y,z);
        b.receiveShadows=true; api.addShadow(b);
      });
      crateProto.dispose();
    }catch(e){ console.warn('generated crate unavailable',e); }

    /* --- reference-derived house on the north-east grass --- */
    const tentX=4.15, tentZ=-1.35;
    let house=null;
    try{
      const houseProto=await HD.importScatterAsset(scene,'house.glb','hd_house_proto');
      const hb=houseProto.getHierarchyBoundingVectors(true), he=hb.max.subtract(hb.min);
      // The master house occupies about 2.4 x 2.2 cells and remains a compact
      // back-right landmark, leaving the central play area unobstructed.
      const scale=2.35/Math.max(he.x,he.z,1e-6);
      houseProto.scaling.setAll(scale); houseProto.bakeCurrentTransformIntoVertices();
      houseProto.scaling.setAll(1);
      houseProto.position.set(tentX,api.state.terrainTopY??0,tentZ);
      // The doorway needed another quarter-turn from the +PI/2 checkpoint.
      houseProto.rotationQuaternion=null;
      houseProto.rotation.set(0,Math.PI,0);
      houseProto.name='hd_house'; houseProto.isPickable=false;
      houseProto.receiveShadows=true; api.addShadow(houseProto); house=houseProto;
    }catch(e){ console.warn('generated house unavailable',e); }

    /* --- hanging lantern beside the tent --- */
    const hook=BABYLON.MeshBuilder.CreateBox('lantern_hook',{ width:.055, height:1.30, depth:.055 },scene);
    hook.position.set(tentX+1.28,.65,tentZ+.75); posts.push(hook);
    const arm=BABYLON.MeshBuilder.CreateBox('lantern_arm',{ width:.40, height:.05, depth:.05 },scene);
    arm.position.set(tentX+1.10,1.26,tentZ+.75); posts.push(arm);
    const cage=BABYLON.MeshBuilder.CreateCylinder('lantern_cage',{ height:.26, diameterTop:.12, diameterBottom:.16, tessellation:6 },scene);
    cage.position.set(tentX+.92,1.10,tentZ+.75); cage.material=metal; cage.isPickable=false;
    const bulb=BABYLON.MeshBuilder.CreateSphere('lantern_bulb',{ diameter:.11, segments:7 },scene);
    bulb.position.set(tentX+.92,1.10,tentZ+.75); bulb.material=glow; bulb.isPickable=false;
    const lamp=new BABYLON.PointLight('hd_lantern_light',new BABYLON.Vector3(tentX+.92,1.10,tentZ+.75),scene);
    lamp.diffuse=C3(1,.72,.34); lamp.intensity=1.35; lamp.range=6.2;
    if(!window.TABLEFOLK_STILL_MODE) scene.onBeforeRenderObservable.add(()=>{
      const t=performance.now()*.0022;
      lamp.intensity=1.28+Math.sin(t*2.3)*.10+Math.sin(t*5.7)*.05;
    });

    const postM=darkWood;
    // This scenery was authored against the old y=0 plateau. The imported GLB
    // grass surface is higher, so lift the complete scenery pass by the measured
    // terrain top. Previously these meshes were excluded by the generic
    // `hd_` ownership rule and remained buried.
    const topY=api.state.terrainTopY??0;
    const lift=m=>{ if(m) m.position.y+=topY; return m; };
    const p1=lift(posts.length===1?posts[0]:BABYLON.Mesh.MergeMeshes(posts,true,true,undefined,false,false));
    if(p1){ p1.name='hd_posts'; p1.material=postM; p1.isPickable=false; p1.receiveShadows=true; api.addShadow(p1); }
    const r1=lift(rails.length===1?rails[0]:BABYLON.Mesh.MergeMeshes(rails,true,true,undefined,false,false));
    if(r1){ r1.name='hd_rails'; r1.material=wood; r1.isPickable=false; r1.receiveShadows=true; api.addShadow(r1); }
    const k1=lift(planks.length===1?planks[0]:BABYLON.Mesh.MergeMeshes(planks,true,true,undefined,false,false));
    if(k1){ k1.name='hd_planks'; k1.material=wood; k1.isPickable=false; k1.receiveShadows=true; api.addShadow(k1); }
    for(const m of [cage,bulb]) m.position.y+=topY;
    lamp.position.y+=topY;
  }

  window.TablefolkHD.buildScenery=buildScenery;
})();
