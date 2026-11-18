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
    const hemi=new T.HemisphereLight(color('#a5c4ee'),color('#455362'),.65);
    const blueLight=new T.DirectionalLight(color('#92bfe5'),1.28);
    blueLight.position.set(-20,28,-35);
    scene.add(hemi,blueLight);
    const reflectionLayer=1;
    const reflected=obj=>{obj.layers.enable(reflectionLayer);return obj};

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
        portraitLight:{value:0},navy:{value:color('#020a16')},teal:{value:color('#10515e')}},
      vertexShader:`uniform mat4 projection;varying vec4 reflected;varying vec3 world;
        void main(){vec4 p=modelMatrix*vec4(position,1.);world=p.xyz;reflected=projection*p;
        gl_Position=projectionMatrix*viewMatrix*p;}`,
      fragmentShader:`${samplePortrait}
        uniform mat4 poolProjection;uniform sampler2D reflectedView;uniform float time,portraitLight;uniform vec3 navy,teal;
        uniform vec2 reflectionPixel;
        varying vec4 reflected;varying vec3 world;

        vec3 reflectedLight(vec2 uv,vec2 blur){
          vec3 light=texture2D(reflectedView,uv).rgb*.24;
          light+=.095*(texture2D(reflectedView,uv+vec2(blur.x,0.)).rgb
                      +texture2D(reflectedView,uv-vec2(blur.x,0.)).rgb
                      +texture2D(reflectedView,uv+vec2(0.,blur.y)).rgb
                      +texture2D(reflectedView,uv-vec2(0.,blur.y)).rgb);
          light+=.095*(texture2D(reflectedView,uv+blur).rgb
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
          vec2 offset=vec2(.0026*wave+.0018*sin(swell),.0038*waveSlope)
                     *mix(.7,1.25,grazing)*mix(1.,.32,still);
          vec2 blur=max(reflectionPixel*1.2,vec2(.0015,.0046)*mix(1.,1.65,grazing));
          vec3 lights=reflectedLight(clamp(uv+offset,blur,1.-blur),blur);
          float fresnel=.19+.77*pow(grazing,4.0);
          float warm=max(0.,lights.r-lights.b);
          float stroke=.83+.17*sin(ripple)*detail;
          vec3 river=navy+teal*(.041+.033*waveSlope)*exp(-.019*dist)
                     +lights*fresnel*stroke+vec3(1.,.52,.22)*warm*.19;
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
          river=mix(river,navy+vec3(.012,.023,.036),smoothstep(25.,125.,dist)*.50);
          gl_FragColor=vec4(river,1.);
        #include <encodings_fragment>
        }`
    }));
    water.rotation.x=-Math.PI/2;water.position.set(0,waterLevel,-75);scene.add(water);
    const glowMap=painted(96,(ctx,n)=>{
      const g=ctx.createRadialGradient(n/2,n/2,0,n/2,n/2,n/2);
      g.addColorStop(0,'#ffe6aee8');g.addColorStop(.14,'#ffaf5588');g.addColorStop(.42,'#ff692330');g.addColorStop(1,'#fa492000');
      ctx.fillStyle=g;ctx.fillRect(0,0,n,n);
    });
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
    const stone = new T.MeshStandardMaterial({map:limestone,color:color('#89939e'),roughness:.86});
    const edge = new T.MeshStandardMaterial({map:limestone,color:color('#849fa8'),roughness:.64});
    const bronze = new T.MeshStandardMaterial({color:color('#bc9b71'),roughness:.43,metalness:.28});
    const plinth = new T.MeshStandardMaterial({color:color('#44535a'),roughness:.95});
    const linen = new T.MeshStandardMaterial({color:color('#bdd1cb'),roughness:1});
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
      toneMapped:false,map:atlasMap,emissiveMap:atlasMap,emissive:color('#e2e5eb'),emissiveIntensity:.62,
      color:color('#9aa8b4'),roughness:.91
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
        ctx.fillStyle='rgba(132,70,40,.18)';ctx.fillRect(x,0,1.7,n);
        ctx.fillStyle='rgba(255,247,200,.3)';ctx.fillRect(x+2,0,1,n);
      }
      for(let j=0;j<2200;j++){
        ctx.fillStyle=j%2?'#97583c12':'#ffffdf20';const x=rand()*n,y=rand()*n;
        ctx.fillRect(x,y,2+rand()*12,.65);
      }
      for(const y of [.13,.84,.96]){ctx.fillStyle='#8e522b35';ctx.fillRect(0,y*n,n,1.8)}
    });
    const shadeGeometry=new T.LatheGeometry([
      [.155,0],[.168,.032],[.233,.117],[.276,.27],[.274,.45],
      [.255,.56],[.218,.635],[.148,.673],[.001,.679]
    ].map(([r,y])=>new T.Vector2(r,y)),16);
    const hoopGeometry=new T.TorusGeometry(.158,.009,8,22);
    hoopGeometry.rotateX(Math.PI/2);
    const braceGeometry=new T.BoxGeometry(.308,.009,.012);
    const emberGeometry=new T.SphereGeometry(.053,10,8);
    const paper=new T.MeshBasicMaterial({map:paperMap,side:T.DoubleSide});
    const bamboo=new T.MeshBasicMaterial({color:color('#8c5c3a')});
    const ember=new T.MeshBasicMaterial({color:color('#ffe8aa')});
    const lanternGlow=new T.SpriteMaterial({map:glowMap,transparent:true,opacity:.76,depthWrite:false,blending:T.AdditiveBlending});
    const pieces=[
      [shadeGeometry,paper],[hoopGeometry,bamboo],[braceGeometry,bamboo],
      [braceGeometry,bamboo],[emberGeometry,ember]
    ];
    function lantern(x,y,z,size,fixture=false){
      const glow=new T.Sprite(lanternGlow);
      scene.add(reflected(glow));
      const lamp={x,y,z,size,phase:rand()*fullTurn,glow,fixture};
      lanterns.push(lamp);
      if(fixture)fixtures.push(lamp);
    }
    function lightArchitecture(materials){
      // Each strip of the river knows every lamp that can reach it. Picking
      // lights at the surface keeps the galleries lit from every viewpoint.
      const first=-218,cell=4,cells=60,range=7.3;
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
      }));
      const lightmap=new T.DataTexture(pixels,slots*2,cells,T.RGBAFormat);
      lightmap.needsUpdate=true;
      const warm={value:color('#ffc094')};
      for(const material of materials){
        const isStone=material.map===limestone;
        material.customProgramCacheKey=()=>isStone?'river-stone':'river-lanterns';
        material.onBeforeCompile=shader=>{
          shader.uniforms.riverFixtures={value:lightmap};
          shader.uniforms.riverFixtureColor=warm;
          shader.uniforms.riverFixtureTime=nightTime;
          shader.vertexShader='varying vec3 riverSurface;\n'+shader.vertexShader.replace(
            '#include <worldpos_vertex>',
            `#include <worldpos_vertex>
            vec4 riverPoint=vec4(transformed,1.);
            #ifdef USE_INSTANCING
              riverPoint=instanceMatrix*riverPoint;
            #endif
            riverSurface=(modelMatrix*riverPoint).xyz;`
          );
          shader.fragmentShader=`uniform sampler2D riverFixtures;
            uniform vec3 riverFixtureColor;
            uniform float riverFixtureTime;
            varying vec3 riverSurface;\n`+shader.fragmentShader.replace(
            '#include <lights_fragment_begin>',
            `#include <lights_fragment_begin>
            float riverCell=floor((riverSurface.z-(${first.toFixed(1)}))/${cell.toFixed(1)});
            if(riverCell>=0. && riverCell<${cells.toFixed(1)}){
              float row=(riverCell+.5)/${cells.toFixed(1)};
              for(int slot=0;slot<${slots};slot++){
                float col=(float(slot)*2.+.5)/${(slots*2).toFixed(1)};
                vec4 packedLamp=texture2D(riverFixtures,vec2(col,row));
                if(packedLamp.a<=0.)break;
                vec3 fine=texture2D(riverFixtures,vec2(col+1./${(slots*2).toFixed(1)},row)).rgb;
                vec3 lamp=(packedLamp.rgb*256.+fine)/257.*vec3(64.,8.,256.)-vec3(32.,0.,224.);
                vec3 delta=lamp-riverSurface;
                float dist=length(delta);
                float fade=1.-smoothstep(4.0,${range.toFixed(1)},dist);
                float flame=1.+.032*sin(riverFixtureTime*3.4+lamp.z*1.31);
                directLight.direction=mat3(viewMatrix)*(delta/max(dist,.001));
                directLight.color=riverFixtureColor*34.*packedLamp.a*flame*fade/(dot(delta,delta)+1.05);
                directLight.visible=fade>0.;
                RE_Direct(directLight,geometry,material,reflectedLight);
              }
            }`
          );
          if(isStone){
            // Project against the world axes so stretching the base geometry
            // never stretches the finish. Blend the projections on the bevels.
            shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`
              vec3 stoneAxis=abs(inverseTransformDirection(normalize(vNormal),viewMatrix));
              vec3 stoneWeight=pow(stoneAxis,vec3(7.0));
              stoneWeight/=dot(stoneWeight,vec3(1.0));
              vec3 grainUV=riverSurface*.91;
              vec4 grain=texture2D(map,grainUV.zy)*stoneWeight.x
                        +texture2D(map,grainUV.xz)*stoneWeight.y
                        +texture2D(map,grainUV.xy)*stoneWeight.z;
              diffuseColor*=mapTexelToLinear(grain);
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
        float core=1.-smoothstep(.30,.53,d);float halo=exp(-5.2*d*d);
        float base=smoothstep(-.15,.43,p.y);vec3 paper=mix(vec3(.92,.16,.023),vec3(1.,.87,.37),base);
        vec3 c=mix(vec3(.96,.25,.045),paper,core);
        gl_FragColor=vec4(c*(.72+.28*tint),(core*.96+(1.-core)*halo*.43)*visibility);
        #include <encodings_fragment>
        }`
    });
    scene.add(reflected(new T.Points(cloudGeo,cloudMaterial)));

    const poolMap=painted(96,(ctx,n)=>{
      const g=ctx.createRadialGradient(n/2,n/2,0,n/2,n/2,n/2);
      g.addColorStop(0,'rgba(255,173,81,.41)');g.addColorStop(.40,'rgba(249,120,42,.20)');g.addColorStop(1,'rgba(241,106,29,0)');
      ctx.fillStyle=g;ctx.fillRect(0,0,n,n);
    });
    const poolMat=new T.MeshBasicMaterial({map:poolMap,transparent:true,depthWrite:false,opacity:.5});
    const poolGeo=new T.PlaneGeometry(1,1);poolGeo.rotateX(-Math.PI/2);
    const contactMap=painted(64,(ctx,n)=>{
      const g=ctx.createRadialGradient(n/2,n/2,0,n/2,n/2,n/2);
      g.addColorStop(0,'rgba(0,0,0,.66)');g.addColorStop(.48,'rgba(0,0,0,.36)');
      g.addColorStop(1,'rgba(0,0,0,0)');
      ctx.fillStyle=g;ctx.fillRect(0,0,n,n);
    });
    const contact=new T.MeshBasicMaterial({map:contactMap,transparent:true,depthWrite:false});
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
    const timberMap=painted(1024,(ctx,n)=>{
      const boards=18, pitch=n/boards;
      for(let i=0;i<boards;i++){
        const z=i*pitch,split=n*(.18+rand()*.65);
        ctx.fillStyle=['#8c8377','#9a8f7d','#8a857b','#a19985','#807f75'][i%5];
        ctx.fillRect(0,z,n,pitch);
        ctx.fillStyle=i%2?'#d2ba9618':'#32251c13';
        ctx.fillRect(split,z,n-split,pitch);
        ctx.fillStyle='#312d2b';ctx.fillRect(0,z,n,2.4);ctx.fillRect(split,z,1.5,pitch);
        ctx.fillStyle='#d4c3a957';ctx.fillRect(0,z+2.4,n,.8);
        for(let j=0;j<115;j++){
          const x=rand()*n,y=z+3+rand()*(pitch-4),length=4+rand()*160;
          ctx.strokeStyle=j%3?'#493d321f':'#e9d8b523';ctx.lineWidth=.36+rand()*.68;
          ctx.beginPath();ctx.moveTo(x,y);ctx.quadraticCurveTo(x+length/2,y+rand()*2-1,x+length,y+.4);ctx.stroke();
        }
        ctx.fillStyle='#453c3590';
        for(const x of [8,split-5,split+6,n-9]){
          ctx.beginPath();ctx.ellipse(x,z+pitch*.24,1.5,1.9,0,0,fullTurn);ctx.fill();
          ctx.beginPath();ctx.ellipse(x,z+pitch*.77,1.5,1.9,0,0,fullTurn);ctx.fill();
        }
      }
    });
    const timber=new T.MeshStandardMaterial({
      map:timberMap,bumpMap:timberMap,bumpScale:.032,roughness:.63,color:color('#b9b7b0')
    });
    timberMap.wrapS=timberMap.wrapT=T.RepeatWrapping;
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
    const cedar=new T.MeshStandardMaterial({map:cedarMap,bumpMap:cedarMap,bumpScale:.014,color:color('#b58d72'),roughness:.62});
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
    const beam=chamferedBlock(.063), trim=chamferedBlock(.035);
    const plaster=new T.MeshStandardMaterial({map:limestone,color:color('#76858e'),roughness:.78});
    const darkTimber=new T.MeshStandardMaterial({map:cedarMap,bumpMap:cedarMap,bumpScale:.018,color:color('#644b45'),roughness:.68});
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
      const {x,z,width:w,depth:d}=room, h=[3.5,3.23,4.05,3.65,3.25][r];
      const roof=r===1 || r===3?cedar:blueTiles;
      galleryRoof(room,h,profiles[r],roof,[.42,.64,.63,.32,.53][r]);
      batch(cube,timber,x,-.16,z,w,.32,d);
      for(const side of [-1,1]){
        const wallX=x+side*(w/2-.13);
        batch(beam,stone,wallX,.24,z,.30,.49,d);
        batch(trim,plaster,wallX,.59,z,.31,.25,d);
        batch(trim,edge,wallX,.755,z,.40,.086,d+.06);
        batch(poolGeo,contact,wallX-side*.19,.007,z,1.42,1,d-.22);
        batch(beam,darkTimber,wallX,h,z,.28,.27,d+.32);
        const uprights=r===2?[-d/2,-d/4,d/4,d/2]:[-d/2,0,d/2];
        for(const dz of uprights){
          batch(beam,cedar,wallX,h*.5,z+dz,.29,h,.28);
          batch(beam,stone,wallX,.27,z+dz,.41,.45,.40);
          batch(trim,bronze,wallX,.84,z+dz,.34,.062,.34);
          batch(trim,darkTimber,wallX,h-.19,z+dz,.41,.17,.40);
          batch(poolGeo,contact,wallX-side*.21,.009,z+dz,.94,1,.94);
        }
        for(const dz of [-d/2,d/2]){
          const wing=w/2-1.65;
          const wingX=x+side*(1.65+wing/2);
          const post=x+side*1.65;
          batch(beam,stone,wingX,.29,z+dz,wing,.57,.25);
          batch(trim,plaster,wingX,.665,z+dz,wing,.21,.28);
          batch(trim,edge,wingX,.808,z+dz,wing+.07,.072,.37);
          batch(beam,cedar,post,h*.5,z+dz,.25,h,.27);
          batch(trim,stone,post,.245,z+dz,.33,.40,.33);
          batch(trim,bronze,post,h-.30,z+dz,.30,.078,.31);
          batch(poolGeo,contact,post,.01,z+dz-Math.sign(dz)*.28,.91,1,.96);
          batch(trim,darkTimber,post+side*.27,h-.38,z+dz,.90,.115,.20,0,side*.79);
        }
      }
      for(const dz of [-d/2,d/2]){
        batch(beam,cedar,x,h,z+dz,w,.20,.27);
        batch(trim,darkTimber,x,h+.14,z+dz,w,.071,.29);
        lantern(x-1.22,h-.85,z+dz,.67,true);
        lantern(x+1.22,h-.85,z+dz,.67,true);
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
        for(const dz of [-pw*.36,pw*.36])batch(cube,bronze,px+.13*side,mid*.5,pz+dz,.065,mid,.065);
        const pic=new T.Mesh(photoGeometry(id,pw,ph),photoMat);
        pic.position.set(px-.043*side,mid,pz);pic.rotation.y=angle;pic.userData.index=stations.length;
        scene.add(pic);portraits.push(pic);stations.push({x:px-side*3.55,z:pz,angle,room});
        lantern(px-side*.54,2.45,pz+pw/2+.38,.54,true);
        batch(poolGeo,poolMat,px-side*.5,.013,pz,1.6,1,1.6);
        batch(poolGeo,contact,px-side*.20,.011,pz,1.0,1,pw+.53);
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
    function bridgeStrip(material,start,finish,y,height,width,offset,textureRepeats=1){
      if(!stripBatches.has(material))stripBatches.set(material,{positions:[],uvs:[],indices:[]});
      const {positions,uvs,indices}=stripBatches.get(material);
      const base=positions.length/3;
      for(let v=0;v<boxPositions.count;v++){
        const [x,z]=bridgePoint(start,finish,boxPositions.getZ(v)+.5,offset+boxPositions.getX(v)*width);
        positions.push(x,y+boxPositions.getY(v)*height,z);
        // The top and side faces use the longitudinal axis of the texture.
        const along=(boxPositions.getZ(v)+.5)*textureRepeats;
        const across=boxPositions.getX(v)+.5;
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
      bridgeStrip(timber,start,finish,-.13,.26,b.width,0,length/3.5);
      for(const side of [-1,1]){
        const offset=side*(b.width/2-.065);
        bridgeStrip(cedar,start,finish,.60,.08,.065,offset);
        bridgeStrip(bronze,start,finish,.33,.035,.028,offset);
        for(let j=startsAtBend?1:0;j<=spans;j++){
          const [px,pz]=bridgePoint(start,finish,j/spans,offset);
          batch(cube,plinth,px,.12,pz,.15,1.25,.15,angle);
          batch(poolGeo,contact,px,.009,pz,.48,1,.54,angle);
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
    batch(cube,timber,end[0],-.17,end[1],6.6,.34,landingDepth);
    for(const side of [-1,1]){
      batch(cube,stone,end[0]+side*3.14,.18,end[1],.25,.55,4.6);
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
    lightArchitecture([stone,edge,bronze,plinth,linen,photoMat,timber,blueTiles,cedar,railCap,plaster,darkTimber]);
    const lanternMeshes=pieces.map(([geometry,material])=>{
      const group=new T.InstancedMesh(geometry,material,lanterns.length);
      group.frustumCulled=false;scene.add(reflected(group));return group;
    });
    lanterns.forEach((_,i)=>lanternMeshes[0].setColorAt(i,color(['#ffffff','#ffdcbb','#ffedc9','#ffd1ac'][i%4])));
    const support=new T.Object3D(),localPart=new T.Object3D(),partMatrix=new T.Matrix4();
    function updateLanterns(time){
      nightTime.value=reduced.matches?0:time;
      const t=nightTime.value;
      lanterns.forEach(({x,y,z,size,phase,glow,fixture},i)=>{
        const lift=Math.sin(t*.36+phase), drift=Math.sin(t*.21+phase*1.2);
        if(fixture){
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
          localPart.position.set(0,j===4?.065:.0,0);localPart.rotation.set(0,j===3?Math.PI/2:0,0);
          localPart.updateMatrix();partMatrix.multiplyMatrices(support.matrix,localPart.matrix);
          obj.setMatrixAt(i,partMatrix);
        });
        glow.position.set(support.position.x,support.position.y+.31*size,support.position.z);
        glow.scale.setScalar(size*(1.7+.06*lift));
      });
      lanternMeshes.forEach(obj=>obj.instanceMatrix.needsUpdate=true);
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
    const shades=new T.InstancedMesh(shadeGeometry,paper.clone(),lights.length);
    const hoops=new T.InstancedMesh(hoopGeometry,bamboo,lights.length);
    for(let i=0;i<lights.length;i++)shades.setColorAt(i,color(['#fff0d2','#e9af85','#ffdab8','#fff7de'][i%4]));
    const halos=new T.InstancedMesh(new T.PlaneGeometry(1,1),new T.MeshBasicMaterial({
      map:glowMap,transparent:true,depthWrite:false,blending:T.AdditiveBlending,opacity:.66
    }),lights.length);
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
        matrix.position.y+=matrix.scale.x*.3;matrix.rotation.set(0,0,0);matrix.scale.multiplyScalar(2.1);
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
      lightHeight.value=canvas.height;renderer.setRenderTarget(null);renderer.render(scene,camera);
    }
    function resize(){
      const w=view.clientWidth,h=view.clientHeight;
      if(!w||!h)return;
      poolView.fov=Math.min(27,48*w/h);
      poolView.updateProjectionMatrix();
      poolMatrix.multiplyMatrices(poolView.projectionMatrix,poolView.matrixWorldInverse);
      renderer.setSize(w,h,false);
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
        const oldX=p.x,oldZ=p.z;
        p.x+=dx*step;p.z+=dz*step;
        footfalls(oldX,oldZ);
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
      const k=dt*(fastWalk?6.6:3)/Math.max(1,Math.hypot(right,forward)),p=camera.position;
      const dx=(Math.cos(yaw)*right-Math.sin(yaw)*forward)*k;
      const dz=(-Math.sin(yaw)*right-Math.cos(yaw)*forward)*k;
      const oldX=p.x,oldZ=p.z;
      const steps=Math.ceil(Math.hypot(dx,dz)/.24);
      for(let i=0;i<steps;i++){
        const x=p.x+dx/steps,z=p.z+dz/steps;
        if(riverWalk.walkable(x,z)){p.x=x;p.z=z}
        else if(riverWalk.walkable(x,p.z))p.x=x;
        else if(riverWalk.walkable(p.x,z))p.z=z;
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
