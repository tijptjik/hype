import assert from 'node:assert/strict'
import { chromium } from '@playwright/test'
import path from 'node:path'

const output = process.env.DEV_RUNNER_ARTIFACTS
const baseURL = process.env.PLAYWRIGHT_BASE_URL
if (!output || !baseURL) throw new Error('Run through dev-remote --port PORT chrome')
const browser = await chromium.launch({
  channel: 'chrome',
  headless: false,
  args: ['--ozone-platform=x11', `--class=${process.env.DEV_RUNNER_CHROME_CLASS}`],
})
try {
  const page = await browser.newPage()
  await page.goto(baseURL)
  const session = await (
    await page.request.get(new URL('/api/auth/get-session', baseURL).href)
  ).json()
  assert.equal(session?.user?.id, 'hype-local-agent-admin')
  const response = await page.goto(
    new URL('/admin/layers/1msQMcuqfHrP#features', baseURL).href,
  )
  assert(response?.ok())
  assert(new URL(page.url()).pathname.startsWith('/admin/layers/'))
  // Mount the real notification with retained progress; no resource mutations are needed.
  await page.evaluate(async () => {
    const { showProgress } = await import(
      '/src/tests/fixtures/backgroundJobStatusCheck.ts'
    )
    window.progressStyleJobs = showProgress()
  })
  const status = page
    .locator('[data-sonner-toast]')
    .filter({ hasText: 'Archive features' })
  await status.waitFor()
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 })
    const appearance = await status.evaluate(el => {
      const box = el.getBoundingClientRect()
      return {
        background: getComputedStyle(el).backgroundColor,
        left: box.left,
        right: box.right,
        overflow: el.scrollWidth > el.clientWidth,
      }
    })
    assert(
      !appearance.background.includes('rgba') &&
        appearance.background !== 'transparent',
      JSON.stringify(appearance),
    )
    assert(
      appearance.left >= 0 && appearance.right <= width && !appearance.overflow,
      JSON.stringify(appearance),
    )
    await page.screenshot({ path: path.join(output, `progress-${width}.png`) })
    console.log(width, appearance)
  }
  await page.evaluate(() => {
    window.progressStyleJobs.jobs[0].status = 'complete'
  })
  await page.waitForFunction(() =>
    document.querySelector('[data-sonner-toast][data-type=success]'),
  )
  assert.equal(await status.count(), 1)
  await status.waitFor({ state: 'detached' })
} finally {
  await browser.close()
}
