// Trace her curled pose in the coordinate system of the plaid-blanket photograph.
// The same soft matte shapes the river, the sky and the distribution of lanterns.
const riverPortrait = (() => {
  const width=600,height=450;
  const contour=new Path2D(
    'M 89 340 C 83 320 101 301 111 280 C 106 260 114 242 127 225 '+
    'C 133 197 146 175 169 155 C 203 122 261 105 307 99 '+
    'C 348 84 405 88 447 113 C 501 128 541 185 550 239 '+
    'C 555 260 566 297 561 328 C 561 358 531 376 494 385 '+
    'C 439 401 382 413 325 422 C 274 427 222 422 194 410 '+
    'C 172 400 165 371 175 345 C 168 339 158 336 147 329 '+
    'C 128 328 105 353 89 340 Z');
  function canvas(){
    const layer=document.createElement('canvas');
    layer.width=width;layer.height=height;
    return layer;
  }
  // Feather inward so the light cannot pick up plaid along her outline.
  const silhouette=canvas(),edge=silhouette.getContext('2d');
  edge.fillStyle='white';edge.fill(contour);
  edge.globalCompositeOperation='destination-out';
  edge.lineWidth=14;edge.stroke(contour);
  const mask=canvas(),matte=mask.getContext('2d');
  matte.filter='blur(6px)';matte.drawImage(silhouette,0,0);
  const alpha=mask.getContext('2d').getImageData(0,0,width,height).data;
  const halo=canvas().getContext('2d');
  halo.fillStyle='white';halo.filter='blur(24px)';halo.fill(contour);
  const fringe=halo.getImageData(0,0,width,height).data;
  let seed=37061;
  function random(){
    seed=(Math.imul(seed,1664525)+1013904223)>>>0;
    return seed/4294967296;
  }
  const lights=[];
  // Follow the silhouette, with smaller lights scattered over her back.
  for(let i=0;i<7800 && lights.length<182;i++){
    const x=random()*width,y=random()*height;
    const texel=(Math.floor(y)*width+Math.floor(x))*4+3;
    const coverage=alpha[texel]/255;
    const face=((x-183)/99)**2+((y-280)/89)**2<1;
    const paws=((x-308)/80)**2+((y-282)/101)**2<1;
    if(coverage>.22 && (face || paws))continue;
    const outer=fringe[texel]/255*(1-coverage);
    const back=x>322 && !paws?coverage*.063:0;
    if(random()>outer*2.1+back)continue;
    const spacing=10+random()*8;
    if(lights.some(p=>(p.x-x)**2+(p.y-y)**2<spacing**2))continue;
    const size=coverage>.70?.066+.062*random():.105+.155*random();
    lights.push({x,y,depth:(random()-.5)*1.2,size,phase:random()*Math.PI*2});
  }
  return {width,height,mask,lights};
})();
