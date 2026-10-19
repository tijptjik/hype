import { chromium } from 'playwright'
const browser = await chromium.launch({ executablePath: '/home/io/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome', args: ['--disable-web-security'] })
const page = await browser.newPage()
const errors: string[] = []
page.on('pageerror', e => errors.push(e.message))
page.on('response', async r => { if (r.url().includes('getFeaturePage')) console.log('FEATURE', r.status(), (await r.text()).slice(0,300)) })
await page.goto('http://127.0.0.1:4173/', {waitUntil:'domcontentloaded'})
await page.getByRole('button', {name:'Maps',exact:true}).click()
await page.waitForTimeout(5000)
await page.getByRole('button', {name:'Expand Layers',exact:true}).click()
await page.waitForTimeout(1000)
await page.route('**/_app/remote/**/getFeaturePage', route => route.fulfill({status:500,contentType:'application/json',body:JSON.stringify({message:'Simulated feature failure'})}))
await page.getByRole('button', {name:'Isolate Ghost Signs',exact:true}).click()
await page.waitForTimeout(2000)
console.log('BODY', await page.locator('body').innerText())
console.log('UNHANDLED', errors)
await browser.close()
if(errors.length) process.exitCode=1
