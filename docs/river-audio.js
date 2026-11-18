// Ambient sounds share one context so muting or leaving silences both layers.
function createRiverAmbience(onChange) {
  let context, recording, river, foot=0;
  let enabled=false;

  function prepare() {
    context=new (window.AudioContext || window.webkitAudioContext)();
    context.onstatechange=onChange;
    const bytes=Uint8Array.from(atob(riverSounds.mp3),c=>c.charCodeAt(0));
    context.decodeAudioData(bytes.buffer).then(buffer=>{
      recording=buffer;
      river=context.createBufferSource();
      river.buffer=recording;
      river.loop=true;
      river.loopEnd=riverSounds.waterSeconds;
      const level=context.createGain();
      level.gain.setValueAtTime(0,context.currentTime);
      level.gain.linearRampToValueAtTime(.024,context.currentTime+.8);
      river.connect(level);level.connect(context.destination);river.start();
      onChange();
    }).catch(()=>{
      enabled=false;
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
