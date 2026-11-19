const riverGI=(() => {
  const voxelSize=.32,probeSpacing=.9;

  function uniforms(T){
    return {
      riverGIEnabled:{value:false},riverProbeLight:{value:null},
      riverProbeOrigin:{value:new T.Vector3()},riverProbeSize:{value:new T.Vector3()}
    };
  }

  function receive(shader,values){
    Object.assign(shader.uniforms,values);
    shader.fragmentShader=`
      uniform bool riverGIEnabled;
      uniform sampler2D riverProbeLight;
      uniform vec3 riverProbeOrigin,riverProbeSize;

      vec4 riverProbe(vec3 p,float lobe){
        // The atlas is linear in X and Z. Interpolate between its stacked Y slices.
        float layer=floor(p.y);
        vec2 size=vec2(riverProbeSize.x*riverProbeSize.y*6.,riverProbeSize.z);
        vec2 uv=vec2(p.x+(layer+lobe*riverProbeSize.y)*riverProbeSize.x,p.z)+.5;
        vec4 low=texture2D(riverProbeLight,uv/size);
        uv.x+=step(layer+1.,riverProbeSize.y-1.)*riverProbeSize.x;
        return mix(low,texture2D(riverProbeLight,uv/size),fract(p.y));
      }

      vec4 riverBounce(vec3 surface,vec3 normal){
        vec3 p=(surface+normal*.19-riverProbeOrigin)/${probeSpacing};
        if(any(lessThan(p,vec3(-.85))) || any(greaterThan(p,riverProbeSize-vec3(.15))))return vec4(0.);
        p=clamp(p,vec3(0.),riverProbeSize-1.);
        vec3 weight=normal*normal;
        return riverProbe(p,step(normal.x,0.))*weight.x
             + riverProbe(p,2.+step(normal.y,0.))*weight.y
             + riverProbe(p,4.+step(normal.z,0.))*weight.z;
      }
    `+shader.fragmentShader.replace('#include <lights_fragment_end>',`
      if(riverGIEnabled){
        vec4 bounce=riverBounce(riverSurface,inverseTransformDirection(geometry.normal,viewMatrix));
        irradiance=irradiance*(1.-bounce.a*.34)+3.4*bounce.rgb;
      }
      #include <lights_fragment_end>
    `);
  }

  function voxelize(T,boxes,fixtures,maxTextureSize){
    const unit=new T.Box3(new T.Vector3(-.5,-.5,-.5),new T.Vector3(.5,.5,.5));
    const bounds=new T.Box3(),scale=new T.Vector3();
    const solids=[];
    for(const {material,matrix} of boxes){
      scale.setFromMatrixScale(matrix);
      if(Math.min(scale.x,scale.y,scale.z)<.075)continue;
      const extent=unit.clone().applyMatrix4(matrix).expandByScalar(.10);
      bounds.union(extent);
      solids.push({material,matrix,extent,scale:scale.clone()});
    }
    const origin=bounds.min.clone().addScalar(-.95).divideScalar(voxelSize).floor().multiplyScalar(voxelSize);
    // Straddle the top of the deck with grid boundaries, allowing rays from
    // immediately above the boards to start in empty space.
    origin.y=Math.min(origin.y,-2*voxelSize);
    const dimensions=bounds.max.clone().addScalar(.95).sub(origin).divideScalar(voxelSize).ceil();
    const {x:width,y:layers,z:depth}=dimensions;
    const stride=width*layers;
    if(stride>maxTextureSize || depth>maxTextureSize)throw Error('The voxel grid exceeds the GPU texture limit');
    const pixels=new Uint8Array(stride*depth*4),heights=new Uint8Array(width*depth);
    const lamps=fixtures.map(({x,y,z,size})=>({x,y:y+size*.31,z,size}));
    const world=new T.Vector3(),local=new T.Vector3(),normal=new T.Vector3();
    for(const {material,matrix,extent,scale} of solids){
      const first=extent.min.clone().sub(origin).divideScalar(voxelSize).floor();
      const last=extent.max.clone().sub(origin).divideScalar(voxelSize).floor();
      const inverse=matrix.clone().invert();
      const nearby=lamps.filter(lamp=>lamp.z>extent.min.z-5.8 && lamp.z<extent.max.z+5.8);
      // A single representative reflectance per solid keeps fine texture
      // detail in the beauty pass and out of the coarse bounce field.
      const diffuse=material.color.clone().multiplyScalar(material.map ? .57 : .82);
      for(let z=first.z;z<=last.z;z++)for(let y=first.y;y<=last.y;y++)for(let x=first.x;x<=last.x;x++){
        world.set(x+.5,y+.5,z+.5).multiplyScalar(voxelSize).add(origin);
        local.copy(world).applyMatrix4(inverse);
        const dx=(.5-Math.abs(local.x))*scale.x;
        const dy=(.5-Math.abs(local.y))*scale.y;
        const dz=(.5-Math.abs(local.z))*scale.z;
        if(Math.min(dx,dy,dz)<-.10)continue;
        if(dy<=dx && dy<=dz)normal.set(0,local.y>=0?1:-1,0);
        else if(dx<=dz)normal.set(Math.sign(local.x),0,0);
        else normal.set(0,0,Math.sign(local.z));
        normal.transformDirection(matrix);
        let warm=0;
        for(const lamp of nearby){
          const lx=lamp.x-world.x,ly=lamp.y-world.y,lz=lamp.z-world.z;
          const d2=lx*lx+ly*ly+lz*lz;
          if(d2>33.64)continue;
          const distance=Math.sqrt(d2);
          const facing=Math.max(0,(lx*normal.x+ly*normal.y+lz*normal.z)/Math.max(distance,.05));
          const fade=1-T.MathUtils.smoothstep(distance,2.15,5.8);
          warm+=14*lamp.size*fade*(facing*.84+.16)/(d2+.92);
        }
        const sky=.12+Math.max(0,normal.y)*.23;
        const i=(x+y*width+z*stride)*4;
        pixels[i]=Math.min(255,255*diffuse.r*(warm+sky*.43));
        pixels[i+1]=Math.min(255,255*diffuse.g*(warm*.51+sky*.65));
        pixels[i+2]=Math.min(255,255*diffuse.b*(warm*.25+sky));
        pixels[i+3]=255;
        heights[x+z*width]=Math.max(heights[x+z*width],y+1);
      }
    }
    const voxels=new T.DataTexture(pixels,stride,depth,T.RGBAFormat);
    voxels.needsUpdate=true;
    return {origin,dimensions,heights,voxels};
  }

  function probeMask(T,field,size,origin){
    const {x:width,z:depth}=size;
    const active=new Uint8Array(width*depth*4);
    const radius=Math.ceil(1.25/voxelSize);
    const grid=field.dimensions,heights=field.heights;
    for(let z=0;z<depth;z++)for(let x=0;x<width;x++){
      const vx=Math.floor(x*probeSpacing/voxelSize),vz=Math.floor(z*probeSpacing/voxelSize);
      let high=0;
      for(let j=Math.max(0,vz-radius);j<=Math.min(grid.z-1,vz+radius);j++){
        for(let i=Math.max(0,vx-radius);i<=Math.min(grid.x-1,vx+radius);i++){
          high=Math.max(high,heights[i+j*grid.x]);
        }
      }
      if(high===0)continue;
      const worldY=field.origin.y+high*voxelSize;
      const top=Math.ceil((worldY-origin.y)/probeSpacing)+1;
      active[(x+z*width)*4]=Math.min(size.y,top+1);
    }
    const mask=new T.DataTexture(active,width,depth,T.RGBAFormat);
    mask.needsUpdate=true;
    return mask;
  }

  function create(T,renderer,boxes,fixtures,values,screenMaterial,drawPass){
    const limit=renderer.capabilities.maxTextureSize;
    const field=voxelize(T,boxes,fixtures,limit);
    const origin=field.origin.clone();
    origin.y=.28;
    const size=field.dimensions.clone().multiplyScalar(voxelSize);
    size.y+=field.origin.y-origin.y;
    size.divideScalar(probeSpacing).ceil().addScalar(1);
    const width=size.x*size.y*6;
    if(width>limit || size.z>limit){
      field.voxels.dispose();
      throw Error('The probe grid exceeds the GPU texture limit');
    }
    const mask=probeMask(T,field,size,origin);
    const probes=new T.WebGLRenderTarget(width,size.z,{depthBuffer:false});
    values.riverProbeOrigin.value.copy(origin);
    values.riverProbeSize.value.copy(size);
    values.riverProbeLight.value=probes.texture;
    const trace=screenMaterial({
      voxels:{value:field.voxels},mask:{value:mask},gridOrigin:{value:field.origin},
      gridSize:{value:field.dimensions},probeOrigin:{value:origin},
      probeSize:{value:size},clock:{value:0}
    },`
      uniform sampler2D voxels,mask;
      uniform vec3 gridOrigin,gridSize,probeOrigin,probeSize;
      uniform float clock;

      vec4 voxel(vec3 cell){
        vec2 size=vec2(gridSize.x*gridSize.y,gridSize.z);
        return texture2D(voxels,(vec2(cell.x+cell.y*gridSize.x,cell.z)+.5)/size);
      }

      vec4 bounceRay(vec3 origin,vec3 ray){
        // Visit every voxel crossed by the ray, even at grazing angles.
        vec3 p=(origin-gridOrigin)/${voxelSize};
        vec3 cell=floor(p),direction=sign(ray);
        vec3 stride=1./max(abs(ray),vec3(.00001));
        vec3 crossing=(.5+.5*direction-direction*fract(p))*stride;
        float distance=0.;
        bool foundAir=false;
        for(int i=0;i<20;i++){
          if(any(lessThan(cell,vec3(0.))) || any(greaterThanEqual(cell,gridSize)))break;
          vec4 surface=voxel(cell);
          if(surface.a<.5)foundAir=true;
          else if(foundAir){
            float range=distance*${voxelSize};
            float radiance=exp(-.27*range)*(1.-smoothstep(2.6,3.8,range));
            float phase=(gridOrigin.z+cell.z*${voxelSize})*1.31;
            float flicker=1.+.032*sin(clock*3.4+phase);
            return vec4(surface.rgb*radiance*flicker,exp(-1.7*range));
          }
          if(crossing.x<crossing.y && crossing.x<crossing.z){
            distance=crossing.x;crossing.x+=stride.x;cell.x+=direction.x;
          }else if(crossing.y<crossing.z){
            distance=crossing.y;crossing.y+=stride.y;cell.y+=direction.y;
          }else{
            distance=crossing.z;crossing.z+=stride.z;cell.z+=direction.z;
          }
          if(distance>3.8/${voxelSize})break;
        }
        return vec4(0.);
      }

      void main(){
        vec2 pixel=floor(gl_FragCoord.xy);
        float row=floor(pixel.x/probeSize.x);
        float face=floor(row/probeSize.y);
        vec3 probe=vec3(mod(pixel.x,probeSize.x),mod(row,probeSize.y),pixel.y);
        float activeY=texture2D(mask,(probe.xz+.5)/probeSize.xz).r*255.;
        if(probe.y+.5>activeY){gl_FragColor=vec4(0.);return;}
        vec3 normal=face<2.?vec3(1.,0.,0.):face<4.?vec3(0.,1.,0.):vec3(0.,0.,1.);
        normal*=1.-2.*mod(face,2.);
        vec3 right=normalize(cross(normal,face>=2. && face<4.?vec3(0.,0.,1.):vec3(0.,1.,0.)));
        vec3 up=cross(normal,right);
        vec3 origin=probeOrigin+probe*${probeSpacing};
        float turn=fract(dot(probe,vec3(.75487,.56984,.43858)))*6.2831853;
        vec4 light=vec4(0.);
        for(int i=0;i<8;i++){
          float u=(float(i)+.5)/8.;
          float angle=turn+float(i)*2.3999632;
          vec3 ray=(right*cos(angle)+up*sin(angle))*sqrt(u)+normal*sqrt(1.-u);
          light+=bounceRay(origin+ray*.09,ray);
        }
        gl_FragColor=light/8.;
      }
    `);
    let last=-Infinity;
    return {update(time){
      if(time>=last && time-last<.42)return;
      last=time;
      trace.uniforms.clock.value=time;
      drawPass(trace,probes);
    }};
  }

  return {uniforms,receive,create};
})();
