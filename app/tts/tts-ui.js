(() => {
  const $=id=>document.getElementById(id), tts=window.tablefolkTTS;
  if(!tts)return;
  let recorder=null, recorded=[], stream=null;
  function refreshVoices(){const sel=$('agentTtsVoice');if(!sel)return;const chosen=window.tablefolk?.getBrainConfig?.(window.tablefolk?.getSelectedAgent?.()?.id)?.ttsVoiceId||sel.value||'builtin:alba';sel.textContent='';for(const v of tts.voices()){const o=document.createElement('option');o.value=v.id;o.textContent=v.name;sel.appendChild(o);}sel.value=[...sel.options].some(o=>o.value===chosen)?chosen:'builtin:alba';}
  function sync(){const enabled=localStorage.getItem('tablefolkTtsEnabled')!=='0';$('ttsEnabled').checked=enabled;$('ttsLanguage').value=localStorage.getItem('tablefolkTtsLanguage')||'english_2026-04';$('ttsVolume').value=localStorage.getItem('tablefolkTtsVolume')||'.85';$('ttsBufferMs').value=localStorage.getItem('tablefolkTtsBufferMs')||'350';refreshVoices();}
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
      tts.load().catch(err=>{
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
      eng.value=localStorage.getItem('tablefolkTtsEngine')||'';
      const langs=()=>{const id=eng.value||tts.engine;$('ttsLanguageBox').hidden=!tts.engines().find(e=>e.id===id)?.languages;};
      tts.addEventListener('status',langs); langs();
      eng.onchange=async()=>{ if(!eng.value){localStorage.removeItem('tablefolkTtsEngine');} tts.setEnabled(true);$('ttsEnabled').checked=true; await tts.setEngine(eng.value||await (await fetch('/api/voices')).json().then(d=>d.ttsEngine).catch(()=>'pocket-18m')); if(!eng.value)localStorage.removeItem('tablefolkTtsEngine'); langs(); };
    }
    // Breeze TTS 2: where its server is, and whether it answers
    const bz=$('breezeUrl'), bzState=async()=>{ const st=$('breezeStatus'); if(!st||!window.tablefolkBreeze)return; window.tablefolkBreeze.reset(); const ok=await window.tablefolkBreeze.available(); st.textContent=ok?`Breeze TTS 2 answers at ${window.tablefolkBreeze.base()}: pick it under Engine.`:`Breeze TTS 2 is not running (start breeze-server: tools/breeze-server.sh).`; };
    if(bz){ bz.value=localStorage.getItem('tablefolkBreezeUrl')||''; bz.onchange=()=>{ const v=bz.value.trim(); if(v)localStorage.setItem('tablefolkBreezeUrl',v); else localStorage.removeItem('tablefolkBreezeUrl'); bzState(); }; if(!window.TABLEFOLK_ART_MODE) bzState(); }
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
