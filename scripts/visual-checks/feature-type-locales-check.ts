// NODE
import { mkdir, writeFile } from 'node:fs/promises'
// BROWSER
import { chromium, firefox } from 'playwright'
// DOMAIN
import { DEFAULT_FEATURE_TYPES } from '../../src/lib/features/intents'

const base = process.argv[2] ?? 'http://127.0.0.1:5175'
const output = 'output/playwright/feature-type-locales'
await mkdir(output, { recursive: true })
const mock = `const defaults=${JSON.stringify(DEFAULT_FEATURE_TYPES)};
let definition=null,version=0;
export async function getFeatureIntentOptions(){return defaults}
export async function getFeatureIntentSettings(){return {types:definition??defaults,inheritedTypes:defaults,definition,version,fingerprint:String(version),lineage:[]}}
export async function getFeatureNameProperties(){return [{id:'paid',label:'Paid area'}]}
export async function updateFeatureIntentSettings(input){definition=input.definition;version++;globalThis.savedPolicy=input;return {saved:true}}
`
const reports = []
for (const [engine, browserType] of [
  ['chromium', chromium],
  ['firefox', firefox],
] as const) {
  const browser = await browserType.launch()
  try {
    for (const width of [1440, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 } })
      const errors: string[] = []
      page.on('pageerror', error => errors.push(error.message))
      await page.route('**/__feature-type-locales.html', route =>
        route.fulfill({
          contentType: 'text/html',
          body: '<html lang="en" data-theme="breadline-light"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>@layer theme,base,components,utilities;</style><script>globalThis.__sveltekit_dev={env:{}}</script></head><body class="bits-theme"><div id="app"></div><script type="module" src="/src/tests/fixtures/targetContextCheck.ts"></script></body></html>',
        }),
      )
      await page.route('**/src/lib/api/featureIntents.remote.*', route =>
        route.fulfill({ contentType: 'application/javascript', body: mock }),
      )
      await page.goto(`${base}/__feature-type-locales.html`)
      const custom = page.getByRole('switch', { name: 'Custom', exact: true })
      const languages = page.getByRole('button', { name: 'Multilingual', exact: true })
      await custom.click()
      await page.screenshot({ path: `${output}/${engine}-${width}-initial.png` })
      const left = await languages.boundingBox(),
        right = await custom.boundingBox()
      if (
        !left ||
        !right ||
        left.x + left.width > right.x ||
        Math.abs(left.y - right.y) > 15
      ) {
        await page.screenshot({
          path: `${output}/${engine}-${width}-header-failure.png`,
        })
        throw Error(JSON.stringify({ left, right, engine, width }))
      }
      const settings = page.locator('[data-feature-type-settings]')
      const cards = settings.locator('[data-type-list] [data-feature-type-section]')
      const count = await cards.count()
      if (await settings.getByRole('checkbox').count())
        throw Error('Checkbox controls remain')
      if (await cards.getByRole('button', { name: /^Remove / }).count())
        throw Error('Remove controls visible outside removal mode')
      const collapse = settings.getByRole('button', { name: 'Collapse', exact: true })
      await collapse.click()
      if (await cards.locator('[data-type-body]:visible').count())
        throw Error('Collapse all failed')
      const originalFirst = await cards.first().locator('h3').textContent()
      await cards
        .first()
        .locator('[data-type-drag-handle]')
        .dragTo(cards.last().locator('header'))
      if ((await cards.first().locator('h3').textContent()) === originalFirst)
        throw Error('Pointer reorder failed')
      await settings.getByRole('button', { name: 'New', exact: true }).click()
      if (
        (await cards.count()) !== count + 1 ||
        !(await cards.last().locator('[data-type-body]').isVisible())
      )
        throw Error('New type was not expanded')
      await cards
        .last()
        .getByRole('textbox', { name: 'Display name', exact: true })
        .fill('Temporary type')
      await cards.last().locator('[data-type-drag-handle]').press('Alt+ArrowUp')
      if (
        !(await cards
          .nth(count - 1)
          .getByRole('button', { name: 'Temporary type', exact: true })
          .count())
      )
        throw Error('Keyboard reorder failed')
      await settings.getByRole('button', { name: 'Remove Type', exact: true }).click()
      await cards
        .nth(count - 1)
        .getByRole('button', { name: 'Remove Temporary type', exact: true })
        .click()
      await page
        .getByRole('dialog')
        .getByRole('button', { name: 'Cancel', exact: true })
        .click()
      if ((await cards.count()) !== count + 1) throw Error('Cancel removed a type')
      await cards
        .nth(count - 1)
        .getByRole('button', { name: 'Remove Temporary type', exact: true })
        .click()
      await page.getByRole('dialog').getByRole('button').last().click()
      if ((await cards.count()) !== count) throw Error('Confirmed removal failed')
      await page.keyboard.press('Escape')
      if (await cards.getByRole('button', { name: /^Remove / }).count())
        throw Error('Escape did not leave removal mode')
      await settings.getByRole('button', { name: 'Expand', exact: true }).click()
      if ((await cards.locator('[data-type-body]:visible').count()) !== count)
        throw Error('Expand all failed')
      await languages.click()
      await page
        .getByRole('textbox', { name: 'Display name zh-Hant', exact: true })
        .first()
        .fill('舊招牌')
      await page
        .getByRole('textbox', { name: 'Display name zh-Hans', exact: true })
        .first()
        .fill('旧招牌')
      await page.getByRole('button', { name: 'Add', exact: true }).click()
      await page.getByRole('combobox', { name: 'Search languages' }).fill('Japanese')
      await page.getByRole('option', { name: /Japanese/ }).click()
      await page
        .getByRole('textbox', { name: 'Display name ja', exact: true })
        .first()
        .fill('昔の看板')
      await page
        .getByRole('button', { name: 'Add boolean condition', exact: true })
        .first()
        .click()
      const firstType = page.locator('[data-feature-type-section]').first()
      const japaneseCase = firstType.getByText('ja', { exact: true }).locator('..')
      await japaneseCase
        .getByRole('textbox', { name: 'true', exact: true })
        .fill('有料')
      await languages.click()
      if (
        await page
          .getByRole('textbox', { name: 'Display name ja', exact: true })
          .count()
      )
        throw Error('Collapsed multilingual fields remain visible')
      await page
        .getByRole('button', { name: 'Save feature type settings', exact: true })
        .click()
      await page.getByText('Feature type settings saved.', { exact: true }).waitFor()
      const saved = await page.evaluate(
        () =>
          (
            globalThis as unknown as {
              savedPolicy: {
                definition: {
                  labels: Record<string, string>
                  nameRule: {
                    conditions: { locales: Record<string, { true: string }> }[]
                  }
                }[]
              }
            }
          ).savedPolicy.definition[0],
      )
      if (
        saved.labels['zh-Hant'] !== '舊招牌' ||
        saved.labels.ja !== '昔の看板' ||
        saved.nameRule.conditions[0].locales.ja.true !== '有料'
      )
        throw Error('Hidden translations were not saved')
      await languages.click()
      if (
        (await page
          .getByRole('textbox', { name: 'Display name ja', exact: true })
          .first()
          .inputValue()) !== '昔の看板'
      )
        throw Error('Translations did not survive reload')
      await languages.scrollIntoViewIfNeeded()
      await page.screenshot({ path: `${output}/${engine}-${width}.png` })
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      )
      if (overflow || errors.length) throw Error(JSON.stringify({ overflow, errors }))
      reports.push({
        engine,
        width,
        toolbar: 'left of Custom',
        translations: ['zh-Hant', 'zh-Hans', 'ja'],
        saved: true,
        overflow,
        errors,
      })
      await page.close()
    }
  } finally {
    await browser.close()
  }
}
await writeFile(`${output}/report.json`, JSON.stringify(reports, null, 2))
console.log(JSON.stringify(reports))
