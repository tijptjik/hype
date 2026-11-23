/** Verify independent full-logo and mark slots without changing catalogue records. */
import { mkdir } from 'node:fs/promises'
import { chromium, expect } from '@playwright/test'
const origin = process.env.PLAYWRIGHT_BASE_URL
const artifacts = process.env.DEV_RUNNER_ARTIFACTS
const placement = process.env.DEV_RUNNER_CHROME_CLASS
if (!origin || !artifacts || !placement) throw new Error('Use dev-remote chrome')
await mkdir(artifacts, { recursive: true })
const browser = await chromium.launch({
  channel: 'chrome',
  headless: false,
  args: ['--ozone-platform=x11', `--class=${placement}`],
})
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  await page.goto(`${origin}/admin`, { timeout: 120000 })
  const session = await (
    await page.request.get(`${origin}/api/auth/get-session`)
  ).json()
  expect(session?.user?.id).toBe('hype-local-agent-admin')
  expect(new URL(page.url()).pathname).toMatch(/^\/admin/)
  await page.goto(`${origin}/admin/catalog/group/china-eastern-air-holding-company`, {
    timeout: 120000,
  })
  const library = page.getByRole('region', { name: 'Logo library' })
  await expect(library).toBeVisible({ timeout: 120000 })
  await expect(library.locator('[data-artwork-slot="logo-full"] img')).toBeVisible()
  await expect(library.locator('[data-artwork-slot="logo-mark"] img')).toBeVisible()
  for (const slot of ['logo-full', 'logo-mark']) {
    await expect
      .poll(() =>
        library
          .locator(`[data-artwork-slot="${slot}"] img`)
          .evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0),
      )
      .toBe(true)
  }
  await library.scrollIntoViewIfNeeded()
  await page.screenshot({ path: `${artifacts}/artwork-roles-desktop.png` })
  await page.reload({ timeout: 120000 })
  await expect(library.locator('[data-artwork-slot="logo-full"]')).toBeVisible({
    timeout: 120000,
  })
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  const variant = library.getByLabel('Variant code', { exact: true })
  await expect(variant).toBeVisible()
  await variant.fill('logo-full')
  await expect(variant).toHaveValue('logo-full')
  await expect(
    page.locator('#catalogue-artwork-roles option[value="logo-mark"]'),
  ).toHaveCount(1)
  await page.reload({ timeout: 120000 })
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.getByText('Window Too Small', { exact: true })).toBeVisible()
  await page.screenshot({ path: `${artifacts}/artwork-roles-mobile-guard.png` })
} finally {
  await browser.close()
}
