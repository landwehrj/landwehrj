// Scenery shared by the riverbank geometry, lanterns, and water shader.
const riverShore = (() => {
  const firstZ=-272,lastZ=114,halfWidth=64;
  const offsets=[-2.7,-.86,0,.50,1.1,2,3.2,4.9,7.2,10.8,16.6,25.2,39];
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
  const waterShader=`
    uniform sampler2D riverBankProfile;
    float shoreDistance(vec2 p){
      float row=(p.y-(${firstZ.toFixed(1)}))/${rowDepth.toFixed(8)};
      vec4 profile=texture2D(riverBankProfile,vec2((row+.5)/${(rows+1).toFixed(1)},.5));
      vec2 banks=(profile.rb*256.+profile.ga)/257.*${(halfWidth*2).toFixed(1)}-${halfWidth.toFixed(1)};
      return min(p.x-banks.x,banks.y-p.x);
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
      return waterLevel+slope+Math.min(1,Math.max(0,offset)*.42)*relief;
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
          const lift=.32+random()*.63;
          const size=.23+random()*.15;
          if(!clearDecks(x,pos,size))continue;
          lanterns.push({x,y:ground(pos,side,offset)+lift,z:pos,size});
          const radius=1.54+lift*.83;
          const glow=ctx.createRadialGradient(x,pos,0,x,pos,radius);
          glow.addColorStop(0,'rgba(255,255,255,.68)');
          glow.addColorStop(.40,'rgba(255,255,255,.32)');
          glow.addColorStop(1,'rgba(255,255,255,0)');
          ctx.fillStyle=glow;ctx.fillRect(x-radius,pos-radius,2*radius,2*radius);
        }
      }
    }
    return {ground,height,lanterns,profile,glow:new T.CanvasTexture(glowCanvas)};
  }

  function pineBoughs(T,random){
    const positions=[],tints=[];
    function face(a,b,c,light){
      positions.push(...a,...b,...c);
      tints.push(light,light*.92,light*.96,light,light,light,light*.81,light*.87,light*.94);
    }
    for(let tier=0;tier<10;tier++){
      const stem=.21+tier*.081;
      const spread=.50*Math.pow(1-tier/10,1.10)*(.83+.33*random());
      const phase=random()*Math.PI*2;
      const branches=tier>7?4:6;
      for(let b=0;b<branches;b++){
        const angle=phase+(b+(random()-.5)*.52)*Math.PI*2/branches;
        const x=Math.cos(angle),z=Math.sin(angle);
        const reach=spread*(.65+.39*random()),y=stem+(random()-.5)*.07;
        const droop=.023+random()*.057;
        const point=(out,across,height)=>[reach*(x*out-z*across),y+height,reach*(z*out+x*across)];
        const root=point(0,0,.040),ridge=point(.42,0,.030),tip=point(1,0,-droop);
        const light=.60+.37*random();
        for(const k of [-1,1]){
          const shoulder=point(.33,k*(.41+random()*.17),-.025);
          const tiplet=point(.74,k*(.29+random()*.23),-droop*.64);
          const spur=point(.49,k*(.57+random()*.24),-.04);
          face(root,shoulder,ridge,light);
          face(shoulder,tiplet,ridge,light*.89);
          face(tiplet,tip,ridge,light);
          face(shoulder,spur,tiplet,light*.83);
        }
      }
    }
    const peakedTip=[.008,1,-.005],peakBase=[[.038,.883,.021],[-.032,.88,.019],[.004,.885,-.042]];
    for(let i=0;i<3;i++)face(peakBase[i],peakedTip,peakBase[(i+1)%3],.83);
    const mesh=new T.BufferGeometry();
    mesh.setAttribute('position',new T.Float32BufferAttribute(positions,3));
    mesh.setAttribute('color',new T.Float32BufferAttribute(tints,3));
    mesh.computeVertexNormals();
    return mesh;
  }

  function tuft(T,random,blades,seedHeads,widthScale=1){
    const positions=[],tints=[];
    function triangle(a,b,c,base,tip,end){
      positions.push(...a,...b,...c);
      for(const shade of [base,tip,end])tints.push(shade,shade,shade);
    }
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
        const left=[x-.042*dx,height-.10,z-.042*dz],right=[x+.042*dx,height-.10,z+.042*dz];
        triangle(left,right,[x,height+.11,z],.46,.46,.61);
        triangle(left,[x,height-.20,z],right,.46,.45,.46);
      }
    }
    const mesh=new T.BufferGeometry();
    mesh.setAttribute('position',new T.Float32BufferAttribute(positions,3));
    mesh.setAttribute('color',new T.Float32BufferAttribute(tints,3));
    mesh.computeVertexNormals();
    return mesh;
  }

  function landscape(T,{scene,batch,reflected,color,painted,addRiverMist,shore,waterLevel,random,slate}){
    const litHeight=waterLevel.toFixed(2);
    const lightMapOffset=(halfWidth*2).toFixed(1);
    const lightMapLength=(lastZ-firstZ).toFixed(1);
    const texture=slate || painted(128,(ctx,size)=>{
      const image=ctx.createImageData(size,size);
      for(let i=0;i<image.data.length;i+=4){
        const shade=84+random()*100;
        image.data.set([shade,shade,shade,255],i);
      }
      ctx.putImageData(image,0,0);
    });
    texture.wrapS=texture.wrapT=T.RepeatWrapping;
    function surface(tint,{vertexColors=false,twoSided=false,ground=false,rim=false}={}){
      const material=new T.MeshStandardMaterial({
        color:color(tint),roughness:.86,vertexColors,side:twoSided?T.DoubleSide:T.FrontSide
      });
      material.customProgramCacheKey=()=>ground?'river-ground':rim?'river-needles':'river-understory';
      material.onBeforeCompile=shader=>{
        addRiverMist(shader);
        shader.uniforms.shoreSpill={value:shore.glow};
        shader.uniforms.shoreGrain={value:texture};
        shader.fragmentShader='uniform sampler2D shoreSpill,shoreGrain;\n'+shader.fragmentShader.replace(
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
            directLight.direction=mat3(viewMatrix)*toLamp;
            directLight.color=vec3(3.5,1.36,.47)*bankLight;
            directLight.visible=true;
            RE_Direct(directLight,geometry,material,reflectedLight);
            irradiance+=vec3(.92,.36,.14)*bankLight;
          }
          ${rim?`
          vec3 facing=inverseTransformDirection(geometry.normal,viewMatrix);
          float edge=pow(1.-max(0.,dot(geometry.normal,geometry.viewDir)),2.);
          float lightFacing=smoothstep(-.46,.94,dot(facing,normalize(vec3(-.51,.46,.72))));
          irradiance+=vec3(.17,.28,.40)*edge*lightFacing;`:''}
        `).replace('gl_FragColor.rgb=mix(gl_FragColor.rgb,fogColor,mistAmount);',`
          float bankMist=(1.-exp(-max(0.,mistDepth-13.)*.027))*exp(-surfaceHeight*.73);
          gl_FragColor.rgb=mix(gl_FragColor.rgb,fogColor,min(.89,mistAmount+bankMist*.26));
        `);
        if(ground)shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`
          #include <color_fragment>
          vec2 terrainUV=riverSurface.xz+riverSurface.y*vec2(.38,.56);
          vec3 grain=texture2D(shoreGrain,terrainUV*.78).rgb;
          float mineral=texture2D(shoreGrain,terrainUV*.188).g;
          float wet=1.-smoothstep(.025,.48,riverSurface.y-(${litHeight})+(.5-mineral)*.19);
          diffuseColor.rgb*=mix(.70,1.32,mineral)*mix(.82,1.16,grain.b)*mix(vec3(1.),vec3(.48,.57,.66),wet);
        `).replace('#include <roughnessmap_fragment>',`
          #include <roughnessmap_fragment>
          roughnessFactor=clamp(roughnessFactor+.22*(grain.g-.5)-wet*.32,.43,.98);
        `).replace('#include <normal_fragment_maps>',`
          #include <normal_fragment_maps>
          vec3 dx=dFdx(-vViewPosition),dy=dFdy(-vViewPosition);
          vec3 tx=cross(dy,normal),ty=cross(normal,dx);
          float det=dot(dx,tx),height=.006*grain.r+.022*mineral;
          vec3 slope=sign(det)*(tx*dFdx(height)+ty*dFdy(height));
          normal=normalize(max(abs(det),1e-7)*normal-slope);
        `);
        if(rim)shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`
          #include <color_fragment>
          float textureGrain=texture2D(shoreGrain,riverSurface.xz*1.7+riverSurface.y*vec2(.64,.91)).r;
          diffuseColor.rgb*=mix(.78,1.31,smoothstep(.09,.73,textureGrain));
        `);
      };
      return material;
    }

    const earth=surface('#ffffff',{vertexColors:true,ground:true});
    for(const side of [-1,1]){
      const positions=[],tints=[],index=[];
      const soil=color('#3c3a2c'),grass=color('#2f4838'),silt=color('#343332'),upland=color('#37443d');
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

    // Two staggered ridges behind the forest, with shallow gradients at the foot.
    const ridgeMaterial=new T.MeshBasicMaterial({
      vertexColors:true,side:T.DoubleSide,transparent:true,depthWrite:false,fog:false
    });
    ridgeMaterial.onBeforeCompile=shader=>{
      addRiverMist(shader);
      shader.fragmentShader=shader.fragmentShader.replace('#include <dithering_fragment>',`
        #include <dithering_fragment>
        gl_FragColor.a*=1.-smoothstep(67.,145.,distance(cameraPosition,riverSurface));
      `);
    };
    for(const side of [-1,1]){
      for(let layer=0;layer<2;layer++){
        const positions=[],tints=[],index=[];
        const base=color(layer?'#253951':'#1c2b3e'),peak=color(layer?'#1c2b42':'#142237');
        for(let i=0;i<=195;i++){
          const z=-329+i*2.55;
          const distance=49+layer*34+7*Math.sin(z*.025+side*1.1+layer);
          const x=center(z)*.42+side*distance;
          const wave=.51+.28*Math.sin(z*.042+side+layer*1.6)+.15*Math.sin(z*.099+layer*2.8)
                        +.08*Math.sin(z*.184+side*1.26)+.035*Math.cos(z*.37);
          const height=4+layer*5+(11+layer*8)*Math.pow(Math.max(0,wave),1.3);
          positions.push(x,waterLevel,z,x,height,z);
          tints.push(...base.toArray(),...peak.toArray());
          if(i<195){const a=i*2;index.push(a,a+1,a+2,a+1,a+3,a+2)}
        }
        const mesh=new T.BufferGeometry();
        mesh.setIndex(index);mesh.setAttribute('position',new T.Float32BufferAttribute(positions,3));
        mesh.setAttribute('color',new T.Float32BufferAttribute(tints,3));
        const ridge=reflected(new T.Mesh(mesh,ridgeMaterial));
        ridge.renderOrder=-2-layer;
        scene.add(ridge);
      }
    }

    const pineShapes=Array.from({length:3},()=>pineBoughs(T,random));
    const needles=['#304941','#243e3a','#324945'].map(tint=>surface(tint,{
      vertexColors:true,twoSided:true,rim:true
    }));
    const trunk=new T.CylinderGeometry(.28,.49,1,7);
    const bark=surface('#4b4136',{ground:true});
    const stoneShapes=Array.from({length:3},(_,i)=>{
      const mesh=new T.IcosahedronGeometry(.5,1);
      const p=mesh.attributes.position;
      const rounded=mesh.attributes.normal.clone();
      for(let j=0;j<p.count;j++){
        const x=p.getX(j),y=p.getY(j),z=p.getZ(j);
        const uneven=1+.16*Math.sin(x*11.9-y*5.7+z*9.2+i*2)+.11*Math.cos(z*18.1+x*4.6+i);
        p.setXYZ(j,x*uneven+y*.14,Math.max(-.37,y*uneven),z*uneven);
      }
      mesh.computeVertexNormals();
      const n=mesh.attributes.normal,face=new T.Vector3(),arc=new T.Vector3();
      for(let j=0;j<n.count;j++){
        face.fromBufferAttribute(n,j).lerp(arc.fromBufferAttribute(rounded,j),.58).normalize();
        n.setXYZ(j,face.x,face.y,face.z);
      }
      return mesh;
    });
    const stones=['#6c706c','#555d61','#74756a'].map(tint=>surface(tint,{ground:true}));
    const reeds=tuft(T,random,12,4),rushes=tuft(T,random,18,0),scrub=tuft(T,random,22,0,2.1);
    const grass=surface('#394834',{vertexColors:true,twoSided:true});
    const sedge=surface('#596747',{vertexColors:true,twoSided:true});
    const bushes=surface('#43543e',{vertexColors:true,twoSided:true});
    const placement=new T.Object3D(),bounds=new T.Box3();
    function place(geometry,material,x,y,z,width,height,depth,spin,tilt=0){
      if(!geometry.boundingBox)geometry.computeBoundingBox();
      placement.position.set(x,y,z);
      placement.scale.set(width,height,depth);
      placement.rotation.set(0,spin,tilt,'YXZ');
      placement.updateMatrix();
      bounds.copy(geometry.boundingBox).applyMatrix4(placement.matrix);
      const radius=Math.hypot(Math.max(x-bounds.min.x,bounds.max.x-x),Math.max(z-bounds.min.z,bounds.max.z-z));
      if(!clearDecks(x,z,radius+.10))return false;
      batch(geometry,material,x,y,z,width,height,depth,spin,tilt);
      return true;
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
          const trunkRun=height*.77, trunkRadius=height*(.027+random()*.013);
          const n=i%3;
          if(!place(pineShapes[n],needles[n],x,base,pos,width,height,width*(.77+random()*.41),spin,tilt))continue;
          place(trunk,bark,x-Math.cos(spin)*Math.sin(tilt)*trunkRun/2,
            base+Math.cos(tilt)*trunkRun/2,pos+Math.sin(spin)*Math.sin(tilt)*trunkRun/2,
            trunkRadius,trunkRun,trunkRadius,spin,tilt);
        }
      }
      const patches=[],rocks=[];
      for(let z=firstZ+2;z<lastZ-2;z+=2.5+random()*4.2){
        patches.push(z);
        const count=3+Math.floor(random()*5);
        for(let i=0;i<count;i++){
          const pos=z+(random()-.5)*3.9,offset=-.54+random()*2.8;
          const x=bankX(pos,side)+side*offset;
          const size=.15+1.10*random()**1.53;
          const y=shore.ground(pos,side,offset)+size*.12;
          const n=i%3;
          if(place(stoneShapes[n],stones[n],x,y,pos,size*(.89+random()*.57),size*(.54+.37*random()),
            size*(.68+random()*.59),random()*Math.PI*2,(random()-.5)*.45)){
            rocks.push({x,z:pos,radius:size*.66});
          }
        }
      }
      for(const z of patches){
        for(let i=0;i<7;i++){
          const near=i<4;
          const pos=z+(random()-.5)*(near?4.2:5.7),offset=near?-.22+random()*2.5:1.9+random()*6.7;
          const x=bankX(pos,side)+side*offset;
          if(rocks.some(rock=>Math.abs(rock.z-pos)<rock.radius+.12
            && Math.hypot(rock.x-x,rock.z-pos)<rock.radius+.12))continue;
          const isReed=offset<.80;
          const size=isReed?.48+.54*random():.29+.45*random();
          place(near?(isReed?reeds:rushes):scrub,near?(isReed?sedge:grass):bushes,
            x,shore.ground(pos,side,offset)-.075,pos,
            size*(1.+random()*.75),size,size,random()*Math.PI*2);
        }
      }
    }
  }

  return {center,bankX,waterShader,create,landscape};
})();
