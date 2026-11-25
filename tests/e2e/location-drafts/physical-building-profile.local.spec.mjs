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

test('reviews each Tat Tak address independently on its physical parent', async ({
  page,
}) => {
  await page.goto(
    '/admin/locations/Wnw2IkAkr9_t?organisation=oDucgyH4H4Bm&edit=true#relationships',
    { waitUntil: 'domcontentloaded' },
  )
  await searchConstituents(page, '34 Tak Ku Ling')
  const result = page.getByRole('region', { name: 'Constituent building search' })
  await expect(result.getByText('Constituent added', { exact: true })).toBeVisible({
    timeout: 180_000,
  })
  await result
    .getByRole('button', { name: 'Link addresses to physical building' })
    .click()
  const review = result.getByRole('region', { name: 'Link building addresses' })
  await expect(review.getByRole('checkbox')).toHaveCount(3)
  // Use the parent's saved relationships so the check still works after an editor links an address.
  const saved = await page
    .locator('[data-address-order] [data-address-id]')
    .allTextContents()
  let selected = 0
  for (const number of ['34', '34A', '32']) {
    const name = new RegExp(`\\b${number} TAK KU LING ROAD\\b`, 'i')
    const address = review.getByRole('checkbox', { name })
    if (saved.some(label => name.test(label))) {
      await expect(address).toBeChecked()
      await expect(address).toBeDisabled()
    } else {
      await expect(address).toBeEnabled()
      await expect(address).not.toBeChecked()
      if (selected < 2) {
        await address.check()
        selected++
      }
    }
  }
  await expect(
    review.getByRole('button', { name: `Link selected addresses (${selected})` }),
  ).toBeEnabled({ enabled: selected > 0 })
  if (process.env.DEV_RUNNER_ARTIFACTS)
    await result.screenshot({
      path: join(process.env.DEV_RUNNER_ARTIFACTS, 'tat-tak-address-choices.png'),
    })
  await review.getByRole('button', { name: 'Cancel' }).click()
  await expect(review).toHaveCount(0)
})
