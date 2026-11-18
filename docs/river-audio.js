// Ambient sounds share one context so muting or leaving silences both layers.
function createRiverAmbience(onChange) {
  const music=document.querySelector('#garden-music');
  const waterVolume=.048;
  let context, recording, waterGain, foot=0;
  let enabled=false;

  function adjustWater(){
    if(!waterGain)return;
    // Soaked already contains waves. Blend in the extracted loop when paused.
    waterGain.gain.setTargetAtTime(music.paused?waterVolume:0,context.currentTime,.17);
  }
  music.addEventListener('play',adjustWater);
  music.addEventListener('pause',adjustWater);

  function prepare() {
    context=new (window.AudioContext || window.webkitAudioContext)();
    context.onstatechange=onChange;
    const bytes=Uint8Array.from(atob(riverSounds.mp3),c=>c.charCodeAt(0));
    context.decodeAudioData(bytes.buffer).then(buffer=>{
      recording=buffer;
      const river=context.createBufferSource();
      river.buffer=recording;
      river.loop=true;
      river.loopEnd=riverSounds.waterSeconds;
      waterGain=context.createGain();
      waterGain.gain.value=0;
      adjustWater();
      river.connect(waterGain);waterGain.connect(context.destination);river.start();
      onChange();
    }).catch(()=>{
      enabled=false;
      recording=null;
      waterGain=null;
      context.close().catch(()=>{});
      context=null;
      onChange();
    });
  }

  function start() {
    if(!window.AudioContext && !window.webkitAudioContext)return;
    enabled=true;
    if(!context)prepare();
    if(context.state!=='running')context.resume().then(onChange,onChange);
    onChange();
  }

  function step(indoors,fast) {
    if(!enabled || context?.state!=='running' || !recording)return;
    const sound=context.createBufferSource(), level=context.createGain();
    sound.buffer=recording;
    sound.playbackRate.value=(indoors?1.02:.97)+Math.random()*.05;
    level.gain.value=(indoors?.065:.082)*(fast?1.08:1);
    sound.connect(level);level.connect(context.destination);
    sound.start(0,riverSounds.firstStep+(foot++%4)*riverSounds.stepSpacing,riverSounds.stepSeconds);
    sound.onended=()=>{sound.disconnect();level.disconnect()};
  }

  return {start,step,get playing(){return enabled && context?.state==='running' && Boolean(recording)},
    pause(){
      enabled=false;
      if(context)context.suspend().then(onChange,onChange);
    }
  };
}
