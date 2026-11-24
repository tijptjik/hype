import { join } from 'node:path'
import { expect, test } from '@playwright/test'

test('keeps Divisions in the third column while editing a Location', async ({
  page,
}) => {
  test.setTimeout(120000)
  const id = 'building:64b6bf79777a8eca00646a058d7286120ce2714e1e21805306468a59f97a1409'
  await page.setViewportSize({ width: 1920, height: 900 })
  await page.goto(`/admin/locations/${id}`, { waitUntil: 'domcontentloaded' })
  expect((await (await page.request.get('/api/auth/get-session')).json()).user.id).toBe(
    'hype-local-agent-admin',
  )
  await expect(page).toHaveURL(/\/admin\/locations\/building:/)
  await page
    .getByRole('banner')
    .getByRole('button', { name: 'Edit', exact: true })
    .click()
  const editor = page.locator('[data-address-editor-layout]')
  const parts = editor.locator('[data-address-parts-panel]')
  const details = editor.locator('[data-address-details]')
  const divisions = editor.locator('[data-address-divisions-panel]')
  const displayGroup = details.getByRole('group', {
    name: 'Display address',
    exact: true,
  })
  const unlock = displayGroup.getByRole('button', {
    name: 'Write a custom display address',
  })
  await expect(displayGroup).toBeVisible()
  if (await unlock.isVisible()) await unlock.click()
  const displayField = displayGroup.getByRole('textbox', {
    name: 'Display address',
    exact: true,
  })
  await displayField.fill(
    'KAI KING MANSION, 57-59 LUNG KONG ROAD, KOWLOON CITY DISTRICT, KLN',
  )
  const show = divisions.getByRole('button', { name: 'Show divisions' })
  const hide = divisions.getByRole('button', { name: 'Hide divisions' })

  for (const width of [1920, 1600, 1200]) {
    await page.setViewportSize({ width, height: 900 })
    await expect(async () => {
      const [left, center, right] = await Promise.all(
        [parts, details, divisions].map(panel => panel.boundingBox()),
      )
      expect(left.y).toBeCloseTo(center.y, 0)
      expect(right.y).toBeCloseTo(center.y, 0)
      expect(left.x + left.width).toBeLessThanOrEqual(center.x)
      expect(center.x + center.width).toBeLessThanOrEqual(right.x)
      const display = await displayField.boundingBox()
      expect(display.x + display.width).toBeLessThanOrEqual(center.x + center.width + 1)
    }).toPass({ timeout: 8000 })
    if (width === 1920) {
      await expect(
        parts.getByRole('button', { name: 'Hide address parts' }),
      ).toBeVisible()
      await expect(hide).toBeVisible()
      await hide.click()
      await show.click()
      await expect(hide).toBeVisible()
    }
    if (width === 1600) {
      await expect(
        parts.getByRole('button', { name: 'Show address parts' }),
      ).toBeVisible()
      await expect(hide).toBeVisible()
    }
    if (width === 1200) {
      await expect(
        parts.getByRole('button', { name: 'Show address parts' }),
      ).toBeVisible()
      await show.click()
      await expect(hide).toBeVisible()
      await hide.click()
      await expect(show).toBeVisible()
    }
    if (process.env.DEV_RUNNER_ARTIFACTS) {
      await details
        .locator('h2')
        .first()
        .evaluate(heading => heading.scrollIntoView({ block: 'start' }))
      await page.screenshot({
        path: join(process.env.DEV_RUNNER_ARTIFACTS, `location-columns-${width}.png`),
      })
    }
  }
})
