// The rooms and bridges share a floor plan with the walking controls.
const riverWalk = (() => {
  const rooms = [
    {name:'The warm chair', x:0, z:0, width:10, depth:10, photos:[17,15,16]},
    {name:'Early days', x:-5, z:-18, width:9, depth:9, photos:[4,5,6]},
    {name:'Keeping watch', x:3, z:-36, width:11, depth:12, photos:[7,8,9,10,11]},
    {name:'At the keyboard', x:-3, z:-55, width:9, depth:9, photos:[12,13,14]},
    {name:'Quiet hours', x:1, z:-72, width:9, depth:9, photos:[2,3]}
  ];
  const route=[],bridges=[],lanternSpans=[];
  const width=3.14,approach=1.35,landingWidth=6.6,landingDepth=4.7;
  const entrance=[rooms[0].x,rooms[0].z+rooms[0].depth/2+7.6];
  function join(x,z,normal,neighbor){
    if(!neighbor)return {x,z,...normal};
    const scale=1/(1+normal.nx*neighbor.nx+normal.nz*neighbor.nz);
    return {x,z,nx:(normal.nx+neighbor.nx)*scale,nz:(normal.nz+neighbor.nz)*scale};
  }
  function bridgePoint(start,finish,along,across){
    return [
      (start.x+start.nx*across)*(1-along)+(finish.x+finish.nx*across)*along,
      (start.z+start.nz*across)*(1-along)+(finish.z+finish.nz*across)*along
    ];
  }
  function bridge(points) {
    const spans=points.slice(1).map(([x,z],i)=>{
      const [sx,sz] = points[i];
      const length=Math.hypot(x-sx,z-sz);
      const normal={nx:(z-sz)/length,nz:-(x-sx)/length};
      return {sx,sz,x,z,width,length,normal};
    });
    spans.forEach((span,i)=>{
      const {sx,sz,x,z,normal}=span;
      const startsAtBend=i>0,endsAtBend=i<spans.length-1;
      const start=join(sx,sz,normal,spans[i-1]?.normal);
      const finish=join(x,z,normal,spans[i+1]?.normal);
      // Keep a body's clearance from the rails using the same miters as the deck.
      const half=width/2-.43;
      const corners=[
        bridgePoint(start,finish,0,-half),bridgePoint(start,finish,1,-half),
        bridgePoint(start,finish,1,half),bridgePoint(start,finish,0,half)
      ];
      bridges.push({...span,start,finish,startsAtBend,endsAtBend,corners});
    });
  }
  for (let i=0; i<rooms.length; i++) {
    const room=rooms[i], front=[room.x,room.z+room.depth/2], back=[room.x,room.z-room.depth/2];
    if(i){
      const previous=route[route.length-1];
      const points=[previous,[previous[0],previous[1]-approach],[front[0],front[1]+approach],front];
      bridge(points);
      lanternSpans.push([previous,front]);
      route.push(...points.slice(1));
    }else{
      bridge([entrance,front]);
      route.push(entrance,front);
    }
    route.push(back);
  }
  const trail=[route[route.length-1],[1,-85],[-4,-98],[-8,-108],[-8,-123],
               [-2,-136],[1,-147],[-5,-162],[-6,-178],[-2,-191],[-2,-205]];
  const end=trail[trail.length-1];
  bridge([...trail.slice(0,-1),[end[0],end[1]+landingDepth/2]]);
  for(let i=1;i<trail.length;i++)lanternSpans.push([trail[i-1],trail[i]]);
  route.push(...trail.slice(1));
  function roomAt(x,z) {
    return rooms.find(r => Math.abs(x-r.x)<r.width/2-.26 && Math.abs(z-r.z)<r.depth/2+.08);
  }
  function bridgeAt(x,z){
    return bridges.find(({corners})=>corners.every(([ax,az],i)=>{
      const [bx,bz]=corners[(i+1)%corners.length];
      return (bx-ax)*(z-az)-(bz-az)*(x-ax)<=1e-7;
    }));
  }
  function walkable(x,z) {
    const room=roomAt(x,z);
    if(room && Math.abs(z-room.z)<=room.depth/2)return true;
    if(Math.abs(x-end[0])<2.95 && z>end[1]-landingDepth/2+.30 && z<=end[1]+landingDepth/2)return true;
    return Boolean(bridgeAt(x,z));
  }
  function bridgeCenter(x,z){
    const b=bridgeAt(x,z);
    if(!b)return null;
    const dx=b.x-b.sx,dz=b.z-b.sz;
    const t=Math.max(0,Math.min(1,((x-b.sx)*dx+(z-b.sz)*dz)/(b.length*b.length)));
    return [b.sx+dx*t,b.sz+dz*t];
  }
  return {rooms,bridges,route,trail,entrance,end,landingWidth,landingDepth,lanternSpans,bridgePoint,bridgeCenter,roomAt,walkable};
})();
