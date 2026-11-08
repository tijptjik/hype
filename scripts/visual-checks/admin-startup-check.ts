// PLAYWRIGHT
import { chromium } from 'playwright'
// NODE
import { mkdir } from 'node:fs/promises'

const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
})
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.route('**/__admin-startup.html', route =>
    route.fulfill({
      contentType: 'text/html',
      body: '<html lang="en" data-theme="breadline-light"><head><style>@layer theme,base,components,utilities;</style><script>globalThis.__sveltekit_dev={env:{}}</script></head><body><div id="app"></div><script type="module" src="/src/tests/fixtures/adminStartupCheck.ts"></script></body></html>',
    }),
  )
  await page.goto('http://127.0.0.1:4173/__admin-startup.html')
  await page.getByText('Loading section', { exact: true }).waitFor()
  await page.locator('[data-test-sidebar]').waitFor()
  if (await page.locator('[data-test-content]').count())
    throw new Error('Content mounted before data readiness')
  await page.getByRole('button', { name: 'Projects', exact: true }).click()
  await page.getByRole('button', { name: 'Fail data' }).click()
  await page.getByText('Request failed', { exact: true }).waitFor()
  await page.locator('[data-test-sidebar]').waitFor()
  await page.getByRole('button', { name: 'Retry data' }).click()
  await page.getByText('Loading section', { exact: true }).waitFor()
  await mkdir('output/playwright', { recursive: true })
  await page.screenshot({ path: 'output/playwright/admin-startup-pending.png' })
  await page.getByRole('button', { name: 'Resolve data' }).click()
  await page.getByText('Projects content', { exact: true }).waitFor()
  if (await page.getByText('Loading section', { exact: true }).count())
    throw new Error('Pending content survived readiness')
  if (errors.length) throw new Error(errors.join('\n'))
  console.log(
    JSON.stringify({
      shellVisibleBeforeData: true,
      navigationUsable: true,
      contentDeferred: true,
      retry: true,
      contentResolved: true,
    }),
  )
} finally {
  await browser.close()
}
