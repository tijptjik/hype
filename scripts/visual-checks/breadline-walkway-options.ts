import { chromium } from 'playwright'
const browser = await chromium.launch({channel:'chrome',args:['--disable-web-security']})
try {
 const page = await browser.newPage({viewport:{width:900,height:650},deviceScaleFactor:1})
 const errors:string[]=[]
 page.on('pageerror', e=>errors.push(e.message))
 await page.route('https://tiles.saanseoi.hk/**', async route=>route.fulfill({response:await route.fetch({headers:{...route.request().headers(),origin:'http://hype.localhost',referer:'http://hype.localhost/'}})}))
 let colour = '#8462c4'
 await page.route('**/api/mapStyles/breadline-light?**', async route => {
 const response = await route.fetch()
 await route.fulfill({response, body:(await response.text()).replaceAll('#b78026', colour)})
 })
 for (const [name, hex] of [['violet','#8462c4'],['blue','#348dd0'],['coral','#e26963'],['lime','#8da62c']] as const) {
 colour = hex
 const style = 'breadline-light', zoom = 17
 await page.goto(`http://127.0.0.1:4173/headless/map-style-render/${style}?lng=114.1497&lat=22.2855&zoom=${zoom}&bearing=0&pitch=0`)
 await page.waitForSelector('#map-style-render-ready[data-ready="true"]',{timeout:90000})
 await page.waitForTimeout(3500)
 await page.screenshot({path:`output/playwright/walkways-${name}.png`})
 }
 console.log(JSON.stringify({errors,ready:true}))
} finally {await browser.close()}
