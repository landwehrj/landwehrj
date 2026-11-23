// Scenery shared by the riverbank geometry, lanterns, and water shader.
const riverShore = (() => {
  const firstZ=-272,lastZ=114,halfWidth=64;
  const bankOffsets=[-2.7,-.86,0,.30,.52,.79,1.1,1.45,1.8,2.2,2.65,3.17,3.8,4.6,5.55,6.8,8.4,11,16.6,25.2,39];
  const offsets=[...bankOffsets,46,54,64,75,89,105,124,150,183,224,275,338,416,510,630];
  const rows=Math.ceil((lastZ-firstZ)/.68),rowDepth=(lastZ-firstZ)/rows;
  const outerRows=66,outerSpacing=8;
  const terrainRows=[
    ...Array.from({length:outerRows},(_,i)=>firstZ-(outerRows-i)*outerSpacing),
    ...Array.from({length:rows+1},(_,i)=>firstZ+i*rowDepth),
    ...Array.from({length:outerRows},(_,i)=>lastZ+(i+1)*outerSpacing)
  ];
  const lampRange=5.4,lampCells=Math.ceil((lastZ-firstZ)/3.1),lampCellDepth=(lastZ-firstZ)/lampCells;
  const {rooms,bridges,bridgePoint,end,landingWidth,landingDepth}=riverWalk;
  const decks=[...rooms,{x:end[0],z:end[1],width:landingWidth,depth:landingDepth}];
  const deckOutlines=decks.map(({x,z,width,depth})=>[
    [x-width/2,z-depth/2],[x-width/2,z+depth/2],[x+width/2,z+depth/2],[x+width/2,z-depth/2]
  ]);
  for(const {start,finish,width} of bridges){
    deckOutlines.push([[0,-1],[1,-1],[1,1],[0,1]].map(([t,side])=>bridgePoint(start,finish,t,side*width/2)));
  }
  const deckEdges=deckOutlines.map(points=>points.map(([x,z],index)=>{
    const [nextX,nextZ]=points[(index+1)%points.length];
    const dx=nextX-x,dz=nextZ-z,length=Math.hypot(dx,dz);
    return {x,z,nx:-dz/length,nz:dx/length};
  }));
  function clearDecks(x,z,radius){
    return deckEdges.every(edges=>edges.some(edge=>
      (x-edge.x)*edge.nx+(z-edge.z)*edge.nz>radius));
  }
  function clearLanternFlight(x,z,radius,drift,sway,bottom,roofs){
    return deckEdges.every((edges,i)=>{
      const roof=roofs[i];
      if(bottom>(roof?.top ?? 1))return true;
      return edges.some(({x:edgeX,z:edgeZ,nx,nz})=>
        (x-edgeX)*nx+(z-edgeZ)*nz >
        radius+(roof?.overhang ?? 0)+Math.abs(drift.x*nx+drift.z*nz)+Math.abs(sway.x*nx+sway.z*nz));
    });
  }
  const center=z=>6.7*Math.sin((z+10)*.046)+.013*z;
  function bankX(z,side){
    const width=18.5+3.2*Math.sin(z*.057+.2);
    const coves=.88*Math.sin(z*.28+side*1.8)+.39*Math.sin(z*.83-side*.7);
    const bank=center(z)+side*(width+coves);
    let setback=0;
    for(const deck of decks){
      const endDistance=Math.abs(z-deck.z)-deck.depth/2;
      const t=Math.min(1,Math.max(0,(endDistance-.6)/4.4));
      const blend=1-t*t*(3-2*t);
      const clearance=(deck.x-bank)*side+deck.width/2+2.1;
      setback=Math.max(setback,clearance*blend);
    }
    return bank+side*setback;
  }
  function channelBounds(z,reach){
    const start=z-reach,end=z+reach;
    let west=Math.max(bankX(start,-1),bankX(end,-1));
    let east=Math.min(bankX(start,1),bankX(end,1));
    // Include each terrain row the lantern can reach, even on a bend.
    for(let row=Math.ceil((start-firstZ)/rowDepth);firstZ+row*rowDepth<end;row++){
      const at=firstZ+row*rowDepth;
      west=Math.max(west,bankX(at,-1));
      east=Math.min(east,bankX(at,1));
    }
    return [west,east];
  }
  const parallaxShader=`
    vec3 riverReliefRay(vec3 toEye,vec3 normal,float range){
      float distanceToEye=length(toEye);
      vec3 eye=toEye/max(.001,distanceToEye);
      float facing=dot(eye,normal);
      // Fade out where the tiling is too small to see or the ray skims the face.
      float fade=(1.-smoothstep(range*.38,range,distanceToEye))*smoothstep(.09,.32,facing);
      return (normal*facing-eye)*(fade/max(.46,facing));
    }
    vec2 riverReliefScreenShift(vec3 toEye,vec3 ray){
      vec3 dx=dFdx(-toEye),dy=dFdy(-toEye);
      vec3 face=cross(dx,dy);
      return vec2(dot(ray,cross(dy,face)),dot(ray,cross(face,dx)))/max(dot(face,face),1e-20);
    }
    vec2 riverReliefUVShift(vec2 uv,vec2 screenShift){
      return dFdx(uv)*screenShift.x+dFdy(uv)*screenShift.y;
    }
    vec4 riverOffsetTexel(sampler2D source,vec2 uv,vec2 shift,float mipBias){
      #if __VERSION__ >= 300
        float footprint=exp2(mipBias);
        return texture2DGradEXT(source,uv+shift,dFdx(uv)*footprint,dFdy(uv)*footprint);
      #else
        return texture2D(source,uv+shift,mipBias);
      #endif
    }
    vec3 riverTriplanar(sampler2D source,vec3 uv,vec3 weight,float mipBias){
      return texture2D(source,uv.zy,mipBias).rgb*weight.x
            +texture2D(source,uv.xz,mipBias).rgb*weight.y
            +texture2D(source,uv.xy,mipBias).rgb*weight.z;
    }
    vec3 riverReliefSample(sampler2D source,vec3 uv,vec3 shift,vec3 weight,vec3 original,float mipBias){
      #if __VERSION__ >= 300
        float footprint=exp2(mipBias);
        vec3 dx=dFdx(uv)*footprint,dy=dFdy(uv)*footprint;
        if(dot(shift,shift)<1e-10)return original;
        uv+=shift;
        return texture2DGradEXT(source,uv.zy,dx.zy,dy.zy).rgb*weight.x
              +texture2DGradEXT(source,uv.xz,dx.xz,dy.xz).rgb*weight.y
              +texture2DGradEXT(source,uv.xy,dx.xy,dy.xy).rgb*weight.z;
      #else
        return riverTriplanar(source,uv+shift,weight,mipBias);
      #endif
    }
    vec3 riverReliefSample(sampler2D source,vec2 uv,vec2 shift,vec3 original,float mipBias){
      #if __VERSION__ >= 300
        float footprint=exp2(mipBias);
        vec2 dx=dFdx(uv)*footprint,dy=dFdy(uv)*footprint;
        if(dot(shift,shift)<1e-10)return original;
        return texture2DGradEXT(source,uv+shift,dx,dy).rgb;
      #else
        return texture2D(source,uv+shift,mipBias).rgb;
      #endif
    }
  `;
  const waterShader=`
    uniform sampler2D riverBankProfile;
    float shoreDistance(vec2 p){
      float upstream=p.y-(${firstZ.toFixed(1)}),downstream=p.y-(${lastZ.toFixed(1)});
      float row=${outerRows.toFixed(1)}+(upstream<0.?upstream/${outerSpacing.toFixed(1)}:
        downstream>0.?${rows.toFixed(1)}+downstream/${outerSpacing.toFixed(1)}:upstream/${rowDepth.toFixed(8)});
      vec4 profile=texture2D(riverBankProfile,vec2((row+.5)/${terrainRows.length.toFixed(1)},.5));
      vec2 banks=(profile.rb*256.+profile.ga)/257.*${(halfWidth*2).toFixed(1)}-${halfWidth.toFixed(1)};
      return min(p.x-banks.x,banks.y-p.x);
    }
  `;
  const wetBandShader=`
    float riverWetBand(vec3 surface,float waterY){
      vec2 p=surface.xz;
      float edge=.215+.027*sin(dot(p,vec2(4.23,2.83)))+.018*cos(dot(p,vec2(-7.25,4.51)));
      float height=surface.y-waterY;
      return 1.-smoothstep(.013,edge,height);
    }
  `;
  const mistShader=`
    float lowRiverMist(vec3 eye,vec3 surface,float waterY,float time){
      float ceiling=waterY+1.32;
      if(min(eye.y,surface.y)>ceiling || max(eye.y,surface.y)<waterY)return 0.;
      vec3 ray=surface-eye;
      float dist=length(ray);
      if(dist<=2.)return 0.;
      float entry=0.,exit=1.;
      if(abs(ray.y)>.0001){
        vec2 crossing=(vec2(waterY,ceiling)-eye.y)/ray.y;
        entry=max(0.,min(crossing.x,crossing.y));
        exit=min(1.,max(crossing.x,crossing.y));
      }
      float density=0.;
      for(int i=0;i<4;i++){
        vec3 p=eye+ray*mix(entry,exit,(float(i)+.5)/4.);
        vec2 wind=p.xz+time*vec2(.17,-.083);
        float bands=.57+.23*sin(dot(wind,vec2(.21,.15)))
          +.15*sin(dot(wind,vec2(-.14,.47))+p.y*4.3)
          +.05*sin(dot(wind,vec2(.62,-.44)));
        float height=p.y-waterY;
        float layer=exp(-2.72*height)*(1.-smoothstep(.68,1.32,height));
        float valley=1.-.82*smoothstep(18.,40.,abs(p.x));
        density+=mix(.24,1.,smoothstep(.19,.88,bands))*layer*valley;
      }
      float opticalDepth=.31*dist*max(0.,exit-entry)*density/4.;
      return (1.-exp(-opticalDepth))*.68*smoothstep(2.,7.8,dist);
    }
  `;

  const woodlandMistShader=`
    float woodlandMist(vec3 eye,vec3 surface,float waterY,float time){
      if(shoreDistance(surface.xz)>-4.2)return 0.;
      vec3 ray=eye-surface;
      float distanceToEye=length(ray);
      float reach=min(distanceToEye,23.);
      float density=0.;
      for(int cell=0;cell<4;cell++){
        vec3 p=surface+ray*(reach*(float(cell)+.5)/(4.*max(distanceToEye,.01)));
        float inland=-shoreDistance(p.xz);
        float height=p.y-(waterY+.86+.103*inland);
        float fogBank=smoothstep(4.2,9.4,inland)*(1.-smoothstep(29.,47.,inland));
        float layer=smoothstep(-.48,.18,height)*(1.-smoothstep(.52,2.12,height));
        float drift=.66+.26*sin(dot(p.xz,vec2(.24,.13))+time*.11)
                    +.08*cos(dot(p.xz,vec2(-.19,.34))-time*.16);
        density+=fogBank*layer*drift;
      }
      return .26*(1.-exp(-.064*reach*density))*smoothstep(3.,11.,distanceToEye);
    }
  `;

  function patchNoise(x,y){
    const ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy;
    const hash=(a,b)=>{
      let seed=Math.imul(a,374761393)+Math.imul(b,668265263);
      seed=Math.imul(seed^(seed>>>13),1274126177);
      return ((seed^(seed>>>16))>>>0)/4294967296;
    };
    const u=fx*fx*(3-2*fx),v=fy*fy*(3-2*fy);
    const near=hash(ix,iy)*(1-u)+hash(ix+1,iy)*u;
    const far=hash(ix,iy+1)*(1-u)+hash(ix+1,iy+1)*u;
    return near*(1-v)+far*v;
  }

  function grassPatch(T,z,offset,side){
    const grove=patchNoise(z*.117+offset*.095,offset*.195+side*61);
    const wisps=patchNoise(z*.41-offset*.11,offset*.53+side*29);
    return T.MathUtils.smoothstep(.86*grove+.14*wisps,.41,.67);
  }

  function bankLighting(T,lanterns,drift,waterLevel){
    const heightBase=waterLevel-1;
    const cells=Array.from({length:lampCells*2},(_,row)=>{
      const side=row<lampCells?-1:1,z=firstZ+(row%lampCells+.5)*lampCellDepth;
      const reach=lampRange+lampCellDepth/2+drift.z;
      return lanterns.flatMap((lamp,i)=>Math.abs(lamp.z-z)<=reach && (lamp.x-center(lamp.z))*side>0?[i]:[]);
    });
    const slots=Math.max(1,...cells.map(cell=>cell.length));
    const indices=new Uint8Array(slots*cells.length*4);
    cells.forEach((cell,row)=>cell.forEach((i,slot)=>{
      const index=(row*slots+slot)*4,id=i+1;
      indices[index]=id&255;
      indices[index+1]=id>>8;
    }));
    const lookup=new T.DataTexture(indices,slots,cells.length,T.RGBAFormat);
    lookup.needsUpdate=true;
    const width=Math.max(1,lanterns.length)*2,records=new Uint8Array(width*4);
    const sources=new T.DataTexture(records,width,1,T.RGBAFormat);
    function set(index,x,y,z,power){
      const at=index*8;
      const px=Math.round(T.MathUtils.clamp((x+halfWidth)/(halfWidth*2),0,1)*65535);
      const py=Math.round(T.MathUtils.clamp((y-heightBase)/12,0,1)*65535);
      const pz=Math.round(T.MathUtils.clamp((z-firstZ)/(lastZ-firstZ),0,1)*65535);
      records[at]=px>>8;records[at+1]=py>>8;records[at+2]=pz>>8;
      records[at+3]=Math.round(T.MathUtils.clamp(power,0,1)*255);
      records[at+4]=px&255;records[at+5]=py&255;records[at+6]=pz&255;
    }
    lanterns.forEach(({x,y,z,size},i)=>set(i,x,y+.32*size,z,size));
    sources.needsUpdate=true;
    return {lookup,sources,slots,width,heightBase,set};
  }

  function create(T,waterLevel,random){
    // The water and terrain use the same bank samples, including the coves around decks.
    const bankSamples=new Uint8Array(terrainRows.length*4);
    const terrain=[[],[]];
    for(let row=0;row<terrainRows.length;row++){
      const z=terrainRows[row];
      for(const side of [-1,1]){
        const bank=bankX(z,side);
        terrain[side>0?1:0].push({bank,heights:offsets.map(offset=>height(z,side,offset))});
        const packed=Math.round((bank+halfWidth)*65535/(2*halfWidth));
        const index=row*4+side+1;
        bankSamples[index]=packed>>8;
        bankSamples[index+1]=packed&255;
      }
    }
    const profile=new T.DataTexture(bankSamples,terrainRows.length,1,T.RGBAFormat);
    profile.minFilter=profile.magFilter=T.LinearFilter;
    profile.needsUpdate=true;
    const lanterns=[];
    const lanternDrift=new T.Vector3(.32,.22,.27);

    function height(z,side,offset){
      const slope=.35*Math.min(offset,3.5)+.103*Math.max(0,offset-3.5);
      const relief=.33*Math.sin(z*.21+side+offset*.58)
        +.20*Math.cos(z*.70-offset*.80+side)+.12*Math.sin(z*1.14+offset*1.57);
      const shelf=T.MathUtils.smoothstep(offset,.18,1.7)*(1-T.MathUtils.smoothstep(offset,2.6,6.5));
      const roots=.19*Math.sin(z*1.58-offset*2.06)+.105*Math.cos(z*2.13+offset*1.49+side);
      const nuggets=.10*Math.sin(z*2.24+offset*2.61+side)*Math.cos(z*.79-offset*1.51)
        +.057*Math.sin(z*3.53-offset*3.13+side);
      const bank=waterLevel+slope+Math.min(1,Math.max(0,offset)*.42)*relief
        +shelf*(.14+.20*Math.sin(z*.58+side)+roots+nuggets);
      if(offset<=39)return bank;
      const foothills=5.7+4.1*Math.sin(z*.031+side+offset*.046)
        +2.4*Math.sin(z*.073-offset*.063+side);
      const peaks=8.+7.3*Math.sin(z*.019+side*1.8-offset*.019)
        +4.7*Math.cos(z*.049+offset*.036);
      const upland=foothills+peaks*T.MathUtils.smoothstep(offset,49,155);
      return T.MathUtils.lerp(bank,waterLevel+upland,T.MathUtils.smoothstep(offset,39,83));
    }
    function ground(z,side,offset,bankAtZ=bankX(z,side)){
      // Match the triangles of the visible terrain so roots and stones sit on it.
      const row=T.MathUtils.clamp((z-firstZ)/rowDepth,0,rows);
      const lower=Math.min(rows-1,Math.floor(row)),t=row-lower;
      const bankRows=terrain[side>0?1:0];
      const near=bankRows[outerRows+lower],far=bankRows[outerRows+lower+1];
      const bank=T.MathUtils.lerp(near.bank,far.bank,t);
      const across=T.MathUtils.clamp(offset+side*(bankAtZ-bank),offsets[0],offsets[offsets.length-1]);
      const col=Math.max(0,offsets.findIndex(value=>value>=across)-1);
      const from=offsets[col],to=offsets[col+1],u=(across-from)/(to-from);
      const b=near.heights[col+1],c=far.heights[col];
      if(t+u<=1)return (1-t-u)*near.heights[col]+u*b+t*c;
      return (1-t)*b+(1-u)*c+(t+u-1)*far.heights[col+1];
    }

    for(const side of [-1,1]){
      for(let z=firstZ+4;z<lastZ-4;z+=4.8+random()*7.3){
        const count=2+Math.floor(random()*3);
        for(let i=0;i<count;i++){
          const pos=z+(random()-.5)*3.6,offset=.68+random()*2.35;
          const x=bankX(pos,side)+side*offset;
          const lift=.64+random()*.80;
          const size=.55+random()*.32;
          const shellReach=size*.34+.04;
          const reachX=shellReach+lanternDrift.x,reachZ=shellReach+lanternDrift.z;
          if(!clearDecks(x,pos,Math.hypot(reachX,reachZ)))continue;
          let y=ground(pos,side,offset)+lift;
          for(let zStep=-2;zStep<=2;zStep++){
            const sampleZ=pos+zStep*reachZ/2;
            const sampleOffset=(x-bankX(sampleZ,side))*side;
            for(const dx of [-reachX,0,reachX]){
              y=Math.max(y,ground(sampleZ,side,sampleOffset+dx)+lanternDrift.y+.55);
            }
          }
          const bounds=new T.Box3(
            new T.Vector3(x-reachX,y-lanternDrift.y-.43,pos-reachZ),
            new T.Vector3(x+reachX,y+lanternDrift.y+.70*size+.04,pos+reachZ)
          );
          if(lanterns.some(lamp=>lamp.bounds.intersectsBox(bounds)))continue;
          lanterns.push({x,y,z:pos,size,bounds});
        }
      }
    }
    return {ground,terrain,lanterns,lanternDrift,profile,lighting:bankLighting(T,lanterns,lanternDrift,waterLevel)};
  }

  function plantBuilder(T){
    const positions=[],tints=[];
    return {
      face(a,b,c,base,tip=base,end=base){
        positions.push(...a,...b,...c);
        for(const shade of [base,tip,end]){
          if(Array.isArray(shade))tints.push(...shade);
          else tints.push(shade*.92,shade,shade*.93);
        }
      },
      geometry(){
        const mesh=new T.BufferGeometry();
        mesh.setAttribute('position',new T.Float32BufferAttribute(positions,3));
        mesh.setAttribute('color',new T.Float32BufferAttribute(tints,3));
        mesh.computeVertexNormals();
        return mesh;
      }
    };
  }

  function grassTexture(painted,random){
    return painted(1024,(ctx,resolution)=>{
      const tile=resolution/2;
      for(let patch=0;patch<4;patch++){
        ctx.save();
        ctx.translate((patch%2)*tile,Math.floor(patch/2)*tile);
        ctx.scale(tile,tile);
        for(let i=0;i<45;i++){
          const rootX=.5+(random()-.5)*.30,rootY=.967+random()*.020;
          const bend=(random()-.5)*.79;
          const height=.23+random()*.68;
          const tipX=Math.max(.035,Math.min(.965,rootX+bend)),tipY=rootY-height;
          const firstX=rootX+bend*.08,secondX=rootX+bend*.44;
          const firstY=rootY-height*.34,secondY=rootY-height*.77;
          const width=.003+random()*.009;
          const hue=82+random()*30;
          const light=(i<18?33:45)+random()*17;
          const grain=ctx.createLinearGradient(rootX,rootY,tipX,tipY);
          grain.addColorStop(0,`hsl(${hue-13},27%,19%)`);
          grain.addColorStop(.36,`hsl(${hue},35%,${light}%)`);
          grain.addColorStop(.79,`hsl(${hue+4},40%,${light+8}%)`);
          grain.addColorStop(1,`hsl(${hue-8},34%,${light+13}%)`);
          ctx.fillStyle=grain;
          ctx.beginPath();
          ctx.moveTo(rootX-width*.52,rootY);
          ctx.bezierCurveTo(firstX-width,firstY,secondX-width*.62,secondY,tipX,tipY);
          ctx.bezierCurveTo(secondX+width*.32,secondY,firstX+width*.7,firstY,rootX+width*.46,rootY);
          ctx.closePath();
          ctx.fill();
          if(i>=18){
            ctx.strokeStyle=`hsla(${hue-9},38%,70%,.24)`;
            ctx.lineWidth=width*.16;
            ctx.beginPath();
            ctx.moveTo(rootX,rootY-.02);
            ctx.bezierCurveTo(firstX,firstY,secondX-width*.16,secondY,tipX,tipY);
            ctx.stroke();
          }
        }
        ctx.restore();
      }
    });
  }

  function grassCards(T,tile){
    const positions=[],uvs=[],indices=[];
    const u0=tile%2*.5,v0=(1-Math.floor(tile/2))*.5;
    for(let plane=0;plane<3;plane++){
      const angle=plane*Math.PI/3;
      const x=Math.cos(angle)*.56,z=Math.sin(angle)*.56;
      const start=positions.length/3;
      for(const y of [0,.53,1]){
        positions.push(-x,y,-z,x,y,z);
        uvs.push(u0,v0+y*.5,u0+.5,v0+y*.5);
      }
      for(let segment=0;segment<2;segment++){
        const a=start+segment*2;
        indices.push(a,a+2,a+1,a+1,a+2,a+3);
      }
    }
    const geometry=new T.BufferGeometry();
    geometry.setIndex(indices);
    geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));
    geometry.setAttribute('uv',new T.Float32BufferAttribute(uvs,2));
    geometry.computeVertexNormals();
    return geometry;
  }

  function reedClump(T,random,blades,upright){
    const plant=plantBuilder(T);
    const rings=[0,.28,.55,.79,1];
    for(let i=0;i<blades;i++){
      const angle=i*2.4+random()*.7,dx=Math.cos(angle),dz=Math.sin(angle);
      const root=.03+random()*.18,height=.50+random()*.50;
      const reach=(upright?.11:.25)+random()*.30,width=.023+random()*.025;
      const shade=.74+random()*.26;
      const sections=rings.map((t,i)=>{
        const along=root+reach*t*t,y=height*(t-(upright?.06:.19)*t*t*t);
        const halfWidth=width*[.43,1,.86,.53,0][i];
        const center=[dx*(along+halfWidth*.22),y,dz*(along+halfWidth*.22)];
        const left=[dx*along-dz*halfWidth,y,dz*along+dx*halfWidth];
        const right=[dx*along+dz*halfWidth,y,dz*along-dx*halfWidth];
        return {center,left,right,shade:shade*(.40+.53*t)};
      });
      for(let i=1;i<sections.length;i++){
        const a=sections[i-1],b=sections[i];
        plant.face(a.center,a.left,b.center,a.shade,a.shade*.78,b.shade);
        plant.face(a.center,b.center,a.right,a.shade,b.shade,a.shade*.86);
        if(i===sections.length-1)continue;
        plant.face(a.left,b.left,b.center,a.shade*.78,b.shade*.78,b.shade);
        plant.face(a.right,b.center,b.right,a.shade*.86,b.shade,b.shade*.86);
      }
    }
    return plant.geometry();
  }

  function meadowFlower(T,color,petalColor){
    const plant=plantBuilder(T);
    const stem=color('#57764b').toArray(),leaf=color('#728c53').toArray();
    const petal=color(petalColor).toArray(),heart=color('#d5a346').toArray();
    const height=.79;
    for(const [x,z] of [[.013,0],[0,.013]]){
      const a=[-x,0,-z],b=[x,0,z],c=[.10-x,height,-z],d=[.10+x,height,z];
      plant.face(a,b,c,stem);plant.face(b,d,c,stem);
    }
    for(const sign of [-1,1]){
      const y=sign>0?.34:.48,reach=sign*.19;
      const root=[.1*y/height,y,0],tip=[root[0]+reach,y+.13,reach*.3];
      const left=[root[0]+reach*.50,y+.072,-.045],right=[root[0]+reach*.50,y+.062,.046];
      plant.face(root,left,tip,stem,leaf,leaf);plant.face(root,tip,right,stem,leaf,leaf);
    }
    for(let i=0;i<5;i++){
      const angle=i*Math.PI*2/5;
      const point=(radius,phase,y)=>[.10+Math.cos(angle+phase)*radius,y,Math.sin(angle+phase)*radius];
      const root=point(.016,0,height),tip=point(.174,0,height+.082);
      const left=point(.143,-.47,height+.044),right=point(.143,.47,height+.066);
      plant.face(root,left,tip,petal);plant.face(root,tip,right,petal);
      plant.face(point(0,0,height+.026),point(.033,-Math.PI/5,height+.033),
        point(.033,Math.PI/5,height+.033),heart);
    }
    return plant.geometry();
  }

  function groundLeaves(T){
    const plant=plantBuilder(T);
    for(let i=0;i<7;i++){
      const angle=i*2.4+.21*Math.sin(i*1.9),dx=Math.cos(angle),dz=Math.sin(angle);
      const length=.17+.14*Math.sin(i*1.67)**2;
      const arch=.083+.076*Math.sin(i*1.19)**2;
      const rings=[0,.27,.57,.84,1].map(t=>{
        const reach=.024+length*t,width=.002+.048*Math.sin(t*Math.PI)**.72;
        const rise=.014+arch*Math.sin(Math.PI*t*.78);
        const curve=.041*t*t*Math.cos(i);
        const point=(lateral,y)=>[dx*reach-dz*(curve+lateral),y,dz*reach+dx*(curve+lateral)];
        const shade=.40+.37*t+.12*Math.sin(i*2.17)**2;
        return {mid:point(0,rise),left:point(-width,rise-width*.35),right:point(width,rise-width*.18),shade};
      });
      for(let row=1;row<rings.length;row++){
        const a=rings[row-1],b=rings[row];
        plant.face(a.left,b.left,a.mid,a.shade*.84,b.shade*.84,a.shade);
        plant.face(a.mid,b.left,b.mid,a.shade,b.shade*.84,b.shade);
        plant.face(a.mid,b.mid,a.right,a.shade,b.shade,a.shade*.93);
        plant.face(a.right,b.mid,b.right,a.shade*.93,b.shade,b.shade*.93);
      }
    }
    return plant.geometry();
  }

  function shoreRock(T,variant,detail=variant===1?3:2,fractured=false){
    const rock=new T.IcosahedronGeometry(.5,detail);
    const vertices=rock.attributes.position;
    const tonedNormals=new Map(),vertexKeys=[];
    for(let i=0;i<vertices.count;i++){
      const x=vertices.getX(i),y=vertices.getY(i),z=vertices.getZ(i);
      const seam=y+.24*x-(variant===2?.23:.10)*z;
      const weathering=.105*Math.sin(x*13.8+z*8.9+variant)+.061*Math.cos(z*15.1-y*9.7-variant);
      const shelf=variant===1?.026:.054;
      const band=shelf*Math.tanh(19*(seam+.15))-shelf*.82*Math.tanh(22*(seam-.10));
      const fracture=(variant===1?.048:.066)*Math.tanh((x-.29*z+.23*y-.03)*14)*Math.sin(z*6.2+variant);
      const width=1+weathering+band*2.4+fracture;
      const crown=variant===1?.43:.27;
      vertexKeys.push([x,y,z].map(value=>Math.round(value*10000)).join(','));
      const cleft=.054*Math.exp(-35*Math.abs(x+.3*z-.08*variant))*T.MathUtils.smoothstep(y,.05,.38);
      const side=x*width+y*.13;
      const top=Math.min(crown+.076*Math.sin(z*5+x*3),y*.94+band)-cleft;
      const front=z*width-x*.14;
      vertices.setXYZ(i,fractured?Math.min(side,.37-.21*y+.11*z):side,
        fractured?Math.min(top,.26+.27*x-.13*z)-.10*Math.exp(-32*Math.abs(z-.49*x+.037)):top,
        fractured?Math.max(front,-.40+.32*x+.21*y):front);
    }
    rock.computeVertexNormals();
    const normals=rock.attributes.normal;
    const face=new T.Vector3(),smooth=new T.Vector3();
    for(let i=0;i<normals.count;i++){
      const key=vertexKeys[i];
      if(!tonedNormals.has(key))tonedNormals.set(key,new T.Vector3());
      tonedNormals.get(key).add(face.fromBufferAttribute(normals,i));
    }
    for(let i=0;i<normals.count;i++){
      smooth.copy(tonedNormals.get(vertexKeys[i])).normalize();
      face.fromBufferAttribute(normals,i);
      const softness=T.MathUtils.smoothstep(face.dot(smooth),.55,.96);
      face.lerp(smooth,(fractured?.15:variant===1?.45:.26)+softness*(fractured?.58:.46)).normalize();
      normals.setXYZ(i,face.x,face.y,face.z);
    }
    return rock;
  }

  function landscape(T,{scene,reflected,submerged,color,painted,addRiverMist,shore,waterLevel,random,slate,paintedStone,forestFloor,moonDirection,nightTime,stock,compact}){
    const litHeight=waterLevel.toFixed(2);
    const lightMapOffset=(halfWidth*2).toFixed(1);
    const lightMapLength=(lastZ-firstZ).toFixed(1);
    const contactCanvas=document.createElement('canvas');
    contactCanvas.width=512;contactCanvas.height=2048;
    const contact=contactCanvas.getContext('2d');
    contact.scale(contactCanvas.width/(halfWidth*2),contactCanvas.height/(lastZ-firstZ));
    contact.translate(halfWidth,-firstZ);
    const groundContacts=new T.CanvasTexture(contactCanvas);
    function darkenGround(x,z,radius,strength=.76,aspect=1,spin=0){
      contact.save();
      contact.translate(x,z);
      contact.rotate(-spin);
      contact.scale(1,aspect);
      const falloff=contact.createRadialGradient(0,0,0,0,0,radius);
      falloff.addColorStop(0,`rgba(0,0,0,${strength})`);
      falloff.addColorStop(.46,`rgba(0,0,0,${strength*.72})`);
      falloff.addColorStop(1,'rgba(0,0,0,0)');
      contact.fillStyle=falloff;
      contact.fillRect(-radius,-radius,radius*2,radius*2);
      contact.restore();
    }
    const texture=slate || painted(128,(ctx,size)=>{
      const image=ctx.createImageData(size,size);
      for(let i=0;i<image.data.length;i+=4){
        const shade=84+random()*100;
        image.data.set([shade,shade,shade,255],i);
      }
      ctx.putImageData(image,0,0);
    });
    texture.wrapS=texture.wrapT=T.RepeatWrapping;
    for(const paint of [paintedStone,forestFloor].filter(Boolean)){
      paint.wrapS=paint.wrapT=T.MirroredRepeatWrapping;
      paint.anisotropy=4;
    }
    const detailEye={value:new T.Vector3()};
    function surface(tint,{vertexColors=false,twoSided=false,ground=false,rock=false,rim=false,cards=false,rootedTree=false,understory=false,wind='',finish,lodRange=0,coverRange=0}={}){
      const material=new T.MeshStandardMaterial({
        color:color(tint),roughness:twoSided?.72:rock?.78:.86,vertexColors,side:twoSided?T.DoubleSide:T.FrontSide
      });
      const shaderKey=ground?'river-ground':rock?'river-rock':rim?'river-needles':
        rootedTree?'river-pine-bark':'river-understory';
      material.customProgramCacheKey=()=>shaderKey+(wind?'-'+wind:'')+(finish?'-mapped':'')
        +(lodRange?'-lod'+lodRange:'')+(coverRange?'-cover'+coverRange:'')+(understory?'-understory':'');
      if(finish){Object.assign(material,finish);material.roughness=1}
      material.onBeforeCompile=shader=>{
        addRiverMist(shader);
        shader.uniforms.riverBankProfile={value:shore.profile};
        shader.fragmentShader=waterShader+woodlandMistShader+shader.fragmentShader.replace(
          '#include <fog_fragment>',`
          #include <fog_fragment>
          float forestHaze=woodlandMist(cameraPosition,riverSurface,${litHeight},riverMistTime);
          gl_FragColor.rgb=mix(gl_FragColor.rgb,vec3(.068,.103,.143),forestHaze);
        `);
        const exposure= rim?'varying float canopyExposure;\n':'';
        if(rim)shader.vertexShader='attribute float shoreExposure;\n'+exposure+shader.vertexShader.replace(
          '#include <begin_vertex>','#include <begin_vertex>\n canopyExposure=shoreExposure;');
        if(lodRange){
          const varyings='varying float shoreBlend;\nvarying float shoreCoarse;\n';
          shader.uniforms.detailEye=detailEye;
          shader.vertexShader='attribute float shoreLOD;\nuniform vec3 detailEye;\n'+varyings+shader.vertexShader;
          shader.fragmentShader=varyings+shader.fragmentShader.replace('#include <alphatest_fragment>',`
            #include <alphatest_fragment>
            float pattern=fract(52.9829189*fract(dot(gl_FragCoord.xy,vec2(.06711056,.00583715))));
            if((shoreCoarse>.5)!=(pattern<shoreBlend))discard;
          `);
        }
        if(coverRange){
          shader.uniforms.detailEye=detailEye;
          shader.vertexShader='uniform vec3 detailEye;\n'+shader.vertexShader;
        }
        if(wind){
          shader.uniforms.bankWindTime=nightTime;
          shader.vertexShader='uniform float bankWindTime;\n'+shader.vertexShader.replace('#include <begin_vertex>',`
            #include <begin_vertex>
            mat4 plantFrame=modelMatrix;
            #ifdef USE_INSTANCING
              plantFrame=plantFrame*instanceMatrix;
            #endif
            ${lodRange?`
            shoreBlend=smoothstep(${(lodRange*.74).toFixed(3)},${(lodRange*1.27).toFixed(3)},
              distance(detailEye,plantFrame[3].xyz));
            shoreCoarse=shoreLOD;`:''}
            vec2 anchor=plantFrame[3].xz;
            float gust=sin(dot(anchor,vec2(.146,.097))-bankWindTime*.96)
              +.33*sin(dot(anchor,vec2(-.08,.24))+bankWindTime*1.68);
            float bend=clamp(position.y,0.,1.);
            float amplitude=${wind==='grass'?'.25':'.035'}*length(plantFrame[1].xyz);
            vec3 windOffset=vec3(.91,0.,.42)*amplitude*bend*bend*gust;
            ${wind==='canopy'?`
            float flutter=sin(dot(position.xz,vec2(13.4,16.5))+dot(anchor,vec2(.21,.33))+bankWindTime*2.1);
            windOffset.z+=.050*bend*uv.y*flutter;`:''}
            vec3 axisX=plantFrame[0].xyz,axisZ=plantFrame[2].xyz;
            transformed.x+=dot(windOffset,axisX)/dot(axisX,axisX);
            transformed.z+=dot(windOffset,axisZ)/dot(axisZ,axisZ);
            ${coverRange?`
            float grassFade=1.-smoothstep(${(coverRange*.67).toFixed(2)},${coverRange.toFixed(2)},
              distance(detailEye,plantFrame[3].xyz));
            transformed*=grassFade;`:''}
          `);
        }
        const hasContact=!rim;
        const pigment=ground?forestFloor||paintedStone:rock?paintedStone:null;
        const {lookup,sources,slots,width,heightBase}=shore.lighting;
        shader.uniforms.shoreLampLookup={value:lookup};
        shader.uniforms.shoreLampSources={value:sources};
        shader.uniforms.shoreGrain={value:texture};
        if(pigment)shader.uniforms.shorePaint={value:pigment};
        if(hasContact)shader.uniforms.groundContacts={value:groundContacts};
        shader.uniforms.shoreMoon=moonDirection;
        const footContact=hasContact && !ground?'varying float shoreLocalY;\n':'';
        if(footContact)shader.vertexShader=footContact+shader.vertexShader.replace(
          '#include <begin_vertex>','#include <begin_vertex>\n shoreLocalY=position.y;');
        const rockSize=rock && pigment?'varying float shoreRockSize;\n':'';
        if(rockSize)shader.vertexShader=rockSize+shader.vertexShader.replace('#include <begin_vertex>',`
          #include <begin_vertex>
          shoreRockSize=1.;
          #ifdef USE_INSTANCING
            shoreRockSize=max(length(instanceMatrix[0].xyz),length(instanceMatrix[2].xyz));
          #endif
        `);
        shader.fragmentShader=exposure+footContact+'uniform sampler2D shoreLampLookup,shoreLampSources,shoreGrain;\n'
          +(pigment?'uniform sampler2D shorePaint;\n':'')
          +(hasContact?'uniform sampler2D groundContacts;\n':'')
          +rockSize+(pigment?parallaxShader:'')
          +'uniform vec3 shoreMoon;\n'+shader.fragmentShader.replace(
          '#include <lights_fragment_maps>',`
          #include <lights_fragment_maps>
          vec3 bankNormal=inverseTransformDirection(geometry.normal,viewMatrix);
          float skyView=smoothstep(-.34,.86,bankNormal.y);
          float openRiver=.52+.48*abs(bankNormal.x);
          irradiance+=mix(vec3(.028,.039,.065),vec3(.143,.195,.307),skyView)*openRiver;
          irradiance+=vec3(.044,.052,.066)*(1.-skyView)*smoothstep(-.9,.43,bankNormal.z);
          ${coverRange?`
          float bladeExposure=smoothstep(.10,.82,shoreLocalY);
          irradiance+=vec3(.18,.25,.36)*bladeExposure;`:''}
          ${rock || ground || coverRange?`
          float rimFacing=max(0.,dot(bankNormal,shoreMoon));
          float grazing=pow(1.-clamp(dot(geometry.normal,geometry.viewDir),0.,1.),1.7);
          float crest=smoothstep(.12,.75,bankNormal.y);
          float rimStrength=${coverRange?'.23*bladeExposure':rock?'.28*crest':'.12*crest'};
          reflectedLight.directDiffuse+=BRDF_Diffuse_Lambert(material.diffuseColor)
            *vec3(.36,.63,1.)*rimStrength*rimFacing*(.35+.65*grazing);
          `:''}
          ${rim?`
          float canopyLight=mix(.23,1.,canopyExposure);
          float moonFacing=dot(bankNormal,shoreMoon);
          float moonDiffuse=max(0.,moonFacing);
          float moonThroughLeaf=.27*max(0.,-moonFacing);
          irradiance*=canopyLight;
          irradiance+=vec3(.22,.38,.63)*canopyLight*(.12+moonDiffuse+moonThroughLeaf);
          reflectedLight.directDiffuse*=mix(.34,1.,canopyExposure);
          reflectedLight.directSpecular*=mix(.40,1.,canopyExposure);`:''}
          float bankZ=riverSurface.z;
          float midpoint=6.7*sin((bankZ+10.)*.046)+.013*bankZ;
          float side=step(midpoint,riverSurface.x);
          float row=clamp(floor((bankZ-(${firstZ.toFixed(1)}))/${lampCellDepth.toFixed(8)}),0.,${(lampCells-1).toFixed(1)});
          float lookupY=(row+side*${lampCells.toFixed(1)}+.5)/${(lampCells*2).toFixed(1)};
          for(int i=0;i<${slots};i++){
            vec2 entry=texture2D(shoreLampLookup,vec2((float(i)+.5)/${slots.toFixed(1)},lookupY)).rg;
            float lamp=floor(dot(entry,vec2(255.,65280.))+.5)-1.;
            if(lamp<0.)break;
            vec4 high=texture2D(shoreLampSources,vec2((lamp*2.+.5)/${width.toFixed(1)},.5));
            vec3 low=texture2D(shoreLampSources,vec2((lamp*2.+1.5)/${width.toFixed(1)},.5)).rgb;
            vec3 position=(high.rgb*256.+low)/257.*vec3(${lightMapOffset},12.,${lightMapLength})
              +vec3(-${halfWidth.toFixed(1)},${heightBase.toFixed(4)},${firstZ.toFixed(1)});
            vec3 delta=position-riverSurface;
            float distanceSquared=dot(delta,delta),distanceToLamp=sqrt(distanceSquared);
            if(distanceToLamp>=${lampRange})continue;
            float bankLight=(1.-smoothstep(3.65,${lampRange},distanceToLamp))*high.a/(distanceSquared+.55);
            ${rim?'bankLight*=mix(.53,1.,canopyExposure);':''}
            directLight.direction=mat3(viewMatrix)*(delta/max(.001,distanceToLamp));
            directLight.color=vec3(5.25,2.12,.78)*bankLight;
            directLight.visible=true;
            RE_Direct(directLight,geometry,material,reflectedLight);
            irradiance+=vec3(.78,.29,.095)*bankLight;
            ${coverRange?'irradiance+=vec3(1.36,.69,.28)*bankLight*bladeExposure;':''}
            ${twoSided?`
            float scatter=1.-abs(dot(geometry.normal,directLight.direction));
            irradiance+=vec3(.63,.25,.077)*scatter*scatter*bankLight;`:''}
          }
          ${rim?`
          float edge=pow(1.-max(0.,dot(geometry.normal,geometry.viewDir)),2.);
          float lightFacing=smoothstep(-.40,.93,moonFacing);
          irradiance+=vec3(.24,.43,.72)*edge*lightFacing*canopyLight;`:''}
          ${hasContact?`
          vec2 contactUV=vec2((riverSurface.x+${halfWidth.toFixed(1)})/${lightMapOffset},
                            1.-(riverSurface.z-(${firstZ.toFixed(1)}))/${lightMapLength});
          float contactShade=texture2D(groundContacts,contactUV).a;
          ${!ground?`contactShade*=1.-smoothstep(${rock?'-.36,.24':rootedTree?'0.,.09':'.02,.48'},shoreLocalY);`:''}
          irradiance*=1.-.81*contactShade;
          reflectedLight.directDiffuse*=1.-${ground?'.49':'.23'}*contactShade;
          reflectedLight.directSpecular*=1.-${ground?'(.48+.38*wet)':'.28'}*contactShade;`:''}
        `);
        if(ground || rock)shader.fragmentShader=wetBandShader+shader.fragmentShader.replace('#include <color_fragment>',`
          #include <color_fragment>
          vec2 terrainUV=riverSurface.xz+riverSurface.y*vec2(.38,.56);
          ${pigment?`
          vec3 reliefNormal=normalize(vNormal);
          vec3 shoreRay=riverReliefRay(vViewPosition,reliefNormal,${compact?'15.':'24.'});
          vec3 shoreOffset=shoreRay*mat3(viewMatrix);
          const vec3 heightWeights=vec3(.30,.55,.15);
          ${rock?`
          vec3 axes=abs(inverseTransformDirection(reliefNormal,viewMatrix));
          vec3 weights=pow(axes,vec3(4.));
          weights/=max(.001,weights.x+weights.y+weights.z);
          const vec3 stoneScale=vec3(1.51,1.25,1.51);
          vec3 stoneUV=riverSurface*stoneScale;
          vec3 brush=riverTriplanar(shorePaint,stoneUV,weights,.22);
          float stoneRelief=dot(riverTriplanar(shorePaint,stoneUV,weights,1.5),heightWeights);
          float recess=1.-smoothstep(.19,.38,dot(brush,heightWeights));
          float topFace=smoothstep(.48,.87,axes.y);
          shoreOffset*=mix(.019,.006,topFace)*recess*smoothstep(.56,.91,shoreRockSize);
          brush=riverReliefSample(shorePaint,stoneUV,shoreOffset*stoneScale,weights,brush,.22);
          `:`
          vec2 dirtUV=terrainUV*.62;
          const float dirtMipBias=.9;
          vec3 brush=texture2D(shorePaint,dirtUV,dirtMipBias).rgb;
          float dirtHeight=dot(texture2D(shorePaint,dirtUV,2.2).rgb,heightWeights);
          float recess=1.-smoothstep(.09,.24,dirtHeight);
          shoreOffset*=.010*recess*smoothstep(-.06,.20,riverSurface.y-(${litHeight}));
          `}
          vec2 terrainShift=shoreOffset.xz+shoreOffset.y*vec2(.38,.56);
          ${ground?'brush=riverReliefSample(shorePaint,dirtUV,terrainShift*.62,brush,dirtMipBias);':''}
          terrainUV+=terrainShift;
          float paintGrain=dot(brush,heightWeights);
          `:`float paintGrain=.46;${ground?'float dirtHeight=paintGrain;':''}`}
          vec3 grain=texture2D(shoreGrain,terrainUV*.78,${ground?'1.1':'0.'}).rgb;
          float microRelief=${rock && pigment?
            'riverTriplanar(shoreGrain,riverSurface*3.84+vec3(.34,.17,.81),weights,.95).r':
            `texture2D(shoreGrain,terrainUV*3.25+vec2(.34,.81),${ground?'1.5':'0.'}).r`};
          float mineral=texture2D(shoreGrain,terrainUV*.188).g;
          float wet=riverWetBand(riverSurface,${litHeight});
          float moss=smoothstep(.42,.71,mineral+.15*(grain.r-.5))*(1.-wet*.64);
          diffuseColor.rgb*=mix(.64,1.46,smoothstep(.12,.79,mineral))
                           *mix(${ground?'.84,1.16':'.74,1.24'},smoothstep(.12,.83,grain.b));
          diffuseColor.rgb*=mix(vec3(1.),vec3(.65,1.11,.63),moss*.43)*mix(vec3(1.),vec3(.51,.54,.52),wet);
          ${pigment?`
          ${rock?`
          float lichen=smoothstep(.012,.068,brush.g-brush.b+.028*(mineral-.40))*(1.-wet*.76);
          lichen*=mix(.36,1.,smoothstep(.18,.76,axes.y));
          float baseMottle=smoothstep(.34,.64,mineral+.36*(grain.r-.5));
          float stoneFoot=1.-smoothstep(.02,.27,shoreLocalY+(grain.g-.52)*.16);
          float baseMoss=stoneFoot*baseMottle*(1.-wet*.65);
          float crevice=1.-smoothstep(.51,.87,paintGrain/max(.075,stoneRelief));
          diffuseColor.rgb*=mix(vec3(.44),vec3(1.59),smoothstep(.10,.56,paintGrain))
                           *mix(vec3(1.),vec3(.76,1.16,.57),lichen*.83)*(1.-.24*crevice);
          diffuseColor.rgb*=mix(vec3(1.),vec3(.54,.68,.38),baseMoss*.86)*(1.-.14*stoneFoot);`:`
          diffuseColor.rgb*=clamp(.57+(brush-.13)*2.65,.52,1.64);`}`:''}
          ${ground?`
          float litter=texture2D(shoreGrain,terrainUV*.283+vec2(.33,.76)).b;
          float carpet=smoothstep(.38,.72,mineral+(grain.r-.5)*.26)*(1.-wet*.75);
          diffuseColor.rgb*=mix(vec3(.85,1.01,.74),vec3(1.43,1.11,.82),smoothstep(.24,.73,litter));
          diffuseColor.rgb*=mix(vec3(1.),vec3(.65,1.12,.60),carpet*.57);`:''}
        `).replace('#include <roughnessmap_fragment>',`
          #include <roughnessmap_fragment>
          roughnessFactor=clamp(roughnessFactor+.30*(grain.g-.5)+${ground?'.045':'.10'}*(microRelief-.5)
            ${ground?'+.13*carpet-.14*smoothstep(.28,.59,paintGrain)':pigment?'+.16*baseMoss':''},.44,.98);
          roughnessFactor=mix(roughnessFactor,${ground?'.23':'.19'},wet);
        `).replace('#include <normal_fragment_maps>',`
          #include <normal_fragment_maps>
          vec3 dx=dFdx(-vViewPosition),dy=dFdy(-vViewPosition);
          vec3 tx=cross(dy,normal),ty=cross(normal,dx);
          float det=dot(dx,tx),height=${ground?'.007*grain.r+.011*mineral+.022*dirtHeight+.0015*microRelief':
            ` .012*grain.r+.019*mineral+.038*${pigment?'stoneRelief':'paintGrain'}+.007*microRelief`};
          vec3 slope=sign(det)*(tx*dFdx(height)+ty*dFdy(height));
          slope*=min(1.,${ground?'.31':'.56'}*abs(det)/max(length(slope),1e-7));
          slope*=mix(1.,${ground?'.48':'.67'},wet);
          normal=normalize(max(abs(det),1e-7)*normal-slope);
        `);
        if(twoSided && !cards)shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`
          #include <color_fragment>
          float textureGrain=texture2D(shoreGrain,riverSurface.xz*1.7+riverSurface.y*vec2(.64,.91)).r;
          diffuseColor.rgb*=mix(.73,1.35,smoothstep(.11,.73,textureGrain));
        `);
        if(understory || coverRange)shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`
          #include <color_fragment>
          float leafValue=dot(diffuseColor.rgb,vec3(.2126,.7152,.0722));
          diffuseColor.rgb=mix(diffuseColor.rgb,vec3(leafValue),.27)*vec3(.98,1.,1.05);
        `);
        if(coverRange)shader.fragmentShader=shader.fragmentShader.replace('#include <emissivemap_fragment>',`
          #include <emissivemap_fragment>
          float rootLight=mix(.34,1.,smoothstep(.018,.29,shoreLocalY));
          diffuseColor.rgb*=rootLight;
          totalEmissiveRadiance*=rootLight;
        `);
      };
      return material;
    }

    const earth=surface('#ffffff',{vertexColors:true,ground:true});
    for(const side of [-1,1]){
      const positions=[],tints=[],index=[];
      const soil=color('#77604d'),grass=color('#55634a'),silt=color('#514943'),upland=color('#4a5345');
      const bankRows=shore.terrain[side>0?1:0];
      for(let row=0;row<terrainRows.length;row++){
        const z=terrainRows[row];
        const {bank,heights}=bankRows[row];
        offsets.forEach((offset,i)=>{
          positions.push(bank+side*offset,heights[i],z);
          const shade=.13+.76*grassPatch(T,z,offset,side);
          const detailed=row>=outerRows && row<=outerRows+rows && i<bankOffsets.length;
          const tint=soil.clone().lerp(grass,shade).lerp(silt,T.MathUtils.clamp(1-offset*.64,0,1))
            .lerp(upland,T.MathUtils.smoothstep(offset,9,38))
            .multiplyScalar(detailed?.82+.30*random():.96+.08*Math.sin(z*.28+offset*.19));
          tints.push(...tint.toArray());
          if(row===terrainRows.length-1 || i===offsets.length-1)return;
          const a=row*offsets.length+i,b=a+1,c=a+offsets.length,d=c+1;
          if(side<0)index.push(a,b,c,b,d,c);else index.push(a,c,b,b,c,d);
        });
      }
      const mesh=new T.BufferGeometry();
      mesh.setIndex(index);mesh.setAttribute('position',new T.Float32BufferAttribute(positions,3));
      mesh.setAttribute('color',new T.Float32BufferAttribute(tints,3));mesh.computeVertexNormals();
      scene.add(submerged(reflected(new T.Mesh(mesh,earth))));
    }

    function decode(data){
      const binary=atob(data),bytes=new Uint8Array(binary.length);
      for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
      return new DataView(bytes.buffer);
    }
    function readAttribute([scale,data],size){
      const packed=decode(data),values=new Float32Array(packed.byteLength/2);
      for(let i=0;i<values.length;i++)values[i]=packed.getInt16(i*2,true)*scale;
      return new T.BufferAttribute(values,size);
    }
    function readGeometry({position,normal,uv,index}){
      const mesh=new T.BufferGeometry(),packedIndices=decode(index);
      const indices=new Uint16Array(packedIndices.byteLength/2);
      for(let i=0;i<indices.length;i++)indices[i]=packedIndices.getUint16(i*2,true);
      mesh.setIndex(new T.BufferAttribute(indices,1));
      mesh.setAttribute('position',readAttribute(position,3));
      mesh.setAttribute('normal',new T.BufferAttribute(new Int8Array(decode(normal).buffer),3,true));
      if(uv)mesh.setAttribute('uv',readAttribute(uv,2));
      mesh.computeBoundingBox();
      return mesh;
    }
    function readPlantParts({bark,leaves},barkMaterial,leafMaterial){
      const branches=readGeometry(bark),canopy=new T.BufferGeometry();
      const corners=readAttribute(leaves.position,3).array;
      const count=corners.length/9*4;
      const vertices=new Float32Array(count*3),indices=new Uint16Array(count/4*6);
      const uvs=new Float32Array(count*2);
      // The leaf cards store three corners. The fourth is the opposite side of the quad.
      for(let vertex=0;vertex<count;vertex+=4){
        const source=vertex/4*9,start=vertex*3;
        vertices.set(corners.subarray(source,source+9),start);
        for(let i=0;i<3;i++)vertices[start+9+i]=corners[source+i]+corners[source+6+i]-corners[source+3+i];
        indices.set([vertex,vertex+1,vertex+2,vertex,vertex+2,vertex+3],vertex/4*6);
        uvs.set([0,1,0,0,1,0,1,1],vertex*2);
      }
      canopy.setIndex(new T.BufferAttribute(indices,1));
      canopy.setAttribute('position',new T.BufferAttribute(vertices,3));
      canopy.setAttribute('uv',new T.BufferAttribute(uvs,2));
      canopy.setAttribute('normal',new T.BufferAttribute(new Int8Array(decode(leaves.normal).buffer),3,true));
      canopy.setAttribute('shoreExposure',new T.BufferAttribute(new Uint8Array(decode(leaves.shade).buffer),1,true));
      canopy.computeBoundingBox();
      canopy.boundingBox.union(branches.boundingBox);
      return {canopy,parts:[[branches,barkMaterial],[canopy,leafMaterial]]};
    }
    function stockPlant(preset,range,bush=false){
      const leaves=stock.leaves[preset.leafMap];
      if(!leaves)return null;
      const maps=stock.bark[preset.barkMap];
      if(maps.map)maps.map.encoding=T.sRGBEncoding;
      leaves.encoding=T.sRGBEncoding;
      leaves.anisotropy=4;
      for(const map of Object.values(maps).filter(Boolean)){
        map.wrapS=map.wrapT=T.RepeatWrapping;
        map.repeat.y=preset.barkRepeat;
        map.anisotropy=4;
        map.needsUpdate=true;
      }
      const barkMaterial=surface(preset.barkTint,{wind:'tree',rootedTree:true,finish:maps,lodRange:range});
      const leafMaterial=surface(preset.leafTint,{twoSided:true,rim:true,cards:true,wind:'canopy',lodRange:range,understory:bush,
        finish:{map:leaves,alphaTest:preset.alphaTest}});
      const near=readPlantParts(preset.near,barkMaterial,leafMaterial);
      const far=preset.far?readPlantParts(preset.far,barkMaterial,leafMaterial):null;
      if(far){
        near.canopy.boundingBox.union(far.canopy.boundingBox);
        if(bush)far.parts=far.parts.slice(1);
      }
      return {name:preset.name,near,far,range};
    }
    const pines=stock?.presets.pines.map(preset=>stockPlant(preset,compact?20:34)).filter(Boolean) ?? [];
    const shrubs=stock?.presets.bushes.map(preset=>stockPlant(preset,compact?9:17,true)).filter(Boolean) ?? [];
    const shoreChunks=new Map(),detailGroups=[],grassBatches=[];
    const stoneShapes=stock?.presets.rocks.map(readGeometry) ?? Array.from({length:3},(_,i)=>shoreRock(T,i));
    const fracturedStones=[shoreRock(T,1,4,true),shoreRock(T,2,3,true)];
    const pebble=shoreRock(T,2,1);
    const stones=['#72736a','#777a75','#797267'].map(tint=>surface(tint,{rock:true}));
    let meadowSeed=74213;
    function meadowRandom(){
      meadowSeed=(Math.imul(meadowSeed,1664525)+1013904223)>>>0;
      return meadowSeed/4294967296;
    }
    const reeds=reedClump(T,meadowRandom,11,true);
    const rushes=reedClump(T,meadowRandom,9,false);
    const leafFinish={vertexColors:true,twoSided:true,wind:'grass',understory:true};
    const grass=surface('#89966b',leafFinish);
    const sedge=surface('#73875e',leafFinish);
    const litterMaterial=surface('#685744',{vertexColors:true,twoSided:true});
    const lowLeaves=groundLeaves(T);
    const lowLeafMaterial=surface('#677950',leafFinish);
    const flowersMaterial=surface('#ffffff',{vertexColors:true,twoSided:true,wind:'grass'});
    let coverSeed=58147;
    function coverRandom(){
      coverSeed=(Math.imul(coverSeed,1664525)+1013904223)>>>0;
      return coverSeed/4294967296;
    }
    let floorSeed=37159;
    function floorRandom(){
      floorSeed=(Math.imul(floorSeed,1664525)+1013904223)>>>0;
      return floorSeed/4294967296;
    }
    const meadowGrass=Array.from({length:4},(_,i)=>grassCards(T,i));
    const grassGeometries=new Set(meadowGrass);
    const coverRange=compact?48:74;
    const denseRange=compact?30:43;
    const grassTileSize=7,baseGrassDensity=1000,extraGrassLayers=9;
    const grassTiles=new Map(),activeGrassTiles=new Set(),rockClearance=new Map();
    let extraGrassDensity=0;
    const grassMap=grassTexture(painted,coverRandom);
    grassMap.anisotropy=2;
    const grassFinish={map:grassMap,alphaTest:.34,emissive:color('#324629'),emissiveIntensity:.065};
    const grassSurface=range=>surface('#d4dfbc',{twoSided:true,cards:true,wind:'grass',coverRange:range,finish:grassFinish});
    const meadowMaterial=grassSurface(coverRange);
    const denseGrassMaterial=grassSurface(denseRange);
    const meadowFlowers=['#aba9df','#f5ede0','#ecc56d'].map(tint=>meadowFlower(T,color,tint));
    const placement=new T.Object3D(),bounds=new T.Box3();
    const shoreRow=z=>Math.floor(z/4);
    function indexBounds(cells,box,padding=0){
      for(let row=shoreRow(box.min.z-padding);row<=shoreRow(box.max.z+padding);row++){
        if(!cells.has(row))cells.set(row,[]);
        cells.get(row).push(box);
      }
    }
    function nearbyBounds(cells,minZ,maxZ,intersects){
      for(let row=shoreRow(minZ);row<=shoreRow(maxZ);row++){
        if(cells.get(row)?.some(intersects))return true;
      }
      return false;
    }
    const lanternRows=new Map();
    for(const lamp of shore.lanterns)indexBounds(lanternRows,lamp.bounds);
    function place(geometry,x,y,z,width,height,depth,spin,tilt,submit){
      if(!geometry.boundingBox)geometry.computeBoundingBox();
      placement.position.set(x,y,z);
      placement.scale.set(width,height,depth);
      placement.rotation.set(0,spin,tilt,'YXZ');
      placement.updateMatrix();
      bounds.copy(geometry.boundingBox).applyMatrix4(placement.matrix);
      const radius=Math.hypot(Math.max(x-bounds.min.x,bounds.max.x-x),Math.max(z-bounds.min.z,bounds.max.z-z));
      if(!clearDecks(x,z,radius+.10) ||
        nearbyBounds(lanternRows,bounds.min.z,bounds.max.z,box=>box.intersectsBox(bounds)))return false;
      return submit(placement.matrix,bounds)!==false;
    }
    function queueShore(side,z,geometry,parts,matrix,extent,plant){
      const key=side+':'+Math.floor(z/24)+':'+geometry.id;
      if(!shoreChunks.has(key))shoreChunks.set(key,{parts,matrices:[],bounds:new T.Box3(),plant});
      const chunk=shoreChunks.get(key);
      chunk.matrices.push(matrix.clone());
      chunk.bounds.union(extent);
    }
    function placePlant(plant,side,x,y,z,size,spin,tilt=0){
      const {canopy,parts}=plant.near;
      return place(canopy,x,y,z,size,size,size,spin,tilt,(matrix,extent)=>{
        queueShore(side,z,canopy,parts,matrix,extent,plant);
      });
    }
    function placeShrub(index,side,x,y,z,width,height,spin){
      if(shrubs.length)return placePlant(shrubs[index%shrubs.length],side,x,y,z,height,spin);
      return placeCover(side,meadowGrass[0],meadowMaterial,x,y,z,width,height,width,spin);
    }
    function placeCover(side,geometry,material,x,y,z,width,height,depth,spin){
      return place(geometry,x,y,z,width,height,depth,spin,0,(matrix,extent)=>{
        queueShore(side,z,geometry,[[geometry,material]],matrix,extent);
      });
    }
    for(const side of [-1,1]){
      const litter=plantBuilder(T);
      const rockFootprints=[],boulderEdges=[];
      const rockRows=new Map(),grassClearance=.09;
      const footprint=new T.Box3(),rockVertex=new T.Vector3();
      const floorHeight=(x,z)=>{
        const bank=bankX(z,side);
        return shore.ground(z,side,(x-bank)*side,bank);
      };
      function placeRock(geometry,material,x,y,z,width,height,depth,spin,tilt=0){
        return place(geometry,x,y,z,width,height,depth,spin,tilt,matrix=>{
          // Measure the rotated mesh itself so irregular rocks can sit close without crossing.
          const vertices=geometry.getAttribute('position');
          footprint.makeEmpty();
          for(let i=0;i<vertices.count;i++){
            footprint.expandByPoint(rockVertex.fromBufferAttribute(vertices,i).applyMatrix4(matrix));
          }
          const gap=.025;
          if(nearbyBounds(rockRows,footprint.min.z,footprint.max.z,rock=>
            footprint.min.x<rock.max.x+gap && footprint.max.x+gap>rock.min.x &&
            footprint.min.z<rock.max.z+gap && footprint.max.z+gap>rock.min.z))return false;
          const localBounds=footprint.clone();
          rockFootprints.push(localBounds);
          indexBounds(rockRows,localBounds,grassClearance);
          queueShore(side,z,geometry,[[geometry,material]],matrix,footprint);
        });
      }
      function clearRock(x,z,margin=grassClearance){
        return !rockRows.get(shoreRow(z))?.some(rock=>x>=rock.min.x-margin && x<=rock.max.x+margin &&
          z>=rock.min.z-margin && z<=rock.max.z+margin);
      }
      function rememberBoulder(x,z,material){
        boulderEdges.push({x,z,material,bounds:rockFootprints[rockFootprints.length-1]});
      }
      function edgePoint(boulder,angle,gap){
        const {x,z,bounds}=boulder,dx=Math.cos(angle),dz=Math.sin(angle);
        const reachX=(dx<0?x-bounds.min.x:bounds.max.x-x)/Math.max(.001,Math.abs(dx));
        const reachZ=(dz<0?z-bounds.min.z:bounds.max.z-z)/Math.max(.001,Math.abs(dz));
        const reach=Math.min(reachX,reachZ)+gap;
        return [x+dx*reach,z+dz*reach];
      }
      rockClearance.set(side,clearRock);
      function dropLitter(x,z,needles=false){
        if(!clearDecks(x,z,.69))return;
        const rand=needles?floorRandom:random;
        for(let i=0;i<(needles?17:9);i++){
          const px=x+(rand()-.5)*.65,pz=z+(rand()-.5)*.65;
          if(floorHeight(px,pz)<waterLevel+.13)continue;
          if(needles && !clearRock(px,pz,.025))continue;
          const spin=rand()*Math.PI*2,dx=Math.cos(spin),dz=Math.sin(spin);
          const length=.048+.115*rand(),width=length*(needles?.052:i%3===0?.065:.28);
          const point=(along,across,lift)=>{
            const atX=px+dx*along-dz*across,atZ=pz+dz*along+dx*across;
            return [atX,floorHeight(atX,atZ)+lift,atZ];
          };
          const lift=needles?.47:1;
          const tip=point(length*.57,0,.010*lift),base=point(-length*.43,0,.007*lift);
          const left=point(0,-width,.009*lift),right=point(0,width,.011*lift),vein=point(-length*.05,0,.018*lift);
          const shade=(needles?.41:.54)+rand()*.46;
          litter.face(base,left,vein,shade*.71,shade,shade*.8);
          litter.face(vein,left,tip,shade*.8,shade,shade*.92);
          litter.face(base,vein,right,shade*.64,shade*.78,shade*.92);
          litter.face(vein,tip,right,shade*.78,shade*.91,shade);
        }
      }
      function plantLowLeaves(x,z,size,angle){
        const y=floorHeight(x,z)-.022;
        if(y<waterLevel+.075 || !clearRock(x,z,.04))return;
        if(placeCover(side,lowLeaves,lowLeafMaterial,x,y,z,size,size*.65,size,angle)){
          darkenGround(x,z,size*.24+.06,.40,.79,angle);
        }
      }
      if(pines.length)for(let z=firstZ+3;z<lastZ-3;z+=5+random()*9){
        const count=4+Math.floor(random()*9),depth=4+random()*13;
        for(let i=0;i<count;i++){
          const pos=T.MathUtils.clamp(z+(random()-.5)*9,firstZ+.5,lastZ-.5);
          const leading=pos>-214 && pos<36 && i<2;
          const offset=leading?3.6+random()*3.2:depth+(random()-.5)*6.2;
          const x=bankX(pos,side)+side*offset;
          const height=leading?3.65+random()*5.1:2.6+random()**.85*8.2;
          const spin=random()*Math.PI*2,tilt=(random()-.5)*.15;
          const base=shore.ground(pos,side,offset)-.13;
          const trunkRadius=height*(.029+random()*.014);
          const variety=pines[(Math.floor((pos-firstZ)/6)+i)%pines.length];
          if(!placePlant(variety,side,x,base,pos,height,spin,tilt))continue;
          darkenGround(x,pos,trunkRadius*.90+.15,.86);
        }
      }
      const patches=[];
      for(let z=firstZ+2;z<lastZ-2;z+=2.5+random()*4.2){
        patches.push(z);
        const count=4+Math.floor(random()*5),ledges=random()<.65;
        const bearing=Math.atan2(-1,bankX(z+.5,side)-bankX(z-.5,side));
        for(let i=0;i<count;i++){
          const pos=z+(random()-.5)*3.9,offset=i===1?.58+random()*2.5:-.67+random()*2.4;
          const x=bankX(pos,side)+side*offset;
          const size=i===0?.83+random()*.71:.15+1.02*random()**1.72;
          const n=ledges && i<3?i%2*2:i%3;
          const w=size*(n===1?.92+random()*.31:1.32+random()*.37);
          const h=stock?w*(.76+random()*.22):size*(n===1?.69+random()*.37:.37+random()*.27);
          const d=stock?w*(.87+random()*.22):size*(.70+random()*.37);
          const angle=bearing+(random()-.5)*1.10;
          const boulder=w>1.03 && pos>-214 && pos<36;
          const shape=boulder?fracturedStones[patches.length%2]:stoneShapes[n];
          const y=shore.ground(pos,side,offset)-size*(boulder?.081:.026);
          if(placeRock(shape,stones[n],x,y,pos,w,boulder?h*1.18:h,d,angle,(random()-.5)*.24)){
            darkenGround(x,pos,w*.61+.12,boulder?.93:.80,Math.max(.6,d/w),angle);
            if(boulder)rememberBoulder(x,pos,stones[n]);
          }
        }
      }
      // Give the lit shelves a few larger, embedded stones among the small debris.
      let lastLitShelf=-Infinity;
      for(const lamp of shore.lanterns){
        if(lamp.z<-214 || lamp.z>36 || lamp.z-lastLitShelf<5 || (lamp.x-center(lamp.z))*side<=0)continue;
        const z=lamp.z-.72,offset=(lamp.x-bankX(lamp.z,side))*side+.71;
        const x=bankX(z,side)+side*offset;
        if(!clearRock(x,z))continue;
        const scale=.88+.34*random(),spin=random()*Math.PI*2;
        if(!placeRock(fracturedStones[0],stones[1],x,floorHeight(x,z)-.085,z,scale,.97*scale,.87*scale,spin,.14))continue;
        lastLitShelf=lamp.z;
        darkenGround(x,z,scale*.67,.92,.78,spin);
        rememberBoulder(x,z,stones[1]);
        const px=x+side*scale*.23,pz=z-scale*.58;
        if(clearRock(px,pz) && placeShrub(Math.floor((z-firstZ)/5.3),side,px,floorHeight(px,pz)-.051,pz,.73,.57,spin+.64)){
          darkenGround(px,pz,.44,.44,.82,spin+.64);
        }
        dropLitter(x-side*.44,z+.36);
      }
      // Break up the exposed slopes with occasional larger outcrops set back from the water.
      for(let i=2;i<patches.length;i+=4){
        const z=patches[i];
        if(z<-198 || z>33)continue;
        for(let attempt=0;attempt<3;attempt++){
          const offset=2.6+random()*3.4;
          const x=bankX(z,side)+side*offset;
          const size=1.08+random()*.44,spin=random()*Math.PI*2;
          const y=floorHeight(x,z)-.10;
          const material=stones[i%stones.length];
          if(!placeRock(fracturedStones[i%2],material,x,y,z,size,size*.87,size*.82,spin,(random()-.5)*.22))continue;
          darkenGround(x,z,size*.64,.92,.77,spin);
          rememberBoulder(x,z,material);
          break;
        }
      }
      for(const boulder of boulderEdges){
        const count=2+Math.floor(random()*2),cluster=random()*Math.PI*2;
        let placed=0;
        for(let i=0;i<10 && placed<count;i++){
          const angle=cluster+(random()-.5)*2.8+(i>5?Math.PI:0);
          const width=.18+random()*.22;
          const [x,z]=edgePoint(boulder,angle,width*.60+.08+random()*.19);
          const groundY=floorHeight(x,z);
          if(groundY<waterLevel-.24)continue;
          if(placeRock(pebble,boulder.material,x,groundY-.025,z,width,width*.70,width*.83,angle)){
            darkenGround(x,z,width*.62+.07,.62);
            placed++;
          }
        }
      }
      for(const boulder of boulderEdges){
        for(let i=0;i<7;i++){
          const spin=random()*Math.PI*2;
          const [x,z]=edgePoint(boulder,spin,.15+random()*.38);
          const y=floorHeight(x,z)-.043;
          if(y<waterLevel+.05 || !clearRock(x,z))continue;
          const width=.43+random()*.31,height=.16+random()*.21;
          if(placeCover(side,meadowGrass[i%meadowGrass.length],meadowMaterial,x,y,z,width,height,width,spin)){
            darkenGround(x,z,width*.40,.29,.78,spin);
          }
        }
        const angle=floorRandom()*Math.PI*2;
        for(let i=0;i<5;i++){
          const bearing=angle+i*1.2566+(floorRandom()-.5)*.64;
          const [x,z]=edgePoint(boulder,bearing,.055+floorRandom()*.16);
          plantLowLeaves(x,z,.68+floorRandom()*.36,bearing);
        }
      }
      const waterlineGroups=rockFootprints.filter(({min,max})=>
        min.y<waterLevel && max.y>waterLevel-.055 && Math.max(max.x-min.x,max.z-min.z)>.57 &&
        max.z>-216 && min.z<34).map(bounds=>({
          x:(bounds.min.x+bounds.max.x)/2,z:(bounds.min.z+bounds.max.z)/2,bounds
        }));
      for(let i=1;i<patches.length;i+=2){
        const z=patches[i];
        if(z<-214 || z>34 || waterlineGroups.some(group=>Math.abs(group.z-z)<1.1))continue;
        waterlineGroups.push({x:bankX(z,side),z});
      }
      for(const group of waterlineGroups){
        const direction=floorRandom()*Math.PI*2;
        const bankSlope=(bankX(group.z+.60,side)-bankX(group.z-.60,side))/1.20;
        const front=Math.atan2(side*bankSlope,-side);
        let chips=0;
        for(let i=0;i<12 && chips<3;i++){
          const angle=group.bounds?front+(i%3-1)*.77+(floorRandom()-.5)*.47:direction+i*1.94;
          const size=.16+.27*floorRandom();
          const [x,z]=group.bounds?edgePoint(group,angle,size*.56+.048):
            [group.x+(floorRandom()-.55)*1.01,group.z+(floorRandom()-.5)*1.55];
          const base=floorHeight(x,z);
          if(base<waterLevel-.32 || base>waterLevel+.21)continue;
          if(placeRock(pebble,stones[i%stones.length],x,base+.009,z,size,size*.72,size*.89,angle)){
            darkenGround(x,z,size*.60+.035,.58);
            chips++;
          }
        }
        for(let i=0;i<6;i++){
          const angle=group.bounds?front+(i%2?-.87:.87)+(floorRandom()-.5)*.55:direction+i*2.13;
          const [x,z]=group.bounds?edgePoint(group,angle,.082+floorRandom()*.23):
            [group.x+(floorRandom()-.29)*1.37,group.z+(floorRandom()-.5)*1.46];
          const base=floorHeight(x,z);
          if(base<waterLevel-.25 || base>waterLevel+.23 || !clearRock(x,z,.038))continue;
          const width=(group.bounds?.32:.20)+floorRandom()*.22,height=(group.bounds?.38:.29)+floorRandom()*.31;
          placeCover(side,i%2?reeds:rushes,i%2?sedge:grass,x,base-.035,z,width,height,width,angle);
        }
      }
      function plantMeadow(pos,offset,geometry,material,width,height,random=meadowRandom,allowed=true){
        const bank=bankX(pos,side),x=bank+side*offset;
        if(!clearRock(x,pos))return false;
        const spin=random()*Math.PI*2;
        if(!allowed)return false;
        const y=shore.ground(pos,side,(x-bank)*side,bank)-.034;
        return placeCover(side,geometry,material,x,y,pos,width,height,width,spin);
      }
      for(const z of patches){
        const close=z>-214 && z<36;
        if(close)for(let i=0;i<9;i++){
          const pos=z+(floorRandom()-.5)*5.2,offset=1.9+floorRandom()*9.2;
          if(grassPatch(T,pos,offset,side)>.66)continue;
          const x=bankX(pos,side)+side*offset;
          dropLitter(x,pos,true);
          if(i%3===0)plantLowLeaves(x,pos,.47+floorRandom()*.36,floorRandom()*Math.PI*2);
        }
        const count=(close?13:9)+Math.floor(random()*6),shelf=2.6+random()*3.6;
        for(let i=0;i<count;i++){
          const near=i<count*.53;
          const pos=z+(random()-.5)*(near?4.2:5.7);
          const offset=near?-.31+random()*2.5:shelf+(random()-.5)*5.1;
          const x=bankX(pos,side)+side*offset;
          if(!clearRock(x,pos))continue;
          const isReed=near && offset<.80;
          const size=isReed?.48+.54*random():(near?.25:.38)+.50*random();
          const spread=size*(.70+random()*.54),spin=random()*Math.PI*2;
          const groundY=shore.ground(pos,side,offset)-.060;
          const planted=near
            ? placeCover(side,isReed?reeds:rushes,isReed?sedge:grass,x,groundY,pos,spread,size,spread,spin)
            : placeShrub(i+Math.floor((z-firstZ)/5.3),side,x,groundY,pos,spread,size,spin);
          if(planted){
            darkenGround(x,pos,spread*(near?.37:.57),near?.30:.49,.77,spin);
          }
        }
        for(let i=0;i<(close?14:8);i++){
          const pos=z+(random()-.5)*5.6,offset=.72+random()*7.2;
          const x=bankX(pos,side)+side*offset;
          if(!clearRock(x,pos))continue;
          const spread=.56+random()*.61;
          const height=.13+random()*.20,spin=random()*Math.PI*2;
          if(grassPatch(T,pos,offset,side)>.51 &&
            placeCover(side,meadowGrass[i%meadowGrass.length],meadowMaterial,x,shore.ground(pos,side,offset)-.042,pos,
            spread,height,spread,spin))darkenGround(x,pos,spread*.45,.29,.84,spin);
          if(close && i%2===0)dropLitter(x,pos);
        }
      }
      for(const z of patches){
        const close=z>-218 && z<36;
        const centerOffset=1.05+meadowRandom()*5.7;
        const count=(close?18:9)+Math.floor(meadowRandom()*17);
        const flower=meadowFlowers[Math.floor(meadowRandom()*meadowFlowers.length)];
        const flowersInPatch=meadowRandom()<.66?2+Math.floor(meadowRandom()*6):0;
        const bloomX=bankX(z,side)+side*centerOffset;
        if(flowersInPatch){
          plantLowLeaves(bloomX,z,.92+floorRandom()*.27,floorRandom()*Math.PI*2);
          dropLitter(bloomX,z,true);
        }
        for(let i=0;i<count;i++){
          const isFlower=i<flowersInPatch;
          const pos=z+(meadowRandom()-.5)*(isFlower?1.07:4.5);
          const offset=Math.max(.78,centerOffset+(meadowRandom()-.5)*(isFlower?.92:3.7));
          const geometry=isFlower?flower:meadowGrass[i%meadowGrass.length];
          const material=isFlower?flowersMaterial:meadowMaterial;
          const width=isFlower?.40+meadowRandom()*.34:.34+meadowRandom()*.57;
          const height=isFlower?.32+meadowRandom()*.37:.19+meadowRandom()*.28;
          plantMeadow(pos,offset,geometry,material,width,height,meadowRandom,isFlower || grassPatch(T,pos,offset,side)>.46);
        }
      }
      let lastMeadow=-Infinity,patchIndex=0;
      for(const lamp of shore.lanterns){
        if(lamp.z<-218 || lamp.z>36 || lamp.z-lastMeadow<7 || (lamp.x-center(lamp.z))*side<=0)continue;
        lastMeadow=lamp.z;
        const offset=(lamp.x-bankX(lamp.z,side))*side;
        const flower=meadowFlowers[patchIndex++%meadowFlowers.length];
        plantLowLeaves(lamp.x+side*(.9+floorRandom()*.20),lamp.z,.89,floorRandom()*Math.PI*2);
        for(let i=0;i<18;i++){
          const pos=lamp.z+(meadowRandom()-.5)*(i<6?1.12:2.4);
          const depth=offset+(i<6?.62:.47)+meadowRandom()*(i<6?.83:1.5);
          if(i<6)plantMeadow(pos,depth,flower,flowersMaterial,.58+meadowRandom()*.19,.38+meadowRandom()*.24);
          else plantMeadow(pos,depth,meadowGrass[i%meadowGrass.length],meadowMaterial,.42+meadowRandom()*.44,.22+meadowRandom()*.22);
        }
      }
      for(const z of patches){
        const count=z>-218 && z<36?690:315;
        let planted=0;
        for(let i=0;i<count*3.6 && planted<count;i++){
          const pos=z+(coverRandom()+coverRandom()-1)*4.8;
          const offset=.67+18.3*coverRandom()**1.28;
          const cover=grassPatch(T,pos,offset,side);
          if(coverRandom()>=cover**2.55)continue;
          const width=.43+coverRandom()*.45;
          const height=.14+coverRandom()*.27;
          if(plantMeadow(pos,offset,meadowGrass[i%meadowGrass.length],meadowMaterial,width,height,coverRandom))planted++;
        }
      }
      scene.add(reflected(new T.Mesh(litter.geometry(),litterMaterial)));
    }
    if(pines.length)for(const side of [-1,1]){
      // Stagger the upper groves to leave gaps and give the forest a deeper silhouette.
      for(let z=firstZ+6;z<lastZ-6;z+=10+random()*9){
        const count=3+Math.floor(random()*4),depth=17+random()*13;
        for(let i=0;i<count;i++){
          const pos=z+(random()-.5)*10,offset=depth+(random()-.5)*8;
          const x=bankX(pos,side)+side*offset;
          const height=3.6+random()*7.6;
          const base=shore.ground(pos,side,offset)-.13,spin=random()*Math.PI*2;
          placePlant(pines[i%pines.length],side,x,base,pos,height,spin,(random()-.5)*.15);
        }
      }
    }
    function indexDenseGrass(geometry,matrices){
      const point=new T.Vector3();
      for(const matrix of matrices){
        const {x,y,z}=point.setFromMatrixPosition(matrix);
        const side=x<center(z)?-1:1;
        const tileX=Math.floor(x/grassTileSize),tileZ=Math.floor(z/grassTileSize);
        const key=side+':'+tileX+':'+tileZ;
        if(!grassTiles.has(key)){
          const seed=Math.imul(tileX,73856093)^Math.imul(tileZ,19349663)^side;
          grassTiles.set(key,{bounds:new T.Box3(),anchors:new Map(),side,seed,meshes:null});
        }
        const tile=grassTiles.get(key);
        if(!tile.anchors.has(geometry))tile.anchors.set(geometry,[]);
        const m=matrix.elements;
        tile.anchors.get(geometry).push(x,z,Math.hypot(m[0],m[1],m[2]),m[5]);
        tile.bounds.expandByPoint(point.set(x,y,z));
      }
    }
    // Each stretch shares the buffers but has its own culling bounds, padded for wind.
    for(const {parts,matrices,bounds,plant} of shoreChunks.values()){
      const sphere=bounds.getBoundingSphere(new T.Sphere());
      sphere.radius+=.65;
      const instances=([source,material],coarse)=>{
        const geometry=new T.BufferGeometry();
        geometry.setIndex(source.index);
        for(const [name,attribute] of Object.entries(source.attributes))geometry.setAttribute(name,attribute);
        if(plant)geometry.setAttribute('shoreLOD',new T.InstancedBufferAttribute(
          new Float32Array([Number(coarse)]),1,false,matrices.length));
        geometry.boundingSphere=sphere;
        const mesh=new T.InstancedMesh(geometry,material,matrices.length);
        if(grassGeometries.has(source)){
          // A stable shuffled order keeps patches distributed at every density.
          for(let i=matrices.length-1;i>0;i--){
            const j=Math.floor(coverRandom()*(i+1));
            [matrices[i],matrices[j]]=[matrices[j],matrices[i]];
          }
          indexDenseGrass(source,matrices);
          mesh.name='River grass';
          grassBatches.push(mesh);
        }
        matrices.forEach((matrix,i)=>mesh.setMatrixAt(i,matrix));
        mesh.frustumCulled=true;
        if(plant)mesh.name=plant.name+(source.hasAttribute('shoreExposure')?' foliage':' bark');
        if(bounds.min.y<waterLevel+.004 && (stones.includes(material) || source===reeds || source===rushes)){
          submerged(mesh);
        }
        scene.add(reflected(mesh));
        return mesh;
      };
      const near=parts.map(part=>instances(part,false));
      if(plant?.far){
        const far=plant.far.parts.map(part=>instances(part,true));
        const anchors=new T.Box3(),point=new T.Vector3();
        for(const matrix of matrices)anchors.expandByPoint(point.setFromMatrixPosition(matrix));
        detailGroups.push({near,far,anchors,fadeStart:plant.range*.74,fadeEnd:plant.range*1.27});
      }
    }
    function updateDetail(position){
      detailEye.value.copy(position);
      for(const mesh of grassBatches)updateGrassVisibility(mesh);
      if(extraGrassDensity>0)updateDenseGrass(position);
      for(const {near,far,anchors,fadeStart,fadeEnd} of detailGroups){
        // Skip a detail level when every instance anchor lies outside its fade range.
        const {min,max}=anchors,{x,y,z}=position;
        const dx=Math.max(Math.abs(x-min.x),Math.abs(x-max.x));
        const dy=Math.max(Math.abs(y-min.y),Math.abs(y-max.y));
        const dz=Math.max(Math.abs(z-min.z),Math.abs(z-max.z));
        const showNear=anchors.distanceToPoint(position)<fadeEnd;
        const showFar=dx*dx+dy*dy+dz*dz>fadeStart*fadeStart;
        for(const mesh of near)mesh.visible=showNear;
        for(const mesh of far)mesh.visible=showFar;
      }
    }
    function updateGrassVisibility(mesh){
      const {center,radius}=mesh.geometry.boundingSphere;
      mesh.visible=mesh.count>0 && center.distanceToSquared(detailEye.value)<(coverRange+radius)**2;
    }
    function makeDenseTile(tile){
      let seed=tile.seed;
      function scatter(){
        seed=(Math.imul(seed,1664525)+1013904223)>>>0;
        return seed/4294967296;
      }
      const clearRock=rockClearance.get(tile.side);
      tile.meshes=[];
      for(const [source,anchors] of tile.anchors){
        const geometry=source.clone();
        const sphere=tile.bounds.getBoundingSphere(new T.Sphere());
        sphere.radius+=1.4;
        geometry.boundingSphere=sphere;
        const mesh=new T.InstancedMesh(geometry,denseGrassMaterial,anchors.length/4*extraGrassLayers);
        mesh.name='Dense river grass';
        mesh.frustumCulled=true;
        let count=0;
        for(let layer=0;layer<extraGrassLayers;layer++){
          for(let i=0;i<anchors.length;i+=4){
            const baseX=anchors[i],baseZ=anchors[i+1],width=anchors[i+2],height=anchors[i+3];
            for(let attempt=0;attempt<4;attempt++){
              const angle=scatter()*Math.PI*2,reach=.10+scatter()*.30;
              const x=baseX+Math.cos(angle)*reach,z=baseZ+Math.sin(angle)*reach;
              const offset=(x-bankX(z,tile.side))*tile.side;
              if(offset<.35 || !clearRock(x,z))continue;
              const y=shore.ground(z,tile.side,offset)-.034;
              const spread=width*(.70+scatter()*.47),lift=height*(.77+scatter()*.45);
              if(place(source,x,y,z,spread,lift,spread,scatter()*Math.PI*2,0,matrix=>{
                mesh.setMatrixAt(count++,matrix);
              }))break;
            }
          }
        }
        tile.meshes.push({mesh,count});
        scene.add(reflected(mesh));
      }
      activeGrassTiles.add(tile);
    }
    function releaseDenseTile(tile){
      for(const {mesh} of tile.meshes){
        scene.remove(mesh);
        mesh.geometry.dispose();
        mesh.dispose();
      }
      tile.meshes=null;
      activeGrassTiles.delete(tile);
    }
    function updateDenseGrass(position){
      let closest=null,distance=denseRange+.8;
      for(const tile of grassTiles.values()){
        if(tile.meshes)continue;
        const reach=tile.bounds.distanceToPoint(position);
        if(reach<distance){closest=tile;distance=reach}
      }
      // Build one nearby tile per frame so dragging to an extreme density stays responsive.
      if(closest)makeDenseTile(closest);
      for(const tile of activeGrassTiles){
        const reach=tile.bounds.distanceToPoint(position);
        if(reach>denseRange+10){releaseDenseTile(tile);continue}
        for(const {mesh,count} of tile.meshes){
          mesh.count=Math.round(count*extraGrassDensity);
          mesh.visible=mesh.count>0 && reach<denseRange+.8;
        }
      }
    }
    function setGrassDensity(percent){
      const base=Math.min(percent/baseGrassDensity,1);
      extraGrassDensity=Math.max(0,percent/baseGrassDensity-1)/extraGrassLayers;
      for(const mesh of grassBatches){
        mesh.count=Math.round(mesh.instanceMatrix.count*base);
        updateGrassVisibility(mesh);
      }
      if(!extraGrassDensity)for(const tile of activeGrassTiles)releaseDenseTile(tile);
    }
    return {updateDetail,setGrassDensity};
  }

  return {center,bankX,channelBounds,clearLanternFlight,waterShader,wetBandShader,mistShader,parallaxShader,create,landscape};
})();
