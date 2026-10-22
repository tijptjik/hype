import { chromium } from 'playwright'
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE_PATH, args: ['--disable-web-security'] })
try {
  for (const layout of ['table', 'card']) {
  const page = await browser.newPage({viewport:{width:1100,height:750}})
  const errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  await page.route('**/__pagination-check.html*', route => route.fulfill({contentType:'text/html',body:'<html><head><script>globalThis.__sveltekit_dev={env:{}}</script></head><body><div id="app"></div><script type="module" src="/src/tests/fixtures/resourcePaginationCheck.ts"></script></body></html>'}))
  await page.goto(`http://127.0.0.1:4173/__pagination-check.html?layout=${layout}`)
  const viewport = page.locator('svelte-virtual-list-viewport')
  await viewport.waitFor({timeout:60000})
  const initialHeight = await viewport.evaluate(e=>e.clientHeight)
  if(initialHeight !== 600) throw Error(`Viewport is ${initialHeight}, expected 600`)
  await viewport.evaluate(e=>{ e.scrollTop=e.scrollHeight; e.dispatchEvent(new Event('scroll')) })
  await page.locator('[data-requests="1"]').waitFor()
  await page.locator('svelte-virtual-list-viewport [aria-busy="true"]').first().waitFor()
  const loadingHeight = await viewport.evaluate(e=>e.clientHeight)
  await page.locator('[data-count="50"]').waitFor()
  await viewport.evaluate(e=>{ e.scrollTop=e.scrollHeight; e.dispatchEvent(new Event('scroll')) })
  await page.locator('[data-count="75"]').waitFor()
  await viewport.evaluate(e=>{ e.scrollTop=e.scrollHeight; e.dispatchEvent(new Event('scroll')) })
  await page.locator('[data-row="74"]').waitFor()
  const finalHeight = await viewport.evaluate(e=>e.clientHeight)
  if(loadingHeight!==600 || finalHeight!==600) throw Error('Viewport shrank during pagination')
  if(await page.getByText('Load more',{exact:true}).count()) throw Error('Load more still visible')
  if(await page.locator('[aria-busy="true"]').count()) throw Error('Loading placeholders remain at end')
  if(errors.length) throw Error(errors.join('\n'))
  await page.screenshot({path:`output/playwright/location-pagination-${layout}.png`})
  console.log(JSON.stringify({layout,initialHeight,loadingHeight,finalHeight,rows:75,requests:2,errors}))
  await page.close()
  }
} finally { await browser.close() }
