import { chromium, firefox } from 'playwright'
import { mkdir } from 'node:fs/promises'
await mkdir('output/playwright/feature-rule-title', { recursive: true })
for (const [name, engine] of [
  ['chromium', chromium],
  ['firefox', firefox],
] as const) {
  const browser = await engine.launch()
  try {
    for (const width of [1225, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 800 } })
      const errors: string[] = []
      page.on('pageerror', error => errors.push(error.message))
      await page.route('**/__rule-title.html', route =>
        route.fulfill({
          contentType: 'text/html',
          body: '<html lang="en" data-theme="breadline-light"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>@layer theme,base,components,utilities;</style><script>globalThis.__sveltekit_dev={env:{}}</script></head><body class="bits-theme"><div id="app"></div><script type="module" src="/src/tests/fixtures/featureRuleTitleCheck.ts"></script></body></html>',
        }),
      )
      await page.goto('http://127.0.0.1:5175/__rule-title.html')
      await page.getByText('Garden — donor', { exact: true }).waitFor()
      await page.screenshot({
        path: `output/playwright/feature-rule-title/${name}-${width}.png`,
      })
      await page.getByRole('button', { name: 'Unlink', exact: true }).click()
      await page.getByRole('button', { name: 'Title · English', exact: true }).click()
      const input = page.getByRole('textbox', { name: 'Title · English', exact: true })
      await input.fill('Independent Garden')
      await input.press('Escape')
      await page.getByText('Garden — donor', { exact: true }).waitFor()
      await page.getByRole('button', { name: 'Title · English', exact: true }).click()
      await input.fill('Independent Garden')
      await input.press('Enter')
      await page.getByText('Independent Garden', { exact: true }).waitFor()
      if ((await page.locator('[name="baseName"]').inputValue()) !== 'Garden')
        throw Error('Base name changed')
      await page.getByRole('button', { name: 'Use name', exact: true }).click()
      await page.getByText('Managed by location', { exact: true }).waitFor()
      if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth))
        throw Error('Horizontal overflow')
      if (errors.length) throw Error(errors.join('\n'))
      console.log(
        `${name} ${width}: title editing, Escape, inheritance and overflow passed`,
      )
      await page.close()
    }
  } finally {
    await browser.close()
  }
}
