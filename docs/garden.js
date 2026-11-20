(() => {
  const dialog = document.querySelector('#memorial');
  const view = dialog.querySelector('.garden-view');
  const fallback = dialog.querySelector('.garden-fallback');
  const loadingView=dialog.querySelector('.garden-loading');
  const loadingStatus=dialog.querySelector('#garden-loading-status');
  const fpsLabel=dialog.querySelector('#garden-fps');
  const movement = dialog.querySelector('.garden-movement');
  const walkPanel = dialog.querySelector('.garden-bottom');
  const music = document.querySelector('#garden-music');
  const sound = document.querySelector('#garden-sound');
  const settings = dialog.querySelector('.garden-settings');
  const settingsToggle = settings.querySelector('#garden-settings-toggle');
  const settingsPanel = settings.querySelector('#garden-settings-panel');
  const giButton = document.querySelector('#garden-gi');
  const shadowControl = document.querySelector('#garden-shadows');
  const movingButton = document.querySelector('#garden-moving-shadows');
  const graphicsKey='lantern-river.graphics.v1';
  const viewer = document.querySelector('#viewer');
  const enlarge = document.querySelector('#garden-enlarge');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const {rooms,bridges,route,trail,entrance:arrivalDock,end,landingWidth,landingDepth,lanternSpans,bridgePoint} = riverWalk;
  const order = [...rooms.flatMap(room=>room.photos),1];
  const finalIndex = order.length-1;
  const fullTurn = Math.PI*2;
  const guide = document.querySelector('#garden-guide');
  const captionEl = document.querySelector('#garden-caption');
  const locationEl = document.querySelector('#garden-count');
  let current = 0, garden, preparing, opening, frame = 0, previousTime = 0;
  let fpsFrom=0,fpsFrames=0;
  let visibilityRevision=0;
  let desiredMusic = true, audioAttempt = 0, entrance;
  const held = new Set();
  let fastWalk=false;

  function savedGraphics(){
    try{
      const settings=JSON.parse(localStorage.getItem(graphicsKey));
      if(Number.isInteger(settings?.shadows) && settings.shadows>=0 && settings.shadows<=3
        && typeof settings.moving==='boolean' && typeof settings.gi==='boolean')return settings;
    }catch{}
    return null;
  }
  function saveGraphics(settings){
    try{localStorage.setItem(graphicsKey,JSON.stringify(settings));}catch{}
  }
  function setSettingsOpen(open){
    settingsPanel.hidden=!open;
    settingsToggle.setAttribute('aria-expanded',String(open));
    if(open){held.clear();fastWalk=false}
  }
  settingsToggle.addEventListener('click',()=>setSettingsOpen(settingsPanel.hidden));
  dialog.addEventListener('pointerdown',e=>{
    if(!settingsPanel.hidden && !settings.contains(e.target))setSettingsOpen(false);
  });
  function setLoading(loading){
    loadingView.hidden=!loading;
    dialog.setAttribute('aria-busy',String(loading));
    view.inert=walkPanel.inert=loading;
    settings.inert=loading;
  }
  function nextGardenFrame(signal){
    return new Promise((resolve,reject)=>{
      signal.throwIfAborted();
      const id=requestAnimationFrame(time=>{
        signal.removeEventListener('abort',cancel);
        resolve(time);
      });
      function cancel(){
        cancelAnimationFrame(id);
        reject(signal.reason);
      }
      signal.addEventListener('abort',cancel,{once:true});
    });
  }

  function select(index) {
    current = (index + order.length) % order.length;
    const id = order[current], caption = memorialPhotoDescriptions[id-1];
    enlarge.hidden=false;
    captionEl.textContent=caption;
    const room=rooms.find(r=>r.photos.includes(id));
    locationEl.textContent=(room?.name || 'The last overlook')+' · '+(current+1)+' / '+order.length;
    enlarge.dataset.photo = id;
    if (!fallback.hidden) {
      const image = fallback.querySelector('img');
      image.src = 'photos/' + String(id).padStart(2,'0') + '.webp';
      image.alt = caption;
      if(id===1)fallback.querySelector('.fallback-reflection').src=image.src;
      fallback.classList.toggle('overlook',id===1);
      if(id===1)drawFallbackSky();
    }
  }

  function drawFallbackSky(){
    const canvas=fallback.querySelector('canvas'), ctx=canvas.getContext('2d');
    ctx.clearRect(0,0,canvas.width,canvas.height);
    fallback.style.setProperty('--fur-matte','url('+riverPortrait.mask.toDataURL()+')');
    ctx.shadowColor='#ffb877';ctx.shadowBlur=5;
    for(const light of riverPortrait.lights){
      ctx.globalAlpha=.36+light.size*1.9;
      ctx.fillStyle=light.phase<2?'#fff0ca':'#f4af65';
      ctx.beginPath();
      ctx.ellipse(light.x/600*canvas.width,light.y/450*canvas.height,light.size*5,light.size*7,0,0,fullTurn);
      ctx.fill();
    }
    ctx.globalAlpha=1;
  }

  function audioLabel() {
    const playing = !music.paused;
    sound.setAttribute('aria-pressed', String(playing));
    sound.textContent = playing ? 'Music on' : 'Music off';
    sound.setAttribute('aria-label', playing ? 'Mute ambient music' : 'Play ambient music');
  }
  const ambienceButton=document.querySelector('#garden-ambience');
  let wantAmbience=true;
  const ambience=createRiverAmbience(()=>{
    ambienceButton.textContent=ambience.playing?'Ambience on':'Ambience off';
    ambienceButton.setAttribute('aria-pressed',String(ambience.playing));
    ambienceButton.setAttribute('aria-label',ambience.playing?'Mute river and footsteps':'Play river and footsteps');
  });
  function startAmbience(){
    if(!wantAmbience || !dialog.open || document.hidden)return;
    if(!ambience.playing)ambience.start();
  }
  ambienceButton.setAttribute('aria-label','Play river and footsteps');
  ambienceButton.addEventListener('click',()=>{
    if(music.paused)playMusic();
    wantAmbience=!ambience.playing;
    if(wantAmbience)startAmbience();else ambience.pause();
  });
  // Retry both layers on a gesture if the browser blocks autoplay on a direct link.
  function activateOnInteraction(e){
    if(e.target.closest('#garden-sound, #garden-ambience, #leave-garden') || e.key==='Escape')return;
    if(music.paused)playMusic();
    startAmbience();
  }
  dialog.addEventListener('pointerup',activateOnInteraction);
  dialog.addEventListener('keydown',activateOnInteraction);
  music.volume = .53;
  music.addEventListener('play', audioLabel);
  music.addEventListener('pause', audioLabel);
  function playMusic() {
    if (!desiredMusic || !dialog.open || document.hidden) return;
    const attempt = ++audioAttempt;
    return music.play().catch(() => {
      if (attempt === audioAttempt) audioLabel();
    });
  }
  function pauseMusic() {
    audioAttempt++;
    music.pause();
    audioLabel();
  }
  sound.addEventListener('click', () => {
    startAmbience();
    desiredMusic = music.paused;
    if (desiredMusic) playMusic(); else pauseMusic();
  });

  function seedRandom() {
    let state = 1906;
    return () => {
      state = (1664525*state + 1013904223) >>> 0;
      return state / 4294967296;
    };
  }

  function makeGarden(atlas,photoMaterials) {
    const T = THREE, rand = seedRandom();
    const renderer = new T.WebGLRenderer({antialias:true, alpha:false, powerPreference:'default'});
    renderer.setPixelRatio(Math.min(devicePixelRatio,1.6));
    renderer.outputEncoding = T.sRGBEncoding;
    renderer.physicallyCorrectLights=true;
    renderer.toneMapping=T.ACESFilmicToneMapping;
    renderer.toneMappingExposure=.96;
    const scene = new T.Scene();
    // Keep the finale in range from the entrance after a visitor walks back upstream.
    const camera = new T.PerspectiveCamera(56,1,.07,280);
    camera.rotation.order = 'YXZ';
    const color = value => new T.Color(value).convertSRGBToLinear();
    const waterLevel=-.43;
    const nightTime={value:0};
    const entryThresholdZ=rooms[0].z+rooms[0].depth/2;
    const cleat=new T.Vector3(arrivalDock[0]+1.40,0,entryThresholdZ+1.15);
    scene.background=color('#060e22');
    scene.fog=new T.FogExp2(color('#1a2d42'),.013);
    const hemi=new T.HemisphereLight(color('#a5c4ee'),color('#455362'),.40);
    const blueLight=new T.DirectionalLight(color('#92bfe5'),.83);
    blueLight.position.set(-20,28,-35);
    const moonDirection={value:blueLight.position.clone().sub(blueLight.target.position).normalize()};
    const moonRim=new T.DirectionalLight(color('#83aee7'),.42);
    moonRim.position.set(-27,9,32);
    scene.add(hemi,blueLight,moonRim);
    const reflectionLayer=1;
    const reflected=obj=>{obj.layers.enable(reflectionLayer);return obj};
    const galleryHeights=[3.5,3.23,4.05,3.65,3.25];
    const supportsGI=Boolean(giButton && renderer.capabilities.isWebGL2 && typeof riverGI!=='undefined');
    const giUniforms=supportsGI?riverGI.uniforms(T):null;
    const supportsShadows=Boolean(shadowControl && typeof riverShadows!=='undefined');
    const movingValues=movingButton && renderer.capabilities.isWebGL2 && typeof riverShadows!=='undefined'
      && riverShadows.movingUniforms?riverShadows.movingUniforms(T,color('#ffaf73')):null;
    const shadowLamps=[],movingLanterns=[];
    let shadowValues=null,movingEffect=null,movingEnabled=false,movingActive=false;
    const bounceBoxes=[];
    const bounceMatrix=new T.Object3D();
    let giEffect=null;
    function bounceBox(material,x,y,z,w,h,d,rotation=0,tilt=0){
      if(!supportsGI && !movingValues)return;
      bounceMatrix.position.set(x,y,z);
      bounceMatrix.scale.set(w,h,d);
      bounceMatrix.rotation.set(0,rotation,tilt,'YXZ');
      bounceMatrix.updateMatrix();
      bounceBoxes.push({material,matrix:bounceMatrix.matrix.clone()});
    }

    function addRiverMist(shader){
      shader.vertexShader='varying vec3 riverSurface;\n'+shader.vertexShader.replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
        vec4 riverPoint=vec4(transformed,1.);
        #ifdef USE_INSTANCING
          riverPoint=instanceMatrix*riverPoint;
        #endif
        riverSurface=(modelMatrix*riverPoint).xyz;`
      );
      shader.uniforms.riverMistTime=nightTime;
      shader.fragmentShader='varying vec3 riverSurface;\nuniform float riverMistTime;\n'
        +riverShore.mistShader+shader.fragmentShader.replace(
        '#include <fog_fragment>',
        `#include <fog_fragment>
        #ifdef USE_FOG
          float airHeight=abs(cameraPosition.y-(${waterLevel.toFixed(2)}));
          float surfaceHeight=max(0.,riverSurface.y-(${waterLevel.toFixed(2)}));
          float mistDepth=length(cameraPosition-riverSurface);
          float mistDensity=exp(-.64*mix(airHeight,surfaceHeight,.69));
          float mistAmount=(1.-exp(-.018*mistDepth*mistDensity))*.72;
          gl_FragColor.rgb=mix(gl_FragColor.rgb,fogColor,mistAmount);
          float groundMist=lowRiverMist(cameraPosition,riverSurface,${waterLevel.toFixed(2)},riverMistTime);
          gl_FragColor.rgb=mix(gl_FragColor.rgb,vec3(.049,.075,.107),groundMist);
        #endif`
      );
    }

    function painted(size,draw) {
      const canvas=document.createElement('canvas');canvas.width=canvas.height=size;
      draw(canvas.getContext('2d'),size);
      const tex=new T.CanvasTexture(canvas);tex.encoding=T.sRGBEncoding;return tex;
    }
    const horizonColors={deep:{value:color('#030817')},blue:{value:color('#173970')},mist:{value:color('#284353')}};
    const horizonShader=`uniform vec3 deep,blue,mist;
      float skyHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float skyNoise(vec2 p){
        vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
        return mix(mix(skyHash(i),skyHash(i+vec2(1.,0.)),f.x),mix(skyHash(i+vec2(0.,1.)),skyHash(i+1.),f.x),f.y);
      }
      float skyOpening(vec3 direction){
        return .24+.76*pow(max(0.,dot(direction,normalize(vec3(-.64,.24,-1.)))),5.);
      }
      vec3 skyAtmosphere(vec3 direction,out float cloudBand){
        float h=max(direction.y,0.);
        float opening=skyOpening(direction);
        vec3 color=mix(deep,blue,opening*exp(-3.25*h));
        color=mix(color,mist,(1.-smoothstep(-.025,.14,h))*.65);
        vec2 p=direction.xz/(.52+h)*vec2(8.,19.);
        float cloud=.63*skyNoise(p)+.24*skyNoise(p*2.05)+.13*skyNoise(p*4.1);
        cloudBand=smoothstep(.46,.79,cloud)*smoothstep(.03,.21,h)*(1.-smoothstep(.47,.80,h));
        return color+cloudBand*vec3(.012,.019,.031)*opening;
      }`;
    const sky=new T.Mesh(new T.SphereGeometry(135,64,24),new T.ShaderMaterial({
      side:T.BackSide,depthWrite:false,toneMapped:false,
      extensions:{derivatives:true},
      uniforms:{...horizonColors,moonDirection},
      vertexShader:`varying vec3 place;
        void main(){
          vec4 point=modelMatrix*vec4(position,1.);
          place=point.xyz-cameraPosition;
          gl_Position=projectionMatrix*viewMatrix*point;
        }`,
      fragmentShader:`${horizonShader}
        uniform vec3 moonDirection;varying vec3 place;
        void main(){
          vec3 d=normalize(place);
          float cloudBand;
          vec3 c=skyAtmosphere(d,cloudBand);
          vec2 q=vec2(atan(d.z,d.x),d.y)*vec2(69.,94.);
          vec2 f=fract(q)-.5;
          float star=skyHash(floor(q));
          float starlight=step(.964,star)*exp(-102.*dot(f,f))*smoothstep(.12,.47,d.y);
          c+=vec3(.18,.25,.37)*starlight*(1.-cloudBand);
          if(dot(d,moonDirection)>.990){
            vec3 across=normalize(cross(vec3(0.,1.,0.),moonDirection));
            vec3 up=cross(moonDirection,across);
            vec2 lunar=vec2(dot(d,across),dot(d,up))/.0145;
            float radius=length(lunar);
            float rim=max(.016,fwidth(radius)*.7);
            float disc=1.-smoothstep(1.-rim,1.+rim,radius);
            float halo=exp(-.64*pow(max(0.,radius-1.),2.));
            c+=vec3(.026,.036,.052)*halo+vec3(.004,.007,.013)*exp(-.062*radius*radius);
            if(disc>0.){
              vec2 west=lunar+vec2(.29,-.24),east=lunar-vec2(.37,.22);
              float seas=.78*exp(-5.8*dot(west,west))+.62*exp(-8.2*dot(east,east));
              float rock=.18*skyNoise(lunar*5.+7.)+.08*skyNoise(lunar*17.-5.);
              float face=.79+rock-seas*.24+.09*sqrt(max(0.,1.-radius*radius));
              c=mix(c,vec3(.85,.92,1.)*face,disc*(1.-cloudBand*.24));
            }
          }
        gl_FragColor=vec4(c,1.);
        #include <encodings_fragment>
        }`
    }));
    scene.add(reflected(sky));

    const {center:riverCenter,bankX}=riverShore;
    const shoreRandom=seedRandom();
    const shore=riverShore.create(T,waterLevel,shoreRandom);
    const hdrType=renderer.capabilities.isWebGL2 && renderer.extensions.has('EXT_color_buffer_float')
      ? T.HalfFloatType:T.UnsignedByteType;
    // A reflected camera captures the actual lanterns and banks. The water samples
    // this view through moving ripples, breaking orange reflections into short strokes.
    const reflection=new T.WebGLRenderTarget(512,256,{
      minFilter:T.LinearFilter,magFilter:T.LinearFilter,type:hdrType
    });
    reflection.texture.encoding=T.LinearEncoding;
    const mirror=new T.PerspectiveCamera();mirror.layers.set(reflectionLayer);
    const reflectionMatrix=new T.Matrix4(), gaze=new T.Vector3();
    const reflectionClip=[new T.Plane(new T.Vector3(0,1,0),-waterLevel+.018)];
    const reflectionPixel=new T.Vector2();
    const [ex,ez]=end;
    const overlookEntranceZ=ez+landingDepth/2;
    const boatBerth={x:arrivalDock[0]+2.48,z:entryThresholdZ+2.25};
    const boatWaterFrame={value:new T.Vector4(boatBerth.x,boatBerth.z,1,0)};
    const moorings=[...rooms,{x:ex,z:ez,width:landingWidth,depth:landingDepth},
      {x:arrivalDock[0],z:(arrivalDock[1]+entryThresholdZ)/2,width:bridges[0].width,depth:bridges[0].length}];
    const wakeX=Math.min(...moorings.map(room=>room.x-room.width/2))-1.2;
    const wakeZ=Math.min(...moorings.map(room=>room.z-room.depth/2))-1.2;
    const wakeBounds=new T.Vector4(wakeX,wakeZ,
      Math.max(...moorings.map(room=>room.x+room.width/2))+1.2-wakeX,
      Math.max(...moorings.map(room=>room.z+room.depth/2))+1.2-wakeZ);
    const wakeCanvas=document.createElement('canvas');wakeCanvas.width=256;wakeCanvas.height=1024;
    const wakeContext=wakeCanvas.getContext('2d');
    wakeContext.scale(wakeCanvas.width/wakeBounds.z,wakeCanvas.height/wakeBounds.w);
    wakeContext.translate(-wakeX,-wakeZ);
    const pileWakes=new T.CanvasTexture(wakeCanvas);
    const furMask=new T.CanvasTexture(riverPortrait.mask);
    const [ax,ay,aw,ah]=atlas.regions[1];
    const photoUniforms={
      photograph:{value:null},furMask:{value:furMask},
      photoRegion:{value:new T.Vector4((ax+.5)/2048,1-(ay+ah-.5)/2048,(aw-1)/2048,(ah-1)/2048)}
    };
    const samplePortrait=`
      uniform sampler2D photograph,furMask;
      uniform vec4 photoRegion;
      vec3 furColor(vec2 uv){
        return sRGBToLinear(texture2D(photograph,photoRegion.xy+clamp(uv,0.,1.)*photoRegion.zw)).rgb;
      }
    `;
    // Project from a fixed point at the overlook. From that spot she has the
    // proportions of the photograph; walking sideways reveals the flat water.
    const poolView=new T.PerspectiveCamera(27,riverPortrait.width/riverPortrait.height,.1,40);
    poolView.position.set(ex,1.62,ez-1.4);
    poolView.lookAt(ex,waterLevel,ez-5.6);poolView.updateMatrixWorld();
    const poolMatrix=new T.Matrix4().multiplyMatrices(poolView.projectionMatrix,poolView.matrixWorldInverse);
    const water=new T.Mesh(new T.PlaneGeometry(260,490),new T.ShaderMaterial({
      extensions:{derivatives:true},
      uniforms:{...photoUniforms,reflectionPixel:{value:reflectionPixel},poolProjection:{value:poolMatrix},reflectedView:{value:reflection.texture},projection:{value:reflectionMatrix},time:nightTime,
        riverBankProfile:{value:shore.profile},pileWakes:{value:pileWakes},wakeBounds:{value:wakeBounds},moonDirection,
        boatWaterFrame,portraitLight:{value:0},navy:{value:color('#02060d')}},
      vertexShader:`uniform mat4 projection;varying vec4 reflected;varying vec3 world;
        void main(){vec4 p=modelMatrix*vec4(position,1.);world=p.xyz;reflected=projection*p;
        gl_Position=projectionMatrix*viewMatrix*p;}`,
      fragmentShader:`${samplePortrait}
        ${riverShore.waterShader}
        ${riverShore.mistShader}
        uniform mat4 poolProjection;
        uniform sampler2D reflectedView,pileWakes;
        uniform vec4 wakeBounds,boatWaterFrame;
        uniform float time,portraitLight;
        uniform vec3 navy,moonDirection;
        uniform vec2 reflectionPixel;
        varying vec4 reflected;varying vec3 world;

        float lakeHash(vec2 p){return fract(52.9829189*fract(dot(p,vec2(.06711056,.00583715))));}
        float lakeNoise(vec2 p){
          vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
          return mix(mix(lakeHash(i),lakeHash(i+vec2(1.,0.)),f.x),
                     mix(lakeHash(i+vec2(0.,1.)),lakeHash(i+1.),f.x),f.y);
        }
        float resolveWave(float phase){return 1.-smoothstep(.45,2.6,fwidth(phase));}
        vec2 gradientAtWater(float h,vec2 p){
          vec2 dx=dFdx(p),dy=dFdy(p);
          float det=dx.x*dy.y-dx.y*dy.x;
          return (vec2(dy.y,-dy.x)*dFdx(h)+vec2(-dx.y,dx.x)*dFdy(h))
                 *sign(det)/max(abs(det),1.e-7);
        }
        vec3 reflectionTaps(vec2 uv,vec2 stepUV){
          vec2 margin=2.*stepUV+reflectionPixel;
          vec2 tap=clamp(uv,margin,1.-margin);
          return texture2D(reflectedView,tap).rgb*.38
               +(texture2D(reflectedView,tap+stepUV).rgb+texture2D(reflectedView,tap-stepUV).rgb)*.22
               +(texture2D(reflectedView,tap+2.*stepUV).rgb+texture2D(reflectedView,tap-2.*stepUV).rgb)*.09;
        }
        void main(){
          vec2 p=world.xz;
          vec3 ray=cameraPosition-world;
          float dist=length(ray);
          vec3 view=ray/dist;
          float grazing=1.-clamp(view.y,0.,1.);
          vec2 breeze=(p+time*vec2(.022,-.016))/29.;
          float wind=smoothstep(.28,.72,.74*lakeNoise(breeze)+.26*lakeNoise(breeze*1.83+5.));
          float bend=lakeNoise(p*.29)*2.8;
          vec2 broad=vec2(.23,.973),medium=vec2(-.38,.925),crossing=vec2(.35,.937);
          vec2 fine=vec2(.67,.742),capillary=vec2(.12,.993);
          float swell=dot(p,broad)*.72-time*.019;
          float ripple=dot(p,medium)*7.8-time*.136+bend+.46*sin(swell);
          float crossWave=dot(p,crossing)*6.2+time*.15+1.8*lakeNoise(p*.39+8.);
          float chop=dot(p,fine)*17.7+time*.29+bend*.64;
          float shimmer=dot(p,capillary)*32.5-time*.88-bend;
          float rippleCoverage=resolveWave(ripple);
          float midSlope=cos(ripple)*rippleCoverage,crossSlope=cos(crossWave)*resolveWave(crossWave);
          float fineSlope=cos(chop)*resolveWave(chop),capSlope=cos(shimmer)*resolveWave(shimmer);
          vec2 waveSlope=broad*(.023*cos(swell))
            +mix(.22,1.,wind)*(medium*(.053*midSlope)+crossing*(.047*crossSlope)
                              +fine*(.044*fineSlope)+capillary*(.024*capSlope));

          float bank=shoreDistance(p);
          float shallows=1.-smoothstep(.05,1.55,bank);
          float lapPhase=bank*12.-time*.68+bend*.55;
          float shoreLap=shallows*sin(lapPhase)*resolveWave(lapPhase);
          vec2 wakeUV=(p-wakeBounds.xy)/wakeBounds.zw;
          float contact=texture2D(pileWakes,vec2(wakeUV.x,1.-wakeUV.y)).a;
          float pilePhase=contact*20.+time*.93;
          float pileLap=smoothstep(.04,.26,contact)*(1.-smoothstep(.61,.77,contact))
                        *sin(pilePhase)*resolveWave(pilePhase);
          waveSlope+=.020*shoreLap*gradientAtWater(bank,p)-.027*pileLap*gradientAtWater(contact,p);
          vec2 fromBoat=p-boatWaterFrame.xy;
          vec2 bearing=boatWaterFrame.zw;
          vec2 besideBoat=vec2(dot(fromBoat,bearing),dot(fromBoat,vec2(-bearing.y,bearing.x)));
          float boatEdge=length(besideBoat/vec2(.58,1.48));
          float lapping=(1.-smoothstep(1.06,1.82,boatEdge))*smoothstep(.86,1.06,boatEdge);
          float boatPhase=16.*(boatEdge-1.)-time*1.37+bend*.24;
          waveSlope+=.031*lapping*sin(boatPhase)*resolveWave(boatPhase)*gradientAtWater(boatEdge,p);

          float still=portraitLight*(1.-smoothstep(3.,13.,abs(p.x+2.)))*smoothstep(202.,208.,-p.y);
          vec2 uv=.5+.5*reflected.xy/reflected.w;
          vec3 viewSlope=mat3(viewMatrix)*vec3(waveSlope.x,0.,waveSlope.y);
          vec2 offset=vec2(.048*viewSlope.x,-.30*viewSlope.z)
                     *mix(1.,.33,grazing)*mix(1.,.21,still);
          // Stretch the reflected highlights vertically while tightening the distant image.
          float streak=mix(.0067,.00155,pow(grazing,3.))*mix(.62,1.17,wind);
          vec2 blur=vec2(reflectionPixel.x*.31,max(reflectionPixel.y*.67,streak));
          vec3 lights=reflectionTaps(uv+offset,blur);
          float warmLight=smoothstep(.035,.22,lights.r-lights.b);
          float facet=.43*midSlope+.43*crossSlope+.51*fineSlope+.26*capSlope;
          float shimmerMask=mix(.14,1.28,smoothstep(-.42,.59,facet));
          lights*=mix(1.,shimmerMask,warmLight*(1.-.84*still));
          vec3 normal=normalize(vec3(waveSlope.x,1.,waveSlope.y));
          float noV=max(dot(normal,view),0.);
          float fresnel=.02+.98*pow(1.-noV,5.);
          vec3 skyHalfway=normalize(view+moonDirection);
          float noH=max(dot(normal,skyHalfway),.01);
          float roughness=mix(.045,.073,wind);
          float slopeSq=(1.-noH*noH)/(noH*noH);
          float moonGlint=exp(-slopeSq/(roughness*roughness));
          vec3 skyGlints=vec3(.35,.54,.83)*moonGlint*.52*(1.-.86*still);
          vec3 silt=vec3(.011,.017,.019);
          vec3 deepWater=mix(navy,silt,shallows*.20);
          vec3 river=mix(deepWater,lights+skyGlints,fresnel);
          vec2 berthDistance=fromBoat*vec2(.22,.15);
          float berth=exp(-dot(berthDistance,berthDistance));
          float rippleGlints=smoothstep(.80,1.11,.66*midSlope+.39*crossSlope+.24*capSlope);
          float glintBreakup=.46+.54*lakeNoise(p*vec2(.72,1.7));
          river+=vec3(.034,.057,.094)*berth*rippleGlints*glintBreakup*(.037+.40*fresnel);
          float haze=lowRiverMist(cameraPosition,world,${waterLevel.toFixed(2)},time);
          river=mix(river,vec3(.049,.075,.107),haze*(1.-still));
        if(still>.001){
          vec4 projected=poolProjection*vec4(world,1.);
          vec2 q=projected.xy/projected.w*.5+.5;
          q+=vec2(.060*viewSlope.x,-.19*viewSlope.z);
          if(projected.w>0. && all(greaterThan(q,vec2(0.))) && all(lessThan(q,vec2(1.)))){
            float fur=texture2D(furMask,q).a;
            float strength=(.70+.16*shimmerMask)*mix(.58,1.,sqrt(fresnel))*fur*portraitLight;
            vec3 pigment=furColor(q)*vec3(.83,.93,1.);
            float crest=smoothstep(.87,.995,sin(ripple+.40*sin(chop)))*rippleCoverage;
            float glint=crest*(.5+.5*sin(p.x*2.8+sin(p.y*4.-time*.5)));
            river=mix(river,pigment*(1.-.12*crest),strength)
                +(lights*.10+vec3(.022,.043,.060)*glint)*strength;
          }
        }
          river=mix(river,navy+vec3(.009,.016,.026),smoothstep(35.,135.,dist)*.38);
          gl_FragColor=vec4(river,1.);
        #include <encodings_fragment>
        }`
    }));
    water.rotation.x=-Math.PI/2;water.position.set(0,waterLevel,-75);scene.add(water);
    const glowMap=painted(1,(ctx)=>{ctx.fillStyle='#fff';ctx.fillRect(0,0,1,1)});
    function softGlow(material){
      material.onBeforeCompile=shader=>{
        shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`
          vec2 haloPoint=vUv*2.-1.;
          float rr=dot(haloPoint,haloPoint);
          float falloff=exp(-8.5*rr)*(1.-smoothstep(.43,.76,rr));
          diffuseColor.rgb*=mix(vec3(1.,.35,.12),vec3(1.,.63,.29),exp(-6.*rr));
          diffuseColor.a*=falloff;
        `);
      };
      return material;
    }
    const batches=new Map();
    const cube=new T.BoxGeometry(1,1,1);
    const limestone=painted(512,(ctx,n)=>{
      ctx.fillStyle='#b6bac0';ctx.fillRect(0,0,n,n);
      for(let i=0;i<2400;i++){
        const x=rand()*n,y=rand()*n,r=5+rand()*40;
        const speck=ctx.createRadialGradient(x,y,0,x,y,r);
        speck.addColorStop(0,i%3?'#78879013':'#edebdc32');
        speck.addColorStop(1,'#9aa1a000');
        ctx.fillStyle=speck;ctx.fillRect(x-r,y-r,2*r,2*r);
      }
      for(let i=0;i<6800;i++){
        ctx.fillStyle=i%3?'#6e675512':'#ffffff38';
        ctx.fillRect(rand()*n,rand()*n,1+rand()*3,1+rand()*1.5);
      }
    });
    limestone.wrapS=limestone.wrapT=T.RepeatWrapping;
    const stonePores=photoMaterials.slate||painted(256,(ctx,n)=>{
      const random=seedRandom();
      // Red stores surface height and green stores the finish.
      ctx.fillStyle='#a3a000';ctx.fillRect(0,0,n,n);
      for(let i=0;i<8000;i++){
        const x=random()*n,y=random()*n,r=.23+random()*.86;
        ctx.fillStyle=i%5?'#49db0074':'#e866006a';
        ctx.beginPath();ctx.ellipse(x,y,r,r*(.42+random()*.56),random()*fullTurn,0,fullTurn);ctx.fill();
      }
      for(let i=0;i<380;i++){
        const x=random()*n,y=random()*n,r=1.15+random()*1.55;
        const pit=ctx.createRadialGradient(x,y,0,x,y,r);
        pit.addColorStop(0,'#2eec00b3');
        pit.addColorStop(.55,'#66bc004a');
        pit.addColorStop(1,'#66bc0000');
        ctx.fillStyle=pit;ctx.fillRect(x-r,y-r,2*r,2*r);
      }
    });
    stonePores.encoding=T.LinearEncoding;
    stonePores.wrapS=stonePores.wrapT=T.RepeatWrapping;
    stonePores.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
    const stone = new T.MeshStandardMaterial({map:limestone,color:color('#697685'),roughness:.83});
    const edge = new T.MeshStandardMaterial({map:limestone,color:color('#84919c'),roughness:.66});
    const bronze = new T.MeshStandardMaterial({color:color('#bc9b71'),roughness:.43,metalness:.28});
    const linen = new T.MeshStandardMaterial({color:color('#c4b7a5'),roughness:1});
    const frameOak=new T.MeshStandardMaterial({color:color('#62564c'),roughness:.73});
    const pictureMetal=new T.MeshStandardMaterial({color:color('#62503d'),roughness:.49,metalness:.38});
    const pictureBrass=new T.MeshStandardMaterial({color:color('#a68a58'),roughness:.42,metalness:.67});
    const pictureBulb=new T.MeshBasicMaterial({color:color('#fff0c7'),toneMapped:false});
    const frameScrew=new T.MeshStandardMaterial({color:color('#494745'),roughness:.57,metalness:.55});
    const blockers=[];
    function blockWalking(x,z,width,depth){
      blockers.push({x,z,halfWidth:width/2,halfDepth:depth/2});
    }
    const matrix = new T.Object3D();
    function batch(geometry,material,x,y,z,w,h,d,rotation=0, tilt=0) {
      const key=geometry.id+'-'+material.id;
      if(!batches.has(key)) batches.set(key,{geometry,material,matrices:[]});
      matrix.position.set(x,y,z);matrix.scale.set(w,h,d);matrix.rotation.set(0,rotation,tilt,'YXZ');
      matrix.updateMatrix();batches.get(key).matrices.push(matrix.matrix.clone());
    }

    let ready=false;
    const atlasMap=photoMaterials.atlasMap;
    photoUniforms.photograph.value=atlasMap;
    atlasMap.encoding=T.sRGBEncoding;atlasMap.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
    const photoMat=new T.MeshStandardMaterial({
      map:atlasMap,emissiveMap:atlasMap,emissive:color('#efe2cf'),emissiveIntensity:.074,
      color:color('#f1e6d6'),roughness:.96
    });
    const pictureGlass=new T.ShaderMaterial({
      transparent:true,depthWrite:false,
      uniforms:{galleryReflections:{value:Array.from({length:4},()=>new T.Vector4())}},
      vertexShader:`varying vec3 glassPosition,glassNormal;
        varying vec2 glassUV;
        void main(){
          glassPosition=(modelMatrix*vec4(position,1.)).xyz;
          glassNormal=mat3(modelMatrix)*normal;
          glassUV=uv;
          gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);
        }`,
      fragmentShader:`uniform vec4 galleryReflections[4];
        varying vec3 glassPosition,glassNormal;
        varying vec2 glassUV;
        float grain(vec2 p){return fract(52.9829189*fract(dot(p,vec2(.06711056,.00583715))));}
        void main(){
          vec3 view=normalize(cameraPosition-glassPosition);
          vec3 normal=normalize(glassNormal);
          vec3 reflectedRay=reflect(-view,normal);
          float grazing=pow(1.-max(dot(view,normal),0.),5.);
          float glint=0.;
          for(int i=0;i<4;i++){
            vec4 lamp=galleryReflections[i];
            vec3 delta=lamp.xyz-glassPosition;
            float dist=max(.35,length(delta));
            float cone=1.-dot(reflectedRay,delta/dist);
            float size=max(.015,lamp.w*.47/dist);
            glint+=exp(-1.20*cone/(size*size))*step(.01,lamp.w)*(1.-smoothstep(5.,14.,dist));
          }
          vec2 reflectedSky=vec2(atan(reflectedRay.z,reflectedRay.x),reflectedRay.y)*vec2(52.,66.);
          float star=step(.988,grain(floor(reflectedSky)))*exp(-22.*dot(fract(reflectedSky)-.5,fract(reflectedSky)-.5));
          float skyHeight=smoothstep(-.15,.44,reflectedRay.y);
          float dust=step(.989,grain(floor(glassUV*385.)))*(.16+.70*grazing);
          float sheen=.007+.105*grazing+.011*dust;
          vec3 sky=mix(vec3(.028,.053,.082),vec3(.17,.25,.36),skyHeight)+star*.25*skyHeight;
          float warm=min(1.,glint)*(.078+.075*grazing);
          gl_FragColor=vec4(mix(sky,vec3(1.,.55,.21),warm/max(.001,sheen+warm)),sheen+warm);
          #include <encodings_fragment>
        }`
    });
    const portraits=[],glazedFrames=[];
    // Keep the woven paper density independent of the light transmitted through it.
    const lanterns=[], fixtures=[];
    const paperMap=painted(512,(ctx,n)=>{
      const random=seedRandom();
      ctx.fillStyle='#dedede';ctx.fillRect(0,0,n,n);
      for(let j=0;j<180;j++){
        const x=random()*n,y=random()*n,r=7+random()*37;
        const pulp=ctx.createRadialGradient(x,y,0,x,y,r);
        pulp.addColorStop(0,j%3?'#57575714':'#ffffff39');
        pulp.addColorStop(1,'#80808000');
        ctx.fillStyle=pulp;ctx.fillRect(x-r,y-r,2*r,2*r);
      }
      for(let j=0;j<2200;j++){
        const x=rand()*n,y=rand()*n,length=3+rand()*23,drift=(random()-.5)*3;
        ctx.strokeStyle=j%4?'#63564760':'#ffffff6f';
        ctx.lineWidth=.36+random()*.89;
        ctx.beginPath();
        ctx.moveTo(x,y);ctx.quadraticCurveTo(x+length*.44,y+drift-1.1,x+length,y+drift);
        ctx.stroke();
      }
    });
    paperMap.wrapS=T.RepeatWrapping;
    paperMap.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
    const shadeProfile=new T.SplineCurve([
      [.157,0],[.185,.033],[.233,.122],[.262,.246],[.266,.397],
      [.251,.520],[.209,.609],[.146,.660],[.105,.671],[.001,.676]
    ].map(([r,y])=>new T.Vector2(r,y)));
    const shadeGeometry=new T.LatheGeometry(shadeProfile.getPoints(36),36);
    const hoopGeometry=new T.TorusGeometry(.158,.012,10,32);
    hoopGeometry.rotateX(Math.PI/2);
    const braceGeometry=new T.BoxGeometry(.308,.009,.011);
    const topHem=new T.TorusGeometry(.105,.009,8,28);
    topHem.rotateX(Math.PI/2).translate(0,.672,0);
    const lanternIron=new T.MeshStandardMaterial({color:color('#534437'),roughness:.53,metalness:.58});
    const hangerPlate=new T.BoxGeometry(.094,.018,.071);
    const hangerHook=new T.TubeGeometry(new T.CatmullRomCurve3([
      [0,.003],[0,-.022],[-.023,-.046],[-.021,-.073],
      [0,-.085],[.023,-.073],[.027,-.051],[.018,-.041]
    ].map(([x,y])=>new T.Vector3(x,y,0))),20,.0065,8,false);
    const hangerEye=new T.TorusGeometry(.021,.0045,8,16);
    hangerEye.rotateY(Math.PI/2);
    const eyeDrop=.094,rodDrop=eyeDrop+.020;
    const flameGeometry=new T.PlaneGeometry(.142,.224);
    function candlePaper(material,light={value:1}){
      material.onBeforeCompile=shader=>{
        shader.uniforms.paperLight=light;
        shader.vertexShader='varying vec3 paperNormal,paperView;\n'+shader.vertexShader.replace(
          '#include <project_vertex>',
          `#include <project_vertex>
           vec3 shadeNormal=normal;
           #ifdef USE_INSTANCING
             shadeNormal=mat3(instanceMatrix)*shadeNormal;
           #endif
           paperNormal=normalMatrix*shadeNormal;
           paperView=-mvPosition.xyz;`
        );
        shader.fragmentShader='varying vec3 paperNormal,paperView;\nuniform float paperLight;\n'+shader.fragmentShader.replace(
          '#include <color_fragment>',
          `float paperDensity=diffuseColor.g;
           #include <color_fragment>
           float face=abs(dot(normalize(paperNormal),normalize(paperView)));
           float height=vUv.y;
           float transmission=smoothstep(.04,.96,face);
           float core=exp(-pow((height-.40)*4.5,2.));
           float hem=smoothstep(.01,.14,height)*(1.-smoothstep(.79,.995,height));
           float fibers=clamp((paperDensity-.62)*1.17+.95,.64,1.16);
           vec3 tint=mix(vec3(1.),diffuseColor.rgb/max(paperDensity,.01),.20);
           float ribCenter=vUv.x*50.26548+.052*sin(height*7.5+vUv.x*12.56637);
           float ribs=pow(.5+.5*cos(ribCenter),26.);
           float shoulder=smoothstep(.52,.98,height);
           vec3 amber=mix(vec3(.78,.33,.085),vec3(.63,.19,.041),shoulder);
           amber=mix(vec3(.47,.132,.028),amber,hem);
           vec3 radiance=amber*(.73+.25*transmission)
             +vec3(.43,.52,.31)*core*(.17+.83*pow(transmission,1.35))*hem;
           diffuseColor.rgb=radiance*tint*fibers*mix(1.,.42,ribs)*paperLight;
           diffuseColor.a=.04;`
        );
      };
      return material;
    }
    const paper=candlePaper(new T.MeshBasicMaterial({map:paperMap,side:T.DoubleSide,toneMapped:false}));
    const bamboo=new T.MeshStandardMaterial({
      color:color('#37291e'),roughness:.74,emissive:color('#754019'),emissiveIntensity:.51
    });
    const flameMaterial=new T.ShaderMaterial({
      transparent:true,depthWrite:false,blending:T.AdditiveBlending,toneMapped:false,
      vertexShader:`varying vec2 flameUV;
        void main(){
          flameUV=uv;
          vec4 flameCenter=modelViewMatrix*instanceMatrix*vec4(0.,0.,0.,1.);
          flameCenter.xy+=position.xy*length(instanceMatrix[0].xyz);
          gl_Position=projectionMatrix*flameCenter;
        }`,
      fragmentShader:`varying vec2 flameUV;
        void main(){
          float height=flameUV.y;
          float width=mix(.33,.10,smoothstep(.27,.94,height));
          float bend=.14*height*height;
          float flameX=(flameUV.x-.48-bend)/width;
          float aura=exp(-2.4*flameX*flameX)*smoothstep(.02,.23,height)*(1.-smoothstep(.64,.98,height));
          vec3 heat=mix(vec3(1.25,.36,.035),vec3(1.36,1.01,.46),exp(-4.*flameX*flameX-5.*height));
          gl_FragColor=vec4(heat,aura*.86);
          #include <encodings_fragment>
        }`
    });
    const lanternGlow=softGlow(new T.SpriteMaterial({
      map:glowMap,transparent:true,opacity:.27,depthWrite:false,toneMapped:false,blending:T.AdditiveBlending
    }));
    const pieces=[
      [shadeGeometry,paper],[hoopGeometry,bamboo],[braceGeometry,bamboo],
      [braceGeometry,bamboo],[flameGeometry,flameMaterial]
    ];
    function lantern(x,y,z,size,fixture=false,canopy=0,mountHeight=0){
      const glow=new T.Sprite(lanternGlow);
      scene.add(reflected(glow));
      const lamp={x,y,z,size,phase:rand()*fullTurn,glow,fixture,canopy,mountHeight};
      lanterns.push(lamp);
      if(fixture)fixtures.push(lamp);
      if(mountHeight){
        batch(hangerPlate,lanternIron,x,mountHeight,z,1,1,1);
        batch(hangerHook,lanternIron,x,mountHeight,z,1,1,1);
        batch(hangerEye,lanternIron,x,mountHeight-eyeDrop,z,1,1,1);
        for(const dx of [-.032,.032]){
          batch(pegGeometry,lanternIron,x+dx,mountHeight-.010,z,.015,.005,.015);
        }
      }
      return lamp;
    }
    function shadowVariant(mode=shadowValues?.riverShadowMode.value ?? 0){
      return mode===0?'off':'map';
    }
    function finishJoinery(shader,finish){
      const axes=finish.axes || (finish.horizontal?'xzy':'xyz');
      const varyings='varying vec4 railPosition;\nvarying vec3 railNormal;\n'
        +(finish.timber?'varying float timberSeed;\n':'')
        +(finish.curved?'varying vec2 curvedGrain;\n':'');
      shader.uniforms.railFinishMap={value:finish.map};
      if(finish.timber)shader.uniforms.weatheredTimber={value:finish.timber};
      shader.vertexShader=varyings+shader.vertexShader.replace('#include <begin_vertex>',`
        #include <begin_vertex>
        vec3 railScale=vec3(1.0);
        #ifdef USE_INSTANCING
          railScale=vec3(length(instanceMatrix[0].xyz),length(instanceMatrix[1].xyz),length(instanceMatrix[2].xyz));
        #endif
        railPosition=vec4((position*railScale).${axes},railScale.${axes[1]}*.5);
        railNormal=normal.${axes};
        ${finish.curved?'curvedGrain=uv;':''}
        ${finish.timber?`
        vec3 timberOrigin=modelMatrix[3].xyz;
        #ifdef USE_INSTANCING
          timberOrigin+=instanceMatrix[3].xyz;
        #endif
        timberSeed=fract(sin(dot(timberOrigin,vec3(13.1,37.4,57.7)))*43758.5453);`:''}
      `);
      shader.fragmentShader=varyings+'uniform sampler2D railFinishMap;\n'
        +(finish.timber?'uniform sampler2D weatheredTimber;\n':'')+shader.fragmentShader
        .replace('#include <color_fragment>',`
          #include <color_fragment>
          vec3 railAxis=abs(normalize(railNormal));
          vec3 railBlend=pow(railAxis,vec3(8.));
          railBlend/=dot(railBlend,vec3(1.));
          vec3 railUV=railPosition.xyz*${finish.scale};
          vec3 finishGrain=${finish.curved?'texture2D(railFinishMap,curvedGrain).rgb':`
                          texture2D(railFinishMap,railUV.zy).rgb*railBlend.x
                          +texture2D(railFinishMap,railUV.xz).rgb*railBlend.y
                          +texture2D(railFinishMap,railUV.xy).rgb*railBlend.z`};
          float bevelWear=${finish.curved?'smoothstep(.18,.47,railAxis.z)*(1.-smoothstep(.74,.94,railAxis.z))'
                                           :'smoothstep(.05,.24,1.-max(railAxis.x,max(railAxis.y,railAxis.z)))'};
          bevelWear*=mix(.48,1.,smoothstep(.33,.73,finishGrain.g));
          diffuseColor.rgb*=mix(.65,1.28,finishGrain.b)*(1.+bevelWear*${finish.wear});
          ${finish.timber?`
          vec3 woodRun=railUV+timberSeed*vec3(.73,.98,.49);
          vec3 weathered=${finish.curved?'texture2D(weatheredTimber,curvedGrain+timberSeed*vec2(.47,.36)).rgb':`
                        texture2D(weatheredTimber,woodRun.zy).rgb*railBlend.x
                        +texture2D(weatheredTimber,woodRun.xz).rgb*railBlend.y
                        +texture2D(weatheredTimber,woodRun.xy).rgb*railBlend.z`};
          float timberGrain=dot(weathered,vec3(.29,.58,.13));
          float seat=${finish.curved?'0.':'1.-smoothstep(.014,.078,railPosition.w-abs(railPosition.y))'};
          vec3 timberTint=mix(vec3(.55),sRGBToLinear(vec4(weathered,1.)).rgb*3.65,.77);
          diffuseColor.rgb*=timberTint*mix(1.,.61,seat)
                            *mix(vec3(1.),vec3(1.10,1.075,1.00),bevelWear);
          ${finish.base?`
          float foot=1.-smoothstep(.022,.14,railPosition.y+railPosition.w+.060*(timberGrain-.5));
          diffuseColor.rgb*=mix(vec3(1.),vec3(.43,.47,.51),foot*.63);`:''}
          `:''}
          ${finish.patina?`
          float oxidation=(1.-bevelWear)*smoothstep(.43,.64,finishGrain.r)*.64;
          diffuseColor.rgb*=mix(vec3(1.),vec3(.43,.32,.25),oxidation);
          `:''}
          ${finish.groundContact?`
          float postGround=1.-smoothstep(.006,.133,abs(riverSurface.y));
          diffuseColor.rgb*=1.-.20*postGround;
          `:''}
          ${finish.horizontal?'diffuseColor.rgb*=mix(.83,1.,smoothstep(.009,.067,railPosition.w-abs(railPosition.y)));':''}
        `)
        .replace('#include <roughnessmap_fragment>',`
          #include <roughnessmap_fragment>
          roughnessFactor=clamp(roughnessFactor+(finishGrain.g-.5)*.34-bevelWear*.12,.27,.89);
          ${finish.timber?'roughnessFactor=clamp(roughnessFactor+.31*(.53-timberGrain)+.081*seat,.44,.94);':''}
          ${finish.groundContact?'roughnessFactor+=.065*postGround;':''}
        `)
        .replace('#include <normal_fragment_maps>',`
          #include <normal_fragment_maps>
          vec3 railDx=dFdx(-vViewPosition),railDy=dFdy(-vViewPosition);
          vec3 railTx=cross(railDy,normal),railTy=cross(normal,railDx);
          float railDet=dot(railDx,railTx);
          float railRelief=finishGrain.r*${finish.relief}${finish.timber?
            (finish.curved?'+.0012*timberGrain':'+.0022*timberGrain'):''};
          vec3 railSlope=sign(railDet)*(railTx*dFdx(railRelief)+railTy*dFdy(railRelief));
          ${finish.timber?`railSlope*=min(1.,${finish.curved?'.30':'.47'}*abs(railDet)/max(length(railSlope),1e-7));`:''}
          normal=normalize(max(abs(railDet),1e-7)*normal-railSlope);
        `);
    }
    function finishBoatBoards(shader,finish){
      const isHull=finish!=='fittings',paintedHull=finish==='paint';
      shader.fragmentShader=`
        float boatHash(vec2 p){
          return fract(52.9829189*fract(dot(p,vec2(.06711056,.00583715))));
        }
        float boatNoise(vec2 p){
          vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
          return mix(mix(boatHash(i),boatHash(i+vec2(1.,0.)),f.x),
                     mix(boatHash(i+vec2(0.,1.)),boatHash(i+vec2(1.,1.)),f.x),f.y);
        }
      `+shader.fragmentShader.replace('#include <map_fragment>',`
        ${isHull?`
          float course=vUv.y*5.0;
          float row=floor(course);
          float across=fract(course);
          vec2 oakUV=vec2(row*.217+.09+across*.17,vUv.x*4.1+row*.29);
          float caulk=min(across,1.-across);
          float plankSeam=1.-smoothstep(.013,.057+fwidth(course)*.55,caulk);
          float lap=smoothstep(.032,.107,across)*(1.-smoothstep(.107,.198,across));
          float boardTone=boatHash(vec2(row,2.));
        `:`
          vec2 oakUV=vec2(.24+vUv.x*.48,vUv.y*1.07);
          float plankSeam=0.,lap=0.,boardTone=.56;
        `}
        vec3 oak=texture2D(map,oakUV).rgb;
        float oakGrain=dot(oak,vec3(.29,.58,.13));
        vec3 woodColor=mapTexelToLinear(vec4(oak,1.)).rgb;
        float paintChip=0.;
        ${paintedHull?`
          float paintWear=.59*boatNoise(vUv*vec2(43.,15.))
                       +.26*boatNoise(vUv*vec2(121.,51.))
                       +.15*boatNoise(vUv*vec2(390.,103.));
          float scrapes=boatNoise(vUv*vec2(28.,71.));
          float wetStain=1.-smoothstep(.019,.16,abs(riverSurface.y-(${waterLevel.toFixed(2)})));
          paintChip=smoothstep(.69,.79,paintWear+lap*.093+wetStain*.055+(scrapes-.5)*.22);
          vec3 enamel=diffuseColor.rgb*mix(.66,1.31,smoothstep(.13,.72,oakGrain));
          diffuseColor.rgb=mix(enamel,woodColor*vec3(1.10,.78,.55),paintChip*.94);
        `:`
          diffuseColor.rgb*=woodColor*vec3(1.72,1.33,1.04);
        `}
        diffuseColor.rgb*=mix(.76,1.21,boardTone)*(1.-.64*plankSeam)*(1.+.17*lap);
      `).replace('#include <roughnessmap_fragment>',`
        #include <roughnessmap_fragment>
        roughnessFactor=clamp(roughnessFactor+.33*(.53-oakGrain)+.17*paintChip+.12*plankSeam-.08*lap,.38,.93);
      `).replace('#include <normal_fragment_maps>',`
        #include <normal_fragment_maps>
        vec3 boatDx=dFdx(-vViewPosition),boatDy=dFdy(-vViewPosition);
        vec3 boatTx=cross(boatDy,normal),boatTy=cross(normal,boatDx);
        float boatDet=dot(boatDx,boatTx);
        float timberRelief=.0034*oakGrain-.0026*plankSeam+.0015*lap-.0009*paintChip;
        vec3 boatSlope=sign(boatDet)*(boatTx*dFdx(timberRelief)+boatTy*dFdy(timberRelief));
        boatSlope*=min(1.,.46*abs(boatDet)/max(length(boatSlope),1.e-7));
        normal=normalize(max(abs(boatDet),1.e-7)*normal-boatSlope);
      `);
    }
    function receiveBoatShadows(shader){
      shader.uniforms.boatBakedDepth={value:boatShadowAtlas.texture};
      shader.uniforms.boatBakedProjection={value:boatShadowMatrices};
      shader.fragmentShader=shader.fragmentShader.replace('#include <packing>',`
        #include <packing>
        uniform sampler2D boatBakedDepth;
        uniform mat4 boatBakedProjection[4];
        float boatVisibility(vec4 projected,vec2 tile){
          vec3 q=projected.xyz/projected.w*.5+.5;
          if(any(lessThan(q,vec3(.008))) || any(greaterThan(q,vec3(.992))))return 1.;
          vec2 uv=(tile+q.xy)*.5;
          float receiver=q.z-.0016;
          float clearDepth=unpackRGBAToDepth(texture2D(boatBakedDepth,uv));
          float visible=step(receiver,clearDepth);
          const float texel=1.45/${boatShadowAtlas.width.toFixed(1)};
          for(int i=0;i<4;i++){
            vec2 tap=vec2(i<2?-1.:1.,mod(float(i),2.)<.5?-1.:1.)*texel;
            float blocker=unpackRGBAToDepth(texture2D(boatBakedDepth,uv+tap));
            visible+=step(receiver,blocker);
          }
          return visible*.20;
        }
      `).replace('#include <lights_fragment_end>',`
        #include <lights_fragment_end>
        vec4 boatPoint=vec4(riverSurface,1.);
        float lanternShadow=boatVisibility(boatBakedProjection[0]*boatPoint,vec2(0.,0.));
        float boatSky=(boatVisibility(boatBakedProjection[1]*boatPoint,vec2(1.,0.))
          +boatVisibility(boatBakedProjection[2]*boatPoint,vec2(0.,1.))
          +boatVisibility(boatBakedProjection[3]*boatPoint,vec2(1.,1.)))/3.;
        reflectedLight.directDiffuse*=mix(.43,1.,lanternShadow);
        reflectedLight.directSpecular*=mix(.27,1.,lanternShadow);
        reflectedLight.indirectDiffuse*=mix(.42,1.,boatSky);
        reflectedLight.indirectSpecular*=mix(.56,1.,boatSky);
      `);
    }
    function lightArchitecture(materials){
      // Each strip of the river knows every lamp that can reach it. Picking
      // lights at the surface keeps the galleries lit from every viewpoint.
      const first=-218,cell=4,cells=60,range=5.8;
      const rows=Array.from({length:cells},(_,i)=>{
        const low=first+i*cell;
        return fixtures.filter(lamp=>lamp.z>=low-range && lamp.z<=low+cell+range);
      });
      const slots=Math.max(...rows.map(row=>row.length));
      const record=shadowValues?3:2;
      const pixels=new Uint8Array(cells*slots*record*4);
      rows.forEach((row,i)=>row.forEach((lamp,j)=>{
        const index=(i*slots+j)*record*4;
        // Pack two bytes per coordinate for stable positions on WebGL 1 and 2.
        const coords=[(lamp.x+32)/64,(lamp.y+.31*lamp.size)/8,(lamp.z+224)/256];
        coords.forEach((coord,axis)=>{
          const value=Math.round(T.MathUtils.clamp(coord,0,1)*65535);
          pixels[index+axis]=value>>8;
          pixels[index+axis+4]=value&255;
        });
        pixels[index+3]=Math.round(lamp.size*128);
        pixels[index+7]=Math.round(lamp.canopy*31.875);
        if(shadowValues)pixels[index+8]=shadowLamps.indexOf(lamp)+1;
      }));
      const lightmap=new T.DataTexture(pixels,slots*record,cells,T.RGBAFormat);
      lightmap.needsUpdate=true;
      const warm={value:color('#ffc094')};
      const roomBounds=rooms.map(({x,z,width,depth})=>new T.Vector4(x,z,width/2,depth/2));
      for(const material of materials){
        const isStone=material.map===limestone;
        const isGateCap=material===gateLedge;
        const isCap=material===edge || isGateCap;
        const isPrint=material===photoMat,isMat=material===linen,isDeck=material===timber;
        const isFrame=material===frameOak;
        const grainFinish=joineryFinishes.get(material);
        const boatFinish=boatFinishes.get(material);
        const isDeckTrim=material===headerPlank || material===walkwayTrim;
        const receivesDockContact=isDeck || isDeckTrim || isStone;
        const exterior=isStone || isDeck || isDeckTrim || boatFinish || (grainFinish && !grainFinish.timber && material!==uprightCedar);
        const profile=isGateCap?'slate-ledge':isStone?'stone':isPrint?'print':isMat?'mat':isFrame?'frame':isDeck?'deck':isDeckTrim?'deck-trim':'lanterns';
        material.customProgramCacheKey=()=>'river-'+profile+'-'+shadowVariant()+(movingActive?'-moving':'')
          +(grainFinish?'-joinery-'+material.id:exterior?'-exterior':'')+(boatFinish?'-boat-'+boatFinish:'');
        material.onBeforeCompile=shader=>{
          const variant=shadowVariant(),castShadows=variant!=='off';
          addRiverMist(shader);
          if(giUniforms)riverGI.receive(shader,giUniforms);
          if(movingActive)riverShadows.receiveMoving(shader,movingValues);
          shader.uniforms.riverFixtures={value:lightmap};
          shader.uniforms.riverFixtureColor=warm;
          shader.uniforms.riverFixtureTime=nightTime;
          shader.uniforms.riverRoomBounds={value:roomBounds};
          shader.uniforms.riverEaveHeights={value:galleryHeights};
          shader.fragmentShader=`uniform sampler2D riverFixtures;
            uniform vec3 riverFixtureColor;
            uniform float riverFixtureTime;
            uniform vec4 riverRoomBounds[${rooms.length}];
            uniform float riverEaveHeights[${rooms.length}];\n`+shader.fragmentShader.replace(
            '#include <lights_fragment_begin>',
            `#include <lights_fragment_begin>
            float riverCell=floor((riverSurface.z-(${first.toFixed(1)}))/${cell.toFixed(1)});
            if(riverCell>=0. && riverCell<${cells.toFixed(1)}){
              float row=(riverCell+.5)/${cells.toFixed(1)};
              vec3 surfaceNormal=inverseTransformDirection(geometry.normal,viewMatrix);
              ${castShadows?'vec3 shadowNormal=inverseTransformDirection(geometryNormal,viewMatrix);':''}
              for(int slot=0;slot<${slots};slot++){
                float col=(float(slot)*${record.toFixed(1)}+.5)/${(slots*record).toFixed(1)};
                vec4 packedLamp=texture2D(riverFixtures,vec2(col,row));
                if(packedLamp.a<=0.)break;
                vec4 fine=texture2D(riverFixtures,vec2(col+1./${(slots*record).toFixed(1)},row));
                vec3 lamp=(packedLamp.rgb*256.+fine.rgb)/257.*vec3(64.,8.,256.)-vec3(32.,0.,224.);
                vec3 delta=lamp-riverSurface;
                float dist=length(delta);
                float fade=1.-smoothstep(2.15,${range.toFixed(1)},dist);
                float flame=1.+.032*sin(riverFixtureTime*3.4+lamp.z*1.31);
                float visibility=1.;
                ${castShadows?`if(fade>0.){
                  float shadowSlot=floor(texture2D(riverFixtures,vec2(col+2./${(slots*record).toFixed(1)},row)).r*255.+.5)-1.;
                  if(shadowSlot>=0.)visibility=riverLanternShadow(riverSurface,shadowNormal,lamp,shadowSlot);
                }`:''}
                directLight.direction=mat3(viewMatrix)*(delta/max(dist,.001));
                directLight.color=riverFixtureColor*46.*packedLamp.a*flame*fade*visibility/(dot(delta,delta)+.92);
                directLight.visible=fade>0.;
                RE_Direct(directLight,geometry,material,reflectedLight);
                // A broad secondary lobe represents the lantern warming the wood
                // above and below it. It uses the pavilion's fixed roof height.
                if(fine.a>0.){
                  float canopy=fine.a*8.;
                  float spread=1.-smoothstep(.9,4.3,length(delta.xz));
                  float indoors=smoothstep(-.1,.25,riverSurface.y)
                               *(1.-smoothstep(canopy+.18,canopy+.54,riverSurface.y));
                  float underside=clamp(.56-.38*surfaceNormal.y,.15,.96);
                  irradiance+=vec3(1.,.49,.25)*.84*packedLamp.a*spread*indoors*underside*mix(.35,1.,visibility);
                }
              }
            }
            ${movingActive?`
            vec3 movingReceiver=inverseTransformDirection(geometryNormal,viewMatrix);
            for(int movingSlot=0;movingSlot<RIVER_MOVING_LIGHTS;movingSlot++){
              float power=movingLampPower[movingSlot];
              if(power<=0.)continue;
              vec3 delta=movingLamp[movingSlot]-riverSurface;
              float distance=length(delta);
              vec3 toLamp=delta/max(distance,.001);
              float cone=smoothstep(.62,.77,dot(-toLamp,movingShadowAxis[movingSlot]));
              float range=1.-smoothstep(3.0,4.8,distance);
              if(cone*range>0. && dot(toLamp,movingReceiver)>0.){
                float visible=movingShadow(riverSurface,movingReceiver,movingSlot);
                directLight.direction=mat3(viewMatrix)*toLamp;
                directLight.color=movingLampColor*27.*power*cone*range*visible/(distance*distance+.66);
                directLight.visible=true;
                RE_Direct(directLight,geometry,material,reflectedLight);
              }
            }`:''}
            ${exterior?`
            vec3 surfaceUp=inverseTransformDirection(geometryNormal,viewMatrix);
            float exposed=clamp(.5+.5*surfaceUp.y,0.,1.);
            irradiance+=mix(vec3(.022,.029,.042),vec3(.38,.465,.55),exposed);
            `:''}
            // Approximate how the floor, low walls and eaves mask indirect light
            // where they meet. The doorway stays open to the sky.
            for(int gallery=0;gallery<${rooms.length};gallery++){
              vec4 bounds=riverRoomBounds[gallery];
              vec2 local=abs(riverSurface.xz-bounds.xy);
              vec2 wallGap=bounds.zw-local;
              if(min(wallGap.x,wallGap.y)<-.13)continue;
              vec2 jointGap=max(vec2(0.),wallGap-vec2(.28,.15));
              float besideDoor=smoothstep(1.60,1.79,local.x);
              float wall=1.-smoothstep(.018,.163,jointGap.x);
              float endWall=(1.-smoothstep(.014,.154,jointGap.y))*besideDoor;
              float atDeck=1.-smoothstep(.017,.178,abs(riverSurface.y));
              float atEave=1.-smoothstep(.06,.60,abs(riverSurface.y-riverEaveHeights[gallery]));
              float sideAtEave=1.-smoothstep(.12,.61,wallGap.x);
              float crease=1.-(1.-wall*.84)*(1.-endWall*.81);
              irradiance*=(1.-crease*.86*atDeck)*(1.-.26*sideAtEave*atEave);

              // The boards in contact with the wall receive less lantern
              // light too. Keep this shadow much tighter than the ambient one.
              float floorJoint=max(1.-smoothstep(.008,.096,jointGap.x),
                                   (1.-smoothstep(.008,.096,jointGap.y))*besideDoor);
              floorJoint*=1.-smoothstep(.006,.057,abs(riverSurface.y));
              reflectedLight.directDiffuse*=1.-.30*floorJoint;
              reflectedLight.directSpecular*=1.-.46*floorJoint;
              break;
            }`
          ).replace('#include <color_fragment>',`
            #include <color_fragment>
            float waterHeight=riverSurface.y-(${waterLevel.toFixed(2)});
            float wetEdge=.14+.022*sin(riverSurface.x*7.1+riverSurface.z*3.8);
            float wetness=1.-smoothstep(.022,wetEdge,waterHeight);
            diffuseColor.rgb*=mix(vec3(1.),vec3(.56,.66,.73),wetness);
            ${isDeck || isDeckTrim?`
              float dockDamp=(1.-smoothstep(1.7,3.9,abs(riverSurface.z-(${boatBerth.z.toFixed(2)}))))
                *smoothstep(.61,1.48,riverSurface.x-(${arrivalDock[0].toFixed(2)}))
                *(1.-smoothstep(1.60,1.78,riverSurface.x-(${arrivalDock[0].toFixed(2)})));
              diffuseColor.rgb*=mix(vec3(1.),vec3(.82,.85,.89),dockDamp*${isDeckTrim?'.92':'.68'});
            `:''}
            ${receivesDockContact?`
              vec2 postShape=abs(riverSurface.xz-vec2(${cleat.x.toFixed(2)},${cleat.z.toFixed(2)}))-.097;
              float postDistance=length(max(postShape,vec2(0.)));
              float postCrease=1.-smoothstep(.004,.107,postDistance);
              const float wallEnd=${(rooms[0].width/2-pavilionInset).toFixed(3)};
              float wingX=abs(riverSurface.x-(${arrivalDock[0].toFixed(2)}));
              float wingRun=max(1.63-wingX,wingX-wallEnd);
              float wingDepth=abs(riverSurface.z-(${(entryThresholdZ-pavilionInset).toFixed(3)}))-.16;
              float wallDistance=length(max(vec2(wingRun,wingDepth),vec2(0.)));
              float wallCrease=1.-smoothstep(.013,.121,wallDistance);
              float atJoin=1.-smoothstep(.005,.082,abs(riverSurface.y));
              float dockOcclusion=(1.-(1.-postCrease*.76)*(1.-wallCrease*.69))*atJoin;
            `:''}
          `).replace('#include <roughnessmap_fragment>',`
            #include <roughnessmap_fragment>
            roughnessFactor=mix(roughnessFactor,${isStone?'.39':'.31'},wetness*.74);
          `);
          if(castShadows)riverShadows.receive(T,shader,shadowValues,rooms.length);
          if(isPrint || isMat || isFrame){
            // Light from the bar above each frame falls across the print and mat.
            const pictureVarying='varying vec3 pictureFace;\n';
            shader.vertexShader=pictureVarying+'attribute vec2 pictureUV;\n'
              +(isFrame?'varying vec2 frameUV;\n':'')
              +shader.vertexShader.replace('#include <begin_vertex>',`
              #include <begin_vertex>
              pictureFace=vec3(pictureUV,max(0.,normal.z));
              ${isFrame?'frameUV=uv;':''}
            `);
            shader.fragmentShader=pictureVarying+shader.fragmentShader.replace('#include <lights_fragment_maps>',`
              #include <lights_fragment_maps>
              float down=max(.035,1.14-pictureFace.y);
              float spread=mix(.28,.83,sqrt(min(1.,down)));
              float beam=1.-smoothstep(spread*.43,spread,abs(pictureFace.x-.5));
              float wash=beam/(1.+2.5*down+1.3*down*down);
              vec3 pictureLight=vec3(1.,.84,.66)*pictureFace.z*(${isFrame?'.06+2.7*wash':'.39+2.8*wash'});
              reflectedLight.directDiffuse+=BRDF_Diffuse_Lambert(material.diffuseColor)*pictureLight;
            `);
          }
          if(isMat || isPrint)shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`
            #include <color_fragment>
            vec2 paperCell=floor(pictureFace.xy*vec2(750.,560.));
            float paperNoise=fract(52.9829189*fract(dot(paperCell,vec2(.06711056,.00583715))));
            float detail=1.-smoothstep(.55,2.2,max(fwidth(pictureFace.x)*750.,fwidth(pictureFace.y)*560.));
            float lip=min(abs(.5-abs(pictureFace.x-.5)),abs(.5-abs(pictureFace.y-.5)));
            float rebate=smoothstep(0.,.027,lip);
            diffuseColor.rgb*=mix(${isMat?'.82':'.87'},1.,rebate)*(1.+${isMat?'.20':'.026'}*(paperNoise-.5)*detail);
          `);
          if(isFrame){
            shader.uniforms.oakGrain={value:railGrain};
            shader.fragmentShader='varying vec2 frameUV;uniform sampler2D oakGrain;\n'+shader.fragmentShader
              .replace('#include <color_fragment>',`
                #include <color_fragment>
                vec3 fibre=texture2D(oakGrain,frameUV).rgb;
                float stains=texture2D(oakGrain,frameUV*vec2(.44,.57)+.31).b;
                diffuseColor.rgb*=mix(.52,1.34,smoothstep(.21,.80,fibre.b))*mix(.69,1.22,stains);
              `).replace('#include <roughnessmap_fragment>',`
                #include <roughnessmap_fragment>
                roughnessFactor=clamp(roughnessFactor+.39*(fibre.g-.46),.50,.91);
              `).replace('#include <normal_fragment_maps>',`
                #include <normal_fragment_maps>
                vec3 dx=dFdx(-vViewPosition),dy=dFdy(-vViewPosition);
                vec3 tx=cross(dy,normal),ty=cross(normal,dx);
                float det=dot(dx,tx),relief=.0014*fibre.r+.0007*stains;
                normal=normalize(max(abs(det),1e-7)*normal-sign(det)*(tx*dFdx(relief)+ty*dFdy(relief)));
              `);
          }
          if(isDeck){
            shader.uniforms.boardGrainMap={value:railGrain};
            const across='varying float timberAcross;\n';
            shader.vertexShader=across+`
              #ifndef USE_INSTANCING
                attribute float boardAcross;
              #endif
            `+shader.vertexShader.replace('#include <begin_vertex>',`
              #include <begin_vertex>
              #ifdef USE_INSTANCING
                timberAcross=position.x+.5;
              #else
                timberAcross=boardAcross;
              #endif
            `);
            shader.fragmentShader=across+'uniform sampler2D boardGrainMap;\n'+shader.fragmentShader.replace('#include <color_fragment>',`
              #include <color_fragment>
              // Canvas row zero is at the top. Match the staggered joints in the wood maps.
              float plankRow=floor((1.-vUv.y)*${plankRows.toFixed(1)});
              float rowInTile=mod(plankRow,${plankRows.toFixed(1)});
              float joint=.13+.74*mod(rowInTile*7.,${plankRows.toFixed(1)})/${(plankRows-1).toFixed(1)};
              float board=floor(vUv.x-joint);
              float plankVariance=fract(sin(dot(vec2(board,plankRow),vec2(127.1,311.7)))*43758.5453)-.5;
              float detail=1.-smoothstep(.28,1.,max(fwidth(vUv.x),fwidth(vUv.y)*${plankRows.toFixed(1)}));
              float dampEdge=smoothstep(.58,.98,abs(timberAcross*2.-1.));
              vec3 boardGrain=texture2D(boardGrainMap,vec2(vUv.y*11.3+plankVariance*.21,vUv.x*1.72)).rgb;
              diffuseColor.rgb*=(1.+.12*plankVariance*detail)*(1.-.09*dampEdge)
                               *mix(.81,1.18,smoothstep(.14,.79,boardGrain.b));
            `).replace('#include <roughnessmap_fragment>',`
              #include <roughnessmap_fragment>
              roughnessFactor=clamp(.66+(.45*(roughnessFactor-.62))+.15*plankVariance*detail
                                    +.32*(boardGrain.g-.56)-.13*dampEdge,.43,.91);
              roughnessFactor=mix(roughnessFactor,.40,dockDamp*(.24+.50*boardGrain.g));
            `).replace('#include <normal_fragment_maps>',`
              #include <normal_fragment_maps>
              vec3 boardDx=dFdx(-vViewPosition),boardDy=dFdy(-vViewPosition);
              vec3 boardTx=cross(boardDy,normal),boardTy=cross(normal,boardDx);
              float boardDet=dot(boardDx,boardTx),boardRelief=.0058*boardGrain.r;
              vec3 boardSlope=sign(boardDet)*(boardTx*dFdx(boardRelief)+boardTy*dFdy(boardRelief));
              normal=normalize(max(abs(boardDet),1e-7)*normal-boardSlope);
            `);
          }
          if(isDeckTrim){
            shader.uniforms.boardGrainMap={value:railGrain};
            const sizeVarying='varying vec2 trimSize;\n';
            shader.vertexShader=sizeVarying+'attribute vec2 trimDimensions;\n'+shader.vertexShader.replace(
              '#include <begin_vertex>',`
                #include <begin_vertex>
                trimSize=trimDimensions;
              `);
            shader.fragmentShader=sizeVarying+'uniform sampler2D boardGrainMap;\n'
              +shader.fragmentShader.replace('#include <map_fragment>',`
              // Sample inside a deck board, skipping its seams and nails.
              // Mirror the length so long trim boards can use the same grain.
              vec2 trimMeters=vUv*trimSize;
              float trimRun=trimMeters.y/${(plankLength*1.52).toFixed(3)};
              float trimLength=abs(2.*fract(trimRun+.5)-1.);
              float trimAcross=.5+(vUv.x-.5)*min(trimSize.x/${plankWidth.toFixed(2)},1.)*.82;
              vec2 trimUV=vec2(.17+.76*trimLength,1.-trimAcross/${plankRows.toFixed(1)});
              vec3 trimGrain=texture2D(boardGrainMap,trimMeters*vec2(3.14,.91)).rgb;
              vec2 seamDistance=min(trimMeters,trimSize-trimMeters);
              float edgeDistance=min(seamDistance.x,seamDistance.y);
              float seam=smoothstep(0.,.005,edgeDistance+fwidth(edgeDistance)*.4);
              diffuseColor*=mapTexelToLinear(texture2D(map,trimUV));
              diffuseColor.rgb*=mix(.81,1.18,smoothstep(.14,.79,trimGrain.b))*mix(.74,1.,seam);
            `).replace('#include <roughnessmap_fragment>',`
              float trimFinish=roughness*texture2D(roughnessMap,trimUV).g;
              float roughnessFactor=clamp(.66+.45*(trimFinish-.62)+.32*(trimGrain.g-.56),.43,.91);
              roughnessFactor=mix(roughnessFactor,.31,wetness*.74);
              roughnessFactor=mix(roughnessFactor,.35,dockDamp*.58);
            `).replace('#include <normal_fragment_maps>',`
              float trimRelief=bumpScale*texture2D(bumpMap,trimUV).r+.0058*trimGrain.r;
              normal=perturbNormalArb(-vViewPosition,normal,vec2(dFdx(trimRelief),dFdy(trimRelief)),faceDirection);
            `);
          }
          if(isStone){
            shader.uniforms.riverStonePores={value:stonePores};
            shader.uniforms.riverEdgeWear={value:isCap ? .24 : .11};
            // Project against the world axes so stretching the base geometry
            // never stretches the finish. Blend the projections on the bevels.
            shader.fragmentShader='uniform sampler2D riverStonePores;\nuniform float riverEdgeWear;\n'
              +shader.fragmentShader.replace('#include <map_fragment>',`
              vec3 stoneAxis=abs(inverseTransformDirection(normalize(vNormal),viewMatrix));
              vec3 stoneWeight=pow(stoneAxis,vec3(7.0));
              stoneWeight/=dot(stoneWeight,vec3(1.0));
              vec3 grainUV=riverSurface*.91;
              vec4 grain=texture2D(map,grainUV.zy)*stoneWeight.x
                        +texture2D(map,grainUV.xz)*stoneWeight.y
                        +texture2D(map,grainUV.xy)*stoneWeight.z;
              vec3 poresUV=riverSurface*${photoMaterials.slate?'2.65':'5.1'};
              vec3 pores=texture2D(riverStonePores,poresUV.zy).rgb*stoneWeight.x
                        +texture2D(riverStonePores,poresUV.xz).rgb*stoneWeight.y
                        +texture2D(riverStonePores,poresUV.xy).rgb*stoneWeight.z;
              float worn=smoothstep(.12,.69,stoneAxis.y)*(1.-smoothstep(.94,.999,stoneAxis.y));
              float mottle=${photoMaterials.slate?'smoothstep(.16,.70,pores.b)':'smoothstep(.33,.77,grain.g)'};
              float atStoneFoot=1.-smoothstep(.008,.14,abs(riverSurface.y));
              diffuseColor.rgb*=mapTexelToLinear(grain).rgb*mix(vec3(${isGateCap?'.57,.62,.67':'.72,.78,.86'}),
                               vec3(${isGateCap?'1.44,1.46,1.49':'1.32,1.33,1.36'}),mottle)
                               *(1.+worn*riverEdgeWear)*(1.-.19*atStoneFoot);
              float dockWall=(1.-smoothstep(.18,.42,abs(riverSurface.z-(${(entryThresholdZ-.245).toFixed(3)}))))
                *smoothstep(1.56,2.06,riverSurface.x-(${arrivalDock[0].toFixed(2)}))
                *(1.-smoothstep(4.64,5.08,riverSurface.x-(${arrivalDock[0].toFixed(2)})));
              float moss=(1.-smoothstep(.045,.17+.20*mottle,riverSurface.y))
                *dockWall*smoothstep(.34,.71,.65*pores.g+.35*grain.b);
              diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(.86,1.32,.66)+vec3(.011,.013,.004),moss*.64);
            `).replace('#include <roughnessmap_fragment>',`
              #include <roughnessmap_fragment>
              roughnessFactor=clamp(roughnessFactor+(.64-grain.g)*.25+(pores.g-.60)*.30-worn*.095,.51,.96);
            `).replace('#include <normal_fragment_maps>',`
              #include <normal_fragment_maps>
              // A small amount of relief follows the same unstretched projection.
              vec3 stoneDx=dFdx(-vViewPosition),stoneDy=dFdy(-vViewPosition);
              vec3 stoneTx=cross(stoneDy,normal),stoneTy=cross(normal,stoneDx);
              float stoneDet=dot(stoneDx,stoneTx);
              float stoneHeight=.0023*grain.g+${photoMaterials.slate?(isGateCap?'.009':'.0068'):'.00078'}*pores.r;
              vec3 microRelief=sign(stoneDet)*(stoneTx*dFdx(stoneHeight)+stoneTy*dFdy(stoneHeight));
              normal=normalize(max(abs(stoneDet),1e-7)*normal-microRelief);
            `);
          }
          if(grainFinish)finishJoinery(shader,grainFinish);
          if(boatFinish)finishBoatBoards(shader,boatFinish);
          if(boatFinish && boatFinish!=='paint')receiveBoatShadows(shader);
          if(receivesDockContact)shader.fragmentShader=shader.fragmentShader.replace('#include <lights_fragment_end>',`
            #include <lights_fragment_end>
            reflectedLight.indirectDiffuse*=1.-dockOcclusion*.85;
            reflectedLight.indirectSpecular*=1.-dockOcclusion*.61;
            reflectedLight.directDiffuse*=1.-dockOcclusion*.30;
          `);
          if(exterior){
            shader.fragmentShader=shader.fragmentShader.replace('#include <lights_fragment_maps>',`
              #include <lights_fragment_maps>
              // Broad, cool sky reflection for the horizontal surfaces by the river.
              vec3 skyRay=inverseTransformDirection(reflect(-geometry.viewDir,geometry.normal),viewMatrix);
              float openSky=smoothstep(-.14,.78,skyRay.y);
              float skyLobe=pow(max(dot(skyRay,normalize(vec3(-.43,.72,.43))),0.),mix(8.,2.,roughnessFactor));
              float facing=clamp(dot(geometry.normal,geometry.viewDir),0.,1.);
              vec3 fresnel=mix(material.specularColor,vec3(1.),pow(1.-facing,5.)*.34);
              reflectedLight.indirectSpecular+=fresnel*(vec3(.012,.020,.035)
                +openSky*vec3(.053,.079,.119)+skyLobe*vec3(.15,.205,.275));
            `);
          }
        };
      }
    }
    riverShore.landscape(T,{
      scene,batch,reflected,color,painted,addRiverMist,shore,waterLevel,random:shoreRandom,
      slate:stonePores,wood:photoMaterials.wood,foliage:photoMaterials.foliage,
      paintedStone:photoMaterials.paintedStone,forestFloor:photoMaterials.forestFloor,time:nightTime,moonDirection,
      horizonColors,horizonShader
    });
    const bankShade=new T.LatheGeometry(shadeProfile.getPoints(16),20);
    const bankHoop=new T.TorusGeometry(.158,.012,5,14).rotateX(Math.PI/2);
    const bankLanterns=shore.lanterns.map(lamp=>({
      ...lamp,phase:shoreRandom()*fullTurn,speed:.29+shoreRandom()*.16
    }));
    const bankMeshes=[[bankShade,paper],[bankHoop,bamboo]].map(([geometry,material])=>{
      const mesh=new T.InstancedMesh(geometry,material,bankLanterns.length);
      mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
      mesh.frustumCulled=false;
      scene.add(reflected(mesh));
      return mesh;
    });

    // Thousands of distant envelopes use one point draw per pass. Their real
    // positions also render into the river reflection, including on camera turns.
    const cloudPositions=[],cloudData=[];
    for(let i=0;i<755;i++){
      const side=rand()<.63?-1:1;
      const upstream=rand()<.80;
      const z=upstream?-14-rand()*222:rand()*88-7;
      const h=1.3+39*Math.pow(rand(),2.2);
      const x=bankX(z,side)+side*(.45+rand()*1.7)-h*(.13+.23*rand())+(rand()-.5)*(3.4+h*1.55);
      cloudPositions.push(x,h,z);
      cloudData.push(.17+Math.pow(rand(),2)*.49,rand()*fullTurn,rand());
    }
    // A smaller release drifts across the channel rather than tracing a hard edge at the bank.
    for(let i=0;i<175;i++){
      const h=5+35*rand(),z=-45-58*rand();
      cloudPositions.push(riverCenter(z)+(rand()-.5)*(12+h*.82),h,z);
      cloudData.push(.13+.27*rand(),rand()*fullTurn,rand());
    }
    const cloudGeo=new T.BufferGeometry();
    cloudGeo.setAttribute('position',new T.Float32BufferAttribute(cloudPositions,3));
    cloudGeo.setAttribute('lanternData',new T.Float32BufferAttribute(cloudData,3));
    const lightHeight={value:600};
    const cloudHasShoreProfile=renderer.capabilities.vertexTextures;
    const cloudMaterial=new T.ShaderMaterial({
      uniforms:{time:nightTime,viewportHeight:lightHeight,riverBankProfile:{value:shore.profile}},
      transparent:true,depthWrite:false,
      vertexShader:`${cloudHasShoreProfile?riverShore.waterShader:''}
        attribute vec3 lanternData;uniform float time,viewportHeight;varying float tint,visibility;
        void main(){
        vec3 p=position;
        float rise=mod(position.y-1.3+time*(.19+.09*lanternData.z),40.);
        p.x-=(1.3+rise-position.y)*.31;
        p.z+=.85*sin(time*.12+lanternData.y);
        p.x+=.18*sin(time*.27+lanternData.y);
        float forest=${cloudHasShoreProfile?'1.-smoothstep(1.3,5.6,shoreDistance(p.xz))':'1.'};
        p.y=6.2+12.*forest+rise+.25*sin(time*.31+lanternData.y);
        visibility=smoothstep(0.,1.1,rise)*(1.-smoothstep(37.,40.,rise))*.72;
        vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;
        gl_PointSize=clamp(lanternData.x*viewportHeight*projectionMatrix[1][1]/max(1.,-mv.z),1.7,22.);
        visibility*=1.-.82*smoothstep(17.,116.,-mv.z);
        tint=lanternData.z;}`,
      fragmentShader:`varying float tint,visibility;void main(){
        vec2 p=gl_PointCoord*2.-1.;float d=length(p*vec2(1.33,1.));
        float core=1.-smoothstep(.30,.53,d);
        float halo=exp(-8.0*d*d)*(1.-smoothstep(.55,.91,d));
        float base=smoothstep(-.15,.43,p.y);vec3 paper=mix(vec3(.92,.16,.023),vec3(1.,.87,.37),base);
        vec3 c=mix(vec3(.96,.25,.045),paper,core);
        gl_FragColor=vec4(c*(.72+.28*tint),(core*.96+(1.-core)*halo*.43)*visibility);
        #include <encodings_fragment>
        }`
    });
    const skyLanternCloud=new T.Points(cloudGeo,cloudMaterial);
    skyLanternCloud.frustumCulled=false;
    scene.add(reflected(skyLanternCloud));

    const poolGeo=new T.PlaneGeometry(1,1);poolGeo.rotateX(-Math.PI/2);
    const contactMap=painted(64,(ctx,n)=>{
      const g=ctx.createRadialGradient(n/2,n/2,0,n/2,n/2,n/2);
      g.addColorStop(0,'rgba(0,0,0,.66)');g.addColorStop(.48,'rgba(0,0,0,.36)');
      g.addColorStop(1,'rgba(0,0,0,0)');
      ctx.fillStyle=g;ctx.fillRect(0,0,n,n);
    });
    const contact=new T.MeshBasicMaterial({map:contactMap,transparent:true,depthWrite:false});
    const waterContact=new T.MeshBasicMaterial({map:contactMap,transparent:true,depthWrite:false,opacity:.85});
    const postContactMap=painted(64,(ctx,n)=>{
      const image=ctx.createImageData(n,n);
      for(let y=0;y<n;y++)for(let x=0;x<n;x++){
        const edge=Math.max(Math.abs(x+.5-n/2),Math.abs(y+.5-n/2))/(n/2);
        image.data[(y*n+x)*4+3]=Math.round(171*(1-T.MathUtils.smoothstep(edge,.64,.99)));
      }
      ctx.putImageData(image,0,0);
    });
    const postContact=new T.MeshBasicMaterial({map:postContactMap,transparent:true,depthWrite:false});
    const cedarMap=painted(512,(ctx,n)=>{
      const grain=ctx.createLinearGradient(0,0,n,0);
      grain.addColorStop(0,'#826351');grain.addColorStop(.22,'#ab8e71');
      grain.addColorStop(.61,'#997657');grain.addColorStop(1,'#785e4b');
      ctx.fillStyle=grain;ctx.fillRect(0,0,n,n);
      const knots=Array.from({length:4},()=>[rand()*n,rand()*n]);
      for(let i=0;i<950;i++){
        const x=rand()*n,phase=rand()*fullTurn,length=18+rand()*130;
        const from=rand()*n;
        ctx.strokeStyle=i%4?'rgba(46,28,25,.081)':'rgba(236,205,160,.117)';
        ctx.lineWidth=.22+rand()*.78;
        ctx.beginPath();
        for(let y=from;y<from+length;y+=5){
          let u=x+1.2*Math.sin(y*.044+phase)+2.8*Math.sin(y*.013);
          for(const [kx,ky] of knots){
            const dx=x-kx,dy=(y-ky)*.42;
            u+=dx*2.2*Math.exp(-(dx*dx+dy*dy)/675);
          }
          if(y===from)ctx.moveTo(u,y);else ctx.lineTo(u,y);
        }
        ctx.stroke();
      }
      for(const [x,y] of knots){
        ctx.save();ctx.translate(x,y);ctx.scale(1,2.8);
        for(let r=13;r>2;r-=2.5){
          ctx.strokeStyle='rgba(55,35,29,.21)';ctx.lineWidth=.75;
          ctx.beginPath();ctx.ellipse(0,0,r,r*.67,-.17,0,fullTurn);ctx.stroke();
        }
        ctx.restore();
      }
    });
    const plankRows=18,plankWidth=.20,plankLength=1.9;
    const plankRepeatLength=plankRows*plankWidth;
    // A tile repeats one full board length. Shift the joint across each row
    // so every board has the same length and neighboring ends are staggered.
    const plankJoints=Array.from({length:plankRows},(_,i)=>
      .13+.74*((i*7)%plankRows)/(plankRows-1));
    const timberMap=painted(1024,(ctx,n)=>{
      const pitch=n/plankRows;
      const scannedRows=[70,195,310,432,535,650,766,868,976];
      const deckPhoto=photoMaterials.deck?.image;
      for(let i=0;i<plankRows;i++){
        const z=i*pitch,joint=n*plankJoints[i];
        ctx.fillStyle=['#8c8377','#9a8f7d','#8a857b','#a19985','#807f75'][i%5];
        ctx.fillRect(0,z,n,pitch);
        if(deckPhoto){
          // Sample the interiors of the scanned boards so only the layout below creates seams.
          const sourceY=scannedRows[(i*5)%scannedRows.length]-32;
          ctx.globalAlpha=.91;
          for(const start of [joint-n,joint])ctx.drawImage(deckPhoto,0,sourceY,1024,64,start,z,n,pitch);
          ctx.globalAlpha=1;
        }
        ctx.fillStyle='#4d443a';ctx.fillRect(0,z,n,1.35);
        ctx.fillStyle='#d4c3a933';ctx.fillRect(0,z+1.35,n,.65);
        ctx.globalAlpha=deckPhoto ? .32 : 1;
        for(let j=0;j<115;j++){
          const x=rand()*n,y=z+3+rand()*(pitch-4),length=4+rand()*160;
          ctx.strokeStyle=j%3?'#493d3238':'#e9d8b536';ctx.lineWidth=.36+rand()*.68;
          const bend=rand()*2-1;
          ctx.beginPath();
          for(const start of x+length>=n?[x,x-n]:[x]){
            ctx.moveTo(start,y);
            ctx.quadraticCurveTo(start+length/2,y+bend,start+length,y+.4);
          }
          ctx.stroke();
        }
        ctx.globalAlpha=1;
        ctx.fillStyle='#4d443a';ctx.fillRect(joint-.76,z+1.35,1.52,pitch-1.35);
        ctx.fillStyle='#d4c3a943';ctx.fillRect(joint+.76,z+1.75,.75,pitch-2.15);
        ctx.fillStyle='#453c3590';
        for(const x of [joint-7,joint+7]){
          ctx.beginPath();ctx.ellipse(x,z+pitch*.24,1.5,1.9,0,0,fullTurn);ctx.fill();
          ctx.beginPath();ctx.ellipse(x,z+pitch*.77,1.5,1.9,0,0,fullTurn);ctx.fill();
        }
      }
    });
    const plankHeight=painted(512,(ctx,n)=>{
      const grainRandom=seedRandom();
      const pitch=n/plankRows;
      for(let i=0;i<plankRows;i++){
        const z=i*pitch,joint=n*plankJoints[i];
        const profile=ctx.createLinearGradient(0,z,0,z+pitch);
        profile.addColorStop(0,'#7f7f7f');profile.addColorStop(.075,'#a5a5a5');
        profile.addColorStop(.925,'#a5a5a5');profile.addColorStop(1,'#7f7f7f');
        ctx.fillStyle=profile;ctx.fillRect(0,z,n,pitch+.2);
        for(let line=0;line<62;line++){
          const x=grainRandom()*n,y=z+2+grainRandom()*(pitch-4);
          const length=10+grainRandom()*118,bend=grainRandom()*.86-.43;
          ctx.strokeStyle=line%4?'#68686858':'#e5e5e556';
          ctx.lineWidth=.34+grainRandom()*.53;
          ctx.beginPath();
          for(const start of x+length>=n?[x,x-n]:[x]){
            ctx.moveTo(start,y);
            ctx.quadraticCurveTo(start+length*.54,y+bend,start+length,y+.15);
          }
          ctx.stroke();
        }
        ctx.fillStyle='#898989';ctx.fillRect(joint-.55,z+1,1.1,pitch-2);
      }
    });
    const deckFinish=painted(512,(ctx,n)=>{
      const grainRandom=seedRandom();
      for(let i=0;i<plankRows;i++){
        const pitch=n/plankRows,z=i*pitch;
        ctx.fillStyle=['#b2b2b2','#d5d5d5','#bababa','#dedede','#afafaf'][i%5];
        ctx.fillRect(0,z,n,pitch+.2);
        ctx.save();
        ctx.beginPath();ctx.rect(0,z+1,n,pitch-2);ctx.clip();
        for(let j=0;j<54;j++){
          const x=grainRandom()*n,y=z+2+grainRandom()*(pitch-4);
          const length=20+grainRandom()*n*.47,bend=grainRandom()*2.2-1.1;
          ctx.strokeStyle=j%4?'#56565672':'#efefef59';
          ctx.lineWidth=.45+grainRandom()*.80;
          ctx.beginPath();
          for(const start of x+length>=n?[x,x-n]:[x]){
            ctx.moveTo(start,y);
            ctx.bezierCurveTo(start+length*.31,y+bend,start+length*.75,y-bend*.39,start+length,y+bend*.36);
          }
          ctx.stroke();
        }
        ctx.restore();
      }
      const wear=ctx.createLinearGradient(0,0,n,0);
      wear.addColorStop(0,'#70707058');wear.addColorStop(.13,'#70707000');
      wear.addColorStop(.41,'#70707072');wear.addColorStop(.66,'#7070706b');
      wear.addColorStop(.89,'#70707000');wear.addColorStop(1,'#70707058');
      ctx.fillStyle=wear;ctx.fillRect(0,0,n,n);
    });
    const cedarFinish=painted(256,(ctx,n)=>{
      const random=seedRandom();
      const stripe=ctx.createLinearGradient(0,0,n,0);
      stripe.addColorStop(0,'#acacac');stripe.addColorStop(.28,'#d7d7d7');
      stripe.addColorStop(.43,'#b4b4b4');stripe.addColorStop(.77,'#e3e3e3');
      stripe.addColorStop(1,'#acacac');
      ctx.fillStyle=stripe;ctx.fillRect(0,0,n,n);
      for(let i=0;i<270;i++){
        const x=random()*n,y=random()*n,length=15+random()*n*.39;
        ctx.strokeStyle=i%4?'#67676772':'#eaeaea4f';ctx.lineWidth=.34+random()*.57;
        ctx.beginPath();ctx.moveTo(x,y);ctx.quadraticCurveTo(x-.7,y+length*.54,x+.7,y+length);ctx.stroke();
      }
    });
    for(const texture of [plankHeight,deckFinish,cedarFinish]){
      texture.encoding=T.LinearEncoding;
      texture.wrapS=texture.wrapT=T.RepeatWrapping;
    }
    for(const texture of [timberMap,plankHeight,deckFinish]){
      texture.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
    }
    const timber=new T.MeshStandardMaterial({
      map:timberMap,bumpMap:plankHeight,bumpScale:.008,roughnessMap:deckFinish,roughness:.79,
      color:color('#b9b7b0')
    });
    timberMap.wrapS=timberMap.wrapT=T.RepeatWrapping;
    const deckGeometries=new Map();
    const deckBorderWidth=.19,stripBatches=new Map();
    const boxPositions=cube.getAttribute('position'),boxUVs=cube.getAttribute('uv');
    function deck(x,z,width,depth,thickness,framed=false){
      const inset=framed?deckBorderWidth:0;
      const boardWidth=width-2*inset,boardDepth=depth-2*inset;
      const dimensions=boardWidth+'x'+boardDepth;
      if(!deckGeometries.has(dimensions)){
        const geometry=cube.clone();
        const uv=geometry.getAttribute('uv'),normal=geometry.getAttribute('normal');
        for(let i=0;i<uv.count;i++){
          if(normal.getY(i)!==0)uv.setXY(i,uv.getX(i)*boardWidth/plankLength,uv.getY(i)*boardDepth/plankRepeatLength);
        }
        deckGeometries.set(dimensions,geometry);
      }
      batch(deckGeometries.get(dimensions),timber,x,-thickness/2,z,boardWidth,thickness,boardDepth);
      if(!framed)return;
      const halfX=(width-inset)/2,halfZ=(depth-inset)/2;
      const corners=[[-1,-1],[1,-1],[1,1],[-1,1]].map(([nx,nz])=>({x:x+nx*halfX,z:z+nz*halfZ,nx,nz}));
      corners.forEach((start,i)=>{
        const finish=corners[(i+1)%4],dx=finish.x-start.x,dz=finish.z-start.z;
        const length=Math.hypot(dx,dz);
        deckEdgeBoards(start,finish,{nx:dz/length,nz:-dx/length},thickness,inset);
      });
    }
    const tiles=painted(256,(ctx,n)=>{
      for(let i=0;i<7;i++)for(let j=-1;j<6;j++){
        const x=(j+.5*(i%2))*n/5,y=i*n/7;
        ctx.fillStyle=['#7c8694','#697685','#909aa5','#758797'][(i+j+8)%4];
        ctx.fillRect(x,y,n/5,n/7);
        ctx.fillStyle='#3c4653';ctx.fillRect(x,y,n/5,2.5);ctx.fillRect(x,y,1.4,n/7);
        ctx.fillStyle='#b6bec5';ctx.fillRect(x+1.4,y+2.5,n/5-1.4,1.3);
      }
      for(let i=0;i<3000;i++){
        ctx.fillStyle=i%2?'#17202c12':'#e7e9dc17';ctx.fillRect(rand()*n,rand()*n,2,1);
      }
    });
    tiles.wrapS=tiles.wrapT=T.RepeatWrapping;
    const blueTiles=new T.MeshStandardMaterial({map:tiles,bumpMap:tiles,bumpScale:.014,color:color('#577388'),roughness:.68});
    const cedar=new T.MeshStandardMaterial({
      map:cedarMap,bumpMap:cedarMap,bumpScale:.011,roughnessMap:cedarFinish,roughness:.83,color:color('#b58d72')
    });
    const uprightCedar=new T.MeshStandardMaterial({color:color('#876f5f'),roughness:.72});
    const crossTimber=new T.MeshStandardMaterial({color:color('#8a7362'),roughness:.73});
    const rafterTimber=new T.MeshStandardMaterial({color:color('#836c5e'),roughness:.76});
    const slatWood=new T.MeshStandardMaterial({color:color('#856d5c'),roughness:.77});
    const gateWood=new T.MeshStandardMaterial({color:color('#776453'),roughness:.72,vertexColors:true});
    const timberSocket=new T.MeshStandardMaterial({color:color('#33251e'),roughness:.94});
    const ironPeg=new T.MeshStandardMaterial({color:color('#59514a'),roughness:.54,metalness:.69});
    const postBand=new T.MeshStandardMaterial({color:color('#8d7759'),roughness:.54,metalness:.58});
    const railWood=new T.MeshStandardMaterial({color:color('#805743'),roughness:.54});
    const plinth=new T.MeshStandardMaterial({color:color('#35434f'),roughness:.69,vertexColors:true});
    const railCap=new T.MeshStandardMaterial({color:color('#a88b63'),roughness:.40,metalness:1});
    const lowerRail=new T.MeshStandardMaterial({color:color('#725543'),roughness:.62});
    const railFoot=new T.MeshStandardMaterial({color:color('#5b6269'),roughness:.46,metalness:.62});
    const railGrain=photoMaterials.wood||painted(512,(ctx,n)=>{
      const random=seedRandom();
      ctx.fillStyle='#9796a1';ctx.fillRect(0,0,n,n);
      for(let i=0;i<300;i++){
        const x=random()*n,phase=random()*fullTurn;
        const arc=3+random()*14;
        ctx.lineWidth=i<60?3+random()*9:.6+random()*2.4;
        ctx.strokeStyle=i<60
          ?(i%3?'#547b4f7a':'#beb9d48c')
          :(i%3?'#5260586b':'#c5aeb35d');
        ctx.beginPath();
        for(let y=-16;y<=n+16;y+=8){
          const turn=y/n*fullTurn;
          const u=x+arc*Math.sin(turn+phase)+2.4*Math.sin(turn*3+phase*.4);
          if(y===-16)ctx.moveTo(u,y);else ctx.lineTo(u,y);
        }
        ctx.stroke();
      }
    });
    const castFinish=painted(256,(ctx,n)=>{
      const random=seedRandom();
      ctx.fillStyle='#8b8897';ctx.fillRect(0,0,n,n);
      for(let i=0;i<190;i++){
        const x=random()*n,y=random()*n,r=3+random()*17;
        const patina=ctx.createRadialGradient(x,y,0,x,y,r);
        patina.addColorStop(0,i%3?'#58706459':'#b5a6ae6a');
        patina.addColorStop(1,'#78879700');
        ctx.fillStyle=patina;ctx.fillRect(x-r,y-r,2*r,2*r);
      }
      for(let i=0;i<1900;i++){
        const x=random()*n,y=random()*n;
        ctx.fillStyle=i%4?'#4b9a8d42':'#d6aab568';
        ctx.fillRect(x,y,.45+random()*.9,1.5+random()*7);
      }
    });
    for(const texture of [railGrain,castFinish]){
      texture.encoding=T.LinearEncoding;
      texture.wrapS=texture.wrapT=T.RepeatWrapping;
      texture.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
      texture.needsUpdate=true;
    }
    const timberPaint=photoMaterials.pavilionTimber;
    if(timberPaint){
      timberPaint.wrapS=timberPaint.wrapT=T.MirroredRepeatWrapping;
      timberPaint.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
    }
    const walkwayTrim=timber.clone();
    walkwayTrim.color.copy(color('#afaaa1'));
    const headerPlank=timber.clone();
    headerPlank.color.copy(color('#b3aea5'));
    const exteriorTimber={map:railGrain,timber:timberPaint,scale:'vec3(2.24,.78,2.24)',wear:'.11',relief:'.00118'};
    const joineryFinishes=new Map([
      [uprightCedar,{...exteriorTimber,base:true}],
      [crossTimber,{...exteriorTimber,axes:'xzy'}],
      [rafterTimber,{...exteriorTimber,axes:'yxz'}],
      [slatWood,exteriorTimber],
      [gateWood,{...exteriorTimber,curved:true,wear:'.16',relief:'.00110'}],
      [pictureBrass,{map:castFinish,scale:'vec3(5.3)',wear:'.24',relief:'.00058',patina:true}],
      [postBand,{map:castFinish,scale:'vec3(4.6)',wear:'.15',relief:'.00048',patina:true}],
      [railWood,{map:railGrain,horizontal:true,scale:'vec3(3.7,.65,3.7)',wear:'.18',relief:'.00094'}],
      [plinth,{map:railGrain,scale:'vec3(4.2,1.05,4.2)',wear:'.25',relief:'.00120',groundContact:true}],
      [railCap,{map:castFinish,scale:'vec3(4.6)',wear:'.32',relief:'.00062',patina:true}],
      [lowerRail,{map:railGrain,horizontal:true,scale:'vec3(4.5,.86,4.5)',wear:'.15',relief:'.00072'}],
      [railFoot,{map:castFinish,scale:'vec3(5.8)',wear:'.28',relief:'.00076',groundContact:true}]
    ]);
    function chamferedBlock(radius){
      const half=.5-radius;
      const shape=new T.Shape();
      shape.moveTo(-half,-half);shape.lineTo(half,-half);shape.lineTo(half,half);
      shape.lineTo(-half,half);shape.closePath();
      const geometry=new T.ExtrudeGeometry(shape,{
        depth:2*half,bevelEnabled:true,bevelSize:radius,bevelThickness:radius,bevelSegments:2
      });
      geometry.translate(0,0,-half);
      const uvs=geometry.getAttribute('uv');
      for(let v=0;v<uvs.count;v++)uvs.setXY(v,uvs.getX(v)+.5,uvs.getY(v)+.5);
      return geometry;
    }
    const beam=chamferedBlock(.063), trim=chamferedBlock(.035);
    // Mill the long edges while leaving full-width end faces for the joints.
    const timberSection=new T.Shape();
    timberSection.moveTo(-.5,-.424);
    for(const [x,y] of [[-.478,-.478],[-.424,-.5],[.424,-.5],[.478,-.478],[.5,-.424],[.5,.424],
      [.478,.478],[.424,.5],[-.424,.5],[-.478,.478],[-.5,.424]])timberSection.lineTo(x,y);
    timberSection.closePath();
    const ceilingTimber=new T.ExtrudeGeometry(timberSection,{depth:1,bevelEnabled:false});
    ceilingTimber.translate(0,0,-.5);
    const braceTimber=ceilingTimber.clone().rotateY(Math.PI/2);
    const latticeTimber=ceilingTimber.clone().rotateX(Math.PI/2);
    const pegGeometry=new T.CylinderGeometry(.46,.50,1,12);
    function carpenterPeg(x,y,z,side,diameter){
      batch(pegGeometry,timberSocket,x,y,z+side*.001,diameter*1.48,.007,diameter*1.48,Math.PI/2,Math.PI/2);
      batch(pegGeometry,ironPeg,x,y,z+side*.005,diameter,.009,diameter,Math.PI/2,Math.PI/2);
    }
    const handrailSection=new T.Shape();
    const corner=.15,flat=.5-corner;
    handrailSection.moveTo(-flat,-.5);
    handrailSection.lineTo(flat,-.5);
    handrailSection.quadraticCurveTo(.5,-.5,.5,-flat);
    handrailSection.lineTo(.5,flat);
    handrailSection.quadraticCurveTo(.5,.5,flat,.5);
    handrailSection.lineTo(-flat,.5);
    handrailSection.quadraticCurveTo(-.5,.5,-.5,flat);
    handrailSection.lineTo(-.5,-flat);
    handrailSection.quadraticCurveTo(-.5,-.5,-flat,-.5);
    handrailSection.closePath();
    const handrailGeometry=new T.ExtrudeGeometry(handrailSection,{
      depth:1,bevelEnabled:false,curveSegments:5
    });
    handrailGeometry.translate(0,0,-.5);
    const railVertices=handrailGeometry.getAttribute('position');
    const railNormals=handrailGeometry.getAttribute('normal');
    for(let i=0;i<railVertices.count;i++){
      if(Math.abs(railNormals.getZ(i))>.1)continue;
      const x=railVertices.getX(i),y=railVertices.getY(i);
      const nx=x-T.MathUtils.clamp(x,-flat,flat),ny=y-T.MathUtils.clamp(y,-flat,flat);
      const length=Math.hypot(nx,ny);
      railNormals.setXYZ(i,nx/length,ny/length,0);
    }
    function roundedStone(rx,ry,rz){
      const geometry=new T.BoxGeometry(1,1,1,5,5,5);
      const position=geometry.getAttribute('position'),normal=geometry.getAttribute('normal');
      const corner=new T.Vector3(),direction=new T.Vector3();
      // Keep the centers of the faces flat and concentrate the grid on the
      // bevels. The ellipsoid normals match across all six faces of the box.
      for(let i=0;i<position.count;i++){
        corner.fromBufferAttribute(position,i);
        const sx=Math.sign(corner.x),sy=Math.sign(corner.y),sz=Math.sign(corner.z);
        direction.set(
          sx*Math.max(0,Math.abs(corner.x)*5-.5),
          sy*Math.max(0,Math.abs(corner.y)*5-.5),
          sz*Math.max(0,Math.abs(corner.z)*5-.5)
        ).normalize();
        position.setXYZ(i,sx*(.5-rx)+direction.x*rx,sy*(.5-ry)+direction.y*ry,sz*(.5-rz)+direction.z*rz);
        direction.set(direction.x/rx,direction.y/ry,direction.z/rz).normalize();
        normal.setXYZ(i,direction.x,direction.y,direction.z);
      }
      return geometry;
    }
    const wallBlock=roundedStone(.009,.019,.028);
    const wallCap=roundedStone(.013,.15,.032);
    const gateCap=roundedStone(.020,.19,.056);
    const gateLedge=edge.clone();
    gateLedge.color.copy(color('#858b8d'));
    gateLedge.roughness=.78;
    const capBlock=roundedStone(.032,.15,.032);
    const railingBlock=chamferedBlock(.069);
    const plaster=new T.MeshStandardMaterial({map:limestone,color:color('#65717e'),roughness:.80});
    const mortar=new T.MeshStandardMaterial({color:color('#262e38'),roughness:.94});
    const darkTimber=new T.MeshStandardMaterial({
      map:cedarMap,bumpMap:cedarMap,bumpScale:.015,roughnessMap:cedarFinish,roughness:.92,color:color('#644b45')
    });
    function deckPile(x,z){
      batch(beam,darkTimber,x,waterLevel-.10,z,.45,.83,.48);
      batch(trim,stone,x,waterLevel-.08,z,.56,.285,.58);
      batch(trim,edge,x,waterLevel+.055,z,.54,.048,.56);
      batch(poolGeo,waterContact,x,waterLevel+.003,z,1.54,1,1.63);
      const radius=.96;
      const falloff=wakeContext.createRadialGradient(x,z,0,x,z,radius);
      falloff.addColorStop(0,'#fff');
      falloff.addColorStop(1,'#fff0');
      wakeContext.fillStyle=falloff;
      wakeContext.fillRect(x-radius,z-radius,2*radius,2*radius);
    }
    const pierWidth=.354,pierCapWidth=.414,wallJoint=.006,pavilionInset=.245;
    const wallCapBase=.742,wallCapTop=.826,wallBandBase=.527;
    function galleryPost(x,z,width,depth,height){
      batch(wallBlock,stone,x,wallBandBase/2,z,pierWidth,wallBandBase,pierWidth);
      batch(wallBlock,plaster,x,(wallBandBase+wallCapBase)/2,z,pierWidth,wallCapBase-wallBandBase,pierWidth);
      batch(capBlock,edge,x,(wallCapBase+wallCapTop)/2,z,pierCapWidth,wallCapTop-wallCapBase,pierCapWidth);
      blockWalking(x,z,pierCapWidth,pierCapWidth);
      batch(beam,uprightCedar,x,(height+wallCapTop)/2,z,width,height-wallCapTop,depth);
      batch(trim,postBand,x,wallCapTop+.025,z,width+.05,.050,depth+.05);
      batch(poolGeo,contact,x,.008,z,pierWidth+.26,1,pierWidth+.26);
      batch(poolGeo,postContact,x,.829,z,width+.10,1,depth+.10);
    }
    function stoneWall(alongX,fixed,firstPier,lastPier,capFinish=edge){
      const bodyInset=pierWidth/2+wallJoint,capInset=pierCapWidth/2+wallJoint;
      const from=firstPier+bodyInset,to=lastPier-bodyInset;
      const capFrom=firstPier+capInset,capTo=lastPier-capInset;
      const length=to-from;
      const spans=Math.max(1,Math.round(length/1.12)),step=length/spans;
      const rotation=alongX?0:Math.PI/2;
      function slab(geometry,material,start,finish,y,height,thickness){
        const mid=(start+finish)/2,span=finish-start;
        batch(geometry,material,alongX?mid:fixed,y,alongX?fixed:mid,span,height,thickness,rotation);
      }
      // Run recessed mortar behind the joints in both the wall and its cap.
      slab(cube,mortar,from-wallJoint,to+wallJoint,.386,.758,.280);
      slab(cube,mortar,capFrom-wallJoint,capTo+wallJoint,.780,.076,.366);
      const mid=(capFrom+capTo)/2,span=capTo-capFrom;
      blockWalking(alongX?mid:fixed,alongX?fixed:mid,alongX?span:.394,alongX?.394:span);
      for(let i=0;i<spans;i++){
        const low=from+i*step,high=low+step;
        const start=low+(i===0?0:.004),finish=high-(i===spans-1?0:.004);
        slab(wallBlock,stone,start,finish,wallBandBase/2,wallBandBase,.30);
        slab(wallBlock,plaster,start,finish,(wallBandBase+wallCapBase)/2,wallCapBase-wallBandBase,.31);
        slab(capFinish===gateLedge?gateCap:wallCap,capFinish,i===0?capFrom:start,i===spans-1?capTo:finish,
          (wallCapBase+wallCapTop)/2,wallCapTop-wallCapBase,.394);
      }
    }
    const gateInner=.851,gateOuter=.986,gateCenterY=2.017;
    function moonGateGeometry(){
      const profile=[
        [gateInner,-.043],[gateInner+.014,-.060],[gateInner+.025,-.067],
        [gateOuter-.020,-.067],[gateOuter,-.046],[gateOuter,.046],
        [gateOuter-.020,.067],[gateInner+.025,.067],[gateInner+.014,.060],[gateInner,.043]
      ];
      const positions=[],normals=[],uvs=[],colors=[];
      const steps=20,seamWidth=.0021,quarter=fullTurn/4;
      for(let piece=0;piece<4;piece++){
        const start=piece*quarter+seamWidth,end=start+quarter-2*seamWidth;
        const angles=[start,start+.023];
        for(let i=1;i<steps;i++)angles.push(T.MathUtils.lerp(start,end,i/steps));
        angles.push(end-.023,end);
        const vertex=(radius,depth,a,radial,forward)=>{
          const x=Math.cos(a),y=Math.sin(a);
          const shading=.72+.28*T.MathUtils.smoothstep(Math.min(a-start,end-a),0,.025);
          positions.push(radius*x,radius*y,depth);
          normals.push(radial*x,radial*y,forward);
          uvs.push((radius-gateInner+depth*.46)*3.2+piece*.31,a*.87+piece*.39);
          colors.push(shading,shading,shading);
        };
        for(let i=0;i<profile.length;i++){
          const [r0,z0]=profile[i],[r1,z1]=profile[(i+1)%profile.length];
          const dr=r1-r0,dz=z1-z0,d=Math.hypot(dr,dz);
          for(let j=1;j<angles.length;j++){
            const a=angles[j-1],b=angles[j];
            for(const [radius,depth,angle] of [[r0,z0,a],[r0,z0,b],[r1,z1,b],[r0,z0,a],[r1,z1,b],[r1,z1,a]]){
              vertex(radius,depth,angle,dz/d,-dr/d);
            }
          }
        }
        for(const [angle,direction] of [[start,-1],[end,1]]){
          const cap=(radius,depth)=>{
            positions.push(radius*Math.cos(angle),radius*Math.sin(angle),depth);
            normals.push(-direction*Math.sin(angle),direction*Math.cos(angle),0);
            uvs.push(radius*2.3,depth*3.0);
            colors.push(.47,.47,.47);
          };
          for(let edgeIndex=0;edgeIndex<profile.length;edgeIndex++){
            const next=(edgeIndex+1)%profile.length;
            cap((gateInner+gateOuter)/2,0);
            cap(...profile[direction<0?edgeIndex:next]);
            cap(...profile[direction<0?next:edgeIndex]);
          }
        }
      }
      const geometry=new T.BufferGeometry();
      geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));
      geometry.setAttribute('normal',new T.Float32BufferAttribute(normals,3));
      geometry.setAttribute('uv',new T.Float32BufferAttribute(uvs,2));
      geometry.setAttribute('color',new T.Float32BufferAttribute(colors,3));
      return geometry;
    }
    function addMoonGate(x,z,ring,dowel){
      batch(ring,gateWood,x,gateCenterY,z,1,1,1);
      const bottom=wallCapTop-.013,top=gateCenterY-gateInner+.069;
      batch(beam,uprightCedar,x,(top+bottom)/2,z,.129,top-bottom,.158);
      batch(poolGeo,postContact,x,wallCapTop+.002,z,.27,1,.30);
      for(const side of [-1,1])carpenterPeg(x,gateCenterY-gateOuter+.071,z+side*.079,side,.020);
      const barDrop=.310,seat=gateInner+.028;
      const barWidth=2*Math.sqrt(seat*seat-barDrop*barDrop);
      batch(dowel,slatWood,x,gateCenterY-barDrop,z,.047,barWidth,.047,0,Math.PI/2);
      const segments=24,radius=(gateInner+gateOuter)/2;
      for(let i=0;i<segments;i++){
        const angle=fullTurn*(i+.5)/segments;
        bounceBox(gateWood,x+radius*Math.cos(angle),gateCenterY+radius*Math.sin(angle),z,
          radius*fullTurn/segments+.005,.133,.128,0,angle+Math.PI/2);
      }
    }
    const profiles=[
      [[-1,-.13],[0,1.15],[1,-.13]],
      [[-1,.15],[-.78,.02],[-.47,.20],[0,.83],[.47,.20],[.78,.02],[1,.15]],
      [[-1,-.07],[-.62,.16],[-.38,.79],[.38,.79],[.62,.16],[1,-.07]],
      [[-1,-.12],[-.28,.29],[.49,.77],[1,1.02]],
      Array.from({length:11},(_,i)=>{const x=i/5-1;return [x,.05+.82*Math.sqrt(1-x*x)]})
    ];
    const roofOverhangs=[.42,.64,.63,.32,.53];
    const lanternRoofs=profiles.map((profile,i)=>({
      top:galleryHeights[i]+.35+Math.max(...profile.map(([,y])=>y)),
      overhang:roofOverhangs[i]+.10
    }));
    function galleryRoof(room,height,profile,roof,overhang){
      const {x,z,width,depth}=room;
      const half=width/2+overhang;
      const section=new T.Shape();
      section.moveTo(-half,profile[0][1]);
      for(const [u,y] of profile.slice(1))section.lineTo(u*half,y);
      for(const [u,y] of [...profile].reverse())section.lineTo(u*half,y-.14);
      section.closePath();
      const span=depth+overhang*2;
      const cover=new T.Mesh(new T.ExtrudeGeometry(section,{
        depth:span,bevelEnabled:true,bevelSize:.022,bevelThickness:.022,bevelSegments:2
      }),roof);
      cover.position.set(x,height+.28,z-span/2);
      scene.add(reflected(cover));
      const intervals=Math.ceil(depth/2.1);
      const rafterRows=Array.from({length:intervals+1},(_,i)=>z+(i/intervals-.5)*depth);
      const fasciaRows=[z-span/2,z+span/2];
      function roofBand(material,top,bottom,thickness,rows){
        // Sweep the entire profile so the timber meets at every change of pitch.
        const shape=new T.Shape();
        shape.moveTo(-half,profile[0][1]+top);
        for(const [u,y] of profile.slice(1))shape.lineTo(u*half,y+top);
        for(const [u,y] of [...profile].reverse())shape.lineTo(u*half,y+bottom);
        shape.closePath();
        const geometry=new T.ExtrudeGeometry(shape,{
          depth:thickness,bevelEnabled:true,bevelSize:.008,bevelThickness:.008,bevelSegments:1
        });
        geometry.translate(0,0,-thickness/2);
        const band=new T.InstancedMesh(geometry,material,rows.length);
        const placement=new T.Matrix4();
        rows.forEach((row,i)=>band.setMatrixAt(i,placement.makeTranslation(x,height,row)));
        band.frustumCulled=false;
        scene.add(reflected(band));
      }
      roofBand(rafterTimber,.158,-.024,.126,rafterRows);
      roofBand(darkTimber,.276,.078,.126,fasciaRows);
      for(let i=1;i<profile.length;i++){
        const [u0,y0]=profile[i-1],[u1,y1]=profile[i];
        const dx=(u1-u0)*half,dy=y1-y0;
        const midX=x+(u0+u1)*half/2,midY=height+.16+(y0+y1)/2;
        const pitch=Math.atan2(dy,dx),length=Math.hypot(dx,dy);
        bounceBox(roof,midX,midY+.05,z,length,.14,span,0,pitch);
        // Use matching pitch-aligned bounds for the cached shadow bake.
        for(const row of fasciaRows)bounceBox(darkTimber,midX,midY+.017,row,length,.198,.142,0,pitch);
        for(const row of rafterRows)bounceBox(rafterTimber,midX,midY-.093,row,length,.182,.142,0,pitch);
      }
      for(const side of [-1,1]){
        const y=profile[side===1?profile.length-1:0][1];
        batch(beam,darkTimber,x+side*half,height+.176+y,z,.15,.202,span+.14);
      }
    }
    const stations=[];
    function photoGeometry(id,w,h){
      const [ax,ay,aw,ah]=atlas.regions[id],geo=new T.PlaneGeometry(w,h),uv=geo.attributes.uv;
      geo.setAttribute('pictureUV',uv.clone());
      for(let j=0;j<uv.count;j++)
        uv.setXY(j,(ax+.5+uv.getX(j)*(aw-1))/2048,1-(ay+.5+(1-uv.getY(j))*(ah-1))/2048);
      return geo;
    }
    const pathMemories=[[5,2,1],[11,4,-1],[14,6,1],[2,8,-1]].map(([id,bend,side])=>{
      const [x,z]=trail[bend], [sx,sz]=trail[bend-1];
      const along=new T.Vector3(x-sx,0,z-sz).normalize();
      const across=new T.Vector3(-along.z,0,along.x).multiplyScalar(side);
      const anchor=new T.Vector3(x,0,z).addScaledVector(along,1.55);
      const [,,aw,ah]=atlas.regions[id];
      const material=new T.MeshBasicMaterial({
        map:atlasMap,transparent:true,depthWrite:false,toneMapped:false,opacity:0
      });
      material.onBeforeCompile=shader=>{
        shader.vertexShader='attribute vec2 pictureUV;\nvarying vec2 memoryUV;\n'
          +shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nmemoryUV=pictureUV;');
        shader.fragmentShader='varying vec2 memoryUV;\n'+shader.fragmentShader.replace('#include <map_fragment>',`
          #include <map_fragment>
          vec2 q=abs(memoryUV*2.-1.);
          float edge=pow(pow(q.x,4.)+pow(q.y,4.),.25);
          edge+=.025*sin(memoryUV.y*27.+memoryUV.x*9.)*smoothstep(.5,.85,edge);
          diffuseColor.a*=1.-smoothstep(.66,.98,edge);
          diffuseColor.rgb=mix(diffuseColor.rgb*vec3(.84,.90,1.),vec3(.034,.061,.086),.14+.32*edge);
        `);
      };
      const height=Math.min(2.9,4*ah/aw);
      const picture=new T.Mesh(photoGeometry(id,height*aw/ah,height),material);
      picture.position.copy(anchor).addScaledVector(across,3.72);
      picture.position.y=2.26;
      picture.visible=false;
      scene.add(picture);

      const light={value:.24};
      const lamp=new T.Group();
      lamp.position.copy(picture.position).addScaledVector(along,-.87);
      lamp.position.y=.58;
      lamp.scale.setScalar(.88);
      const shade=candlePaper(new T.MeshBasicMaterial({map:paperMap,side:T.DoubleSide,toneMapped:false}),light);
      lamp.add(reflected(new T.Mesh(shadeGeometry,shade)),reflected(new T.Mesh(hoopGeometry,bamboo)));
      const halo=reflected(new T.Sprite(softGlow(lanternGlow.clone())));
      halo.position.y=.31;halo.scale.setScalar(1.3);lamp.add(halo);
      scene.add(lamp);
      return {anchor,picture,light,lamp,halo,age:-1};
    });
    function updatePathMemories(dt){
      const p=camera.position;
      for(const memory of pathMemories){
        const {anchor,picture,light,lamp,halo}=memory;
        const distance=Math.hypot(p.x-anchor.x,p.z-anchor.z);
        if(arrival || distance>20)memory.age=-1;
        else if(memory.age>=0)memory.age=Math.min(memory.age+dt,8.3);
        else if(distance<13)memory.age=0;
        const reveal=T.MathUtils.smoothstep(memory.age,0,1.2)*(1-T.MathUtils.smoothstep(memory.age,6.7,8.3));
        picture.visible=reveal>.001;
        picture.material.opacity=.92*reveal;
        light.value=.24+.93*reveal;
        halo.material.opacity=.10+.29*reveal;
        lamp.position.y=.58+(reduced.matches?0:.08*reveal);
        if(picture.visible)picture.rotation.y=Math.atan2(p.x-picture.position.x,p.z-picture.position.z);
      }
    }
    function frameBorder(w,h,profile,miter=0){
      const positions=[],grain=[],picture=[];
      const corners=[[-1,-1],[1,-1],[1,1],[-1,1]];
      for(let side=0;side<4;side++){
        const [sx,sy]=corners[side],[ex,ey]=corners[(side+1)%4];
        const horizontal=sy===ey;
        const rings=profile.map(([margin,depth])=>{
          const x=w/2+margin,y=h/2+margin;
          const a=[sx*x+(ex-sx)*miter/2,sy*y+(ey-sy)*miter/2,depth];
          const b=[ex*x-(ex-sx)*miter/2,ey*y-(ey-sy)*miter/2,depth];
          return [a,b,margin];
        });
        for(let i=0;i<rings.length;i++){
          const [a,b,outer]=rings[i],[c,d,inner]=rings[(i+1)%rings.length];
          for(const [point,margin] of [[a,outer],[b,outer],[d,inner],[a,outer],[d,inner],[c,inner]]){
            positions.push(...point);
            grain.push((margin+point[2]*.24)*6.9+side*.29,(horizontal?point[0]:point[1])*.77+side*.37);
            picture.push(point[0]/w+.5,point[1]/h+.5);
          }
        }
      }
      const geometry=new T.BufferGeometry();
      geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));
      geometry.setAttribute('uv',new T.Float32BufferAttribute(grain,2));
      geometry.setAttribute('pictureUV',new T.Float32BufferAttribute(picture,2));
      geometry.computeVertexNormals();
      return geometry;
    }
    const oakProfile=[
      [.207,-.066],[.210,-.056],[.210,.077],[.202,.097],[.190,.102],
      [.118,.102],[.109,.090],[.105,.074],[.105,.032],[.129,-.066]
    ];
    const paperProfile=[[.130,.018],[.130,.061],[.008,.061],[-.002,.041],[-.002,.026]];
    const pictureTube=new T.CylinderGeometry(.5,.5,1,24);
    const pictureArm=new T.TubeGeometry(new T.CatmullRomCurve3([
      new T.Vector3(0,-.031,-.091),new T.Vector3(0,.054,-.019),
      new T.Vector3(0,.103,.101),new T.Vector3(0,.056,.188),new T.Vector3(0,.010,.205)
    ]),18,.013,8,false);
    const roomSignGeometry=new T.PlaneGeometry(2.8,.44);
    function roomSigns(room,y,headerFaceOffset){
      const c=document.createElement('canvas');c.width=768;c.height=120;
      const ctx=c.getContext('2d');ctx.fillStyle='#182c37';ctx.fillRect(0,0,768,120);
      ctx.strokeStyle='#a38962';ctx.lineWidth=3;ctx.strokeRect(6,6,756,108);
      ctx.fillStyle='#f5ddb3';ctx.font='italic 68px Georgia';ctx.textAlign='center';
      ctx.fillText(room.name,384,83);
      const texture=new T.CanvasTexture(c);texture.encoding=T.sRGBEncoding;
      const material=new T.MeshBasicMaterial({map:texture});
      const backing=.034;
      for(const side of [-1,1]){
        const headerFace=room.z+side*headerFaceOffset;
        batch(trim,darkTimber,room.x,y,headerFace+side*(backing/2-.002),2.829,.464,backing);
        const sign=new T.Mesh(roomSignGeometry,material);
        sign.position.set(room.x,y,headerFace+side*backing);
        sign.rotation.y=side<0?Math.PI:0;
        scene.add(reflected(sign));
      }
    }
    rooms.forEach((room,r)=>{
      const {x,z,width:w,depth:d}=room,h=galleryHeights[r];
      const wallReach=w/2-pavilionInset,entryReach=d/2-pavilionInset;
      const headerBottom=h-.102,headerHeight=.265,headerDepth=.33;
      const headerCenter=headerBottom+headerHeight/2;
      const hasEntryLattice=r===1 || r===3;
      const roof=r===1 || r===3?cedar:blueTiles;
      galleryRoof(room,h,profiles[r],roof,roofOverhangs[r]);
      deck(x,z,w,d,.218,true);
      for(const side of [-1,1]){
        const wallX=x+side*wallReach;
        const rimX=x+side*(w/2-.09);
        batch(trim,darkTimber,rimX,-.115,z,.17,.22,d-.04);
        for(const dz of [-d/2+.58,0,d/2-.58])deckPile(x+side*(w/2-.31),z+dz);
        batch(poolGeo,contact,wallX-side*.17,.007,z,.44,1,entryReach*2);
        batch(ceilingTimber,crossTimber,wallX,headerCenter,z,.28,headerHeight,entryReach*2-headerDepth);
        const uprights=r===2?[-entryReach,-d/4,d/4,entryReach]:[-entryReach,0,entryReach];
        for(let i=1;i<uprights.length;i++){
          const from=z+uprights[i-1],to=z+uprights[i];
          stoneWall(false,wallX,from,to);
        }
        for(const dz of uprights){
          galleryPost(wallX,z+dz,.29,.28,h);
          batch(beam,darkTimber,wallX,h-.19,z+dz,.41,.17,.40);
        }
        for(const dz of [-entryReach,entryReach]){
          const wing=wallReach-1.65;
          const wingX=x+side*(1.65+wing/2);
          const post=x+side*1.65;
          stoneWall(true,z+dz,Math.min(post,wallX),Math.max(post,wallX),r===4 && dz<0?gateLedge:edge);
          galleryPost(post,z+dz,.25,.27,h);
          batch(trim,postBand,post,h-.30,z+dz,.30,.078,.31);
          batch(poolGeo,contact,wingX,.008,z+dz-Math.sign(dz)*.141,wing,1,.42);
          // Extend both ends past the bearing faces so they seat in the post and header.
          const behindLattice=hasEntryLattice && dz>0;
          const braceZ=z+dz+(behindLattice?.070:0),braceDepth=behindLattice?.124:.166;
          const rise=.58,run=.51;
          const braceStartX=post+side*.045,braceStartY=headerBottom+.07-rise;
          batch(braceTimber,rafterTimber,braceStartX+side*run/2,braceStartY+rise/2,braceZ,
            Math.hypot(run,rise),.122,braceDepth,0,side*Math.atan2(rise,run));
          const front=Math.sign(dz);
          for(const face of [front,-front]){
            const braceFace=braceZ+face*braceDepth/2;
            for(const t of [.24,.77])carpenterPeg(braceStartX+side*t*run,braceStartY+t*rise,braceFace,face,.023);
            const headerFace=z+dz+face*headerDepth/2;
            for(const junction of [post,wallX]){
              carpenterPeg(junction,headerCenter+.047,headerFace,face,.030);
              carpenterPeg(junction,headerCenter-.046,headerFace,face,.030);
            }
          }
        }
      }
      for(const dz of [-entryReach,entryReach]){
        batch(ceilingTimber,crossTimber,x,headerCenter,z+dz,headerDepth,headerHeight,wallReach*2+.28,Math.PI/2);
        lantern(x-1.22,h-.85,z+dz,.67,true,h+.48,headerBottom);
        lantern(x+1.22,h-.85,z+dz,.67,true,h+.48,headerBottom);
      }
      if(r===4){
        const ring=moonGateGeometry(),dowel=new T.CylinderGeometry(.5,.5,1,16);
        for(const side of [-1,1]){
          addMoonGate(x+side*(wallReach+1.65)/2,z-entryReach,ring,dowel);
        }
      }else if(hasEntryLattice){
        for(const side of [-1,1]){
          const wz=z+entryReach-.046,wing=wallReach-1.65;
          const count=r===1?7:4;
          const sill=r===1?h-.76:1.75;
          const slatHigh=headerBottom+.037,slatLow=sill+.043;
          for(let i=1;i<=count;i++)
            batch(latticeTimber,slatWood,x+side*(1.65+i*wing/(count+1)),
              (slatHigh+slatLow)/2,wz,.056,slatHigh-slatLow,.070);
          const sillStart=1.65+.095,sillEnd=wallReach-.115;
          batch(ceilingTimber,crossTimber,x+side*(sillStart+sillEnd)/2,sill,wz,.105,.119,sillEnd-sillStart,Math.PI/2);
          for(const at of [sillStart+.081,sillEnd-.081]){
            carpenterPeg(x+side*at,sill,wz-.0525,-1,.026);
            carpenterPeg(x+side*at,sill,wz+.0525,1,.026);
          }
        }
      }
      roomSigns(room,headerCenter,entryReach+headerDepth/2);
      room.photos.forEach((id,j)=>{
        const side=j%2?1:-1, count=Math.ceil((room.photos.length-(side===1?1:0))/2);
        const pz=z+d/2-(Math.floor(j/2)+.5)*d/count, px=x+side*(w/2-.39);
        const angle=-side*Math.PI/2,[,,aw,ah]=atlas.regions[id];
        const ph=Math.min(1.72,2.48*ah/aw),pw=ph*aw/ah,mid=1.86;
        const backingX=px+.14*side;
        batch(beam,darkTimber,backingX,mid,pz,pw+.42,ph+.42,.16,angle);
        for(const [profile,material,miter] of [[oakProfile,frameOak,.0018],[paperProfile,linen,0]]){
          const border=new T.Mesh(frameBorder(pw,ph,profile,miter),material);
          border.position.set(px,mid,pz);border.rotation.y=angle;
          scene.add(reflected(border));
        }
        for(const sign of [-1,1]){
          bounceBox(frameOak,px-.018*side,mid+sign*(ph/2+.157),pz,pw+.42,.105,.168,angle);
          bounceBox(frameOak,px-.018*side,mid,pz+sign*(pw/2+.157),.105,ph+.21,.168,angle);
        }
        blockWalking(px+.058*side,pz,.322,pw+.42);
        const wallX=x+side*wallReach,base=wallCapTop,frameBottom=mid-(ph+.42)/2;
        const hangerTop=frameBottom+.27;
        // Seat the arms in the rear timber and the uprights behind it.
        const armSeat=backingX-.035*side,armEnd=wallX+.030*side;
        batch(trim,pictureMetal,px+.216*side,mid,pz,.105,ph*.72,pw*.79);
        for(const dz of [-pw*.32,pw*.32]){
          batch(trim,pictureMetal,wallX,base+.018,pz+dz,.20,.039,.15);
          batch(trim,pictureMetal,wallX,(base+hangerTop)/2,pz+dz,.079,hangerTop-base,.088);
          batch(trim,pictureMetal,(armSeat+armEnd)/2,hangerTop,pz+dz,Math.abs(armEnd-armSeat),.070,.108);
          batch(trim,frameScrew,px-.104*side,frameBottom+.035,pz+dz,.023,.114,.072);
          batch(pictureTube,frameScrew,px-.12*side,frameBottom+.068,pz+dz,.015,.009,.015,0,Math.PI/2);
        }
        for(const dx of [-1,1])for(const dy of [-1,1]){
          batch(pictureTube,frameScrew,px-.106*side,mid+dy*(ph/2+.157),pz+dx*(pw/2+.171),
            .015,.008,.015,0,Math.PI/2);
        }
        const pictureX=px-.207*side,pictureY=mid+ph/2+.272;
        const lightWidth=Math.min(.92,pw*.59);
        batch(pictureTube,pictureBrass,pictureX,pictureY,pz,.090,lightWidth,.090,Math.PI/2,Math.PI/2);
        for(const dz of [-lightWidth/2,lightWidth/2]){
          batch(pictureTube,pictureBrass,pictureX,pictureY,pz+dz,.103,.021,.103,Math.PI/2,Math.PI/2);
        }
        batch(trim,pictureBulb,pictureX+side*.005,pictureY-.046,pz,.046,.012,lightWidth-.045);
        batch(pictureArm,pictureBrass,px,pictureY,pz,1,1,1,angle);
        batch(trim,frameScrew,px+.083*side,pictureY-.018,pz,.038,.130,.082);
        const pic=new T.Mesh(photoGeometry(id,pw,ph),photoMat);
        pic.position.set(px-.037*side,mid,pz);pic.rotation.y=angle;pic.userData.index=stations.length;
        scene.add(reflected(pic));portraits.push(pic);stations.push({x:px-side*3.55,z:pz,angle,room,width:pw});
        const lampX=px-side*.54,lampZ=pz+pw/2+.38;
        const glass=new T.Mesh(new T.PlaneGeometry(pw+.216,ph+.216),pictureGlass);
        glass.position.set(px-.073*side,mid,pz);
        glass.rotation.y=angle;
        glazedFrames.push({glass,side});
        scene.add(glass);
        batch(braceTimber,rafterTimber,(wallX+lampX)*.5,h-.045,lampZ,.94,.098,.106);
        const lamp=lantern(lampX,2.45,lampZ,.54,true,h+.37,h-.094);
        if(j===1)shadowLamps[r]=lamp;
      });
    });
    function deckEdgeBoards(start,finish,normal,thickness,width,offset=0){
      const spans=Math.ceil(Math.hypot(finish.x-start.x,finish.z-start.z)/3.7);
      let from=start;
      for(let i=1;i<=spans;i++){
        const t=i/spans;
        const to=i===spans?finish:{
          x:T.MathUtils.lerp(start.x,finish.x,t),z:T.MathUtils.lerp(start.z,finish.z,t),...normal
        };
        bridgeStrip(walkwayTrim,from,to,-thickness/2,thickness,width,offset,normal,'border');
        from=to;
      }
    }
    function bridgeCut(bridge,distance,{nx,nz}=bridge.normal){
      // Preserve the side lines when cutting a square threshold or a miter.
      const t=distance/bridge.length;
      return {
        x:T.MathUtils.lerp(bridge.sx,bridge.x,t),z:T.MathUtils.lerp(bridge.sz,bridge.z,t),
        nx,nz
      };
    }
    function bridgeStrip(material,start,finish,y,height,width,offset,normal,grain){
      const [sx,sz]=bridgePoint(start,finish,0,offset);
      const [ex,ez]=bridgePoint(start,finish,1,offset);
      const length=Math.hypot(ex-sx,ez-sz);
      bounceBox(material,(sx+ex)*.5,y,(sz+ez)*.5,width,height,length,
        Math.atan2(ex-sx,ez-sz));
      if(!stripBatches.has(material))stripBatches.set(material,{positions:[],uvs:[],indices:[],acrossDeck:[],trimDimensions:[]});
      const {positions,uvs,indices,acrossDeck,trimDimensions}=stripBatches.get(material);
      const base=positions.length/3;
      const border=grain==='border';
      const isTrim=material===headerPlank || material===walkwayTrim;
      const miterHalf=grain==='miter-start' || grain==='miter-end';
      const miterScale=Math.hypot(start.nx,start.nz);
      for(let v=0;v<boxPositions.count;v++){
        const [x,z]=bridgePoint(start,finish,boxPositions.getZ(v)+.5,offset+boxPositions.getX(v)*width);
        positions.push(x,y+boxPositions.getY(v)*height,z);
        const along=boxPositions.getZ(v)+.5,across=boxPositions.getX(v)+.5;
        if(material===timber)acrossDeck.push(across);
        const run=(z-start.z)*normal.nx-(x-start.x)*normal.nz;
        if(isTrim){
          const crossGrain=border?across:miterHalf?(along+(grain==='miter-start'?1:0))*.5:along;
          const alongGrain=border?along:across;
          if(v>=8 && v<16)uvs.push(crossGrain,alongGrain);
          else uvs.push(boxPositions.getY(v)+.5,v<8?along:across);
          trimDimensions.push(border?width:length/miterScale*(miterHalf?2:1),border?length:width*miterScale);
        }
        else if(v<8)uvs.push(along,boxUVs.getY(v));
        // Measure in world units so the miter trims the end boards cleanly.
        else if(v<16 && grain==='deck')uvs.push(across*width/plankLength,run/plankRepeatLength);
        else if(v<16)uvs.push(across,along);
        else uvs.push(boxUVs.getX(v),boxUVs.getY(v));
      }
      for(const index of cube.index.array)indices.push(base+index);
    }
    const railBands=[
      {material:lowerRail,height:.36,thickness:.061,width:.082},
      {material:railWood,height:.70,thickness:.115,width:.125}
    ];
    const postWidth=.23,postHeight=.87,faceRadius=.079,socketDepth=.030;
    const railSeatInset=faceRadius-socketDepth+.005;
    const railPosts=new Map(),postGeometries=new Map();
    function railPostAt(x,z,angle,anchor=null){
      const key=Math.round(x*1e6)+','+Math.round(z*1e6);
      if(!railPosts.has(key))railPosts.set(key,{x,z,angle,anchor,ends:[]});
      return railPosts.get(key);
    }
    function galleryAtThreshold(point){
      return rooms.find(room=>Math.abs(point.x-room.x)<1e-6
        && Math.abs(Math.abs(point.z-room.z)-room.depth/2)<1e-6);
    }
    function galleryRailPost(room,threshold,side,angle,postOffset){
      const x=room.x+side*1.65;
      const z=room.z+Math.sign(threshold.z-room.z)*(room.depth/2-pavilionInset);
      return railPostAt(room.x+side*postOffset,z,angle,{x,side});
    }
    function railPostFitting(outline,layers){
      const miters=outline.map((point,i)=>{
        const before=outline[(i+outline.length-1)%outline.length],after=outline[(i+1)%outline.length];
        const first=new T.Vector2(before.y-point.y,point.x-before.x).normalize();
        const second=new T.Vector2(point.y-after.y,after.x-point.x).normalize();
        const scale=1/(1+first.dot(second));
        return first.add(second).multiplyScalar(scale);
      });
      const rings=layers.map(([y,offset])=>outline.map((point,i)=>{
        const out=point.clone().addScaledVector(miters[i],offset);
        return [out.x,y-.5,out.y];
      }));
      const corners=rings.flat();
      const width=2*Math.max(...corners.map(([x])=>Math.abs(x)));
      const depth=2*Math.max(...corners.map(([, ,z])=>Math.abs(z)));
      const positions=[];
      function triangle(...vertices){
        for(const [x,y,z] of vertices)positions.push(x/width,y,z/depth);
      }
      for(let ring=1;ring<rings.length;ring++)for(let i=0;i<outline.length;i++){
        const next=(i+1)%outline.length,low=rings[ring-1],high=rings[ring];
        triangle(low[i],low[next],high[next]);
        triangle(low[i],high[next],high[i]);
      }
      const bottom=rings[0],upper=rings[rings.length-1];
      for(let i=0;i<outline.length;i++){
        const next=(i+1)%outline.length;
        triangle([0,-.5,0],bottom[next],bottom[i]);
        triangle([0,.5,0],upper[i],upper[next]);
      }
      const geometry=new T.BufferGeometry();
      geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));
      geometry.computeVertexNormals();
      return {geometry,width,depth};
    }
    function mortisedPost(post){
      const cosine=Math.cos(post.angle),sine=Math.sin(post.angle);
      let front,back;
      for(const [x,z] of post.ends){
        const local=new T.Vector2(cosine*x-sine*z,sine*x+cosine*z);
        if(local.y>0)front=local;else back=local;
      }
      const frontOpen=Boolean(front),backOpen=Boolean(back);
      if(!front)front=back.clone().negate();
      if(!back)back=front.clone().negate();
      const key=[front.x,front.y,back.x,back.y].map(value=>value.toFixed(5)).join(',')+frontOpen+backOpen;
      if(postGeometries.has(key))return postGeometries.get(key);
      const faceCorners=direction=>{
        const center=direction.clone().multiplyScalar(faceRadius);
        const across=new T.Vector2(direction.y,-direction.x).multiplyScalar(.0845);
        return [center.clone().sub(across),center.clone().add(across)];
      };
      const corners=[...faceCorners(front),...faceCorners(back)];
      const edges=corners.map((corner,i)=>{
        const next=corners[(i+1)%4],cut=.004/corner.distanceTo(next);
        return [corner.clone().lerp(next,cut),next.clone().lerp(corner,cut)];
      });
      const positions=[],colors=[];
      function triangle(a,b,c,tint){
        for(const [x,y,z] of [a,b,c]){
          positions.push(x/postWidth,y/postHeight-.5,z/postWidth);
          colors.push(tint,tint,tint);
        }
      }
      function quad(a,b,c,d,tint=1){
        triangle(a,b,c,tint);triangle(a,c,d,tint);
      }
      function face(start,finish,bands){
        const across=finish.clone().sub(start),width=across.length();
        across.divideScalar(width);
        const point=(u,y,depth=0)=>[
          start.x+across.x*u+across.y*depth,y,start.y+across.y*u-across.x*depth
        ];
        const panel=(left,right,low,high)=>quad(point(left,low),point(right,low),point(right,high),point(left,high));
        let low=0;
        for(const rail of bands){
          const halfWidth=(rail.width+.013)/2,halfHeight=(rail.thickness+.014)/2;
          const left=width/2-halfWidth,right=width/2+halfWidth;
          const sill=rail.height-halfHeight,lintel=rail.height+halfHeight;
          panel(0,width,low,sill);
          panel(0,left,sill,lintel);
          panel(right,width,sill,lintel);
          const opening=(depth)=>[
            point(left,sill,depth),point(right,sill,depth),
            point(right,lintel,depth),point(left,lintel,depth)
          ];
          const rim=opening(0),inner=opening(socketDepth);
          for(let i=0;i<4;i++){
            const next=(i+1)%4;
            quad(rim[i],rim[next],inner[next],inner[i],.43);
          }
          quad(...inner,.26);
          low=lintel;
        }
        panel(0,width,low,postHeight);
      }
      edges.forEach(([start,finish],i)=>{
        const open=i===0?frontOpen:i===2?backOpen:false;
        face(start,finish,open?railBands:[]);
        face(finish,edges[(i+1)%4][0],[]);
      });
      const outline=edges.flat();
      outline.forEach((point,i)=>{
        const next=outline[(i+1)%outline.length];
        triangle([0,postHeight,0],[point.x,postHeight,point.y],[next.x,postHeight,next.y],1);
        triangle([0,0,0],[next.x,0,next.y],[point.x,0,point.y],1);
      });
      const geometry=new T.BufferGeometry();
      geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));
      geometry.setAttribute('color',new T.Float32BufferAttribute(colors,3));
      geometry.computeVertexNormals();
      const fittings={
        body:geometry,
        cap:railPostFitting(outline,[[0,.014],[.11,.022],[.78,.022],[1,.012]]),
        shoe:railPostFitting(outline,[[0,.017],[.085,.023],[.72,.023],[1,.009]])
      };
      postGeometries.set(key,fittings);
      return fittings;
    }
    function bridgeRail(from,to){
      const dx=to.x-from.x,dz=to.z-from.z;
      const length=Math.hypot(dx,dz),angle=Math.atan2(dx,dz);
      const direction=[dx/length,dz/length];
      from.ends.push(direction);
      to.ends.push(direction.map(value=>-value));
      for(const {material,height,thickness,width} of railBands){
        batch(handrailGeometry,material,(from.x+to.x)/2,height,(from.z+to.z)/2,
          width,thickness,length-2*railSeatInset,angle);
      }
      const lower=railBands[0],lip=faceRadius+.009;
      batch(handrailGeometry,railFoot,from.x+direction[0]*lip,lower.height,from.z+direction[1]*lip,
        lower.width+.010,lower.thickness+.009,.032,angle);
      batch(handrailGeometry,railFoot,to.x-direction[0]*lip,lower.height,to.z-direction[1]*lip,
        lower.width+.010,lower.thickness+.009,.032,angle);
    }
    for(const b of bridges){
      const {start,finish,length,width,normal,startsAtBend,endsAtBend}=b;
      const entranceDock=start.x===arrivalDock[0] && start.z===arrivalDock[1];
      const header=.205,miterHalf=.067,border=deckBorderWidth,railInset=.16;
      const innerWidth=width-2*border;
      const boardStart=bridgeCut(b,startsAtBend?miterHalf*Math.hypot(start.nx,start.nz):header,start);
      const boardFinish=bridgeCut(b,length-(endsAtBend?miterHalf*Math.hypot(finish.nx,finish.nz):header),finish);
      bridgeStrip(headerPlank,start,boardStart,-.13,.26,innerWidth,0,normal,startsAtBend?'miter-start':'threshold');
      bridgeStrip(headerPlank,boardFinish,finish,-.13,.26,innerWidth,0,normal,endsAtBend?'miter-end':'threshold');
      bridgeStrip(timber,boardStart,boardFinish,-.13,.26,innerWidth,0,normal,'deck');
      const railStart=startsAtBend?start:bridgeCut(b,railInset);
      const railFinish=endsAtBend?finish:bridgeCut(b,length-railInset);
      const startGallery=startsAtBend?null:galleryAtThreshold(start);
      const endGallery=endsAtBend?null:galleryAtThreshold(finish);
      const postOffset=width/2-.25;
      const railLength=side=>{
        const [sx,sz]=bridgePoint(railStart,railFinish,0,side*postOffset);
        const [ex,ez]=bridgePoint(railStart,railFinish,1,side*postOffset);
        return Math.hypot(ex-sx,ez-sz);
      };
      const spans=Math.ceil(Math.max(railLength(-1),railLength(1))/2.7);
      const postAngle=j=>{
        const cross=j===0?railStart:j===spans?railFinish:normal;
        return Math.atan2(-cross.nz,cross.nx);
      };
      for(const side of [-1,1]){
        const offset=side*(width/2-border/2);
        deckEdgeBoards(start,finish,normal,.26,border,offset);
        // The boarding side stays open alongside the moored boat.
        if(entranceDock && side===-1)continue;
        const postAt=j=>{
          const [x,z]=bridgePoint(railStart,railFinish,j/spans,side*postOffset);
          if(j===0 && startGallery)return galleryRailPost(startGallery,start,Math.sign(x-startGallery.x),postAngle(j),postOffset);
          if(j===spans && endGallery)return galleryRailPost(endGallery,finish,Math.sign(x-endGallery.x),postAngle(j),postOffset);
          return railPostAt(x,z,postAngle(j));
        };
        let previous=postAt(0);
        for(let j=1;j<=spans;j++){
          const next=postAt(j);
          bridgeRail(previous,next);
          previous=next;
        }
      }
      for(let j=startsAtBend?1:0;j<=spans;j++){
        const [cx,cz]=bridgePoint(railStart,railFinish,j/spans,0);
        batch(beam,darkTimber,cx,-.30,cz,width-.14,.16,.16,postAngle(j));
      }
      if(entranceDock){
        for(const side of [-1,1])for(const t of [.18,.66]){
          deckPile(...bridgePoint(start,finish,t,side*(width/2-.27)));
        }
      }
    }
    for(const post of railPosts.values()){
      const {x,z,anchor}=post;
      if(post.ends.length===2){
        const [a,b]=post.ends;
        const forward=a[0]*Math.sin(post.angle)+a[1]*Math.cos(post.angle)>0?a:b;
        const backward=forward===a?b:a;
        post.angle=Math.atan2(forward[0]-backward[0],forward[1]-backward[1]);
      }
      const {angle}=post;
      const {body,cap,shoe}=mortisedPost(post);
      const footprintX=Math.max(postWidth,cap.width,shoe.width),footprintZ=Math.max(postWidth,cap.depth,shoe.depth);
      const cosine=Math.abs(Math.cos(angle)),sine=Math.abs(Math.sin(angle));
      blockWalking(x,z,cosine*footprintX+sine*footprintZ,sine*footprintX+cosine*footprintZ);
      batch(body,plinth,x,postHeight/2,z,postWidth,postHeight,postWidth,angle);
      batch(shoe.geometry,railFoot,x,.050,z,shoe.width,.10,shoe.depth,angle);
      batch(cap.geometry,railCap,x,.877,z,cap.width,.064,cap.depth,angle);
      batch(poolGeo,postContact,x,.006,z,.31,1,.31,angle);
      if(anchor){
        const stoneFace=anchor.x-anchor.side*pierWidth/2;
        const from=x+anchor.side*.069,to=stoneFace+anchor.side*.012;
        batch(railingBlock,railFoot,(from+to)/2,.632,z,Math.abs(to-from),.075,.075);
        batch(railingBlock,railFoot,stoneFace-anchor.side*.005,.632,z,.022,.172,.126);
      }
    }
    lanternSpans.forEach(([[sx,sz],[x,z]],i)=>{
      if(sz>=-75)return;
      const length=Math.hypot(x-sx,z-sz),nx=(z-sz)/length,nz=(sx-x)/length;
      const cx=(x+sx)/2,cz=(z+sz)/2;
      lantern(cx+nx*2,.78,cz+nz*2,.83,true);
      if(i%2===0)lantern(cx-nx*3.5,1.86,cz-nz*3.5,.74,true);
    });
    for(const [material,{positions,uvs,indices,acrossDeck,trimDimensions}] of stripBatches){
      const geo=new T.BufferGeometry();
      geo.setIndex(indices);
      geo.setAttribute('position',new T.Float32BufferAttribute(positions,3));
      geo.setAttribute('uv',new T.Float32BufferAttribute(uvs,2));
      if(acrossDeck.length)geo.setAttribute('boardAcross',new T.Float32BufferAttribute(acrossDeck,1));
      if(trimDimensions.length)geo.setAttribute('trimDimensions',new T.Float32BufferAttribute(trimDimensions,2));
      geo.computeVertexNormals();
      scene.add(reflected(new T.Mesh(geo,material)));
    }
    deck(end[0],end[1],landingWidth,landingDepth,.34);
    for(const side of [-1,1]){
      batch(cube,stone,end[0]+side*3.14,.18,end[1],.25,.55,4.6);
      blockWalking(end[0]+side*3.14,end[1],.25,4.6);
      for(const dz of [-1.68,1.68])deckPile(end[0]+side*2.98,end[1]+dz);
      lantern(end[0]+side*3.10,1.06,end[1]-1.66,.96,true);
    }
    const rowboatMooring=new T.Vector3(cleat.x+.111,.218,cleat.z+.016);
    batch(trim,uprightCedar,cleat.x,.149,cleat.z,.194,.298,.194);
    batch(trim,railCap,cleat.x,.302,cleat.z,.23,.040,.23);
    blockWalking(cleat.x,cleat.z,.194,.194);
    const boatOak=(timberPaint || cedarMap).clone();
    boatOak.encoding=T.sRGBEncoding;
    boatOak.wrapS=boatOak.wrapT=T.MirroredRepeatWrapping;
    boatOak.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
    boatOak.needsUpdate=true;
    const boatPaint=new T.MeshStandardMaterial({
      map:boatOak,color:color('#516979'),roughness:.61
    });
    const boatInside=boatPaint.clone();
    boatInside.color.copy(color('#e3cdb8'));boatInside.roughness=.72;
    const boatWood=boatInside.clone();
    boatWood.color.copy(color('#edded0'));boatWood.roughness=.61;
    const boatPaddle=boatWood.clone();
    boatPaddle.color.copy(color('#fff5e7'));boatPaddle.roughness=.51;
    const boatFinishes=new Map([[boatPaint,'paint'],[boatInside,'strakes'],[boatWood,'fittings'],[boatPaddle,'fittings']]);
    const rowboat=new T.Group();
    rowboat.name='Entrance rowboat';
    const hullOutline=new T.CatmullRomCurve3([
      [0,.41,-1.66],[.31,.32,-1.27],[.54,.245,-.65],[.62,.224,.08],
      [.58,.234,.77],[.43,.294,1.39],[0,.303,1.49],
      [-.43,.294,1.39],[-.58,.234,.77],[-.62,.224,.08],[-.54,.245,-.65],[-.31,.32,-1.27]
    ].map(([x,y,z])=>new T.Vector3(x,y,z)),true);
    const hullSteps=56;
    const hullSection=[
      [.54,.80,0],[.73,.91,.14],[.91,.972,.46],[1,1,1],
      [.915,.975,.98],[.84,.94,.60],[.61,.82,.33]
    ];
    const hullPoints=hullOutline.getPoints(hullSteps);
    const hullPositions=[],hullUV=[],hullIndices=[];
    const hullCourse=[0,.19,.50,1,.98,.53,0];
    for(const [ring,[width,length,height]] of hullSection.entries()){
      for(const [i,edge] of hullPoints.entries()){
        const y=ring===hullSection.length-1?-.078:T.MathUtils.lerp(-.25,edge.y,height);
        hullPositions.push(edge.x*width,y,edge.z*length);
        hullUV.push(i/hullSteps,hullCourse[ring]);
      }
    }
    const hull=new T.BufferGeometry();
    for(let ring=0;ring<hullSection.length-1;ring++){
      const start=hullIndices.length;
      for(let i=0;i<hullSteps;i++){
        const a=ring*(hullSteps+1)+i,b=a+1,c=a+hullSteps+1,d=c+1;
        hullIndices.push(a,c,b,b,c,d);
      }
      hull.addGroup(start,hullIndices.length-start,ring<3?0:1);
    }
    for(const [ring,y,material] of [[0,-.25,0],[hullSection.length-1,-.078,1]]){
      const start=hullIndices.length,center=hullPositions.length/3;
      hullPositions.push(0,y,0);hullUV.push(.5,.5);
      for(let i=0;i<=hullSteps;i++){
        const edge=hullPoints[i],x=edge.x*hullSection[ring][0],z=edge.z*hullSection[ring][1];
        hullPositions.push(x,y,z);hullUV.push(.5+x,.5+z*.35);
        if(i>0)hullIndices.push(center,material?center+i+1:center+i,material?center+i:center+i+1);
      }
      hull.addGroup(start,hullIndices.length-start,material?2:0);
    }
    hull.setAttribute('position',new T.Float32BufferAttribute(hullPositions,3));
    hull.setAttribute('uv',new T.Float32BufferAttribute(hullUV,2));
    hull.setIndex(hullIndices);hull.computeVertexNormals();
    rowboat.add(reflected(new T.Mesh(hull,[boatPaint,boatInside,boatWood])));
    rowboat.add(reflected(new T.Mesh(new T.TubeGeometry(hullOutline,hullSteps,.024,8,true),boatWood)));
    function hullCrossing(z,ring){
      const stride=hullSteps+1;
      let x=0,y=0;
      for(let i=0;i<hullSteps;i++){
        const a=(ring*stride+i)*3,b=a+3,az=hullPositions[a+2],bz=hullPositions[b+2];
        if(az===bz || (z-az)*(z-bz)>0)continue;
        const t=(z-az)/(bz-az);
        const reach=T.MathUtils.lerp(hullPositions[a],hullPositions[b],t);
        if(reach<=x)continue;
        x=reach;y=T.MathUtils.lerp(hullPositions[a+1],hullPositions[b+1],t);
      }
      return [x,y];
    }
    function boatRib(z){
      const right=[4,5,6].map(ring=>hullCrossing(z,ring));
      const contour=[...right,[0,-.078],...right.slice().reverse().map(([x,y])=>[-x,y])];
      const shape=new T.Shape();
      contour.forEach(([x,y],i)=>{
        if(i===0)shape.moveTo(x+.003,y-.018);
        else shape.lineTo(x*1.01,y-.015);
      });
      for(const [x,y] of contour.slice().reverse())shape.lineTo(x*.943,y+.027);
      shape.closePath();
      const rib=new T.Mesh(new T.ExtrudeGeometry(shape,{
        depth:.035,bevelEnabled:true,bevelSize:.0035,bevelThickness:.0035,bevelSegments:1
      }),boatWood);
      rib.position.z=z-.0175;
      rowboat.add(reflected(rib));
    }
    for(const z of [-1.16,-.85,-.54,-.22,.11,.45,.79,1.12])boatRib(z);
    function boatTimber(x,y,z,w,h,d){
      const timber=new T.Mesh(trim,boatWood);
      timber.position.set(x,y,z);timber.scale.set(w,h,d);
      rowboat.add(reflected(timber));
    }
    for(let i=-2;i<=2;i++){
      const length=2.18-Math.abs(i)*.24;
      boatTimber(i*.119,-.057,.045,.112,.025,length);
    }
    for(const z of [-.43,.69]){
      for(const offset of [-.064,.064])boatTimber(0,.115,z+offset,.97,.051,.122);
      for(const side of [-1,1])boatTimber(side*.426,.052,z,.075,.115,.21);
    }
    const paddleShape=new T.Shape();
    paddleShape.moveTo(-.023,.56);
    paddleShape.quadraticCurveTo(-.032,.69,-.066,.79);
    paddleShape.lineTo(-.072,1.02);
    paddleShape.quadraticCurveTo(0,1.044,.072,1.02);
    paddleShape.lineTo(.066,.79);
    paddleShape.quadraticCurveTo(.032,.69,.023,.56);
    paddleShape.closePath();
    const paddleGeometry=new T.ExtrudeGeometry(paddleShape,{
      depth:.014,bevelEnabled:true,bevelThickness:.004,bevelSize:.004,bevelSegments:2,curveSegments:8
    });
    paddleGeometry.translate(0,0,-.007).rotateX(Math.PI/2);
    const oarShaft=new T.CylinderGeometry(.021,.016,1.45,10);
    const lockZ=.11,[lockX,lockY]=hullCrossing(lockZ,3);
    const forkShape=new T.CatmullRomCurve3([
      [0,.064,-.052],[0,.035,-.046],[0,.018,-.027],[0,.012,0],
      [0,.018,.027],[0,.038,.046],[0,.070,.049]
    ].map(([x,y,z])=>new T.Vector3(x,y,z)));
    const oarlock=new T.TubeGeometry(forkShape,18,.008,7,false);
    const oarlockPin=new T.CylinderGeometry(.016,.019,.084,10);
    for(const side of [-1,1]){
      const fitting=new T.Mesh(oarlock,postBand);
      fitting.position.set(side*lockX,lockY+.036,lockZ);
      const socket=new T.Mesh(oarlockPin,postBand);
      socket.position.set(side*lockX,lockY,lockZ);
      rowboat.add(reflected(fitting),reflected(socket));
      const oar=new T.Group();
      oar.position.set(side*.15,.165,.045);oar.rotation.y=side*.14;
      const shaft=new T.Mesh(oarShaft,boatWood);
      shaft.rotation.x=Math.PI/2;
      const blade=new T.Mesh(paddleGeometry,boatPaddle);
      oar.add(reflected(shaft),reflected(blade));rowboat.add(oar);
    }
    scene.add(rowboat);
    const ropeFibre=painted(128,(ctx,n)=>{
      const pixels=ctx.createImageData(n,n);
      for(let y=0;y<n;y++)for(let x=0;x<n;x++){
        const u=x/n,v=y/n;
        const twist=.5+.5*Math.cos(fullTurn*(3*u-5*v+.015*Math.sin(9*fullTurn*v)));
        const grain=Math.sin(fullTurn*(25*u-42*v))*.057+Math.cos(fullTurn*(37*u+27*v))*.039;
        const light=.58+.34*Math.pow(twist,.64)+grain,i=(y*n+x)*4;
        pixels.data.set([214*light,184*light,139*light,255],i);
      }
      ctx.putImageData(pixels,0,0);
    });
    ropeFibre.wrapS=ropeFibre.wrapT=T.RepeatWrapping;
    ropeFibre.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
    const ropeMaterial=new T.MeshStandardMaterial({map:ropeFibre,bumpMap:ropeFibre,bumpScale:.0022,roughness:.86});
    function hempRope(path,radius,segments,closed=false){
      const geometry=new T.TubeGeometry(path,segments,radius,7,closed),uv=geometry.attributes.uv;
      const repeats=path.getLength()/.11;
      for(let i=0;i<uv.count;i++)uv.setXY(i,uv.getY(i),uv.getX(i)*repeats);
      return reflected(new T.Mesh(geometry,ropeMaterial));
    }
    const gunwaleCord=new T.CatmullRomCurve3(hullOutline.points.map(edge=>
      new T.Vector3(edge.x*1.041,edge.y+.015,edge.z*1.012)),true);
    rowboat.add(hempRope(gunwaleCord,.014,72,true));
    const coilPoints=Array.from({length:37},(_,i)=>{
      const t=i/36,angle=(t-1)*fullTurn*1.55;
      const x=Math.cos(angle),z=Math.sin(angle);
      const reach=.110/Math.max(Math.abs(x),Math.abs(z));
      return new T.Vector3(cleat.x+x*reach,.126+t*.081,cleat.z+z*reach);
    });
    coilPoints.push(rowboatMooring.clone());
    scene.add(hempRope(new T.CatmullRomCurve3(coilPoints),.012,64));
    const hitch=new T.CatmullRomCurve3([
      [0,0,0],[-.024,.024,.020],[-.034,.005,.052],[.003,-.017,.041],
      [.009,-.027,.011],[-.016,-.046,.017],[-.042,-.064,.026]
    ].map(([x,y,z])=>new T.Vector3(x,y,z).add(rowboatMooring)));
    scene.add(hempRope(hitch,.010,27));
    for(const spread of [-1,0,1]){
      const tail=hitch.points.at(-1).clone();
      const strand=new T.CatmullRomCurve3([tail,tail.clone().add(new T.Vector3(-.014,-.016,spread*.008)),
        tail.clone().add(new T.Vector3(-.027,-.032,spread*.014))]);
      scene.add(hempRope(strand,.0026,6));
    }
    const bowEye=new T.Mesh(new T.TorusGeometry(.023,.006,8,18),postBand);
    bowEye.position.set(0,.385,-1.60);rowboat.add(reflected(bowEye));
    const boatShadowAtlas=new T.WebGLRenderTarget(640,640,{
      minFilter:T.NearestFilter,magFilter:T.NearestFilter
    });
    const boatShadowInverse=new T.Matrix4();
    const boatShadowMatrices=Array.from({length:4},()=>new T.Matrix4());
    function bakeBoatShadows(){
      const target=renderer.getRenderTarget();
      const clear=renderer.getClearColor(new T.Color()).clone(),alpha=renderer.getClearAlpha();
      const shadowScene=new T.Scene();
      shadowScene.background=new T.Color(0xffffff);
      shadowScene.overrideMaterial=new T.MeshDepthMaterial({depthPacking:T.RGBADepthPacking,side:T.DoubleSide});
      shadowScene.add(rowboat.clone(true));
      const light=new T.OrthographicCamera(-1.85,1.85,1.85,-1.85,.1,10);
      const directions=[[-1.32,3.10,-2.50],[-1.68,3.8,.88],[1.65,3.7,.94],[.67,3.8,-1.28]];
      boatShadowAtlas.scissorTest=true;
      const tile=boatShadowAtlas.width/2;
      try{
        return directions.map(([x,y,z],i)=>{
          light.position.set(x,y,z).normalize().multiplyScalar(4.8);
          light.lookAt(0,0,0);light.updateMatrixWorld();
          boatShadowAtlas.viewport.set(i%2*tile,Math.floor(i/2)*tile,tile,tile);
          boatShadowAtlas.scissor.copy(boatShadowAtlas.viewport);
          renderer.setRenderTarget(boatShadowAtlas);
          renderer.render(shadowScene,light);
          return new T.Matrix4().multiplyMatrices(light.projectionMatrix,light.matrixWorldInverse);
        });
      }finally{
        renderer.setRenderTarget(target);
        renderer.setClearColor(clear,alpha);
        shadowScene.overrideMaterial.dispose();
      }
    }
    // The fittings are rigid relative to the boat. Render their depth once in
    // boat space, then move the projection with the hull as it rocks.
    const boatShadowCameras=bakeBoatShadows();
    const ropeSegments=12;
    const rope=new T.InstancedMesh(new T.CylinderGeometry(.012,.012,1,6),ropeMaterial,ropeSegments);
    rope.instanceMatrix.setUsage(T.DynamicDrawUsage);rope.frustumCulled=false;scene.add(reflected(rope));
    const ropePart=new T.Object3D(),ropePrevious=new T.Vector3(),ropeNext=new T.Vector3();
    const ropeEnd=new T.Vector3(),ropeAxis=new T.Vector3(),ropeUp=new T.Vector3(0,1,0);
    function updateRowboat(time){
      rowboat.position.set(boatBerth.x+.034*Math.sin(time*.61),
        waterLevel+.18+.036*Math.sin(time*1.37),boatBerth.z+.028*Math.cos(time*.81));
      rowboat.rotation.set(.022*Math.sin(time*1.05),.046+.022*Math.sin(time*.58),.046*Math.sin(time*1.17+.7));
      rowboat.updateMatrixWorld(true);
      boatShadowInverse.copy(rowboat.matrixWorld).invert();
      boatShadowMatrices.forEach((matrix,i)=>matrix.multiplyMatrices(boatShadowCameras[i],boatShadowInverse));
      boatWaterFrame.value.set(rowboat.position.x,rowboat.position.z,Math.cos(rowboat.rotation.y),-Math.sin(rowboat.rotation.y));
      ropeEnd.copy(bowEye.position).applyMatrix4(rowboat.matrixWorld);
      ropePrevious.copy(rowboatMooring);
      for(let i=0;i<ropeSegments;i++){
        const t=(i+1)/ropeSegments;
        ropeNext.lerpVectors(rowboatMooring,ropeEnd,t);
        ropeNext.y-=.12*Math.sin(t*Math.PI);
        ropePart.position.lerpVectors(ropePrevious,ropeNext,.5);
        ropeAxis.subVectors(ropeNext,ropePrevious);
        ropePart.scale.set(1,ropeAxis.length()+.004,1);
        ropePart.quaternion.setFromUnitVectors(ropeUp,ropeAxis.normalize());
        ropePart.updateMatrix();rope.setMatrixAt(i,ropePart.matrix);
        ropePrevious.copy(ropeNext);
      }
      rope.instanceMatrix.needsUpdate=true;
    }
    for(const {geometry,material,matrices} of batches.values()){
      const objects=new T.InstancedMesh(geometry,material,matrices.length);
      matrices.forEach((m,i)=>objects.setMatrixAt(i,m));objects.frustumCulled=false;scene.add(reflected(objects));
    }

    function planLanternFlight(lamp,origin,drift,sway,drop){
      const {x,y,z}=origin;
      // Clear the whole swept envelope, including the paper rim when it tilts.
      const radius=.34*lamp.size+.08;
      const bottom=y-drop-.04*lamp.size;
      const saveFlight=(x,y,drift,sway)=>{
        const center=new T.Vector3(x,y,z);
        lamp.x=x;lamp.y=y;lamp.z=z;
        lamp.flight={center,drift,sway};
      };
      const waterLane=(drift,sway)=>{
        const [west,east]=riverShore.channelBounds(z,radius+Math.abs(drift.z)+Math.abs(sway.z));
        const margin=3.05+radius+Math.abs(drift.x)+Math.abs(sway.x);
        return [west+margin,east-margin];
      };
      for(const scale of [1,.72,.45,.20]){
        const scaledDrift=drift.clone().multiplyScalar(scale),scaledSway=sway.clone().multiplyScalar(scale);
        const [west,east]=waterLane(scaledDrift,scaledSway);
        const home=T.MathUtils.clamp(x,west,east);
        for(let distance=0;distance<=Math.max(home-west,east-home)+.65;distance+=.65){
          for(const candidate of [home-distance,home+distance]){
            if(candidate<west || candidate>east)continue;
            if(riverShore.clearLanternFlight(candidate,z,radius,scaledDrift,scaledSway,bottom,lanternRoofs)){
              saveFlight(candidate,y,scaledDrift,scaledSway);
              return;
            }
          }
        }
      }
      const [west,east]=waterLane(drift,sway);
      const aboveRoofs=Math.max(...lanternRoofs.map(roof=>roof.top))+.20+drop;
      saveFlight(T.MathUtils.clamp(x,west,east),Math.max(y,aboveRoofs),drift,sway);
    }

    // Lower lanterns drift beside the walk, close enough to watch their
    // reflections travel across the water from both banks of the boardwalk.
    lanternSpans.forEach(([[sx,sz],[ex,ez]],i)=>{
      const side=i%2===0?1:-1;
      const x=(sx+ex)/2,z=(sz+ez)/2;
      const lamp=lantern(x+side*7.4,1.65+(i%3)*.40,z,.81+(i%4)*.075);
      const galleryCrossings=rooms.length-1;
      if(i<galleryCrossings || (i-galleryCrossings)%2===0){
        const first=bridges.findIndex(b=>b.sx===sx && b.sz===sz);
        const span=bridges[first+(i<galleryCrossings?1:0)];
        const along=new T.Vector3(span.x-span.sx,0,span.z-span.sz).normalize();
        const outward=new T.Vector3(-along.z,0,along.x).multiplyScalar(side);
        const center=new T.Vector3(span.sx,1.38-.31*lamp.size,span.sz)
          .addScaledVector(along,span.length*.48).addScaledVector(outward,2.38);
        planLanternFlight(lamp,center,outward.clone().multiplyScalar(.24),along.clone().multiplyScalar(-1.18),.13);
        const axis=outward.clone().multiplyScalar(-.82).addScaledVector(along,.10);
        axis.y=-.55;axis.normalize();
        const lightCenter=lamp.flight.center.clone();lightCenter.y+=.31*lamp.size;
        lamp.movingPath={center:lightCenter,axis,phase:i*.53};
        if(movingValues)movingLanterns.push(lamp);
      }
      if(i%3===0)lantern(x-side*6.8,3.4,z-2.4,.87);
    });
    // Individual nearby lanterns show the bamboo hoops and translucent paper.
    for(let i=0;i<44;i++){
      const angle=fullTurn*(i+rand()*.7)/44,dist=14+rand()*15;
      lantern(Math.sin(angle)*dist,4+rand()*7,-Math.cos(angle)*dist,.55+rand()*1.12);
    }
    const fixtureDrift=new T.Vector3(.12,0,0),fixtureSway=new T.Vector3(0,0,.078);
    const floatingDrift=new T.Vector3(2.55,0,0),floatingSway=new T.Vector3(0,0,3.6);
    for(const lamp of lanterns){
      if(lamp.mountHeight || lamp.flight)continue;
      if(lamp.fixture)planLanternFlight(lamp,lamp,fixtureDrift,fixtureSway,.17);
      else planLanternFlight(lamp,lamp,floatingDrift,floatingSway,.83);
    }
    for(const {glass,side} of glazedFrames){
      const at=glass.position;
      const nearby=lanterns.filter(lamp=>(at.x-lamp.x)*side>.40)
        .map(lamp=>({lamp,distance:Math.hypot(at.x-lamp.x,at.y-lamp.y,at.z-lamp.z)}))
        .filter(({distance})=>distance<14).sort((a,b)=>a.distance-b.distance).slice(0,4);
      glass.onBeforeRender=()=>{
        pictureGlass.uniforms.galleryReflections.value.forEach((slot,i)=>{
          const lamp=nearby[i]?.lamp;
          if(lamp){
            const {x,y,z}=lamp.glow.position;
            slot.set(x,y,z,lamp.size);
          }else slot.set(0,0,0,0);
        });
        pictureGlass.uniformsNeedUpdate=true;
      };
    }
    const architectureMaterials=[stone,edge,bronze,plinth,linen,frameOak,photoMat,pictureMetal,pictureBrass,frameScrew,timber,blueTiles,
      cedar,uprightCedar,crossTimber,rafterTimber,slatWood,gateWood,gateLedge,timberSocket,ironPeg,postBand,lanternIron,walkwayTrim,headerPlank,
      railWood,lowerRail,railFoot,railCap,plaster,darkTimber,mortar,boatPaint,boatInside,boatWood,boatPaddle,ropeMaterial];
    if(supportsShadows)shadowValues=riverShadows.uniforms(T,rooms,shadowLamps,moonDirection.value);
    lightArchitecture(architectureMaterials);
    function architectureBoxes(){
      const boxes=bounceBoxes.slice();
      for(const {geometry,material,matrices} of batches.values()){
        if(!architectureMaterials.includes(material) || geometry.type==='TorusGeometry' || material===gateWood || material===lanternIron
          || geometry===pegGeometry || (material===railFoot && geometry===handrailGeometry))continue;
        for(const matrix of matrices)boxes.push({material,matrix});
      }
      return boxes;
    }
    const lanternMeshes=pieces.map(([geometry,material])=>{
      const group=new T.InstancedMesh(geometry,material,lanterns.length);
      group.frustumCulled=false;scene.add(reflected(group));return group;
    });
    lanterns.forEach((_,i)=>lanternMeshes[0].setColorAt(i,color(['#ffffff','#ffdcbb','#ffedc9','#ffd1ac'][i%4])));
    const hanging=lanterns.filter(lamp=>lamp.mountHeight>0);
    hanging.forEach((lamp,i)=>lamp.cordIndex=i);
    const rods=new T.InstancedMesh(new T.CylinderGeometry(.006,.006,1,10),lanternIron,hanging.length);
    const collars=new T.InstancedMesh(topHem,bamboo,hanging.length);
    for(const mesh of [rods,collars]){
      mesh.frustumCulled=false;
      scene.add(reflected(mesh));
    }
    const rod=new T.Object3D(),capCenter=new T.Vector3(),rodVector=new T.Vector3();
    const rodUp=new T.Vector3(0,1,0);
    const support=new T.Object3D(),localPart=new T.Object3D(),partMatrix=new T.Matrix4();
    function updateLanterns(time,benchmark=false){
      nightTime.value=reduced.matches && !benchmark?0:time;
      const t=nightTime.value;
      const breeze=shore.lanternDrift;
      bankLanterns.forEach(({x,y,z,size,phase,speed},i)=>{
        const rise=t*speed+phase,sway=t*speed*.72+phase*1.7;
        support.position.set(x+breeze.x*Math.sin(sway),y+breeze.y*Math.sin(rise),z+breeze.z*Math.cos(sway*.83));
        support.rotation.set(.045*Math.cos(rise),phase+.14*Math.sin(sway),.065*Math.sin(sway));
        support.scale.setScalar(size);support.updateMatrix();
        for(const mesh of bankMeshes)mesh.setMatrixAt(i,support.matrix);
      });
      for(const mesh of bankMeshes)mesh.instanceMatrix.needsUpdate=true;
      lanterns.forEach(({x,y,z,size,phase,glow,fixture,mountHeight,cordIndex,movingPath,flight},i)=>{
        const lift=Math.sin(t*.36+phase), drift=Math.sin(t*.21+phase*1.2);
        if(mountHeight){
          support.position.set(x+.057*drift,y+.024*lift,z+.034*Math.cos(t*.24+phase));
        }else{
          support.position.copy(flight.center);
          if(movingPath){
            const offset=movingPath.phase;
            support.position.addScaledVector(flight.drift,Math.sin(t*.54+offset))
              .addScaledVector(flight.sway,Math.sin(t*.62+offset));
            support.position.y+=.13*Math.sin(t*.88+offset);
          }else if(fixture){
            support.position.addScaledVector(flight.drift,drift)
              .addScaledVector(flight.sway,Math.cos(t*.24+phase));
            support.position.y+=.17*lift;
          }else{
            const angle=t*(.14+.014*(i%5))+phase;
            support.position.addScaledVector(flight.drift,Math.sin(angle))
              .addScaledVector(flight.sway,Math.cos(angle));
            support.position.y+=.73*Math.sin(angle-.65)+.10*lift;
          }
        }
        support.rotation.set(.04*lift,phase+.12*drift,.07*drift);
        support.scale.setScalar(size);support.updateMatrix();
        lanternMeshes.forEach((obj,j)=>{
          localPart.position.set(0,j===4?.088:0,0);localPart.rotation.set(0,j===3?Math.PI/2:0,0);
          localPart.updateMatrix();partMatrix.multiplyMatrices(support.matrix,localPart.matrix);
          obj.setMatrixAt(i,partMatrix);
        });
        if(mountHeight){
          capCenter.set(0,.676,0).applyMatrix4(support.matrix);
          rodVector.set(x,mountHeight-rodDrop,z).sub(capCenter);
          rod.position.copy(capCenter).addScaledVector(rodVector,.5);
          rod.scale.set(1,rodVector.length(),1);
          rod.quaternion.setFromUnitVectors(rodUp,rodVector.normalize());
          rod.updateMatrix();
          rods.setMatrixAt(cordIndex,rod.matrix);
          collars.setMatrixAt(cordIndex,support.matrix);
        }
        glow.position.set(support.position.x,support.position.y+.31*size,support.position.z);
        glow.scale.setScalar(size*(1.13+.037*lift));
      });
      lanternMeshes.forEach(obj=>obj.instanceMatrix.needsUpdate=true);
      rods.instanceMatrix.needsUpdate=true;
      collars.instanceMatrix.needsUpdate=true;
    }

    if(photoMaterials.finalePhoto){
      photoMaterials.finalePhoto.encoding=T.sRGBEncoding;
      photoUniforms.photograph.value=photoMaterials.finalePhoto;
      photoUniforms.photoRegion.value.set(0,0,1,1);
    }
    const lights=riverPortrait.lights;
    const formation=new T.Group();formation.visible=false;scene.add(formation);
    const skyWidth=13.5,skyHeight=skyWidth*riverPortrait.height/riverPortrait.width;
    const apparition=reflected(new T.Mesh(new T.PlaneGeometry(skyWidth,skyHeight),new T.ShaderMaterial({
      uniforms:{...photoUniforms,reveal:{value:0}},transparent:true,depthWrite:false,
      blending:T.AdditiveBlending,toneMapped:false,
      vertexShader:`varying vec2 coord;void main(){coord=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader:`${samplePortrait}
        uniform float reveal;varying vec2 coord;
        void main(){
          vec3 fur=furColor(coord);
          float light=dot(fur,vec3(.213,.715,.072));
          vec3 tint=mix(vec3(.46,.65,1.),vec3(1.,.86,.66),smoothstep(.09,.66,light));
          vec3 moonlit=mix(fur,tint*light,.47);
          float luminosity=.22+.78*smoothstep(.018,.46,light);
          gl_FragColor=vec4(moonlit*1.20,texture2D(furMask,coord).a*reveal*luminosity);
          #include <encodings_fragment>
        }`
    })));
    apparition.position.z=-.85;apparition.renderOrder=1;formation.add(apparition);
    const distantShade=new T.LatheGeometry(shadeProfile.getPoints(24),30);
    const shades=new T.InstancedMesh(distantShade,candlePaper(paper.clone()),lights.length);
    const hoops=new T.InstancedMesh(hoopGeometry,bamboo,lights.length);
    for(let i=0;i<lights.length;i++)shades.setColorAt(i,color(['#fff0d2','#e9af85','#ffdab8','#fff7de'][i%4]));
    const halos=new T.InstancedMesh(new T.PlaneGeometry(1,1),softGlow(new T.MeshBasicMaterial({
      map:glowMap,transparent:true,depthWrite:false,toneMapped:false,blending:T.AdditiveBlending,opacity:.45
    })),lights.length);
    halos.renderOrder=2;
    for(const mesh of [shades,hoops,halos]){
      mesh.frustumCulled=false;formation.add(reflected(mesh));
    }
    const starts=lights.map(()=>({x:rand()*9-4.5,y:rand()*1.2,z:rand()*3-1.5}));
    function showFinale(t){
      water.material.uniforms.portraitLight.value=T.MathUtils.smoothstep(t,0,2)*(1-T.MathUtils.smoothstep(t,8.5,12.5));
      formation.visible=t>=5.5;
      if(!formation.visible)return;
      const scale=Math.min(1.15,camera.aspect*1.65);
      const rise=reduced.matches?0:Math.min(5,Math.max(0,t-19)*.33);
      formation.scale.setScalar(scale);
      formation.position.set(ex,6.9+rise,ez-27);
      apparition.material.uniforms.reveal.value=.81*T.MathUtils.smoothstep(t,6.5,12);
      for(let i=0;i<lights.length;i++){
        const p=lights[i],from=starts[i],clock=reduced.matches?0:t;
        const settle=reduced.matches?1:T.MathUtils.smoothstep(t,5.5+p.phase*.19,11+p.phase*.32);
        const x=(p.x/riverPortrait.width-.5)*skyWidth+.07*Math.sin(clock*.33+p.phase);
        const y=(.5-p.y/riverPortrait.height)*skyHeight+.085*Math.cos(clock*.28+p.phase);
        matrix.position.set(T.MathUtils.lerp(from.x,x,settle),
          T.MathUtils.lerp((waterLevel-formation.position.y)/scale+from.y,y,settle),T.MathUtils.lerp(from.z,p.depth,settle));
        matrix.rotation.set(0,p.phase,.09*Math.sin(clock*.24+p.phase));
        matrix.scale.setScalar(p.size*T.MathUtils.smoothstep(t,5.5,7.4));
        matrix.updateMatrix();shades.setMatrixAt(i,matrix.matrix);hoops.setMatrixAt(i,matrix.matrix);
        matrix.position.y+=matrix.scale.x*.3;matrix.rotation.set(0,0,0);matrix.scale.multiplyScalar(1.52);
        matrix.updateMatrix();halos.setMatrixAt(i,matrix.matrix);
      }
      for(const mesh of [shades,hoops,halos])mesh.instanceMatrix.needsUpdate=true;
    }
    let yaw=0,pitch=0,drag=null,elapsed=-1,lastLocation=null;
    let hover=null;
    const caster=new T.Raycaster();
    const photoHits=[];
    const waterPlane=new T.Plane(new T.Vector3(0,1,0),-waterLevel);
    const poolHit=new T.Vector3();
    const canvas=renderer.domElement;
    canvas.setAttribute('aria-hidden','true');view.appendChild(canvas);
    // The opaque lanterns mark their pixels in alpha. Keeping capture and bloom
    // in linear light lets the lanterns glow while photos and moonlight stay sharp.
    const gl=renderer.getContext();
    const format=hdrType===T.HalfFloatType?gl.RGBA16F:gl.RGBA8;
    const sampleCounts=renderer.capabilities.isWebGL2
      ? (gl.getInternalformatParameter(gl.RENDERBUFFER,format,gl.SAMPLES)||[]):[];
    const samples=[2,4].find(count=>sampleCounts.includes(count));
    const film=samples
      ? new T.WebGLMultisampleRenderTarget(1,1,{type:hdrType})
      : new T.WebGLRenderTarget(1,1,{type:hdrType});
    if(samples)film.samples=samples;
    const glowNear=new T.WebGLRenderTarget(1,1,{type:hdrType,depthBuffer:false});
    const glowTemp=new T.WebGLRenderTarget(1,1,{type:hdrType,depthBuffer:false});
    const glowWide=new T.WebGLRenderTarget(1,1,{type:hdrType,depthBuffer:false});
    const screen=new T.Scene();
    const screenCamera=new T.OrthographicCamera(-1,1,1,-1,0,1);
    function screenMaterial(uniforms,fragmentShader){
      return new T.ShaderMaterial({
        uniforms,fragmentShader,depthTest:false,depthWrite:false,toneMapped:false,
        vertexShader:`varying vec2 screenUV;
          void main(){screenUV=uv;gl_Position=vec4(position.xy,0.,1.);}`
      });
    }
    const bloomThreshold=hdrType===T.HalfFloatType?.88:.64;
    const prefilter=screenMaterial({
      image:{value:film.texture},pixel:{value:new T.Vector2()},threshold:{value:bloomThreshold}
    },`uniform sampler2D image;uniform vec2 pixel;uniform float threshold;
        varying vec2 screenUV;
        vec3 emitter(vec2 uv){
          vec4 sampleColor=texture2D(image,uv);
          float emission=1.-smoothstep(.22,.90,sampleColor.a);
          float peak=max(sampleColor.r,max(sampleColor.g,sampleColor.b));
          return sampleColor.rgb*emission*smoothstep(threshold,threshold+.32,peak);
        }
        void main(){
          vec2 tap=pixel*1.4;
          vec3 glow=emitter(screenUV+tap)+emitter(screenUV-tap)
                   +emitter(screenUV+vec2(tap.x,-tap.y))+emitter(screenUV+vec2(-tap.x,tap.y));
          gl_FragColor=vec4(glow*.25,1.);
        }`);
    const soften=screenMaterial({
      image:{value:null},axis:{value:new T.Vector2()}
    },`uniform sampler2D image;uniform vec2 axis;varying vec2 screenUV;
        void main(){
          vec3 glow=texture2D(image,screenUV).rgb*.227027;
          glow+=.316216*(texture2D(image,screenUV+axis*1.384615).rgb
                        +texture2D(image,screenUV-axis*1.384615).rgb);
          glow+=.070270*(texture2D(image,screenUV+axis*3.230769).rgb
                        +texture2D(image,screenUV-axis*3.230769).rgb);
          gl_FragColor=vec4(glow,1.);
        }`);
    const combine=screenMaterial({
      image:{value:film.texture},bloom:{value:glowWide.texture},
      pixel:prefilter.uniforms.pixel,edgeBlend:{value:samples ? .74 : 1}
    },`uniform sampler2D image,bloom;uniform vec2 pixel;uniform float edgeBlend;
        varying vec2 screenUV;
        float filmNoise(vec2 p){return fract(52.9829189*fract(dot(p,vec2(.06711056,.00583715))));}
        float perceptualLuma(vec3 color){
          return sqrt(clamp(dot(color,vec3(.2126,.7152,.0722)),0.,1.));
        }
        vec3 antiAliasedScene(vec2 uv){
          vec3 center=texture2D(image,uv).rgb;
          float nw=perceptualLuma(texture2D(image,uv+pixel*vec2(-1.,1.)).rgb);
          float ne=perceptualLuma(texture2D(image,uv+pixel).rgb);
          float sw=perceptualLuma(texture2D(image,uv-pixel).rgb);
          float se=perceptualLuma(texture2D(image,uv+pixel*vec2(1.,-1.)).rgb);
          float mid=perceptualLuma(center);
          float low=min(mid,min(min(nw,ne),min(sw,se)));
          float high=max(mid,max(max(nw,ne),max(sw,se)));
          if(high-low<max(.018,.15*high))return center;
          // FXAA-style sampling follows the high-contrast edge, with a
          // luminance bound to retain narrow features against a dark sky.
          vec2 edge=vec2((sw+se)-(nw+ne),(nw+sw)-(ne+se));
          float reducer=max((nw+ne+sw+se)*.026,.0125);
          edge=clamp(edge/(min(abs(edge.x),abs(edge.y))+reducer),-4.,4.)*pixel;
          vec3 inner=.5*(texture2D(image,uv-edge/6.).rgb+texture2D(image,uv+edge/6.).rgb);
          vec3 outer=.5*inner+.25*(texture2D(image,uv-edge*.5).rgb+texture2D(image,uv+edge*.5).rgb);
          float sampled=perceptualLuma(outer);
          vec3 filtered=sampled<low || sampled>high?inner:outer;
          return mix(center,filtered,edgeBlend);
        }
        void main(){
          vec3 frame=antiAliasedScene(screenUV);
          vec3 glow=texture2D(bloom,screenUV).rgb;
          // Other surfaces have already passed through ACES. Roll off the
          // remaining HDR paper highlights gently before display encoding.
          float heat=max(frame.r,max(frame.g,frame.b));
          vec3 paper=frame/max(1.,heat);
          paper=mix(paper,vec3(1.,.92,.73),.28*smoothstep(1.,2.05,heat));
          vec3 color=mix(frame,paper,smoothstep(.96,1.35,heat)) + glow*.52;
          gl_FragColor=vec4(clamp(color,0.,1.),1.);
          #include <encodings_fragment>
          float noise=filmNoise(gl_FragCoord.xy)-filmNoise(gl_FragCoord.yx+31.37);
          gl_FragColor.rgb=clamp(gl_FragColor.rgb+noise/255.,0.,1.);
        }`);
    const screenQuad=new T.Mesh(new T.PlaneGeometry(2,2),prefilter);
    screenQuad.frustumCulled=false;
    screen.add(screenQuad);
    function drawPass(material,target){
      screenQuad.material=material;
      renderer.setRenderTarget(target);
      renderer.render(screen,screenCamera);
    }
    const shadowTextures=new Map();
    function loadShadowTexture(file,packedDepth=false){
      if(!shadowTextures.has(file)){
        const request=new T.TextureLoader().loadAsync(file).then(texture=>{
          if(packedDepth){
            texture.minFilter=texture.magFilter=T.NearestFilter;
            texture.generateMipmaps=false;
          }
          return texture;
        }).catch(error=>{
          shadowTextures.delete(file);
          throw error;
        });
        shadowTextures.set(file,request);
      }
      return shadowTextures.get(file);
    }
    let shadowSelection=0;
    async function changeShadows(redraw=true){
      const selection=++shadowSelection,mode=Number(shadowControl.value);
      shadowControl.setAttribute('aria-busy',String(mode>0));
      try{
        if(mode>0){
          const [mask,depth]=await Promise.all([
            loadShadowTexture('river-shadow-mask.png?v=weathered-mooring'),
            mode>1?loadShadowTexture('river-shadow-depth.png?v=weathered-mooring',true):null
          ]);
          if(selection!==shadowSelection)return;
          shadowValues.riverShadowMask.value=mask;
          shadowValues.riverShadowDepth.value=depth;
        }
        const shaderChanged=shadowVariant()!==shadowVariant(mode);
        shadowValues.riverShadowMode.value=mode;
        if(shaderChanged)for(const material of architectureMaterials)material.needsUpdate=true;
      }catch(error){
        if(selection===shadowSelection){
          console.warn('Cast shadows are unavailable:',error);
          shadowControl.value=String(shadowValues.riverShadowMode.value);
        }
      }finally{
        if(selection===shadowSelection){
          shadowControl.removeAttribute('aria-busy');
          if(redraw && dialog.open && !view.hidden)draw();
        }
      }
    }
    if(shadowValues){
      shadowControl.hidden=false;
      shadowControl.addEventListener('change',async ()=>{
        await changeShadows();
        saveGraphics(graphicsSettings());
      });
    }
    function setMovingActive(active){
      if(active===movingActive)return;
      movingActive=active;
      for(const material of architectureMaterials)material.needsUpdate=true;
    }
    function failMovingShadows(error){
      movingEnabled=false;
      setMovingActive(false);
      console.warn('Moving lantern shadows are unavailable:',error);
      movingButton.textContent='Moving shadows unavailable';
      movingButton.title=error.message;
      movingButton.setAttribute('aria-pressed','false');
      movingButton.disabled=true;
    }
    async function setMovingShadows(enabled,redraw=true){
      if(!movingLanterns.length || movingButton.disabled || enabled===movingEnabled)return;
      if(enabled && !movingEffect){
        try{
          const matrices=architectureBoxes().map(box=>box.matrix);
          movingEffect=riverShadows.createMoving(T,renderer,movingValues,matrices,screenMaterial,drawPass);
        }catch(error){
          failMovingShadows(error);
          return;
        }
      }
      movingEnabled=enabled;
      movingButton.setAttribute('aria-pressed',String(movingEnabled));
      movingButton.textContent='Moving shadows'+(movingEnabled?' on':' off');
      if(movingEnabled)setMovingActive(true);
      if(redraw && dialog.open && !view.hidden)draw();
    }
    if(movingLanterns.length){
      movingButton.hidden=false;
      movingButton.addEventListener('click',async ()=>{
        await setMovingShadows(!movingEnabled);
        saveGraphics(graphicsSettings());
      });
    }
    function setGI(enabled,redraw=true){
      if(!supportsGI || giButton.hidden || enabled===giUniforms.riverGIEnabled.value)return;
      if(enabled && !giEffect){
        try{
          giEffect=riverGI.create(T,renderer,architectureBoxes(),fixtures,giUniforms,screenMaterial,drawPass);
        }catch(error){
          console.warn('Ray-traced lighting is unavailable:',error);
          giButton.hidden=true;
          view.focus({preventScroll:true});
          return;
        }
      }
      giUniforms.riverGIEnabled.value=enabled;
      giButton.setAttribute('aria-pressed',String(enabled));
      giButton.textContent=enabled?'RTGI on':'RTGI off';
      if(redraw)draw();
    }
    if(supportsGI){
      giButton.hidden=false;
      giButton.addEventListener('click',()=>{
        setGI(!giUniforms.riverGIEnabled.value);
        saveGraphics(graphicsSettings());
      });
    }
    function drawWithBloom(){
      lightHeight.value=film.height;
      renderer.setRenderTarget(film);
      renderer.render(scene,camera);
      drawPass(prefilter,glowNear);
      soften.uniforms.image.value=glowNear.texture;
      soften.uniforms.axis.value.set(1.64/glowNear.width,0);
      drawPass(soften,glowTemp);
      soften.uniforms.image.value=glowTemp.texture;
      soften.uniforms.axis.value.set(0,1.64/glowTemp.height);
      drawPass(soften,glowWide);
      drawPass(combine,null);
    }
    function draw(){
      if(!ready)return;
      if(giUniforms?.riverGIEnabled.value)giEffect.update(nightTime.value);
      if(movingActive){
        const nearby=movingEnabled?movingLanterns.map(lamp=>{
          const distance=camera.position.distanceTo(lamp.movingPath.center);
          const visibility=1-T.MathUtils.smoothstep(distance,15,22);
          const power=visibility*(.96+.04*Math.sin(nightTime.value*3.2+lamp.movingPath.phase));
          return {lamp,distance,power};
        }).filter(light=>light.power>0):[];
        try{
          const occupied=movingEffect.update(performance.now()*.001,nearby);
          if(!movingEnabled && !occupied)setMovingActive(false);
        }
        catch(error){
          failMovingShadows(error);
          updateLanterns(nightTime.value);
        }
      }
      sky.position.set(camera.position.x,0,camera.position.z);
      camera.updateMatrixWorld();
      if(hover)updatePhotoCursor();
      camera.getWorldDirection(gaze);gaze.y=-gaze.y;
      mirror.position.copy(camera.position);mirror.position.y=2*waterLevel-camera.position.y;
      mirror.lookAt(gaze.add(mirror.position));mirror.updateMatrixWorld();
      mirror.projectionMatrix.copy(camera.projectionMatrix);
      reflectionMatrix.multiplyMatrices(mirror.projectionMatrix,mirror.matrixWorldInverse);
      lightHeight.value=reflection.height;
      renderer.clippingPlanes=reflectionClip;
      renderer.setRenderTarget(reflection);
      renderer.render(scene,mirror);
      renderer.clippingPlanes=[];
      drawWithBloom();
    }
    function resize(redraw=true){
      const w=view.clientWidth,h=view.clientHeight;
      if(!w||!h)return;
      poolView.fov=Math.min(27,48*w/h);
      poolView.updateProjectionMatrix();
      poolMatrix.multiplyMatrices(poolView.projectionMatrix,poolView.matrixWorldInverse);
      renderer.setSize(w,h,false);
      film.setSize(canvas.width,canvas.height);
      prefilter.uniforms.pixel.value.set(1/film.width,1/film.height);
      const bloomWidth=Math.max(1,Math.floor(film.width/4)),bloomHeight=Math.max(1,Math.floor(film.height/4));
      glowNear.setSize(bloomWidth,bloomHeight);
      glowTemp.setSize(bloomWidth,bloomHeight);
      glowWide.setSize(bloomWidth,bloomHeight);
      const scale=Math.min(.75,1440/w);
      reflection.setSize(Math.max(1,Math.round(w*scale)),Math.max(1,Math.round(h*scale)));
      reflectionPixel.set(1/reflection.width,1/reflection.height);
      camera.aspect=w/h;camera.updateProjectionMatrix();
      if(redraw)draw();
    }
    new ResizeObserver(()=>resize(!opening)).observe(view);
    function graphicsSettings(){
      return {shadows:shadowValues?.riverShadowMode.value ?? 0,moving:movingEnabled,gi:Boolean(giUniforms?.riverGIEnabled.value)};
    }
    async function applyStartupGraphics(settings){
      if(shadowValues){
        shadowControl.value=String(settings.shadows);
        await changeShadows(false);
      }
      await setMovingShadows(settings.moving,false);
      setGI(settings.gi,false);
    }
    async function waitForGraphicsFrame(signal){
      // Frames queued behind the loading screen have to finish on the GPU.
      const fence=renderer.capabilities.isWebGL2?gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE,0):null;
      if(!fence){
        gl.finish();
        return nextGardenFrame(signal);
      }
      gl.flush();
      try{
        for(;;){
          const now=await nextGardenFrame(signal);
          const status=gl.clientWaitSync(fence,0,0);
          if(status===gl.ALREADY_SIGNALED || status===gl.CONDITION_SATISFIED)return now;
          if(status===gl.WAIT_FAILED){
            gl.finish();
            return nextGardenFrame(signal);
          }
        }
      }finally{gl.deleteSync(fence);}
    }
    async function measureGraphics(signal,duration=1050){
      let start=await nextGardenFrame(signal),previous=start;
      let revision=visibilityRevision;
      const frames=[];
      do{
        updateLanterns(12+(previous-start)*.001,true);
        updateRowboat(nightTime.value);
        draw();
        const now=await waitForGraphicsFrame(signal);
        if(revision!==visibilityRevision){
          revision=visibilityRevision;
          start=previous=now;
          frames.length=0;
          continue;
        }
        if(previous-start>=350 && now>previous)frames.push(now-previous);
        previous=now;
      }while(previous-start<duration || !frames.length);
      frames.sort((a,b)=>a-b);
      return {mean:frames.reduce((sum,frame)=>sum+frame,0)/frames.length,
        slow:frames[Math.floor((frames.length-1)*.9)],worst:frames[frames.length-1]};
    }
    let graphicsSetup,graphicsReady=false;
    async function configureStartupGraphics(signal){
      const stored=savedGraphics();
      loadingStatus.textContent='Loading shadows…';
      await applyStartupGraphics(stored || {shadows:3,moving:false,gi:false});
      signal.throwIfAborted();
      if(stored || (!shadowValues && !movingLanterns.length))return;

      loadingStatus.textContent='Testing graphics…';
      const room=rooms[1],next=rooms[2];
      camera.position.set(room.x,1.62,room.z-2.15);
      camera.lookAt(next.x-.8,1.45,next.z);
      const baseline=await measureGraphics(signal);
      const smooth=sample=>sample.mean<=20 && sample.slow<=25;
      if(smooth(baseline)){
        let reference=baseline;
        if(movingLanterns.length){
          await setMovingShadows(true,false);
          signal.throwIfAborted();
          if(movingEnabled){
            const moving=await measureGraphics(signal);
            if(smooth(moving))reference=moving;
            else{
              await setMovingShadows(false,false);
              setMovingActive(false);
            }
          }
        }
        if(supportsGI && !giButton.hidden){
          loadingStatus.textContent='Testing RTGI…';
          setGI(true,false);
          if(giUniforms.riverGIEnabled.value){
            // Include several probe refreshes, since a high average can hide
            // hitches on the frames that update the lighting cache.
            const gi=await measureGraphics(signal,1600);
            const limit=T.MathUtils.clamp(reference.worst*1.2,32,44);
            if(!smooth(gi) || gi.worst>limit)setGI(false,false);
          }
        }
      }else if(baseline.mean>26 && baseline.mean<160 && shadowValues?.riverShadowMode.value===3){
        shadowControl.value='1';
        await changeShadows(false);
        signal.throwIfAborted();
        if(shadowValues.riverShadowMode.value===1){
          const baked=await measureGraphics(signal);
          if(baked.mean>baseline.mean*.88){
            shadowControl.value='3';
            await changeShadows(false);
          }
        }
      }
      signal.throwIfAborted();
      if(!movingEnabled)setMovingActive(false);
      saveGraphics(graphicsSettings());
    }
    async function initialiseGraphics(signal){
      if(graphicsSetup){
        try{await graphicsSetup}catch(error){if(error.name!=='AbortError')throw error;}
      }
      signal.throwIfAborted();
      if(graphicsReady)return;
      graphicsSetup=configureStartupGraphics(signal);
      try{
        await graphicsSetup;
        graphicsReady=true;
      }finally{graphicsSetup=null;}
    }
    function shortest(a){return Math.atan2(Math.sin(a),Math.cos(a))}
    let guidePoints=[],guideTarget=0,guideRunning=false,guideLookTime=0,arrival=null;
    let guideTurnRate=0,guideMoveTime=0;
    const photoHold=5;
    let untilStep=.52;
    function footfalls(oldX,oldZ){
      const p=camera.position;
      untilStep-=Math.hypot(p.x-oldX,p.z-oldZ);
      if(untilStep<=0){
        if(wantAmbience)ambience.step(Boolean(riverWalk.roomAt(p.x,p.z)),fastWalk);
        untilStep+=fastWalk?2.13:1.55;
      }
    }
    const releaseControlsAt=16;
    function beginFarewell(){
      elapsed=0;untilStep=.52;
      arrival={position:camera.position.clone(),pitch,yaw};
      stopGuide();
      held.clear();fastWalk=false;
      if(drag && canvas.hasPointerCapture(drag.id))canvas.releasePointerCapture(drag.id);
      drag=null;
      walkPanel.inert=true;
      view.focus({preventScroll:true});
      showFinale(0);
    }
    function frameFarewell(){
      const ease=reduced.matches?1:T.MathUtils.smoothstep(elapsed,0,1.6);
      camera.position.lerpVectors(arrival.position,poolView.position,ease);
      yaw=arrival.yaw+shortest(-arrival.yaw)*ease;
      const waterPitch=poolView.rotation.x;
      const lift=reduced.matches?Number(elapsed>=10):T.MathUtils.smoothstep(elapsed,5.5,12.5);
      const horizonPitch=Math.atan2(waterLevel-poolView.position.y,poolView.position.z-formation.position.z);
      pitch=T.MathUtils.lerp(arrival.pitch,T.MathUtils.lerp(waterPitch,horizonPitch,lift),ease);
      if(elapsed>=releaseControlsAt){
        arrival=null;
        walkPanel.inert=false;
      }
    }
    function setGuide(running){
      guideRunning=running;
      guideTurnRate=0;guideMoveTime=0;
      const atOverlook=elapsed>=0 && Math.hypot(camera.position.x-ex,camera.position.z-ez)<4;
      guide.textContent=running?'Pause walk':guidePoints.length?'Resume walk':atOverlook?'Watch again':'Follow the river';
      guide.setAttribute('aria-pressed',String(running));
    }
    function stopGuide(){
      guidePoints=[];guideTarget=0;guideLookTime=0;
      setGuide(false);
    }
    function follow(){
      if(arrival || drag)return;
      if(guidePoints.length){setGuide(!guideRunning);return}
      const p=camera.position,room=riverWalk.roomAt(p.x,p.z);
      if(elapsed>=0 && Math.hypot(p.x-ex,p.z-ez)<4){
        beginFarewell();return;
      }
      const addPoint=([x,z])=>guidePoints.push({x,z});
      const center=room?[room.x,p.z]:riverWalk.bridgeCenter(p.x,p.z) ?? [ex,p.z];
      addPoint(center);
      const halfView=Math.tan(T.MathUtils.degToRad(camera.fov/2))*camera.aspect;
      function addPhotos(gallery,fromZ=Infinity){
        stations.forEach((station,photo)=>{
          if(station.room!==gallery || station.z>fromZ)return;
          const print=portraits[photo].position;
          const frameWidth=station.width+.42;
          const distance=T.MathUtils.clamp(frameWidth/(1.8*halfView),Math.abs(station.x-print.x),gallery.width-1.65);
          guidePoints.push({x:print.x+Math.sin(station.angle)*distance,z:station.z,photo});
        });
      }
      if(room)addPhotos(room,p.z+.001);
      for(const point of route){
        if(point[1]<=overlookEntranceZ)break;
        if(point[1]>=center[1])continue;
        addPoint(point);
        const entry=rooms.find(r=>point[1]===r.z+r.depth/2);
        if(entry && entry!==room)addPhotos(entry);
      }
      addPoint([ex,overlookEntranceZ]);
      setGuide(true);
    }
    function lookAheadHeading(p){
      // Look past the next corner while walking along the deck centerline.
      let ahead=3,fromX=p.x,fromZ=p.z;
      for(let i=guideTarget;i<guidePoints.length;i++){
        const {x,z,photo}=guidePoints[i];
        const dx=x-fromX,dz=z-fromZ,length=Math.hypot(dx,dz);
        if(length>ahead){
          const t=ahead/length;
          return Math.atan2(p.x-fromX-dx*t,p.z-fromZ-dz*t);
        }
        ahead-=length;fromX=x;fromZ=z;
        if(photo!==undefined)break;
      }
      return Math.hypot(fromX-p.x,fromZ-p.z)>.001?Math.atan2(p.x-fromX,p.z-fromZ):yaw;
    }
    function turnGuide(heading,tilt,dt){
      const error=shortest(heading-yaw);
      // Keep angular speed continuous when the next turn changes direction.
      const desiredRate=T.MathUtils.clamp(error*3,-1.18,1.18);
      const maxChange=3.2*dt;
      const nextRate=guideTurnRate+T.MathUtils.clamp(desiredRate-guideTurnRate,-maxChange,maxChange);
      yaw+=(guideTurnRate+nextRate)*.5*dt;
      guideTurnRate=nextRate;
      pitch=T.MathUtils.damp(pitch,tilt,4,dt);
    }
    function advanceGuide(dt){
      const {x,z,photo}=guidePoints[guideTarget],p=camera.position;
      const dx=x-p.x,dz=z-p.z,d=Math.hypot(dx,dz);
      const print=portraits[photo]?.position;
      let heading=lookAheadHeading(p),tilt=.015;
      if(print){
        const fromPhoto=guidePoints[guideTarget-1]?.photo!==undefined;
        const focus=fromPhoto?1:1-T.MathUtils.smoothstep(d,.55,3.3);
        const photoHeading=Math.atan2(p.x-print.x,p.z-print.z);
        heading+=shortest(photoHeading-heading)*focus;
        tilt=T.MathUtils.lerp(tilt,Math.atan2(print.y-p.y,Math.hypot(print.x-p.x,print.z-p.z)),focus);
      }else{
        let turn=0,focus=0;
        for(const {picture} of pathMemories){
          if(!picture.visible)continue;
          const {position,material}=picture;
          const angle=shortest(Math.atan2(p.x-position.x,p.z-position.z)-heading);
          const glance=Math.min(1,material.opacity*2)*(1-T.MathUtils.smoothstep(Math.abs(angle),.55,1.04));
          if(glance>focus){turn=angle*glance;focus=glance}
        }
        heading+=turn;
      }
      turnGuide(heading,tilt,dt);
      if(d>.001){
        guideMoveTime+=dt;
        const leaving=.24+.76*T.MathUtils.smoothstep(guideMoveTime,0,1.1);
        const approaching=print ? .24+.76*T.MathUtils.smoothstep(d,0,1.65) : 1;
        const speed=3*(fastWalk?2.2:1)*Math.min(leaving,approaching);
        const step=Math.min(1,speed*dt/d);
        walk(dx*step,dz*step);
        if(print || Math.hypot(x-p.x,z-p.z)>.001)return;
      }
      if(print){
        if(Math.abs(shortest(heading-yaw))>.012 || Math.abs(guideTurnRate)>.06 || Math.abs(pitch-tilt)>.015)return;
        if(current!==photo || enlarge.hidden)select(photo);
        guideLookTime+=dt;
        if(guideLookTime<photoHold)return;
        guideMoveTime=0;
      }
      guideLookTime=0;
      if(++guideTarget===guidePoints.length)beginFarewell();
    }
    function go(index,reset=false){
      if(reset){arrival=null;walkPanel.inert=Boolean(opening);elapsed=-1;showFinale(-1)}
      if(arrival)return;
      untilStep=.52;lastLocation=null;
      if(index===finalIndex && elapsed<0){
        const [x,z]=trail[0];camera.position.set(x,1.62,z-.65);yaw=0;pitch=-.035;
        current=finalIndex;pathCaption('The long boardwalk','Follow the lanterns downstream');
      }else if(index===finalIndex){
        camera.position.set(ex,1.62,ez-1.4);yaw=0;pitch=-.46;select(index);
      }else if(reset && index===0){
        camera.position.set(arrivalDock[0]+.54,1.62,arrivalDock[1]-.35);
        yaw=-.15;pitch=-.083;current=index;
        pathCaption('Riverside gallery',rooms[0].name);
      }else{
        const stop=stations[index];
        camera.position.set(stop.x,1.62,stop.z);
        yaw=stop.angle;pitch=.055;select(index);
      }
      stopGuide();updatePathMemories(0);camera.rotation.set(pitch,yaw,0,'YXZ');draw();
    }
    function move(right,forward,turn,dt){
      yaw+=turn*dt*1.55;
      if(!right && !forward)return;
      const k=dt*(fastWalk?6.6:3)/Math.max(1,Math.hypot(right,forward));
      const dx=(Math.cos(yaw)*right-Math.sin(yaw)*forward)*k;
      const dz=(-Math.sin(yaw)*right-Math.cos(yaw)*forward)*k;
      walk(dx,dz);
    }
    function canWalk(x,z){
      if(!riverWalk.walkable(x,z))return false;
      const radius=.23;
      return !blockers.some(box=>{
        const dx=Math.max(0,Math.abs(x-box.x)-box.halfWidth);
        const dz=Math.max(0,Math.abs(z-box.z)-box.halfDepth);
        return dx*dx+dz*dz<radius*radius;
      });
    }
    function walk(dx,dz){
      const p=camera.position;
      const oldX=p.x,oldZ=p.z;
      const steps=Math.ceil(Math.hypot(dx,dz)/.12);
      for(let i=0;i<steps;i++){
        const x=p.x+dx/steps,z=p.z+dz/steps;
        if(canWalk(x,z)){p.x=x;p.z=z}
        else if(canWalk(x,p.z))p.x=x;
        else if(canWalk(p.x,z))p.z=z;
      }
      footfalls(oldX,oldZ);
    }
    function pathCaption(title,detail){
      if(lastLocation===detail && enlarge.hidden)return;
      lastLocation=detail;locationEl.textContent=title;captionEl.textContent=detail;enlarge.hidden=true;
    }
    function updateLocation(p){
      const room=riverWalk.roomAt(p.x,p.z);
      if(elapsed>=0 && Math.hypot(p.x-ex,p.z-ez)<5){
        if(current!==finalIndex || enlarge.hidden)select(finalIndex);
      }else if(room){
        let best=-Infinity,nearest=-1;
        stations.forEach((s,i)=>{
          if(s.room!==room)return;
          const dx=portraits[i].position.x-p.x,dz=portraits[i].position.z-p.z,d=Math.hypot(dx,dz);
          const facing=(-Math.sin(yaw)*dx-Math.cos(yaw)*dz)/Math.max(.01,d);
          const score=facing-.06*d;
          if(facing>.47 && score>best){best=score;nearest=i}
        });
        if(nearest>=0){
          if(nearest!==current || enlarge.hidden)select(nearest);
        }else{
          current=stations.findIndex(s=>s.room===room);
          pathCaption('Riverside gallery',room.name);
        }
      }else if(p.z<trail[0][1]+.1){
        current=finalIndex;
        pathCaption('The long boardwalk','Follow the lanterns downstream');
      }else{
        const next=rooms.find(r=>r.z<p.z);
        if(next)pathCaption('Across the water',next.name);
      }
    }
    function update(dt,time){
      const p=camera.position;
      if(!arrival){
        const walkDt=Math.min(.18,dt);
        if(held.size && guidePoints.length)stopGuide();
        if(guideRunning)advanceGuide(walkDt);
        else move(Number(held.has('strafeRight'))-Number(held.has('strafeLeft')),
                  Number(held.has('forward'))-Number(held.has('back')),
                  Number(held.has('left'))-Number(held.has('right')),walkDt);
        if(elapsed<0 && p.z<=overlookEntranceZ && Math.abs(p.x-ex)<landingWidth/2)beginFarewell();
      }
      if(elapsed>=0){
        elapsed+=dt;showFinale(elapsed);
        if(arrival)frameFarewell();
      }
      updatePathMemories(Math.min(.18,dt));
      if(!guideLookTime)updateLocation(p);
      camera.rotation.set(pitch,yaw,0,'YXZ');updateLanterns(time);updateRowboat(nightTime.value);draw();
    }
    function photoAt(x,y){
      const r=canvas.getBoundingClientRect();
      caster.setFromCamera({x:2*(x-r.left)/r.width-1,y:1-2*(y-r.top)/r.height},camera);
      if(x<r.left || x>=r.right || y<r.top || y>=r.bottom)return null;
      photoHits.length=0;
      const hit=caster.intersectObjects(portraits,false,photoHits).find(hit=>hit.object.visible && hit.distance<9);
      return hit ? hit.object.userData.index : null;
    }
    function updatePhotoCursor(){
      const clickable=hover && !drag && !arrival && !viewer.open && photoAt(hover.x,hover.y)!==null;
      canvas.classList.toggle('photo-hover',Boolean(clickable));
    }
    guide.addEventListener('click',follow);
    canvas.addEventListener('pointerdown',e=>{
      if(arrival || drag || e.button!==0)return;
      if(guidePoints.length)stopGuide();
      view.focus({preventScroll:true});
      drag={id:e.pointerId,startX:e.clientX,startY:e.clientY,x:e.clientX,y:e.clientY,moved:false};
      updatePhotoCursor();
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointerleave',()=>{
      hover=null;
      updatePhotoCursor();
    });
    canvas.addEventListener('pointermove',e=>{
      if(e.pointerType!=='touch')hover={x:e.clientX,y:e.clientY};
      if(!drag){
        updatePhotoCursor();
        return;
      }
      if(e.pointerId!==drag.id)return;
      const dx=e.clientX-drag.x,dy=e.clientY-drag.y;
      drag.x=e.clientX;drag.y=e.clientY;
      if(Math.abs(drag.x-drag.startX)+Math.abs(drag.y-drag.startY)>5)drag.moved=true;
      yaw-=dx*.004;pitch=T.MathUtils.clamp(pitch-dy*.003,-1.40,1.10);
    });
    canvas.addEventListener('pointerup',e=>{
      if(!drag || e.pointerId!==drag.id)return;
      if(!drag.moved){
        let index=photoAt(e.clientX,e.clientY);
        if(elapsed>0 && Math.hypot(camera.position.x-ex,camera.position.z-ez)<4 &&
           caster.ray.intersectPlane(waterPlane,poolHit) && poolHit.z<ez-2.35){
          poolHit.project(poolView);
          if(poolHit.x**2+poolHit.y**2<.85 && poolHit.z<1)index=finalIndex;
        }
        if(index!==null){select(index);enlarge.focus();enlarge.click()}
      }
      drag=null;
      updatePhotoCursor();
    });
    canvas.addEventListener('lostpointercapture',()=>{
      drag=null;
      updatePhotoCursor();
    });
    canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();showFallback()});
    updateRowboat(0);updateLanterns(0);resize(false);
    ready=true;
    return {go,update,resize,step(action){
      if(arrival)return;
      if(guidePoints.length)stopGuide();
      move(0,action==='forward'?1:action==='back'?-1:0,action==='left'?1:action==='right'?-1:0,.17);
    },initialiseGraphics,resetScene(){
      updateLanterns(0);updateRowboat(nightTime.value);go(0,true);
    }};
  }

  function stopFrames(){
    held.clear();fastWalk=false;cancelAnimationFrame(frame);frame=0;previousTime=0;
    resetFPS();
  }
  function resetFPS(){
    fpsFrom=fpsFrames=0;
    fpsLabel.hidden=true;
  }
  function countFPS(now){
    if(!fpsFrom){
      fpsFrom=now;
      return;
    }
    fpsFrames++;
    const duration=now-fpsFrom;
    if(duration<650)return;
    const fps=fpsFrames*1000/duration;
    fpsLabel.textContent=(fps>=10?Math.round(fps):fps>=.1?fps.toFixed(1):'<0.1')+' FPS';
    fpsLabel.hidden=false;
    fpsFrom=now;
    fpsFrames=0;
  }
  function animate(now){
    frame=0;
    if(!dialog.open || document.hidden || !garden || !fallback.hidden)return;
    if(!viewer.open){
      garden.update(previousTime?(now-previousTime)/1000:0,now/1000);
      countFPS(now);
    }else if(fpsFrom)resetFPS();
    previousTime=now;frame=requestAnimationFrame(animate);
  }
  function startFrames(){
    if(!frame && !opening && garden && dialog.open && !document.hidden && fallback.hidden)frame=requestAnimationFrame(animate);
  }
  function showFallback(error){
    if(error)console.warn('The 3D memorial could not start:',error);
    opening?.abort();
    setLoading(false);
    stopFrames();walkPanel.inert=false;fallback.hidden=false;movement.hidden=true;view.hidden=true;
    if(giButton)giButton.hidden=true;
    if(shadowControl)shadowControl.hidden=true;
    if(movingButton)movingButton.hidden=true;
    select(current);
  }
  function prepare(){
    if(preparing)return preparing;
    const textureLoader=new THREE.TextureLoader();
    const atlasRequest=new Promise((resolve,reject)=>{
      const script=document.createElement('script');
      script.src='garden-atlas.js';
      script.onload=()=>resolve(gardenAtlas);
      script.onerror=()=>reject(new Error('Offline photo atlas unavailable'));
      document.head.appendChild(script);
    }).then(async atlas=>({atlas,atlasMap:await textureLoader.loadAsync(atlas.image)}));
    // Poly Haven CC0. The finish maps pack height, roughness and grain.
    const optionalTexture=src=>textureLoader.loadAsync(src).catch(()=>null);
    preparing=Promise.all([
      atlasRequest,
      location.protocol==='file:'?null:optionalTexture('photos/01.webp'),
      optionalTexture('materials/wood-finish.webp?v=2'),
      optionalTexture('materials/slate-finish.webp'),
      optionalTexture('materials/deck-color.webp'),
      optionalTexture('materials/river-foliage.webp'),
      optionalTexture('materials/river-painted-slate.webp'),
      optionalTexture('materials/river-forest-floor.webp'),
      optionalTexture('materials/pavilion-timber.webp')
    ]).then(([{atlas,atlasMap},finalePhoto,wood,slate,deck,foliage,paintedStone,forestFloor,pavilionTimber])=>{
      loadingStatus.textContent='Preparing the river…';
      garden=makeGarden(atlas,{atlasMap,finalePhoto,wood,slate,deck,foliage,paintedStone,forestFloor,pavilionTimber});
      return garden;
    });
    return preparing;
  }
  async function enter(){
    if(dialog.open)return;
    opening?.abort();
    const session=new AbortController(),{signal}=session;
    opening=session;
    loadingStatus.textContent='Loading the memorial…';
    setLoading(true);
    dialog.showModal();
    select(0);
    const musicStarting=playMusic();
    startAmbience();
    const soundReady=musicStarting && Promise.race([musicStarting,new Promise(resolve=>setTimeout(resolve,1600))]);
    try{
      // Give the loading screen a paint before building or drawing the scene.
      await nextGardenFrame(signal);
      await nextGardenFrame(signal);
      const instance=await prepare();
      signal.throwIfAborted();
      instance.resize(false);
      await instance.initialiseGraphics(signal);
      signal.throwIfAborted();
      loadingStatus.textContent='Opening the memorial…';
      instance.resetScene();
      await soundReady;
      await nextGardenFrame(signal);
      setLoading(false);
      view.focus({preventScroll:true});
    }catch(error){
      if(!signal.aborted)showFallback(error);
    }finally{
      if(opening===session){
        opening=null;
        startFrames();
      }
    }
  }
  function leave(){
    if(history.state?.lanternGarden) history.back();
    else {
      history.replaceState(null,'',location.href.split('#')[0]+'#desk');
      if(dialog.open)dialog.close();
    }
  }
  document.querySelectorAll('[data-enter-garden]').forEach(link=>link.addEventListener('click',e=>{
    if(e.button!==0 || e.ctrlKey || e.shiftKey || e.metaKey || e.altKey)return;
    e.preventDefault();entrance=link;
    if(location.hash!=='#memorial')history.pushState({lanternGarden:true},'','#memorial');
    enter();
  }));
  dialog.addEventListener('cancel',e=>{
    e.preventDefault();
    if(!settingsPanel.hidden){
      setSettingsOpen(false);
      settingsToggle.focus({preventScroll:true});
    }else leave();
  });
  dialog.addEventListener('close',()=>{
    if(dialog.open)return;
    opening?.abort();opening=null;
    setSettingsOpen(false);
    setLoading(false);
    stopFrames();pauseMusic();music.currentTime=0;
    ambience.pause();
    entrance?.focus({preventScroll:true});
  });
  document.querySelector('#leave-garden').addEventListener('click',leave);
  window.addEventListener('hashchange',()=>{
    if(location.hash==='#memorial')enter();
    else if(dialog.open){if(viewer.open)viewer.close();dialog.close()}
  });
  for(const [id,delta] of [['garden-prev',-1],['garden-next',1]]){
    document.getElementById(id).onclick=()=>{
      const index=(current+delta+order.length)%order.length;
      if(garden && fallback.hidden)garden.go(index);else select(index);
    };
  }
  const keys={KeyW:'forward',KeyS:'back',KeyA:'strafeLeft',KeyD:'strafeRight',
              ArrowUp:'forward',ArrowDown:'back',ArrowLeft:'left',ArrowRight:'right'};
  dialog.addEventListener('keydown',e=>{
    if(settings.contains(e.target))return;
    const action=keys[e.code];
    if(walkPanel.inert){if(action)e.preventDefault();return}
    fastWalk=e.shiftKey;
    if(!action || viewer.open || view.hidden || e.altKey || e.metaKey || e.ctrlKey)return;
    e.preventDefault();held.add(action);
  });
  window.addEventListener('keyup',e=>{fastWalk=e.shiftKey;if(keys[e.code])held.delete(keys[e.code])});
  document.querySelectorAll('[data-walk]').forEach(button=>{
    const action=button.dataset.walk;
    button.addEventListener('pointerdown',e=>{
      if(walkPanel.inert || e.button!==0)return;
      held.add(action);button.setPointerCapture(e.pointerId);
    });
    button.addEventListener('lostpointercapture',()=>held.delete(action));
    button.addEventListener('click',e=>{if(e.detail===0 && garden)garden.step(action)});
  });
  window.addEventListener('blur',()=>{held.clear();fastWalk=false});
  document.addEventListener('visibilitychange',()=>{
    visibilityRevision++;
    if(document.hidden){stopFrames();pauseMusic();ambience.pause()}
    else if(dialog.open){startFrames();playMusic();startAmbience()}
  });
  if(matchMedia('(pointer:coarse)').matches){
    document.querySelector('#garden-directions').textContent='Hold arrows to walk · Drag to look';
  }
  audioLabel();
  if(location.hash==='#memorial')enter();
})();
