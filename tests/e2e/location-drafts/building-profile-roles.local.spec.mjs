import { expect, test } from '@playwright/test'
import { join } from 'node:path'

test('identifies physical and constituent buildings next to the profile name', async ({
  page,
}) => {
  test.setTimeout(150000)
  expect(
    (await page.goto('/admin', { waitUntil: 'domcontentloaded' })).ok(),
  ).toBeTruthy()
  expect((await (await page.request.get('/api/auth/get-session')).json()).user.id).toBe(
    'hype-local-agent-admin',
  )
  await expect(page).toHaveURL(/\/admin(?:\/features)?\/?$/)
  const header = page.locator('[data-location-record]:visible').first()
  for (const [id, name, label] of [
    ['Wnw2IkAkr9_t', 'Tat Tak Building', 'Physical building'],
    [
      'building:64b6bf79777a8eca00646a058d7286120ce2714e1e21805306468a59f97a1409',
      'Tat Tak Building',
      'Constituent building',
    ],
    [
      'building:d7fac24a3c3e31a7d80db0ec11f92178f98563e687245ed15dea3de1d6bbdec2',
      'Wing Lee Building',
      'Building',
    ],
  ]) {
    await page.goto('/admin/locations/' + id + '?organisation=oDucgyH4H4Bm', {
      waitUntil: 'domcontentloaded',
    })
    await expect(header).toContainText(name, { timeout: 45000 })
    await expect(header).toHaveAttribute('data-tooltip', label)
    if (label === 'Building')
      await expect(header.locator('[data-building-role]')).toHaveCount(0)
    else {
      await expect(header.getByText(label, { exact: true })).toBeVisible()
      await page
        .getByRole('banner')
        .getByRole('button', { name: 'Edit', exact: true })
        .click()
      await expect(header.getByText(label, { exact: true })).toBeVisible()
      if (process.env.DEV_RUNNER_ARTIFACTS)
        await header.screenshot({
          path: join(process.env.DEV_RUNNER_ARTIFACTS, label + '.png'),
        })
    }
  }
})
