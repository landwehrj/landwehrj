// The rooms and bridges share a floor plan with the walking controls.
const riverWalk = (() => {
  const rooms = [
    {name:'The warm chair', x:0, z:0, width:10, depth:10, photos:[17,15,16]},
    {name:'Early days', x:-5, z:-18, width:9, depth:9, photos:[4,5,6]},
    {name:'Keeping watch', x:3, z:-36, width:11, depth:12, photos:[7,8,9,10,11]},
    {name:'At the keyboard', x:-3, z:-55, width:9, depth:9, photos:[12,13,14]},
    {name:'Quiet hours', x:1, z:-72, width:9, depth:9, photos:[2,3]}
  ];
  const route = [];
  const bridges = [];
  function bridge(points, width) {
    points.slice(1).forEach(([x,z], i) => {
      const [sx,sz] = points[i];
      bridges.push({sx,sz,x,z,width,length:Math.hypot(x-sx,z-sz)});
    });
  }
  for (let i=0; i<rooms.length; i++) {
    const room=rooms[i], front=[room.x,room.z+room.depth/2], back=[room.x,room.z-room.depth/2];
    if(i) bridge([route[route.length-1],front],2.8);
    route.push(front,back);
  }
  const trail=[route[route.length-1],[1,-85],[-4,-98],[-8,-108],[-8,-123],
               [-2,-136],[1,-147],[-5,-162],[-6,-178],[-2,-191],[-2,-205]];
  bridge(trail,2.8);
  route.push(...trail.slice(1));
  const end=route[route.length-1];
  function roomAt(x,z) {
    return rooms.find(r => Math.abs(x-r.x)<r.width/2-.26 && Math.abs(z-r.z)<r.depth/2+.08);
  }
  function walkable(x,z) {
    if(roomAt(x,z) || (Math.abs(x-end[0])<2.95 && Math.abs(z-end[1])<2.05)) return true;
    return bridges.some(b=>{
      const t=Math.max(0,Math.min(1,((x-b.sx)*(b.x-b.sx)+(z-b.sz)*(b.z-b.sz))/(b.length*b.length)));
      return Math.hypot(x-b.sx-t*(b.x-b.sx),z-b.sz-t*(b.z-b.sz))<b.width/2-.25;
    });
  }
  return {rooms,bridges,route,trail,end,roomAt,walkable};
})();
