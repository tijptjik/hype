import assert from 'node:assert/strict'
import { chromium, expect } from '@playwright/test'
const browser = await chromium.launch({
  channel: 'chrome',
  headless: false,
  args: ['--ozone-platform=x11', `--class=${process.env.DEV_RUNNER_CHROME_CLASS}`],
})
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  await page.goto(`${process.env.PLAYWRIGHT_BASE_URL}/premises/kennedy-town-mtr`)
  const levels = page.getByRole('navigation', { name: 'Indoor levels' })
  await expect(levels).toBeVisible({ timeout: 120000 })
  const buttons = levels.getByRole('button')
  console.log(await buttons.allTextContents())
  await buttons.nth(3).click()
  await page.waitForTimeout(5000)
  await page.screenshot({
    path: `${process.env.DEV_RUNNER_ARTIFACTS}/ground-c-slope.png`,
  })
  console.log(
    'Exterior connections:',
    await page.locator('[data-exterior-continuation]').count(),
  )
} finally {
  await browser.close()
}
