import { expect, test } from '@playwright/test'

test('sorts the draft address choices by street number after a manual reorder', async ({
  page,
}) => {
  test.setTimeout(120000)
  const locationId =
    'building:64b6bf79777a8eca00646a058d7286120ce2714e1e21805306468a59f97a1409'
  await page.goto(`/admin/locations/${locationId}#relationships`, {
    waitUntil: 'domcontentloaded',
  })
  expect((await (await page.request.get('/api/auth/get-session')).json()).user.id).toBe(
    'hype-local-agent-admin',
  )
  await expect(page).toHaveURL(/\/admin\/locations\/building:/)
  await page
    .getByRole('banner')
    .getByRole('button', { name: 'Edit', exact: true })
    .click()
  const rows = page.locator('[data-address-order] [data-address-id]')
  const sort = page.getByRole('button', { name: 'Sort by street number' })
  const expected = ['32', '34', '34A'].map(number => `, ${number} TAK KU LING ROAD`)
  await sort.click()
  await expect(rows).toContainText(expected)
  await rows.first().scrollIntoViewIfNeeded()
  const last = rows.last()
  const bounds = await last.boundingBox()
  await rows
    .first()
    .locator('.bits-card__drag-handle')
    .dragTo(last, {
      targetPosition: { x: bounds.width / 2, y: bounds.height - 3 },
    })
  await expect(rows.first()).toContainText(expected[1])
  await sort.click()
  await expect(rows).toContainText(expected)
})
