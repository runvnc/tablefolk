(() => {
  const $=id=>document.getElementById(id), tts=window.tablefolkTTS;
  if(!tts)return;
  let recorder=null, recorded=[], stream=null;
  function refreshVoices(){const sel=$('agentTtsVoice');if(!sel)return;const chosen=window.tablefolk?.getBrainConfig?.(window.tablefolk?.getSelectedAgent?.()?.id)?.ttsVoiceId||sel.value||'builtin:alba';sel.textContent='';for(const v of tts.voices()){const o=document.createElement('option');o.value=v.id;o.textContent=v.name;sel.appendChild(o);}sel.value=[...sel.options].some(o=>o.value===chosen)?chosen:'builtin:alba';}
  function sync(){const enabled=localStorage.getItem('tablefolkTtsEnabled')!=='0';$('ttsEnabled').checked=enabled;$('ttsLanguage').value=localStorage.getItem('tablefolkTtsLanguage')||'english_2026-04';$('ttsVolume').value=localStorage.getItem('tablefolkTtsVolume')||'.85';$('ttsBufferMs').value=localStorage.getItem('tablefolkTtsBufferMs')||'350';refreshVoices();window.tablefolkTtsToggleSync?.();}
  tts.addEventListener('status',e=>{if($('ttsStatus'))$('ttsStatus').textContent=e.detail.text;});
  tts.addEventListener('telemetry',e=>{
    const m=e.detail||{}, node=$('ttsTelemetry'); if(!node)return;
    const fmt=v=>Number.isFinite(Number(v))?Number(v).toFixed(2):'—';
    node.textContent=`backend: ${m.backend||'WASM CPU'} · isolated: ${m.isolated?'yes':'NO'} · threads: ${m.threads||1}/${m.hardwareConcurrency||'?'} · aggregate RTFx: ${fmt(m.rtfx)} · latest chunk RTFx: ${fmt(m.lastChunkRtfx)} · worker first audio: ${m.firstAudioMs==null?'—':Math.round(m.firstAudioMs)+' ms'} · say→arrival: ${m.audioArrivalMs==null?'—':Math.round(m.audioArrivalMs)+' ms'} · say→playback: ${m.playbackStartMs==null?'—':Math.round(m.playbackStartMs)+' ms'} · buffer: ${Math.round(m.bufferedMs||0)} ms · minimum: ${m.minBufferedMs==null?'—':Math.round(m.minBufferedMs)+' ms'} · underruns: ${m.underruns||0} · resumes: ${m.resumeCount||0} · chunks: ${m.chunks||0}`;
  });
  tts.addEventListener('voiceschanged',refreshVoices);
  tts.addEventListener('status',e=>{
    const t=e.detail?.text||'';
    if(/failed|error/i.test(t)) window.tablefolkToast?.(t,{type:'error',duration:5000});
  });
  const initTtsUI=()=>{
    sync();
    // Browser HTTP/Cache Storage retains the downloaded ONNX bundle. Once the
    // user has successfully loaded Pocket-TTS, restore its worker eagerly on
    // future visits just like the local brain. Model loading does not create or
    // resume an AudioContext, so autoplay policy remains separate.
    if(window.TABLEFOLK_ART_MODE){
      $('ttsStatus').textContent='Pocket-TTS disabled (art review mode)';
    } else if(tts.wasLoaded() || localStorage.getItem('tablefolkTtsEnabled')!=='0'){
      $('ttsStatus').textContent='Auto-loading cached Pocket-TTS…';
      // after the world is shown and the characters' model has loaded (loading.js start-up queue)
      const L=window.tablefolkLoading;
      (L?L.turn('voice'):Promise.resolve()).then(()=>tts.load()).finally(()=>L?.release('voice')).catch(err=>{
        $('ttsStatus').textContent='Pocket-TTS auto-load failed: '+err.message;
        console.error('Pocket-TTS auto-load failed',err);
      });
    }
    $('ttsEnabled').onchange=e=>tts.setEnabled(e.target.checked);
    $('loadTts').onclick=async()=>{tts.setEnabled(true);$('ttsEnabled').checked=true;try{await tts.load();const lang=$('ttsLanguage').value;if(lang!=='english_2026-04')await tts.setLanguage(lang);}catch(e){console.error(e);}};
    $('stopTts').onclick=()=>tts.stop();
    $('ttsLanguage').onchange=e=>tts.setLanguage(e.target.value);
    // engine: "server default" clears this browser's pick
    const eng=$('ttsEngine');
    if(eng){
      for(const e of tts.engines()){const o=document.createElement('option');o.value=e.id;o.textContent=e.label;eng.appendChild(o);}
      // Breeze in the browser runs on ggml's WebGPU backend, which needs shader-f16 (Chrome on Linux with NVIDIA lacks it)
      // and JSPI (browser-check.js): the option says which is missing
      if(!navigator.gpu){ const z=[...eng.options].find(x=>x.value==='zonos-web'); if(z){ z.disabled=true; z.textContent+=' (not on this browser: no WebGPU)'; } }
      navigator.gpu?.requestAdapter({powerPreference:'high-performance'}).then(a=>{ const o=[...eng.options].find(x=>x.value==='breeze-web'); const f16=!!a?.features?.has('shader-f16'); const why=window.tablefolkBrowser?.why?.('breeze-web',{webgpu:!!a,f16})??(f16?'':'no WebGPU shader-f16'+(/linux/i.test(navigator.userAgent)&&a?.info?.vendor==='nvidia'?'; start Chrome with --enable-dawn-features=vulkan_enable_f16_on_nvidia':'')); if(o&&why){ o.disabled=true; o.textContent+=' (not on this browser: '+why+')'; o.title=why; } }).catch(()=>{});
      eng.value=localStorage.getItem('tablefolkTtsEngine')||''; if(eng.selectedIndex<0) eng.value='';   // a saved engine that no longer exists (breeze): the default
      // the language list follows the engine: ZONOS3-Mini's 43 (and Automatic), else Pocket's five (the page's options)
      const sel=$('ttsLanguage'), pocketOpts=sel.innerHTML;
      const langs=()=>{const id=eng.value||tts.engine;$('ttsLanguageBox').hidden=!tts.engines().find(e=>e.id===id)?.languages; const list=tts.languageList?.(id), want=list?'zonos':'pocket'; if(sel.dataset.list!==want){ sel.innerHTML=list?list.map(([v,l])=>`<option value="${v}">${l}</option>`).join(''):pocketOpts; sel.dataset.list=want; } sel.value=tts.languageValue?.(id)||sel.value;};
      tts.addEventListener('status',langs); langs();
      eng.onchange=async()=>{ if(eng.value==='zonos-web'&&localStorage.getItem('tablefolkZonosWebReady')!=='1'&&!(await window.confirmDialog?.('ZONOS3-Mini runs in this browser on the graphics card: about a 1 GB download (once), and it wants about 1.5 GB of graphics memory beside the chat model. Its weights are Apache-2.0 (Zyphra).',{title:'Download ZONOS3-Mini?',confirmText:'download'})??confirm('Download ZONOS3-Mini (1 GB)?'))){ eng.value=localStorage.getItem('tablefolkTtsEngine')||''; return; } if(eng.value==='breeze-web'&&localStorage.getItem('tablefolkBreezeWebReady')!=='1'&&!(await window.confirmDialog?.('Breeze TTS 2 runs in this browser on the graphics card: a 2.5 GB download (once), and it wants about 3 GB of graphics memory beside the chat model. Its voice model is for non-commercial use (BreezeBlue licence).',{title:'Download Breeze TTS 2?',confirmText:'download'})??confirm('Download Breeze TTS 2 (2.5 GB)?'))){ eng.value=localStorage.getItem('tablefolkTtsEngine')||''; return; } if(!eng.value){localStorage.removeItem('tablefolkTtsEngine');} tts.setEnabled(true);$('ttsEnabled').checked=true; await tts.setEngine(eng.value||await (await fetch('/api/voices')).json().then(d=>d.ttsEngine).catch(()=>'pocket-18m')); if(!eng.value)localStorage.removeItem('tablefolkTtsEngine'); langs(); };
    }
    $('ttsVolume').oninput=e=>tts.setVolume(e.target.value);
    $('ttsBufferMs').oninput=e=>tts.setBufferMs(e.target.value);
    $('testAgentVoice').onclick=()=>{const g=window.tablefolk?.getSelectedAgent?.();if(g){tts.setEnabled(true);$('ttsEnabled').checked=true;tts.speak(g,'Hello! This is my selected Pocket TTS voice.',$('agentTtsVoice').value);}};
    $('deleteCustomVoice').onclick=async()=>{const id=$('agentTtsVoice').value;if(!id.startsWith('custom:'))return window.tablefolkToast('Select a custom voice first.',{type:'warn'});if(await window.confirmDialog('Delete this custom voice from this browser?',{title:'Delete voice?',confirmText:'delete voice',danger:true}))await tts.deleteVoice(id.slice(7));};
    $('addCustomVoice').onclick=async()=>{const f=$('customVoiceFile').files?.[0];if(!f)return window.tablefolkToast('Choose an audio sample first.',{type:'warn'});$('ttsStatus').textContent='Processing voice sample…';try{await tts.load();const id=await tts.addVoice($('customVoiceName').value,f);refreshVoices();$('agentTtsVoice').value='custom:'+id;$('agentTtsVoice').dispatchEvent(new Event('change'));$('ttsStatus').textContent='Custom voice ready';}catch(e){$('ttsStatus').textContent='Custom voice failed: '+e.message;}};
    $('recordCustomVoice').onclick=async e=>{
      if(recorder?.state==='recording'){recorder.stop();e.target.textContent='record sample';return;}
      try{stream=await navigator.mediaDevices.getUserMedia({audio:true});recorded=[];recorder=new MediaRecorder(stream);recorder.ondataavailable=x=>{if(x.data.size)recorded.push(x.data);};recorder.onstop=()=>{stream.getTracks().forEach(t=>t.stop());const blob=new Blob(recorded,{type:recorder.mimeType});const file=new File([blob],(($('customVoiceName').value||'recorded-voice')+'.webm'),{type:blob.type});const dt=new DataTransfer();dt.items.add(file);$('customVoiceFile').files=dt.files;$('ttsStatus').textContent='Recording captured; click add uploaded sample.';};recorder.start();e.target.textContent='stop recording';$('ttsStatus').textContent='Recording custom voice…';
      }catch(err){$('ttsStatus').textContent='Microphone failed: '+err.message;}
    };
  };
  if(document.readyState==='loading')window.addEventListener('DOMContentLoaded',initTtsUI,{once:true});
  else initTtsUI();
})();
