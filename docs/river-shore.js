// Scenery shared by the riverbank geometry, lanterns, and water shader.
const riverShore = (() => {
  const firstZ=-272,lastZ=114,halfWidth=64;
  const offsets=[-2.7,-.86,0,.30,.66,1.1,1.8,2.65,3.65,4.9,6.4,8.4,11,16.6,25.2,39];
  const rows=Math.ceil((lastZ-firstZ)/.93),rowDepth=(lastZ-firstZ)/rows;
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
  const waterShader=`
    uniform sampler2D riverBankProfile;
    float shoreDistance(vec2 p){
      float row=(p.y-(${firstZ.toFixed(1)}))/${rowDepth.toFixed(8)};
      vec4 profile=texture2D(riverBankProfile,vec2((row+.5)/${(rows+1).toFixed(1)},.5));
      vec2 banks=(profile.rb*256.+profile.ga)/257.*${(halfWidth*2).toFixed(1)}-${halfWidth.toFixed(1)};
      return min(p.x-banks.x,banks.y-p.x);
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

  function create(T,waterLevel,random){
    // The water and terrain use the same bank samples, including the coves around decks.
    const bankSamples=new Uint8Array((rows+1)*4);
    for(let row=0;row<=rows;row++){
      const z=firstZ+row*rowDepth;
      for(const side of [-1,1]){
        const packed=Math.round((bankX(z,side)+halfWidth)*65535/(2*halfWidth));
        const index=row*4+side+1;
        bankSamples[index]=packed>>8;
        bankSamples[index+1]=packed&255;
      }
    }
    const profile=new T.DataTexture(bankSamples,rows+1,1,T.RGBAFormat);
    profile.minFilter=profile.magFilter=T.LinearFilter;
    profile.needsUpdate=true;
    const lanterns=[];
    const lanternDrift=new T.Vector3(.32,.22,.27);
    const glowCanvas=document.createElement('canvas');
    glowCanvas.width=256;glowCanvas.height=1024;
    const ctx=glowCanvas.getContext('2d');
    ctx.scale(glowCanvas.width/(2*halfWidth),glowCanvas.height/(lastZ-firstZ));
    ctx.translate(halfWidth,-firstZ);
    ctx.globalCompositeOperation='lighter';

    function height(z,side,offset){
      const slope=.35*Math.min(offset,3.5)+.103*Math.max(0,offset-3.5);
      const relief=.33*Math.sin(z*.21+side+offset*.58)
        +.20*Math.cos(z*.70-offset*.80+side)+.12*Math.sin(z*1.14+offset*1.57);
      const shelf=T.MathUtils.smoothstep(offset,.18,1.7)*(1-T.MathUtils.smoothstep(offset,2.6,6.5));
      const roots=.19*Math.sin(z*1.58-offset*2.06)+.105*Math.cos(z*2.13+offset*1.49+side);
      return waterLevel+slope+Math.min(1,Math.max(0,offset)*.42)*relief
             +shelf*(.14+.20*Math.sin(z*.58+side)+roots);
    }
    function ground(z,side,offset){
      // Match the triangles of the visible terrain so roots and stones sit on it.
      const row=T.MathUtils.clamp((z-firstZ)/rowDepth,0,rows);
      const lower=Math.min(rows-1,Math.floor(row)),t=row-lower;
      const z0=firstZ+lower*rowDepth,z1=z0+rowDepth;
      const bank=T.MathUtils.lerp(bankX(z0,side),bankX(z1,side),t);
      const across=T.MathUtils.clamp(offset+side*(bankX(z,side)-bank),offsets[0],offsets[offsets.length-1]);
      const col=Math.max(0,offsets.findIndex(value=>value>=across)-1);
      const from=offsets[col],to=offsets[col+1],u=(across-from)/(to-from);
      const b=height(z0,side,to),c=height(z1,side,from);
      if(t+u<=1)return (1-t-u)*height(z0,side,from)+u*b+t*c;
      return (1-t)*b+(1-u)*c+(t+u-1)*height(z1,side,to);
    }

    for(const side of [-1,1]){
      for(let z=firstZ+4;z<lastZ-4;z+=4.8+random()*7.3){
        const count=2+Math.floor(random()*3);
        for(let i=0;i<count;i++){
          const pos=z+(random()-.5)*3.6,offset=.68+random()*2.35;
          const x=bankX(pos,side)+side*offset;
          const lift=.34+random()*.63;
          const size=.55+random()*.32;
          const shellReach=size*.34+.04;
          const reachX=shellReach+lanternDrift.x,reachZ=shellReach+lanternDrift.z;
          if(!clearDecks(x,pos,Math.hypot(reachX,reachZ)))continue;
          let y=ground(pos,side,offset)+lift;
          for(let zStep=-2;zStep<=2;zStep++){
            const sampleZ=pos+zStep*reachZ/2;
            const sampleOffset=(x-bankX(sampleZ,side))*side;
            for(const dx of [-reachX,0,reachX]){
              y=Math.max(y,ground(sampleZ,side,sampleOffset+dx)+lanternDrift.y+.15);
            }
          }
          const bounds=new T.Box3(
            new T.Vector3(x-reachX,y-lanternDrift.y-.04,pos-reachZ),
            new T.Vector3(x+reachX,y+lanternDrift.y+.70*size+.04,pos+reachZ)
          );
          if(lanterns.some(lamp=>lamp.bounds.intersectsBox(bounds)))continue;
          lanterns.push({x,y,z:pos,size,bounds});
          const radius=1.54+lift*.83+size*.25;
          const glow=ctx.createRadialGradient(x,pos,0,x,pos,radius);
          glow.addColorStop(0,'rgba(255,255,255,.68)');
          glow.addColorStop(.40,'rgba(255,255,255,.32)');
          glow.addColorStop(1,'rgba(255,255,255,0)');
          ctx.fillStyle=glow;ctx.fillRect(x-radius,pos-radius,2*radius,2*radius);
        }
      }
    }
    return {ground,height,lanterns,lanternDrift,profile,glow:new T.CanvasTexture(glowCanvas)};
  }

  function plantBuilder(T){
    const positions=[],tints=[];
    return {
      face(a,b,c,base,tip=base,end=base){
        positions.push(...a,...b,...c);
        for(const shade of [base,tip,end])tints.push(shade*.92,shade,shade*.93);
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

  function pineBoughs(T,random){
    const near=plantBuilder(T),far=plantBuilder(T);
    const tiers=9+Math.floor(random()*3),lowest=.17+random()*.11;
    const lean=(random()-.5)*.092;
    for(let tier=0;tier<tiers;tier++){
      const level=tier/tiers;
      const stem=lowest+(1-lowest)*level;
      const spread=.52*Math.pow(1-level,1.18)*(.74+.43*random());
      const phase=random()*Math.PI*2;
      const branches=4+Math.floor(random()*(level>.70?2:4));
      for(let b=0;b<branches;b++){
        const angle=phase+(b+(random()-.5)*.69)*Math.PI*2/branches;
        const x=Math.cos(angle),z=Math.sin(angle);
        const reach=spread*(.56+.49*random()),y=stem+(random()-.5)*.086;
        const droop=.018+random()*.052;
        const point=(out,across,height)=>[reach*(x*out-z*across)+lean*level,y+height,reach*(z*out+x*across)];
        const root=point(0,0,.003),ridge=point(.37,0,.026),tip=point(1.04,0,-droop);
        const light=.66+.31*random();
        near.face(root,point(.43,-.065,.002),ridge,light*.51);
        near.face(root,ridge,point(.43,.065,.002),light*.51);
        for(const k of [-1,1]){
          const shoulder=point(.46,k*(.35+random()*.12),-.020);
          const tiplet=point(.84,k*(.20+random()*.18),-droop*.67);
          far.face(root,shoulder,ridge,light*.78,light,light);
          far.face(shoulder,tiplet,ridge,light,light*.90,light);
          far.face(tiplet,tip,ridge,light*.9,light,light);
          near.face(root,point(.54,k*.24,-.016),ridge,light*.58,light*.87,light);
          near.face(ridge,point(.62,k*.13,-.017),tip,light*.84,light,light*.85);
          for(let j=0;j<4;j++){
            const along=.32+j*.142+(random()-.5)*.06;
            const width=.25*(1-j*.145)*(.74+random()*.59);
            const sprig=point(along+.24,k*width,-droop*(.53+j*.083));
            const base=point(along-.10,k*.065,-droop*.20),inner=point(along+.12,k*.036,-droop*.46);
            const side=point(along+.055,k*(width*.84),-droop*.30+.016);
            near.face(base,side,sprig,light*.65,light,light*.95);
            near.face(base,sprig,inner,light*.65,light*.95,light*.78);
          }
        }
      }
    }
    const peakedTip=[lean,1,-.005],peakBase=[[lean+.035,.87,.019],[lean-.03,.88,.021],[lean,.87,-.038]];
    for(let i=0;i<3;i++){
      near.face(peakBase[i],peakedTip,peakBase[(i+1)%3],.77);
      far.face(peakBase[i],peakedTip,peakBase[(i+1)%3],.77);
    }
    return {near:near.geometry(),far:far.geometry()};
  }

  function tuft(T,random,blades,seedHeads,widthScale=1){
    const plant=plantBuilder(T),triangle=plant.face;
    for(let i=0;i<blades;i++){
      const angle=random()*Math.PI*2,dx=Math.cos(angle),dz=Math.sin(angle);
      const height=.47+.53*random(),lean=.20+random()*.56,width=(.025+random()*.046)*widthScale;
      const root=random()*.25;
      const point=(t,w)=>[dx*(root+lean*t*t)-dz*w,height*t,dz*(root+lean*t*t)+dx*w];
      const a=point(0,-width*.60),b=point(0,width*.60);
      const c=point(.58,-width),d=point(.58,width),tip=point(1,0);
      triangle(a,b,c,.44,.44,.74);
      triangle(b,d,c,.44,.78,.74);
      triangle(c,d,tip,.74,.78,1);
    }
    for(let i=0;i<seedHeads;i++){
      const x=(random()-.5)*.68,z=(random()-.5)*.68,height=.86+random()*.24;
      for(const [dx,dz] of [[1,0],[0,1]]){
        triangle([x-.013*dx,0,z-.013*dz],[x+.013*dx,0,z+.013*dz],[x,height,z],.48,.48,.68);
        const left=[x-.025*dx,height-.08,z-.025*dz],right=[x+.025*dx,height-.08,z+.025*dz];
        triangle(left,right,[x,height+.075,z],.46,.46,.61);
        triangle(left,[x,height-.18,z],right,.46,.45,.46);
      }
    }
    return plant.geometry();
  }

  function fern(T,random){
    const plant=plantBuilder(T);
    for(let i=0;i<6;i++){
      const angle=(i+(random()-.5)*.52)*Math.PI/3;
      const dx=Math.cos(angle),dz=Math.sin(angle);
      const stretch=.55+random()*.38,rise=.41+random()*.46;
      const point=(t,u,h=0)=>[dx*stretch*t-dz*u,rise*(1.68*t-.95*t*t)+h,dz*stretch*t+dx*u];
      for(let j=0;j<7;j++){
        const t=j/7,top=(j+1)/7;
        plant.face(point(t,0),point(top,0),point(t,.013),.47,.74,.72);
        if(j===0)continue;
        const reach=(.067+.105*Math.sin(Math.PI*t))*(1-.32*t);
        for(const side of [-1,1]){
          const root=point(t,0),tip=point(t+.18,reach*side,-.045);
          const inner=point(t+.043,reach*.48*side,.015),outer=point(t+.123,reach*.43*side,.012);
          plant.face(root,inner,tip,.58,.86,.72);
          plant.face(root,tip,outer,.58,.72,.88);
        }
      }
    }
    return plant.geometry();
  }

  function foliageCards(T){
    const positions=[],uvs=[],colors=[];
    return {
      add(tile,point,light,steps=1){
        // Each tile has transparent padding at its edges for mipmaps.
        const width=.5,left=tile%2*width,top=1-Math.floor(tile/2)*width;
        const lanes=steps>1?2:1;
        for(let i=0;i<steps;i++)for(let j=0;j<lanes;j++){
          const a=i/steps,b=(i+1)/steps,c=j/lanes,d=(j+1)/lanes;
          for(const [u,v] of [[a,c],[b,c],[b,d],[a,c],[b,d],[a,d]]){
            positions.push(...point(u,v));
            uvs.push(left+u*width,top-(1-v)*width);
            const shade=light*(.80+.20*u);
            colors.push(shade,shade,shade);
          }
        }
      },
      geometry(){
        const geometry=new T.BufferGeometry();
        geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));
        geometry.setAttribute('uv',new T.Float32BufferAttribute(uvs,2));
        geometry.setAttribute('color',new T.Float32BufferAttribute(colors,3));
        geometry.computeVertexNormals();
        return geometry;
      }
    };
  }

  function paintedPines(T,random){
    const near=foliageCards(T),far=foliageCards(T);
    const tiers=9+Math.floor(random()*3),lowest=.17+random()*.11;
    const drift=(random()-.5)*.09;
    for(let tier=0;tier<tiers;tier++){
      const level=tier/tiers,spin=random()*Math.PI*2;
      const spread=.51*Math.pow(1-level,1.13)*(.89+.20*random());
      const branches=level>.64?4:6;
      for(let i=0;i<branches;i++){
        const azimuth=spin+(i+(random()-.5)*.58)*Math.PI*2/branches;
        const x=Math.cos(azimuth),z=Math.sin(azimuth);
        const reach=spread*(.72+.40*random()),radius=reach*(.36+.13*random());
        const rise=lowest+(1-lowest)*level+(random()-.5)*.067;
        const fall=(.031+random()*.036)*(1-.62*level);
        const tile=(i+tier)%2,shade=.68+.31*random();
        function bough(tilt,spreadAngle=0,scale=1,attach=0){
          const dx=Math.cos(azimuth+spreadAngle),dz=Math.sin(azimuth+spreadAngle);
          return (u,v)=>{
            const t=u*1.10-.055,k=v*2-1;
            const across=radius*scale*Math.cos(tilt)*k*(1-.28*u);
            const up=radius*scale*Math.sin(tilt)*k*.72;
            const camber=Math.sin(Math.PI*u)*(.016+.012*(1-k*k));
            return [
              drift*level+x*reach*attach+dx*reach*t*scale-dz*across,
              rise-fall*(t*t*scale+attach)+up+camber,
              z*reach*attach+dz*reach*t*scale+dx*across
            ];
          };
        }
        const angle=(i%2?-1:1)*(.39+.27*random());
        const main=bough(angle);
        near.add(tile,main,shade,3);
        far.add(tile,main,shade);
        const side=i%2?1:-1;
        near.add(1-tile,bough(angle+side*.82,side*.54,.64,.25),shade*.86,2);
        near.add(tile,bough(angle-side*.62,-side*.43,.52,.36),shade*.88,2);
      }
    }
    // Several upright sprigs close the crown without a solid cone.
    for(const angle of [0,Math.PI/3,2*Math.PI/3]){
      const x=Math.cos(angle)*.064,z=Math.sin(angle)*.064;
      const crown=(u,v)=>[drift+(2*v-1)*x*(1-u*.58),.855+.137*u,(2*v-1)*z*(1-u*.58)];
      near.add(1,crown,.75);far.add(1,crown,.75);
    }
    return {near:near.geometry(),far:far.geometry()};
  }

  function paintedUnderstory(T,tile,lean,width=1){
    const cards=foliageCards(T);
    for(let i=0;i<3;i++){
      const angle=i*Math.PI/3;
      const x=Math.cos(angle)*width*.52,z=Math.sin(angle)*width*.52;
      const overhang=lean*(i===1?-1:1);
      cards.add(tile,(u,v)=>{
        const spread=u*2-1,bend=overhang*v*v;
        return [spread*x+z*bend,v-.095-.068*spread*spread*v,spread*z-x*bend];
      },1-i*.11,2);
    }
    return cards.geometry();
  }

  function shoreRock(T,variant){
    const rock=new T.IcosahedronGeometry(.5,variant===1?3:2);
    const vertices=rock.attributes.position;
    const tonedNormals=new Map(),vertexKeys=[];
    for(let i=0;i<vertices.count;i++){
      const x=vertices.getX(i),y=vertices.getY(i),z=vertices.getZ(i);
      const seam=y+.12*x-.10*z;
      const weathering=.07*Math.sin(x*13.8+z*8.9+variant)+.045*Math.cos(z*15.1-y*9.7-variant);
      const shelf=variant===1?.015:.043;
      const band=shelf*Math.tanh(13*(seam+.14))-shelf*.86*Math.tanh(18*(seam-.115));
      const width=1+weathering+band*2;
      const crown=variant===1?.42:.29;
      vertexKeys.push([x,y,z].map(value=>Math.round(value*10000)).join(','));
      vertices.setXYZ(i,x*width+y*.091,Math.min(crown+.056*Math.sin(z*5+x*3),y*.91+band),z*width-x*.08);
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
      face.fromBufferAttribute(normals,i).lerp(smooth,.82).normalize();
      normals.setXYZ(i,face.x,face.y,face.z);
    }
    return rock;
  }

  function landscape(T,{scene,batch,reflected,color,painted,addRiverMist,shore,waterLevel,random,slate,wood,foliage,paintedStone,forestFloor,time,moonDirection,horizonColors,horizonShader}){
    const litHeight=waterLevel.toFixed(2);
    const lightMapOffset=(halfWidth*2).toFixed(1);
    const lightMapLength=(lastZ-firstZ).toFixed(1);
    const contactCanvas=document.createElement('canvas');
    contactCanvas.width=256;contactCanvas.height=1024;
    const contact=contactCanvas.getContext('2d');
    contact.scale(contactCanvas.width/(halfWidth*2),contactCanvas.height/(lastZ-firstZ));
    contact.translate(halfWidth,-firstZ);
    const groundContacts=new T.CanvasTexture(contactCanvas);
    function darkenGround(x,z,radius){
      const falloff=contact.createRadialGradient(x,z,0,x,z,radius);
      falloff.addColorStop(0,'rgba(0,0,0,.68)');
      falloff.addColorStop(.43,'rgba(0,0,0,.36)');
      falloff.addColorStop(1,'rgba(0,0,0,0)');
      contact.fillStyle=falloff;
      contact.fillRect(x-radius,z-radius,radius*2,radius*2);
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
    if(foliage){
      foliage.encoding=T.sRGBEncoding;
      foliage.anisotropy=4;
    }
    for(const paint of [paintedStone,forestFloor].filter(Boolean)){
      paint.wrapS=paint.wrapT=T.MirroredRepeatWrapping;
      paint.anisotropy=4;
    }
    function surface(tint,{vertexColors=false,twoSided=false,ground=false,rock=false,rim=false,bark=false,cards=false}={}){
      const material=new T.MeshStandardMaterial({
        color:color(tint),roughness:twoSided?.72:.86,vertexColors,side:twoSided?T.DoubleSide:T.FrontSide,
        map:cards?foliage:null,alphaTest:cards?.39:0
      });
      material.customProgramCacheKey=()=>ground?'river-ground':rock?'river-rock':rim?'river-needles':bark?'river-bark':'river-understory';
      material.onBeforeCompile=shader=>{
        addRiverMist(shader);
        const pigment=ground?forestFloor||paintedStone:rock?paintedStone:null;
        shader.uniforms.shoreSpill={value:shore.glow};
        shader.uniforms.shoreGrain={value:bark&&wood?wood:texture};
        if(pigment)shader.uniforms.shorePaint={value:pigment};
        if(ground)shader.uniforms.groundContacts={value:groundContacts};
        shader.uniforms.shoreTime=time;
        shader.uniforms.shoreMoon=moonDirection;
        if(bark)shader.vertexShader='varying vec2 barkUV;\n'+shader.vertexShader.replace(
          '#include <begin_vertex>','#include <begin_vertex>\n barkUV=uv;');
        const barkCoordinate=bark?'varying vec2 barkUV;\n':'';
        shader.fragmentShader=barkCoordinate+'uniform sampler2D shoreSpill,shoreGrain;\n'
          +(pigment?'uniform sampler2D shorePaint;\n':'')
          +(ground?'uniform sampler2D groundContacts;\n':'')
          +'uniform float shoreTime; uniform vec3 shoreMoon;\n'+shader.fragmentShader.replace(
          '#include <lights_fragment_maps>',`
          #include <lights_fragment_maps>
          vec2 spillUV=vec2((riverSurface.x+${halfWidth.toFixed(1)})/${lightMapOffset},
                            1.-(riverSurface.z-(${firstZ.toFixed(1)}))/${lightMapLength});
          float spill=texture2D(shoreSpill,spillUV).a;
          float bankLight=spill*(1.-smoothstep(.65,2.6,riverSurface.y));
          if(bankLight>.004){
            // The light mask also points toward each cluster for the wet stone highlights.
            float east=texture2D(shoreSpill,spillUV+vec2(.44/${lightMapOffset},0.)).a;
            float south=texture2D(shoreSpill,spillUV-vec2(0.,.44/${lightMapLength})).a;
            vec3 toLamp=normalize(vec3((east-spill)*3.4,.35,(south-spill)*3.4));
            float flame=.94+.042*sin(shoreTime*2.6+floor(riverSurface.z*.25)*1.69)
                            +.018*sin(shoreTime*5.0+riverSurface.x);
            directLight.direction=mat3(viewMatrix)*toLamp;
            directLight.color=vec3(4.15,1.66,.61)*bankLight*flame;
            directLight.visible=true;
            RE_Direct(directLight,geometry,material,reflectedLight);
            irradiance+=vec3(.67,.28,.11)*bankLight*flame;
            ${twoSided?`
            float scatter=1.-abs(dot(geometry.normal,directLight.direction));
            irradiance+=vec3(.64,.22,.064)*scatter*scatter*bankLight*flame;`:''}
          }
          ${rim?`
          vec3 facing=inverseTransformDirection(geometry.normal,viewMatrix);
          float edge=pow(1.-max(0.,dot(geometry.normal,geometry.viewDir)),2.);
          float lightFacing=smoothstep(-.40,.93,dot(facing,shoreMoon));
          irradiance+=vec3(.21,.34,.49)*edge*lightFacing;`:''}
          ${ground?`
          float contactShade=texture2D(groundContacts,spillUV).a;
          irradiance*=1.-.81*contactShade;
          reflectedLight.directDiffuse*=1.-.39*contactShade;
          reflectedLight.directSpecular*=1.-.48*contactShade;`:''}
        `);
        if(ground || rock || bark)shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`
          #include <color_fragment>
          vec2 terrainUV=${bark?'barkUV*vec2(6.,1.72)':'riverSurface.xz+riverSurface.y*vec2(.38,.56)'};
          vec3 grain=texture2D(shoreGrain,terrainUV*.78).rgb;
          float mineral=texture2D(shoreGrain,terrainUV*.188).g;
          float wet=1.-smoothstep(.022,.59,riverSurface.y-(${litHeight})+(grain.r-.5)*.30);
          float moss=smoothstep(.42,.71,mineral+.15*(grain.r-.5))*(1.-wet*.64);
          diffuseColor.rgb*=mix(.64,1.46,smoothstep(.12,.79,mineral))*mix(.74,1.24,smoothstep(.12,.83,grain.b));
          diffuseColor.rgb*=mix(vec3(1.),vec3(.65,1.11,.63),moss*.43)*mix(vec3(1.),vec3(.45,.50,.53),wet);
          ${pigment?`
          ${rock?`
          vec3 axes=abs(inverseTransformDirection(normalize(vNormal),viewMatrix));
          vec3 weights=pow(axes,vec3(4.));
          weights/=max(.001,weights.x+weights.y+weights.z);
          vec3 stoneUV=riverSurface*.84;
          vec3 brush=texture2D(shorePaint,stoneUV.zy).rgb*weights.x
                   +texture2D(shorePaint,stoneUV.xz).rgb*weights.y
                   +texture2D(shorePaint,stoneUV.xy).rgb*weights.z;
          float paintGrain=dot(brush,vec3(.30,.55,.15));
          float lichen=smoothstep(.012,.072,brush.g-brush.b)*(1.-wet*.80);
          diffuseColor.rgb*=mix(vec3(.58),vec3(1.56),smoothstep(.13,.55,paintGrain))
                           *mix(vec3(1.),vec3(.77,1.03,.56),lichen*.72);`:`
          vec3 brush=texture2D(shorePaint,terrainUV*.67).rgb;
          float paintGrain=dot(brush,vec3(.30,.55,.15));
          diffuseColor.rgb*=clamp(.45+(brush-.13)*2.65,.47,1.63);`}`:`
          float paintGrain=.46;`}
          ${ground?`
          float litter=texture2D(shoreGrain,terrainUV*.283+vec2(.33,.76)).b;
          diffuseColor.rgb*=mix(vec3(.83,1.04,.77),vec3(1.41,1.14,.87),smoothstep(.24,.73,litter));`:''}
        `).replace('#include <roughnessmap_fragment>',`
          #include <roughnessmap_fragment>
          roughnessFactor=clamp(roughnessFactor+.24*(grain.g-.5)-wet*${rock?'.54':'.23'},${rock?'.25':'.51'},.98);
        `).replace('#include <normal_fragment_maps>',`
          #include <normal_fragment_maps>
          vec3 dx=dFdx(-vViewPosition),dy=dFdy(-vViewPosition);
          vec3 tx=cross(dy,normal),ty=cross(normal,dx);
          float det=dot(dx,tx),height=${bark?'.012*grain.r+.012*mineral':'.007*grain.r+.023*mineral+.014*paintGrain'};
          vec3 slope=sign(det)*(tx*dFdx(height)+ty*dFdy(height));
          normal=normalize(max(abs(det),1e-7)*normal-slope);
        `);
        if(twoSided && !cards)shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`
          #include <color_fragment>
          float textureGrain=texture2D(shoreGrain,riverSurface.xz*1.7+riverSurface.y*vec2(.64,.91)).r;
          diffuseColor.rgb*=mix(.73,1.35,smoothstep(.11,.73,textureGrain));
        `);
      };
      return material;
    }

    const earth=surface('#ffffff',{vertexColors:true,ground:true});
    for(const side of [-1,1]){
      const positions=[],tints=[],index=[];
      const soil=color('#645144'),grass=color('#48523d'),silt=color('#514943'),upland=color('#454b3e');
      for(let row=0;row<=rows;row++){
        const z=firstZ+row*rowDepth;
        const bank=bankX(z,side);
        offsets.forEach((offset,i)=>{
          positions.push(bank+side*offset,shore.height(z,side,offset),z);
          const shade=.5+.22*Math.sin(z*.84+offset*.77)+.19*Math.sin(z*1.91-offset*.69);
          const tint=soil.clone().lerp(grass,shade).lerp(silt,T.MathUtils.clamp(1-offset*.64,0,1))
            .lerp(upland,T.MathUtils.smoothstep(offset,9,38))
            .multiplyScalar(.82+.30*random());
          tints.push(...tint.toArray());
          if(row>=rows || i===offsets.length-1)return;
          const a=row*offsets.length+i,b=a+1,c=a+offsets.length,d=c+1;
          if(side<0)index.push(a,b,c,b,d,c);else index.push(a,c,b,b,c,d);
        });
      }
      const mesh=new T.BufferGeometry();
      mesh.setIndex(index);mesh.setAttribute('position',new T.Float32BufferAttribute(positions,3));
      mesh.setAttribute('color',new T.Float32BufferAttribute(tints,3));mesh.computeVertexNormals();
      scene.add(reflected(new T.Mesh(mesh,earth)));
    }

    // Match the sky's color transform so the ridges sit in the same night haze.
    const ridgeMaterial=new T.ShaderMaterial({
      uniforms:horizonColors,side:T.DoubleSide,transparent:true,depthWrite:false,
      toneMapped:false,clipping:true,
      vertexShader:`
        #include <clipping_planes_pars_vertex>
        attribute float ridgeHeight;
        varying vec3 sightline;
        varying float crest;
        void main(){
          vec4 point=modelMatrix*vec4(position,1.);
          sightline=point.xyz-cameraPosition;
          crest=ridgeHeight;
          vec4 mvPosition=viewMatrix*point;
          gl_Position=projectionMatrix*mvPosition;
          #include <clipping_planes_vertex>
        }`,
      fragmentShader:`
        #include <clipping_planes_pars_fragment>
        ${horizonShader}
        varying vec3 sightline;
        varying float crest;
        void main(){
          #include <clipping_planes_fragment>
          float ridgeDistance=length(sightline);
          float cloudBand;
          vec3 airColor=skyAtmosphere(sightline/ridgeDistance,cloudBand);
          float contrast=mix(.19,.075,smoothstep(42.,126.,ridgeDistance))*mix(.42,1.,crest);
          float opacity=1.-smoothstep(67.,145.,ridgeDistance);
          gl_FragColor=vec4(airColor*(1.-contrast),opacity);
          #include <encodings_fragment>
        }`
    });
    for(const side of [-1,1]){
      for(let layer=0;layer<2;layer++){
        const positions=[],heights=[],index=[];
        for(let i=0;i<=195;i++){
          const z=-329+i*2.55;
          const distance=49+layer*34+7*Math.sin(z*.025+side*1.1+layer);
          const x=center(z)*.42+side*distance;
          const wave=.51+.28*Math.sin(z*.042+side+layer*1.6)+.15*Math.sin(z*.099+layer*2.8)
                        +.08*Math.sin(z*.184+side*1.26)+.035*Math.cos(z*.37);
          const height=4+layer*5+(11+layer*8)*Math.pow(Math.max(0,wave),1.3);
          positions.push(x,waterLevel,z,x,height,z);
          heights.push(0,1);
          if(i<195){const a=i*2;index.push(a,a+1,a+2,a+1,a+3,a+2)}
        }
        const mesh=new T.BufferGeometry();
        mesh.setIndex(index);mesh.setAttribute('position',new T.Float32BufferAttribute(positions,3));
        mesh.setAttribute('ridgeHeight',new T.Float32BufferAttribute(heights,1));
        const ridge=reflected(new T.Mesh(mesh,ridgeMaterial));
        ridge.renderOrder=-2-layer;
        scene.add(ridge);
      }
    }

    const pineShapes=Array.from({length:3},()=>foliage?paintedPines(T,random):pineBoughs(T,random));
    const needles=(foliage?['#d0e3d9','#b8d6cd','#d7e2cd']:['#385047','#2b453d','#354a41']).map(tint=>surface(tint,{
      vertexColors:true,twoSided:true,rim:true,cards:Boolean(foliage)
    }));
    const trunk=new T.CylinderGeometry(.28,.49,1,7);
    const bark=surface('#645244',{bark:true});
    const stoneShapes=Array.from({length:3},(_,i)=>shoreRock(T,i));
    const stones=['#72736a','#777a75','#797267'].map(tint=>surface(tint,{rock:true}));
    const reeds=foliage?paintedUnderstory(T,3,.53):tuft(T,random,12,4);
    const rushes=foliage?paintedUnderstory(T,3,.69,.92):tuft(T,random,18,0);
    const scrub=foliage?paintedUnderstory(T,2,.81,1.22):tuft(T,random,22,0,1.45);
    const fronds=foliage?paintedUnderstory(T,2,.42,1.36):fern(T,random);
    const floorCover=foliage?paintedUnderstory(T,3,.31,1.05):tuft(T,random,13,0,.76);
    const leafFinish={vertexColors:true,twoSided:true,cards:Boolean(foliage)};
    const grass=surface(foliage?'#cccca5':'#4b5640',leafFinish);
    const sedge=surface(foliage?'#d8d59e':'#596747',leafFinish);
    const bushes=surface(foliage?'#c0dfaf':'#4e6246',leafFinish);
    const sprouts=surface(foliage?'#c0c992':'#4c5838',leafFinish);
    const placement=new T.Object3D(),bounds=new T.Box3();
    function place(geometry,material,x,y,z,width,height,depth,spin,tilt=0){
      if(!geometry.boundingBox)geometry.computeBoundingBox();
      placement.position.set(x,y,z);
      placement.scale.set(width,height,depth);
      placement.rotation.set(0,spin,tilt,'YXZ');
      placement.updateMatrix();
      bounds.copy(geometry.boundingBox).applyMatrix4(placement.matrix);
      const radius=Math.hypot(Math.max(x-bounds.min.x,bounds.max.x-x),Math.max(z-bounds.min.z,bounds.max.z-z));
      if(!clearDecks(x,z,radius+.10) || shore.lanterns.some(lamp=>lamp.bounds.intersectsBox(bounds)))return false;
      batch(geometry,material,x,y,z,width,height,depth,spin,tilt);
      return true;
    }
    function fallenWood(a,b,width){
      const [dx,dy,dz]=b.map((value,i)=>value-a[i]);
      const length=Math.hypot(dx,dy,dz);
      return place(trunk,bark,(a[0]+b[0])*.5,(a[1]+b[1])*.5,(a[2]+b[2])*.5,
        width,length,width,Math.atan2(dz,-dx),Math.atan2(Math.hypot(dx,dz),dy));
    }
    for(const side of [-1,1]){
      for(let z=firstZ+3;z<lastZ-3;z+=5+random()*9){
        const count=4+Math.floor(random()*9);
        const depth=4+random()*13;
        for(let i=0;i<count;i++){
          const pos=z+(random()-.5)*9,offset=depth+(random()-.5)*6.2;
          const x=bankX(pos,side)+side*offset;
          const height=2.6+random()**.85*8.2;
          const width=height*(.31+random()*.23),spin=random()*Math.PI*2,tilt=(random()-.5)*.17;
          const base=shore.ground(pos,side,offset)-.13;
          const trunkRun=height*.84, trunkRadius=height*(.029+random()*.014);
          const n=i%3;
          const detail=offset<9.3 && pos>firstZ+37 && pos<37;
          const canopy=detail?pineShapes[n].near:pineShapes[n].far;
          if(!place(canopy,needles[n],x,base,pos,width,height,width*(.77+random()*.41),spin,tilt))continue;
          place(trunk,bark,x-Math.cos(spin)*Math.sin(tilt)*trunkRun/2,
            base+Math.cos(tilt)*trunkRun/2,pos+Math.sin(spin)*Math.sin(tilt)*trunkRun/2,
            trunkRadius,trunkRun,trunkRadius,spin,tilt);
          darkenGround(x,pos,trunkRadius*.94+.22);
          if(detail && i%3===0){
            for(let root=0;root<3;root++){
              const direction=spin+root*Math.PI*2/3;
              const dx=Math.cos(direction)*(trunkRadius*1.55+.10),dz=Math.sin(direction)*(trunkRadius*1.55+.10);
              const endX=x+dx,endZ=pos+dz;
              const y=shore.ground(endZ,side,(endX-bankX(endZ,side))*side);
              fallenWood([x+dx*.16,base+.20,pos+dz*.16],[endX,y-.01,endZ],trunkRadius*.49);
            }
          }
        }
      }
      const patches=[],rocks=[];
      for(let z=firstZ+2;z<lastZ-2;z+=2.5+random()*4.2){
        patches.push(z);
        const count=4+Math.floor(random()*5), ledges=random()<.58;
        const bearing=Math.atan2(-1,bankX(z+.5,side)-bankX(z-.5,side));
        for(let i=0;i<count;i++){
          const pos=z+(random()-.5)*3.9,offset=-.67+random()*2.4;
          const x=bankX(pos,side)+side*offset;
          const size=i===0?.83+random()*.71:.15+1.02*random()**1.72;
          const y=shore.ground(pos,side,offset)+size*.062;
          const n=ledges && i<3?i%2*2:i%3;
          const w=size*(n===1?.92+random()*.31:1.32+random()*.37);
          const h=size*(n===1?.69+random()*.37:.37+random()*.27);
          const d=size*(.70+random()*.37),angle=bearing+(random()-.5)*1.10;
          if(place(stoneShapes[n],stones[n],x,y,pos,w,h,d,angle,(random()-.5)*.24)){
            rocks.push({x,z:pos,radius:Math.max(w,d)*.52});
            darkenGround(x,pos,Math.max(w,d)*.64+.19);
            if(i===0 && ledges){
              const chipZ=pos+.28*d,chipOffset=offset-.20*w;
              const chipX=bankX(chipZ,side)+side*chipOffset;
              const chipY=shore.ground(chipZ,side,chipOffset)+h*.06;
              place(stoneShapes[2],stones[2],chipX,chipY,chipZ,w*.79,h*.68,d*.76,angle+.16);
            }
          }
        }
      }
      const clearRock=(x,pos)=>!rocks.some(rock=>Math.abs(rock.z-pos)<rock.radius+.12
        && Math.hypot(rock.x-x,rock.z-pos)<rock.radius+.12);
      for(const z of patches){
        const count=9+Math.floor(random()*6),shelf=2.6+random()*2.7;
        for(let i=0;i<count;i++){
          const near=i<count*.53;
          const pos=z+(random()-.5)*(near?4.2:5.7);
          const offset=near?-.31+random()*2.5:shelf+(random()-.5)*5.1;
          const x=bankX(pos,side)+side*offset;
          if(!clearRock(x,pos))continue;
          const isReed=offset<.80;
          const isFern=!near && random()<.54;
          const size=isReed?.48+.54*random():(isFern?.57:.25)+.50*random();
          place(near?(isReed?reeds:rushes):(isFern?fronds:scrub),near?(isReed?sedge:grass):bushes,
            x,shore.ground(pos,side,offset)-.075,pos,
            size*(1.+random()*.75),size,size,random()*Math.PI*2);
        }
        for(let i=0;i<8;i++){
          const pos=z+(random()-.5)*5.6,offset=.72+random()*5.5;
          const x=bankX(pos,side)+side*offset;
          if(!clearRock(x,pos))continue;
          const spread=.56+random()*.61;
          place(floorCover,sprouts,x,shore.ground(pos,side,offset)-.042,pos,
            spread,.13+random()*.20,spread,random()*Math.PI*2);
        }
        if(random()>.26)continue;
        const offset=1.2+random()*2.2,x=bankX(z,side)+side*offset;
        const length=.65+random()*1.75,angle=random()*Math.PI*2,width=.09+random()*.11;
        const dx=Math.cos(angle),dz=Math.sin(angle);
        const rooted=(px,pz,lift)=>[px,shore.ground(pz,side,(px-bankX(pz,side))*side)+lift,pz];
        const base=rooted(x,z,width*.14),tip=rooted(x+dx*length,z+dz*length,width*.20);
        if(!fallenWood(base,tip,width))continue;
        const knot=base.map((value,i)=>T.MathUtils.lerp(value,tip[i],.49));
        const fork=rooted(knot[0]-dz*length*.33+dx*length*.27,knot[2]+dx*length*.33+dz*length*.27,width*.61);
        fallenWood(knot,fork,width*.48);
      }
    }
  }

  return {center,bankX,channelBounds,clearLanternFlight,waterShader,mistShader,create,landscape};
})();
