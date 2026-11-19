(() => {
  const dialog = document.querySelector('#memorial');
  const view = dialog.querySelector('.garden-view');
  const fallback = dialog.querySelector('.garden-fallback');
  const movement = dialog.querySelector('.garden-movement');
  const walkPanel = dialog.querySelector('.garden-bottom');
  const music = document.querySelector('#garden-music');
  const sound = document.querySelector('#garden-sound');
  const viewer = document.querySelector('#viewer');
  const enlarge = document.querySelector('#garden-enlarge');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const {rooms, bridges, route, trail, end} = riverWalk;
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
    if(e.target.closest('#garden-ambience, #leave-garden') || e.key==='Escape')return;
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

  function makeGarden(atlas) {
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
    const moonRim=new T.DirectionalLight(color('#83aee7'),.42);
    moonRim.position.set(-27,9,32);
    scene.add(hemi,blueLight,moonRim);
    const reflectionLayer=1;
    const reflected=obj=>{obj.layers.enable(reflectionLayer);return obj};
    const galleryHeights=[3.5,3.23,4.05,3.65,3.25];

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
      uniforms:{deep:{value:color('#030817')},blue:{value:color('#173970')},mist:{value:color('#284353')}},
      vertexShader:`varying vec3 place;
        void main(){place=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader:`uniform vec3 deep,blue,mist;varying vec3 place;
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
        gl_FragColor=vec4(c,1.);
        #include <encodings_fragment>
        }`
    }));
    scene.add(reflected(sky));

    function riverCenter(z){return 6.7*Math.sin((z+10)*.046)+.013*z}
    function riverWidth(z){return 19+3.2*Math.sin(z*.057+.2)}
    function bankX(z,side){return riverCenter(z)+side*riverWidth(z)}
    // Low banks leave a clear channel through the lights toward the horizon.
    for(const side of [-1,1]){
      const pos=[],shades=[],idx=[];
      for(let row=0;row<=225;row++){
        const z=-270+row*1.7;
        const crest=.85+.5*Math.sin(z*.18+side)+.19*Math.sin(z*.73);
        for(const [offset,h,tint] of [[0,waterLevel-.15,'#030c16'],[1.2,.23,'#0a1926'],[3.4,crest,'#0e2431'],[23,crest+1.2,'#07141e']]){
          pos.push(bankX(z,side)+side*offset,h,z);shades.push(...color(tint).toArray());
        }
        if(row<225)for(let j=0;j<3;j++){const n=row*4+j;idx.push(n,n+1,n+4,n+1,n+5,n+4)}
      }
      const g=new T.BufferGeometry();g.setIndex(idx);g.setAttribute('position',new T.Float32BufferAttribute(pos,3));
      g.setAttribute('color',new T.Float32BufferAttribute(shades,3));
      scene.add(reflected(new T.Mesh(g,new T.MeshBasicMaterial({vertexColors:true,side:T.DoubleSide}))));
    }
    // A reflected camera captures the actual lanterns and banks. The water samples
    // this view through moving ripples, breaking orange reflections into short strokes.
    const reflection=new T.WebGLRenderTarget(512,256,{minFilter:T.LinearFilter,magFilter:T.LinearFilter,format:T.RGBAFormat});
    reflection.texture.encoding=T.LinearEncoding;
    const mirror=new T.PerspectiveCamera();mirror.layers.set(reflectionLayer);
    const reflectionMatrix=new T.Matrix4(), gaze=new T.Vector3();
    const reflectionClip=[new T.Plane(new T.Vector3(0,1,0),-waterLevel+.018)];
    const reflectionPixel=new T.Vector2();
    const [ex,ez]=end;
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
        portraitLight:{value:0},navy:{value:color('#020712')},teal:{value:color('#10515e')}},
      vertexShader:`uniform mat4 projection;varying vec4 reflected;varying vec3 world;
        void main(){vec4 p=modelMatrix*vec4(position,1.);world=p.xyz;reflected=projection*p;
        gl_Position=projectionMatrix*viewMatrix*p;}`,
      fragmentShader:`${samplePortrait}
        uniform mat4 poolProjection;uniform sampler2D reflectedView;uniform float time,portraitLight;uniform vec3 navy,teal;
        uniform vec2 reflectionPixel;
        varying vec4 reflected;varying vec3 world;

        vec3 reflectedLight(vec2 uv,vec2 blur){
          vec3 light=texture2D(reflectedView,uv).rgb*.48;
          light+=.065*(texture2D(reflectedView,uv+vec2(blur.x,0.)).rgb
                      +texture2D(reflectedView,uv-vec2(blur.x,0.)).rgb
                      +texture2D(reflectedView,uv+vec2(0.,blur.y)).rgb
                      +texture2D(reflectedView,uv-vec2(0.,blur.y)).rgb);
          light+=.065*(texture2D(reflectedView,uv+blur).rgb
                      +texture2D(reflectedView,uv-blur).rgb
                      +texture2D(reflectedView,uv+vec2(-blur.x,blur.y)).rgb
                      +texture2D(reflectedView,uv+vec2(blur.x,-blur.y)).rgb);
          return light;
        }
        void main(){
          vec2 p=world.xz;
          vec3 ray=cameraPosition-world;
          float dist=length(ray);
          float grazing=1.-clamp(ray.y/dist,0.,1.);
          float swell=dot(p,vec2(.50,1.29))-time*.58;
          float ripple=dot(p,vec2(-2.10,5.6))+sin(swell)*1.5+time*1.16;
          float chop=dot(p,vec2(3.5,11.8))-sin(p.x*.86)*1.8-time*1.49;
          float detail=1.-smoothstep(.35,2.3,fwidth(chop));
          float wave=sin(ripple)+.31*sin(chop)*detail;
          float waveSlope=.58*cos(swell)+.42*cos(ripple)+.32*cos(chop)*detail;
          float still=portraitLight*(1.-smoothstep(3.,13.,abs(p.x+2.)))*smoothstep(202.,208.,-p.y);
          vec2 uv=.5+.5*reflected.xy/reflected.w;
          // Preserve the structure of the planar image at grazing angles.
          vec2 offset=vec2(.0015*wave+.00075*sin(swell),.0020*waveSlope)
                     *mix(1.,.53,grazing)*mix(1.,.32,still);
          vec2 blur=max(reflectionPixel*.83,vec2(.0010,.0030)*mix(1.,.42,grazing));
          vec3 lights=reflectedLight(clamp(uv+offset,blur,1.-blur),blur);
          float fresnel=.045+.955*pow(grazing,5.0);
          float warm=max(0.,lights.r-lights.b);
          float stroke=.94+.06*sin(ripple)*detail;
          vec3 rippleNormal=normalize(vec3(.017*cos(swell)-.031*cos(chop)*detail,1.,
                                          .045*waveSlope));
          vec3 skyHalfway=normalize(normalize(ray)+normalize(vec3(-.42,.48,.77)));
          float skySheen=pow(max(0.,dot(rippleNormal,skyHalfway)),20.);
          float nearby=(1.-smoothstep(8.,28.,dist))*(1.-.80*still);
          vec3 closeRipples=vec3(.009,.018,.032)*nearby*(.12+.72*skySheen)
                            *(.46+.54*smoothstep(-.55,.82,waveSlope));
          vec3 deepWater=navy+teal*(.020+.011*waveSlope)*exp(-.024*dist)+closeRipples;
          vec3 river=mix(deepWater,lights*stroke,fresnel)+vec3(1.,.52,.22)*warm*.11;
        if(still>.001){
          vec4 projected=poolProjection*vec4(world,1.);
          vec2 q=projected.xy/projected.w*.5+.5;
          q+=vec2(.0036*wave,.0024*waveSlope);
          if(projected.w>0. && all(greaterThan(q,vec2(0.))) && all(lessThan(q,vec2(1.)))){
            float fur=texture2D(furMask,q).a;
            float blanket=.27*(1.-smoothstep(.32,.50,length(q-.5)));
            float strength=(.71+.15*stroke)*max(fur,blanket)*portraitLight;
            vec3 pigment=furColor(q)*vec3(.83,.93,1.);
            float crest=smoothstep(.87,.995,sin(ripple+.55*sin(chop)));
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
    const stonePores=painted(128,(ctx,n)=>{
      const random=seedRandom();
      ctx.fillStyle='#aaaaaa';ctx.fillRect(0,0,n,n);
      for(let i=0;i<2100;i++){
        const x=random()*n,y=random()*n,r=.15+random()*.65;
        ctx.fillStyle=i%4?'#50505066':'#e5e5e577';
        ctx.beginPath();ctx.arc(x,y,r,0,fullTurn);ctx.fill();
      }
    });
    stonePores.encoding=T.LinearEncoding;
    stonePores.wrapS=stonePores.wrapT=T.RepeatWrapping;
    const stone = new T.MeshStandardMaterial({map:limestone,color:color('#89939e'),roughness:.86});
    const edge = new T.MeshStandardMaterial({map:limestone,color:color('#849fa8'),roughness:.49});
    const bronze = new T.MeshStandardMaterial({color:color('#bc9b71'),roughness:.43,metalness:.28});
    const plinth = new T.MeshStandardMaterial({color:color('#44535a'),roughness:.95});
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

    const atlasMap=new T.TextureLoader().load(atlas.image,()=>draw(),undefined,()=>showFallback());
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
      const pixels=new Uint8Array(cells*slots*8);
      rows.forEach((row,i)=>row.forEach((lamp,j)=>{
        const index=(i*slots+j)*8;
        // Pack two bytes per coordinate for stable positions on WebGL 1 and 2.
        const coords=[(lamp.x+32)/64,(lamp.y+.31*lamp.size)/8,(lamp.z+224)/256];
        coords.forEach((coord,axis)=>{
          const value=Math.round(T.MathUtils.clamp(coord,0,1)*65535);
          pixels[index+axis]=value>>8;
          pixels[index+axis+4]=value&255;
        });
        pixels[index+3]=Math.round(lamp.size*128);
        pixels[index+7]=Math.round(lamp.canopy*31.875);
      }));
      const lightmap=new T.DataTexture(pixels,slots*2,cells,T.RGBAFormat);
      lightmap.needsUpdate=true;
      const warm={value:color('#ffc094')};
      const roomBounds=rooms.map(({x,z,width,depth})=>new T.Vector4(x,z,width/2,depth/2));
      for(const material of materials){
        const isStone=material.map===limestone;
        const isCap=material===edge;
        const isPrint=material===photoMat,isMat=material===linen,isDeck=material===timber;
        const profile=isStone?'stone':isPrint?'print':isMat?'mat':isDeck?'deck':'lanterns';
        material.customProgramCacheKey=()=>'river-'+profile;
        material.onBeforeCompile=shader=>{
          addRiverMist(shader);
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
              for(int slot=0;slot<${slots};slot++){
                float col=(float(slot)*2.+.5)/${(slots*2).toFixed(1)};
                vec4 packedLamp=texture2D(riverFixtures,vec2(col,row));
                if(packedLamp.a<=0.)break;
                vec4 fine=texture2D(riverFixtures,vec2(col+1./${(slots*2).toFixed(1)},row));
                vec3 lamp=(packedLamp.rgb*256.+fine.rgb)/257.*vec3(64.,8.,256.)-vec3(32.,0.,224.);
                vec3 delta=lamp-riverSurface;
                float dist=length(delta);
                float fade=1.-smoothstep(2.15,${range.toFixed(1)},dist);
                float flame=1.+.032*sin(riverFixtureTime*3.4+lamp.z*1.31);
                directLight.direction=mat3(viewMatrix)*(delta/max(dist,.001));
                directLight.color=riverFixtureColor*46.*packedLamp.a*flame*fade/(dot(delta,delta)+.92);
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
                  irradiance+=vec3(1.,.49,.25)*.84*packedLamp.a*spread*indoors*underside;
                }
              }
            }
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
            roughnessFactor=mix(roughnessFactor,.31,wetness*.74);
          `);
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
            shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>',`
              #include <roughnessmap_fragment>
              // Canvas row zero is at the top. Match the staggered joints in the wood maps.
              float plankRow=floor((1.-vUv.y)*${plankRows.toFixed(1)});
              float rowInTile=mod(plankRow,${plankRows.toFixed(1)});
              float joint=.13+.74*mod(rowInTile*7.,${plankRows.toFixed(1)})/${(plankRows-1).toFixed(1)};
              float board=floor(vUv.x-joint);
              float finish=fract(sin(dot(vec2(board,plankRow),vec2(127.1,311.7)))*43758.5453)-.5;
              float detail=1.-smoothstep(.28,1.,max(fwidth(vUv.x),fwidth(vUv.y)*${plankRows.toFixed(1)}));
              roughnessFactor=clamp(roughnessFactor+.19*finish*detail,.29,1.);
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
              vec3 poresUV=riverSurface*2.75;
              float pores=texture2D(riverStonePores,poresUV.zy).g*stoneWeight.x
                         +texture2D(riverStonePores,poresUV.xz).g*stoneWeight.y
                         +texture2D(riverStonePores,poresUV.xy).g*stoneWeight.z;
              float worn=smoothstep(.12,.69,stoneAxis.y)*(1.-smoothstep(.94,.999,stoneAxis.y));
              diffuseColor.rgb*=mapTexelToLinear(grain).rgb*(1.+worn*riverEdgeWear);
            `).replace('#include <roughnessmap_fragment>',`
              #include <roughnessmap_fragment>
              roughnessFactor=clamp(roughnessFactor+(.73-grain.g)*.30+(.67-pores)*.12-worn*.16,.34,1.);
            `).replace('#include <normal_fragment_maps>',`
              #include <normal_fragment_maps>
              // A small amount of relief follows the same unstretched projection.
              vec3 stoneDx=dFdx(-vViewPosition),stoneDy=dFdy(-vViewPosition);
              vec3 stoneTx=cross(stoneDy,normal),stoneTy=cross(normal,stoneDx);
              float stoneDet=dot(stoneDx,stoneTx);
              float stoneHeight=.0028*grain.g+.00062*pores;
              vec3 microRelief=sign(stoneDet)*(stoneTx*dFdx(stoneHeight)+stoneTy*dFdy(stoneHeight));
              normal=normalize(max(abs(stoneDet),1e-7)*normal-microRelief);
            `);
          }
        };
      }
    }
    // Tiered evergreens and a second, hazier tree line give the banks depth.
    const crownProfile=[
      [0,.55],[.29,.35],[.54,.09],[.71,-.20],[1,-.42],[.62,-.47],[0,-.42]
    ].map(([radius,y])=>new T.Vector2(radius,y));
    const crown=new T.LatheGeometry(crownProfile,11);
    const vertices=crown.attributes.position;
    for(let i=0;i<vertices.count;i++){
      const x=vertices.getX(i),y=vertices.getY(i),z=vertices.getZ(i);
      const angle=Math.atan2(z,x),jagged=1+.17*Math.sin(angle*5)+.08*Math.cos(angle*3+.8);
      vertices.setXYZ(i,x*jagged+.16*(y+.50),y+.085*Math.sin(angle*4)*Math.hypot(x,z),z*jagged);
    }
    crown.computeVertexNormals();
    const trunk=new T.CylinderGeometry(.07,.115,1,6);
    const trunkMat=new T.MeshStandardMaterial({color:color('#202729'),roughness:1});
    const treeMats=['#183544','#102a37','#132b35'].map(tint=>
      new T.MeshStandardMaterial({color:color(tint),roughness:1,flatShading:true}));
    for(const material of [trunkMat,...treeMats])material.onBeforeCompile=addRiverMist;
    for(const side of [-1,1]){
      for(let i=0;i<225;i++){
        const z=-266+rand()*362,x=bankX(z,side)+side*(3+rand()*12);
        const height=1.6+rand()**.78*7.6,radius=height*(.115+rand()*.10),spin=rand()*fullTurn;
        const base=.8+.44*Math.sin(z*.18+side);
        batch(trunk,trunkMat,x,base+height*.30,z,1,height*.6,1,spin);
        for(let tier=0;tier<4;tier++){
          const width=radius*(1-tier*.215);
          batch(crown,treeMats[(i+tier)%3],x+Math.sin(spin)*tier*.08,base+height*(.34+tier*.144),
            z,width,height*(.50-tier*.047),width*(.88+.23*Math.sin(spin)),spin+tier*.47);
        }
      }
    }

    // Thousands of distant envelopes use one point draw per pass. Their real
    // positions also render into the river reflection, including on camera turns.
    const cloudPositions=[],cloudData=[];
    for(let i=0;i<1150;i++){
      const side=rand()<.63?-1:1;
      const upstream=rand()<.80;
      const z=upstream?-14-rand()*222:rand()*88-7;
      const rising=rand()>.36;
      const h=rising?1.3+39*Math.pow(rand(),2.2):.48+1.05*rand();
      const x=bankX(z,side)+side*(.45+rand()*1.7)-h*(.13+.23*rand())+(rising?(rand()-.5)*(3.4+h*1.55):0);
      cloudPositions.push(x,h,z);
      cloudData.push(.17+Math.pow(rand(),2)*.49,rand()*fullTurn,rand(),rising?1:0);
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
        p.x+=.18*sin(time*.27+lanternData.y);p.y+=.25*sin(time*.31+lanternData.y);
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
      for(let i=0;i<plankRows;i++){
        const z=i*pitch,joint=n*plankJoints[i];
        ctx.fillStyle=['#8c8377','#9a8f7d','#8a857b','#a19985','#807f75'][i%5];
        ctx.fillRect(0,z,n,pitch);
        ctx.fillStyle='#4d443a';ctx.fillRect(0,z,n,1.35);
        ctx.fillStyle='#d4c3a933';ctx.fillRect(0,z+1.35,n,.65);
        for(let j=0;j<115;j++){
          const x=rand()*n,y=z+3+rand()*(pitch-4),length=4+rand()*160;
          ctx.strokeStyle=j%3?'#493d321f':'#e9d8b523';ctx.lineWidth=.36+rand()*.68;
          const bend=rand()*2-1;
          ctx.beginPath();
          for(const start of x+length>=n?[x,x-n]:[x]){
            ctx.moveTo(start,y);
            ctx.quadraticCurveTo(start+length/2,y+bend,start+length,y+.4);
          }
          ctx.stroke();
        }
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
      const pitch=n/plankRows;
      for(let i=0;i<plankRows;i++){
        const z=i*pitch,joint=n*plankJoints[i];
        const profile=ctx.createLinearGradient(0,z,0,z+pitch);
        profile.addColorStop(0,'#7f7f7f');profile.addColorStop(.075,'#a5a5a5');
        profile.addColorStop(.925,'#a5a5a5');profile.addColorStop(1,'#7f7f7f');
        ctx.fillStyle=profile;ctx.fillRect(0,z,n,pitch+.2);
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
    function deck(x,z,width,depth,thickness){
      const dimensions=width+'x'+depth;
      if(!deckGeometries.has(dimensions)){
        const geometry=cube.clone();
        const uv=geometry.getAttribute('uv'),normal=geometry.getAttribute('normal');
        for(let i=0;i<uv.count;i++){
          if(normal.getY(i)!==0)uv.setXY(i,uv.getX(i)*width/plankLength,uv.getY(i)*depth/plankRepeatLength);
        }
        deckGeometries.set(dimensions,geometry);
      }
      batch(deckGeometries.get(dimensions),timber,x,-thickness/2,z,width,thickness,depth);
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
    const railCap=new T.MeshStandardMaterial({color:color('#c18b54'),roughness:.41,metalness:.2});
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
    const beam=chamferedBlock(.063), trim=chamferedBlock(.035), capBlock=chamferedBlock(.105);
    const plaster=new T.MeshStandardMaterial({map:limestone,color:color('#76858e'),roughness:.78});
    const mortar=new T.MeshStandardMaterial({color:color('#465162'),roughness:.91});
    const darkTimber=new T.MeshStandardMaterial({
      map:cedarMap,bumpMap:cedarMap,bumpScale:.015,roughnessMap:cedarFinish,roughness:.92,color:color('#644b45')
    });
    function deckPile(x,z){
      batch(beam,darkTimber,x,waterLevel-.10,z,.45,.83,.48);
      batch(trim,stone,x,waterLevel-.08,z,.56,.285,.58);
      batch(trim,edge,x,waterLevel+.055,z,.54,.048,.56);
      batch(poolGeo,waterContact,x,waterLevel+.003,z,1.54,1,1.63);
    }
    function galleryPost(x,z,width,depth,footWidth,footDepth,height){
      const footHeight=.49,woodBase=footHeight-.018;
      batch(beam,stone,x,footHeight/2,z,footWidth,footHeight,footDepth);
      blockWalking(x,z,Math.max(footWidth+.016,.394),Math.max(footDepth+.016,.394));
      batch(capBlock,edge,x,footHeight-.012,z,footWidth+.016,.030,footDepth+.016);
      batch(beam,uprightCedar,x,(height+woodBase)/2,z,width,height-woodBase,depth);
      // The rails meet this separate stone collar, including at right angles.
      batch(capBlock,edge,x,.784,z,.394,.084,.394);
      batch(poolGeo,contact,x,.008,z,footWidth+.26,1,footDepth+.26);
      batch(poolGeo,postContact,x,footHeight+.004,z,width+.10,1,depth+.10);
      batch(poolGeo,postContact,x,.829,z,width+.10,1,depth+.10);
    }
    function stoneWall(alongX,fixed,from,to,capFrom,capTo){
      const length=to-from;
      const spans=Math.max(1,Math.round(length/1.12)),step=length/spans;
      function slab(geometry,material,start,finish,y,height,thickness){
        const mid=(start+finish)/2,span=finish-start;
        batch(geometry,material,alongX?mid:fixed,y,alongX?fixed:mid,
          alongX?span:thickness,height,alongX?thickness:span);
      }
      slab(cube,mortar,from,to,.386,.758,.256);
      const mid=(capFrom+capTo)/2,span=capTo-capFrom;
      blockWalking(alongX?mid:fixed,alongX?fixed:mid,alongX?span:.394,alongX?.394:span);
      for(let i=0;i<spans;i++){
        const low=from+i*step,high=low+step;
        const start=low+(i===0?0:.006),finish=high-(i===spans-1?0:.006);
        slab(trim,stone,start,finish,.263,.528,.30);
        slab(trim,plaster,start,finish,.640,.233,.31);
        slab(capBlock,edge,i===0?capFrom:start,i===spans-1?capTo:finish,.784,.084,.394);
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
      for(let i=1;i<profile.length;i++){
        const [u0,y0]=profile[i-1],[u1,y1]=profile[i];
        const dx=(u1-u0)*half,dy=y1-y0;
        const midX=x+(u0+u1)*half/2,midY=height+.16+(y0+y1)/2;
        const pitch=Math.atan2(dy,dx),length=Math.hypot(dx,dy);
        // Fascia and the exposed ends of the rafters follow the roof pitch.
        for(const end of [-1,1]){
          batch(beam,darkTimber,midX,midY,z+end*span/2,length,.16,.13,0,pitch);
        }
        const intervals=Math.ceil(depth/2.1);
        for(let r=0;r<=intervals;r++){
          batch(trim,cedar,midX,midY-.07,z+(r/intervals-.5)*depth,length,.15,.13,0,pitch);
        }
      }
      for(const side of [-1,1]){
        const y=profile[side===1?profile.length-1:0][1];
        batch(beam,darkTimber,x+side*half,height+.11+y,z,.15,.22,span+.14);
        for(const end of [-1,1]){
          batch(trim,bronze,x+side*half,height+.12+y,z+end*span/2,.17,.21,.15);
        }
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
    function roomSign(room,x,y,z){
      const c=document.createElement('canvas');c.width=768;c.height=120;
      const ctx=c.getContext('2d');ctx.fillStyle='#182c37';ctx.fillRect(0,0,768,120);
      ctx.strokeStyle='#a38962';ctx.lineWidth=3;ctx.strokeRect(6,6,756,108);
      ctx.fillStyle='#f5ddb3';ctx.font='italic 68px Georgia';ctx.textAlign='center';
      ctx.fillText(room.name,384,83);
      const texture=new T.CanvasTexture(c);texture.encoding=T.sRGBEncoding;
      const sign=new T.Mesh(new T.PlaneGeometry(2.8,.44),new T.MeshBasicMaterial({map:texture}));
      sign.position.set(x,y,z);scene.add(sign);
    }
    rooms.forEach((room,r)=>{
      const {x,z,width:w,depth:d}=room,h=galleryHeights[r];
      const roof=r===1 || r===3?cedar:blueTiles;
      galleryRoof(room,h,profiles[r],roof,[.42,.64,.63,.32,.53][r]);
      deck(x,z,w,d,.218);
      for(const side of [-1,1]){
        const wallX=x+side*(w/2-.13);
        const rimX=x+side*(w/2-.056);
        batch(trim,darkTimber,rimX,-.115,z,.17,.22,d+.09);
        for(const dz of [-d/2+.58,0,d/2-.58])deckPile(rimX,z+dz);
        batch(poolGeo,contact,wallX-side*.17,.007,z,.44,1,d-.095);
        batch(beam,darkTimber,wallX,h,z,.28,.27,d+.32);
        const uprights=r===2?[-d/2,-d/4,d/4,d/2]:[-d/2,0,d/2];
        for(let i=1;i<uprights.length;i++){
          const from=z+uprights[i-1],to=z+uprights[i];
          stoneWall(false,wallX,from+.194,to-.194,from+.203,to-.203);
        }
        for(const dz of uprights){
          galleryPost(wallX,z+dz,.29,.28,.41,.40,h);
          batch(trim,bronze,wallX,.84,z+dz,.34,.062,.34);
          batch(beam,darkTimber,wallX,h-.19,z+dz,.41,.17,.40);
        }
        for(const dz of [-d/2,d/2]){
          const wing=w/2-1.65;
          const wingX=x+side*(1.65+wing/2);
          const post=x+side*1.65;
          const footEnds=[post+side*.16,wallX-side*.20].sort((a,b)=>a-b);
          const capEnds=[post+side*.203,wallX-side*.203].sort((a,b)=>a-b);
          stoneWall(true,z+dz,...footEnds,...capEnds);
          galleryPost(post,z+dz,.25,.27,.33,.33,h);
          batch(trim,bronze,post,h-.30,z+dz,.30,.078,.31);
          batch(poolGeo,contact,wingX,.008,z+dz-Math.sign(dz)*.141,wing,1,.42);
          // Seat the brace into the post and underside of the header.
          batch(beam,cedar,post+side*.285,h-.332,z+dz,.76,.122,.205,0,side*.71);
        }
      }
      for(const dz of [-d/2,d/2]){
        batch(beam,cedar,x,h,z+dz,w,.20,.27);
        batch(trim,darkTimber,x,h+.14,z+dz,w,.071,.29);
        lantern(x-1.22,h-.85,z+dz,.67,true,h+.48,h-.099);
        lantern(x+1.22,h-.85,z+dz,.67,true,h+.48,h-.099);
      }
      if(r===4){
        const windowRing=new T.TorusGeometry(.81,.065,8,44);
        for(const side of [-1,1]){
          const wx=x+side*(w/2+1.65)/2,wz=z-d/2;
          batch(windowRing,cedar,wx,1.86,wz,1,1,1);
          batch(cube,cedar,wx,1.02,wz,.10,.30,.11);
          batch(cube,bronze,wx,1.58,wz,1.48,.026,.05);
        }
      }else if(r===1 || r===3){
        for(const side of [-1,1]){
          const wz=z+d/2,wing=w/2-1.65;
          const count=r===1?7:4;
          for(let i=1;i<=count;i++)
            batch(cube,cedar,x+side*(1.65+i*wing/(count+1)),r===1?h-.42:h/2,wz,.052,r===1?.68:h-.12,.075);
          batch(cube,cedar,x+side*(1.65+wing/2),r===1?h-.76:1.75,wz,wing,.065,.09);
        }
      }
      roomSign(room,x,h+.01,z+d/2+.145);
      room.photos.forEach((id,j)=>{
        const side=j%2?1:-1, count=Math.ceil((room.photos.length-(side===1?1:0))/2);
        const pz=z+d/2-(Math.floor(j/2)+.5)*d/count, px=x+side*(w/2-.39);
        const angle=-side*Math.PI/2,[,,aw,ah]=atlas.regions[id];
        const ph=Math.min(1.72,2.48*ah/aw),pw=ph*aw/ah,mid=1.86;
        batch(beam,darkTimber,px+.14*side,mid,pz,pw+.42,ph+.42,.16,angle);
        batch(trim,cedar,px+.078*side,mid,pz,pw+.31,ph+.31,.15,angle);
        batch(trim,bronze,px+.039*side,mid,pz,pw+.19,ph+.19,.097,angle);
        batch(trim,linen,px,mid,pz,pw+.14,ph+.14,.06,angle);
        blockWalking(px+.085*side,pz,.27,pw+.42);
        const wallX=x+side*(w/2-.13),base=.826,frameBottom=mid-(ph+.42)/2;
        const hangerTop=frameBottom+.27;
        batch(trim,pictureMetal,px+.216*side,mid,pz,.105,ph*.72,pw*.79);
        for(const dz of [-pw*.32,pw*.32]){
          batch(trim,pictureMetal,wallX,base+.018,pz+dz,.20,.039,.15);
          batch(trim,pictureMetal,wallX,(base+hangerTop)/2,pz+dz,.079,hangerTop-base,.088);
          batch(trim,pictureMetal,wallX-.075*side,hangerTop,pz+dz,.23,.070,.108);
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
        lantern(lampX,2.45,lampZ,.54,true,h+.37,h-.094);
      });
    });
    const landingDepth=4.7;
    const stripBatches=new Map();
    const boxPositions=cube.getAttribute('position'),boxUVs=cube.getAttribute('uv');
    function bridgeNormal(b){
      return [(b.z-b.sz)/b.length,-(b.x-b.sx)/b.length];
    }
    function bridgeJoin(x,z,normal,neighbor){
      // On a turn the two strips share an exact miter. At a room or landing
      // the strip meets the flat threshold at a constant world z instead.
      if(!neighbor)return {x,z,nx:1/normal[0],nz:0};
      const [nx,nz]=bridgeNormal(neighbor);
      const scale=1/(1+normal[0]*nx+normal[1]*nz);
      return {x,z,nx:(normal[0]+nx)*scale,nz:(normal[1]+nz)*scale};
    }
    function bridgePoint(start,finish,along,across){
      return [T.MathUtils.lerp(start.x+start.nx*across,finish.x+finish.nx*across,along),
              T.MathUtils.lerp(start.z+start.nz*across,finish.z+finish.nz*across,along)];
    }
    function bridgeStrip(material,start,finish,y,height,width,offset,deckNormal){
      if(!stripBatches.has(material))stripBatches.set(material,{positions:[],uvs:[],indices:[]});
      const {positions,uvs,indices}=stripBatches.get(material);
      const base=positions.length/3;
      for(let v=0;v<boxPositions.count;v++){
        const [x,z]=bridgePoint(start,finish,boxPositions.getZ(v)+.5,offset+boxPositions.getX(v)*width);
        positions.push(x,y+boxPositions.getY(v)*height,z);
        let along=boxPositions.getZ(v)+.5,across=boxPositions.getX(v)+.5;
        if(deckNormal){
          // Measure along the bridge's center line at every vertex. A cut
          // across a miter trims the end boards without stretching them.
          const [nx,nz]=deckNormal;
          along=((z-start.z)*nx-(x-start.x)*nz)/plankRepeatLength;
          across*=width/plankLength;
        }
        if(v<8)uvs.push(along,boxUVs.getY(v));
        else if(v<16)uvs.push(across,along);
        else uvs.push(boxUVs.getX(v),boxUVs.getY(v));
      }
      for(const index of cube.index.array)indices.push(base+index);
    }
    for(const [i,b] of bridges.entries()){
      const previous=bridges[i-1],next=bridges[i+1],normal=bridgeNormal(b);
      const startsAtBend=previous?.x===b.sx && previous.z===b.sz;
      const endsAtBend=b.x===next?.sx && b.z===next.sz;
      const atLanding=b.x===end[0] && b.z===end[1];
      const finishZ=atLanding?end[1]+landingDepth/2:b.z;
      const finishX=T.MathUtils.lerp(b.sx,b.x,(finishZ-b.sz)/(b.z-b.sz));
      const start=bridgeJoin(b.sx,b.sz,normal,startsAtBend?previous:null);
      const finish=bridgeJoin(finishX,finishZ,normal,endsAtBend?next:null);
      const length=Math.hypot(finish.x-start.x,finish.z-start.z);
      const spans=Math.ceil(length/3.5),angle=Math.atan2(-normal[1],normal[0]);
      bridgeStrip(timber,start,finish,-.13,.26,b.width,0,normal);
      for(const side of [-1,1]){
        const offset=side*(b.width/2-.065);
        bridgeStrip(cedar,start,finish,.60,.08,.065,offset);
        bridgeStrip(bronze,start,finish,.33,.035,.028,offset);
        for(let j=startsAtBend?1:0;j<=spans;j++){
          const [px,pz]=bridgePoint(start,finish,j/spans,offset);
          batch(cube,plinth,px,.12,pz,.15,1.25,.15,angle);
          batch(poolGeo,contact,px,.009,pz,.33,1,.35,angle);
          batch(cube,railCap,px,.75,pz,.17,.06,.17,angle);
        }
      }
      if(b.sz<-75){
        const cx=(b.x+b.sx)/2,cz=(b.z+b.sz)/2;
        lantern(cx+normal[0]*2,.78,cz+normal[1]*2,.83,true);
        if(i%2===0)lantern(cx-normal[0]*3.5,1.86,cz-normal[1]*3.5,.74,true);
      }
    }
    for(const [material,{positions,uvs,indices}] of stripBatches){
      const geo=new T.BufferGeometry();
      geo.setIndex(indices);
      geo.setAttribute('position',new T.Float32BufferAttribute(positions,3));
      geo.setAttribute('uv',new T.Float32BufferAttribute(uvs,2));
      geo.computeVertexNormals();
      scene.add(reflected(new T.Mesh(geo,material)));
    }
    deck(end[0],end[1],6.6,landingDepth,.34);
    for(const side of [-1,1]){
      batch(cube,stone,end[0]+side*3.14,.18,end[1],.25,.55,4.6);
      blockWalking(end[0]+side*3.14,end[1],.25,4.6);
      for(const dz of [-1.68,1.68])deckPile(end[0]+side*3.19,end[1]+dz);
      lantern(end[0]+side*3.10,1.06,end[1]-1.66,.96,true);
    }
    for(const {geometry,material,matrices} of batches.values()){
      const objects=new T.InstancedMesh(geometry,material,matrices.length);
      matrices.forEach((m,i)=>objects.setMatrixAt(i,m));objects.frustumCulled=false;scene.add(reflected(objects));
    }

    // Lower lanterns drift beside the walk, close enough to watch their
    // reflections travel across the water from both banks of the boardwalk.
    bridges.forEach((bridge,i)=>{
      const side=i%2===0?1:-1;
      const x=(bridge.sx+bridge.x)/2,z=(bridge.sz+bridge.z)/2;
      lantern(x+side*7.4,1.65+(i%3)*.40,z,.81+(i%4)*.075);
      if(i%3===0)lantern(x-side*6.8,3.4,z-2.4,.87);
    });
    // Individual nearby lanterns show the bamboo hoops and translucent paper.
    for(let i=0;i<44;i++){
      const angle=fullTurn*(i+rand()*.7)/44,dist=14+rand()*15;
      lantern(Math.sin(angle)*dist,4+rand()*7,-Math.cos(angle)*dist,.55+rand()*1.12);
    }
    lightArchitecture([stone,edge,bronze,plinth,linen,photoMat,pictureMetal,timber,blueTiles,
      cedar,uprightCedar,railCap,plaster,darkTimber,mortar]);
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
      lanterns.forEach(({x,y,z,size,phase,glow,fixture,mountHeight,cordIndex},i)=>{
        const lift=Math.sin(t*.36+phase), drift=Math.sin(t*.21+phase*1.2);
        if(mountHeight){
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
    const hdrType=renderer.capabilities.isWebGL2 && renderer.extensions.has('EXT_color_buffer_float')
      ? T.HalfFloatType:T.UnsignedByteType;
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
      if(room)guidePoints.push([room.x,p.z]);
      guidePoints.push(...route.filter(([,z])=>z<p.z-.12));
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
  function showFallback(){
    stopFrames();walkPanel.inert=false;fallback.hidden=false;movement.hidden=true;view.hidden=true;select(current);
  }
  function prepare(){
    if(preparing)return preparing;
    preparing=new Promise((resolve,reject)=>{
      const script=document.createElement('script');
      script.src='garden-atlas.js';
      script.onload=()=>resolve(gardenAtlas);
      script.onerror=()=>reject(new Error('Offline photo atlas unavailable'));
      document.head.appendChild(script);
    }).then(atlas=>{
      garden=makeGarden(atlas);
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
