import { test, expect } from '@playwright/test'
import { join } from 'node:path'
import { publishedMap } from '../station/map-data.mjs'

const levelId = 'd6e6d0d5-0ade-4999-9cb8-6f9166f92fcd'

test('published Kowloon Tong labels identify the Exit B staircase', async ({
  page,
}) => {
  test.setTimeout(120000)
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/admin/premises-maps?map=kowloon-tong-mtr')
  expect((await (await page.request.get('/api/auth/get-session')).json()).user.id).toBe(
    'hype-local-agent-admin',
  )
  await expect(page.getByRole('combobox', { name: 'Map', exact: true })).toHaveValue(
    'kowloon-tong-mtr',
    { timeout: 60000 },
  )
  // One-time local publication is explicit; ordinary regression runs only read the release.
  if (process.env.PUBLISH_LOCAL_EXIT_B === '1') {
    expect(['localhost', '127.0.0.1']).toContain(new URL(page.url()).hostname)
    const before = await publishedMap(page, 'kowloon-tong-mtr')
    const name = before.data.level_polygon.features.find(
      f => f.properties.level_id === levelId,
    ).properties.level_name_en
    if (name === 'Platform Level') {
      await expect(
        page.getByText('Published version 2 · Draft revision 5', { exact: true }),
      ).toBeVisible()
      await expect(
        page.getByText('Platform Level → Exit B Staircase', { exact: true }),
      ).toBeVisible()
      await page
        .getByRole('button', { name: 'Publish saved draft', exact: true })
        .click()
      await expect(page.getByText('Map published.', { exact: true })).toBeVisible({
        timeout: 60000,
      })
    }
  }
  const release = await publishedMap(page, 'kowloon-tong-mtr')
  expect(
    release.data.level_polygon.features.find(f => f.properties.level_id === levelId)
      .properties.level_name_en,
  ).toBe('Exit B Staircase')
  await page.goto('/premises/kowloon-tong-mtr')
  const levels = page.getByRole('navigation', { name: 'Indoor levels' })
  await expect(levels).toBeVisible({ timeout: 60000 })
  if (!(await levels.locator('details').evaluate(node => node.open)))
    await levels.locator('summary').click()
  await expect(levels.getByRole('button', { name: /Staircase.*Exit B/ })).toBeVisible()
  await expect(
    levels.getByRole('button', { name: 'Platform', exact: true }),
  ).toHaveCount(0)
  await expect(
    page
      .locator('[data-floor-labels]')
      .getByRole('button', { name: 'Open Exit B Staircase', exact: true }),
  ).toBeVisible()
  await expect(
    page
      .locator('[data-floor-labels]')
      .getByRole('button', { name: 'Open Platform Level', exact: true }),
  ).toHaveCount(0)
  await page.screenshot({
    path: join(process.env.DEV_RUNNER_ARTIFACTS, 'exit-b-published-label.png'),
  })
  await page.reload()
  await expect(
    page
      .locator('[data-floor-labels]')
      .getByRole('button', { name: 'Open Exit B Staircase', exact: true }),
  ).toBeVisible({ timeout: 60000 })
})
