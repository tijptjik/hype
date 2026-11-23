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
  for (const kind of ['brand', 'group']) {
    await page.goto(`${origin}/admin/catalogue?kind=${kind}`, { timeout: 120000 })
    await expect(page.getByText('Archived', { exact: true })).toHaveCount(0)
    await page.getByRole('button', { name: 'Show filters', exact: true }).click()
    await expect(page.getByText('Archived', { exact: true })).toBeVisible({
      timeout: 120000,
    })
    for (const [label, state] of [
      ['Is', 'checked'],
      ['Is', 'indeterminate'],
      ['Not', 'unchecked'],
    ]) {
      await page.getByRole('button', { name: label, exact: true }).click()
      await expect(
        page
          .locator('.bits-resource-filter-bar__tri-toggle')
          .filter({ hasText: 'Archived' })
          .getByRole('switch'),
      ).toHaveAttribute('data-state', state)
    }
    if (kind === 'brand') {
      await expect(page.getByText('Independent', { exact: true })).toBeVisible()
      for (const [label, state] of [
        ['Yes', 'checked'],
        ['No', 'unchecked'],
        ['No', 'indeterminate'],
      ]) {
        await page.getByRole('button', { name: label, exact: true }).click()
        await expect(
          page
            .locator('.bits-resource-filter-bar__tri-toggle')
            .filter({ hasText: 'Independent' })
            .getByRole('switch'),
        ).toHaveAttribute('data-state', state)
      }
    }
    await expect(
      page.getByRole('status', { name: 'Loading catalogue', exact: true }),
    ).toHaveCount(0)
    await page.getByRole('button', { name: 'Hide filters', exact: true }).click()
    await expect(page.getByText('Archived', { exact: true })).toHaveCount(0)
    await page.getByRole('button', { name: 'Show filters', exact: true }).click()
    await page.screenshot({
      path: resolve(artifacts, `catalogue-archive-filter-${kind}.png`),
      fullPage: true,
    })
  }
  expect(errors).toEqual([])
} finally {
  await browser.close()
}
