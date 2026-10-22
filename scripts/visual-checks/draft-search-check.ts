import { chromium } from 'playwright'
const browser = await chromium.launch({ executablePath: '/home/io/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome', args: ['--disable-web-security'] })
try {
  const page = await browser.newPage({ viewport: { width: 1000, height: 800 } })
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.route('**/__draft-check.html', route => route.fulfill({ contentType: 'text/html', body: '<html><head><script>globalThis.__sveltekit_dev={env:{}}</script></head><body><div id="app"></div><script type="module" src="/src/tests/fixtures/draftSearchCheck.ts"></script></body></html>' }))
  await page.route('**/src/lib/api/draftLocation.remote.*', route => route.fulfill({ contentType: 'text/javascript', body: 'export async function searchDraftLocations(){return {rows:[],partial:false}}' }))
  await page.route('**/src/lib/api/external/geocoding.*', route => route.fulfill({ contentType: 'text/javascript', body: `export async function geocodeAddressCandidates(){return Array.from({length:7},(_,i)=>({addressMeta:{address:{version:1,source:{rawSource:{},status:'unresolved',address2dId:'a'+i,fallbackDisplay:{en:'Road '+i}},coordinates:[114+i/100,22.3],matchStatus:'unresolved',overrides:{}}}}))}` }))
  await page.goto('http://127.0.0.1:4173/__draft-check.html')
  await page.getByRole('textbox').fill('Road')
  const first = page.getByRole('button', { name: '1 Road 0 Road 0', exact: true })
  await first.waitFor()
  const list = first.locator('../..')
  const dimensions = await list.evaluate(element => ({ height: element.clientHeight, content: element.scrollHeight, overflow: getComputedStyle(element).overflowY }))
  if (dimensions.height !== 320 || dimensions.content !== 448 || dimensions.overflow !== 'auto') throw Error(JSON.stringify(dimensions))
  await first.hover()
  await page.waitForFunction(() => JSON.parse(document.body.dataset.markers || '[]')[0]?.highlighted)
  await list.evaluate(element => { element.scrollTop = element.scrollHeight })
  await page.getByRole('button', { name: '7 Road 6 Road 6', exact: true }).click()
  await page.waitForFunction(() => JSON.parse(document.body.dataset.markers || '[]').length === 0)
  if (errors.length) throw Error(errors.join('\n'))
  console.log(JSON.stringify({ ...dimensions, hover: true, selectionClearsPreviews: true, errors }))
} finally { await browser.close() }
