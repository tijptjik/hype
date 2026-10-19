import {chromium} from '@playwright/test'
const browser=await chromium.launch({channel:'chrome',args:['--disable-web-security']})
try {
const page=await browser.newPage({viewport:{width:900,height:650}})
await page.route('https://tiles.saanseoi.hk/**',async r=>r.fulfill({response:await r.fetch({headers:{...r.request().headers(),origin:'http://hype.localhost',referer:'http://hype.localhost/'}})}))
await page.goto('http://127.0.0.1:4173/headless/map-style-render/breadline-light?lng=114.1844&lat=22.28035&zoom=17&bearing=0&pitch=0')
await page.waitForSelector('#map-style-render-ready[data-ready="true"]',{timeout:90000})
console.log(await page.evaluate(async()=>{
const lib=await import('/node_modules/maplibre-gl/dist/maplibre-gl.mjs')
const style=await (await fetch('/api/mapStyles/breadline-light?inline=1')).json()
style.sprite=style.sprite.map(s=>({...s,url:new URL(s.url,location.origin).href}))
const container=document.createElement('div');container.style.cssText='position:fixed;inset:0;z-index:99999';document.body.append(container)
const map=new lib.Map({container,style,center:[114.1844,22.28035],zoom:17,fadeDuration:0})
const {installStreetLabelPlacement}=await import('/src/lib/map/street-label-placement.ts')
installStreetLabelPlacement(map)
await new Promise(resolve=>map.once('idle',resolve));await new Promise(r=>setTimeout(r,3500));
(window as any).debugMap=map
return map.queryRenderedFeatures({layers:style.layers.filter(l=>l.id.startsWith('roads_labels_')).map(l=>l.id)}).map(f=>({layer:f.layer.id,name:f.properties['name:en']}))
}))
await page.screenshot({path:'output/playwright/breadline-placement-debug.png'})
}finally{await browser.close()}
