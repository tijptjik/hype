import { mkdir } from 'node:fs/promises'
import { browserCases } from './lib/browser-cases'
await mkdir('output/playwright/translation-review', { recursive: true })
for await (const { name, browser } of browserCases()) {
  for (const width of [390, 1440]) {
    const page = await browser.newPage({
      viewport: { width, height: 1000 },
      reducedMotion: 'reduce',
    })
    await page.route('**/__translation-review.html', route =>
      route.fulfill({
        contentType: 'text/html',
        body: '<html lang="en" data-theme="breadline-dark"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>@layer theme,base,components,utilities;</style><script>globalThis.__sveltekit_dev={env:{}}</script></head><body><div id="app"></div><script type="module" src="/src/tests/fixtures/translationReviewCheck.ts"></script></body></html>',
      }),
    )
    await page.goto('http://127.0.0.1:4173/__translation-review.html')
    await page.getByRole('button', { name: 'Save record' }).click()
    await page.getByText('Missing translations in this tab', { exact: false }).waitFor()
    await page.getByRole('button', { name: 'Translate with AI', exact: true }).click()
    await page
      .getByRole('button', { name: 'Accept translation', exact: true })
      .first()
      .waitFor()
    const before = await page.locator('output').getAttribute('data-values')
    if (JSON.parse(before ?? '{}').zhHant.title !== '')
      throw new Error('Generation implicitly accepted a suggestion')
    await page.screenshot({
      path: `output/playwright/translation-review/${name}-${width}.png`,
    })
    await page
      .getByRole('button', { name: 'Accept all and continue', exact: true })
      .click()
    await page.locator('[data-active="description"]').waitFor()
    await page
      .getByRole('button', { name: 'Keep undefined and continue', exact: true })
      .click()
    await page.locator('[data-saved="1"]').waitFor()
    const after = JSON.parse(
      (await page.locator('output').getAttribute('data-values')) ?? '{}',
    )
    if (!after.ja.title || after.ja.description !== '')
      throw new Error('Tab acceptance leaked into another field')
    await page.getByRole('button', { name: 'AI-translated: show original' }).click()
    await page.getByText('Original kitchen label', { exact: true }).waitFor()
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth))
      throw new Error('Horizontal overflow')
    console.log(
      `${name} ${width}: explicit acceptance, tab sequencing, original text passed`,
    )
    // Exercise catalogue proposal controls with a deterministic provider boundary.
    await page.route('**/src/lib/api/translation.remote.ts*', route =>
      route.fulfill({
        contentType: 'application/javascript',
        body: `export async function translateContentField(input) { return { status: 'translated', text: 'Suggested option', source: input.source, target: input.target, automatic: { value: 'Suggested option', sourceLocale: input.source, sourceText: input.text, sourceHash: 'a'.repeat(64), receipt: 'b'.repeat(64), provider: 'fixture', model: null, generatedAt: '2026-11-12T00:00:00Z' } } }`,
      }),
    )
    await page.route('**/__field-review.html', route =>
      route.fulfill({
        contentType: 'text/html',
        body: '<html lang="en" data-theme="breadline-dark"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>@layer theme,base,components,utilities;</style><script>globalThis.__sveltekit_dev={env:{}}</script></head><body><div id="app"></div><script type="module" src="/src/tests/fixtures/fieldTranslationReviewCheck.ts"></script></body></html>',
      }),
    )
    await page.goto('http://127.0.0.1:4173/__field-review.html')
    await page.getByRole('button', { name: 'Multilingual', exact: true }).click()
    await page
      .getByRole('button', { name: 'Clear Option 1 zh-Hant', exact: true })
      .click()
    const option = page.locator('[data-dnd-item]').first()
    await option
      .getByRole('button', { name: 'Translate empty values from English', exact: true })
      .click()
    await option
      .getByRole('button', { name: 'Accept translation', exact: true })
      .first()
      .waitFor()
    const staged = JSON.parse(
      (await page.locator('output').getAttribute('data-property-state')) ?? '{}',
    )
    if (staged.properties[0].values[0].i18n.zhHant.value !== '')
      throw new Error('Property generation filled an authored value')
    await option
      .getByRole('button', { name: 'Accept translation', exact: true })
      .first()
      .click()
    await page.waitForFunction(
      () =>
        JSON.parse(
          document.querySelector('output')?.getAttribute('data-property-state') ?? '{}',
        ).properties[0].values[0].i18n.zhHant.value === 'Suggested option',
    )
    await page.screenshot({
      path: `output/playwright/translation-review/fields-${name}-${width}.png`,
    })
    console.log(`${name} ${width}: catalogue proposal and individual acceptance passed`)
    await page.close()
  }
}
