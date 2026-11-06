import { chromium, firefox } from 'playwright'
for (const [name, engine] of [
  ['chromium', chromium],
  ['firefox', firefox],
] as const) {
  const browser = await engine.launch()
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 1000 } })
    const errors: string[] = []
    page.setDefaultTimeout(12000)
    page.on('pageerror', e => {
      errors.push(e.message)
      console.error(e.message)
    })
    await page.route('**/src/lib/api/division.remote.ts*', route =>
      route.fulfill({
        contentType: 'text/javascript',
        body: 'export function getAddressDivisionLabel(){return {current:null}}; export async function getAddressDivisionContext(){return {available:true,memberships:[],options:[]}}; export async function getDivisionGeometry(){return null}',
      }),
    )
    await page.route('**/src/lib/api/locationDirectory.remote.ts*', route =>
      route.fulfill({
        contentType: 'text/javascript',
        body: 'export function getSharedLocationIdBySource(){return {current:null}}; export const getLocation=getSharedLocationIdBySource; export const getLocations=getSharedLocationIdBySource; export const getLocationLinkedFeatures=getSharedLocationIdBySource; export const saveLocalLocationAddress=getSharedLocationIdBySource; export const searchDirectoryLocationPlaces=getSharedLocationIdBySource',
      }),
    )
    await page.route('**/src/lib/api/draftLocation.remote.ts*', route =>
      route.fulfill({
        contentType: 'text/javascript',
        body: 'export async function searchDraftLocations(){return {rows:[],partial:false,limited:false}}; export const searchNearbyDraftLocations=searchDraftLocations',
      }),
    )
    await page.route('**/src/lib/locations/buildingSearch.ts*', route =>
      route.fulfill({
        contentType: 'text/javascript',
        body: 'export async function searchBuildingNames(){return []}; export async function searchBuildingNamesPage(){return {rows:[],nextCursor:null}}',
      }),
    )
    await page.route('**/__location-navigation.html', route =>
      route.fulfill({
        contentType: 'text/html',
        body: '<html data-theme="hype-light"><head><meta name="viewport" content="width=device-width,initial-scale=1"><script>globalThis.__sveltekit_dev={env:{}}</script></head><body><div id="app"></div><script type="module" src="/src/tests/fixtures/locationNavigationCheck.ts"></script></body></html>',
      }),
    )
    await page.goto('http://127.0.0.1:4173/__location-navigation.html', {
      waitUntil: 'domcontentloaded',
    })
    await page.locator('[data-navigation-fixture]').waitFor()
    for (const width of [1200, 390]) {
      await page.setViewportSize({ width, height: 1000 })
      await page.locator('[data-form-header-controls]').waitFor()
      await page
        .getByRole('button', { name: 'Back to proposed location', exact: true })
        .click()
      await page.locator('[data-association-proposal]').waitFor()
      await page.locator('[data-association-toolbar]').waitFor()
      if (await page.locator('[data-form-header-controls]').count())
        throw Error('Form controls leaked into proposal header')
      if (
        await page.getByRole('combobox', { name: 'Location sync', exact: true }).count()
      )
        throw Error('Sync header leaked')
      if (await page.getByRole('button', { name: 'Cancel', exact: true }).count())
        throw Error('Cancel remains')
      if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth))
        throw Error('Proposal overflow')
      await page.screenshot({
        path: 'output/playwright/navigation-' + name + '-' + width + '.png',
        animations: 'disabled',
      })
      await page.getByRole('button', { name: 'Use', exact: true }).click()
      await page.locator('[data-form-header-controls]').waitFor()
    }
    if (errors.length) throw Error(errors.join('\n'))
    console.log(
      name +
        ': editor → proposal → editor, header resets and restores, no Cancel, 1200/390px',
    )
  } finally {
    await browser.close()
  }
}
