import { chromium } from '@playwright/test'
const browser = await chromium.launch({channel:'chrome',args:['--disable-web-security']})
try {
 const page = await browser.newPage({viewport:{width:900,height:650},deviceScaleFactor:1})
 const errors:string[]=[]
 page.on('pageerror', e=>errors.push(e.message))
 await page.route('https://tiles.saanseoi.hk/**', async route=>route.fulfill({response:await route.fetch({headers:{...route.request().headers(),origin:'http://hype.localhost',referer:'http://hype.localhost/'}})}))
 for (const [style,zoom] of [['breadline-light',16],['breadline-light',17],['breadline-light',18.5],['breadline-dark',17]] as const) {
 await page.goto(`http://127.0.0.1:4173/headless/map-style-render/${style}?lng=114.1844&lat=22.28035&zoom=${zoom}&bearing=0&pitch=0`)
 await page.waitForSelector('#map-style-render-ready[data-ready="true"]',{timeout:90000})
 await page.waitForTimeout(500)
 await page.screenshot({path:`output/playwright/${style}-overlaps-z${zoom}.png`})
 }
 console.log(JSON.stringify({errors,ready:true}))
} finally {await browser.close()}
