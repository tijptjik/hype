import { chromium, firefox } from 'playwright'
import { mkdir, writeFile } from 'node:fs/promises'
const base = process.argv[2] ?? 'http://127.0.0.1:5175'
const output = 'output/playwright/building-parts'
await mkdir(output, { recursive: true })
const results = []
for (const [name, engine] of [
  ['chromium', chromium],
  ['firefox', firefox],
] as const) {
  const browser = await engine.launch()
  try {
    for (const width of [1280, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 } })
      const errors: string[] = []
      page.on('pageerror', error => errors.push(error.message))
      await page.route('**/__building-part.html', route =>
        route.fulfill({
          contentType: 'text/html',
          body: '<html lang="en" data-theme="breadline-light"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>@layer theme,base,components,utilities;</style><script>globalThis.__sveltekit_dev={env:{}}</script></head><body><div id="app"></div><script type="module" src="/src/tests/fixtures/buildingPartCheck.ts"></script></body></html>',
        }),
      )
      await page.route('**/src/lib/api/location.remote.*', route =>
        route.fulfill({
          contentType: 'application/javascript',
          body: `export function getLocalLocationCreationAccess(){ const p=Promise.resolve({allowed:true});p.refresh=async()=>{};return p } export async function createLocalLocation(input){ globalThis.partCreated=input; return {locationId:'created-part',revisionId:'revision'} }`,
        }),
      )
      await page.route('**/src/lib/api/buildingPart.remote.*', route =>
        route.fulfill({
          contentType: 'application/javascript',
          body: `export async function findBuildingPartParents(input){ return {data:[{id:input.kind==='building'?'building':'floor',facts:{names:{en:input.kind==='building'?'Example Building':'3/F'}}}]} }`,
        }),
      )
      await page.goto(`${base}/__building-part.html`)
      await page
        .locator('[data-building-part-parents]')
        .waitFor({ timeout: 15000 })
        .catch(async error => {
          console.error(errors, await page.locator('body').textContent())
          throw error
        })
      const buttons = page
        .locator('[data-create-location-form] button')
        .filter({ hasText: /Create/ })
      if (!(await buttons.first().isDisabled()))
        throw Error('Creation enabled without building')
      await page.locator('[data-building-part-parents] input').first().fill('Example')
      await page
        .locator('[data-building-part-parents] select')
        .first()
        .selectOption('building')
      await page.locator('[data-building-part-parents] input').nth(1).fill('3/F')
      await page
        .locator('[data-building-part-parents] select')
        .nth(1)
        .selectOption('floor')
      await page.screenshot({ path: `${output}/${name}-${width}.png`, fullPage: true })
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      )
      if (overflow) throw Error('Horizontal viewport overflow')
      await buttons.first().click()
      await page.locator('[data-created]').filter({ hasText: 'created-part' }).waitFor()
      const saved = await page.evaluate(
        () =>
          (
            globalThis as unknown as {
              partCreated: { kind: string; buildingId: string; parentPartId: string }
            }
          ).partCreated,
      )
      if (
        saved.kind !== 'building_part' ||
        saved.buildingId !== 'building' ||
        saved.parentPartId !== 'floor'
      )
        throw Error('Membership not transported')
      if (errors.length) throw Error(errors.join('\n'))
      results.push({ engine: name, width, overflow, errors, membershipTransport: true })
      await page.close()
    }
  } finally {
    await browser.close()
  }
}
await writeFile(`${output}/results.json`, JSON.stringify(results, null, 2))
console.log(JSON.stringify(results))
