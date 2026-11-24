import { join } from 'node:path'
import { expect, test } from '@playwright/test'

const parentId = 'M-PbJh8oq9Sk'
const organisation = 'oDucgyH4H4Bm'
const parent = `/admin/locations/${parentId}?organisation=${organisation}&edit=true#relationships`

test.beforeEach(async ({ page }) => {
  test.setTimeout(300_000)
  expect(
    (await page.goto('/admin', { waitUntil: 'domcontentloaded' })).ok(),
  ).toBeTruthy()
  expect((await (await page.request.get('/api/auth/get-session')).json()).user.id).toBe(
    'hype-local-agent-admin',
  )
  await expect(page).toHaveURL(/\/admin(?:\/features)?\/?$/)
  await page.goto(parent, { waitUntil: 'domcontentloaded' })
})

test('previews catalogue matches for both street numbers', async ({ page }) => {
  // Li forwards the HYPE server only. Read the same published catalogue directly from its public origin.
  await page.route(
    /^http:\/\/api\.atlas\.localhost\/(?:buildings|streets)\/v0\.1\/exports\//,
    route => {
      const { pathname, search } = new URL(route.request().url())
      return route.fulfill({
        status: 307,
        headers: {
          location: `https://api.saanseoi.hk${pathname}${search}`,
          'access-control-allow-origin': '*',
        },
      })
    },
  )
  await page.getByRole('button', { name: 'Preview matches' }).click()
  const preview = page.getByRole('region', { name: 'Building match preview' })
  for (const number of ['57', '59'])
    await expect(preview).toContainText(new RegExp(`${number} Lung Kong Road`, 'i'))
  await expect(preview.getByRole('link').first()).toBeVisible({ timeout: 240_000 })
  await expect(
    preview.getByRole('button', { name: 'Add to Physical Building' }),
  ).toHaveCount(0)
  if (process.env.DEV_RUNNER_ARTIFACTS)
    await preview.screenshot({
      path: join(process.env.DEV_RUNNER_ARTIFACTS, 'building-preview.png'),
    })
})

test('offers creation, designation and existing-parent placement on a constituent', async ({
  page,
}) => {
  const childRow = page.getByText('Contains', { exact: true }).first().locator('..')
  const child = await childRow.getByRole('link').first().getAttribute('href')
  await page.goto(`${child}&edit=true#relationships`, { waitUntil: 'domcontentloaded' })
  for (const name of [
    'Create Physical Building',
    'Use as physical building',
    'Preview matches',
  ])
    await expect(page.getByRole('button', { name })).toBeVisible({ timeout: 60_000 })
  await page.getByRole('button', { name: 'Place in physical building' }).click()
  const picker = page.getByRole('region', { name: 'Existing physical buildings' })
  await picker.getByRole('textbox').fill('Kai King')
  await expect(
    picker.getByRole('link', { name: /Kai King Mansion/i }).first(),
  ).toBeVisible({ timeout: 30_000 })
  await expect(picker.getByRole('button', { name: 'Place here' }).first()).toBeVisible()
})
