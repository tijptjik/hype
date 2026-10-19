import { chromium } from 'playwright'
const browser = await chromium.launch({ executablePath:'/home/io/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome', args:['--disable-web-security'] })
const page = await browser.newPage({ viewport:{width:390,height:844} })
const errors: string[] = []
page.on('pageerror', e => errors.push(e.message))
await page.route('**/__filter-check.html', route => route.fulfill({ contentType:'text/html', body:'<html data-theme="breadline-light"><head><script>globalThis.__sveltekit_dev={env:{}}</script><script type="module" src="/@vite/client"></script></head><body><div id="app"></div><script type="module" src="/src/tests/fixtures/filterIdentityCheck.ts"></script></body></html>' }))
await page.goto('http://127.0.0.1:4173/__filter-check.html')
const headers = page.getByRole('button', {name:/categories/i})
await headers.first().waitFor()
await headers.first().click()
await page.waitForTimeout(300)
for (const name of ['Sign Archive','Ghost Signs','Breadline','Current']) {
 if (!await page.getByText(name,{exact:true}).isVisible()) throw Error(`Missing identity: ${name}`)
}
await page.screenshot({path:'output/playwright/filter-identities-light.png'})
await headers.last().click()
await page.evaluate(()=>document.documentElement.setAttribute('data-theme','breadline-dark'))
await page.waitForTimeout(300)
await page.screenshot({path:'output/playwright/filter-identities-dark.png'})
console.log(JSON.stringify({errors, overflow:await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)}))
await browser.close()
