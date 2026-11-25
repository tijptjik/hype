import { expect, test } from '@playwright/test'
import { join } from 'node:path'
import { createRequire } from 'node:module'

// Use the serializer bundled with SvelteKit's remote functions.
const kit = createRequire(import.meta.resolve('@sveltejs/kit'))
const { parse, stringify } = await import(kit.resolve('devalue'))

// Retained member evidence from the reported session. Its inclusion list is editable.
const release = 'overture-2026-09-23.1-alpha-987bfb4ed339c25c'
const address = '25–31A Kai Tak Road'
const second = {
  source: {
    id: '5709ba12-4829-44a6-a169-8ed4b9412389',
    release,
    addressId: 'ss-c27a9f6f-e749-5bf2-b9e9-f7ad7fc036cc',
  },
  coordinates: [114.19196058131945, 22.3292018],
  addresses: [
    ['29', 'ss-02e0f9c3-a24d-5c71-a07f-882d8a73becd'],
    ['31', 'ss-838a6b87-3064-5439-ac60-88a4ba05f4ea'],
    ['25', 'ss-c27a9f6f-e749-5bf2-b9e9-f7ad7fc036cc'],
    ['31A', 'ss-d126e14e-0406-5666-b8ee-d49edf2a938a'],
    ['27', 'ss-dd1d050a-4f77-5160-98af-17e66b79c72a'],
  ].map(([number, id]) => ({
    id,
    display: { en: number + ' KAI TAK ROAD, KOWLOON CITY DISTRICT, KLN' },
  })),
}
const first = {
  source: { id: '6d529702-9482-4b4e-a223-7e8af56dfefb', release },
  coordinates: [114.19195753881579, 22.329107],
  addresses: [],
}

test('opens each retained Kai Tak Road address on its own catalogue record', async ({
  page,
}) => {
  test.setTimeout(240_000)
  const admin = await page.goto('/admin', { waitUntil: 'domcontentloaded' })
  expect(admin.ok()).toBeTruthy()
  expect((await (await page.request.get('/api/auth/get-session')).json()).user.id).toBe(
    'hype-local-agent-admin',
  )
  await expect(page).toHaveURL(/\/admin(?:\/features)?\/?$/)
  // Replay only the inclusion row if it has since been removed. Detail navigation uses live catalogue reads.
  await page.route('**/_app/remote/*/getResearchLocations*', async route => {
    const response = await route.fetch()
    expect(response.ok()).toBeTruthy()
    const envelope = await response.json()
    const data = parse(envelope.data)
    if (!data._.some(row => row.id === 'OFo5NXj2fNub')) {
      data._.push({
        id: 'OFo5NXj2fNub',
        kind: 'building',
        names: {},
        confirmedUnnamed: false,
        address,
        canEditPhysicalBuilding: true,
        members: [first, second],
        linkedAddresses: [],
        streetAddresses: [{ street: 'Kai Tak Road', number: '25–31A', label: address }],
        coordinates: first.coordinates,
        footprint: null,
      })
    }
    await route.fulfill({ response, json: { ...envelope, data: stringify(data) } })
  })
  await page.goto(
    '/admin/field-recorder?session=5e856112-1f64-457a-8c64-3170e874688b#locations',
  )
  await page.getByRole('button', { name: 'Edit Locations', exact: true }).click()
  const members = page
    .getByRole('complementary', { name: 'Included Locations' })
    .locator('details')
    .filter({ hasText: '5709ba12-4829-44a6-a169-8ed4b9412389' })
  await members.locator('summary').click({ timeout: 60_000 })
  await expect(members.locator('summary')).toHaveText('2 SaanSeoi buildings')
  await expect(members).toContainText('No published address')
  const addresses = members.getByRole('link', { name: /Kai Tak Road/i })
  await expect(addresses).toHaveCount(5)
  const urls = await addresses.evaluateAll(links => links.map(link => link.href))
  expect(new Set(urls.map(url => new URL(url).searchParams.get('address'))).size).toBe(
    5,
  )
  const saved = members.getByRole('link', { name: /^25 Kai Tak Road/i })
  await expect(saved.locator('..')).toContainText('(selected)')
  await members.screenshot({
    path: join(process.env.DEV_RUNNER_ARTIFACTS, 'kai-tak-members.png'),
  })
  await saved.click()
  const choices = page.getByRole('navigation', { name: 'Choose an address' })
  await expect(choices.locator('a[aria-current="page"]')).toHaveText(
    /^25 Kai Tak Road/i,
    { timeout: 90_000 },
  )
  await expect(page.locator('[data-address-parts]')).toContainText(/\b25\b/)
  for (const number of ['27', '29', '31', '31A']) {
    await choices
      .getByRole('link', { name: new RegExp('^' + number + ' Kai Tak Road', 'i') })
      .click()
    await expect(choices.locator('a[aria-current="page"]')).toHaveText(
      new RegExp('^' + number + ' Kai Tak Road', 'i'),
    )
    await expect(page.locator('[data-address-parts]')).toContainText(
      new RegExp('\\b' + number + '\\b'),
    )
  }
  await page.screenshot({
    path: join(process.env.DEV_RUNNER_ARTIFACTS, 'kai-tak-catalogue.png'),
  })
  const overview = new URL(page.url())
  overview.searchParams.delete('address')
  await page.goto(overview.href)
  await expect(choices.getByRole('link')).toHaveCount(5, { timeout: 60_000 })
  await expect(choices.locator('a[aria-current="page"]')).toHaveCount(0)
})
