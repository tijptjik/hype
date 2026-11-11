import { chromium, firefox } from 'playwright'
import { mkdir, writeFile } from 'node:fs/promises'
import { DEFAULT_FEATURE_TYPES } from '../../src/lib/features/intents'
const base = process.argv[2] ?? 'http://127.0.0.1:5175'
const output = 'output/playwright/marker-coordinate-ownership'
await mkdir(output, { recursive: true })
const mock = `const types=${JSON.stringify(DEFAULT_FEATURE_TYPES)};
export async function getFeatureIntentOptions(){return types}
let version=0,definition=null;
export async function getFeatureIntentSettings(){return {types:definition??types,inheritedTypes:types,definition,version,fingerprint:String(version),lineage:[]}}
export async function getFeatureNameFieldsProject(){return 'project'}
export async function getFeatureNameProperties(){return [{id:'paid',label:'Paid area'}]}
export async function updateFeatureIntentSettings(input){definition=input.definition;globalThis.__savedFeatureTypes=definition;version++;return {saved:true}}
`
const reports = []
for (const [name, engine] of [
  ['chromium', chromium],
  ['firefox', firefox],
] as const) {
  const browser = await engine.launch()
  try {
    for (const width of [1440, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 } })
      const errors: string[] = []
      page.on('pageerror', e => {
        errors.push(e.message)
        console.log('PAGE ERROR', e.message)
      })
      page.on('response', response => {
        if (response.status() >= 400)
          console.log('HTTP', response.status(), response.url())
      })
      await page.route('**/__target-context.html', route =>
        route.fulfill({
          contentType: 'text/html',
          body: '<html lang="en" data-theme="breadline-light"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>@layer theme,base,components,utilities;</style><script>globalThis.__sveltekit_dev={env:{}}</script></head><body class="bits-theme"><div id="app"></div><script type="module" src="/src/tests/fixtures/targetContextCheck.ts"></script></body></html>',
        }),
      )
      await page.route('**/src/lib/api/featureIntents.remote.*', route =>
        route.fulfill({ contentType: 'application/javascript', body: mock }),
      )
      await page.goto(`${base}/__target-context.html`)
      await page.locator('[data-address-display-group]').waitFor()
      if (await page.locator('vite-error-overlay').count())
        throw new Error(
          await page
            .locator('vite-error-overlay')
            .evaluate(el => el.shadowRoot?.textContent ?? 'Vite overlay'),
        )
      await page
        .getByRole('group', { name: 'Display location using' })
        .getByRole('button', { name: 'Plus Code', exact: true })
        .click()
      if (
        (await page.locator('[data-location-display]').textContent()) !== '6FG22222+22'
      )
        throw Error('Plus Code selection failed')
      await page.getByRole('button', { name: 'Move test marker' }).click()
      if (
        (await page.locator('[data-location-display]').textContent()) !== '8FVC9G8F+6X'
      )
        throw Error('Marker change left a stale code')
      await page
        .getByRole('group', { name: 'Display location using' })
        .getByRole('button', { name: 'Automatic', exact: true })
        .click()
      if (
        (await page.locator('[data-location-display]').textContent()) !==
        '123 Example Road'
      )
        throw Error('Automatic address preference failed')
      const unavailable = page.getByRole('button', {
        name: 'What3Words — not yet available',
      })
      if (!(await unavailable.isDisabled())) throw Error('What3Words must be disabled')
      await page.screenshot({ path: `${output}/${name}-${width}.png` })
      reports.push({ browser: name, width, markerPlusCodeUpdated: true, errors })
      if (errors.length) throw Error(errors.join('\n'))
      await page.close()
    }
  } finally {
    await browser.close()
  }
}
await writeFile(`${output}/report.json`, JSON.stringify(reports, null, 2))
console.log(JSON.stringify(reports, null, 2))
