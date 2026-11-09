import { chromium } from 'playwright'
const browser = await chromium.launch({
  executablePath: '/home/io/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome',
  args: ['--disable-web-security'],
})
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 850 } })
  const errors: string[] = []
  page.on('pageerror', error => {
    errors.push(error.message)
    console.error(error.message)
  })
  const address = {
    version: 1,
    coordinates: [114.15, 22.3],
    matchStatus: 'resolved',
    overrides: {},
    source: {
      status: 'resolved',
      address2dId: 'fixture-address',
      rawSource: {
        data: {
          attributes: {
            i18n: {
              en: {
                formattedAddress: '',
                buildingName: 'C WISDOM CENTRE',
                streetName: 'Hollywood Road',
                buildingNumberExpression: '35',
                premisesName: 'Example Estate',
              },
            },
          },
        },
      },
      fallbackDisplay: {},
    },
  }
  await page.route('**/src/lib/api/draftLocation.remote.ts*', route =>
    route.fulfill({
      contentType: 'text/javascript',
      body: 'export async function searchDraftLocations(){return {rows:[],partial:false}}; export async function searchNearbyDraftLocations(){return {rows:[],partial:false}}',
    }),
  )
  await page.route('**/src/lib/locations/buildingSearch.ts*', route =>
    route.fulfill({
      contentType: 'text/javascript',
      body: 'export async function searchBuildingNames(){return []}',
    }),
  )
  await page.route('**/src/lib/api/division.remote.ts*', route =>
    route.fulfill({
      contentType: 'text/javascript',
      body: 'export function getAddressDivisionLabel(){return {current:null}}; export async function getAddressDivisionContext(){return {available:true,memberships:[],options:[]}}; export async function getDivisionGeometry(){return null}',
    }),
  )
  await page.route('**/src/lib/api/external/geocoding.ts*', route =>
    route.fulfill({
      contentType: 'text/javascript',
      body: `export async function geocodeAddressCandidates(){return [{addressMeta:{address:${JSON.stringify(address)}}}]}; export async function geocodeAddress(){return (await geocodeAddressCandidates())[0]}; export async function loadGeocodedAddressUnits(a){return a}; export function parseGeocodeResult(){return null}`,
    }),
  )
  await page.route('**/__address-identity.html', route =>
    route.fulfill({
      contentType: 'text/html',
      body: '<html data-theme="hype-dark"><head><meta name="viewport" content="width=device-width, initial-scale=1"><script>globalThis.__sveltekit_dev={env:{}}</script></head><body><div id="app"></div><script type="module" src="/src/tests/fixtures/addressIdentityCheck.ts"></script></body></html>',
    }),
  )
  await page.goto('http://127.0.0.1:4173/__address-identity.html')
  await page.getByRole('button', { name: 'Search by name', exact: true }).click()
  await page
    .getByRole('textbox', {
      name: 'Search for a Business, Venue, Building, or Address',
      exact: true,
    })
    .fill('Wisdom', { timeout: 15000 })
    .catch(async error => {
      console.log((await page.locator('body').innerText()).slice(0, 2500))
      console.log('url', page.url())
      await page.screenshot({
        path: 'output/playwright/address-identity-fixture-debug.png',
      })
      throw error
    })
  await page.locator('[data-result-kind="address"]').first().click()
  await page.getByRole('button', { name: 'Use as Building', exact: true }).waitFor()
  await page.screenshot({ path: 'output/playwright/address-identity-options.png' })
  await page.getByRole('button', { name: 'Use as Building', exact: true }).click()
  await page.getByRole('textbox', { name: /Name.*English/i }).waitFor()
  const support = page.locator('[data-supporting-address]')
  if ((await support.locator('textarea').inputValue()).includes('Wisdom'))
    throw new Error('Building is duplicated')
  if (
    !(await support.locator('textarea').inputValue()).includes(
      'Example Estate, 35 Hollywood Road',
    )
  )
    throw new Error('Missing supporting address')
  await page.screenshot({ path: 'output/playwright/address-building-identity.png' })
  await page.getByRole('button', { name: 'Back to results', exact: true }).click()
  await page.locator('[data-result-kind="address"]').first().click()
  await page.getByRole('button', { name: 'Establishment here', exact: true }).click()
  const name = page.getByRole('textbox', { name: /Name.*English/i })
  if (await name.inputValue())
    throw new Error('Building name became establishment identity')
  await name.fill('New Bakery')
  if (!(await support.locator('textarea').inputValue()).includes('C Wisdom Centre'))
    throw new Error('Establishment lost building guidance')
  await page.screenshot({
    path: 'output/playwright/address-establishment-identity.png',
  })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: 'output/playwright/address-identity-mobile.png' })
  if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth))
    throw new Error('Mobile overflow')
  if (errors.length) throw new Error(errors.join('\n'))
  console.log(
    JSON.stringify({
      building: true,
      establishment: true,
      mobileOverflow: false,
      errors,
    }),
  )
} finally {
  await browser.close()
}
