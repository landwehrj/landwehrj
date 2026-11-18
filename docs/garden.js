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
    const renderer = new T.WebGLRenderer({antialias:true, alpha:false, powerPreference:'low-power'});
    renderer.setPixelRatio(Math.min(devicePixelRatio,1.6));
    renderer.outputEncoding = T.sRGBEncoding;
    const scene = new T.Scene();
    const camera = new T.PerspectiveCamera(56,1,.07,160);
    camera.rotation.order = 'YXZ';
    const color = value => new T.Color(value).convertSRGBToLinear();
    const waterLevel=-.43;
    const nightTime={value:0};
    scene.background=color('#060e22');
    scene.fog=new T.FogExp2(color('#0d2035'),.013);
    const hemi=new T.HemisphereLight(color('#a9d2fa'),color('#304d60'),.83);
    const blueLight=new T.DirectionalLight(color('#85bbc9'),.72);
    blueLight.position.set(-8,13,-18);
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
      uniforms:{deep:{value:color('#020817')},blue:{value:color('#123782')},mist:{value:color('#182f4c')}},
      vertexShader:`varying vec3 place;
        void main(){place=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader:`uniform vec3 deep,blue,mist;varying vec3 place;
        void main(){vec3 d=normalize(place);float h=max(d.y,0.);
        float opening=.09+.91*pow(max(0.,dot(d,normalize(vec3(-.64,.24,-1.)))),8.);
        vec3 c=mix(deep,blue,opening*(.75+.25*sin(h*5.))*(1.-smoothstep(.22,.95,h)*.82));
        c=mix(c,mist,(1.-smoothstep(-.02,.13,h))*.58);
        float veil=.5+.5*sin(47.*d.y+3.*sin(d.x*7.)+sin(d.z*16.));
        c*=1.-.21*pow(veil,3.)*exp(-9.*h);
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
      uniforms:{...photoUniforms,poolProjection:{value:poolMatrix},reflectedView:{value:reflection.texture},projection:{value:reflectionMatrix},time:nightTime,
        portraitLight:{value:0},navy:{value:color('#020a16')},teal:{value:color('#10515e')}},
      vertexShader:`uniform mat4 projection;varying vec4 reflected;varying vec3 world;
        void main(){vec4 p=modelMatrix*vec4(position,1.);world=p.xyz;reflected=projection*p;
        gl_Position=projectionMatrix*viewMatrix*p;}`,
      fragmentShader:`${samplePortrait}
        uniform mat4 poolProjection;uniform sampler2D reflectedView;uniform float time,portraitLight;uniform vec3 navy,teal;
        varying vec4 reflected;varying vec3 world;
        void main(){vec2 p=world.xz;vec2 uv=.5+.5*reflected.xy/reflected.w;
        float dist=length(world-cameraPosition);
        float phase=p.y*7.7+2.*sin(p.x*.81+time*.48)+time*.92;
        float wave=sin(phase)+.45*sin(p.y*16.5+p.x*2.1-time*1.55);
        float chop=sin(p.x*4.9+2.2*sin(p.y*2.7)+time*.78);
        vec2 offset=vec2(.0068*wave,.0035*chop+.003*sin(phase*.48))*(.7+smoothstep(3.,25.,dist));
        float still=portraitLight*(1.-smoothstep(3.,13.,abs(p.x+2.)))*smoothstep(202.,208.,-p.y);
        offset*=mix(1.,.28,still);
        vec3 lights=texture2D(reflectedView,clamp(uv+offset,0.001,.999)).rgb;
        float stroke=.42+.58*smoothstep(-1.,.75,sin(phase+chop));
        float firelight=smoothstep(.012,.17,lights.r-lights.b*.90);
        float shaft=.35+.65*pow(.5+.5*cos(p.x*.58+p.y*.18),3.);
        vec3 glow=teal*(.038+.085*pow(max(0.,wave*.68),4.))*shaft*exp(-.026*dist);
        vec3 river=navy+glow+lights*mix(.19*(.83+.17*stroke),.87*stroke,firelight);
        if(still>.001){
          vec4 projected=poolProjection*vec4(world,1.);
          vec2 q=projected.xy/projected.w*.5+.5;
          q+=vec2(.0048*wave,.0028*chop);
          if(projected.w>0. && all(greaterThan(q,vec2(0.))) && all(lessThan(q,vec2(1.)))){
            float fur=texture2D(furMask,q).a;
            float blanket=.27*(1.-smoothstep(.32,.50,length(q-.5)));
            float strength=(.71+.15*stroke)*max(fur,blanket)*portraitLight;
            vec3 pigment=furColor(q)*vec3(.83,.93,1.);
            float crest=smoothstep(.87,.995,sin(phase*2.3+.55*chop));
            float glint=crest*(.5+.5*sin(p.x*2.8+sin(p.y*4.-time*.5)));
            river=mix(river,pigment*(1.-.12*crest),strength)
                +(lights*.10+vec3(.022,.043,.060)*glint)*strength;
          }
        }
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
    const limestone=painted(256,(ctx,n)=>{
      ctx.fillStyle='#e6e4db';ctx.fillRect(0,0,n,n);
      for(let i=0;i<5000;i++){
        ctx.fillStyle=i%3?'#6e675512':'#ffffff38';
        ctx.fillRect(rand()*n,rand()*n,1+rand()*3,1+rand()*1.5);
      }
    });
    const stone = new T.MeshStandardMaterial({map:limestone,color:color('#364450'),roughness:1});
    const edge = new T.MeshStandardMaterial({map:limestone,color:color('#72858b'),roughness:.94});
    const bronze = new T.MeshStandardMaterial({color:color('#a67f46'),roughness:.58,metalness:.22});
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
    const photoMat=new T.MeshBasicMaterial({map:atlasMap,color:color('#e0e5e4')});
    const portraits=[];
    // The shade is a closed paper envelope at the top and open at its bamboo hoop.
    const lanterns=[];
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
    function lantern(x,y,z,size){
      const glow=new T.Sprite(lanternGlow);scene.add(reflected(glow));
      lanterns.push({x,y,z,size,phase:rand()*fullTurn,glow});
    }
    // The far bank reads as a single dark silhouette behind thousands of lights.
    const canopy=new T.IcosahedronGeometry(1,1);
    const treeMat=new T.MeshBasicMaterial({color:color('#041018')});
    for(const side of [-1,1]){
      for(let i=0;i<190;i++){
        const z=-266+rand()*362,x=bankX(z,side)+side*(3+rand()*6);
        const h=.9+rand()*1.8;
        batch(canopy,treeMat,x,.86+h*.35,z,1+rand()*1.5,h,.9+rand(),rand()*fullTurn);
      }
    }

    // Thousands of distant envelopes use one point draw per pass. Their real
    // positions also render into the river reflection, including on camera turns.
    const cloudPositions=[],cloudData=[];
    for(let i=0;i<3200;i++){
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
    for(let i=0;i<560;i++){
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
          float rise=mod(position.y-1.3+time*(.11+.04*lanternData.z),40.);
          p.y=1.3+rise;p.x-=(p.y-position.y)*.19;
          visibility=smoothstep(0.,1.1,rise)*(1.-smoothstep(37.,40.,rise));
        }
        p.x+=.18*sin(time*.27+lanternData.y);p.y+=.25*sin(time*.31+lanternData.y);
        vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;
        gl_PointSize=clamp(lanternData.x*viewportHeight*projectionMatrix[1][1]/max(1.,-mv.z),2.6,26.);
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
    const timberMap=painted(512,(ctx,n)=>{
      ctx.fillStyle='#78807a';ctx.fillRect(0,0,n,n);
      for(let i=0;i<18;i++){
        const z=i*n/18;
        ctx.fillStyle=['#85877b','#797c71','#80847c','#767d76'][i%4];
        ctx.fillRect(0,z,n,n/18);
        ctx.fillStyle='#404b48';ctx.fillRect(0,z,n,1.8);
        for(let j=0;j<38;j++){
          ctx.fillStyle=j%2?'#c1b8a628':'#313d3820';
          ctx.fillRect(rand()*n,z+rand()*n/18,10+rand()*110,.75);
        }
      }
    });
    const timber=new T.MeshStandardMaterial({map:timberMap,roughness:.87,color:color('#a3abb0')});
    const blueTiles=new T.MeshStandardMaterial({map:limestone,color:color('#486679'),roughness:.8});
    const cedar=new T.MeshStandardMaterial({color:color('#926447'),roughness:.86});
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
      const roof=r%2?cedar:blueTiles;
      batch(cube,timber,x,-.16,z,w,.32,d);
      for(const side of [-1,1]){
        const wallX=x+side*(w/2-.13);
        batch(cube,stone,wallX,.42,z,.28,.85,d);
        batch(cube,edge,wallX,.85,z,.35,.08,d);
        batch(cube,roof,wallX,h,z,.28,.34,d+.65);
        // A raised ridge and deep eaves frame the water through each gallery.
        batch(cube,roof,x+side*w*.26,h+.52,z,w*.54,.17,d+.7,0,-side*.18);
        batch(cube,cedar,x+side*w*.5,h+.30,z,.23,.20,d+.74);
        for(const dz of [-d/2,0,d/2]){
          batch(cube,cedar,wallX,h*.5,z+dz,.24,h,.24);
          batch(cube,bronze,wallX,.95,z+dz,.26,.072,.26);
        }
        for(const dz of [-d/2,d/2]){
          const wing=w/2-1.65;
          batch(cube,stone,x+side*(1.65+wing/2),.43,z+dz,wing,.86,.24);
          batch(cube,edge,x+side*(1.65+wing/2),.87,z+dz,wing,.07,.34);
          batch(cube,cedar,x+side*1.65,h*.5,z+dz,.20,h,.22);
          batch(cube,bronze,x+side*1.65,h-.30,z+dz,.26,.078,.26);
        }
      }
      for(const dz of [-d/2,d/2]){
        batch(cube,cedar,x,h,z+dz,w,.18,.24);
        lantern(x-1.22,h-.85,z+dz,.67);
        lantern(x+1.22,h-.85,z+dz,.67);
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
        batch(cube,cedar,px+.09*side,mid,pz,pw+.34,ph+.34,.14,angle);
        batch(cube,linen,px,mid,pz,pw+.14,ph+.14,.06,angle);
        for(const dz of [-pw*.36,pw*.36])batch(cube,bronze,px+.13*side,mid*.5,pz+dz,.065,mid,.065);
        const pic=new T.Mesh(photoGeometry(id,pw,ph),photoMat);
        pic.position.set(px-.043*side,mid,pz);pic.rotation.y=angle;pic.userData.index=stations.length;
        scene.add(pic);portraits.push(pic);stations.push({x:px-side*3.55,z:pz,angle,room});
        lantern(px-side*.3,2.57,pz+pw/2+.44,.54);
        batch(poolGeo,poolMat,px-side*.5,.013,pz,1.6,1,1.6);
      });
    });
    for(const [i,b] of bridges.entries()){
      const dx=(b.x-b.sx)/b.length,dz=(b.z-b.sz)/b.length,angle=Math.atan2(dx,dz);
      const cx=(b.x+b.sx)/2,cz=(b.z+b.sz)/2;
      const spans=Math.ceil(b.length/3.5);
      for(let j=0;j<spans;j++){
        const t=(j+.5)/spans;
        batch(cube,timber,b.sx+t*(b.x-b.sx),-.13,b.sz+t*(b.z-b.sz),b.width,.26,b.length/spans+.035,angle);
      }
      for(const side of [-1,1]){
        const ex=dz*side*(b.width/2-.065), ez=-dx*side*(b.width/2-.065);
        batch(cube,cedar,cx+ex,.60,cz+ez,.065,.08,b.length,angle);
        batch(cube,bronze,cx+ex,.33,cz+ez,.028,.035,b.length,angle);
        for(let j=0;j<=spans;j++){
          const t=j/spans,px=b.sx+t*(b.x-b.sx)+ex,pz=b.sz+t*(b.z-b.sz)+ez;
          batch(cube,plinth,px,.12,pz,.15,1.25,.15,angle);
          batch(cube,bronze,px,.75,pz,.17,.06,.17,angle);
        }
      }
      if(b.sz<-75){
        lantern(cx+dz*2,.78,cz-dx*2,.83);
        if(i%2===0)lantern(cx-dz*3.5,1.86,cz+dx*3.5,.74);
      }
    }
    // Wider landings give the angled bridge ends a continuous floor.
    const joint=new T.CylinderGeometry(1,1,1,12);
    for(const [x,z] of route.slice(1,-1))
      batch(joint,timber,x,-.16,z,1.51,.30,1.51);
    batch(cube,timber,end[0],-.17,end[1],6.6,.34,4.7);
    for(const side of [-1,1]){
      batch(cube,stone,end[0]+side*3.14,.18,end[1],.25,.55,4.6);
      lantern(end[0]+side*3.10,1.06,end[1]-1.66,.96);
    }
    for(const {geometry,material,matrices} of batches.values()){
      const objects=new T.InstancedMesh(geometry,material,matrices.length);
      matrices.forEach((m,i)=>objects.setMatrixAt(i,m));objects.frustumCulled=false;scene.add(reflected(objects));
    }

    // Individual nearby lanterns show the bamboo hoops and translucent paper.
    for(let i=0;i<44;i++){
      const angle=fullTurn*(i+rand()*.7)/44,dist=14+rand()*15;
      lantern(Math.sin(angle)*dist,4+rand()*7,-Math.cos(angle)*dist,.55+rand()*1.12);
    }
    const lanternMeshes=pieces.map(([geometry,material])=>{
      const group=new T.InstancedMesh(geometry,material,lanterns.length);
      group.frustumCulled=false;scene.add(reflected(group));return group;
    });
    lanterns.forEach((_,i)=>lanternMeshes[0].setColorAt(i,color(['#ffffff','#ffdcbb','#ffedc9','#ffd1ac'][i%4])));
    const support=new T.Object3D(),localPart=new T.Object3D(),partMatrix=new T.Matrix4();
    function updateLanterns(time){
      nightTime.value=reduced.matches?0:time;
      lanterns.forEach(({x,y,z,size,phase,glow},i)=>{
        const t=reduced.matches?0:time;
        const lift=Math.sin(t*.36+phase), drift=Math.sin(t*.21+phase*1.2);
        support.position.set(x+.12*drift,y+.17*lift,z+.078*Math.cos(t*.24+phase));
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
      lightHeight.value=reflection.height;renderer.setRenderTarget(reflection);renderer.render(scene,mirror);
      lightHeight.value=canvas.height;renderer.setRenderTarget(null);renderer.render(scene,camera);
    }
    function resize(){
      const w=view.clientWidth,h=view.clientHeight;
      if(!w||!h)return;
      poolView.fov=Math.min(27,48*w/h);
      poolView.updateProjectionMatrix();
      poolMatrix.multiplyMatrices(poolView.projectionMatrix,poolView.matrixWorldInverse);
      renderer.setSize(w,h,false);reflection.setSize(Math.max(1,Math.round(w*.55)),Math.max(1,Math.round(h*.55)));camera.aspect=w/h;camera.updateProjectionMatrix();draw();
    }
    new ResizeObserver(resize).observe(view);
    function shortest(a){return Math.atan2(Math.sin(a),Math.cos(a))}
    let guidePoints=[],guideHeading=0,arrival=null;
    const releaseControlsAt=16;
    function beginFarewell(){
      elapsed=0;
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
        p.x+=dx*step;p.z+=dz*step;
      }
      yaw+=shortest(guideHeading-yaw)*Math.min(1,dt*3.5);
      pitch+=(.015-pitch)*Math.min(1,dt*2);
      if(d<.07)setGuide(guideTarget+1<guidePoints.length?guideTarget+1:-1);
    }
    function go(index,reset=false){
      if(reset){arrival=null;walkPanel.inert=false;elapsed=-1;showFinale(-1)}
      if(arrival)return;
      lastLocation=null;
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
      const steps=Math.ceil(Math.hypot(dx,dz)/.24);
      for(let i=0;i<steps;i++){
        const x=p.x+dx/steps,z=p.z+dz/steps;
        if(riverWalk.walkable(x,z)){p.x=x;p.z=z}
        else if(riverWalk.walkable(x,p.z))p.x=x;
        else if(riverWalk.walkable(p.x,z))p.z=z;
      }
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
    if(userGesture)playMusic();
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
    if(document.hidden){stopFrames();pauseMusic()}
    else if(dialog.open){startFrames();playMusic()}
  });
  if(matchMedia('(pointer:coarse)').matches){
    document.querySelector('#garden-directions').textContent='Hold arrows to walk · Drag to look';
  }
  audioLabel();
  if(location.hash==='#memorial')enter(false);
})();
