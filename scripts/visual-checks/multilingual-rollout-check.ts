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
      const errors: string[] = []
      page.on('pageerror', error => {
        errors.push(error.stack ?? error.message)
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
      await page.route('**/src/lib/api/translation.remote.*', route =>
        route.fulfill({
          contentType: 'application/javascript',
          body: "export async function translateContentField({source,target,text}) { await new Promise(r=>setTimeout(r,100)); return {status:'translated',text:target+' '+text} }",
        }),
      )
      await page.route('**/__hub-state.html*', r =>
        r.fulfill({
          contentType: 'text/html',
          body: '<html lang="en" data-theme="breadline-light"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>@layer theme,base,components,utilities;</style><script>globalThis.__sveltekit_dev={env:{}}</script></head><body><div id="app"></div><script type="module" src="/src/tests/fixtures/multilingualRolloutCheck.ts"></script></body></html>',
        }),
      )
      page.setDefaultTimeout(60000)
      await page.goto(
        `${process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:4193'}/__hub-state.html?hub=1&fallback=1`,
        {
          waitUntil: 'domcontentloaded',
          timeout: 60000,
        },
      )
      await page.getByRole('button', { name: 'Save record' }).click()
      const dialog = page.locator('[data-translation-dialog]')
      await dialog.getByRole('button', { name: /Location.*2 fields/ }).waitFor()
      await dialog.getByRole('button', { name: /Capabilities.*1 field/ }).click()
      await dialog.getByRole('button', { name: 'Translate from English' }).click()
      await dialog.getByRole('button', { name: 'Accept all and continue' }).waitFor()
      await page.screenshot({
        path: `${process.env.DEV_RUNNER_ARTIFACTS}/rollout-${width}.png`,
        animations: 'disabled',
      })
      await dialog.getByRole('button', { name: 'Accept all and continue' }).click()
      await page.waitForFunction(
        () =>
          document
            .querySelector('[data-rollout-fixture]')
            ?.getAttribute('data-saved') === '1',
      )
      const fixture = page.locator('[data-rollout-fixture]')
      if (!JSON.parse((await fixture.getAttribute('data-names'))!)['zh-Hant'])
        throw Error('Name not saved')
      if (!JSON.parse((await fixture.getAttribute('data-labels'))!)['zh-Hant'])
        throw Error('Capability not saved')
      if (!JSON.parse((await fixture.getAttribute('data-branch'))!)['zh-Hant'])
        throw Error('Branch translation not saved')
      if (errors.length) throw Error(errors.join('\n'))
      await page.close()
      console.log('PASS multilingual rollout', width)
    }
  } finally {
    await browser.close()
  }
}
