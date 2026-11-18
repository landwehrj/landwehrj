// A small orthographic diorama. Render only when it changes.
(() => {
  const stage = document.querySelector('#stage');
  if (!window.THREE) return;
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({antialias: true, alpha: true});
  } catch {
    return; // The still image and its three HTML controls are available without WebGL.
  }
  const T = THREE;
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputEncoding = T.sRGBEncoding;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  const scene = new T.Scene();
  const camera = new T.OrthographicCamera(-4,4,3,-3,.1,60);
  const root = new T.Group();
  scene.add(root);
  const cache = new Map();
  function material(color) {
    if (!cache.has(color)) cache.set(color,new T.MeshStandardMaterial({color:new T.Color(color).convertSRGBToLinear(),roughness:.82}));
    return cache.get(color);
  }
  function mesh(parent, geometry, surface, x,y,z) {
    const obj = new T.Mesh(geometry,typeof surface === 'string' ? material(surface) : surface);
    obj.position.set(x,y,z);
    obj.castShadow = obj.receiveShadow = true;
    parent.add(obj);
    return obj;
  }
  function group(parent,x,y,z) {
    const obj = new T.Group();
    parent.add(obj);
    obj.position.set(x,y,z);
    return obj;
  }
  function box(parent,x,y,z,w,h,d,surface,bevel=0) {
    let geometry;
    if (bevel) {
      const a=w/2-bevel,b=h/2-bevel;
      const shape=new T.Shape();
      shape.moveTo(-a,-b);shape.lineTo(a,-b);shape.lineTo(a,b);shape.lineTo(-a,b);shape.closePath();
      geometry=new T.ExtrudeGeometry(shape,{depth:d-2*bevel,bevelEnabled:true,bevelSegments:3,steps:1,bevelSize:bevel,bevelThickness:bevel});
      geometry.center();
    } else geometry=new T.BoxGeometry(w,h,d);
    return mesh(parent,geometry,surface,x,y,z);
  }
  function cylinder(parent,x,y,z,rt,rb,h,color,n=32) {
    return mesh(parent,new T.CylinderGeometry(rt,rb,h,n),color,x,y,z);
  }
  function ball(parent,x,y,z,a,b,c,color) {
    const obj=mesh(parent,new T.SphereGeometry(1,24,16),color,x,y,z);
    obj.scale.set(a,b,c);
    return obj;
  }
  function rod(parent,a,b,r,color) {
    const start=new T.Vector3(...a),end=new T.Vector3(...b);
    const mid=start.clone().lerp(end,.5);
    const obj=cylinder(parent,mid.x,mid.y,mid.z,r,r,start.distanceTo(end),color,12);
    obj.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),end.sub(start).normalize());
    return obj;
  }
  function texture(width,height,paint) {
    const canvas=document.createElement('canvas');
    canvas.width=width;canvas.height=height;
    paint(canvas.getContext('2d'),width,height);
    const tex=new T.CanvasTexture(canvas);
    tex.encoding=T.sRGBEncoding;
    return tex;
  }
  function surface(parent,x,y,z,w,h,map) {
    const obj=mesh(parent,new T.PlaneGeometry(w,h),new T.MeshBasicMaterial({map,transparent:true,depthWrite:false}),x,y,z);
    obj.castShadow=false;
    return obj;
  }
  const hemi=new T.HemisphereLight(0xfff4da,0xbcb197,.74);
  scene.add(hemi);
  const sun=new T.DirectionalLight(0xffedcf,.85);
  sun.position.set(-3,8,5);sun.castShadow=true;
  Object.assign(sun.shadow.camera,{left:-5,right:5,top:5,bottom:-5});
  sun.shadow.mapSize.set(2048,2048);sun.shadow.normalBias=.015;sun.shadow.bias=-.0003;
  scene.add(sun);
  const fill=new T.DirectionalLight(0xfff2d1,.23);
  fill.position.set(4,3,-4);scene.add(fill);

  const groundShadow=mesh(root,new T.PlaneGeometry(40,40),new T.ShadowMaterial({opacity:.13}),0,-.285,0);
  groundShadow.rotation.x=-Math.PI/2;
  groundShadow.castShadow=false;

  // Oak block, individual parquet boards, and a woven rug.
  box(root,0,-.13,.4,5.95,.26,4.65,'#a47e53',.065);
  const shades=['#caa77b','#d0ae81','#d6b58b','#c7a170','#cfad80'];
  for(let row=0;row<14;row++) {
    const z=-1.73+row*.329;
    const cuts=row%2 ? [-2.95,-1.85,.48,2.95] : [-2.95,-.7,1.6,2.95];
    for(let j=1;j<cuts.length;j++) {
      box(root,(cuts[j-1]+cuts[j])/2,.012,z,cuts[j]-cuts[j-1]-.012,.035,.32,shades[(row+2*j)%5]);
    }
  }
  const rug=texture(600,360,(ctx,w,h)=>{
    ctx.fillStyle='#75836a';ctx.fillRect(0,0,w,h);
    for(let k=0;k<w;k+=3){ctx.fillStyle=k%2?'#ffffff10':'#27382215';ctx.fillRect(k,0,1,h)}
    for(let k=0;k<h;k+=3){ctx.fillStyle='#33452b1a';ctx.fillRect(0,k,w,1)}
    for(const n of [11,17,28]){ctx.strokeStyle='#c4bc91';ctx.lineWidth=n===17?4:2;ctx.strokeRect(n,n,w-2*n,h-2*n)}
  });
  const mat=surface(root,.12,.05,.95,4.85,2.93,rug);mat.rotation.x=-Math.PI/2;
  for (const end of [-1,1]) for(let i=0;i<55;i++) {
    box(root,.12+end*2.46,.044,-.40+i*.05,.12,.014,.018,'#c4b691');
  }
  // Desk, drawer, monitor and keyboard.
  const desk=group(root,-.12,0,-.53);
  for(const x of [-2,2])for(const z of [-.65,.65]) {
    box(desk,x,.88,z,.14,1.65,.14,'#876446',.018);
    box(desk,x,.12,z,.15,.12,.15,'#575348',.012);
  }
  box(desk,0,1.55,-.65,4,.24,.12,'#926e4c');
  box(desk,1.42,1.52,.36,.99,.24,.56,'#946c47',.028);
  box(desk,1.42,1.53,.662,.29,.03,.04,'#504634',.01);
  box(desk,0,1.74,0,4.52,.18,1.83,'#534337',.052);
  const grain=texture(1024,400,(ctx,w,h)=>{
    ctx.fillStyle='#624b3c';ctx.fillRect(0,0,w,h);
    for(let i=0;i<155;i++){
      const y=(i*67)%h;
      ctx.strokeStyle=i%4?'#30261f38':'#93745d41';
      ctx.lineWidth=i%3+.45;ctx.beginPath();ctx.moveTo(0,y);
      ctx.bezierCurveTo(w*.34,y+Math.sin(i)*12,w*.62,y-Math.cos(i)*8,w,y+Math.sin(i*3)*7);ctx.stroke();
    }
  });
  surface(desk,0,1.833,0,4.43,1.73,grain).rotation.x=-Math.PI/2;
  // The desk photo shows a portrait display beside a wide, black LG monitor.
  const monitor=group(desk,.43,1.84,-.48);
  function display(parent,width,height,centerY,map) {
    box(parent,0,.035,0,width*.39,.07,.44,'#202124',.027);
    box(parent,0,centerY*.48,-.05,.12,centerY*.85,.12,'#2c2d30',.028);
    box(parent,0,centerY,0,width,height,.10,'#202125',.028);
    surface(parent,0,centerY+.024,.052,width-.065,height-.095,map);
  }
  const mainScreen=texture(1100,590,(ctx,w,h)=>{
    ctx.fillStyle='#333538';ctx.fillRect(0,0,w,h);
    ctx.fillStyle='#212429';ctx.fillRect(0,0,w,37);
    ctx.fillStyle='#c3c4bb';ctx.font='18px monospace';ctx.fillText('memories.txt',32,25);
    ctx.fillStyle='#292c30';ctx.fillRect(0,37,64,h-62);
    ctx.font='19px monospace';
    for(let i=0;i<11;i++){ctx.fillStyle='#828783';ctx.fillText(String(i+1).padStart(2,' '),18,82+i*43)}
    ctx.fillStyle='#b9cbb6';ctx.font='27px monospace';ctx.fillText('# Her desk',94,99);
    ctx.fillStyle='#ece8d9';ctx.font='45px Georgia';
    ['In memory of the best','pair programmer','of 20 years.'].forEach((line,i)=>ctx.fillText(line,94,205+i*64));
    ctx.fillStyle='#dbad83';ctx.font='23px monospace';ctx.fillText('2006 — 2026',94,465);
    ctx.fillStyle='#996043';ctx.fillRect(0,h-15,w,15);
  });
  display(monitor,2.46,1.42,1.01,mainScreen);
  const logo=texture(100,28,ctx=>{
    ctx.fillStyle='#bbbfc1';ctx.font='bold 24px sans-serif';ctx.fillText('LG',30,24);
  });
  surface(monitor,0,.333,.054,.12,.034,logo);
  const second=group(desk,-1.41,1.84,-.44);
  second.rotation.y=.21;
  const sideScreen=texture(560,900,(ctx,w,h)=>{
    ctx.fillStyle='#20252b';ctx.fillRect(0,0,w,h);
    ctx.fillStyle='#292f36';ctx.fillRect(0,0,46,h);
    const lines=[
      '// desk.js','const scene = new THREE.Scene();',
      'const chair = new THREE.Group();','scene.add(chair);',
      'const light = new THREE.HemisphereLight(','  0xfff4da, 0xbcb197, 0.74',');',
      'scene.add(light);','// Her markings, from the photo album',
      'const loader = new THREE.TextureLoader();','function fur(name) {',
      '  const map = loader.load(parts[name].map);','  map.encoding = THREE.sRGBEncoding;',
      '  return new THREE.MeshStandardMaterial({','    map, roughness: 0.96','  });','}',
      '// The chair turns with the mouse.','function render() {',
      '  camera.lookAt(chair.position);','  camera.updateProjectionMatrix();',
      '  renderer.render(scene, camera);','}','render();'
    ];
    ctx.font='20px monospace';ctx.textBaseline='middle';
    const lineHeight=h/lines.length;
    lines.forEach((line,i)=>{
      const y=(i+.5)*lineHeight;
      ctx.fillStyle='#83919b';ctx.fillText(String(i+1).padStart(2,' '),8,y);
      let x=57;
      for(const token of line.match(/\/\/.*|0x[\da-f]+|\w+|\s+|./gi)){
        ctx.fillStyle=token.startsWith('//')?'#a6be98':
          /^(const|new|function|return)$/.test(token)?'#dfa9cf':
          /^([A-Z]|0x)/.test(token)?'#e6bd91':/^\w/.test(token)?'#b8dbe4':'#deded7';
        ctx.fillText(token,x,y);
        x+=ctx.measureText(token).width;
      }
    });
  });
  display(second,1.12,1.77,1.13,sideScreen);

  // Full-size keyboard with six staggered rows, separate navigation keys and numpad.
  const keys=group(desk,.38,1.87,.53);
  const caps=[];
  const keyboardMap=texture(1536,465,(ctx,w,h)=>{
    ctx.fillStyle='#141519';ctx.fillRect(0,0,w,h);
    const glow=ctx.createLinearGradient(0,0,w,h);
    glow.addColorStop(0,'#f8a42a');glow.addColorStop(.35,'#f3771f');glow.addColorStop(.67,'#f13e23');glow.addColorStop(1,'#d72c43');
    ctx.fillStyle=glow;ctx.fillRect(12,h-14,w-24,9);
    ctx.font='bold 18px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
    const unit=65,top=22;
    function key(x,row,label,size=1){
      const y=top+row*69+(row?10:0);
      ctx.fillStyle=glow;ctx.fillRect(x-3,y-3,unit*size+1,68);
      ctx.fillStyle='#242427';ctx.fillRect(x,y,unit*size-4,62);
      ctx.fillStyle='#363639';ctx.fillRect(x+3,y+2,unit*size-10,49);
      ctx.fillStyle=glow;ctx.fillText(label,x+(unit*size-4)/2,y+24);
      caps.push([x,y,unit*size-4,62]);
    }
    function row(x,index,labels){
      for(const entry of labels){
        const [label,size]=Array.isArray(entry)?entry:[entry,1];
        key(x,index,label,size);x+=size*unit;
      }
    }
    row(24,0,['Esc','F1','F2','F3','F4','F5','F6','F7','F8','F9','F10','F11','F12']);
    row(24,1,['~',...'1234567890','-','=', ['⌫',2]]);
    row(24,2,[['Tab',1.5],...'QWERTYUIOP','[',']',['\\',1.5]]);
    row(24,3,[['Caps',1.75],...'ASDFGHJKL',';', "'",['Enter',2.25]]);
    row(24,4,[['Shift',2.25],...'ZXCVBNM',',','.','/',['Shift',2.75]]);
    row(24,5,[['Ctrl',1.25],'◆','Alt',['',6.5],'Alt','◆','☰',['Ctrl',2.25]]);
    const nav=1020,pad=1242;
    row(nav,0,['Prt','Scr','Pau']);row(nav,1,['Ins','Home','Pg↑']);row(nav,2,['Del','End','Pg↓']);
    key(nav+unit,4,'↑');row(nav,5,['←','↓','→']);
    [['Num','/','×','−'],['7','8','9','+'],['4','5','6',''],['1','2','3','↵'],[['0',2],'.','']].forEach((r,i)=>row(pad,i+1,r));
  });
  box(keys,0,0,0,1.82,.07,.55,'#1f2023',.026);
  surface(keys,0,.037,0,1.79,.53,keyboardMap).rotation.x=-Math.PI/2;
  // Raise the keytops above the luminous gaps and use the same atlas for their legends.
  const capVertices=[], capUVs=[], capIndices=[];
  for(const [x,y,w,h] of caps){
    const start=capVertices.length/3;
    for(const top of [false,true]){
      const inset=top?6:1;
      for(const [u,v] of [[x+inset,y+inset],[x+w-inset,y+inset],[x+w-inset,y+h-inset],[x+inset,y+h-inset]]){
        capVertices.push((u/1536-.5)*1.79,top?.059:.038,(v/465-.5)*.53);
        capUVs.push(u/1536,1-v/465);
      }
    }
    capIndices.push(start+4,start+6,start+5,start+4,start+7,start+6);
    for(let i=0;i<4;i++){
      const j=(i+1)%4;
      capIndices.push(start+i,start+4+i,start+j,start+j,start+4+i,start+4+j);
    }
  }
  const capGeometry=new T.BufferGeometry();
  capGeometry.setAttribute('position',new T.Float32BufferAttribute(capVertices,3));
  capGeometry.setAttribute('uv',new T.Float32BufferAttribute(capUVs,2));
  capGeometry.setIndex(capIndices);capGeometry.computeVertexNormals();
  mesh(keys,capGeometry,new T.MeshStandardMaterial({map:keyboardMap,roughness:.78,side:T.DoubleSide}),0,0,0);
  ball(desk,1.55,1.886,.53,.10,.063,.146,'#24262a');
  rod(desk,[1.55,1.946,.51],[1.55,1.944,.47],.013,'#607080');
  const speaker=group(desk,-.71,1.84,-.16);
  box(speaker,0,.18,0,.22,.36,.18,'#25272b',.035);
  for (const y of [.105,.25]){
    ball(speaker,0,y,.091,.066,.066,.015,'#646467');
    ball(speaker,0,y,.104,.046,.046,.016,'#212328');
  }
  // A plant with arching stems and pairs of pointed leaves.
  const plant=group(desk,1.93,1.84,-.68);
  plant.scale.setScalar(.67);
  cylinder(plant,0,.18,0,.23,.16,.36,'#ae7351');
  cylinder(plant,0,.35,0,.25,.24,.068,'#bf8960');
  cylinder(plant,0,.387,0,.218,.218,.012,'#594636');
  for(let k=0;k<9;k++){
    const a=k*2.4,length=.26+(k%3)*.08,height=.30+(k%4)*.09;
    const end=[Math.cos(a)*length,.41+height,Math.sin(a)*length];
    rod(plant,[0,.38,0],end,.012,'#667348');
    const leaf=ball(plant,...end,.082,.20,.032,['#72865c','#546d48','#869461'][k%3]);
    leaf.rotation.order='YXZ';leaf.rotation.y=-a+Math.PI/2;leaf.rotation.x=.74;
  }
  const book=group(desk,1.84,1.86,.04);book.rotation.y=-.30;book.scale.setScalar(.72);
  box(book,0,0,0,.85,.055,.56,'#53654f',.014);
  for(const side of [-1,1]){
    box(book,side*.2,.033,0,.39,.045,.518,'#eee2bc',.012);
    for(let i=0;i<5;i++)box(book,side*.2,.057,-.16+i*.067,.27-(i%2)*.04,.003,.008,'#b6aa8c');
  }
  box(book,.09,.057,.19,.034,.008,.19,'#aa6846');

  // Soft upholstery has curved profiles and a pinched seam around the pillow.
  function upholstered(parent,x,y,z,w,h,d,color,exponent,shape) {
    const geometry=new T.SphereGeometry(1,80,44);
    const pos=geometry.attributes.position;
    const power=v=>Math.sign(v)*Math.pow(Math.abs(v)<1e-7?0:Math.abs(v),exponent);
    for(let i=0;i<pos.count;i++) {
      const nx=power(pos.getX(i)),ny=power(pos.getY(i)),nz=power(pos.getZ(i));
      const point=shape?shape(nx,ny,nz):[nx,ny,nz];
      pos.setXYZ(i,point[0]*w/2,point[1]*h/2,point[2]*d/2);
    }
    geometry.computeVertexNormals();
    return mesh(parent,geometry,color,x,y,z);
  }
  function stroke(parent,points,radius,color) {
    const curve=new T.CatmullRomCurve3(points.map(p=>new T.Vector3(...p)));
    return mesh(parent,new T.TubeGeometry(curve,32,radius,8,false),color,0,0,0);
  }

  const chair=group(root,-.23,0,1.64);
  chair.rotation.y=.19;
  cylinder(chair,0,.52,0,.085,.11,.78,'#404043');
  for(let i=0;i<5;i++) {
    const a=i*Math.PI*2/5;
    const x=Math.sin(a)*.82,z=Math.cos(a)*.82;
    rod(chair,[0,.32,0],[x,.16,z],.052,'#404043');
    ball(chair,x,.12,z,.09,.078,.10,'#39393c');
  }
  upholstered(chair,0,.90,0,2.11,.35,1.64,'#63615e',.56);
  upholstered(chair,0,1.04,.07,2.09,.28,1.57,'#73825b',.48);
  const pillow=group(chair,0,1.19,.08);
  pillow.rotation.y=-.065;
  upholstered(pillow,0,0,0,2.06,.34,1.55,'#e6e0ce',.53,(x,y,z)=>{
    const rim=Math.max(Math.abs(x),Math.abs(z));
    const corner=Math.abs(x*z)**3;
    const crease=.055*Math.sin(15*x-5*z)*Math.cos(4*z)*rim**5;
    return [x*(1+.08*corner),y*(.80-.43*corner)+corner*.81+crease+.075*x-.22*(1-rim*rim),z*(1+.08*corner)];
  });
  const seam=[];
  for(let i=0;i<=96;i++){
    const a=i*Math.PI*2/96;
    const contour=v=>Math.sign(v)*Math.abs(v)**.53;
    const x=contour(Math.cos(a)),z=contour(Math.sin(a)),corner=Math.abs(x*z)**3;
    seam.push([1.032*x*(1+.08*corner),.17*(corner*.81+.075*x),.777*z*(1+.08*corner)]);
  }
  stroke(pillow,seam,.010,'#c8c0ae');
  const back=group(chair,0,1.91,-.68);
  back.rotation.x=-.14;
  upholstered(back,0,-.01,-.04,1.99,1.91,.31,'#64615f',.55);
  upholstered(back,0,.01,.081,1.43,1.76,.32,'#73706e',.60,(x,y,z)=>
    [x*(.91+.083*y*y),y,z-.34*(1-x*x)*Math.exp(-((y+.28)**2)/.012)]);
  for(const side of [-1,1]){
    const bolster=upholstered(back,side*.79,.0,.15,.44,1.77,.46,'#6c6968',.69);
    bolster.rotation.z=-side*.055;
    stroke(back,[[side*.68,-.69,.27],[side*.66,-.31,.31],[side*.66,.17,.32],[side*.69,.64,.25]],.008,'#595657');
    const arm=group(chair,side*1.02,1.48,-.055);
    arm.rotation.x=-.10;
    upholstered(arm,0,0,0,.23,.17,1.16,'#605e5d',.59);
    stroke(arm,[[side*.102,.002,-.48],[side*.116,.0,-.02],[side*.102,.006,.46]],.006,'#484745');
    stroke(chair,[[side*.89,.93,-.40],[side*.99,1.10,-.34],[side*1.02,1.37,-.24]],.059,'#505053');
  }

  // Reconstruct the chair pose in the camera frame used to trace photo 17.
  // Moving a point along the viewing ray adds depth without moving its marking.
  const cat=group(chair,.04,1.29,.12);
  const {scale,elevation,origin,parts}=catReference;
  const pitch=T.MathUtils.degToRad(elevation);
  const up=Math.sin(pitch), forward=Math.cos(pitch);
  const loader=new T.TextureLoader();

  for(const [name,part] of Object.entries(parts)){
    const rings=part.rings, sides=64;
    const vertices=[],uv=[],indices=[];
    const middle=Math.floor(rings.length/2);
    const [mx,my,sx,sy]=rings[middle];
    const [nextX,nextY]=rings[middle+1];
    const reverse=(nextX-mx)*sy-(nextY-my)*sx>0;
    for(let i=0;i<rings.length;i++){
      const [cx,cy,rx,ry,height,depth]=rings[i];
      const centerZ=((cy-origin[1])/scale+height*forward)/up;
      for(let j=0;j<=sides;j++){
        const angle=2*Math.PI*j/sides;
        const across=Math.cos(angle), facing=Math.sin(angle);
        const px=cx+rx*across, py=cy+ry*across;
        let relief=depth*facing;
        if(name==='head' && facing>0){
          // A small raised bridge from the amber streak to the white nose.
          const bridge=Math.exp(-((px-429)**2)/95-((py-245)**2)/170);
          const muzzle=Math.exp(-((px-423)**2)/130-((py-256)**2)/50);
          relief+=facing*(.025*bridge+.023*muzzle);
        }
        if((name==='nearEar' || name==='farEar') && facing>0){
          relief-=depth*.46*facing**3; // Fold the front into a shallow ear cup.
        }
        const down=(py-cy)/scale;
        vertices.push((px-origin[0])/scale,height-down*forward+relief*up,
                      centerZ+down*up+relief*forward);
        uv.push(j/sides,i/(rings.length-1));
        if(i<rings.length-1 && j<sides){
          const a=i*(sides+1)+j,b=a+sides+1;
          if(reverse) indices.push(a,b,a+1,a+1,b,b+1);
          else indices.push(a,a+1,b,a+1,b+1,b);
        }
      }
    }
    const geometry=new T.BufferGeometry();
    geometry.setIndex(indices);
    geometry.setAttribute('position',new T.Float32BufferAttribute(vertices,3));
    geometry.setAttribute('uv',new T.Float32BufferAttribute(uv,2));
    geometry.computeVertexNormals();
    const normals=geometry.attributes.normal, seamNormal=new T.Vector3(), other=new T.Vector3();
    for(let i=0;i<rings.length;i++){
      const first=i*(sides+1),last=first+sides;
      seamNormal.fromBufferAttribute(normals,first).add(other.fromBufferAttribute(normals,last)).normalize();
      normals.setXYZ(first,seamNormal.x,seamNormal.y,seamNormal.z);
      normals.setXYZ(last,seamNormal.x,seamNormal.y,seamNormal.z);
    }
    const map=loader.load(part.map,()=>render());
    map.encoding=T.sRGBEncoding;
    // The photographs already contain soft light. Retain it while allowing the
    // chair and the overlapping parts of the body to shade the sculpture.
    const pelt=new T.MeshLambertMaterial({map,color:0x252525,emissiveMap:map,emissive:0xdadada});
    mesh(cat,geometry,pelt,0,0,0);
  }

  // The fine whiskers extend beyond the photographed cheek silhouette.
  // Heights here correspond to the front of the muzzle, above the cushion.
  for(const line of [
    [[410,252,.20],[400,246,.20],[390,239,.21],[382,237,.22]],
    [[411,255,.19],[400,251,.19],[388,246,.18],[379,246,.18]],
    [[438,255,.20],[449,249,.21],[461,237,.22],[470,232,.23]],
    [[440,257,.18],[450,253,.19],[462,245,.20],[474,242,.20]]
  ]){
    const points=line.map(([x,y,h])=>[(x-origin[0])/scale,h,((y-origin[1])/scale+h*forward)/up]);
    stroke(cat,points,.0009,'#e2dfd5');
  }

  const targets=[
    [document.querySelector('.spot.monitor'),monitor,new T.Vector3(1.08,.91,.11)],
    [document.querySelector('.spot.notebook'),book,new T.Vector3(.36,.11,.05)],
    [document.querySelector('.spot.chair'),chair,new T.Vector3(.89,1.08,.49)]
  ];
  let angle=.47, drag=null;
  const mid=new T.Vector3(0,1.55,.37);
  function render(){
    const w=stage.clientWidth,h=stage.clientHeight;
    if(!w || !h)return;
    const height=6.80, width=height*w/h;
    camera.left=-width/2;camera.right=width/2;camera.top=height/2;camera.bottom=-height/2;
    camera.position.set(mid.x+Math.sin(angle)*10,mid.y+5.4,mid.z+Math.cos(angle)*10);
    camera.lookAt(mid);camera.updateProjectionMatrix();camera.updateMatrixWorld();
    renderer.render(scene,camera);
    for(const [button,parent,loc] of targets) {
      const pos=parent.localToWorld(loc.clone()).project(camera);
      button.style.left=((pos.x+1)*50)+'%';button.style.top=((1-pos.y)*50)+'%';
    }
  }
  const canvas=renderer.domElement;
  canvas.setAttribute('aria-hidden','true');
  stage.insertBefore(canvas,stage.querySelector('.spot'));
  function size(){renderer.setSize(stage.clientWidth,stage.clientHeight,false);render()}
  new ResizeObserver(size).observe(stage);size();
  stage.querySelector('.poster').hidden=true;
  stage.querySelector('.poster').style.display='none';
  document.querySelector('#turn-hint').hidden=false;
  canvas.addEventListener('pointerdown',e=>{
    drag={x:e.clientX,angle};canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove',e=>{
    if(!drag)return;
    angle=T.MathUtils.clamp(drag.angle-(e.clientX-drag.x)*.006,-.65,1.12);render();
  });
  function release(){drag=null}
  canvas.addEventListener('lostpointercapture',release);
  canvas.addEventListener('pointerup',release);
  canvas.addEventListener('pointercancel',release);
})();
