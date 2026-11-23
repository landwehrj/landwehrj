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
    for(let row=0;row<terrainRows.length;row++){
      const z=terrainRows[row];
      for(const side of [-1,1]){
        const packed=Math.round((bankX(z,side)+halfWidth)*65535/(2*halfWidth));
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
        }
      }
    }
    return {ground,height,lanterns,lanternDrift,profile,lighting:bankLighting(T,lanterns,lanternDrift,waterLevel)};
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

  function shoreRock(T,variant,detail=variant===1?3:2){
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
      vertices.setXYZ(i,x*width+y*.13,Math.min(crown+.076*Math.sin(z*5+x*3),y*.94+band)-cleft,z*width-x*.14);
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
      face.lerp(smooth,(variant===1?.45:.26)+softness*.46).normalize();
      normals.setXYZ(i,face.x,face.y,face.z);
    }
    return rock;
  }

  function landscape(T,{scene,reflected,color,painted,addRiverMist,shore,waterLevel,random,slate,paintedStone,forestFloor,moonDirection,nightTime,stock,compact}){
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
    function surface(tint,{vertexColors=false,twoSided=false,ground=false,rock=false,rim=false,cards=false,rootedTree=false,wind='',finish,lodRange=0,coverRange=0}={}){
      const material=new T.MeshStandardMaterial({
        color:color(tint),roughness:twoSided?.72:rock?.78:.86,vertexColors,side:twoSided?T.DoubleSide:T.FrontSide
      });
      const shaderKey=ground?'river-ground':rock?'river-rock':rim?'river-needles':
        rootedTree?'river-pine-bark':'river-understory';
      material.customProgramCacheKey=()=>shaderKey+(wind?'-'+wind:'')+(finish?'-mapped':'')
        +(lodRange?'-lod'+lodRange:'')+(coverRange?'-cover'+coverRange:'');
      if(finish){Object.assign(material,finish);material.roughness=1}
      material.onBeforeCompile=shader=>{
        addRiverMist(shader);
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
        shader.fragmentShader=exposure+footContact+'uniform sampler2D shoreLampLookup,shoreLampSources,shoreGrain;\n'
          +(pigment?'uniform sampler2D shorePaint;\n':'')
          +(hasContact?'uniform sampler2D groundContacts;\n':'')
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
          irradiance+=vec3(.22,.30,.36)*bladeExposure;`:''}
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
          irradiance+=vec3(.22,.40,.62)*edge*lightFacing*canopyLight;`:''}
          ${hasContact?`
          vec2 contactUV=vec2((riverSurface.x+${halfWidth.toFixed(1)})/${lightMapOffset},
                            1.-(riverSurface.z-(${firstZ.toFixed(1)}))/${lightMapLength});
          float contactShade=texture2D(groundContacts,contactUV).a;
          ${!ground?`contactShade*=1.-smoothstep(${rock?'-.36,.24':rootedTree?'0.,.09':'.02,.48'},shoreLocalY);`:''}
          irradiance*=1.-.81*contactShade;
          reflectedLight.directDiffuse*=1.-${ground?'.49':'.23'}*contactShade;
          reflectedLight.directSpecular*=1.-${ground?'.48':'.28'}*contactShade;`:''}
        `);
        if(ground || rock)shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`
          #include <color_fragment>
          vec2 terrainUV=riverSurface.xz+riverSurface.y*vec2(.38,.56);
          vec3 grain=texture2D(shoreGrain,terrainUV*.78).rgb;
          float microRelief=texture2D(shoreGrain,terrainUV*3.25+vec2(.34,.81)).r;
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
          vec3 stoneUV=riverSurface*1.06;
          vec3 brush=texture2D(shorePaint,stoneUV.zy).rgb*weights.x
                   +texture2D(shorePaint,stoneUV.xz).rgb*weights.y
                   +texture2D(shorePaint,stoneUV.xy).rgb*weights.z;
          float paintGrain=dot(brush,vec3(.30,.55,.15));
          float lichen=smoothstep(.012,.068,brush.g-brush.b+.028*(mineral-.40))*(1.-wet*.76);
          lichen*=mix(.36,1.,smoothstep(.18,.76,axes.y));
          diffuseColor.rgb*=mix(vec3(.44),vec3(1.59),smoothstep(.10,.56,paintGrain))
                           *mix(vec3(1.),vec3(.76,1.16,.57),lichen*.83);`:`
          vec3 brush=texture2D(shorePaint,terrainUV*.62).rgb;
          float paintGrain=dot(brush,vec3(.30,.55,.15));
          diffuseColor.rgb*=clamp(.50+(brush-.13)*3.20,.46,1.75);`}`:`
          float paintGrain=.46;`}
          ${ground?`
          float litter=texture2D(shoreGrain,terrainUV*.283+vec2(.33,.76)).b;
          float carpet=smoothstep(.38,.72,mineral+(grain.r-.5)*.26)*(1.-wet*.75);
          diffuseColor.rgb*=mix(vec3(.85,1.01,.74),vec3(1.43,1.11,.82),smoothstep(.24,.73,litter));
          diffuseColor.rgb*=mix(vec3(1.),vec3(.65,1.12,.60),carpet*.57);`:''}
        `).replace('#include <roughnessmap_fragment>',`
          #include <roughnessmap_fragment>
          roughnessFactor=clamp(roughnessFactor+.30*(grain.g-.5)+.10*(microRelief-.5)
            -wet*${rock?'.55':'.30'}${ground?'+.13*carpet-.14*smoothstep(.28,.59,paintGrain)':''},${rock?'.24':'.44'},.98);
        `).replace('#include <normal_fragment_maps>',`
          #include <normal_fragment_maps>
          vec3 dx=dFdx(-vViewPosition),dy=dFdy(-vViewPosition);
          vec3 tx=cross(dy,normal),ty=cross(normal,dx);
          float det=dot(dx,tx),height=${ground?'.013*grain.r+.014*mineral+.034*paintGrain+.004*microRelief':
            '.013*grain.r+.018*mineral+.031*paintGrain+.006*microRelief'};
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
      const soil=color('#77604d'),grass=color('#55634a'),silt=color('#514943'),upland=color('#4a5345');
      for(let row=0;row<terrainRows.length;row++){
        const z=terrainRows[row];
        const bank=bankX(z,side);
        offsets.forEach((offset,i)=>{
          positions.push(bank+side*offset,shore.height(z,side,offset),z);
          const shade=.5+.22*Math.sin(z*.84+offset*.77)+.19*Math.sin(z*1.91-offset*.69);
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
      scene.add(reflected(new T.Mesh(mesh,earth)));
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
      const leafMaterial=surface(preset.leafTint,{twoSided:true,rim:true,cards:true,wind:'canopy',lodRange:range,
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
    const pebble=shoreRock(T,2,1);
    const stones=['#72736a','#777a75','#797267'].map(tint=>surface(tint,{rock:true}));
    let meadowSeed=74213;
    function meadowRandom(){
      meadowSeed=(Math.imul(meadowSeed,1664525)+1013904223)>>>0;
      return meadowSeed/4294967296;
    }
    const reeds=reedClump(T,meadowRandom,11,true);
    const rushes=reedClump(T,meadowRandom,9,false);
    const leafFinish={vertexColors:true,twoSided:true,wind:'grass'};
    const grass=surface('#89966b',leafFinish);
    const sedge=surface('#73875e',leafFinish);
    const litterMaterial=surface('#685744',{vertexColors:true,twoSided:true});
    const flowersMaterial=surface('#ffffff',{vertexColors:true,twoSided:true,wind:'grass'});
    let coverSeed=58147;
    function coverRandom(){
      coverSeed=(Math.imul(coverSeed,1664525)+1013904223)>>>0;
      return coverSeed/4294967296;
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
    function place(geometry,x,y,z,width,height,depth,spin,tilt,submit){
      if(!geometry.boundingBox)geometry.computeBoundingBox();
      placement.position.set(x,y,z);
      placement.scale.set(width,height,depth);
      placement.rotation.set(0,spin,tilt,'YXZ');
      placement.updateMatrix();
      bounds.copy(geometry.boundingBox).applyMatrix4(placement.matrix);
      const radius=Math.hypot(Math.max(x-bounds.min.x,bounds.max.x-x),Math.max(z-bounds.min.z,bounds.max.z-z));
      if(!clearDecks(x,z,radius+.10) || shore.lanterns.some(lamp=>lamp.bounds.intersectsBox(bounds)))return false;
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
      const rockFootprints=[],pebbles=[];
      const footprint=new T.Box3(),rockVertex=new T.Vector3();
      const floorHeight=(x,z)=>shore.ground(z,side,(x-bankX(z,side))*side);
      function placeRock(geometry,material,x,y,z,width,height,depth,spin,tilt=0){
        return place(geometry,x,y,z,width,height,depth,spin,tilt,matrix=>{
          // Measure the rotated mesh itself so irregular rocks can sit close without crossing.
          const vertices=geometry.getAttribute('position');
          footprint.makeEmpty();
          for(let i=0;i<vertices.count;i++){
            footprint.expandByPoint(rockVertex.fromBufferAttribute(vertices,i).applyMatrix4(matrix));
          }
          const gap=.025;
          if(rockFootprints.some(rock=>
            footprint.min.x<rock.max.x+gap && footprint.max.x+gap>rock.min.x &&
            footprint.min.z<rock.max.z+gap && footprint.max.z+gap>rock.min.z))return false;
          rockFootprints.push(footprint.clone());
          queueShore(side,z,geometry,[[geometry,material]],matrix,footprint);
        });
      }
      function clearRock(x,z){
        const margin=.09;
        return !rockFootprints.some(rock=>x>=rock.min.x-margin && x<=rock.max.x+margin &&
          z>=rock.min.z-margin && z<=rock.max.z+margin);
      }
      rockClearance.set(side,clearRock);
      function dropLitter(x,z){
        if(!clearDecks(x,z,.69))return;
        for(let i=0;i<9;i++){
          const px=x+(random()-.5)*.65,pz=z+(random()-.5)*.65;
          if(floorHeight(px,pz)<waterLevel+.13)continue;
          const spin=random()*Math.PI*2,dx=Math.cos(spin),dz=Math.sin(spin);
          const length=.048+.115*random(),width=length*(i%3===0?.065:.28);
          const point=(along,across,lift)=>{
            const atX=px+dx*along-dz*across,atZ=pz+dz*along+dx*across;
            return [atX,floorHeight(atX,atZ)+lift,atZ];
          };
          const tip=point(length*.57,0,.010),base=point(-length*.43,0,.007);
          const left=point(0,-width,.009),right=point(0,width,.011),vein=point(-length*.05,0,.018);
          const shade=.54+random()*.46;
          litter.face(base,left,vein,shade*.71,shade,shade*.8);
          litter.face(vein,left,tip,shade*.8,shade,shade*.92);
          litter.face(base,vein,right,shade*.64,shade*.78,shade*.92);
          litter.face(vein,tip,right,shade*.78,shade*.91,shade);
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
          const y=shore.ground(pos,side,offset)-size*.026;
          const n=ledges && i<3?i%2*2:i%3;
          const w=size*(n===1?.92+random()*.31:1.32+random()*.37);
          const h=stock?w*(.76+random()*.22):size*(n===1?.69+random()*.37:.37+random()*.27);
          const d=stock?w*(.87+random()*.22):size*(.70+random()*.37);
          const angle=bearing+(random()-.5)*1.10;
          if(placeRock(stoneShapes[n],stones[n],x,y,pos,w,h,d,angle,(random()-.5)*.24)){
            darkenGround(x,pos,w*.61+.12,.80,Math.max(.6,d/w),angle);
            if(size>.73 && pos>-214 && pos<36){
              const apron=Math.max(w,d)*.60;
              for(let chip=0;chip<4;chip++){
                const spin=random()*Math.PI*2,reach=apron*(.88+random()*.58);
                const px=x+Math.cos(spin)*reach,pz=pos+Math.sin(spin)*reach;
                const width=.085+.17*random();
                pebbles.push({x:px,z:pz,width,spin,material:stones[chip%3]});
              }
            }
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
        if(!placeRock(stoneShapes[1],stones[1],x,floorHeight(x,z)-.10,z,scale,.80*scale,.87*scale,spin,.14))continue;
        lastLitShelf=lamp.z;
        darkenGround(x,z,scale*.63,.82,.78,spin);
        const px=x+side*scale*.23,pz=z-scale*.58;
        if(clearRock(px,pz) && placeShrub(Math.floor((z-firstZ)/5.3),side,px,floorHeight(px,pz)-.051,pz,.73,.57,spin+.64)){
          darkenGround(px,pz,.44,.44,.82,spin+.64);
        }
        dropLitter(x-side*.44,z+.36);
      }
      for(const {x,z,width,spin,material} of pebbles){
        placeRock(pebble,material,x,floorHeight(x,z),z,width,width*.52,width*.73,spin);
      }
      function plantMeadow(pos,offset,geometry,material,width,height,random=meadowRandom){
        const x=bankX(pos,side)+side*offset;
        if(!clearRock(x,pos))return;
        const y=floorHeight(x,pos)-.034;
        placeCover(side,geometry,material,x,y,pos,width,height,width,random()*Math.PI*2);
      }
      for(const z of patches){
        const close=z>-214 && z<36;
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
          if(placeCover(side,meadowGrass[i%meadowGrass.length],meadowMaterial,x,shore.ground(pos,side,offset)-.042,pos,
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
        for(let i=0;i<count;i++){
          const isFlower=i<flowersInPatch;
          const pos=z+(meadowRandom()-.5)*(isFlower?2.2:4.5);
          const offset=Math.max(.78,centerOffset+(meadowRandom()-.5)*(isFlower?1.2:3.7));
          const geometry=isFlower?flower:meadowGrass[i%meadowGrass.length];
          const material=isFlower?flowersMaterial:meadowMaterial;
          const width=isFlower?.40+meadowRandom()*.34:.34+meadowRandom()*.57;
          const height=isFlower?.32+meadowRandom()*.37:.19+meadowRandom()*.28;
          plantMeadow(pos,offset,geometry,material,width,height);
        }
      }
      let lastMeadow=-Infinity,patchIndex=0;
      for(const lamp of shore.lanterns){
        if(lamp.z<-218 || lamp.z>36 || lamp.z-lastMeadow<7 || (lamp.x-center(lamp.z))*side<=0)continue;
        lastMeadow=lamp.z;
        const offset=(lamp.x-bankX(lamp.z,side))*side;
        const flower=meadowFlowers[patchIndex++%meadowFlowers.length];
        for(let i=0;i<18;i++){
          const pos=lamp.z+(meadowRandom()-.5)*2.4;
          const depth=offset+.47+meadowRandom()*1.5;
          if(i<6)plantMeadow(pos,depth,flower,flowersMaterial,.58+meadowRandom()*.19,.38+meadowRandom()*.24);
          else plantMeadow(pos,depth,meadowGrass[i%meadowGrass.length],meadowMaterial,.42+meadowRandom()*.44,.22+meadowRandom()*.22);
        }
      }
      for(const z of patches){
        const count=z>-218 && z<36?690:315;
        const inland=6.6+4.2*coverRandom();
        const uphill=13+7*coverRandom();
        const nearBank=2.1+coverRandom()*1.8;
        for(let i=0;i<count;i++){
          const pos=z+(coverRandom()+coverRandom()-1)*4.8;
          const band=i%5;
          const center=band<2?nearBank:band===4?uphill:inland;
          const offset=center+(coverRandom()+coverRandom()-1)*3.6;
          if(offset<.65)continue;
          const width=.28+coverRandom()*.40;
          const height=.17+coverRandom()*.32;
          plantMeadow(pos,offset,meadowGrass[i%meadowGrass.length],meadowMaterial,width,height,coverRandom);
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

  return {center,bankX,channelBounds,clearLanternFlight,waterShader,mistShader,create,landscape};
})();
