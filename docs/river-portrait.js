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
  function matte(){
    const canvas=document.createElement('canvas');
    canvas.width=width;canvas.height=height;
    const ctx=canvas.getContext('2d');
    ctx.fillStyle='white';ctx.filter='blur(12px)';ctx.fill(contour);
    return canvas;
  }
  const mask=matte();
  const alpha=mask.getContext('2d').getImageData(0,0,width,height).data;
  let seed=37061;
  function random(){
    seed=(Math.imul(seed,1664525)+1013904223)>>>0;
    return seed/4294967296;
  }
  const lights=[];
  // A scattered volume of paper lights, with a loose fringe where the fur fades.
  for(let i=0;i<7800 && lights.length<284;i++){
    const x=random()*width,y=random()*height;
    const coverage=alpha[(Math.floor(y)*width+Math.floor(x))*4+3]/255;
    if(random()>coverage*.97 || !coverage)continue;
    const spacing=12+random()*5;
    if(lights.some(p=>(p.x-x)**2+(p.y-y)**2<spacing**2))continue;
    lights.push({x,y,depth:(random()-.5)*1.2,size:.10+.19*random(),phase:random()*Math.PI*2});
  }
  return {width,height,mask,lights};
})();
