// Serve docs locally, then run: node tools/bake-river-shadows.cjs <preview URL>
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const {readFileSync,writeFileSync}=require('node:fs');
const {resolve}=require('node:path');

async function bake(){
  const link=process.argv[2];
  if(!link)throw Error('Supply the URL of the local docs preview');
  const docs=resolve(__dirname,'../docs');
  const browser=await chromium.launch({
    executablePath:process.env.CHROMIUM_PATH || undefined,
    args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']
  });
  try{
    const page=await browser.newPage({viewport:{width:700,height:450},reducedMotion:'reduce'});
    const errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    page.on('console',message=>{if(message.type()==='error')errors.push(message.text())});
    await page.route(/\/garden\.js(\?|$)/,route=>{
      const script=readFileSync(resolve(docs,'garden.js'),'utf8').replace(
        'ready=true;',
        `ready=true;
        window.bakeShadowTextures=()=>{
          stopFrames();
          const matrices=architectureBoxes().map(box=>box.matrix);
          riverShadows.attach(T,renderer,shadowValues,matrices);
          return {
            'river-shadow-mask.png':riverShadows.bake(T,renderer,shadowValues,screenMaterial,drawPass),
            'river-shadow-depth.png':riverShadows.bakeDepth(T,renderer,shadowValues,screenMaterial,drawPass)
          };
        };`
      );
      return route.fulfill({contentType:'text/javascript',body:script});
    });
    await page.goto(link);
    await page.locator('a.primary').click();
    await page.waitForFunction(()=>window.bakeShadowTextures || !document.querySelector('.garden-fallback').hidden);
    const textures=await page.evaluate(()=>window.bakeShadowTextures?.());
    if(errors.length)throw Error(errors.join('\n'));
    if(!textures || Object.values(textures).some(image=>!image.startsWith('data:image/png;base64,')))
      throw Error('Could not bake the river shadows');
    for(const [file,image] of Object.entries(textures))
      writeFileSync(resolve(docs,file),Buffer.from(image.split(',')[1],'base64'));
  }finally{
    await browser.close();
  }
}

bake().catch(error=>{console.error(error);process.exitCode=1});
