import { chromium, firefox } from 'playwright'
import { mkdir } from 'node:fs/promises'
await mkdir('output/playwright/display-template', { recursive: true })
for (const [name, engine] of [
  ['chromium', chromium],
  ['firefox', firefox],
] as const) {
  const browser = await engine.launch()
  try {
    for (const width of [1120, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } })
      const errors: string[] = []
      page.on('pageerror', error => errors.push(error.message))
      await page.route('**/__template-check.html', route =>
        route.fulfill({
          contentType: 'text/html',
          body: '<html lang="en" data-theme="breadline-light"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>@layer theme,base,components,utilities;</style><script>globalThis.__sveltekit_dev={env:{}}</script></head><body class="bits-theme"><div id="app"></div><script type="module" src="/src/tests/fixtures/displayTemplateCheck.ts"></script></body></html>',
        }),
      )
      await page.goto(
        `${process.argv[2] ?? 'http://127.0.0.1:4173'}/__template-check.html`,
      )
      const select = async (label: string, option: string): Promise<void> => {
        await page.getByRole('combobox', { name: label, exact: true }).click()
        await page.getByRole('option', { name: option, exact: true }).click()
      }
      await page.getByRole('textbox', { name: 'Expression', exact: true }).waitFor()
      await page.getByText('Sample values', { exact: true }).first().click()
      await page
        .getByRole('textbox', { name: 'brand.name: Sample values', exact: true })
        .fill('AROME')
      await page
        .getByRole('textbox', { name: 'branch: Sample values', exact: true })
        .fill('Central')
      await page.waitForFunction(
        () => document.querySelector('output')?.textContent === 'AROME - Central',
      )
      await select('branch: Cases', 'Missing')
      await page
        .getByRole('textbox', { name: 'source.name: Sample values', exact: true })
        .fill('Original name')
      await page.waitForFunction(
        () => document.querySelector('output')?.textContent === 'Original name',
      )
      await page
        .getByRole('textbox', { name: 'Expression', exact: true })
        .fill('{{ cases(properties.open, "Open", "Closed", "Unknown") }}')
      await select('properties.open: Cases', 'False')
      await page.waitForFunction(
        () => document.querySelector('output')?.textContent === 'Closed',
      )
      await select('Insert', 'Cases')
      await select('Property', 'properties.open')
      await page
        .getByRole('textbox', { name: 'True / present', exact: true })
        .fill('Yes')
      await page.getByRole('button', { name: 'Insert', exact: true }).click()
      if (
        !(
          await page
            .getByRole('textbox', { name: 'Expression', exact: true })
            .inputValue()
        ).includes('"Yes"')
      )
        throw new Error('Case insertion failed')
      if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth))
        throw new Error(`Overflow: ${name} ${width}`)
      if (errors.length) throw new Error(errors.join('\n'))
      await page.screenshot({
        path: `output/playwright/display-template/${name}-${width}.png`,
        fullPage: true,
      })
      await page.close()
      console.log(
        `${name} ${width}: pair, fallback, false case, insertion and width passed`,
      )
    }
  } finally {
    await browser.close()
  }
}
