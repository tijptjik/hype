import { join } from 'node:path'
import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  test.setTimeout(600_000)
  const admin = await page.goto('/admin', { waitUntil: 'commit' })
  expect(admin.ok()).toBeTruthy()
  await expect(page).toHaveURL(/^https?:\/\/[^/]+\/admin(?:\/features)?\/?$/)
  expect((await (await page.request.get('/api/auth/get-session')).json()).user.id).toBe(
    'hype-local-agent-admin',
  )
})

async function searchConstituents(page, query) {
  await page.getByRole('button', { name: 'Add constituent building' }).click()
  // A remote Chrome runner reaches the dev host's public export Worker through a loopback forward.
  const exportPort = process.env.DEV_RUNNER_SAANSEOI_EXPORT_PORT
  if (exportPort) {
    await page.route('http://api.atlas.localhost/**/exports/**', async route => {
      const url = new URL(route.request().url())
      url.hostname = '127.0.0.1'
      url.port = exportPort
      await route.fulfill({ response: await route.fetch({ url: url.href }) })
    })
  }
  await page.getByLabel('Search SaanSeoi buildings by name or address').fill(query)
  await page.getByRole('button', { name: 'Search buildings' }).click()
}

test('shows Kai King Mansion’s reviewed outlines and constituent profile', async ({
  page,
}) => {
  const path = '/admin/locations/M-PbJh8oq9Sk?organisation=oDucgyH4H4Bm'
  await page.goto(path + '&edit=true#relationships', { waitUntil: 'domcontentloaded' })
  const roles = page.getByRole('combobox', { name: 'Outline role' })
  await expect(roles).toHaveCount(2, { timeout: 480_000 })
  expect(
    (await roles.evaluateAll(nodes => nodes.map(node => node.value))).sort(),
  ).toEqual(['podium', 'tower'])
  await searchConstituents(page, '59 Lung Kong Road')
  for (const role of ['podium', 'tower'])
    await expect(
      page.getByText('Constituent added · ' + role, { exact: true }),
    ).toBeVisible({
      timeout: 180_000,
    })
  const picker = page.getByRole('region', { name: 'Constituent building search' })
  if (process.env.DEV_RUNNER_ARTIFACTS)
    await picker.screenshot({
      path: join(process.env.DEV_RUNNER_ARTIFACTS, 'kai-king-constituents.png'),
    })
  await page.goto(path, { waitUntil: 'domcontentloaded' })
  await expect(page.getByText('Kai King Mansion', { exact: true }).first()).toBeVisible(
    { timeout: 120_000 },
  )
  await expect(page.getByText('佳景樓', { exact: true }).first()).toBeVisible()
  await expect(
    page.getByRole('tabpanel', { name: 'Location views', exact: true }),
  ).toMatchAriaSnapshot('- text: /57[–-]59 Lung Kong Road/')
})
