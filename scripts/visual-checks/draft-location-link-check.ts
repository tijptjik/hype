import { chromium, firefox } from 'playwright'
for (const [name, engine] of [
  ['chromium', chromium],
  ['firefox', firefox],
] as const) {
  const browser = await engine.launch({ headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 600 } })
    const pending = new Set<string>()
    page.on('request', request => pending.add(request.url()))
    page.on('requestfinished', request => pending.delete(request.url()))
    page.on('requestfailed', request => {
      pending.delete(request.url())
      console.error(request.url(), request.failure())
    })
    page.on('console', message => {
      if (message.type() === 'error') console.error(message.text())
    })
    page.on('pageerror', error => console.error(error.message))
    page.on('response', async response => {
      if (response.status() >= 400)
        console.error(response.url(), (await response.text()).slice(0, 1000))
    })
    await page.route('**/src/lib/api/locationDirectory.remote.ts*', route =>
      route.fulfill({
        contentType: 'application/javascript',
        body: 'export function getSharedLocationIdBySource(){return {current:null}}; export function getLocation(){return {current:null}}; export function getLocations(){return {current:{data:[]}}}; export function getLocationLinkedFeatures(){return {current:[]}}; export function searchDirectoryLocationPlaces(){return {current:[]}}; export async function saveLocalLocationAddress(){throw Error("Unexpected write")}',
      }),
    )
    await page.route('**/__location-link.html*', route =>
      route.fulfill({
        contentType: 'text/html',
        body: '<html lang="en" data-theme="breadline-light"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>@layer theme,base,components,utilities;</style><script>globalThis.__sveltekit_dev={env:{}}</script></head><body class="bits-theme"><div id="app"></div><script type="module" src="/src/tests/fixtures/draftLocationLinkCheck.ts"></script></body></html>',
      }),
    )
    await page.route('**/admin/locations/bakery', route =>
      route.fulfill({
        contentType: 'text/html',
        body: '<h1>Location details target</h1>',
      }),
    )
    await page.goto('http://127.0.0.1:4173/__location-link.html')
    const link = page.getByRole('link', { name: 'A1 Bakery' })
    await link.waitFor({ timeout: 5000 }).catch(async error => {
      console.error(await page.locator('body').textContent(), [...pending])
      throw error
    })
    if ((await link.getAttribute('href')) !== '/admin/locations/bakery')
      throw new Error('Wrong Location identity')
    if (
      !(
        await link
          .locator('span')
          .evaluate(element => getComputedStyle(element).textDecorationLine)
      ).includes('underline')
    )
      throw new Error('Missing link affordance')
    await link.focus()
    await page.keyboard.press('Enter')
    await page.waitForURL('**/admin/locations/bakery')
    await page.route('**/admin/locations/building/garden?*', route =>
      route.fulfill({
        contentType: 'text/html',
        body: '<h1>Building details target</h1>',
      }),
    )
    await page.goto('http://127.0.0.1:4173/__location-link.html?building=1')
    const building = page.getByRole('link', { name: 'Garden Bakery' })
    await building.waitFor()
    if (
      (await building.getAttribute('href')) !==
      '/admin/locations/building/garden?release=r1&address=second'
    )
      throw new Error('Building target lost its source identity')
    await building.click()
    await page.waitForURL(
      '**/admin/locations/building/garden?release=r1&address=second',
    )
    await page.goto('http://127.0.0.1:4173/__location-link.html?draft=1')
    const draftLink = page.getByRole('link', { name: 'A1 Bakery' })
    await draftLink.waitFor()
    if ((await draftLink.getAttribute('href')) !== '/admin/locations/new')
      throw new Error('Unpersisted selection is not reviewable')
    await draftLink.focus()
    await page.keyboard.press('Enter')
    await page.waitForFunction(
      () => document.getElementById('app')?.dataset.reviewOpened === 'true',
    )
    if (!page.url().includes('__location-link.html'))
      throw new Error('Draft review bypassed its checkpoint callback')
    console.log(
      `${name}: saved Location/building links navigate; unpersisted establishment invokes draft review`,
    )
  } finally {
    await browser.close()
  }
}
