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
  const group = page.locator('[data-address-group="formattedAddress"]')
  const unlock = group.getByRole('button', {
    name: 'Write a custom display address',
    exact: true,
  })
  if (await unlock.isVisible()) await unlock.click()
  const display = group.getByRole('textbox', { name: 'Display address', exact: true })
  await display.fill(label)
  const parse = group.getByRole('button', { name: 'Parse address', exact: true })
  for (const width of [1200, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    await expect(parse).toBeVisible()
    if (process.env.DEV_RUNNER_ARTIFACTS)
      await group.screenshot({
        path: join(process.env.DEV_RUNNER_ARTIFACTS, `address-parse-${width}.png`),
      })
    await expect(async () => {
      const field = await display.boundingBox()
      const button = await parse.boundingBox()
      const bounds = await group.boundingBox()
      expect(button.x).toBeGreaterThanOrEqual(field.x + field.width)
      expect(button.y + button.height / 2).toBeGreaterThanOrEqual(field.y)
      expect(button.y + button.height / 2).toBeLessThanOrEqual(field.y + field.height)
      expect(button.x + button.width).toBeLessThanOrEqual(bounds.x + bounds.width + 1)
    }).toPass({ timeout: 8000 })
  }
  await parse.click()
  const review = group.getByRole('region', { name: 'Parse address' })
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

test('reviews and accepts the street and multilingual range for Kai King Mansion', async ({
  page,
}) => {
  test.setTimeout(120000)
  const id = 'building:cbab3d4d32f73b706b05fb7836f120f3d695277bdd5ecba28894dc7c0aedce26'
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto(`/admin/locations/${id}`, { waitUntil: 'domcontentloaded' })
  expect((await (await page.request.get('/api/auth/get-session')).json()).user.id).toBe(
    'hype-local-agent-admin',
  )
  await expect(page).toHaveURL(/\/admin\/locations\/building:/)
  await page
    .getByRole('banner')
    .getByRole('button', { name: 'Edit', exact: true })
    .click()
  await page.getByRole('button', { name: 'Parse address', exact: true }).click()
  const review = page.getByRole('region', { name: 'Parse address' })
  for (const name of ['Lung Kong Road', '龍崗道', '龙岗道'])
    await expect(review.getByRole('definition').filter({ hasText: name })).toBeVisible({
      timeout: 30000,
    })
  await expect(
    review.getByRole('definition').filter({ hasText: /^57-59$/ }),
  ).toHaveCount(3)
  await expect(review).toContainText('龍崗道57-59號佳景樓')
  await expect(review).toContainText('龙岗道57-59号佳景楼')
  if (process.env.DEV_RUNNER_ARTIFACTS)
    await review.screenshot({
      path: join(process.env.DEV_RUNNER_ARTIFACTS, 'kai-king-address-review.png'),
    })
  await review.getByRole('button', { name: 'Use proposed components' }).click()
  await expect(
    page.getByRole('textbox', { name: 'Street number', exact: true }),
  ).toHaveValue('57-59')
  await expect(
    page.getByRole('button', { name: 'Replace: Lung Kong Road', exact: true }),
  ).toBeVisible()
  await page
    .getByRole('banner')
    .getByRole('button', { name: 'Reset', exact: true })
    .click()
})
