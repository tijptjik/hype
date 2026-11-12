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
      const pageErrors: string[] = []
      page.on('pageerror', error => {
        pageErrors.push(error.stack ?? error.message)
        console.error(error.stack ?? error.message)
      })
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
        `${process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:4193'}/__hub-state.html?hub=1&policy=1`,
        {
          waitUntil: 'domcontentloaded',
          timeout: 60000,
        },
      )
      await page.evaluate(() => {
        const root = document.querySelector('[data-review-fixture]')!
        ;(window as any).reviewTabsSeen = []
        new MutationObserver(() => {
          const seen = (window as any).reviewTabsSeen as string[]
          const current = root.getAttribute('data-active')!
          if (seen.at(-1) !== current) seen.push(current)
        }).observe(root, { attributes: true, attributeFilter: ['data-active'] })
      })
      await page.getByRole('button', { name: 'Save record' }).click()
      const dialog = page.locator('[data-translation-dialog]')
      await dialog.getByRole('button', { name: 'Translate from English' }).click()
      await page
        .locator('[data-facet-ref="core"][aria-busy="true"] .animate-spin')
        .waitFor()
      await page
        .locator('[data-facet-ref="policies"][aria-busy="true"] .animate-spin')
        .waitFor()
      await page.waitForFunction(
        () => (window as any).reviewTabsSeen.join(',') === 'privacyPolicy,title',
      )
      await dialog.getByRole('button', { name: 'Accept all and continue' }).waitFor()
      if ((await page.locator('[data-translation-suggestion]').count()) !== 4)
        throw Error('Generation did not cover both tabs')
      if (
        (await page.locator('[data-review-fixture]').getAttribute('data-saved')) !== '0'
      )
        throw Error('Generation saved without review')
      await page.screenshot({
        path: `${process.env.DEV_RUNNER_ARTIFACTS}/sequence-${width}.png`,
        animations: 'disabled',
      })
      await dialog.getByRole('button', { name: 'Accept all and continue' }).click()
      await page.waitForFunction(
        () =>
          document
            .querySelector('[data-review-fixture]')
            ?.getAttribute('data-saved') === '1',
      )
      if (await dialog.count())
        throw Error('Review dialog remained after accepting all tabs')
      const values = JSON.parse(
        (await page.locator('[data-review-fixture]').getAttribute('data-values'))!,
      )
      if (
        !values.en.privacyPolicy ||
        !values.ja.privacyPolicy ||
        !values.zhHant.title ||
        !values.ja.title
      )
        throw Error('One-click acceptance did not save suggestions across tabs')
      if (pageErrors.length) throw Error(pageErrors.join('\n'))
      console.log('PASS sequential generation and explicit review', width)
      await page.close()
    }
  } finally {
    await browser.close()
  }
}
