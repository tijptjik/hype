import { chromium } from 'playwright'
const browser = await chromium.launch({headless:true,args:['--disable-web-security']})
const page = await browser.newPage({viewport:{width:1440,height:1080}})
page.on('pageerror',error=>console.log('PAGE_ERROR',error.message))
let populatedFeatures = 0
page.on('response',async response=>{
 if(response.url().includes('/getFeaturePage')) {
  const text=await response.text()
  if(text.includes('geometry')) populatedFeatures++
 }
})
await page.goto('http://127.0.0.1:4173',{waitUntil:'domcontentloaded'})
await page.getByRole('button',{name:'Settings',exact:true}).waitFor({timeout:60000})
await page.getByRole('button',{name:'Settings',exact:true}).click()
const theme = page.locator('section').filter({has:page.getByRole('button',{name:'THEME section header',exact:true})})
await theme.waitFor()
await theme.scrollIntoViewIfNeeded()
console.log('THEME_SUBSECTIONS', await theme.locator('legend').allTextContents())
console.log('DEFAULT_MAPS',await page.locator('section').filter({has:page.getByRole('button',{name:'Default Maps section header',exact:true})}).innerText())
await theme.getByText('Map',{exact:true}).scrollIntoViewIfNeeded()
const previews=theme.locator('img')
await previews.first().scrollIntoViewIfNeeded()
for (const img of await previews.all()) {
 await img.scrollIntoViewIfNeeded()
 await img.evaluate(image => image.decode()).catch(error => console.log('IMAGE_ERROR',error.message))
}
await theme.getByText('Map',{exact:true}).scrollIntoViewIfNeeded()
console.log('PREVIEWS',await previews.evaluateAll(images=>images.map(image=>({alt:image.alt,loaded:image.complete && image.naturalWidth>0,src:image.getAttribute('src')}))))
await page.screenshot({path:'output/playwright/settings-theme-map.png'})
const firstStyle=theme.getByRole('radio').nth(6)
// Identify the map style from the rendered preview before selecting it.
const styleLabel=await previews.first().getAttribute('alt')
await theme.locator('label').filter({has:page.getByRole('radio',{name:styleLabel!,exact:true})}).click()
console.log('MAP_SELECTION',await page.evaluate(()=>localStorage.getItem('hype-map-style')))
console.log('FEATURE_RESPONSES',populatedFeatures)
await page.reload({waitUntil:'domcontentloaded'})
await page.waitForTimeout(3000)
console.log('PERSISTED',await page.evaluate(()=>localStorage.getItem('hype-map-style')))
await browser.close()
