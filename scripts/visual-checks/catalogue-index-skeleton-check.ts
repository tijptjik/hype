// NODE
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
// PLAYWRIGHT
import { chromium, expect } from '@playwright/test'
const origin = process.env.PLAYWRIGHT_BASE_URL
const artifacts = process.env.DEV_RUNNER_ARTIFACTS
const placement = process.env.DEV_RUNNER_CHROME_CLASS
if (!origin || !artifacts || !placement)
  throw new Error('Use dev-remote --port PORT chrome')
await mkdir(artifacts, { recursive: true })
const browser = await chromium.launch({
  channel: 'chrome',
  headless: false,
  args: ['--ozone-platform=x11', `--class=${placement}`],
})
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(`${origin}/admin`, { timeout: 120000 })
  const session = await (
    await page.request.get(`${origin}/api/auth/get-session`)
  ).json()
  expect(session?.user?.id).toBe('hype-local-agent-admin')
  expect(new URL(page.url()).pathname).toMatch(/^\/admin/)
  let release: () => void = () => {}
  const gate = new Promise<void>(resolve => {
    release = resolve
  })
  await page.route('**/_app/remote/**/findIdentityCatalogue*', async route => {
    await gate
    await route.continue()
  })
  try {
    await page.goto(`${origin}/admin/catalogue`, { timeout: 120000 })
    const loading = page.getByRole('status', { name: 'Loading catalogue', exact: true })
    await expect(loading).toBeVisible({ timeout: 120000 })
    await expect(loading.locator('.bits-index-card')).toHaveCount(8)
    await page.screenshot({
      path: resolve(artifacts, 'catalogue-card-skeletons.png'),
      fullPage: true,
    })
    await page.getByRole('button', { name: 'Show rows', exact: true }).click()
    await expect(loading.locator(':scope > [role="status"]')).toHaveCount(10)
    await page.screenshot({
      path: resolve(artifacts, 'catalogue-row-skeletons.png'),
      fullPage: true,
    })
    await page.getByRole('button', { name: 'Show cards', exact: true }).click()
    await expect(loading.locator('.bits-index-card')).toHaveCount(8)
    await page.screenshot({
      path: resolve(artifacts, 'catalogue-card-skeletons.png'),
      fullPage: true,
    })
  } finally {
    release()
  }
  await expect(
    page.getByRole('status', { name: 'Loading catalogue', exact: true }),
  ).toHaveCount(0, { timeout: 60000 })
  await page
    .getByRole('button', { name: 'Entity Catalog actions', exact: true })
    .click()
  await expect(
    page.getByRole('menuitem', {
      name: 'Sync Curated Locations to Brand Catalog',
      exact: true,
    }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', {
      name: 'Sync imported brands',
      exact: true,
    }),
  ).toHaveCount(0)
  await page.screenshot({
    path: resolve(artifacts, 'catalogue-sync-menu.png'),
    fullPage: true,
  })
  await page.keyboard.press('Escape')
  expect(errors).toEqual([])
} finally {
  await browser.close()
}
