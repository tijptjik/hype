import { chromium, firefox } from 'playwright'
import { mkdir, writeFile } from 'node:fs/promises'
import { DEFAULT_FEATURE_TYPES } from '../../src/lib/features/intents'
const base = process.argv[2] ?? 'http://127.0.0.1:5175'
const output = 'output/playwright/target-context'
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
      await page.getByRole('button', { name: /Building part/ }).waitFor()
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
      const centered = await page
        .locator('[data-address-display-group]')
        .evaluate(el => {
          const group = el.getBoundingClientRect()
          const text = el
            .querySelector('[data-address-display-text]')!
            .getBoundingClientRect()
          return (
            Math.abs((group.left + group.right) / 2 - (text.left + text.right) / 2) < 1
          )
        })
      if (!centered) throw Error('Address text shifted by controls')
      const positioned = await page
        .locator('[data-address-display-group]')
        .evaluate(el => {
          const selector = el.querySelector('fieldset')?.getBoundingClientRect()
          const marker = el
            .querySelector('button[aria-label="Display address"]')
            ?.getBoundingClientRect()
          return selector && marker
            ? selector.right <= marker.left && Math.abs(selector.top - marker.top) < 20
            : false
        })
      if (!positioned) throw Error('Display choice is not before the address marker')
      const object = page.getByRole('button', { name: /Object An individual item/ })
      await object.click({ position: { x: 8, y: 8 } })
      if ((await page.locator('[data-feature-type]').textContent()) !== 'object')
        throw Error('Whole-card feature selection failed')
      const route = page.getByRole('button', { name: /Route A path to follow/ })
      await route.focus()
      await page.keyboard.press('Space')
      if ((await route.getAttribute('aria-pressed')) !== 'true')
        throw Error('Keyboard feature selection failed')
      const contextCard = page.getByRole('button', {
        name: /Building part/,
      })
      await contextCard.click({ position: { x: 8, y: 8 } })
      await page.screenshot({
        path: `${output}/${name}-${width}-cards.png`,
        fullPage: true,
      })
      if ((await page.locator('[data-context]').textContent()) !== 'building_part')
        throw Error('Context selection failed')
      await page.getByText('en Example Bakery Paid', { exact: true }).waitFor()
      await page.getByLabel('Paid area', { exact: true }).uncheck()
      await page.getByText('en Example Bakery', { exact: true }).waitFor()
      await page.getByLabel('Override name for en', { exact: true }).check()
      await page
        .getByLabel('Name override en', { exact: true })
        .fill('Independent name')
      await page.getByText('en Independent name', { exact: true }).waitFor()
      await page.getByText('Following hub defaults.', { exact: true }).waitFor()
      if (
        (await page
          .locator('[data-inherited-schema] [data-feature-type-section]')
          .count()) !== 4
      )
        throw Error('Inherited schema is not visible')
      await page.getByRole('switch', { name: 'Custom', exact: true }).click()
      const targets = page
        .locator('[data-type-editor]')
        .first()
        .getByRole('region', { name: 'Location targets' })
      for (const label of [
        'Building part',
        'Other structure',
        'Building',
        'Premises / site',
        'Thoroughfare',
        'Service point',
        'Address',
      ])
        if (!(await targets.getByRole('switch', { name: label, exact: true }).count()))
          throw Error(`Missing target class: ${label}`)
      const servicePoint = targets.getByRole('switch', {
        name: 'Service point',
        exact: true,
      })
      if ((await servicePoint.getAttribute('aria-checked')) !== 'true')
        await servicePoint.click()
      await page
        .getByRole('button', { name: 'Add boolean condition', exact: true })
        .first()
        .click()
      await page.getByLabel('Boolean property', { exact: true }).first().click()
      await page.getByRole('option', { name: 'Paid area', exact: true }).click()
      await page
        .getByRole('button', { name: 'Save feature type settings', exact: true })
        .click()
      await page.getByText('Feature type settings saved.', { exact: true }).waitFor()
      const saved = await page.evaluate(
        () =>
          (
            globalThis as typeof globalThis & {
              __savedFeatureTypes?: { targetContexts?: string[] }[]
            }
          ).__savedFeatureTypes,
      )
      if (!saved?.[0]?.targetContexts?.includes('service_point'))
        throw Error('Saved settings lost the service point class')
      await page.screenshot({ path: `${output}/${name}-${width}.png`, fullPage: true })
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      )
      if (overflow || errors.length)
        throw Error(
          JSON.stringify({
            name,
            width,
            overflow,
            errors,
            boxes: await page
              .locator(
                '[data-display-toolbar], [data-address-display-group], [data-address-display-text]',
              )
              .evaluateAll(els =>
                els.map(el => ({
                  tag: el.tagName,
                  rect: el.getBoundingClientRect().toJSON(),
                })),
              ),
          }),
        )
      reports.push({
        name,
        width,
        overflow,
        errors,
        context: 'building_part',
        override: 'Independent name',
      })
      await page.close()
    }
  } finally {
    await browser.close()
  }
}
await writeFile(`${output}/report.json`, JSON.stringify(reports, null, 2))
console.log(JSON.stringify(reports))
