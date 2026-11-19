const riverShadows=(() => {
  const reach=5.8,faceSize=192,bakeSize=224,textureWidth=256;
  const margin=2.4,moonStart=12,moonRange=24;
  const movingSize=512,movingRange=4.8,movingSpread=1.3,movingLimit=2;

  function uniforms(T,rooms,lamps,moon){
    return {
      riverShadowMode:{value:0},
      riverShadowMask:{value:null},
      riverShadowDepth:{value:null},
      riverShadowTree:{value:null},
      riverShadowTreeHeight:{value:1},
      riverShadowNodeCount:{value:0},
      riverShadowRooms:{value:rooms.map(({x,z,width,depth})=>new T.Vector4(x,z,width/2+margin,depth/2+margin))},
      riverShadowLights:{value:lamps.map(({x,y,z,size})=>new T.Vector3(x,y+.31*size,z))},
      riverShadowMoon:{value:moon.clone().normalize()}
    };
  }
  function movingUniforms(T,tint){
    const vectors=()=>Array.from({length:movingLimit},()=>new T.Vector3());
    return {
      movingLampColor:{value:tint},movingLampPower:{value:new Float32Array(movingLimit)},
      movingLamp:{value:vectors()},movingShadowOrigin:{value:vectors()},
      movingShadowAxis:{value:vectors()},movingShadowAcross:{value:vectors()},movingShadowUp:{value:vectors()},
      movingShadowDepth:{value:null}
    };
  }

  function buildTree(T,matrices,limit,origin){
    if(!matrices.length)throw Error('No architecture to cast shadows');
    const unit=new T.Box3(new T.Vector3(-.5,-.5,-.5),new T.Vector3(.5,.5,.5));
    const solids=matrices.map(matrix=>{
      const bounds=unit.clone().applyMatrix4(matrix);
      return {bounds,center:bounds.getCenter(new T.Vector3()),inverse:matrix.clone().invert()};
    });
    const nodes=[];
    function visit(group){
      const bounds=new T.Box3();
      for(const solid of group)bounds.union(solid.bounds);
      const node={bounds,solid:group.length===1?group[0]:null,skip:0};
      nodes.push(node);
      if(!node.solid){
        const {x,y,z}=bounds.getSize(new T.Vector3());
        const axis=x>=y && x>=z?'x':y>=z?'y':'z';
        group.sort((a,b)=>a.center[axis]-b.center[axis]);
        const mid=group.length>>1;
        const low=group.slice(0,mid),high=group.slice(mid);
        const split=(low[mid-1].center[axis]+high[0].center[axis])*.5;
        if(origin && origin[axis]>split){visit(high);visit(low)}
        else{visit(low);visit(high)}
      }
      node.skip=nodes.length;
    }
    visit(solids);
    const height=Math.ceil((nodes.length*2+solids.length*3)/textureWidth);
    if(height>limit)throw Error('Shadow geometry exceeds the GPU texture limit');
    const pixels=new Float32Array(textureWidth*height*4);
    let next=nodes.length*2;
    nodes.forEach(({bounds,solid,skip},i)=>{
      pixels.set([...bounds.min.toArray(),skip,...bounds.max.toArray(),solid?next:-1],i*8);
      if(!solid)return;
      const e=solid.inverse.elements;
      for(let r=0;r<3;r++)pixels.set([e[r],e[r+4],e[r+8],e[r+12]],(next+r)*4);
      next+=3;
    });
    const tree=new T.DataTexture(pixels,textureWidth,height,T.RGBAFormat,T.FloatType);
    tree.needsUpdate=true;
    return {tree,height,count:nodes.length};
  }

  const rayShader=`
    uniform sampler2D riverShadowTree;
    uniform float riverShadowTreeHeight,riverShadowNodeCount;
    vec4 shadowTexel(float index){
      return texture2D(riverShadowTree,(vec2(mod(index,${textureWidth}.),floor(index/${textureWidth}.))+.5)
          /vec2(${textureWidth}.,riverShadowTreeHeight));
    }
    vec3 shadowInverseRay(vec3 ray){
      return mix(vec3(-1.),vec3(1.),step(vec3(0.),ray))/max(abs(ray),vec3(.000001));
    }
    vec2 shadowRange(vec3 p,vec3 inv,vec3 lo,vec3 hi){
      vec3 a=(lo-p)*inv,b=(hi-p)*inv;
      vec3 near=min(a,b),far=max(a,b);
      return vec2(max(near.x,max(near.y,near.z)),min(far.x,min(far.y,far.z)));
    }
    // Depth-first nodes carry a link past their subtree. A missed box skips
    // an entire branch, so traversal needs no shader stack.
    float shadowHit(vec3 p,vec3 ray,float limit,bool anyHit){
      float node=0.,nearest=limit;
      vec3 inv=shadowInverseRay(ray);
      for(int i=0;i<196;i++){
        if(node>=riverShadowNodeCount)break;
        vec4 lo=shadowTexel(node*2.),hi=shadowTexel(node*2.+1.);
        vec2 bounds=shadowRange(p,inv,lo.xyz-.00006,hi.xyz+.00006);
        if(max(bounds.x,0.)>min(bounds.y,nearest)){node=lo.w;continue;}
        node+=1.;
        if(hi.w<0.)continue;
        vec4 x=shadowTexel(hi.w),y=shadowTexel(hi.w+1.),z=shadowTexel(hi.w+2.);
        vec3 local=vec3(dot(x.xyz,p)+x.w,dot(y.xyz,p)+y.w,dot(z.xyz,p)+z.w);
        vec3 localRay=vec3(dot(x.xyz,ray),dot(y.xyz,ray),dot(z.xyz,ray));
        vec2 hit=shadowRange(local,shadowInverseRay(localRay),vec3(-.5),vec3(.5));
        if(hit.x>.009 && hit.x<nearest && hit.x<=hit.y){
          nearest=hit.x;
          if(anyHit)break;
        }
      }
      return nearest;
    }
  `;

  const diskShader=`
    vec3 shadowTangent(vec3 axis){
      return normalize(cross(axis,abs(axis.y)>.93?vec3(0.,0.,1.):vec3(0.,1.,0.)));
    }
    vec3 shadowDisk(float i,float count,vec3 axis,vec3 tangent){
      float angle=i*2.3999632;
      return (tangent*cos(angle)+cross(axis,tangent)*sin(angle))*sqrt(i/count);
    }
  `;

  const traceLantern=`
    float traceLanternShadow(vec3 p,vec3 lamp){
      vec3 axis=normalize(lamp-p),tangent=shadowTangent(axis);
      float light=0.;
      for(int i=0;i<5;i++){
        vec3 delta=lamp+.155*shadowDisk(float(i),5.,axis,tangent)-p;
        float distance=length(delta);
        light+=step(distance-.017,shadowHit(p,delta/distance,distance-.017,true));
      }
      return light*.2;
    }
  `;

  // Cube faces share the same coordinate convention in the prepass and receiver.
  const cubeShader=`
    vec3 shadowFaceRay(float face,vec2 uv){
      vec2 p=uv*2.-1.;
      if(face<.5)return normalize(vec3(1.,p.y,p.x));
      if(face<1.5)return normalize(vec3(-1.,p.y,p.x));
      if(face<2.5)return normalize(vec3(p.x,1.,p.y));
      if(face<3.5)return normalize(vec3(p.x,-1.,p.y));
      if(face<4.5)return normalize(vec3(p.x,p.y,1.));
      return normalize(vec3(p.x,p.y,-1.));
    }
    vec3 shadowFaceUV(vec3 ray){
      vec3 a=abs(ray);
      if(a.x>=a.y && a.x>=a.z)return vec3(ray.zy/a.x*.5+.5,ray.x>0.?0.:1.);
      if(a.y>=a.z)return vec3(ray.xz/a.y*.5+.5,ray.y>0.?2.:3.);
      return vec3(ray.xy/a.z*.5+.5,ray.z>0.?4.:5.);
    }
    vec2 shadowPack(float v){
      // Twelve bits are enough for both the lantern and moon depth bias.
      // The lower channel has sixteen levels, which compresses well in PNG.
      float code=floor(clamp(v,0.,1.)*4095.+.5);
      return vec2(floor(code/16.)/255.,mod(code,16.)/15.);
    }
  `;

  const moonProjection=`
    vec3 moonAnchor(vec4 room){return vec3(room.x,1.65,room.y);}
    float moonRadius(vec4 room){return length(room.zw)*.92;}
  `;

  function receiveMoving(shader,values){
    Object.assign(shader.uniforms,values);
    shader.fragmentShader=`
      #define RIVER_MOVING_LIGHTS ${movingLimit}
      uniform vec3 movingLamp[RIVER_MOVING_LIGHTS],movingLampColor;
      uniform vec3 movingShadowOrigin[RIVER_MOVING_LIGHTS],movingShadowAxis[RIVER_MOVING_LIGHTS];
      uniform vec3 movingShadowAcross[RIVER_MOVING_LIGHTS],movingShadowUp[RIVER_MOVING_LIGHTS];
      uniform float movingLampPower[RIVER_MOVING_LIGHTS];
      uniform sampler2D movingShadowDepth;

      float movingDepth(vec2 uv,int light){
        vec2 tile=clamp(uv,vec2(.5/${movingSize}.),vec2(1.-.5/${movingSize}.));
        tile.x=(tile.x+float(light))/${movingLimit}.;
        return dot(texture2D(movingShadowDepth,tile).rg,vec2(4080.,15.))*${movingRange}/4095.;
      }
      float movingShadow(vec3 surface,vec3 normal,int light){
        vec3 direction=movingShadowAxis[light],across=movingShadowAcross[light],up=movingShadowUp[light];
        vec3 delta=surface+normal*.029-movingShadowOrigin[light];
        float forward=dot(delta,direction);
        vec2 tile=vec2(dot(delta,across),dot(delta,up))
                       /max(2.*${movingSpread}*forward,.001)+.5;
        float facing=dot(delta,normal);
        vec3 plane=vec3(dot(normal,across),dot(normal,up),dot(normal,direction));
        vec2 grid=tile*${movingSize}.-.5;
        vec2 base=floor(grid),fraction=fract(grid);
        // A continuous kernel follows the receiver across texels and grows
        // in world units with distance from the light.
        float radius=mix(1.8,2.9,smoothstep(.65,3.,forward));
        float visibility=0.,total=0.;
        for(int y=-2;y<=3;y++){
          for(int x=-2;x<=3;x++){
            vec2 tap=vec2(float(x),float(y));
            vec2 offset=tap-fraction;
            float weight=max(0.,1.-dot(offset,offset)/(radius*radius));
            if(weight<=0.)continue;
            weight*=weight;
            vec2 uv=(base+tap+.5)/${movingSize}.;
            vec2 cone=(uv*2.-1.)*${movingSpread};
            // The map stores axial depth, so compare on the same receiver plane.
            float slope=dot(cone,plane.xy)+plane.z;
            float expected=abs(slope)>.045 && slope*facing>0.?facing/slope:forward;
            visibility+=weight*smoothstep(expected-.041,expected-.011,movingDepth(uv,light));
            total+=weight;
          }
        }
        return visibility/total;
      }
    `+shader.fragmentShader;
  }

  function createMoving(T,renderer,values,matrices,screenMaterial,drawPass){
    const unit=new T.Box3(new T.Vector3(-.5,-.5,-.5),new T.Vector3(.5,.5,.5));
    const bounds=new T.Box3();
    const trees=new Map();
    const slots=Array.from({length:movingLimit},()=>({lamp:null,time:-Infinity,power:0}));
    const vertical=new T.Vector3(0,1,0);
    if(movingSize*movingLimit>renderer.capabilities.maxTextureSize)throw Error('Moving shadow atlas exceeds GPU texture size');
    const target=new T.WebGLRenderTarget(movingSize*movingLimit,movingSize,{
      depthBuffer:false,minFilter:T.NearestFilter,magFilter:T.NearestFilter
    });
    target.scissorTest=true;
    const trace={
      riverShadowTree:{value:null},riverShadowTreeHeight:{value:1},riverShadowNodeCount:{value:0},
      traceOrigin:{value:null},traceAxis:{value:null},traceAcross:{value:null},traceUp:{value:null},
      traceOffset:{value:0}
    };
    const material=screenMaterial(trace,rayShader+cubeShader+`
      uniform vec3 traceOrigin,traceAxis,traceAcross,traceUp;
      uniform float traceOffset;
      void main(){
        vec2 plane=((gl_FragCoord.xy-vec2(traceOffset,0.))/${movingSize}.*2.-1.)*${movingSpread};
        vec3 ray=normalize(traceAxis+traceAcross*plane.x+traceUp*plane.y);
        float alignment=dot(ray,traceAxis);
        float depth=${movingRange};
        if(alignment>.55){
          float hit=shadowHit(traceOrigin,ray,${movingRange},false);
          if(hit<${movingRange}-.0001)depth=hit*alignment;
        }
        gl_FragColor=vec4(shadowPack(depth/${movingRange}),0.,1.);
      }
    `);
    values.movingShadowDepth.value=target.texture;
    let last=-Infinity;
    const positions=values.movingLamp.value,origins=values.movingShadowOrigin.value;
    const axes=values.movingShadowAxis.value,across=values.movingShadowAcross.value,up=values.movingShadowUp.value;
    return {update(time,nearby){
      for(const slot of slots)if(!nearby.some(({lamp})=>lamp===slot.lamp))slot.lamp=null;
      for(const {lamp,power} of nearby){
        let i=slots.findIndex(slot=>slot.lamp===lamp);
        if(i<0){
          i=slots.findIndex(slot=>!slot.lamp);
          slots[i].lamp=lamp;
          slots[i].time=-Infinity;
          axes[i].copy(lamp.movingPath.axis);
          across[i].crossVectors(axes[i],vertical).normalize();
          up[i].crossVectors(axes[i],across[i]);
        }
        slots[i].power=power;
        positions[i].copy(lamp.glow.position);
      }
      // Keep tiles assigned as the camera moves and update the oldest one first.
      let candidate=-1;
      slots.forEach(({lamp,time:built},i)=>{
        if(!lamp || (built!==-Infinity && positions[i].distanceToSquared(origins[i])<.0001))return;
        if(candidate<0 || built<slots[candidate].time)candidate=i;
      });
      const interval=1/(nearby.length>1?16:12);
      if(candidate>=0 && (slots[candidate].time===-Infinity || time<last || time-last>=interval)){
        const i=candidate,center=slots[i].lamp.movingPath.center;
        if(!trees.has(center)){
          const solids=matrices.filter(matrix=>bounds.copy(unit).applyMatrix4(matrix).distanceToPoint(center)<movingRange+1.7);
          trees.set(center,buildTree(T,solids,renderer.capabilities.maxTextureSize,center));
        }
        const {tree,height,count}=trees.get(center);
        origins[i].copy(positions[i]);
        trace.riverShadowTree.value=tree;
        trace.riverShadowTreeHeight.value=height;
        trace.riverShadowNodeCount.value=count;
        trace.traceOrigin.value=origins[i];
        trace.traceAxis.value=axes[i];
        trace.traceAcross.value=across[i];
        trace.traceUp.value=up[i];
        trace.traceOffset.value=i*movingSize;
        target.viewport.set(i*movingSize,0,movingSize,movingSize);
        target.scissor.copy(target.viewport);
        drawPass(material,target);
        slots[i].time=last=time;
      }
      slots.forEach((slot,i)=>{
        values.movingLampPower.value[i]=slot.lamp && slot.time!==-Infinity?slot.power:0;
      });
    }};
  }

  function receive(T,shader,values,count){
    Object.assign(shader.uniforms,values);
    const declarations=`
      uniform int riverShadowMode;
      uniform sampler2D riverShadowMask,riverShadowDepth;
      uniform vec4 riverShadowRooms[${count}];
      uniform vec3 riverShadowMoon;
    `;
    const functions=`
      float cachedDepth(vec2 tile,vec2 cell){
        vec2 local=(clamp(tile,vec2(0.),vec2(1.))*(${faceSize}.-1.)+.5)/${faceSize}.;
        vec2 uv=(cell+local)/vec2(4.,${count*2}.);
        return dot(texture2D(riverShadowDepth,uv).rg,vec2(4080.,15.))/4095.;
      }
      vec2 bakedRiverShadow(vec3 p,float slot){
        vec4 room=vec4(0.);
        for(int i=0;i<${count};i++)if(float(i)==slot)room=riverShadowRooms[i];
        vec2 tile=(p.xz-room.xy)/(room.zw*2.)+.5;
        vec2 edge=min(tile,1.-tile);
        float weight=smoothstep(.0,.12,min(edge.x,edge.y));
        vec2 uv=(clamp(tile,vec2(0.),vec2(1.))*(${bakeSize}.-1.)+.5)/${bakeSize}.;
        uv.y=(uv.y+slot)/${count}.;
        return mix(vec2(1.),texture2D(riverShadowMask,uv).rg,weight);
      }
      float cachedMoonShadow(vec3 p,vec3 normal,vec4 room,float slot,float facing){
        vec3 tangent=shadowTangent(riverShadowMoon),up=cross(riverShadowMoon,tangent);
        vec3 offset=p+normal*.048-moonAnchor(room);
        float depth=${moonStart}.-dot(offset,riverShadowMoon);
        float diameter=2.*moonRadius(room);
        vec2 tile=vec2(dot(offset,tangent),dot(offset,up))/diameter+.5;
        vec2 texel=vec2(3.,slot*2.);
        float blocker=cachedDepth(tile,texel)*${moonRange}.;
        float radius=mix(.10,.28,smoothstep(.20,4.5,depth-blocker));
        float visibility=0.;
        for(int i=0;i<5;i++){
          vec3 tap=radius*shadowDisk(float(i),5.,riverShadowMoon,tangent);
          vec2 uv=tile+vec2(dot(tap,tangent),dot(tap,up))/diameter;
          float expected=depth+dot(tap,normal)/max(facing,.16);
          float sampled=cachedDepth(uv,texel)*${moonRange}.;
          visibility+=smoothstep(expected-.18,expected-.062,sampled);
        }
        return visibility*.2;
      }
      float riverMoonShadow(vec3 p,vec3 normal){
        if(abs(p.y)<=.035 && normal.y>=.7){
          float light=1.;
          for(int i=0;i<${count};i++)light=min(light,bakedRiverShadow(p,float(i)).g);
          return mix(.23,1.,light);
        }
        float facing=dot(normal,riverShadowMoon);
        if(riverShadowMode==3 && facing>.07){
          float light=1.;
          for(int i=0;i<${count};i++){
            vec4 room=riverShadowRooms[i];
            vec2 edge=abs(p.xz-room.xy)-room.zw+(${margin}-.45);
            float weight=1.-smoothstep(-.08,.5,max(edge.x,edge.y));
            if(weight>0.){
              float visible=cachedMoonShadow(p,normal,room,float(i),facing);
              light=min(light,mix(1.,visible,weight));
            }
          }
          return mix(.25,1.,light);
        }
        return 1.;
      }
      float cachedLanternDepth(vec3 ray,float slot){
        vec3 face=shadowFaceUV(ray);
        vec2 cell=vec2(mod(face.z,3.),slot*2.+floor(face.z/3.));
        return cachedDepth(face.xy,cell)*${reach};
      }
      float cachedRiverShadow(vec3 p,vec3 normal,vec3 lamp,float slot){
        vec3 delta=p-lamp;
        float distance=length(delta);
        vec3 ray=delta/distance,tangent=shadowTangent(ray);
        float blocker=cachedLanternDepth(ray,slot);
        float spread=clamp((distance-blocker)/max(blocker,.25),0.,1.);
        float facing=dot(ray,normal);
        float radius=mix(.020,.065,spread)*smoothstep(.02,.22,abs(facing));
        float visibility=0.;
        for(int i=0;i<5;i++){
          vec3 tap=normalize(ray+radius*shadowDisk(float(i),5.,ray,tangent));
          float slope=dot(tap,normal);
          // Compare each tap against the receiver plane at that angle.
          float receiver=abs(slope)>.03 && slope*facing>0.?distance*facing/slope:distance;
          visibility+=smoothstep(receiver-.084,receiver-.023,cachedLanternDepth(tap,slot));
        }
        return visibility*.2;
      }
      float riverLanternShadow(vec3 p,vec3 normal,vec3 lamp,float slot){
        if(riverShadowMode==1){
          if(abs(p.y)>.035 || normal.y<.7)return 1.;
          return bakedRiverShadow(p,slot).r;
        }
        return cachedRiverShadow(p+normal*.045,normal,lamp,slot);
      }
    `;
    const directional=T.ShaderChunk.lights_fragment_begin.replace(
      'getDirectionalDirectLightIrradiance( directionalLight, geometry, directLight );',
      `getDirectionalDirectLightIrradiance( directionalLight, geometry, directLight );
        if(dot(directLight.direction,mat3(viewMatrix)*riverShadowMoon)>.995)directLight.color*=moonVisibility;`
    );
    shader.fragmentShader=declarations+diskShader+cubeShader+moonProjection+functions
      +shader.fragmentShader.replace('#include <lights_fragment_begin>',`
        float moonVisibility=riverMoonShadow(riverSurface,inverseTransformDirection(geometryNormal,viewMatrix));
        ${directional}
      `);
  }

  function attach(T,renderer,values,matrices){
    if(values.riverShadowTree.value)return;
    const {tree,height,count}=buildTree(T,matrices,renderer.capabilities.maxTextureSize);
    values.riverShadowTree.value=tree;
    values.riverShadowTreeHeight.value=height;
    values.riverShadowNodeCount.value=count;
  }

  function bakeDepth(T,renderer,values,screenMaterial,drawPass){
    const count=values.riverShadowLights.value.length;
    const width=faceSize*4,height=faceSize*count*2;
    if(width>renderer.capabilities.maxTextureSize || height>renderer.capabilities.maxTextureSize)
      throw Error('Shadow map exceeds the GPU texture limit');
    const target=new T.WebGLRenderTarget(width,height,{depthBuffer:false,minFilter:T.NearestFilter,magFilter:T.NearestFilter});
    const material=screenMaterial(values,rayShader+cubeShader+diskShader+moonProjection+`
      uniform vec3 riverShadowLights[${count}];
      uniform vec4 riverShadowRooms[${count}];
      uniform vec3 riverShadowMoon;
      void main(){
        vec2 cell=floor(gl_FragCoord.xy/${faceSize}.);
        float slot=floor(cell.y/2.);
        vec2 uv=mod(gl_FragCoord.xy,${faceSize}.)/${faceSize}.;
        // Six lantern faces and one orthographic moon tile per pavilion.
        if(cell.x>2.5){
          if(mod(cell.y,2.)>.5){gl_FragColor=vec4(shadowPack(1.),0.,1.);return;}
          vec4 room=riverShadowRooms[int(slot)];
          vec3 tangent=shadowTangent(riverShadowMoon),up=cross(riverShadowMoon,tangent);
          vec2 plane=(uv*2.-1.)*moonRadius(room);
          vec3 start=moonAnchor(room)+tangent*plane.x+up*plane.y+riverShadowMoon*${moonStart}.;
          float distance=shadowHit(start,-riverShadowMoon,${moonRange}.,false);
          gl_FragColor=vec4(shadowPack(distance/${moonRange}.),0.,1.);
          return;
        }
        float face=cell.x+3.*mod(cell.y,2.);
        vec3 lamp=riverShadowLights[int(slot)];
        vec3 direction=shadowFaceRay(face,uv);
        float distance=shadowHit(lamp,direction,${reach},false);
        gl_FragColor=vec4(shadowPack(distance/${reach}),0.,1.);
      }
    `);
    return exportShadowTexture(renderer,drawPass,material,target);
  }

  function bake(T,renderer,values,screenMaterial,drawPass){
    const count=values.riverShadowRooms.value.length;
    const target=new T.WebGLRenderTarget(bakeSize,bakeSize*count,{depthBuffer:false});
    const material=screenMaterial(values,rayShader+diskShader+traceLantern+`
      uniform vec3 riverShadowLights[${count}],riverShadowMoon;
      uniform vec4 riverShadowRooms[${count}];
      void main(){
        float slot=floor(gl_FragCoord.y/${bakeSize}.);
        vec4 room=riverShadowRooms[int(slot)];
        vec2 uv=vec2(gl_FragCoord.x,mod(gl_FragCoord.y,${bakeSize}.));
        vec2 point=room.xy+(uv/${bakeSize}.*2.-1.)*room.zw;
        vec3 p=vec3(point.x,.045,point.y),lamp=riverShadowLights[int(slot)];
        float warm=distance(p,lamp)<${reach}?traceLanternShadow(p,lamp):1.;
        vec3 tangent=shadowTangent(riverShadowMoon);
        float moon=0.;
        for(int i=0;i<7;i++){
          vec3 ray=normalize(riverShadowMoon+.061*shadowDisk(float(i),7.,riverShadowMoon,tangent));
          moon+=step(19.98,shadowHit(p,ray,20.,true));
        }
        gl_FragColor=vec4(warm,moon/7.,0.,1.);
      }
    `);
    return exportShadowTexture(renderer,drawPass,material,target);
  }

  function exportShadowTexture(renderer,drawPass,material,target){
    drawPass(material,target);
    const pixels=new Uint8Array(target.width*target.height*4);
    renderer.readRenderTargetPixels(target,0,0,target.width,target.height,pixels);
    const image=document.createElement('canvas');
    image.width=target.width;image.height=target.height;
    const ctx=image.getContext('2d'),data=ctx.createImageData(image.width,image.height);
    for(let j=0;j<image.height;j++){
      const row=image.width*4,offset=(image.height-j-1)*row;
      data.data.set(pixels.subarray(offset,offset+row),j*row);
    }
    ctx.putImageData(data,0,0);
    material.dispose();target.dispose();
    return image.toDataURL('image/png');
  }

  return {uniforms,receive,movingUniforms,receiveMoving,createMoving,attach,bakeDepth,bake};
})();
