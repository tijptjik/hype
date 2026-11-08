import { chromium } from 'playwright'
const browser = await chromium.launch({
  executablePath: '/home/io/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome',
  args: ['--disable-web-security'],
})
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 700 } })
  const errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  await page.route('**/__find-check.html', route =>
    route.fulfill({
      contentType: 'text/html',
      body: '<html><head><script>globalThis.__sveltekit_dev={env:{}}</script></head><body><div id="app" style="display:flex;flex-direction:column;min-height:650px"></div><script type="module" src="/src/tests/fixtures/draftSearchCheck.ts"></script></body></html>',
    }),
  )
  await page.route('**/src/lib/api/draftLocation.remote.*', route =>
    route.fulfill({
      contentType: 'text/javascript',
      body: 'export async function searchDraftLocations(){return {rows:[],partial:false}}; export async function searchNearbyDraftLocations(){return {rows:[],partial:false}}',
    }),
  )
  await page.goto('http://127.0.0.1:4173/__find-check.html')
  await page.getByRole('button', { name: 'Search by name', exact: true }).click()
  if (!(await page.getByRole('textbox').evaluate(el => el === document.activeElement)))
    throw Error('Search not focused')
  await page.screenshot({ path: 'output/playwright/find-mode-desktop.png' })
  await page.getByRole('button', { name: 'Map pin', exact: true }).click()
  if (await page.getByRole('textbox').count()) throw Error('Search still visible')
  await page.getByRole('button', { name: 'Find by Search', exact: true }).click()
  await page.setViewportSize({ width: 390, height: 800 })
  await page.screenshot({ path: 'output/playwright/find-mode-mobile.png' })
  if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth))
    throw Error('Horizontal overflow')
  if (errors.length) throw Error(errors.join('\n'))
  console.log('Desktop/mobile controls, focus and mode visibility passed')
} finally {
  await browser.close()
}
