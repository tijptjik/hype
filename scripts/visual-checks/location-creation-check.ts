import { chromium, firefox } from 'playwright'
import { mkdir } from 'node:fs/promises'
await mkdir('output/playwright/location-creation', { recursive: true })
for (const [name, engine] of [
  ['chromium', chromium],
  ['firefox', firefox],
] as const) {
  const browser = await engine.launch({
    args: name === 'chromium' ? ['--disable-web-security'] : [],
  })
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
    const errors: string[] = []
    page.on('pageerror', error => {
      errors.push(error.message)
      console.error(error.message)
    })
    page.on('console', message => {
      if (message.type() === 'error') console.error(message.text())
    })
    await page.route('**/__location-creation.html', route =>
      route.fulfill({
        contentType: 'text/html',
        body: '<html lang="en" data-theme="breadline-light"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>@layer theme,base,components,utilities;</style><script>globalThis.__sveltekit_dev={env:{}}</script></head><body class="bits-theme"><div id="app"></div><script type="module" src="/src/tests/fixtures/locationCreationCheck.ts"></script></body></html>',
      }),
    )
    await page.route(
      '**/src/lib/bits/patterns/forms/formMapSection/components/MapPrimitive.svelte*',
      route =>
        route.fulfill({
          contentType: 'application/javascript',
          body: "export {default} from '/src/tests/fixtures/components/LocationSharedMapStub.svelte'",
        }),
    )
    await page.route('**/src/lib/context/admin.svelte.ts*', route =>
      route.fulfill({
        contentType: 'application/javascript',
        body: 'export function getAdminCtx(){return window.__locationCreationAdmin}',
      }),
    )
    await page.route('**/src/lib/context/header.svelte.ts*', route =>
      route.fulfill({
        contentType: 'application/javascript',
        body: 'export function getHeaderCtrl(){return {setHeaderForEntity(){},setCrumbs(){},setEditing(){},setFormActions(value){window.__reviewActions=value}}}',
      }),
    )
    await page.route('**/src/lib/api/location.remote.ts*', route =>
      route.fulfill({
        contentType: 'application/javascript',
        body: 'export async function importFeatureLocationCandidate(){throw Error("Unexpected write")};export async function createLocalLocation(){throw Error("Unexpected write")};export async function importDraftLocationCandidate(){throw Error("Unexpected write")}',
      }),
    )
    await page.route('**/src/lib/api/buildingLocation.remote.ts*', route =>
      route.fulfill({
        contentType: 'application/javascript',
        body: 'export async function importBuildingLocation(){throw Error("Unexpected write")}',
      }),
    )
    await page.route('**/src/lib/api/locationDirectory.remote.ts*', route =>
      route.fulfill({
        contentType: 'application/javascript',
        body: 'export function getLocation(){return {current:null}};export async function saveLocalLocationAddress(){throw Error("Unexpected write")}',
      }),
    )
    await page.route('**/src/lib/api/division.remote.*', route =>
      route.fulfill({
        contentType: 'application/javascript',
        body: 'export function getAddressDivisionLabel(){return {current:null}};export function getAddressDivisionContext(){return {current:null}};export function getDivisionGeometry(){return {current:null}}',
      }),
    )
    page.on('response', async response => {
      if (response.status() >= 400)
        console.error(response.url(), (await response.text()).slice(0, 1800))
    })
    await page.goto('http://127.0.0.1:4173/__location-creation.html')
    await page.getByRole('link', { name: 'Back to Feature' }).waitFor()
    await page.getByRole('button', { name: 'Hei Lee Cake Shop', exact: true }).click()
    const input = page.getByRole('textbox').filter({ visible: true })
    // Property values, rather than attributes, identify the rendered name editor.
    const index = await input.evaluateAll(inputs =>
      inputs.findIndex(el => (el as HTMLInputElement).value === 'Hei Lee Cake Shop'),
    )
    if (index < 0) throw Error('Location name editor is missing')
    await input.nth(index).fill('Reviewed Cake Shop')
    await page.waitForFunction(() =>
      document
        .querySelector('[data-review-state]')
        ?.textContent?.includes('Reviewed Cake Shop'),
    )
    await page.getByRole('link', { name: 'Back to Feature' }).scrollIntoViewIfNeeded()
    await page.screenshot({
      path: `output/playwright/location-creation/${name}.png`,
      fullPage: true,
    })
    if (errors.length) throw Error(errors.join('\n'))
    console.log(`${name}: rendered draft edits retained`)
  } finally {
    await browser.close()
  }
}
