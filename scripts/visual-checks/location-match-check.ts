import { chromium, firefox } from 'playwright'
import { mkdir } from 'node:fs/promises'
for (const [engine, width] of [
  [chromium, 1100],
  [firefox, 640],
] as const) {
  const browser = await engine.launch(
    engine === chromium ? { args: ['--disable-web-security'] } : {},
  )
  try {
    const page = await browser.newPage({ viewport: { width, height: 850 } })
    const errors: string[] = []
    page.on(
      'pageerror',
      error => (errors.push(error.message), console.error(error.message)),
    )
    await page.route('**/src/lib/api/location.remote.ts*', route => {
      if (route.request().url().includes('original')) return route.continue()
      return route.fulfill({
        contentType: 'text/javascript',
        body: "export * from '/src/lib/api/location.remote.ts?original'; export function getFeatureLocation(){return Object.assign(Promise.resolve(null),{current:null})}; export function getFeatureLocationDiscoverySettings(){return Object.assign(Promise.resolve({}),{current:{}})}",
      })
    })
    await page.route('**/src/lib/api/draftLocation.remote.ts*', route =>
      route.fulfill({
        contentType: 'text/javascript',
        body: 'export async function searchDraftLocations(input){globalThis.matchQuery=input.q;return {rows:[],partial:false}};export async function searchNearbyDraftLocations(input){globalThis.nearbyPoint=input.coordinates;return {rows:[],partial:false}}',
      }),
    )
    await page.route('**/src/lib/locations/buildingSearch.ts*', route =>
      route.fulfill({
        contentType: 'text/javascript',
        body: 'export async function searchBuildingNames(){return []};export async function searchBuildingNamesPage(){return {rows:[],total:0,nextCursor:null}}',
      }),
    )
    await page.route('**/src/lib/api/external/geocoding.ts*', route => {
      if (route.request().url().includes('original')) return route.continue()
      return route.fulfill({
        contentType: 'text/javascript',
        body: "export * from '/src/lib/api/external/geocoding.ts?original';export async function geocodeAddressCandidates(){return []};export async function geocodeAddressPage(){return {rows:[],total:0,nextCursor:null,releaseSet:''}}",
      })
    })
    await page.route('**/__location-match.html', route =>
      route.fulfill({
        contentType: 'text/html',
        body: '<html lang="en" data-theme="breadline-light"><head><script>globalThis.__sveltekit_dev={env:{}}</script></head><body><div id="app"></div><script type="module" src="/src/tests/fixtures/locationMatchCheck.ts"></script></body></html>',
      }),
    )
    await page.goto('http://127.0.0.1:4173/__location-match.html')
    await page
      .getByRole('button', { name: 'Match address to location', exact: true })
      .waitFor({ timeout: 60000 })
      .catch(async error => {
        console.error((await page.locator('body').innerText()).slice(0, 2500))
        throw error
      })
    if (
      !(await page.locator('[data-address-toolbar-display]').textContent())?.includes(
        'Por Mee',
      ) &&
      !(
        await page.locator('[data-address-toolbar-display] input').first().inputValue()
      ).includes('Por Mee')
    )
      throw Error('Missing display address')
    if (await page.locator('[data-location-search-notice]').count())
      throw Error('Idle search warning')
    if (
      await page.getByRole('button', { name: 'Create Location', exact: true }).count()
    )
      throw Error('Manual creation offered')
    await mkdir('output/playwright', { recursive: true })
    await page.screenshot({
      path: `output/playwright/location-match-idle-${engine.name()}.png`,
    })
    await page
      .locator('[data-address-onboarding]')
      .getByRole('button', { name: 'Match address to location', exact: true })
      .click()
    await page.waitForFunction(
      () => (globalThis as any).matchQuery === 'Por Mee Factory Building',
    )
    if (await page.locator('[data-location-discovery-actions]').count())
      throw Error('Entry actions remain visible inside matching')
    await page.screenshot({
      path: `output/playwright/location-match-active-${engine.name()}.png`,
    })
    await page.getByRole('button', { name: 'Clear search', exact: true }).click()
    if (await page.getByText('Know the name or address?', { exact: true }).count())
      throw Error('Record resolution showed starter prompts')
    await page.getByRole('button', { name: 'Map pin', exact: true }).click()
    await page.waitForFunction(
      () => JSON.stringify((globalThis as any).nearbyPoint) === '[114.152,22.34]',
    )
    await page.screenshot({
      path: `output/playwright/location-match-nearby-${engine.name()}.png`,
    })
    if (await page.locator('[data-location-discovery-actions]').count())
      throw Error('Entry actions remain visible inside nearby discovery')
    await page.getByRole('button', { name: 'Back to location', exact: true }).click()
    if (
      await page
        .getByRole('textbox', {
          name: 'Search for a Business, Venue, Building, or Address',
          exact: true,
        })
        .count()
    )
      throw Error('Back did not leave resolution')
    if (await page.locator('[data-location-discovery-actions]').count())
      throw Error('Back did not cancel editing')
    if (errors.length) throw Error(errors.join('\n'))
    console.log(
      'PASS: seeded address resolution, no starter prompts or entry actions, coordinate switching, Back cancels editing',
    )
  } finally {
    await browser.close()
  }
}
