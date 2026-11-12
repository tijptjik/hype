import { chromium, firefox } from 'playwright'
import { mkdir } from 'node:fs/promises'
await mkdir('output/playwright/location-fallback', { recursive: true })
for (const [name, engine] of [
  ['chromium', chromium],
  ['firefox', firefox],
] as const) {
  const browser = await engine.launch()
  try {
    for (const width of [1440, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } })
      const errors: string[] = []
      page.on('pageerror', error => errors.push(error.message))
      await page.route('**/__fallback.html*', route =>
        route.fulfill({
          contentType: 'text/html',
          body: '<html lang="en" data-theme="breadline-light"><head><meta name="viewport" content="width=device-width,initial-scale=1"><script>globalThis.__sveltekit_dev={env:{}}</script></head><body class="bits-theme"><div id="app"></div><script type="module" src="/src/tests/fixtures/locationFallbackCheck.ts"></script></body></html>',
        }),
      )
      const mocks: Record<string, string> = {
        'draftLocation.remote':
          'export async function searchDraftLocations({q}){await new Promise(r=>setTimeout(r,350));return {rows:q==="Rows"?Array.from({length:45},(_,i)=>({id:"bakery-"+i,facts:{names:{en:"Arome Bakery "+i},classification:{basicCategory:"bakery"},location:{geometry:{type:"Point",coordinates:[114.1+i/10000,22.3]},address:{status:"unresolved",rawSource:{},fallbackDisplay:{en:"Shop "+i+", Test Road"}}}}})):[],partial:false}}; export async function searchNearbyDraftLocations(){return {rows:[],partial:false}}',
        'locationAssociation.remote':
          'export async function searchTargetLocations(){return {data:[]}}; export async function searchDraftAssociationLocations(){return {rows:[],limited:false}}',
        'locationDirectory.remote':
          'export function getSharedLocationIdBySource(){return {current:null}}; export function getLocation(){return {current:null}}; export function getLocationLinkedFeatures(){return {current:[]}}; export function getLocations(){return {current:[]}}; export async function saveLocalLocationAddress(){}; export async function searchDirectoryLocationPlaces(){return []}',
        'division.remote':
          'export function getAddressDivisionLabel(){return {current:null}}; export function getAddressDivisionContext(){return {current:null}}; export function getDivisionGeometry(){return {current:null}}',
      }
      for (const [file, body] of Object.entries(mocks))
        await page.route(`**/src/lib/api/${file}.*`, route =>
          route.fulfill({ contentType: 'application/javascript', body }),
        )
      await page.route('**/src/lib/locations/buildingSearch.ts*', route =>
        route.fulfill({
          contentType: 'application/javascript',
          body: 'export async function searchBuildingNames(){return []};export async function searchBuildingNamesPage(){return {rows:[],nextCursor:null,total:0}}',
        }),
      )
      await page.route('**/src/lib/api/external/geocoding.ts*', route =>
        route.fulfill({
          contentType: 'application/javascript',
          body: 'export class GeocodeRequestError extends Error{};export async function geocodeAddressCandidates(){return []};export async function geocodeAddressPage(){return {candidates:[],nextCursor:null,total:0}}',
        }),
      )
      await page.goto('http://127.0.0.1:5175/__fallback.html')
      try {
        const building = page.getByRole('button', { name: 'Building', exact: true })
        await building.waitFor({ timeout: 15000 })
        if ((await building.getAttribute('aria-pressed')) !== 'false')
          throw Error('Building enabled initially')
        await page
          .getByRole('button', {
            name: 'Can’t find what you’re looking for?',
            exact: true,
          })
          .click()
        await page
          .getByRole('button', { name: 'Search buildings', exact: true })
          .waitFor()
        await page
          .getByRole('region', { name: 'Find another starting point' })
          .scrollIntoViewIfNeeded()
        await page.waitForTimeout(350)
        await page.screenshot({
          path: `output/playwright/location-fallback/${name}-${width}.png`,
        })
        await page
          .getByRole('button', { name: 'Search buildings', exact: true })
          .click()
        await page
          .getByRole('button', {
            name: 'Can’t find what you’re looking for?',
            exact: true,
          })
          .click()
        await page
          .getByRole('button', { name: 'Search addresses', exact: true })
          .click()
        await page
          .getByRole('button', {
            name: 'Can’t find what you’re looking for?',
            exact: true,
          })
          .click()
        await page
          .getByRole('button', { name: 'Create a custom establishment', exact: true })
          .click()
        await page.getByText('Custom establishment requested').waitFor()
        if (
          await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
        )
          throw Error('Horizontal overflow')
        if (errors.length) throw Error(errors.join('\n'))
      } catch (error) {
        console.log(
          errors,
          await page.locator('vite-error-overlay').allTextContents(),
          await page.locator('body').innerText(),
        )
        throw error
      }
      await page.goto('http://127.0.0.1:5175/__fallback.html?rows')
      await page.locator('[data-result-id]').first().waitFor()
      const list = page
        .locator('section')
        .filter({ has: page.locator('[data-result-id]') })
        .last()
      await list.evaluate(element => {
        element.scrollTop = 500
      })
      const before = await list.evaluate(element => element.scrollTop)
      const row = page.locator('[data-result-id]').nth(8)
      await row.click()
      const after = await list.evaluate(element => element.scrollTop)
      if (Math.abs(after - before) > 1)
        throw Error(`Row selection scrolled: ${before} -> ${after}`)
      if (await page.getByRole('button', { name: 'Create here', exact: true }).count())
        throw Error('Same-kind creation offered')
      const headingInsideRow = await page
        .locator('[data-search-result]')
        .first()
        .innerText()
      if (headingInsideRow.includes('Matching locations'))
        throw Error('Group heading inside highlight')
      await list.evaluate(element => {
        element.scrollTop = element.scrollHeight
        element.dispatchEvent(new Event('scroll'))
      })
      await page.waitForFunction(
        () => document.querySelector('main')?.getAttribute('data-at-end') === 'true',
      )
      await page.screenshot({
        path: `output/playwright/location-fallback/${name}-${width}-results.png`,
      })
      await page.getByRole('button', { name: 'Use this location', exact: true }).click()
      await page.locator('[data-selected]').waitFor()
      if (await page.locator('[data-location-association-picker]').count())
        throw Error('Redundant establishment review')
      await page.close()
      console.log(`${name} ${width}: passed`)
    }
  } finally {
    await browser.close()
  }
}
