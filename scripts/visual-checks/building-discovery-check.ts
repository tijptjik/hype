import { chromium } from 'playwright'
const browser = await chromium.launch({
  executablePath: '/home/io/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome',
  args: ['--disable-web-security'],
})
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 1050 } })
  const errors: string[] = []
  const resourceFailures: { status: number; path: string }[] = []
  page.on('response', response => {
    if (response.status() >= 400) {
      const failure = {
        status: response.status(),
        path: new URL(response.url()).pathname,
      }
      resourceFailures.push(failure)
      console.log('resourceFailure', failure)
    }
  })
  page.on('requestfailed', req =>
    console.log('requestfailed', req.url(), req.failure()),
  )
  page.on('console', message => {
    if (message.type() === 'error') console.log('console error', message.text())
  })
  page.on('pageerror', error => {
    errors.push(error.message)
    console.log('pageerror', error.message)
  })
  await page.route('**/src/lib/api/draftLocation.remote.ts*', route =>
    route.fulfill({
      contentType: 'text/javascript',
      body: 'export async function searchDraftLocations(){return {rows:[],partial:false}}; export async function searchNearbyDraftLocations(){return {rows:[],partial:false}}',
    }),
  )
  await page.route('**/src/lib/api/division.remote.ts*', route =>
    route.fulfill({
      contentType: 'text/javascript',
      body: 'export function getAddressDivisionLabel(){return {current:null}}; export async function getAddressDivisionContext(){return {available:true,memberships:[],options:[]}}; export async function getDivisionGeometry(){return null}',
    }),
  )
  await page.route('**/__building-discovery.html', route =>
    route.fulfill({
      contentType: 'text/html',
      body: '<html data-theme="hype-dark"><head><meta name="viewport" content="width=device-width, initial-scale=1"><script>globalThis.__sveltekit_dev={env:{}}</script></head><body><div id="app"></div><script type="module" src="/src/tests/fixtures/buildingDiscoveryCheck.ts"></script></body></html>',
    }),
  )
  await page.goto('http://hype.localhost/__building-discovery.html', {
    waitUntil: 'domcontentloaded',
  })
  console.log('initial', (await page.locator('body').innerText()).slice(0, 800), errors)
  await page.getByRole('button', { name: 'Search by name', exact: true }).click()
  const input = page.getByRole('textbox').first()
  await input.fill('hollywood building')
  await page
    .locator('[data-result-kind="building"]')
    .first()
    .waitFor({ timeout: 60000 })
  await page.waitForFunction(
    () => document.querySelectorAll('[data-result-kind="building"]').length === 1,
    { timeout: 60000 },
  )
  console.log('grouped', await page.locator('[data-result-id]').allTextContents())
  await page.screenshot({ path: 'output/playwright/building-search-grouped.png' })
  await page.locator('[data-result-kind="address"]').first().click()
  // Expand address alternatives before selecting a concrete source record.
  if (await page.getByRole('button', { name: 'Back to results', exact: true }).count())
    await page.locator('[data-result-kind="address"]').first().click()
  await page.getByRole('button', { name: 'Use as Building', exact: true }).click()
  const warning = page.locator('[data-building-move-warning]')
  await warning.waitFor({ timeout: 60000 })
  console.log('warning', await warning.innerText())
  await page.screenshot({ path: 'output/playwright/building-marker-warning.png' })
  await page
    .getByRole('button', { name: 'Move marker and link building', exact: true })
    .click()
  await page.waitForFunction(
    () =>
      !!JSON.parse(
        document.querySelector('[data-selection]')!.getAttribute('data-selection')!,
      ).buildingSource,
  )
  console.log(
    'acceptedBuildingSource',
    JSON.parse((await page.locator('[data-selection]').getAttribute('data-selection'))!)
      .buildingSource,
  )
  await page.screenshot({ path: 'output/playwright/building-marker-linked.png' })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: 'Search by name', exact: true }).click()
  await page.getByRole('button', { name: 'Building', exact: true }).click()
  await page.getByRole('textbox').first().fill('hollywood building')
  await page.locator('[data-result-kind="address"]').first().waitFor({ timeout: 60000 })
  await page.locator('[data-result-kind="address"]').first().click()
  if (
    !(await page.getByRole('button', { name: 'Use as Building', exact: true }).count())
  )
    await page.locator('[data-result-kind="address"]').first().click()
  await page.getByRole('button', { name: 'Use as Building', exact: true }).click()
  await warning.waitFor({ timeout: 60000 })
  await page.waitForFunction(
    () =>
      !!document.querySelector('[data-location-candidate]') &&
      [...document.querySelectorAll('[data-location-candidate]')].some(
        element =>
          (element as HTMLElement).style.backgroundColor === 'rgb(59, 130, 246)',
      ),
  )
  await page.screenshot({
    path: 'output/playwright/building-background-blue-marker.png',
  })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({
    path: 'output/playwright/building-marker-warning-mobile.png',
  })
  if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth))
    throw new Error('Mobile overflow')
  if (errors.length) throw new Error(errors.join('\n'))
  console.log(
    JSON.stringify({
      liveBuildingGrouping: true,
      markerConfirmation: true,
      backgroundBlueMarker: true,
      mobileOverflow: false,
      errors,
      resourceFailures,
    }),
  )
} catch (error) {
  console.error(error)
  throw error
} finally {
  await browser.close()
}
