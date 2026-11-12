import { chromium, firefox } from 'playwright'
import { mkdir } from 'node:fs/promises'
await mkdir('output/playwright/nearby-text-search', { recursive: true })
for (const [name, engine] of [
  ['chromium', chromium],
  ['firefox', firefox],
] as const) {
  const browser = await engine.launch()
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
    const errors: string[] = []
    page.on('pageerror', error => {
      errors.push(error.message)
      console.error(error.message)
    })
    await page.route('**/__nearby-search.html', route =>
      route.fulfill({
        contentType: 'text/html',
        body: '<html lang="en" data-theme="breadline-light"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>@layer theme,base,components,utilities;</style><script>globalThis.__sveltekit_dev={env:{}}</script></head><body class="bits-theme"><div id="app"></div><script type="module" src="/src/tests/fixtures/nearbyTextSearchCheck.ts"></script></body></html>',
      }),
    )
    await page.route('**/src/lib/api/draftLocation.remote.*', route =>
      route.fulfill({
        contentType: 'application/javascript',
        body: `
      const row = name => ({ id: name, facts: { names: { en: name }, location: { geometry: { type: 'Point', coordinates: [114.15,22.28] }, address: { status:'unresolved',rawSource:{},fallbackDisplay:{en:'Tak Man Street'} } } } });
      globalThis.nearbyRequests=[];
      export async function searchNearbyDraftLocations(input) { globalThis.nearbyRequests.push(input); return { rows:[row('Coffee Shop')], partial:false, limited:true }; }
      export async function searchDraftLocations(input) { globalThis.nearbyRequests.push(input); return { rows:[row('Hidden Sesame Bakery')], partial:false, limited:false, nextCursor:null }; }
    `,
      }),
    )
    await page.route('**/src/lib/api/locationAssociation.remote.*', route =>
      route.fulfill({
        contentType: 'application/javascript',
        body: 'export async function searchTargetLocations(){return {data:[]}};export async function searchDraftAssociationLocations(){return {rows:[],limited:false}}',
      }),
    )
    await page.route('**/src/lib/api/locationDirectory.remote.*', route =>
      route.fulfill({
        contentType: 'application/javascript',
        body: 'export function getSharedLocationIdBySource(){return {current:null}};export function getLocation(){return {current:null}};export function getLocationLinkedFeatures(){return {current:[]}}',
      }),
    )
    await page.route('**/src/lib/api/division.remote.*', route =>
      route.fulfill({
        contentType: 'application/javascript',
        body: 'export function getAddressDivisionLabel(){return {current:null}};export function getAddressDivisionContext(){return {current:null}};export function getDivisionGeometry(){return {current:null}}',
      }),
    )
    await page.route('**/src/lib/api/external/geocoding.*', route =>
      route.fulfill({
        contentType: 'application/javascript',
        body: 'export async function loadGeocodedAddressUnits(value){return value};export class GeocodeRequestError extends Error {};export async function geocodeAddressCandidates(){return []};export async function geocodeAddressPage(){return {rows:[],total:0,nextCursor:null,releaseSet:"test"}}',
      }),
    )
    await page.route('**/src/lib/locations/buildingSearch.*', route =>
      route.fulfill({
        contentType: 'application/javascript',
        body: 'export async function searchBuildingNames(){return []};export async function searchBuildingNamesPage(){return {rows:[],total:0,nextCursor:null}}',
      }),
    )
    await page.route('**/src/lib/addresses/placeAddressWorker.*', route =>
      route.fulfill({
        contentType: 'application/javascript',
        body: 'export function createPlaceAddressWorker(){return {structure:async rows=>rows,destroy(){}}}',
      }),
    )
    await page.goto('http://127.0.0.1:4173/__nearby-search.html')
    await page.getByRole('button', { name: 'Search Nearby', exact: true }).click()
    await page.getByRole('button', { name: /Coffee Shop/ }).waitFor()
    await page.getByRole('textbox', { name: 'Search nearby results' }).fill('Sesame')
    await page.getByRole('button', { name: /Hidden Sesame Bakery/ }).waitFor()
    const requests = await page.evaluate(
      () =>
        (
          globalThis as unknown as {
            nearbyRequests: {
              q?: string
              near?: { radius: number; coordinates: [number, number] }
            }[]
          }
        ).nearbyRequests,
    )
    const last = requests.at(-1)
    if (
      last?.q !== 'Sesame' ||
      last.near?.radius !== 300 ||
      last.near?.coordinates[0] !== 114.15
    )
      throw Error('Missing server text/circle constraints')
    if (await page.getByRole('button', { name: /Coffee Shop/ }).count())
      throw Error('Old nearby results survived the new query')
    await page.screenshot({
      path: `output/playwright/nearby-text-search/${name}.png`,
      fullPage: true,
    })
    await page.getByRole('button', { name: 'Clear nearby search' }).click()
    await page.getByRole('button', { name: /Coffee Shop/ }).waitFor()
    if (errors.length) throw Error(errors.join('\n'))
    console.log(`${name}: nearby server search and clear passed`)
  } finally {
    await browser.close()
  }
}
