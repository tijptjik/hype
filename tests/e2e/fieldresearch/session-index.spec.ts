import { expect, test } from '@playwright/test'
import path from 'node:path'

test.use({
  viewport: { width: 1600, height: 1100 },
  launchOptions: {
    args: [
      '--ozone-platform=x11',
      `--class=${process.env.DEV_RUNNER_CHROME_CLASS}`,
      '--disable-web-security',
    ],
  },
})

test('shows research sessions as shared rows with layer and creator metadata', async ({
  page,
}) => {
  test.setTimeout(120000)
  const artifacts = process.env.DEV_RUNNER_ARTIFACTS
  if (!artifacts) throw new Error('Missing artifacts directory')
  await page.goto('/admin/fieldresearch')
  const auth = await (await page.request.get('/api/auth/get-session')).json()
  expect(auth.user.id).toBe('hype-local-agent-admin')
  const region = page.getByRole('region', { name: 'Research sessions' })
  const row = region.locator('[data-entity-id]').first()
  await expect(row).toBeVisible({ timeout: 60000 })
  await expect(row.locator('svg')).toHaveCount(1)
  await expect(row.locator('p').first()).not.toBeEmpty()
  await expect(row.locator('p').nth(1)).toContainText('Donors')
  await expect(row.locator('p').nth(1)).toContainText(/\d+ photos?/)
  await expect(row.locator('p').nth(1)).toContainText(/\d+ stacks?/)
  await expect(row.locator('[aria-label^="Created by"]')).toBeVisible()
  await expect(row.locator('time')).toContainText(/ago|in /)
  await expect(row.locator('time')).toHaveAttribute('title', /^Created /)
  await expect(
    page.getByRole('heading', { name: 'Field research', exact: true }),
  ).toHaveCount(0)
  await page.screenshot({ path: path.join(artifacts, 'research-filter-menu.png') })
  const association = page.getByRole('button', { name: 'Association', exact: true })
  await expect(association.locator('..')).toHaveCSS('height', '40px')
  await association.click()
  for (const [field, choice] of [
    ['Creator', 'Local agent admin'],
    ['Organisation', 'HKFoodWorks'],
    ['Project', 'Breadline'],
    ['Layer', 'Donors'],
  ]) {
    await page
      .getByRole('combobox', { name: `Any ${field.toLowerCase()}`, exact: true })
      .click()
    if (field === 'Project') {
      await expect(page.getByRole('option')).toHaveText(['Any project', 'Breadline'])
    }
    await page.getByRole('option', { name: choice, exact: true }).click()
    await expect(row).toBeVisible()
  }
  await expect(region.locator('[aria-label^="Created by"]').first()).toHaveAttribute(
    'aria-label',
    'Created by Local agent admin',
  )
  await page.getByRole('button', { name: 'Sort', exact: true }).click()
  await page.getByRole('combobox', { name: 'Field', exact: true }).click()
  await page.getByRole('option', { name: 'Title', exact: true }).click()
  await page.getByRole('button', { name: 'desc', exact: true }).click()
  await expect
    .poll(async () => {
      const titles = await region
        .locator('[data-entity-id] p:first-child')
        .allTextContents()
      return (
        titles.length > 0 &&
        titles.every((title, index) => index === 0 || titles[index - 1] <= title)
      )
    })
    .toBe(true)
  await page.screenshot({
    path: path.join(artifacts, 'research-index-rows-desktop.png'),
  })
  await page.setViewportSize({ width: 1200, height: 900 })
  await expect(page.getByText('Window Too Small', { exact: true })).toHaveCount(0)
  await expect(row.locator('time')).toBeVisible()
  expect(
    await row.evaluate(element => element.scrollWidth <= element.clientWidth),
  ).toBe(true)
  await page.screenshot({
    path: path.join(artifacts, 'research-index-rows-narrow.png'),
  })
  await page.setViewportSize({ width: 1600, height: 1100 })
  await page.getByRole('button', { name: 'Reset filters', exact: true }).click()
  await expect(
    page.getByRole('combobox', { name: 'Any layer', exact: true }),
  ).toContainText('Any layer')
  await row.focus()
  await row.press('Enter')
  await expect(page.getByRole('button', { name: 'Cancel', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(region).toBeVisible()
  const bulk = page.getByRole('button', { name: /^Bulk edit(?: \(\d+\))?$/ })
  const bar = bulk.locator(
    'xpath=ancestor::div[contains(@class,"bg-base-200") and contains(@class,"h-16")][1]',
  )
  await expect(bar).toHaveCSS('height', '64px')
  const initialBar = await bar.boundingBox()
  await bulk.click()
  await expect(page.getByRole('button', { name: 'Apply', exact: true })).toBeVisible()
  await expect(bar).toHaveCSS('height', '64px')
  await row.click()
  await expect(
    page.getByRole('button', { name: 'Bulk edit (1)', exact: true }),
  ).toBeVisible()
  await page.screenshot({
    path: path.join(artifacts, 'research-bulk-edit-desktop.png'),
  })
  await page.setViewportSize({ width: 1200, height: 900 })
  await expect(bar).toHaveCSS('height', '64px')
  expect((await bar.boundingBox())?.y).toBe(initialBar?.y)
  await page.screenshot({ path: path.join(artifacts, 'research-bulk-edit-narrow.png') })
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  const toggle = page.getByRole('button', { name: 'Filters', exact: true })
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await expect(bulk).toHaveCount(0)
  await expect(row).toBeVisible()
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  await expect(bulk).toBeVisible()
  await page.screenshot({
    path: path.join(artifacts, 'research-header-filter-toggle.png'),
  })
})

test('bulk archive hides sessions by default and supports restoration', async ({
  page,
}) => {
  test.setTimeout(120000)
  await page.goto('/admin/fieldresearch')
  const auth = await (await page.request.get('/api/auth/get-session')).json()
  expect(auth.user.id).toBe('hype-local-agent-admin')
  const rows = page.locator('[data-entity-id^="hype-test-research-archive-"]')
  await page
    .getByRole('textbox', { name: 'Filter', exact: true })
    .fill('[Test] Archive research')
  await expect(rows).toHaveCount(2)
  await page.getByRole('button', { name: 'Bulk edit', exact: true }).click()
  await page.getByRole('button', { name: 'Select all matches', exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'Bulk edit (2)', exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Apply', exact: true }).click()
  await expect(page.getByText('2 sessions archived.', { exact: true })).toBeVisible()
  await expect(rows).toHaveCount(0)
  await page.reload()
  await expect(page.getByRole('button', { name: 'Status', exact: true })).toBeVisible({
    timeout: 60000,
  })
  await expect(rows).toHaveCount(0)
  await page
    .getByRole('textbox', { name: 'Filter', exact: true })
    .fill('[Test] Archive research')
  await page.getByRole('button', { name: 'Status', exact: true }).click()
  await page.getByRole('combobox', { name: 'Archive status', exact: true }).click()
  await page.getByRole('option', { name: 'Archived', exact: true }).click()
  await expect(rows).toHaveCount(2)
  await expect(rows.first().getByText('Archived', { exact: true })).toBeVisible()
  await page.screenshot({
    path: path.join(
      process.env.DEV_RUNNER_ARTIFACTS!,
      'research-archived-sessions.png',
    ),
  })
  await page.getByRole('button', { name: 'Bulk edit', exact: true }).click()
  await page.getByRole('button', { name: 'Select all matches', exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'Bulk edit (2)', exact: true }),
  ).toBeVisible()
  await page.getByRole('combobox', { name: 'Action', exact: true }).click()
  await page.getByRole('option', { name: 'Restore', exact: true }).click()
  await page.getByRole('button', { name: 'Apply', exact: true }).click()
  await expect(page.getByText('2 sessions restored.', { exact: true })).toBeVisible()
  await expect(rows).toHaveCount(0)
  await page.getByRole('combobox', { name: 'Archive status', exact: true }).click()
  await page.getByRole('option', { name: 'Not archived', exact: true }).click()
  await expect(rows).toHaveCount(2)
})
