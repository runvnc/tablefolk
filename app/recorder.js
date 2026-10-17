/* Launch-only APNG evidence recorder. Captures the Babylon canvas and embeds
   the pre-recording world snapshot in PNG tEXt metadata. */
(() => {
  'use strict';

  const FPS = 4;
  const MAX_SECONDS = 20;
  const MAX_WIDTH = 640;
  // Frames are retained as raw RGBA until UPNG encoding. Keep a hard byte cap
  // so high-DPI/ultrawide canvases cannot push the tab into memory pressure.
  const MAX_RAW_BYTES = 128 * 1024 * 1024;
  const PNG_SIGNATURE_BYTES = 8;
  let session = null;

  const $ = id => document.getElementById(id);
  const status = text => { const n = $('recordingStatus'); if (n) n.textContent = text; };

  function snapshotWorld() {
    const world = window.tablefolk;
    const state = world?.state;
    if (!state) throw new Error('world is not ready');
    const meshRecord = mesh => {
      const m = mesh?.metadata || {};
      const p = mesh?.getAbsolutePosition?.() || mesh?.position || {};
      return { type:m.type || mesh?.name || 'object', x:+(p.x || 0).toFixed(3), y:+(p.y || 0).toFixed(3), z:+(p.z || 0).toFixed(3), state:m.state || 'intact', health:m.health };
    };
    return {
      format:'tablefolk-recording-state', version:1, capturedAt:new Date().toISOString(),
      turn:{ index:state.turn?.index || 0, phase:state.turn?.phase || 'ready' },
      allowed:[...(state.allowed || [])],
      agents:(state.characters || []).map(g => ({
        id:g.id, style:g.style, anim:g.anim,
        position:{ x:+g.root.position.x.toFixed(3), y:+g.root.position.y.toFixed(3), z:+g.root.position.z.toFixed(3) },
        facing:{ x:+g.dir.x.toFixed(3), y:+g.dir.y.toFixed(3), z:+g.dir.z.toFixed(3) },
        brainConfig:state.brainConfigs?.get(g.id) || null
      })),
      terrain:{ convention:'north=-Z,south=+Z,east=-X,west=+X', source:'procedural-v12', worldHalf:16 },
      initialPerception:world.buildVisiblePerception?.(state.selected?.id || state.characters?.[0]?.id, Number(document.getElementById('visionRadius')?.value || 7)) || null,
      props:(state.props || []).filter(m => !m?.isDisposed?.()).map(meshRecord),
      blocks:(state.blocks || []).filter(m => !m?.isDisposed?.()).map(meshRecord),
      globalHistory:[...(state.globalHistory || [])],
      player:state.player ? JSON.parse(JSON.stringify(state.player)) : undefined,
      paint:state.paint ? [...state.paint].map(([k,v])=>[...k.split(',').map(Number),v.mat,v.tint||null]) : [],
      baseMap:state.baseMap||'island', wallStyle:state.wallStyle||'tabletop', campfire:state.campfire!==false,
      camera:state.camera ? {
        alpha:state.camera.alpha, beta:state.camera.beta, radius:state.camera.radius,
        target:{x:state.camera.target.x,y:state.camera.target.y,z:state.camera.target.z},
        orthoHalfWidth:state.camera.metadata?.orthoHalfWidth
      } : null
    };
  }

  function makeCaptureSurface(source) {
    const scale = Math.min(1, MAX_WIDTH / source.width);
    const c = document.createElement('canvas');
    c.width = Math.max(2, Math.round(source.width * scale));
    c.height = Math.max(2, Math.round(source.height * scale));
    return c;
  }

  async function captureFrame(s, engine) {
    if (!s || s.stopping) return;
    const ctx = s.surface.getContext('2d', { alpha:false, willReadFrequently:true });
    if (!engine?.readPixels) throw new Error('GPU frame capture unavailable');
    const pixels = await engine.readPixels(0, 0, s.source.width, s.source.height);
    const raw = new ImageData(new Uint8ClampedArray(pixels.buffer, pixels.byteOffset, pixels.byteLength), s.source.width, s.source.height);
    s.rawSurface.getContext('2d').putImageData(raw, 0, 0);
    ctx.drawImage(s.rawSurface, 0, 0, s.surface.width, s.surface.height);
    // Speech bubbles are DOM overlays, not part of Babylon's GPU canvas. Paint
    // the currently visible bubbles onto the captured frame at their live
    // screen positions so the APNG tells the same story as the browser.
    const canvasRect=s.source.getBoundingClientRect();
    const sx=s.surface.width/Math.max(1,canvasRect.width), sy=s.surface.height/Math.max(1,canvasRect.height);
    for(const bubble of document.querySelectorAll('.bubble')){
      if(bubble.offsetParent===null) continue;
      const rect=bubble.getBoundingClientRect();
      const x=(rect.left-canvasRect.left)*sx, y=(rect.top-canvasRect.top)*sy;
      const w=rect.width*sx, h=rect.height*sy;
      if(x+w<0 || y+h<0 || x>s.surface.width || y>s.surface.height) continue;
      const radius=Math.max(4,10*Math.min(sx,sy));
      ctx.save();
      ctx.fillStyle='rgba(18,24,20,.92)';
      ctx.strokeStyle='rgba(235,255,240,.82)';
      ctx.lineWidth=Math.max(1,1.2*Math.min(sx,sy));
      ctx.beginPath(); ctx.roundRect(x,y,w,h,radius); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x+w*.46,y+h); ctx.lineTo(x+w*.52,y+h+8*sy); ctx.lineTo(x+w*.58,y+h); ctx.fill();
      const style=getComputedStyle(bubble);
      ctx.fillStyle='#ffffff';
      ctx.font=`${Math.max(9,parseFloat(style.fontSize||'12')*sy)}px ${style.fontFamily||'sans-serif'}`;
      ctx.textAlign='center'; ctx.textBaseline='middle';
      const words=(bubble.textContent||'').trim().split(/\s+/); const lines=[]; let line='';
      for(const word of words){ const next=line?line+' '+word:word; if(line&&ctx.measureText(next).width>w-12*sx){ lines.push(line); line=word; } else line=next; } if(line) lines.push(line);
      const lineH=Math.max(11,14*sy), firstY=y+h/2-(lines.length-1)*lineH/2;
      lines.slice(0,4).forEach((text,i)=>ctx.fillText(text,x+w/2,firstY+i*lineH,w-10*sx));
      ctx.restore();
    }
    const frame=ctx.getImageData(0, 0, s.surface.width, s.surface.height).data.buffer.slice(0);
    if(s.rawBytes+frame.byteLength>MAX_RAW_BYTES){
      status('recording memory limit reached · encoding…');
      stopRecording();
      return;
    }
    s.frames.push(frame); s.rawBytes+=frame.byteLength;
    status(`recording ${s.frames.length} frames · ${((performance.now()-s.started)/1000).toFixed(1)}s · ${Math.round(s.rawBytes/1048576)} MB`);
    if ((performance.now() - s.started) >= MAX_SECONDS * 1000) stopRecording();
  }

  function crc32(bytes) {
    let c = 0xffffffff;
    for (let i=0; i<bytes.length; i++) {
      c ^= bytes[i];
      for (let k=0; k<8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
    }
    return (c ^ 0xffffffff) >>> 0;
  }

  function pngChunk(type, data) {
    const out = new Uint8Array(12 + data.length);
    const typeBytes = new TextEncoder().encode(type);
    new DataView(out.buffer).setUint32(0, data.length);
    out.set(typeBytes, 4); out.set(data, 8);
    new DataView(out.buffer).setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
    return out;
  }

  function concat(parts) {
    const size = parts.reduce((n,p) => n + p.length, 0);
    const out = new Uint8Array(size); let at = 0;
    for (const p of parts) { out.set(p, at); at += p.length; }
    return out;
  }

  function embedState(apng, metadata) {
    const png = new Uint8Array(apng);
    const keyword = new TextEncoder().encode('tablefolk.initial-state');
    const json = new TextEncoder().encode(JSON.stringify(metadata));
    const payload = concat([keyword, new Uint8Array([0]), json]);
    const textChunk = pngChunk('tEXt', payload);
    let offset = PNG_SIGNATURE_BYTES;
    while (offset + 12 <= png.length) {
      const len = new DataView(png.buffer, png.byteOffset + offset, 4).getUint32(0);
      const type = String.fromCharCode(...png.subarray(offset + 4, offset + 8));
      if (type === 'IEND') return concat([png.subarray(0, offset), textChunk, png.subarray(offset)]).buffer;
      offset += 12 + len;
    }
    throw new Error('invalid encoded PNG');
  }

  function extractState(buffer) {
    const png=new Uint8Array(buffer);
    if(png.length<PNG_SIGNATURE_BYTES || png[0]!==137 || png[1]!==80 || png[2]!==78 || png[3]!==71) throw new Error('not a PNG/APNG file');
    let offset=PNG_SIGNATURE_BYTES;
    while(offset+12<=png.length){
      const len=new DataView(png.buffer,png.byteOffset+offset,4).getUint32(0);
      if(offset+12+len>png.length) throw new Error('damaged PNG chunk');
      const type=String.fromCharCode(...png.subarray(offset+4,offset+8));
      if(type==='tEXt'){
        const data=png.subarray(offset+8,offset+8+len);
        const zero=data.indexOf(0);
        if(zero>0){
          const keyword=new TextDecoder('latin1').decode(data.subarray(0,zero));
          if(keyword==='tablefolk.initial-state'){
            try{return JSON.parse(new TextDecoder().decode(data.subarray(zero+1)));}
            catch{throw new Error('embedded state JSON is damaged');}
          }
        }
      }
      if(type==='IEND') break;
      offset+=12+len;
    }
    throw new Error('no character initial state found in this image');
  }

  async function loadIncidentFile(file){
    const drop=$('apngStateDrop'), message=$('apngStateStatus');
    if(!file) return;
    drop?.classList.add('loading');
    if(message) message.textContent='Reading embedded state…';
    try{
      const metadata=extractState(await file.arrayBuffer());
      const world=window.tablefolk;
      if(!world?.restoreWorldState) throw new Error('world is not ready yet');
      await world.restoreWorldState(metadata);
      if(metadata.camera && world.state?.camera){
        const c=world.state.camera;
        if(Number.isFinite(metadata.camera.alpha)) c.alpha=metadata.camera.alpha;
        if(Number.isFinite(metadata.camera.beta)) c.beta=metadata.camera.beta;
        if(Number.isFinite(metadata.camera.radius)) c.radius=metadata.camera.radius;
        if(metadata.camera.target) c.setTarget(new BABYLON.Vector3(metadata.camera.target.x||0,metadata.camera.target.y||.6,metadata.camera.target.z||0));
        if(Number.isFinite(metadata.camera.orthoHalfWidth)){
          c.metadata ||= {};
          c.metadata.orthoHalfWidth=metadata.camera.orthoHalfWidth;
          const aspect=world.state.engine.getRenderWidth()/Math.max(1,world.state.engine.getRenderHeight());
          c.orthoLeft=-metadata.camera.orthoHalfWidth; c.orthoRight=metadata.camera.orthoHalfWidth;
          c.orthoTop=metadata.camera.orthoHalfWidth/aspect; c.orthoBottom=-metadata.camera.orthoHalfWidth/aspect;
        }
      }
      world.log?.(`loaded incident initial state from ${file.name}`);
      if(message) message.textContent=`Loaded ${metadata.agents?.length||0} Character(s) from ${file.name}`;
    }catch(e){
      console.error('incident state import failed',e);
      if(message) message.textContent=`Could not load: ${e.message}`;
    }finally{ drop?.classList.remove('loading'); }
  }

  function download(buffer) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const url = URL.createObjectURL(new Blob([buffer], {type:'image/apng'}));
    const a = document.createElement('a');
    a.href = url; a.download = `tablefolk-incident-${stamp}.png`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }

  function startRecording() {
    if (session) return;
    if (!window.UPNG) { status('recorder library unavailable'); return; }
    if (!window.pako?.deflate) { status('APNG compressor unavailable; reload the page'); return; }
    try {
      // UPNG expects pako under its historical global name even when both are
      // loaded as standalone browser scripts.
      window.UPNG.pako = window.pako;
      const source = $('renderCanvas');
      const rawSurface = document.createElement('canvas'); rawSurface.width=source.width; rawSurface.height=source.height;
      session = { source, rawSurface, surface:makeCaptureSurface(source), frames:[], rawBytes:0, initialState:snapshotWorld(), started:performance.now(), nextFrameAt:performance.now(), stopping:false, capturing:false };
      $('startRecording').disabled = true;
      $('startRecording').classList.add('recording');
      $('stopRecording').disabled = false;
    } catch (e) { status(`record error: ${e.message}`); session = null; }
  }

  async function stopRecording() {
    const s = session;
    if (!s || s.stopping) return;
    s.stopping = true;
    $('stopRecording').disabled = true;
    status(`encoding ${s.frames.length} frames…`);
    await new Promise(resolve => setTimeout(resolve, 30));
    try {
      if (!s.frames.length) throw new Error('no frames captured');
      const delays = new Array(s.frames.length).fill(Math.round(1000 / FPS));
      const encoded = UPNG.encode(s.frames, s.surface.width, s.surface.height, 0, delays);
      const metadata = {
        ...s.initialState,
        recording:{ fps:FPS, frames:s.frames.length, durationMs:Math.round(performance.now()-s.started), width:s.surface.width, height:s.surface.height }
      };
      download(embedState(encoded, metadata));
      status(`downloaded ${s.frames.length} frames · initial state embedded`);
    } catch (e) {
      console.error('APNG export failed', e); status(`export failed: ${e.message}`);
    } finally {
      s.frames.length=0; s.rawSurface.width=1; s.rawSurface.height=1; s.surface.width=1; s.surface.height=1;
      session = null;
      $('startRecording').disabled = false;
      $('startRecording').classList.remove('recording');
    }
  }

  window.tablefolkFrameRecorder = {
    wantsFrame() {
      return !!session && !session.stopping && !session.capturing && performance.now() >= session.nextFrameAt;
    },
    async captureAfterRender(engine) {
      const s=session;
      if(!s || s.stopping || s.capturing) return;
      s.capturing=true;
      s.nextFrameAt=performance.now()+(1000/FPS);
      try { await captureFrame(s,engine); }
      finally { if(session===s) s.capturing=false; }
    },
    fail(error) {
      console.error('APNG frame capture failed',error);
      status(`capture failed: ${error.message}`);
    }
  };

  const drop=$('apngStateDrop'), input=$('apngStateFile');
  if(drop && input){
    drop.addEventListener('click',()=>input.click());
    drop.addEventListener('keydown',e=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); input.click(); } });
    input.addEventListener('change',()=>{ loadIncidentFile(input.files?.[0]); input.value=''; });
    for(const event of ['dragenter','dragover']) drop.addEventListener(event,e=>{
      e.preventDefault(); e.dataTransfer.dropEffect='copy'; drop.classList.add('dragover');
    });
    for(const event of ['dragleave','dragend']) drop.addEventListener(event,e=>{
      e.preventDefault(); drop.classList.remove('dragover');
    });
    drop.addEventListener('drop',e=>{
      e.preventDefault(); drop.classList.remove('dragover'); loadIncidentFile(e.dataTransfer.files?.[0]);
    });
  }

  const initRecorderUI = () => {
    $('startRecording')?.addEventListener('click', startRecording);
    $('stopRecording')?.addEventListener('click', stopRecording);
  };
  if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', initRecorderUI, { once:true });
  else initRecorderUI();
})();
