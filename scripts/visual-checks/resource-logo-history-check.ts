// RUNTIME
import { mkdir } from 'node:fs/promises'
import { chromium, firefox } from 'playwright'
const base = process.env.LOGO_CHECK_URL ?? 'http://hype.localhost'
const directory = 'output/playwright/resource-logo-history'
await mkdir(directory, { recursive: true })
for (const [name, engine] of [
  ['chromium', chromium],
  ['firefox', firefox],
] as const) {
  const browser = await engine.launch({ headless: true })
  try {
    for (const width of [1280, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } })
      const errors: string[] = []
      page.on('pageerror', e => errors.push(e.message))
      await page.route('**/__logo-history.html', route =>
        route.fulfill({
          contentType: 'text/html',
          body: '<html lang="en" data-theme="breadline-light"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>@layer theme,base,components,utilities;</style><script>globalThis.__sveltekit_dev={env:{}}</script></head><body><div id="app"></div><script type="module" src="/src/tests/fixtures/resourceLogoHistoryCheck.ts"></script></body></html>',
        }),
      )
      await page.route('**/api/images/revisions/*', route =>
        route.fulfill({
          contentType: 'image/svg+xml',
          body: `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="${route.request().url().includes('/old') ? '#aabbcc' : '#446688'}"/></svg>`,
        }),
      )
      await page.goto(`${base}/__logo-history.html`)
      await page
        .getByText('Exact historical version unavailable', { exact: true })
        .waitFor()
      const disclosure = page.locator('button[aria-controls="changes-edit"]')
      if ((await disclosure.getAttribute('aria-expanded')) === 'true')
        await disclosure.click()
      await disclosure.click()
      const before = page.getByRole('img', { name: 'Before logo', exact: true }),
        after = page.getByRole('img', { name: 'After logo', exact: true })
      await before.waitFor({ timeout: 5000 }).catch(async cause => {
        await page.screenshot({ path: `${directory}/failure.png`, fullPage: true })
        console.log(await page.locator('body').innerText(), errors)
        throw cause
      })
      await after.waitFor()
      await page.getByText('Rotation', { exact: true }).waitFor()
      await page.getByText('0°', { exact: true }).waitFor()
      await page.getByText('90°', { exact: true }).waitFor()
      await page.getByText('Display mode', { exact: true }).waitFor()
      await page.getByText('Cover', { exact: true }).waitFor()
      await page.getByText('Full · Cast Edges', { exact: true }).waitFor()
      if (
        !(await before.getAttribute('src'))?.includes('/old?') ||
        !(await after.getAttribute('src'))?.includes('/new?')
      )
        throw new Error('Historical revision substitution')
      if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth))
        throw new Error('Horizontal overflow')
      if (errors.length) throw new Error(errors.join('\n'))
      await page.screenshot({
        path: `${directory}/${name}-${width}.png`,
        fullPage: true,
      })
      await page.close()
    }
  } finally {
    await browser.close()
  }
}
console.log('Logo history: Chromium and Firefox desktop/mobile passed')
