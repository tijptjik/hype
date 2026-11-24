import { join } from 'node:path'
import { expect, test } from '@playwright/test'

const organisation = 'oDucgyH4H4Bm'
const kaiKing =
  'building:cbab3d4d32f73b706b05fb7836f120f3d695277bdd5ecba28894dc7c0aedce26'

test.beforeEach(async ({ page }) => {
  test.setTimeout(150_000)
  const admin = await page.goto('/admin', { waitUntil: 'domcontentloaded' })
  expect(admin.ok()).toBeTruthy()
  await expect(page).toHaveURL(/\/admin(?:\/features)?\/?$/)
  const session = await (await page.request.get('/api/auth/get-session')).json()
  expect(session.user.id).toBe('hype-local-agent-admin')
})

async function openSearch(page, id) {
  await page.goto(
    `/admin/locations/${encodeURIComponent(id)}?organisation=${organisation}#exterior`,
    {
      waitUntil: 'domcontentloaded',
    },
  )
  await page
    .getByRole('button', { name: /Associate 3D Models|Manage model associations/ })
    .click({ timeout: 60_000 })
  const input = page.getByRole('textbox', { name: 'Search building footprints' })
  await expect(input).toBeEnabled({ timeout: 60_000 })
  return input
}

test('shows the address before the editable building name and uses dark result colors', async ({
  page,
}) => {
  const input = await openSearch(page, kaiKing)
  await expect(input).toHaveValue('Kai King Mansion')
  const toolbar = input.locator('xpath=ancestor::header')
  const address = toolbar.getByText(/57[-–]59 Lung Kong Road/i)
  await expect(address).toBeVisible()
  const labelBox = await address.boundingBox()
  const searchBox = await input.boundingBox()
  expect(labelBox.x + labelBox.width).toBeLessThanOrEqual(searchBox.x)
  await input.fill('kai king man')
  const result = toolbar.getByRole('button', {
    name: /Kai King Mansion.*3764621208T20050430/i,
  })
  await expect(result).toBeVisible()
  for (const [theme, panel, foreground] of [
    ['hype-black', 'rgb(0, 0, 0)', 'rgb(247, 231, 239)'],
    ['hype-dark', 'rgb(16, 18, 27)', 'rgb(244, 240, 250)'],
  ]) {
    await page.evaluate(
      value => document.documentElement.setAttribute('data-theme', value),
      theme,
    )
    await expect(result.locator('..')).toHaveCSS('background-color', panel)
    await expect(result.getByText('Kai King Mansion', { exact: true })).toHaveCSS(
      'color',
      foreground,
    )
    await expect(result.getByText('3764621208T20050430')).toHaveCSS(
      'color',
      'rgb(182, 182, 200)',
    )
  }
  await page.screenshot({
    path: join(process.env.DEV_RUNNER_ARTIFACTS, 'kai-king-footprint-search.png'),
  })
  await result.click()
  await expect(result).toBeHidden()
  await expect(
    page.getByRole('region', { name: 'Associate model slice' }),
  ).toContainText(/Kai King Mansion/i)
})

test('starts an unnamed building search with its displayed address', async ({
  page,
}) => {
  const input = await openSearch(page, 'OFo5NXj2fNub')
  const address = input.locator('xpath=ancestor::header').getByText(/Kai Tak Road/i)
  await expect(address).toBeVisible()
  await expect(input).toHaveValue(await address.textContent())
  await input.fill('')
  await expect(input).toBeEmpty()
})
