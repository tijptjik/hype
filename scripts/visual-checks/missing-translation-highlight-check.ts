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
          body: '<html lang="en" data-theme="breadline-light"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>@layer theme,base,components,utilities;</style><script>globalThis.__sveltekit_dev={env:{}}</script></head><body><div id="app"></div><script type="module" src="/src/tests/fixtures/translationReviewCheck.ts"></script></body></html>',
        }),
      )
      page.setDefaultTimeout(60000)
      await page.goto(
        `${process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:4193'}/__hub-state.html?hub=1&legacy=1`,
        {
          waitUntil: 'domcontentloaded',
          timeout: 60000,
        },
      )
      await page.getByRole('button', { name: 'Save record' }).click()
      await page.getByRole('dialog').waitFor()
      const existing = page.locator('[data-translation-cell="zh-Hant:title"]')
      if (await existing.locator('[data-translation-suggestion]').count())
        throw Error('Existing AI value has suggestion controls')
      const empty = page.locator('[data-translation-cell="ja:title"]')
      if (await existing.getAttribute('data-missing-translation'))
        throw Error('Existing AI text highlighted as missing')
      if ((await empty.getAttribute('data-missing-translation')) !== 'true')
        throw Error('Empty translation not highlighted')
      await page.screenshot({
        path: `${process.env.DEV_RUNNER_ARTIFACTS}/missing-only-${width}.png`,
      })
      console.log(width, 'only empty translation highlighted')
      await page.close()
    }
  } finally {
    await browser.close()
  }
}
