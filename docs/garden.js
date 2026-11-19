(() => {
  const dialog = document.querySelector('#memorial');
  const view = dialog.querySelector('.garden-view');
  const fallback = dialog.querySelector('.garden-fallback');
  const movement = dialog.querySelector('.garden-movement');
  const walkPanel = dialog.querySelector('.garden-bottom');
  const music = document.querySelector('#garden-music');
  const sound = document.querySelector('#garden-sound');
  const giButton = document.querySelector('#garden-gi');
  const shadowControl = document.querySelector('#garden-shadows');
  const movingButton = document.querySelector('#garden-moving-shadows');
  const viewer = document.querySelector('#viewer');
  const enlarge = document.querySelector('#garden-enlarge');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const {rooms,bridges,route,trail,end,landingWidth,landingDepth,lanternSpans,bridgePoint} = riverWalk;
  const order = [...rooms.flatMap(room=>room.photos),1];
  const finalIndex = order.length-1;
  const fullTurn = Math.PI*2;
  const guide = document.querySelector('#garden-guide');
  const captionEl = document.querySelector('#garden-caption');
  const locationEl = document.querySelector('#garden-count');
  let current = 0, garden, preparing, frame = 0, previousTime = 0;
  let desiredMusic = true, audioAttempt = 0, entrance;
  const held = new Set();
  let fastWalk=false;

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
  let wantAmbience=true, ambienceActivated=false;
  const ambience=createRiverAmbience(()=>{
    ambienceButton.textContent=ambience.playing?'Ambience on':'Ambience off';
    ambienceButton.setAttribute('aria-pressed',String(ambience.playing));
    ambienceButton.setAttribute('aria-label',ambience.playing?'Mute river and footsteps':'Play river and footsteps');
  });
  function startAmbience(){
    if(!wantAmbience || !dialog.open || document.hidden)return;
    ambienceActivated=true;
    if(!ambience.playing)ambience.start();
  }
  ambienceButton.setAttribute('aria-label','Play river and footsteps');
  ambienceButton.addEventListener('click',()=>{
    wantAmbience=!ambience.playing;
    if(wantAmbience)startAmbience();else ambience.pause();
  });
  // Direct links have no entry click to unlock audio. The first walking or
  // viewing gesture can start the river without starting the music.
  function activateOnInteraction(e){
    if(e.target.closest('#garden-ambience, #garden-gi, #garden-shadows, #garden-moving-shadows, #leave-garden') || e.key==='Escape')return;
    if(!ambience.playing)startAmbience();
  }
  dialog.addEventListener('pointerup',activateOnInteraction);
  dialog.addEventListener('keydown',activateOnInteraction);
  music.volume = .53;
  music.addEventListener('play', audioLabel);
  music.addEventListener('pause', audioLabel);
  function playMusic() {
    const attempt = ++audioAttempt;
    if (!desiredMusic || !dialog.open || document.hidden) return;
    music.play().catch(() => {
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
    const camera = new T.PerspectiveCamera(56,1,.07,160);
    camera.rotation.order = 'YXZ';
    const color = value => new T.Color(value).convertSRGBToLinear();
    const waterLevel=-.43;
    const nightTime={value:0};
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
    let shadowValues=null,movingEffect=null,movingEnabled=false;
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
      shader.fragmentShader='varying vec3 riverSurface;\n'+shader.fragmentShader.replace(
        '#include <fog_fragment>',
        `#include <fog_fragment>
        #ifdef USE_FOG
          float airHeight=abs(cameraPosition.y-(${waterLevel.toFixed(2)}));
          float surfaceHeight=max(0.,riverSurface.y-(${waterLevel.toFixed(2)}));
          float mistDepth=length(cameraPosition-riverSurface);
          float mistDensity=exp(-.64*mix(airHeight,surfaceHeight,.69));
          float mistAmount=(1.-exp(-.018*mistDepth*mistDensity))*.72;
          gl_FragColor.rgb=mix(gl_FragColor.rgb,fogColor,mistAmount);
        #endif`
      );
    }

    function painted(size,draw) {
      const canvas=document.createElement('canvas');canvas.width=canvas.height=size;
      draw(canvas.getContext('2d'),size);
      const tex=new T.CanvasTexture(canvas);tex.encoding=T.sRGBEncoding;return tex;
    }
    const sky=new T.Mesh(new T.SphereGeometry(135,64,24),new T.ShaderMaterial({
      side:T.BackSide,depthWrite:false,
      extensions:{derivatives:true},
      uniforms:{deep:{value:color('#030817')},blue:{value:color('#173970')},mist:{value:color('#284353')},moonDirection},
      vertexShader:`varying vec3 place;
        void main(){
          vec4 point=modelMatrix*vec4(position,1.);
          place=point.xyz-cameraPosition;
          gl_Position=projectionMatrix*viewMatrix*point;
        }`,
      fragmentShader:`uniform vec3 deep,blue,mist,moonDirection;varying vec3 place;
        float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
        float noise(vec2 p){
          vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
          return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+1.),f.x),f.y);
        }
        void main(){
          vec3 d=normalize(place);
          float h=max(d.y,0.);
          float opening=.24+.76*pow(max(0.,dot(d,normalize(vec3(-.64,.24,-1.)))),5.);
          vec3 c=mix(deep,blue,opening*exp(-3.25*h));
          c=mix(c,mist,(1.-smoothstep(-.025,.14,h))*.65);
          vec2 p=d.xz/(.52+h)*vec2(8.,19.);
          float cloud=.63*noise(p)+.24*noise(p*2.05)+.13*noise(p*4.1);
          float cloudBand=smoothstep(.46,.79,cloud)*smoothstep(.03,.21,h)*(1.-smoothstep(.47,.80,h));
          c+=cloudBand*vec3(.012,.019,.031)*opening;
          vec2 q=vec2(atan(d.z,d.x),d.y)*vec2(69.,94.);
          vec2 f=fract(q)-.5;
          float star=hash(floor(q));
          float starlight=step(.964,star)*exp(-102.*dot(f,f))*smoothstep(.12,.47,h);
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
              float rock=.18*noise(lunar*5.+7.)+.08*noise(lunar*17.-5.);
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
    const moorings=[...rooms,{x:ex,z:ez,width:landingWidth,depth:landingDepth}];
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
        portraitLight:{value:0},navy:{value:color('#02060d')}},
      vertexShader:`uniform mat4 projection;varying vec4 reflected;varying vec3 world;
        void main(){vec4 p=modelMatrix*vec4(position,1.);world=p.xyz;reflected=projection*p;
        gl_Position=projectionMatrix*viewMatrix*p;}`,
      fragmentShader:`${samplePortrait}
        ${riverShore.waterShader}
        uniform mat4 poolProjection;
        uniform sampler2D reflectedView,pileWakes;
        uniform vec4 wakeBounds;
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
          float bankHaze=mix(.42,1.,1.-smoothstep(2.,19.,bank));
          float haze=(1.-exp(-max(dist-10.,0.)*.019))*smoothstep(.70,.999,grazing)*bankHaze;
          haze*=.79+.21*sin(p.y*.24+p.x*.21+time*.12+1.1*sin(p.x*.31));
          river=mix(river,vec3(.042,.064,.093),haze*.43*(1.-still));
        if(still>.001){
          vec4 projected=poolProjection*vec4(world,1.);
          vec2 q=projected.xy/projected.w*.5+.5;
          q+=vec2(.0022*sin(swell)+.0013*sin(ripple)*rippleCoverage,.0019*cos(swell));
          if(projected.w>0. && all(greaterThan(q,vec2(0.))) && all(lessThan(q,vec2(1.)))){
            float fur=texture2D(furMask,q).a;
            float blanket=.27*(1.-smoothstep(.32,.50,length(q-.5)));
            float strength=(.81+.04*midSlope)*max(fur,blanket)*portraitLight;
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
    const pictureMetal=new T.MeshStandardMaterial({color:color('#62503d'),roughness:.49,metalness:.38});
    const pictureBulb=new T.MeshBasicMaterial({color:color('#ffd490')});
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
    const atlasMap=new T.TextureLoader().load(atlas.image,()=>{
      if(ready)draw();
    },undefined,()=>{
      if(ready)showFallback(new Error('The photo atlas could not be decoded'));
    });
    photoUniforms.photograph.value=atlasMap;
    atlasMap.encoding=T.sRGBEncoding;atlasMap.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
    const photoMat=new T.MeshStandardMaterial({
      map:atlasMap,emissiveMap:atlasMap,emissive:color('#efe2cf'),emissiveIntensity:.12,
      color:color('#f1e6d6'),roughness:.96
    });
    const pictureGlass=new T.ShaderMaterial({
      transparent:true,depthWrite:false,
      uniforms:{nearbyLantern:{value:new T.Vector3()}},
      vertexShader:`varying vec3 glassPosition,glassNormal;
        void main(){
          glassPosition=(modelMatrix*vec4(position,1.)).xyz;
          glassNormal=mat3(modelMatrix)*normal;
          gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);
        }`,
      fragmentShader:`uniform vec3 nearbyLantern;
        varying vec3 glassPosition,glassNormal;
        void main(){
          vec3 view=normalize(cameraPosition-glassPosition);
          vec3 normal=normalize(glassNormal);
          vec3 reflectedRay=reflect(-view,normal);
          float fresnel=.009+.13*pow(1.-max(dot(view,normal),0.),5.);
          float glint=pow(max(dot(reflectedRay,normalize(nearbyLantern-glassPosition)),0.),54.);
          vec3 sky=mix(vec3(.035,.064,.107),vec3(.12,.20,.30),smoothstep(-.22,.40,reflectedRay.y));
          gl_FragColor=vec4(mix(sky,vec3(.88,.38,.11),glint),fresnel+.048*glint);
          #include <encodings_fragment>
        }`
    });
    const portraits=[];
    // The shade is a closed paper envelope at the top and open at its bamboo hoop.
    const lanterns=[], fixtures=[];
    const paperMap=painted(256,(ctx,n)=>{
      const gradient=ctx.createLinearGradient(0,0,0,n);
      for(const [at,shade] of [[0,'#ad3513'],[.22,'#dd5718'],[.55,'#fd8d28'],[.84,'#ffc956'],[1,'#fff2ba']]){
        gradient.addColorStop(at,shade);
      }
      ctx.fillStyle=gradient;ctx.fillRect(0,0,n,n);
      for(let i=0;i<8;i++){
        const x=i*n/8;
        ctx.fillStyle='rgba(111,51,27,.32)';ctx.fillRect(x,0,1.35,n);
        ctx.fillStyle='rgba(255,247,200,.14)';ctx.fillRect(x+1.35,0,.85,n);
      }
      for(let j=0;j<2200;j++){
        const x=rand()*n,y=rand()*n,length=1+rand()*8;
        ctx.strokeStyle=j%3?'#7e462825':'#fff7ce33';ctx.lineWidth=.48;
        ctx.beginPath();ctx.moveTo(x,y);ctx.quadraticCurveTo(x+length*.46,y-1.1,x+length,y+.65);ctx.stroke();
      }
      for(const y of [.13,.84,.96]){ctx.fillStyle='#8e522b35';ctx.fillRect(0,y*n,n,1.8)}
    });
    const shadeProfile=new T.SplineCurve([
      [.155,0],[.168,.032],[.233,.117],[.276,.27],[.274,.45],
      [.255,.56],[.218,.635],[.148,.673],[.001,.679]
    ].map(([r,y])=>new T.Vector2(r,y)));
    const shadeGeometry=new T.LatheGeometry(shadeProfile.getPoints(24),30);
    const hoopGeometry=new T.TorusGeometry(.158,.009,8,22);
    hoopGeometry.rotateX(Math.PI/2);
    const braceGeometry=new T.BoxGeometry(.308,.009,.012);
    const flameGeometry=new T.PlaneGeometry(.142,.224);
    function candlePaper(material){
      material.onBeforeCompile=shader=>{
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
        shader.fragmentShader='varying vec3 paperNormal,paperView;\n'+shader.fragmentShader.replace(
          '#include <color_fragment>',
          `#include <color_fragment>
           float face=abs(dot(normalize(paperNormal),normalize(paperView)));
           float transmission=smoothstep(.08,.91,face);
           float flame=exp(-pow((vUv.y-.20)*6.0,2.));
           float ribs=1.-.18*pow(.5+.5*cos(vUv.x*50.26548),16.);
           float paperDensity=smoothstep(.12,.88,diffuseColor.g);
           diffuseColor.rgb*=mix(vec3(.66,.48,.31),vec3(1.31,1.12,.88),transmission);
           diffuseColor.rgb+=vec3(.99,.71,.33)*flame*transmission*mix(.66,1.,paperDensity);
           diffuseColor.rgb*=ribs;
           diffuseColor.a=.04;`
        );
      };
      return material;
    }
    const paper=candlePaper(new T.MeshBasicMaterial({map:paperMap,side:T.DoubleSide,toneMapped:false}));
    const bamboo=new T.MeshBasicMaterial({color:color('#34241a')});
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
      map:glowMap,transparent:true,opacity:.36,depthWrite:false,toneMapped:false,blending:T.AdditiveBlending
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
      return lamp;
    }
    function shadowVariant(mode=shadowValues?.riverShadowMode.value ?? 0){
      return mode===0?'off':'map';
    }
    function finishRailing(shader,finish){
      const axes=finish.horizontal?'xzy':'xyz';
      const varyings='varying vec4 railPosition;\nvarying vec3 railNormal;\n';
      shader.uniforms.railFinishMap={value:finish.map};
      shader.vertexShader=varyings+shader.vertexShader.replace('#include <begin_vertex>',`
        #include <begin_vertex>
        vec3 railScale=vec3(1.0);
        #ifdef USE_INSTANCING
          railScale=vec3(length(instanceMatrix[0].xyz),length(instanceMatrix[1].xyz),length(instanceMatrix[2].xyz));
        #endif
        railPosition=vec4((position*railScale).${axes},railScale.z*.5);
        railNormal=normal.${axes};
      `);
      shader.fragmentShader=varyings+'uniform sampler2D railFinishMap;\n'+shader.fragmentShader
        .replace('#include <color_fragment>',`
          #include <color_fragment>
          vec3 railAxis=abs(normalize(railNormal));
          vec3 railBlend=pow(railAxis,vec3(8.));
          railBlend/=dot(railBlend,vec3(1.));
          vec3 railUV=railPosition.xyz*${finish.scale};
          vec3 finishGrain=texture2D(railFinishMap,railUV.zy).rgb*railBlend.x
                          +texture2D(railFinishMap,railUV.xz).rgb*railBlend.y
                          +texture2D(railFinishMap,railUV.xy).rgb*railBlend.z;
          float bevelWear=smoothstep(.05,.24,1.-max(railAxis.x,max(railAxis.y,railAxis.z)));
          bevelWear*=mix(.48,1.,smoothstep(.33,.73,finishGrain.g));
          diffuseColor.rgb*=mix(.65,1.28,finishGrain.b)*(1.+bevelWear*${finish.wear});
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
          ${finish.groundContact?'roughnessFactor+=.065*postGround;':''}
        `)
        .replace('#include <normal_fragment_maps>',`
          #include <normal_fragment_maps>
          vec3 railDx=dFdx(-vViewPosition),railDy=dFdy(-vViewPosition);
          vec3 railTx=cross(railDy,normal),railTy=cross(normal,railDx);
          float railDet=dot(railDx,railTx);
          float railRelief=finishGrain.r*${finish.relief};
          vec3 railSlope=sign(railDet)*(railTx*dFdx(railRelief)+railTy*dFdy(railRelief));
          normal=normalize(max(abs(railDet),1e-7)*normal-railSlope);
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
        const isCap=material===edge;
        const isPrint=material===photoMat,isMat=material===linen,isDeck=material===timber;
        const railFinish=railingFinishes.get(material);
        const isDeckTrim=material===headerPlank || material===walkwayTrim;
        const exterior=isStone || isDeck || railFinish || isDeckTrim;
        const profile=isStone?'stone':isPrint?'print':isMat?'mat':isDeck?'deck':isDeckTrim?'deck-trim':'lanterns';
        material.customProgramCacheKey=()=>'river-'+profile+'-'+shadowVariant()+(movingEnabled?'-moving':'')
          +(railFinish?'-railing-'+material.id:exterior?'-exterior':'');
        material.onBeforeCompile=shader=>{
          const variant=shadowVariant(),castShadows=variant!=='off';
          addRiverMist(shader);
          if(giUniforms)riverGI.receive(shader,giUniforms);
          if(movingEnabled)riverShadows.receiveMoving(shader,movingValues);
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
            ${movingEnabled?`
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
          `).replace('#include <roughnessmap_fragment>',`
            #include <roughnessmap_fragment>
            roughnessFactor=mix(roughnessFactor,${isStone?'.39':'.31'},wetness*.74);
          `);
          if(castShadows)riverShadows.receive(T,shader,shadowValues,rooms.length);
          if(isPrint || isMat){
            // Light from the bar above each frame falls across the print and mat.
            const pictureVarying='varying vec3 pictureFace;\n';
            shader.vertexShader=pictureVarying+(isPrint?'attribute vec2 pictureUV;\n':'')
              +shader.vertexShader.replace('#include <begin_vertex>',`
              #include <begin_vertex>
              pictureFace=vec3(${isPrint?'pictureUV,1.':'position.xy+.5,max(normal.z,0.)'});
            `);
            shader.fragmentShader=pictureVarying+shader.fragmentShader.replace('#include <lights_fragment_maps>',`
              #include <lights_fragment_maps>
              float down=clamp(1.-pictureFace.y,0.,1.);
              float spread=mix(.35,.71,sqrt(down));
              float beam=1.-smoothstep(spread*.36,spread,abs(pictureFace.x-.5));
              float wash=beam/(1.+1.1*down);
              vec3 pictureLight=vec3(1.,.78,.59)*pictureFace.z*(.86+1.75*wash);
              reflectedLight.directDiffuse+=BRDF_Diffuse_Lambert(material.diffuseColor)*pictureLight;
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
              diffuseColor.rgb*=mapTexelToLinear(grain).rgb*mix(vec3(.72,.78,.86),vec3(1.32,1.33,1.36),mottle)
                               *(1.+worn*riverEdgeWear)*(1.-.19*atStoneFoot);
            `).replace('#include <roughnessmap_fragment>',`
              #include <roughnessmap_fragment>
              roughnessFactor=clamp(roughnessFactor+(.64-grain.g)*.25+(pores.g-.60)*.30-worn*.095,.51,.96);
            `).replace('#include <normal_fragment_maps>',`
              #include <normal_fragment_maps>
              // A small amount of relief follows the same unstretched projection.
              vec3 stoneDx=dFdx(-vViewPosition),stoneDy=dFdy(-vViewPosition);
              vec3 stoneTx=cross(stoneDy,normal),stoneTy=cross(normal,stoneDx);
              float stoneDet=dot(stoneDx,stoneTx);
              float stoneHeight=.0023*grain.g+${photoMaterials.slate?'.0068':'.00078'}*pores.r;
              vec3 microRelief=sign(stoneDet)*(stoneTx*dFdx(stoneHeight)+stoneTy*dFdy(stoneHeight));
              normal=normalize(max(abs(stoneDet),1e-7)*normal-microRelief);
            `);
          }
          if(railFinish)finishRailing(shader,railFinish);
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
      scene,batch,reflected,color,painted,addRiverMist,shore,waterLevel,random:shoreRandom,slate:stonePores
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
      cloudData.push(.17+Math.pow(rand(),2)*.49,rand()*fullTurn,rand(),1);
    }
    for(const {x,y,z,size} of shore.lanterns){
      cloudPositions.push(x,y,z);
      cloudData.push(size,shoreRandom()*fullTurn,shoreRandom(),0);
    }
    // A smaller release drifts across the channel rather than tracing a hard edge at the bank.
    for(let i=0;i<175;i++){
      const h=5+35*rand(),z=-45-58*rand();
      cloudPositions.push(riverCenter(z)+(rand()-.5)*(12+h*.82),h,z);
      cloudData.push(.13+.27*rand(),rand()*fullTurn,rand(),1);
    }
    const cloudGeo=new T.BufferGeometry();
    cloudGeo.setAttribute('position',new T.Float32BufferAttribute(cloudPositions,3));
    cloudGeo.setAttribute('lanternData',new T.Float32BufferAttribute(cloudData,4));
    const lightHeight={value:600};
    const cloudMaterial=new T.ShaderMaterial({
      uniforms:{time:nightTime,viewportHeight:lightHeight},transparent:true,depthWrite:false,
      vertexShader:`attribute vec4 lanternData;uniform float time,viewportHeight;varying float tint,visibility;
        void main(){vec3 p=position;visibility=1.;
        if(lanternData.w>.5){
          float rise=mod(position.y-1.3+time*(.19+.09*lanternData.z),40.);
          p.y=1.3+rise;p.x-=(p.y-position.y)*.31;
          p.z+=.85*sin(time*.12+lanternData.y);
          visibility=smoothstep(0.,1.1,rise)*(1.-smoothstep(37.,40.,rise))*.72;
        }
        p.x+=mix(.025,.18,lanternData.w)*sin(time*.27+lanternData.y);
        p.y+=mix(.035,.25,lanternData.w)*sin(time*.31+lanternData.y);
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
    scene.add(reflected(new T.Points(cloudGeo,cloudMaterial)));

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
    const uprightCedar=cedar.clone();
    uprightCedar.bumpScale=.014;
    uprightCedar.roughness=.73;
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
    const walkwayTrim=timber.clone();
    walkwayTrim.color.copy(color('#afaaa1'));
    const headerPlank=timber.clone();
    headerPlank.color.copy(color('#b3aea5'));
    const railingFinishes=new Map([
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
    timberSection.moveTo(-.5,-.452);
    for(const [x,y] of [[-.452,-.5],[.452,-.5],[.5,-.452],[.5,.452],
      [.452,.5],[-.452,.5],[-.5,.452]])timberSection.lineTo(x,y);
    timberSection.closePath();
    const ceilingTimber=new T.ExtrudeGeometry(timberSection,{depth:1,bevelEnabled:false});
    ceilingTimber.translate(0,0,-.5);
    const braceTimber=ceilingTimber.clone().rotateY(Math.PI/2);
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
      batch(trim,bronze,x,wallCapTop+.025,z,width+.05,.050,depth+.05);
      batch(poolGeo,contact,x,.008,z,pierWidth+.26,1,pierWidth+.26);
      batch(poolGeo,postContact,x,.829,z,width+.10,1,depth+.10);
    }
    function stoneWall(alongX,fixed,firstPier,lastPier){
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
        slab(wallCap,edge,i===0?capFrom:start,i===spans-1?capTo:finish,
          (wallCapBase+wallCapTop)/2,wallCapTop-wallCapBase,.394);
      }
    }
    const profiles=[
      [[-1,-.13],[0,1.15],[1,-.13]],
      [[-1,.15],[-.78,.02],[-.47,.20],[0,.83],[.47,.20],[.78,.02],[1,.15]],
      [[-1,-.07],[-.62,.16],[-.38,.79],[.38,.79],[.62,.16],[1,-.07]],
      [[-1,-.12],[-.28,.29],[.49,.77],[1,1.02]],
      Array.from({length:11},(_,i)=>{const x=i/5-1;return [x,.05+.82*Math.sqrt(1-x*x)]})
    ];
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
      roofBand(cedar,.158,-.024,.126,rafterRows);
      roofBand(darkTimber,.276,.078,.126,fasciaRows);
      for(let i=1;i<profile.length;i++){
        const [u0,y0]=profile[i-1],[u1,y1]=profile[i];
        const dx=(u1-u0)*half,dy=y1-y0;
        const midX=x+(u0+u1)*half/2,midY=height+.16+(y0+y1)/2;
        const pitch=Math.atan2(dy,dx),length=Math.hypot(dx,dy);
        bounceBox(roof,midX,midY+.05,z,length,.14,span,0,pitch);
        // Use matching pitch-aligned bounds for the cached shadow bake.
        for(const row of fasciaRows)bounceBox(darkTimber,midX,midY+.017,row,length,.198,.142,0,pitch);
        for(const row of rafterRows)bounceBox(cedar,midX,midY-.093,row,length,.182,.142,0,pitch);
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
    function roomSign(room,x,y,headerFace){
      const c=document.createElement('canvas');c.width=768;c.height=120;
      const ctx=c.getContext('2d');ctx.fillStyle='#182c37';ctx.fillRect(0,0,768,120);
      ctx.strokeStyle='#a38962';ctx.lineWidth=3;ctx.strokeRect(6,6,756,108);
      ctx.fillStyle='#f5ddb3';ctx.font='italic 68px Georgia';ctx.textAlign='center';
      ctx.fillText(room.name,384,83);
      const texture=new T.CanvasTexture(c);texture.encoding=T.sRGBEncoding;
      const backing=.034;
      batch(trim,darkTimber,x,y,headerFace+backing/2-.002,2.829,.464,backing);
      const sign=new T.Mesh(new T.PlaneGeometry(2.8,.44),new T.MeshBasicMaterial({map:texture}));
      sign.position.set(x,y,headerFace+backing);scene.add(reflected(sign));
    }
    rooms.forEach((room,r)=>{
      const {x,z,width:w,depth:d}=room,h=galleryHeights[r];
      const wallReach=w/2-pavilionInset,entryReach=d/2-pavilionInset;
      const headerBottom=h-.102,headerHeight=.265,headerDepth=.33;
      const headerCenter=headerBottom+headerHeight/2;
      const roof=r===1 || r===3?cedar:blueTiles;
      galleryRoof(room,h,profiles[r],roof,[.42,.64,.63,.32,.53][r]);
      deck(x,z,w,d,.218,true);
      for(const side of [-1,1]){
        const wallX=x+side*wallReach;
        const rimX=x+side*(w/2-.09);
        batch(trim,darkTimber,rimX,-.115,z,.17,.22,d-.04);
        for(const dz of [-d/2+.58,0,d/2-.58])deckPile(x+side*(w/2-.31),z+dz);
        batch(poolGeo,contact,wallX-side*.17,.007,z,.44,1,entryReach*2);
        batch(ceilingTimber,darkTimber,wallX,headerCenter,z,.28,headerHeight,entryReach*2-headerDepth);
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
          stoneWall(true,z+dz,Math.min(post,wallX),Math.max(post,wallX));
          galleryPost(post,z+dz,.25,.27,h);
          batch(trim,bronze,post,h-.30,z+dz,.30,.078,.31);
          batch(poolGeo,contact,wingX,.008,z+dz-Math.sign(dz)*.141,wing,1,.42);
          // Extend both ends past the bearing faces so they seat in the post and header.
          const rise=.58,run=.51;
          batch(braceTimber,cedar,post+side*(.045+run/2),headerBottom+.07-rise/2,z+dz,
            Math.hypot(run,rise),.122,.166,0,side*Math.atan2(rise,run));
        }
      }
      for(const dz of [-entryReach,entryReach]){
        batch(ceilingTimber,cedar,x,headerCenter,z+dz,headerDepth,headerHeight,wallReach*2+.28,Math.PI/2);
        lantern(x-1.22,h-.85,z+dz,.67,true,h+.48,headerBottom+.014);
        lantern(x+1.22,h-.85,z+dz,.67,true,h+.48,headerBottom+.014);
      }
      if(r===4){
        const windowRing=new T.TorusGeometry(.81,.065,8,44);
        for(const side of [-1,1]){
          const wx=x+side*(wallReach+1.65)/2,wz=z-entryReach;
          batch(windowRing,cedar,wx,1.86,wz,1,1,1);
          batch(cube,cedar,wx,1.02,wz,.10,.30,.11);
          batch(cube,bronze,wx,1.58,wz,1.48,.026,.05);
        }
      }else if(r===1 || r===3){
        for(const side of [-1,1]){
          const wz=z+entryReach-.12,wing=wallReach-1.65;
          const count=r===1?7:4;
          const sill=r===1?h-.76:1.75;
          const slatHigh=headerBottom+.045,slatLow=sill+.012;
          for(let i=1;i<=count;i++)
            batch(cube,cedar,x+side*(1.65+i*wing/(count+1)),
              (slatHigh+slatLow)/2,wz,.052,slatHigh-slatLow,.064);
          batch(ceilingTimber,cedar,x+side*(1.65+wing/2),sill,wz,.072,.065,wing,Math.PI/2);
        }
      }
      roomSign(room,x,headerCenter,z+entryReach+headerDepth/2);
      room.photos.forEach((id,j)=>{
        const side=j%2?1:-1, count=Math.ceil((room.photos.length-(side===1?1:0))/2);
        const pz=z+d/2-(Math.floor(j/2)+.5)*d/count, px=x+side*(w/2-.39);
        const angle=-side*Math.PI/2,[,,aw,ah]=atlas.regions[id];
        const ph=Math.min(1.72,2.48*ah/aw),pw=ph*aw/ah,mid=1.86;
        const backingX=px+.14*side;
        batch(beam,darkTimber,backingX,mid,pz,pw+.42,ph+.42,.16,angle);
        batch(trim,cedar,px+.078*side,mid,pz,pw+.31,ph+.31,.15,angle);
        batch(trim,bronze,px+.039*side,mid,pz,pw+.19,ph+.19,.097,angle);
        batch(trim,linen,px,mid,pz,pw+.14,ph+.14,.06,angle);
        blockWalking(px+.085*side,pz,.27,pw+.42);
        const wallX=x+side*wallReach,base=wallCapTop,frameBottom=mid-(ph+.42)/2;
        const hangerTop=frameBottom+.27;
        // Seat the arms in the rear timber and the uprights behind it.
        const armSeat=backingX-.035*side,armEnd=wallX+.030*side;
        batch(trim,pictureMetal,px+.216*side,mid,pz,.105,ph*.72,pw*.79);
        for(const dz of [-pw*.32,pw*.32]){
          batch(trim,pictureMetal,wallX,base+.018,pz+dz,.20,.039,.15);
          batch(trim,pictureMetal,wallX,(base+hangerTop)/2,pz+dz,.079,hangerTop-base,.088);
          batch(trim,pictureMetal,(armSeat+armEnd)/2,hangerTop,pz+dz,Math.abs(armEnd-armSeat),.070,.108);
        }
        const pictureX=px-.198*side,pictureY=mid+ph/2+.18;
        const lightWidth=Math.min(.77,pw*.51);
        batch(trim,pictureMetal,pictureX,pictureY,pz,.103,.069,lightWidth);
        batch(trim,pictureBulb,pictureX,pictureY-.034,pz,.045,.012,lightWidth-.065);
        for(const dz of [-lightWidth*.31,lightWidth*.31]){
          batch(trim,pictureMetal,px+.079*side,pictureY-.046,pz+dz,.078,.129,.072);
          batch(trim,pictureMetal,px-.057*side,pictureY,pz+dz,.287,.029,.035);
        }
        const pic=new T.Mesh(photoGeometry(id,pw,ph),photoMat);
        pic.position.set(px-.043*side,mid,pz);pic.rotation.y=angle;pic.userData.index=stations.length;
        scene.add(pic);portraits.push(pic);stations.push({x:px-side*3.55,z:pz,angle,room});
        const lampX=px-side*.54,lampZ=pz+pw/2+.38;
        const glass=new T.Mesh(new T.PlaneGeometry(pw+.095,ph+.095),pictureGlass);
        glass.position.set(px-.050*side,mid,pz);
        glass.rotation.y=angle;
        glass.onBeforeRender=()=>{
          pictureGlass.uniforms.nearbyLantern.value.set(lampX,2.62,lampZ);
          pictureGlass.uniformsNeedUpdate=true;
        };
        scene.add(glass);
        batch(beam,darkTimber,(wallX+lampX)*.5,h-.045,lampZ,.94,.098,.106);
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
    for(const {geometry,material,matrices} of batches.values()){
      const objects=new T.InstancedMesh(geometry,material,matrices.length);
      matrices.forEach((m,i)=>objects.setMatrixAt(i,m));objects.frustumCulled=false;scene.add(reflected(objects));
    }

    // Lower lanterns drift beside the walk, close enough to watch their
    // reflections travel across the water from both banks of the boardwalk.
    lanternSpans.forEach(([[sx,sz],[ex,ez]],i)=>{
      const side=i%2===0?1:-1;
      const x=(sx+ex)/2,z=(sz+ez)/2;
      const lamp=lantern(x+side*7.4,1.65+(i%3)*.40,z,.81+(i%4)*.075);
      const galleryCrossings=rooms.length-1;
      if(movingValues && (i<galleryCrossings || (i-galleryCrossings)%2===0)){
        const span=bridges.find(b=>b.sx===sx && b.sz===sz);
        const along=new T.Vector3(span.x-sx,0,span.z-sz).normalize();
        const outward=new T.Vector3(-along.z,0,along.x).multiplyScalar(side);
        const distance=span.length<2?span.length+.03:span.length*.48;
        const center=new T.Vector3(sx,1.38,sz).addScaledVector(along,distance).addScaledVector(outward,2.38);
        const axis=outward.clone().multiplyScalar(-.82).addScaledVector(along,.10);
        axis.y=-.55;axis.normalize();
        lamp.movingPath={center,axis,along,outward,phase:i*.53};
        movingLanterns.push(lamp);
      }
      if(i%3===0)lantern(x-side*6.8,3.4,z-2.4,.87);
    });
    // Individual nearby lanterns show the bamboo hoops and translucent paper.
    for(let i=0;i<44;i++){
      const angle=fullTurn*(i+rand()*.7)/44,dist=14+rand()*15;
      lantern(Math.sin(angle)*dist,4+rand()*7,-Math.cos(angle)*dist,.55+rand()*1.12);
    }
    const architectureMaterials=[stone,edge,bronze,plinth,linen,photoMat,pictureMetal,timber,blueTiles,
      cedar,uprightCedar,walkwayTrim,headerPlank,railWood,lowerRail,railFoot,railCap,plaster,darkTimber,mortar];
    if(supportsShadows)shadowValues=riverShadows.uniforms(T,rooms,shadowLamps,moonDirection.value);
    lightArchitecture(architectureMaterials);
    function architectureBoxes(){
      const boxes=bounceBoxes.slice();
      for(const {geometry,material,matrices} of batches.values()){
        if(!architectureMaterials.includes(material) || geometry.type==='TorusGeometry'
          || (material===railFoot && geometry===handrailGeometry))continue;
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
    const cords=new T.InstancedMesh(new T.CylinderGeometry(.010,.010,1,8),bamboo,hanging.length);
    cords.frustumCulled=false;
    scene.add(reflected(cords));
    const cord=new T.Object3D(),knottedEnd=new T.Vector3(),cordVector=new T.Vector3();
    const cordUp=new T.Vector3(0,1,0);
    const support=new T.Object3D(),localPart=new T.Object3D(),partMatrix=new T.Matrix4();
    function updateLanterns(time){
      nightTime.value=reduced.matches?0:time;
      const t=nightTime.value;
      lanterns.forEach(({x,y,z,size,phase,glow,fixture,mountHeight,cordIndex,movingPath},i)=>{
        const lift=Math.sin(t*.36+phase), drift=Math.sin(t*.21+phase*1.2);
        if(movingEnabled && movingPath){
          const {center,along,outward,phase:offset}=movingPath;
          support.position.copy(center)
            .addScaledVector(outward,.24*Math.sin(t*.54+offset))
            .addScaledVector(along,-1.18*Math.sin(t*.62+offset));
          support.position.y+=.13*Math.sin(t*.88+offset)-.31*size;
        }else if(mountHeight){
          support.position.set(x+.057*drift,y+.024*lift,z+.034*Math.cos(t*.24+phase));
        }else if(fixture){
          support.position.set(x+.12*drift,y+.17*lift,z+.078*Math.cos(t*.24+phase));
        }else{
          const flight=t*(.14+.014*(i%5))+phase;
          support.position.set(
            x+2.55*Math.sin(flight),
            y+.73*Math.sin(flight-.65)+.10*lift,
            z+3.6*Math.cos(flight)
          );
        }
        support.rotation.set(.04*lift,phase+.12*drift,.07*drift);
        support.scale.setScalar(size);support.updateMatrix();
        lanternMeshes.forEach((obj,j)=>{
          localPart.position.set(0,j===4?.088:0,0);localPart.rotation.set(0,j===3?Math.PI/2:0,0);
          localPart.updateMatrix();partMatrix.multiplyMatrices(support.matrix,localPart.matrix);
          obj.setMatrixAt(i,partMatrix);
        });
        if(mountHeight){
          knottedEnd.set(0,.679,0).applyMatrix4(support.matrix);
          cordVector.set(x,mountHeight,z).sub(knottedEnd);
          cord.position.copy(knottedEnd).addScaledVector(cordVector,.5);
          cord.scale.set(1,cordVector.length(),1);
          cord.quaternion.setFromUnitVectors(cordUp,cordVector.normalize());
          cord.updateMatrix();
          cords.setMatrixAt(cordIndex,cord.matrix);
        }
        glow.position.set(support.position.x,support.position.y+.31*size,support.position.z);
        glow.scale.setScalar(size*(1.13+.037*lift));
      });
      lanternMeshes.forEach(obj=>obj.instanceMatrix.needsUpdate=true);
      cords.instanceMatrix.needsUpdate=true;
    }

    if(location.protocol!=='file:'){
      new T.TextureLoader().load('photos/01.webp',texture=>{
        texture.encoding=T.sRGBEncoding;
        photoUniforms.photograph.value=texture;
        photoUniforms.photoRegion.value.set(0,0,1,1);
      });
    }
    const lights=riverPortrait.lights;
    const formation=new T.Group();formation.visible=false;scene.add(formation);
    const skyWidth=13.5,skyHeight=skyWidth*riverPortrait.height/riverPortrait.width;
    const apparition=new T.Mesh(new T.PlaneGeometry(skyWidth,skyHeight),new T.ShaderMaterial({
      uniforms:{...photoUniforms,reveal:{value:0}},transparent:true,depthWrite:false,
      vertexShader:`varying vec2 coord;void main(){coord=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader:`${samplePortrait}
        uniform float reveal;varying vec2 coord;
        void main(){
          vec3 fur=furColor(coord);
          float light=dot(fur,vec3(.213,.715,.072));
          vec3 moonlit=mix(fur,vec3(.68,.78,1.)*light,.38);
          gl_FragColor=vec4(moonlit*1.22,texture2D(furMask,coord).a*reveal);
          #include <encodings_fragment>
        }`
    }));
    apparition.position.z=-.85;apparition.renderOrder=1;formation.add(apparition);
    const shades=new T.InstancedMesh(shadeGeometry,candlePaper(paper.clone()),lights.length);
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
      water.material.uniforms.portraitLight.value=T.MathUtils.smoothstep(t,0,2);
      formation.visible=t>=5.5;
      if(!formation.visible)return;
      const scale=Math.min(1.15,camera.aspect*1.65);
      const rise=reduced.matches?0:Math.min(8,Math.max(0,t-13.5)*.39);
      formation.scale.setScalar(scale);
      formation.position.set(ex,7.8+rise,ez-23);
      apparition.material.uniforms.reveal.value=.62*T.MathUtils.smoothstep(t,6.5,12);
      for(let i=0;i<lights.length;i++){
        const p=lights[i],from=starts[i],clock=reduced.matches?0:t;
        const settle=reduced.matches?1:T.MathUtils.smoothstep(t,5.5+p.phase*.19,11+p.phase*.32);
        const x=(p.x/riverPortrait.width-.5)*skyWidth+.07*Math.sin(clock*.33+p.phase);
        const y=(.5-p.y/riverPortrait.height)*skyHeight+.085*Math.cos(clock*.28+p.phase);
        matrix.position.set(T.MathUtils.lerp(from.x,x,settle),
          T.MathUtils.lerp(-7.5/scale+from.y,y,settle),T.MathUtils.lerp(from.z,p.depth,settle));
        matrix.rotation.set(0,p.phase,.09*Math.sin(clock*.24+p.phase));
        matrix.scale.setScalar(p.size*T.MathUtils.smoothstep(t,5.5,7.4));
        matrix.updateMatrix();shades.setMatrixAt(i,matrix.matrix);hoops.setMatrixAt(i,matrix.matrix);
        matrix.position.y+=matrix.scale.x*.3;matrix.rotation.set(0,0,0);matrix.scale.multiplyScalar(1.52);
        matrix.updateMatrix();halos.setMatrixAt(i,matrix.matrix);
      }
      for(const mesh of [shades,hoops,halos])mesh.instanceMatrix.needsUpdate=true;
    }
    let yaw=0,pitch=0,drag=null,guideTarget=-1,elapsed=-1,lastLocation=null;
    const caster=new T.Raycaster();
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
    async function changeShadows(){
      const selection=++shadowSelection,mode=Number(shadowControl.value);
      shadowControl.setAttribute('aria-busy',String(mode>0));
      try{
        if(mode>0){
          const [mask,depth]=await Promise.all([
            loadShadowTexture('river-shadow-mask.png?v=recessed-photo-mounts'),
            mode>1?loadShadowTexture('river-shadow-depth.png?v=recessed-photo-mounts',true):null
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
          if(dialog.open && !view.hidden)draw();
        }
      }
    }
    if(shadowValues){
      shadowControl.hidden=false;
      shadowControl.addEventListener('change',changeShadows);
    }
    function toggleMovingShadows(){
      if(!movingEnabled && !movingEffect){
        try{
          const matrices=architectureBoxes().map(box=>box.matrix);
          movingEffect=riverShadows.createMoving(T,renderer,movingValues,matrices,screenMaterial,drawPass);
        }catch(error){
          console.warn('Moving lantern shadows are unavailable:',error);
          movingButton.disabled=true;
          return;
        }
      }
      movingEnabled=!movingEnabled;
      movingButton.setAttribute('aria-pressed',String(movingEnabled));
      movingButton.textContent=movingEnabled?'Moving shadows on':'Moving shadows off';
      for(const material of architectureMaterials)material.needsUpdate=true;
      updateLanterns(nightTime.value);
      draw();
    }
    if(movingLanterns.length){
      movingButton.hidden=false;
      movingButton.addEventListener('click',toggleMovingShadows);
    }
    function toggleGI(){
      const enabled=!giUniforms.riverGIEnabled.value;
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
      draw();
    }
    if(supportsGI){
      giButton.hidden=false;
      giButton.addEventListener('click',toggleGI);
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
      if(giUniforms?.riverGIEnabled.value)giEffect.update(nightTime.value);
      if(movingEnabled){
        const nearby=movingLanterns.map(lamp=>{
          const distance=camera.position.distanceTo(lamp.movingPath.center);
          const visibility=1-T.MathUtils.smoothstep(distance,15,22);
          const power=visibility*(.96+.04*Math.sin(nightTime.value*3.2+lamp.movingPath.phase));
          return {lamp,distance,power};
        }).filter(light=>light.power>0).sort((a,b)=>a.distance-b.distance).slice(0,movingValues.movingLampPower.value.length);
        movingEffect.update(nightTime.value,nearby);
      }
      sky.position.set(camera.position.x,0,camera.position.z);
      camera.updateMatrixWorld();
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
    function resize(){
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
      camera.aspect=w/h;camera.updateProjectionMatrix();draw();
    }
    new ResizeObserver(resize).observe(view);
    function shortest(a){return Math.atan2(Math.sin(a),Math.cos(a))}
    let guidePoints=[],guideHeading=0,arrival=null;
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
      setGuide(-1);
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
      const skyPitch=Math.atan2(formation.position.y-poolView.position.y,poolView.position.z-formation.position.z);
      pitch=T.MathUtils.lerp(arrival.pitch,T.MathUtils.lerp(waterPitch,skyPitch,lift),ease);
      if(elapsed>=releaseControlsAt){
        arrival=null;
        walkPanel.inert=false;
      }
    }
    function setGuide(index){
      guideTarget=index;
      guide.textContent=index>=0?'Pause walk':elapsed>=0 && Math.hypot(camera.position.x-ex,camera.position.z-ez)<4?'Watch again':'Follow the river';
      guide.setAttribute('aria-pressed',String(index>=0));
    }
    function follow(){
      if(guideTarget>=0){setGuide(-1);return}
      const p=camera.position,room=riverWalk.roomAt(p.x,p.z);
      if(elapsed>=0 && Math.hypot(p.x-ex,p.z-ez)<4){
        beginFarewell();return;
      }
      guidePoints=[];
      const center=room?[room.x,p.z]:riverWalk.bridgeCenter(p.x,p.z);
      if(center)guidePoints.push(center);
      const fromZ=center?.[1]??p.z;
      guidePoints.push(...route.filter(([,z])=>z<fromZ-.02));
      if(p.z>ez-1.6)guidePoints.push([ex,ez-1.65]);
      if(!guidePoints.length)return;
      guideHeading=yaw;setGuide(0);
    }
    function advanceGuide(dt){
      const [x,z]=guidePoints[guideTarget],p=camera.position;
      const dx=x-p.x,dz=z-p.z,d=Math.hypot(dx,dz);
      if(d>.01){
        guideHeading=Math.atan2(-dx,-dz);
        const step=Math.min(1,dt*3.25*(fastWalk?2.2:1)/d);
        walk(dx*step,dz*step);
      }
      yaw+=shortest(guideHeading-yaw)*Math.min(1,dt*3.5);
      pitch+=(.015-pitch)*Math.min(1,dt*2);
      if(d<.07)setGuide(guideTarget+1<guidePoints.length?guideTarget+1:-1);
    }
    function go(index,reset=false){
      if(reset){arrival=null;walkPanel.inert=false;elapsed=-1;showFinale(-1)}
      if(arrival)return;
      untilStep=.52;lastLocation=null;
      if(index===finalIndex && elapsed<0){
        const [x,z]=trail[0];camera.position.set(x,1.62,z-.65);yaw=0;pitch=-.035;
        current=finalIndex;pathCaption('The long boardwalk','Follow the lanterns downstream');
      }else if(index===finalIndex){
        camera.position.set(ex,1.62,ez-1.4);yaw=0;pitch=-.46;select(index);
      }else{
        const stop=stations[index];
        camera.position.set(stop.x,1.62,stop.z+(reset?1.78:0));
        yaw=reset?Math.atan2(camera.position.x-portraits[index].position.x,1.78):stop.angle;
        pitch=reset?.06:.055;select(index);
      }
      setGuide(-1);camera.rotation.set(pitch,yaw,0,'YXZ');draw();
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
    function update(dt,time){
      const p=camera.position;
      if(!arrival){
        const walkDt=Math.min(.18,dt);
        if(held.size)setGuide(-1);
        if(guideTarget>=0)advanceGuide(walkDt);
        else move(Number(held.has('strafeRight'))-Number(held.has('strafeLeft')),
                  Number(held.has('forward'))-Number(held.has('back')),
                  Number(held.has('left'))-Number(held.has('right')),walkDt);
        if(elapsed<0 && Math.abs(p.x-ex)<3 && p.z<ez-1.18)beginFarewell();
      }
      if(elapsed>=0){
        elapsed+=dt;showFinale(elapsed);
        if(arrival)frameFarewell();
      }
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
      camera.rotation.set(pitch,yaw,0,'YXZ');updateLanterns(time);draw();
    }
    guide.addEventListener('click',follow);
    canvas.addEventListener('pointerdown',e=>{
      if(arrival || drag || e.button!==0)return;
      setGuide(-1);view.focus({preventScroll:true});
      drag={id:e.pointerId,x:e.clientX,y:e.clientY,yaw,pitch,moved:false};
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove',e=>{
      if(!drag || e.pointerId!==drag.id)return;
      const dx=e.clientX-drag.x,dy=e.clientY-drag.y;
      if(Math.abs(dx)+Math.abs(dy)>5)drag.moved=true;
      yaw=drag.yaw-dx*.004;pitch=T.MathUtils.clamp(drag.pitch-dy*.003,-1.40,1.10);
    });
    canvas.addEventListener('pointerup',e=>{
      if(!drag || e.pointerId!==drag.id)return;
      if(!drag.moved){
        const r=canvas.getBoundingClientRect();
        caster.setFromCamera({x:2*(e.clientX-r.left)/r.width-1,y:1-2*(e.clientY-r.top)/r.height},camera);
        const hit=caster.intersectObjects(portraits.filter(photo=>photo.visible))[0];
        let index=hit && hit.distance<9?hit.object.userData.index:null;
        if(elapsed>0 && Math.hypot(camera.position.x-ex,camera.position.z-ez)<4 &&
           caster.ray.intersectPlane(waterPlane,poolHit) && poolHit.z<ez-2.35){
          poolHit.project(poolView);
          if(poolHit.x**2+poolHit.y**2<.85 && poolHit.z<1)index=finalIndex;
        }
        if(index!==null){select(index);enlarge.focus();enlarge.click()}
      }
      drag=null;
    });
    canvas.addEventListener('lostpointercapture',()=>drag=null);
    canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();showFallback()});
    resize();updateLanterns(0);go(current,true);
    ready=true;
    if(shadowValues)void changeShadows();
    return {go,update,resize,step(action){
      if(arrival)return;
      setGuide(-1);move(0,action==='forward'?1:action==='back'?-1:0,action==='left'?1:action==='right'?-1:0,.17);
    }};
  }

  function stopFrames(){
    held.clear();fastWalk=false;cancelAnimationFrame(frame);frame=0;previousTime=0;
  }
  function animate(now){
    frame=0;
    if(!dialog.open || document.hidden || !garden || !fallback.hidden)return;
    if(!viewer.open)garden.update(previousTime?(now-previousTime)/1000:0,now/1000);
    previousTime=now;frame=requestAnimationFrame(animate);
  }
  function startFrames(){
    if(!frame && garden && dialog.open && !document.hidden && fallback.hidden)frame=requestAnimationFrame(animate);
  }
  function showFallback(error){
    if(error)console.warn('The 3D memorial could not start:',error);
    stopFrames();walkPanel.inert=false;fallback.hidden=false;movement.hidden=true;view.hidden=true;
    if(giButton)giButton.hidden=true;
    if(shadowControl)shadowControl.hidden=true;
    if(movingButton)movingButton.hidden=true;
    select(current);
  }
  function prepare(){
    if(preparing)return preparing;
      const atlasRequest=new Promise((resolve,reject)=>{
      const script=document.createElement('script');
      script.src='garden-atlas.js';
      script.onload=()=>resolve(gardenAtlas);
      script.onerror=()=>reject(new Error('Offline photo atlas unavailable'));
      document.head.appendChild(script);
      });
      const textureLoader=new THREE.TextureLoader();
      // Poly Haven CC0. The finish maps pack height, roughness and grain.
      const woodRequest=textureLoader.loadAsync('materials/wood-finish.webp?v=2').catch(()=>null);
      const slateRequest=textureLoader.loadAsync('materials/slate-finish.webp').catch(()=>null);
      const deckRequest=textureLoader.loadAsync('materials/deck-color.webp').catch(()=>null);
      preparing=Promise.all([atlasRequest,woodRequest,slateRequest,deckRequest]).then(([atlas,wood,slate,deck])=>{
        garden=makeGarden(atlas,{wood,slate,deck});
      startFrames();
    }).catch(showFallback);
    return preparing;
  }
  function enter(userGesture){
    if(dialog.open)return;
    dialog.showModal();
    select(0);
    if(userGesture){playMusic();startAmbience()}
    if(garden){garden.resize();garden.go(0,true);startFrames()}
    else prepare();
    if(!view.hidden)view.focus({preventScroll:true});
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
    enter(true);
  }));
  dialog.addEventListener('cancel',e=>{e.preventDefault();leave()});
  dialog.addEventListener('close',()=>{
    stopFrames();walkPanel.inert=false;pauseMusic();music.currentTime=0;
    ambienceActivated=false;ambience.pause();
    entrance?.focus({preventScroll:true});
  });
  document.querySelector('#leave-garden').addEventListener('click',leave);
  window.addEventListener('hashchange',()=>{
    if(location.hash==='#memorial')enter(false);
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
    if(e.target===shadowControl)return;
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
    if(document.hidden){stopFrames();pauseMusic();ambience.pause()}
    else if(dialog.open){startFrames();playMusic();if(ambienceActivated)startAmbience()}
  });
  if(matchMedia('(pointer:coarse)').matches){
    document.querySelector('#garden-directions').textContent='Hold arrows to walk · Drag to look';
  }
  audioLabel();
  if(location.hash==='#memorial')enter(false);
})();
