// NODE
import { mkdir, writeFile } from 'node:fs/promises'
// BROWSER
import { chromium, firefox } from 'playwright'
// DOMAIN
import { DEFAULT_FEATURE_TYPES } from '../../src/lib/features/intents'
const base = process.argv[2] ?? 'http://127.0.0.1:4173'
const output = 'output/playwright/feature-policy-cards'
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
 return globalThis.fieldMode==='empty'?[]:[{id:'paid',label:'Paid access'},{id:'covered',label:'Covered'}];
}
export async function getFeatureNameFieldsProject(){return 'project'}
export async function getFeatureIntentOptions(){return defaults}
`
const reports = []
for (const [engine, browserType] of [
  ['chromium', chromium],
  ['firefox', firefox],
] as const) {
  const browser = await browserType.launch()
  try {
    for (const width of [1440, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 1100 } })
      page.setDefaultTimeout(15000)
      const errors: string[] = []
      page.on('pageerror', error => errors.push(error.message))
      await page.route('**/__policy-cards.html', route =>
        route.fulfill({
          contentType: 'text/html',
          body: '<html lang="en" data-theme="breadline-light"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>@layer theme,base,components,utilities;</style><script>globalThis.__sveltekit_dev={env:{}}</script></head><body class="bits-theme"><div id="app"></div><script type="module" src="/src/tests/fixtures/namingPolicyCheck.ts"></script></body></html>',
        }),
      )
      await page.route('**/src/lib/api/featureIntents.remote.*', route =>
        route.fulfill({ contentType: 'application/javascript', body: mock }),
      )
      await page.goto(`${base}/__policy-cards.html`)
      await page.getByRole('switch', { name: 'Custom', exact: true }).click()
      const kinds = page.getByRole('group', { name: 'Feature kind', exact: true })
      for (const title of ['Area', 'Route']) {
        if (
          !(await kinds.getByRole('radio', { name: title, exact: true }).isDisabled())
        )
          throw Error(`${title} must remain unavailable`)
      }
      if ((await kinds.getByText('Forthcoming', { exact: true }).count()) !== 2)
        throw Error('Forthcoming labels are missing')
      await kinds.getByRole('radio', { name: 'Object', exact: true }).check()
      await kinds
        .getByRole('radio', { name: 'Object', exact: true })
        .press('ArrowRight')
      if (!(await kinds.getByRole('radio', { name: 'Place', exact: true }).isChecked()))
        throw Error('Keyboard selection failed')
      await kinds.getByRole('radio', { name: 'Place', exact: true }).press('ArrowRight')
      if (
        !(await kinds.getByRole('radio', { name: 'Object', exact: true }).isChecked())
      )
        throw Error('Keyboard navigation did not skip forthcoming options')
      const first = page.locator('[data-type-editor] > section').first()
      if (!(await first.locator('[data-type-names]').count()))
        throw Error('Display name is not in the first column')
      const name = page.getByRole('button', { name: 'Display name', exact: true })
      await name.click()
      const input = page.getByRole('textbox', { name: 'Display name', exact: true })
      await input.fill('Community Kitchen')
      const identifier = page.getByRole('textbox', {
        name: 'Stable identifier',
        exact: true,
      })
      if ((await identifier.inputValue()) !== 'community-kitchen')
        throw Error('English name did not update identifier')
      await input.fill('')
      await input.fill('Community Hall')
      if ((await identifier.inputValue()) !== 'community-hall')
        throw Error('Clearing the name broke automatic code following')
      await identifier.fill('custom-place')
      await name.click()
      await input.fill('Neighbourhood Hall')
      if ((await identifier.inputValue()) !== 'custom-place')
        throw Error('Custom identifier was overwritten')
      for (const option of ['Located at', 'Place on the map', 'Continue silently']) {
        await page.getByRole('radio', { name: option, exact: true }).check()
      }
      await page
        .getByRole('button', { name: 'About association relation', exact: true })
        .click()
      await page
        .getByRole('tooltip')
        .filter({ hasText: 'The feature is distinct from its host.' })
        .waitFor()
      await page.keyboard.press('Escape')
      await page.getByRole('button', { name: 'Save settings', exact: true }).click()
      const saved = await page.evaluate(() => Reflect.get(globalThis, 'lastNamingSave'))
      const type = saved.definition[0]
      if (
        type.kind !== 'object' ||
        type.id !== 'custom-place' ||
        type.label !== 'Neighbourhood Hall' ||
        type.relation !== 'locatedAt' ||
        type.start !== 'pin' ||
        type.unresolvedMode !== 'silent'
      )
        throw Error('Choice values did not persist')
      await page.locator('[data-type-editor]').scrollIntoViewIfNeeded()
      await page.getByRole('tooltip').waitFor({ state: 'hidden' })
      await page.screenshot({
        path: `${output}/${engine}-${width}.png`,
        fullPage: true,
      })
      if (
        await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)
      )
        throw Error('Horizontal overflow')
      if (errors.length) throw Error(errors.join('\n'))
      reports.push({
        engine,
        width,
        nameAndCode: true,
        customCodePreserved: true,
        choicesSaved: true,
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
