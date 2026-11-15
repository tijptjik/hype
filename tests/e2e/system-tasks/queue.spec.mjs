import { test, expect } from '@playwright/test'
import { join } from 'node:path'

test('super-admin system queue filters, counts and review', async ({ page }) => {
  test.setTimeout(120000)
  page.setDefaultTimeout(15000)
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/admin/tasks')
  expect((await (await page.request.get('/api/auth/get-session')).json()).user.id).toBe(
    'hype-local-agent-admin',
  )
  await expect(page).toHaveURL(/\/admin\/tasks/)
  await expect(
    page.getByRole('heading', { name: 'System tasks', exact: true }),
  ).toBeVisible({ timeout: 60000 })
  await expect(
    page.getByRole('heading', { name: 'TEST · Map correction review', exact: true }),
  ).toBeVisible()
  const resource = page.getByRole('combobox', { name: 'All resources', exact: true })
  if (!(await resource.isVisible()))
    await page.getByRole('button', { name: 'Filters', exact: true }).click()
  await page.getByRole('combobox').filter({ hasText: 'All resources' }).click()
  await page.getByRole('option', { name: 'System tasks', exact: true }).click()
  await expect(page.getByText('Action', { exact: true })).toBeHidden()
  await expect(page.getByText('Type', { exact: true })).toBeHidden()
  await expect(page.locator('output[aria-label="Results: 1"]')).toBeVisible()
  await page.setViewportSize({ width: 1200, height: 1000 })
  await page.screenshot({
    path: join(process.env.DEV_RUNNER_ARTIFACTS, 'system-task-queue.png'),
  })
  await page
    .getByRole('button', { name: 'Mark reviewed · Accept', exact: true })
    .click()
  await expect(
    page.getByRole('heading', { name: 'TEST · Map correction review', exact: true }),
  ).toHaveCount(0)
  await expect(page.locator('output[aria-label="Results: 0"]')).toBeVisible()
})

test('map editor offers source-backed level corrections', async ({ page }) => {
  test.setTimeout(120000)
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/admin/premises-maps?map=kowloon-tong-mtr')
  expect((await (await page.request.get('/api/auth/get-session')).json()).user.id).toBe(
    'hype-local-agent-admin',
  )
  await expect(page).toHaveURL(/\/admin\/premises-maps/)
  await expect(page.getByRole('combobox', { name: 'Map', exact: true })).toHaveValue(
    'kowloon-tong-mtr',
    { timeout: 60000 },
  )
  await expect(page.getByRole('combobox', { name: 'Map', exact: true })).toBeEnabled()
  await expect(
    page.getByRole('heading', { name: 'Correct a level label', exact: true }),
  ).toBeVisible()
  await page
    .getByRole('combobox', { name: 'Level', exact: true })
    .selectOption('d6e6d0d5-0ade-4999-9cb8-6f9166f92fcd')
  await page
    .getByRole('textbox', { name: 'Corrected label', exact: true })
    .fill('Exit B Staircase')
  await page
    .getByRole('textbox', { name: 'Reason', exact: true })
    .fill('Exit B entry marker; stairs, corridor and steps, no platform.')
  await expect(
    page.getByRole('button', { name: 'Save label correction', exact: true }),
  ).toBeEnabled()
  await page.getByRole('button', { name: 'Save label correction', exact: true }).click()
  await expect(
    page.getByText('Correction saved in the draft. Publish to update the map.', {
      exact: true,
    }),
  ).toBeVisible()
  await expect(
    page.getByText('Platform Level → Exit B Staircase', { exact: true }),
  ).toBeVisible()
  await page.screenshot({
    path: join(process.env.DEV_RUNNER_ARTIFACTS, 'map-correction-draft.png'),
  })
})

test('system filters remain reachable beside sort at 1200px', async ({ page }) => {
  test.setTimeout(120000)
  await page.setViewportSize({ width: 1200, height: 1000 })
  await page.goto('/admin/tasks')
  expect((await (await page.request.get('/api/auth/get-session')).json()).user.id).toBe(
    'hype-local-agent-admin',
  )
  const resource = page.getByRole('combobox').filter({ hasText: 'All resources' })
  await expect(resource).toBeVisible({ timeout: 60000 })
  await resource.click()
  await page.getByRole('option', { name: 'System tasks', exact: true }).click()
  const active = page.locator('.bits-resource-filter-bar__filter-active')
  const sort = page.locator('.bits-resource-filter-bar__sort').last()
  for (const label of ['Resource', 'Result', 'Reviewed']) {
    await expect(active.getByText(label, { exact: true })).toBeVisible()
    await expect
      .poll(async () => {
        const left = await active.boundingBox()
        const right = await sort.boundingBox()
        return left.x + left.width <= right.x
      })
      .toBe(true)
    if (label !== 'Reviewed')
      await page.getByRole('button', { name: 'Next', exact: true }).click()
  }
  await expect(page.getByText('Action', { exact: true })).toBeHidden()
  await expect(page.getByText('Type', { exact: true })).toBeHidden()
  await page.screenshot({
    path: join(process.env.DEV_RUNNER_ARTIFACTS, 'system-task-filters-1200.png'),
  })
})
