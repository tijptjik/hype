// NODE
import { mkdir, writeFile } from 'node:fs/promises'
// BROWSER
import { chromium, firefox } from 'playwright'
// DOMAIN
import { DEFAULT_FEATURE_TYPES } from '../../src/lib/features/intents'
const base = process.argv[2] ?? 'http://127.0.0.1:4173'
const output = 'output/playwright/naming-policy'
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
      await page.route('**/src/lib/api/translation.remote.*', route =>
        route.fulfill({
          contentType: 'application/javascript',
          body: `export async function translateContentField(input) {
          globalThis.ruleTranslationCalls ??= [];
          globalThis.ruleTranslationCalls.push(input);
          await new Promise(resolve => setTimeout(resolve, 400));
          return {status:'translated', text:input.target+':'+input.text};
        }`,
        }),
      )
      await page.goto(`${base}/__naming-policy.html`)
      try {
        const summary = page.locator('[data-naming-summary]')
        const panel = page.locator('[data-naming-editor]')
        if (await panel.count()) throw Error('Editor should initially be collapsed')
        if (await summary.getByRole('button').count())
          throw Error('Inherited model exposes naming actions')
        await summary.getByText('Using the Hub default', { exact: true }).waitFor()
        await page.getByRole('switch', { name: 'Custom', exact: true }).check()
        if (await summary.getByRole('switch').count())
          throw Error('Inheritance switch remains')
        await summary
          .getByRole('button', { name: 'Define custom rules', exact: true })
          .waitFor()
        const beforeNaming = await page.locator('[data-naming-draft]').textContent()
        await page
          .getByRole('button', {
            name: /^(Configure naming rule|Define custom rules)$/,
          })
          .click()
        await panel.waitFor()
        // Inspect the final scroll position after the smooth scroll, not its initial frame.
        await page.waitForTimeout(600)
        const toolbarBounds = await page
          .locator('[data-feature-type-toolbar]')
          .boundingBox()
        const editorBounds = await panel.boundingBox()
        if (
          !toolbarBounds ||
          !editorBounds ||
          editorBounds.y < toolbarBounds.y + toolbarBounds.height + 16
        )
          throw Error('Naming editor scrolls underneath the sticky toolbar')

        if (await panel.getByRole('switch').count())
          throw Error('Editor inheritance switch remains')
        if (await page.getByRole('dialog').count())
          throw Error('Naming editor must be inline')
        const bounds = await panel.boundingBox()
        const columns = await page.locator('[data-type-editor] > section').all()
        for (const section of columns.slice(0, 3)) {
          const box = await section.boundingBox()
          if (!box || !bounds || bounds.y < box.y + box.height - 1)
            throw Error('Editor is not beneath all three columns')
        }
        if (
          (await panel
            .getByRole('heading', { name: 'Rule-based feature naming', exact: true })
            .count()) !== 1 ||
          (await panel
            .getByRole('heading', { name: 'Naming rules', exact: true })
            .count())
        )
          throw Error('Naming headings are duplicated')
        await panel.screenshot({
          path: `${output}/${engine}-${width}-empty-editor.png`,
        })
        await panel.getByRole('button', { name: 'Add condition', exact: true }).click()
        await panel
          .getByRole('textbox', { name: 'True', exact: true })
          .fill('Cancelled')
        if ((await page.locator('[data-naming-draft]').textContent()) !== beforeNaming)
          throw Error('Unaccepted changes leaked into parent form')
        await panel.getByRole('button', { name: 'Cancel', exact: true }).click()
        if (await panel.count()) throw Error('Cancel did not close the editor')
        if ((await summary.textContent())?.includes('Cancelled'))
          throw Error('Cancel changed summary')
        // A base-name-only override must remain visible and resettable without conditions.
        await summary
          .getByRole('button', { name: 'Define custom rules', exact: true })
          .click()
        await panel
          .getByRole('radio', { name: 'Linked location name', exact: true })
          .check()
        await panel
          .getByRole('button', { name: 'Accept naming rule', exact: true })
          .click()
        await summary.getByText('Changed base name', { exact: true }).waitFor()
        if ((await summary.textContent())?.includes('0 conditions'))
          throw Error('Base-name-only override shows an empty condition count')
        await summary
          .getByRole('button', { name: 'Reset to hub default', exact: true })
          .click()
        await summary
          .getByRole('button', { name: 'Define custom rules', exact: true })
          .waitFor()
        await page
          .getByRole('button', {
            name: /^(Configure naming rule|Define custom rules)$/,
          })
          .click()
        await panel.getByRole('button', { name: 'Add condition', exact: true }).click()
        await panel.getByRole('textbox', { name: 'True', exact: true }).fill('Paid')
        await panel.getByRole('textbox', { name: 'False', exact: true }).fill('Free')
        const separator = panel.getByRole('textbox', { name: 'Separator', exact: true })
        for (const text of ['  ', ' - ']) {
          await separator.fill(text)
          await separator.press('Tab')
          if ((await separator.inputValue()) !== text)
            throw Error('Separator whitespace was trimmed on blur')
        }

        await page.getByRole('button', { name: 'Multilingual', exact: true }).click()
        const rules = panel.locator('[data-naming-rule]')
        await rules
          .first()
          .getByRole('group', { name: '繁中', exact: true })
          .getByRole('textbox', { name: 'True', exact: true })
          .fill('付費')
        if (
          (await panel.getByRole('textbox', { name: 'True', exact: true }).count()) !==
          3
        )
          throw Error('Multilingual bar did not reveal all language rows')
        if (await panel.getByRole('button', { name: /^Edit naming language/ }).count())
          throw Error('Editor still has a locale selector')
        await rules
          .first()
          .getByRole('group', { name: '繁中', exact: true })
          .getByRole('combobox', { name: 'Placement', exact: true })
          .click()
        await page.getByRole('option', { name: 'Before name', exact: true }).click()
        await page.getByRole('button', { name: 'Multilingual', exact: true }).click()
        if (
          (await panel.getByRole('textbox', { name: 'True', exact: true }).count()) !==
          1
        )
          throw Error('Collapsed multilingual bar did not hide extra rows')
        await panel.getByRole('button', { name: 'Add condition', exact: true }).click()
        await rules
          .nth(1)
          .getByRole('textbox', { name: 'True', exact: true })
          .fill('Covered')
        if ((await rules.count()) !== 2)
          throw Error('Rules are not shown as separate sections')
        const previewField = panel.getByRole('button', {
          name: /^Example: Paid access:/,
        })
        const beforePreview = await page.locator('[data-naming-draft]').textContent()
        for (const state of ['unset', 'true', 'false', 'unset']) {
          if ((await previewField.getAttribute('data-preview-state')) !== state)
            throw Error(`Unexpected preview state: ${state}`)
          await previewField.click()
        }
        if ((await page.locator('[data-naming-draft]').textContent()) !== beforePreview)
          throw Error('Preview toggles changed the naming draft')
        if (
          (await panel
            .getByRole('group', { name: 'Complete title example', exact: true })
            .count()) !== 1
        )
          throw Error('Expected one shared preview')
        const previewLayout = await previewField.evaluate(node => {
          const label = node.querySelector('span')
          const icon = node.querySelector('svg')
          if (!label || !icon) throw Error('Missing preview label or icon')
          return {
            nowrap: getComputedStyle(label).whiteSpace === 'nowrap',
            iconLeft:
              icon.getBoundingClientRect().right <= label.getBoundingClientRect().left,
            fits: node.scrollWidth <= node.clientWidth,
          }
        })
        if (!previewLayout.nowrap || !previewLayout.iconLeft || !previewLayout.fits)
          throw Error('Preview fields must keep labels whole with icons on the left')
        await panel
          .locator('[data-title-example="en"]')
          .filter({ hasText: 'Hotspot - Paid Covered' })
          .waitFor()
        await rules.nth(1).locator('[data-rule-drag-handle]').press('Alt+ArrowUp')
        await panel
          .locator('[data-title-example="en"]')
          .filter({ hasText: 'Hotspot Covered - Paid' })
          .waitFor()
        await rules.first().locator('[data-rule-drag-handle]').press('Alt+ArrowDown')
        await panel
          .locator('[data-title-example="en"]')
          .filter({ hasText: 'Hotspot - Paid Covered' })
          .waitFor()
        await rules.nth(1).locator('[data-rule-drag-handle]').press('Alt+ArrowUp')
        await panel
          .locator('[data-title-example="en"]')
          .filter({ hasText: 'Hotspot Covered - Paid' })
          .waitFor()
        await page.getByRole('button', { name: 'Multilingual', exact: true }).click()
        for (const locale of ['en', 'zh-Hant', 'zh-Hans']) {
          const row = rules.first().getByRole('group', {
            name: locale === 'en' ? 'En' : locale === 'zh-Hant' ? '繁中' : '简中',
            exact: true,
          })
          await row.locator('[data-rule-locale-label]').evaluate(async label => {
            await Promise.all(
              document
                .getAnimations()
                .map(animation => animation.finished.catch(() => {})),
            )
            const input = label
              .closest('fieldset')
              ?.querySelector('input[aria-label="True"]')
            if (!input) throw Error('Missing localized input')
            const labelBox = label.getBoundingClientRect()
            const inputBox = input.getBoundingClientRect()
            const difference = Math.abs(
              labelBox.y + labelBox.height / 2 - inputBox.y - inputBox.height / 2,
            )
            if (difference > 2)
              throw Error(
                `Locale label is not centred against its input: ${difference}px`,
              )
          })
        }
        await rules
          .first()
          .getByRole('group', { name: 'En', exact: true })
          .getByRole('textbox', { name: 'Unset', exact: true })
          .fill('Unknown')
        const translationBar = panel.locator('[data-rule-translation-bar]')
        await translationBar.getByRole('button', { name: /English/ }).click()
        const manualTarget = rules
          .first()
          .getByRole('group', { name: '简中', exact: true })
          .getByRole('textbox', { name: 'True', exact: true })
        await manualTarget.fill('Manual translation')
        await page.waitForFunction(
          () =>
            document.querySelector('[data-rule-translation-bar] [aria-busy="true"]') ===
            null,
        )
        if ((await manualTarget.inputValue()) !== 'Manual translation')
          throw Error('Translation overwrote concurrent edit')
        const preserved = rules
          .nth(1)
          .getByRole('group', { name: '繁中', exact: true })
          .getByRole('textbox', { name: 'True', exact: true })
        if ((await preserved.inputValue()) !== '付費')
          throw Error('Translation overwrote existing text')
        for (const [index, label, field, expected] of [
          [0, '繁中', 'True', 'zh-Hant:Covered'],
          [0, '简中', 'Unset', 'zh-Hans:Unknown'],
          [1, '简中', 'True', 'zh-Hans:Paid'],
          [1, '繁中', 'False', 'zh-Hant:Free'],
        ] as const) {
          const input = rules
            .nth(index)
            .getByRole('group', { name: label, exact: true })
            .getByRole('textbox', { name: field, exact: true })
          if ((await input.inputValue()) !== expected)
            throw Error(`Missing batch translation ${expected}`)
        }
        await panel.screenshot({ path: `${output}/${engine}-${width}-expanded.png` })
        await page.getByRole('button', { name: 'Multilingual', exact: true }).click()
        const row = await panel.boundingBox()
        const layout = await page.locator('[data-type-editor]').boundingBox()
        if (width === 1440 && row && layout && row.width < layout.width - 60)
          throw Error('Editor does not span the columns')
        await panel
          .getByRole('button', { name: 'Accept naming rule', exact: true })
          .click()
        if (await panel.count()) throw Error('Accept did not collapse the editor')
        await summary.getByText(/Custom rules\s*·\s*2\s+conditions/).waitFor()
        const summaryBox = await summary.boundingBox()
        if (summaryBox && summaryBox.height > 330) throw Error('Summary is too tall')
        await summary.screenshot({ path: `${output}/${engine}-${width}-summary.png` })
        await page.getByRole('button', { name: 'Save settings', exact: true }).click()
        const saved = await page.evaluate(() =>
          Reflect.get(globalThis, 'lastNamingSave'),
        )
        if (
          !Array.isArray(saved.definition) ||
          saved.namingRules.place.conditions[1].locales.en.separator !== ' - ' ||
          saved.namingRules.place.conditions[1].locales['zh-Hant'].true !== '付費' ||
          saved.namingRules.place.conditions[1].locales['zh-Hant'].placement !==
            'prefix'
        )
          throw Error('Naming-only save lost hidden languages')
        await page
          .getByRole('button', {
            name: /^(Configure naming rule|Define custom rules)$/,
          })
          .click()
        if (
          (await panel
            .getByRole('textbox', { name: 'Separator', exact: true })
            .nth(1)
            .inputValue()) !== ' - '
        )
          throw Error('Saved separator whitespace was lost on reopen')
        await panel
          .getByRole('textbox', { name: 'True', exact: true })
          .first()
          .fill('Discarded')
        await panel.getByRole('button', { name: 'Add condition', exact: true }).click()
        await panel
          .locator('[data-naming-rule]')
          .last()
          .getByRole('button', { name: 'Remove Paid access rule', exact: true })
          .click()
        if ((await panel.locator('[data-naming-rule]').count()) !== 2)
          throw Error('Header trash did not remove the whole rule')
        await panel.getByRole('button', { name: 'Cancel', exact: true }).click()
        if ((await summary.textContent())?.includes('Discarded'))
          throw Error('Cancel changed accepted rule')
        await page.getByRole('button', { name: 'Layer settings', exact: true }).click()
        await page.getByRole('switch', { name: 'Custom', exact: true }).check()
        await page
          .getByRole('button', {
            name: /^(Configure naming rule|Define custom rules)$/,
          })
          .click()
        await panel
          .getByRole('radio', { name: 'Feature base name', exact: true })
          .check()
        await panel
          .locator('[data-title-example="en"]')
          .filter({ hasText: 'Beautiful Sign' })
          .waitFor()
        if (
          await panel.getByText('Accept updates this form.', { exact: false }).count()
        )
          throw Error('Removed footer note remains')
        await panel
          .getByRole('button', { name: 'Accept naming rule', exact: true })
          .click()
        await page.getByRole('button', { name: 'Save settings', exact: true }).click()
        const layerSave = await page.evaluate(() =>
          Reflect.get(globalThis, 'lastNamingSave'),
        )
        if (
          !Array.isArray(layerSave.definition) ||
          layerSave.namingRules.place.base !== 'feature'
        )
          throw Error('Layer override is incorrect')
        await page
          .getByRole('button', {
            name: /^(Configure naming rule|Define custom rules)$/,
          })
          .click()
        await panel
          .getByRole('button', { name: 'Reset to project default', exact: true })
          .click()
        await page.getByRole('button', { name: 'Save settings', exact: true }).click()
        if (
          Object.keys(
            (await page.evaluate(() => Reflect.get(globalThis, 'lastNamingSave')))
              .namingRules,
          ).length
        )
          throw Error('Reset did not restore inheritance')
        if (
          await page.evaluate(
            () => document.documentElement.scrollWidth > innerWidth + 1,
          )
        )
          throw Error('Horizontal overflow')
        await page.addInitScript(() => Reflect.set(globalThis, 'fieldMode', 'empty'))
        await page.reload()
        await page.getByRole('switch', { name: 'Custom', exact: true }).check()
        await page
          .getByRole('button', {
            name: /^(Configure naming rule|Define custom rules)$/,
          })
          .click()
        await panel
          .getByText('No boolean, toggle or short-text fields', { exact: true })
          .waitFor()
        if (
          !(await panel
            .getByRole('button', { name: 'Add condition', exact: true })
            .isDisabled())
        )
          throw Error('Missing-field action enabled')
        await panel.getByRole('button', { name: 'Cancel', exact: true }).click()
        await page.evaluate(() => Reflect.set(globalThis, 'fieldMode', 'error'))
        await page
          .getByRole('button', {
            name: /^(Configure naming rule|Define custom rules)$/,
          })
          .click()
        await panel
          .getByText('Unable to load naming fields.', { exact: true })
          .waitFor()
        await page.evaluate(() => Reflect.set(globalThis, 'fieldMode', 'available'))
        await panel
          .getByRole('button', { name: 'Retry loading fields', exact: true })
          .click()
        await panel.getByRole('button', { name: 'Add condition', exact: true }).click()
        if (errors.length) throw Error(errors.join('\n'))
        reports.push({
          engine,
          width,
          inlineFullWidth: true,
          isolatedDraft: true,
          acceptAndCancel: true,
          compactSummary: true,
          multilingualRowsAndRuleSections: true,
          keyboardReorder: true,
          localizedPreview: true,
          inheritance: true,
          emptyAndRetry: true,
          errors,
        })
      } catch (error) {
        console.log({
          engine,
          width,
          errors,
          body: (await page.locator('body').textContent())?.slice(0, 4000),
        })
        await page.screenshot({
          path: `${output}/${engine}-${width}-failure.png`,
          fullPage: true,
        })
        throw error
      }
      await page.close()
    }
  } finally {
    await browser.close()
  }
}
await writeFile(`${output}/report.json`, JSON.stringify(reports, null, 2))
console.log(JSON.stringify(reports, null, 2))
