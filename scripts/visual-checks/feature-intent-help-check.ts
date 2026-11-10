// NODE
import { mkdir, writeFile } from 'node:fs/promises'
// BROWSER
import { chromium, firefox } from 'playwright'
// DOMAIN
import { DEFAULT_FEATURE_TYPES } from '../../src/lib/features/intents'
const base = process.argv[2] ?? 'http://127.0.0.1:4173'
const output = 'output/playwright/feature-intent-help'
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
      const page = await browser.newPage({ viewport: { width, height: 1000 } })
      page.setDefaultTimeout(15000)
      const errors: string[] = []
      page.on('pageerror', error => errors.push(error.message))
      await page.route('**/__naming-policy.html', route =>
        route.fulfill({
          contentType: 'text/html',
          body: '<html lang="en" data-theme="breadline-light"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>@layer theme,base,components,utilities;</style><script>globalThis.__sveltekit_dev={env:{}}</script></head><body class="bits-theme"><div id="app"></div><script type="module" src="/src/tests/fixtures/namingPolicyCheck.ts"></script></body></html>',
        }),
      )
      await page.route('**/src/lib/api/featureIntents.remote.*', route =>
        route.fulfill({ contentType: 'application/javascript', body: mock }),
      )
      await page.goto(`${base}/__naming-policy.html`)
      // Enable catalogue editing so fieldsets expose their help to pointer and keyboard users.
      await page.getByRole('switch', { name: 'Custom', exact: true }).check()
      const cases = [
        ['kind', 'About feature kind', 4],
        ['relation', 'About association relation', 2],
        ['start', 'About suggested starting point', 2],
        ['missing', 'About when no location is found', 2],
        ['naming', 'About naming rules', 4],
        ['fields', 'About naming fields', 3],
      ] as const
      for (const [topic, label, count] of cases) {
        if (topic === 'naming') {
          await page
            .getByRole('button', {
              name: /^(Configure naming rule|Define custom rules)$/,
            })
            .click()
        }
        if (topic === 'fields') {
          await page.getByRole('button', { name: 'Cancel', exact: true }).click()
          await page.evaluate(() => Reflect.set(globalThis, 'fieldMode', 'empty'))
          await page
            .getByRole('button', {
              name: /^(Configure naming rule|Define custom rules)$/,
            })
            .click()
        }
        const trigger = page.getByRole('button', { name: label, exact: true })
        await trigger.scrollIntoViewIfNeeded()
        // Let the editor’s smooth scroll settle before opening anchored help.
        await page.waitForTimeout(400)
        await trigger.focus()
        await page.keyboard.press('Enter')
        const help = page.locator(`[data-feature-intent-help="${topic}"]`)
        await help.waitFor()
        await page.waitForTimeout(200)
        if ((await help.locator('xpath=..').getAttribute('data-state')) !== 'open')
          throw Error(`Help did not stay open: ${topic}`)
        if (
          (await help.locator('li').count()) !== count ||
          (await help.locator('li svg').count()) !== count
        )
          throw Error(`Missing structured rows: ${topic}`)
        const bounds = await help.boundingBox()
        if (!bounds || bounds.x < 0 || bounds.x + bounds.width > width + 1)
          throw Error(`Tooltip overflow: ${topic}`)
        await page.screenshot({
          animations: 'disabled',
          path: `${output}/${engine}-${width}-${topic}.png`,
        })
        await page.keyboard.press('Escape')
        await help.waitFor({ state: 'hidden' })
        // Check pointer/touch activation as well as keyboard activation.
        await trigger.click()
        await help.waitFor()
        await page.waitForTimeout(200)
        if ((await help.locator('xpath=..').getAttribute('data-state')) !== 'open')
          throw Error(`Help did not stay open: ${topic}`)
        await page.keyboard.press('Escape')
      }
      if (errors.length) throw Error(JSON.stringify(errors))
      reports.push({
        engine,
        width,
        structuredTooltips: cases.length,
        keyboard: true,
        pointer: true,
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
