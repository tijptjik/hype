import { join } from 'node:path'
import { expect, test } from '@playwright/test'

test('reviews the displayed Tat Tak address and accepts its street and number', async ({
  page,
}) => {
  test.setTimeout(120000)
  const id = 'building:64b6bf79777a8eca00646a058d7286120ce2714e1e21805306468a59f97a1409'
  const label = 'TAT TAK BUILDING, 32 TAK KU LING ROAD, KOWLOON CITY DISTRICT, KLN'
  await page.goto(`/admin/locations/${id}`, { waitUntil: 'domcontentloaded' })
  expect((await (await page.request.get('/api/auth/get-session')).json()).user.id).toBe(
    'hype-local-agent-admin',
  )
  await expect(page).toHaveURL(/\/admin\/locations\/building:/)
  await page
    .getByRole('banner')
    .getByRole('button', { name: 'Edit', exact: true })
    .click({ timeout: 45000 })
  // Exercise the reported source independently of later edits to this local record.
  const clearStreet = page.getByRole('button', {
    name: 'Clear: Street name',
    exact: true,
  })
  if (await clearStreet.isVisible()) await clearStreet.click()
  const display = page.locator('textarea[aria-label="Display address"]').last()
  if ((await display.getAttribute('readonly')) !== null)
    await page
      .getByRole('button', { name: 'Write a custom display address', exact: true })
      .last()
      .click()
  await display.fill(label)
  const details = page
    .locator('details')
    .filter({ has: page.locator('summary', { hasText: /^Parse address$/ }) })
  await details.locator('summary').click()
  await details.getByRole('button', { name: 'Parse address', exact: true }).click()
  const review = details.getByRole('region', { name: 'Parse address' })
  await expect(review).toContainText(label, { timeout: 30000 })
  await expect(review).toContainText('Tat Tak Building, 32 Tak Ku Ling Road')
  if (process.env.DEV_RUNNER_ARTIFACTS)
    await review.screenshot({
      path: join(process.env.DEV_RUNNER_ARTIFACTS, 'tat-tak-address-review.png'),
    })
  await review.getByRole('button', { name: 'Use proposed components' }).click()
  await expect(
    page.getByRole('textbox', { name: 'Street number', exact: true }),
  ).toHaveValue('32')
  await expect(
    page.getByRole('button', { name: 'Replace: Tak Ku Ling Road', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Replace: Tat Tak Building', exact: true }),
  ).toBeVisible()
  await expect(display).toHaveValue(label)
  await page
    .getByRole('banner')
    .getByRole('button', { name: 'Reset', exact: true })
    .click()
})
