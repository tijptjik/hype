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
export async function getFeatureIntentSettings(){return {types:globalThis.savedPolicy?.definition??defaults,inheritedTypes:defaults,definition:globalThis.savedPolicy?.definition??null,version,fingerprint:String(version),lineage:[]}}
export async function getFeatureNameProperties(){return [{id:'paid',label:'Paid area'}]}

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
      await page.route('**/src/lib/api/translation.remote.*', route =>
        route.fulfill({
          contentType: 'application/javascript',
          body: "export async function translateContentField({source,target,text}) { return {status:'translated', source,target,text:target+' '+text} }",
        }),
      )
      await page.goto(`${base}/__feature-type-locales.html`)
      const custom = page.getByRole('switch', { name: 'Custom', exact: true })
      const languages = page.getByRole('button', { name: 'Multilingual', exact: true })
      const inheritedIdentifier = page
        .getByRole('textbox', { name: 'Stable identifier', exact: true })
        .first()
      const readonlyBorder = await inheritedIdentifier.evaluate(el => {
        const control = el.closest('.bits-form__control-wrap')
        if (!control) throw Error('Missing input wrapper')
        return getComputedStyle(control).borderTopColor
      })
      if (readonlyBorder !== 'rgba(0, 0, 0, 0)')
        throw Error(`Readonly outline: ${readonlyBorder}`)
      if (
        await page.getByText('Following application defaults.', { exact: true }).count()
      )
        throw Error('Inheritance notice remains')
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
      await page.locator('[data-form-dirty]').filter({ hasText: 'true' }).waitFor()
      await page.getByRole('button', { name: 'Discard form', exact: true }).click()
      await page.locator('[data-form-dirty]').filter({ hasText: 'false' }).waitFor()
      if (await custom.isChecked())
        throw Error('Parent discard did not restore inheritance')
      await custom.click()
      const count = await cards.count()
      const areaEnabled = cards.getByRole('switch', {
        name: 'Enable Area',
        exact: true,
      })
      if (await areaEnabled.isChecked()) throw Error('Area should default to disabled')
      if (
        !(await cards
          .getByRole('switch', { name: 'Enable Object', exact: true })
          .isChecked())
      )
        throw Error('Object should default to enabled')
      await areaEnabled.click()
      if (!(await areaEnabled.isChecked())) throw Error('Type enable switch failed')
      await areaEnabled.click()
      if (await settings.getByRole('checkbox').count())
        throw Error('Checkbox controls remain')
      if (await cards.getByRole('button', { name: /^Remove / }).count())
        throw Error('Remove controls visible outside removal mode')
      if (await settings.getByRole('button', { name: /^(Expand|Collapse)$/ }).count())
        throw Error('Global expand control remains')
      // Opening another section closes the previous one, including for keyboard activation.
      await cards.nth(1).locator(':scope > header button[aria-expanded]').press('Enter')
      await cards.first().locator('[data-type-body]').waitFor({ state: 'hidden' })
      if ((await cards.locator('[data-type-body][aria-hidden="false"]').count()) !== 1)
        throw Error('Opening a section did not close its siblings')
      await cards.nth(1).locator(':scope > header button[aria-expanded]').click()
      // Wait for every animated body to finish closing before checking the group.
      for (const body of await cards.locator('[data-type-body]').all())
        await body.waitFor({ state: 'hidden' })
      if (await cards.locator('[data-type-body]:visible').count())
        throw Error('Clicking the open section did not close it')
      const originalFirst = await cards.first().locator('header h3').textContent()
      await cards
        .first()
        .locator('[data-type-drag-handle]')
        .dragTo(cards.last().locator('header'))
      if ((await cards.first().locator('header h3').textContent()) === originalFirst)
        throw Error('Pointer reorder failed')
      await settings.getByRole('button', { name: 'New', exact: true }).click()
      if (
        (await cards.count()) !== count + 1 ||
        !(await cards.last().locator('[data-type-body]').isVisible())
      )
        throw Error('New type was not expanded')
      await cards
        .last()
        .getByRole('button', { name: 'Display name', exact: true })
        .click()
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
      await cards.first().locator(':scope > header button[aria-expanded]').click()
      await cards.first().locator('[data-type-body]').waitFor({ state: 'visible' })
      if ((await cards.locator('[data-type-body][aria-hidden="false"]').count()) !== 1)
        throw Error('More than one section is open')
      await languages.click()
      await cards.first().locator('[data-i18n-source-bar] button').first().click()
      await cards
        .first()
        .getByText(/^zh-Hant /)
        .waitFor()
      await page
        .getByRole('button', { name: 'Display name zh-Hant', exact: true })
        .first()
        .click()
      await page
        .getByRole('textbox', { name: 'Display name zh-Hant', exact: true })
        .first()
        .fill('舊招牌')
      await page
        .getByRole('button', { name: 'Display name zh-Hans', exact: true })
        .first()
        .click()
      await page
        .getByRole('textbox', { name: 'Display name zh-Hans', exact: true })
        .first()
        .fill('旧招牌')
      await page.getByRole('button', { name: 'Add', exact: true }).click()
      await page.getByRole('combobox', { name: 'Search languages' }).fill('Japanese')
      await page.getByRole('option', { name: /Japanese/ }).click()
      await page
        .getByRole('button', { name: 'Display name ja', exact: true })
        .first()
        .click()
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
      await page.getByRole('button', { name: 'Save form', exact: true }).click()
      await page.getByText('Form saved.', { exact: true }).waitFor()
      if (
        await settings
          .getByText('These settings save separately.', { exact: true })
          .count()
      )
        throw Error('Independent save controls remain')
      const packet = await page.evaluate(
        () =>
          (globalThis as unknown as { submittedModelPacket: Record<string, string> })
            .submittedModelPacket,
      )
      if (
        'data.properties[0].key/fixture' in packet ||
        packet['meta.submittedTabs/fixture'] !== '["profile","location"]'
      )
        throw Error('Unchanged field tab was submitted')
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
      await page
        .getByRole('button', { name: 'Display name ja', exact: true })
        .first()
        .click()
      if (
        (await page
          .getByRole('textbox', { name: 'Display name ja', exact: true })
          .first()
          .inputValue()) !== '昔の看板'
      )
        throw Error('Translations did not survive reload')
      await cards.first().locator('[data-type-names]').scrollIntoViewIfNeeded()
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
