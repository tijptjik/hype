import { test, expect } from '@playwright/test'
import { join } from 'node:path'

test('connection entrances are editable and existing curations persist in the corrections list', async ({
  page,
}) => {
  test.setTimeout(150000)
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/admin/premises-maps?map=kowloon-tong-mtr')
  expect((await (await page.request.get('/api/auth/get-session')).json()).user.id).toBe(
    'hype-local-agent-admin',
  )
  await expect(page.getByRole('combobox', { name: 'Map', exact: true })).toHaveValue(
    'kowloon-tong-mtr',
    { timeout: 60000 },
  )
  const floor = page.getByRole('combobox', { name: 'Floor', exact: true })
  await expect(floor).toBeVisible()
  const floors = await floor
    .locator('option')
    .evaluateAll(options => options.map(o => o.value))
  let found = false
  for (const id of floors) {
    await floor.selectOption(id)
    const linked = page.locator('[data-facility][data-state="Linked"]')
    if (await linked.count()) {
      await linked.first().click()
      found = true
      break
    }
  }
  expect(found).toBe(true)
  const entrance = page
    .getByRole('combobox', { name: 'Entrance side on this level', exact: true })
    .first()
  await expect(entrance).toBeVisible()
  await entrance.selectOption({ index: 1 })
  await expect(entrance).not.toHaveValue('')
  await page
    .getByRole('button', { name: 'Show other endpoint', exact: true })
    .first()
    .click()
  await expect(
    page
      .getByRole('combobox', { name: 'Entrance side on this level', exact: true })
      .first(),
  ).toBeVisible()
  // Exercise side selection without asserting an unverified physical entrance as fact.
  await page.getByRole('button', { name: 'Discard unsaved edits', exact: true }).click()
  await expect(page.getByRole('combobox', { name: 'Map', exact: true })).toBeEnabled()
  const reason =
    'Preserve existing map connections as persistent curations; entrance sides remain unverified.'
  await page
    .getByRole('textbox', { name: 'Connection curation reason', exact: true })
    .fill(reason)
  await page
    .getByRole('button', { name: 'Save connection curations', exact: true })
    .click()
  await expect(
    page.getByText('Draft saved. The published map is unchanged.', { exact: true }),
  ).toBeVisible({ timeout: 60000 })
  await expect(
    page.getByRole('heading', { name: 'Saved map corrections', exact: true }),
  ).toBeVisible()
  await expect(page.getByText(reason, { exact: true }).first()).toBeVisible()
  await page.reload()
  await expect(page.getByText(reason, { exact: true }).first()).toBeVisible({
    timeout: 60000,
  })
  await expect(
    page.getByText('Platform Level → Exit B Staircase', { exact: true }),
  ).toBeVisible()
  await page.screenshot({
    path: join(process.env.DEV_RUNNER_ARTIFACTS, 'connection-curations.png'),
  })
})
