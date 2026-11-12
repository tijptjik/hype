import { mkdir } from 'node:fs/promises'
await mkdir(
  process.env.DEV_RUNNER_ARTIFACTS ?? 'output/playwright/hub-translation-review',
  { recursive: true },
)
import { chromium } from '@playwright/test'
for (const type of [chromium]) {
  if (!process.env.DEV_RUNNER_CHROME_CLASS || !process.env.PLAYWRIGHT_BASE_URL)
    throw new Error('Run through dev-remote chrome with managed visible launch options')
  const browser = await type.launch({
    headless: false,
    channel: 'chrome',
    args: ['--ozone-platform=x11', `--class=${process.env.DEV_RUNNER_CHROME_CLASS}`],
  })
  try {
    for (const width of [390, 1440]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 } })
      page.on('pageerror', error => console.error(error.message))
      const baseURL = process.env.PLAYWRIGHT_BASE_URL!
      const adminResponse = await page.goto(new URL('/admin', baseURL).href, {
        waitUntil: 'domcontentloaded',
        timeout: 120000,
      })
      if (!adminResponse?.ok() || !new URL(page.url()).pathname.startsWith('/admin'))
        throw Error('Admin access failed')
      await page
        .locator('main:visible, [role=main]:visible, button:visible')
        .first()
        .waitFor({ timeout: 120000 })
      const sessionResponse = await page.request.get(
        new URL('/api/auth/get-session', baseURL).href,
      )
      const session = await sessionResponse.json()
      if (session?.user?.id !== 'hype-local-agent-admin')
        throw Error('Local admin identity not available')
      await page.route('**/__hub-state.html*', r =>
        r.fulfill({
          contentType: 'text/html',
          body: '<html lang="en" data-theme="breadline-light"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>@layer theme,base,components,utilities;</style><script>globalThis.__sveltekit_dev={env:{}}</script></head><body><div id="app"></div><script type="module" src="/src/tests/fixtures/advancedLayoutCheck.ts"></script></body></html>',
        }),
      )
      page.setDefaultTimeout(60000)
      await page.goto(
        `${process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:4193'}/__hub-state.html?hub=1&filled=1`,
        {
          waitUntil: 'domcontentloaded',
          timeout: 60000,
        },
      )
      const once = page.getByRole('switch', {
        name: 'Ask about missing translations only once',
      })
      await once.waitFor()
      if (width === 1440) {
        const content = page.getByRole('switch', {
          name: 'Always show content translations',
        })
        const address = page.getByRole('switch', {
          name: 'Always show address translations',
        })
        const [a, b, c] = await Promise.all([
          content.boundingBox(),
          address.boundingBox(),
          once.boundingBox(),
        ])
        if (!a || !b || !c || Math.abs(a.x - c.x) > 2 || c.y <= b.y)
          throw Error('Third toggle is not aligned below the language toggles')
      }
      await page.screenshot({
        path: `${process.env.DEV_RUNNER_ARTIFACTS}/languages-${width}.png`,
      })
      console.log(width, 'language settings layout passed')
      await page.close()
    }
  } finally {
    await browser.close()
  }
}
