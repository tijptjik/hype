import { chromium } from '@playwright/test'
const browser = await chromium.launch({channel:'chrome',args:['--disable-web-security']})
try {
 const page = await browser.newPage({viewport:{width:1400,height:1000},deviceScaleFactor:1})
 const errors:string[]=[]
 page.on('pageerror', e=>errors.push(e.message))
 await page.route('https://tiles.saanseoi.hk/**', async route=>route.fulfill({response:await route.fetch({headers:{...route.request().headers(),origin:'http://hype.localhost',referer:'http://hype.localhost/'}})}))
 await page.goto('http://127.0.0.1:4173/headless/map-style-render/breadline-light?lng=114.1695&lat=22.3193&zoom=17.4&bearing=0&pitch=0')
 await page.waitForSelector('#map-style-render-ready[data-ready="true"]',{timeout:90000})
 await page.screenshot({path:'output/playwright/breadline-light.png'})
 console.log(JSON.stringify({errors,ready:true}))
} finally {await browser.close()}
