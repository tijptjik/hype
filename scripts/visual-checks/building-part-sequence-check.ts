import { chromium, firefox } from 'playwright'
import { mkdir, writeFile } from 'node:fs/promises'
const base = process.argv[2] ?? 'http://127.0.0.1:4173'
const output = 'output/playwright/building-part-sequence'
await mkdir(output, { recursive: true })
const results = []
for (const [name, engine] of [
  ['chromium', chromium],
  ['firefox', firefox],
] as const) {
  const browser = await engine.launch()
  try {
    for (const width of [1280, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 700 } })
      const errors: string[] = []
      page.on('console', message => {
        if (message.type() === 'error') console.error(message.text())
      })
      page.on('pageerror', error => {
        errors.push(error.message)
        console.error(error.message)
      })
      await page.route('**/__building-part.html*', route =>
        route.fulfill({
          contentType: 'text/html',
          body: '<html lang="en" data-theme="breadline-light"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>@layer theme,base,components,utilities;</style><script>globalThis.__sveltekit_dev={env:{}}</script></head><body><div id="app"></div><script type="module" src="/src/tests/fixtures/buildingPartSequenceCheck.ts"></script></body></html>',
        }),
      )
      await page.route('**/src/lib/api/location.remote.*', route =>
        route.fulfill({
          contentType: 'application/javascript',
          body: `export function getLocalLocationCreationAccess(){ const p=Promise.resolve({allowed:true});p.refresh=async()=>{};return p } export async function createLocalLocation(input){ (globalThis.partsCreated ??= []).push(input); return {locationId:'part-'+globalThis.partsCreated.length,revisionId:'revision'} }`,
        }),
      )
      await page.route('**/src/lib/api/buildingPart.remote.*', route =>
        route.fulfill({
          contentType: 'application/javascript',
          body: `export async function findBuildingPartParents(input){ return {data:[{id:input.kind==='building'?'building':'floor',facts:{names:{en:input.kind==='building'?'Example Building':'3/F'}}}]} }`,
        }),
      )
      await page.route('**/src/lib/api/division.remote.*', route =>
        route.fulfill({
          contentType: 'application/javascript',
          body: 'export function getAddressDivisionLabel(){return {current:null}}; export function getAddressDivisionContext(){return {current:null}}; export function getDivisionGeometry(){return {current:null}}',
        }),
      )
      await page.route('**/src/lib/locations/buildingSuggestions.ts*', route =>
        route.fulfill({
          contentType: 'application/javascript',
          body: `export async function suggestAddressBuildings(address){const rows=[{id:'building-1',kind:'building',names:{en:'Example Building'},address,buildingSource:{id:'source-1',release:'r1'}},{id:'building-2',kind:'building',names:{en:'Nearby Tower'},address:{...address,coordinates:[114.1501,22.3]},buildingSource:{id:'source-2',release:'r1'}}];return location.search.includes('nearby')?{rows,exact:false}:{rows:rows.slice(0,1),exact:true}}`,
        }),
      )
      await page.route('**/src/lib/api/buildingLocation.remote.*', route =>
        route.fulfill({
          contentType: 'application/javascript',
          body: `export async function importBuildingLocation(input){globalThis.buildingLinked=input;return {locationId:'building',revisionId:'b-r1'}}`,
        }),
      )
      await page.goto(`${base}/__building-part.html${width < 800 ? '?nearby' : ''}`)
      const building = page.locator('[data-association-building-step]')
      const nameInput = page.locator('[data-association-search] input')
      await nameInput.fill('G/F')
      await building.waitFor().catch(async error => {
        console.error(await page.locator('body').textContent())
        throw error
      })
      const button = page
        .locator('[data-association-ghost]')
        .getByRole('button', { name: 'Create building part', exact: true })
      if (!(await button.isDisabled()))
        throw Error('Creation enabled without linked building')
      if (width < 800) {
        await page
          .getByRole('complementary', { name: 'Map marker fixture' })
          .getByRole('button', { name: 'Nearby Tower' })
          .click()
        if (
          (await building
            .getByRole('button', { name: 'Nearby Tower' })
            .getAttribute('aria-pressed')) !== 'true'
        )
          throw Error('Map selection did not activate the building')
      } else {
        if (
          (await building
            .getByRole('button', { name: 'Example Building' })
            .getAttribute('aria-pressed')) !== 'true'
        )
          throw Error('Unique address match was not suggested')
      }
      await building
        .getByRole('button', { name: 'Link to building', exact: true })
        .click()
      await building
        .getByRole('button', { name: 'Building linked', exact: true })
        .waitFor()
      if (await button.isDisabled())
        throw Error('Linked building did not unlock final part')
      const enclosing = page.locator('[data-enclosing-parts]')
      for (const name of ['East Wing', '1/F']) {
        await enclosing
          .getByRole('button', { name: '+ Add enclosing part', exact: true })
          .click()
        if (!(await button.isDisabled()))
          throw Error('Unsaved enclosing part did not gate final creation')
        await enclosing.getByRole('textbox').last().fill(name)
        await enclosing
          .getByRole('button', { name: 'Create building part', exact: true })
          .click()
        await enclosing
          .getByRole('button', { name: 'Building part created', exact: true })
          .last()
          .waitFor()
      }
      await button.scrollIntoViewIfNeeded()
      await page.screenshot({ path: `${output}/${name}-${width}.png`, fullPage: true })
      await button.click()
      await page
        .locator('[data-accepted]')
        .filter({ hasText: 'parentPartId' })
        .waitFor()
      const accepted = JSON.parse(
        (await page.locator('[data-accepted]').textContent()) || '{}',
      )
      const saved = await page.evaluate(
        () =>
          (
            globalThis as unknown as {
              partsCreated: { buildingId: string; parentPartId?: string }[]
            }
          ).partsCreated,
      )
      if (
        saved.length !== 2 ||
        saved[0].buildingId !== 'building' ||
        saved[0].parentPartId ||
        saved[1].parentPartId !== 'part-1' ||
        accepted.address?.association?.parentPartId !== 'part-2'
      )
        throw Error('Hierarchy transport failed')
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      )
      if (overflow) throw Error('Horizontal overflow')
      if (errors.length) throw Error(errors.join('\n'))
      results.push({ engine: name, width, overflow, errors, hierarchyTransport: true })
      await page.close()
    }
  } finally {
    await browser.close()
  }
}
await writeFile(`${output}/results.json`, JSON.stringify(results, null, 2))
console.log(JSON.stringify(results))
