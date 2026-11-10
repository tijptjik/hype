import { chromium, firefox } from 'playwright'
import { mkdir, writeFile } from 'node:fs/promises'
import { DEFAULT_FEATURE_TYPES } from '../../src/lib/features/intents'

const base = process.argv[2] ?? 'http://127.0.0.1:5175'
const output = 'output/playwright/feature-intent'
await mkdir(output, { recursive: true })
const mock = `
const types=${JSON.stringify(DEFAULT_FEATURE_TYPES)};
let definition=null, version=0;
globalThis.intentSaves=[];
export async function getFeatureIntentOptions({layerId}) { return layerId==='signs' ? [{...types[0],id:'ghost-sign',label:'Ghost sign on an addressless structure'}] : types }
export async function getFeatureIntentSettings() { return {types:definition??types,inheritedTypes:types,definition,version,fingerprint:String(version),lineage:[]} }
export async function updateFeatureIntentSettings(input) { definition=input.definition;version++;globalThis.intentSaves.push(input);return {saved:true} }
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
      page.on('pageerror', error => errors.push(error.message))
      await page.route('**/__feature-intent.html', route =>
        route.fulfill({
          contentType: 'text/html',
          body: '<html lang="en" data-theme="breadline-light"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>@layer theme,base,components,utilities;</style><script>globalThis.__sveltekit_dev={env:{}}</script></head><body><div id="app"></div><script type="module" src="/src/tests/fixtures/featureIntentCheck.ts"></script></body></html>',
        }),
      )
      await page.route('**/src/lib/api/featureIntents.remote.*', route =>
        route.fulfill({ contentType: 'application/javascript', body: mock }),
      )
      await page.goto(`${base}/__feature-intent.html`)
      await page.getByRole('button', { name: 'Natural feature', exact: true }).click()
      if ((await page.locator('[data-selected]').textContent()) !== 'natural')
        throw new Error('Intent selection failed')
      await page.getByRole('button', { name: 'Switch layer' }).click()
      await page
        .getByText('Ghost sign on an addressless structure', { exact: true })
        .waitFor()
      if ((await page.locator('[data-selected]').textContent()) !== 'ghost-sign')
        throw new Error('Single-type inference failed')
      await page.getByLabel('Inherit hub defaults').uncheck()
      await page
        .getByLabel('Display name', { exact: true })
        .first()
        .fill('A long object label that must remain readable on narrow screens')
      await page
        .getByRole('button', { name: 'Save feature type settings', exact: true })
        .click()
      await page.getByText('Feature type settings saved.', { exact: true }).waitFor()
      await page.screenshot({ path: `${output}/${name}-${width}.png`, fullPage: true })
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      )
      if (overflow || errors.length)
        throw new Error(JSON.stringify({ overflow, errors }))
      await page
        .getByRole('button', { name: 'Reset to hub defaults', exact: true })
        .click()
      await page
        .getByRole('button', { name: 'Save feature type settings', exact: true })
        .click()
      await page.waitForFunction(
        () =>
          (
            globalThis as unknown as { intentSaves: { definition: unknown }[] }
          ).intentSaves.at(-1)?.definition === null,
      )
      reports.push({
        engine: name,
        width,
        overflow,
        errors,
        selection: 'inferred',
        reset: 'inherited',
      })
      await page.close()
    }
  } finally {
    await browser.close()
  }
}
await writeFile(`${output}/report.json`, JSON.stringify(reports, null, 2))
console.log(JSON.stringify(reports))
