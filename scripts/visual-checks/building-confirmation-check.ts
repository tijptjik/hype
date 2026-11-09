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
      body: `let calls=0; export async function searchBuildingNames(){return ++calls === 1 ? [] : [{id:'building:fixture',kind:'building',names:{en:'C WISDOM CENTRE'},buildingSource:{id:'fixture',release:'r1'},address:{...${JSON.stringify(address)},coordinates:[114.1501,22.3]}}]}`,
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
  const useBuilding = page.getByRole('button', { name: 'Use as Building', exact: true })
  await useBuilding.click()
  const confirm = page.getByRole('button', {
    name: 'Move marker and link building',
    exact: true,
  })
  await confirm.waitFor()
  if (!(await confirm.evaluate(element => element.classList.contains('bg-primary'))))
    throw new Error('Confirmation is not primary')
  if (!(await page.getByRole('button', { name: 'Save fixture' }).isDisabled()))
    throw new Error('Pending confirmation permits saving')
  await page.screenshot({ path: 'output/playwright/building-move-confirmation.png' })
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  if (await page.getByRole('button', { name: 'Save fixture' }).isDisabled())
    throw new Error('Cancellation did not resolve pending state')
  await useBuilding.click()
  await confirm.click()
  if (await page.getByRole('button', { name: 'Save fixture' }).isDisabled())
    throw new Error('Confirmation did not resolve pending state')
  const markers = JSON.parse(
    (await page.locator('main').getAttribute('data-markers')) ?? '[]',
  )
  const selected = markers.find((marker: { selected?: boolean }) => marker.selected)
  if (selected?.number !== 1 || selected?.kind !== 'building' || selected?.color)
    throw new Error(`Wrong accepted marker: ${JSON.stringify(selected)}`)
  await page.getByRole('button', { name: 'Back to results', exact: true }).click()
  await page.locator('[data-result-kind="address"]').first().waitFor()
  if (errors.length) throw new Error(errors.join('\n'))
  console.log(
    JSON.stringify({
      primary: true,
      pendingSaveBlocked: true,
      cancelResolves: true,
      confirmResolves: true,
      acceptedMarker: selected.number,
      backToResults: true,
      errors,
    }),
  )
} finally {
  await browser.close()
}
