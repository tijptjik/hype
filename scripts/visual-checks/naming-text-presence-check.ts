// NODE
import { mkdir, writeFile } from 'node:fs/promises'
// BROWSER
import { chromium, firefox, type Page } from 'playwright'
// DOMAIN
import { DEFAULT_FEATURE_TYPES } from '../../src/lib/features/intents'
const base = process.argv[2] ?? 'http://127.0.0.1:4173'
const output = 'output/playwright/naming-text-presence'
await mkdir(output, { recursive: true })
const types = DEFAULT_FEATURE_TYPES.filter(type => type.id === 'place')
const mock = `const defaults=${JSON.stringify(types)};
export async function getFeatureIntentSettings(scope){
 const saved=globalThis.namingPolicies??{};
 const project=saved.project??{definition:null,namingRules:{},version:0};
 const parent=scope.type==='layer'?(project.definition??defaults).map(t=>({...t,...(project.namingRules?.[t.id]?{nameRule:project.namingRules[t.id]}:{})})):defaults;
 const own=saved[scope.type]??{definition:null,namingRules:{},version:0};
 const types=(own.definition??parent).map(t=>({...t,...(own.namingRules?.[t.id]?{nameRule:own.namingRules[t.id]}:{})}));
 return {...own,types,inheritedTypes:parent,namingRules:own.namingRules??{},version:own.version??0,fingerprint:'fixture',lineage:[]};
}
export async function getFeatureNameProperties(){
 if(globalThis.fieldMode==='error')throw new Error('fixture failure');
 return globalThis.fieldMode==='empty'?[]:[{id:'paid',label:'Paid access'},{id:'caption',label:'Sign caption',test:'hasValue',examples:{'*':'Scalar caption',en:'Neon lettering','zh-Hant':'霓虹字樣'}},{id:'phone',label:'Phone number',component:'PhoneField',test:'hasValue',examples:{'*':'["+852 2345 6789","+852 9876 5432"]'}}];
}
export async function getFeatureNameFieldsProject(){return 'project'}
export async function getFeatureIntentOptions(){return defaults}
`
/** Choose an observed Bits select option in the current page.
 * @param page Fixture page. @param label Select name. @param option Visible option text. @returns Completion.
 */
async function choose(page: Page, label: string, option: string): Promise<void> {
  await page.getByRole('combobox', { name: label, exact: true }).click()
  await page.getByRole('option', { name: option, exact: true }).click()
}
const reports = []
for (const [engine, browserType] of [
  ['chromium', chromium],
  ['firefox', firefox],
] as const) {
  const browser = await browserType.launch()
  try {
    for (const width of [1440, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 } })
      page.setDefaultTimeout(15000)
      const errors: string[] = []
      page.on('pageerror', error => errors.push(error.message))
      await page.route('**/__text-presence.html', route =>
        route.fulfill({
          contentType: 'text/html',
          body: '<html lang="en" data-theme="breadline-light"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>@layer theme,base,components,utilities;</style><script>globalThis.__sveltekit_dev={env:{}}</script></head><body class="bits-theme"><div id="app"></div><script type="module" src="/src/tests/fixtures/namingPolicyCheck.ts"></script></body></html>',
        }),
      )
      await page.route('**/src/lib/api/featureIntents.remote.*', route =>
        route.fulfill({ contentType: 'application/javascript', body: mock }),
      )
      await page.goto(`${base}/__text-presence.html`)
      await page
        .getByRole('switch', { name: 'Custom', exact: true })
        .check()
        .catch(async error => {
          const overlay = await page
            .locator('vite-error-overlay')
            .evaluateAll(nodes => nodes.map(node => node.shadowRoot?.textContent))
          throw new Error(JSON.stringify({ errors, overlay }), { cause: error })
        })
      await page
        .getByRole('button', { name: 'Define custom rules', exact: true })
        .click()
      const panel = page.locator('[data-naming-editor]')
      await panel.getByRole('button', { name: 'Add condition', exact: true }).click()
      await choose(page, 'Rule property', 'Sign caption')
      await panel
        .locator('[data-property-example="en"]')
        .filter({ hasText: 'e.g. Neon lettering' })
        .waitFor()
      if (await panel.getByRole('textbox', { name: 'Has value', exact: true }).count())
        throw Error('Property value must not be editable here')
      await panel
        .getByRole('textbox', { name: 'Has no value', exact: true })
        .fill('Unnamed')
      if (await panel.getByRole('textbox', { name: 'Unset', exact: true }).count())
        throw Error('Text condition still exposes Unset')
      const preview = panel.locator('[data-title-example="en"]')
      await preview.filter({ hasText: 'Hotspot • Unnamed' }).waitFor()
      await panel
        .getByRole('button', {
          name: 'Example: Sign caption: Has no value',
          exact: true,
        })
        .click()
      await preview.filter({ hasText: 'Hotspot • Neon lettering' }).waitFor()
      await panel
        .getByRole('button', { name: 'Example: Sign caption: Has value', exact: true })
        .click()
      await preview.filter({ hasText: 'Hotspot • Unnamed' }).waitFor()
      await page.getByRole('button', { name: 'Multilingual', exact: true }).click()
      await panel
        .locator('[data-property-example="zh-Hant"]')
        .filter({ hasText: '霓虹字樣' })
        .waitFor()
      await panel
        .getByRole('button', {
          name: 'Example: Sign caption: Has no value',
          exact: true,
        })
        .click()
      await panel
        .locator('[data-title-example="zh-Hant"]')
        .filter({ hasText: '霓虹字樣' })
        .waitFor()
      await panel
        .getByRole('button', { name: 'Example: Sign caption: Has value', exact: true })
        .click()
      await panel
        .getByRole('group', { name: '繁中', exact: true })
        .getByRole('textbox', { name: 'Has no value', exact: true })
        .fill('沒有名稱')
      await panel.screenshot({ path: `${output}/${engine}-${width}.png` })
      await panel
        .getByRole('button', { name: 'Accept naming rule', exact: true })
        .click()
      await page.getByRole('button', { name: 'Save settings', exact: true }).click()
      const saved = await page.evaluate(() => Reflect.get(globalThis, 'lastNamingSave'))
      if (
        saved.namingRules.place.conditions[0].test !== 'hasValue' ||
        saved.namingRules.place.conditions[0].locales['zh-Hant'].false !== '沒有名稱'
      )
        throw Error('Presence rule did not save')
      await page
        .getByRole('button', { name: 'Configure naming rule', exact: true })
        .click()
      await panel
        .locator('[data-property-example="en"]')
        .filter({ hasText: 'Neon lettering' })
        .waitFor()
      await choose(page, 'Rule property', 'Phone number')
      for (const locale of ['en', 'zh-Hant']) {
        await panel
          .locator(`[data-property-example="${locale}"]`)
          .filter({ hasText: /^e\.g\.\s*2345 6789\s*$/ })
          .waitFor()
      }
      await choose(page, 'Rule property', 'Paid access')
      await panel.getByRole('textbox', { name: 'Unset', exact: true }).first().waitFor()
      if (await panel.getByRole('textbox', { name: 'Has value', exact: true }).count())
        throw Error('Boolean labels did not return')
      if (
        errors.length ||
        (await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth + 1,
        ))
      )
        throw Error(JSON.stringify(errors))
      reports.push({
        engine,
        width,
        presenceCases: true,
        preview: true,
        saveAndReopen: true,
        booleanSwitch: true,
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
