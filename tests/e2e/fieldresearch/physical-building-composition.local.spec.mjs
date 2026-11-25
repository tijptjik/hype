import { createRequire } from 'node:module'
import { expect, test } from '@playwright/test'

const kit = createRequire(import.meta.resolve('@sveltejs/kit'))
const { parse, stringify } = await import(kit.resolve('devalue'))
const session =
  '/admin/field-recorder?session=5e856112-1f64-457a-8c64-3170e874688b#locations'
const parentId = 'test-physical-parent'
const address = {
  status: 'unresolved',
  address2dId: null,
  address3dId: null,
  address3dUnitId: null,
  snapshotId: null,
  rawSource: {},
  fallbackDisplay: { en: 'Corner Street' },
}
const coordinates = [114.19, 22.32]

function reply(route, value) {
  return route.fulfill({ json: { type: 'result', data: stringify({ _: value }) } })
}
function input(route) {
  return parse(
    Buffer.from(route.request().postDataJSON().payload, 'base64url').toString(),
  )
}

test.beforeEach(async ({ page }) => {
  test.setTimeout(180_000)
  const admin = await page.goto('/admin', { waitUntil: 'domcontentloaded' })
  expect(admin.ok()).toBeTruthy()
  await expect(page).toHaveURL(/\/admin(?:\/features)?\/?$/)
  expect((await (await page.request.get('/api/auth/get-session')).json()).user.id).toBe(
    'hype-local-agent-admin',
  )
})

test('creates from a constituent, reopens the physical parent and adds a sibling', async ({
  page,
}) => {
  // Keep the writable session isolated. The service tests exercise these commands against migrated SQLite.
  const members = []
  let included = false
  let inclusionWrites = 0
  const parent = {
    id: parentId,
    kind: 'building',
    names: { en: 'Corner Building' },
    coordinates,
    address: 'Corner Street',
    members,
    canEditPhysicalBuilding: true,
    streetAddresses: [],
    districts: [],
    linkedAddresses: [],
    inclusion: { total: 0, included: 0 },
    interiorMaps: [],
    footprint: null,
  }
  await page.route('**/_app/remote/*/getResearchLocations*', route =>
    reply(route, included ? [parent] : []),
  )
  await page.route('**/_app/remote/*/findPhysicalBuildingParents*', route =>
    reply(route, {
      rows: [{ id: parentId, names: parent.names, address }],
      nextCursor: null,
    }),
  )
  await page.route('**/_app/remote/*/searchTargetLocations*', route =>
    reply(route, {
      data: ['East', 'West'].map(side => ({
        id: side,
        kind: 'building',
        state: 'unresolved',
        revisionId: `${side}-revision`,
        catalogueBuildingId: `${side}-source`,
        facts: {
          names: { en: `${side} Building` },
          location: { address, geometry: { coordinates } },
        },
      })),
      nextCursor: null,
    }),
  )
  await page.route('**/_app/remote/*/attachPhysicalBuildingMember', route => {
    const { source, target } = input(route)
    const side = members.length ? 'West' : 'East'
    expect(source).toEqual({ importedLocationId: side })
    expect(target).toEqual(
      members.length
        ? { parentId }
        : { requestId: expect.stringMatching(/^[0-9a-f-]{36}$/i) },
    )
    members.push({
      source: { id: `${side}-source`, release: 'test' },
      locationId: side,
      coordinates,
      addresses: [],
    })
    return reply(route, { locationId: parentId })
  })
  await page.route('**/_app/remote/*/addResearchLocation', route => {
    expect(input(route)).toMatchObject({ locationId: parentId, mode: 'single' })
    inclusionWrites++
    included = true
    return reply(route, { count: 1 })
  })
  await page.goto(session, { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: 'Edit Locations', exact: true }).click()
  const button = name => page.getByRole('button', { name, exact: true })
  await button('Start from a constituent').click({ timeout: 90_000 })
  const search = page
    .getByRole('region', { name: 'Vetted Locations' })
    .getByPlaceholder(/Search for a/i)
  await search.fill('Building')
  const candidate = side => page.locator(`[data-search-result="location:${side}"]`)
  await candidate('East')
    .getByRole('button', { name: 'Create Physical Building' })
    .click()
  const editing = page.getByRole('region', { name: 'Editing physical building' })
  await expect(editing).toContainText('Corner Building')
  await button('Done adding buildings').click()
  await button('Find a physical building').click()
  await button('Select physical building').click()
  await expect(editing).toContainText('Corner Building')
  await search.fill('Building')
  await expect(
    candidate('East').getByRole('button', { name: 'Already added' }),
  ).toBeDisabled()
  await candidate('West')
    .getByRole('button', { name: 'Add to Physical Building' })
    .click()
  const children = page
    .getByRole('list', { name: 'Constituent buildings' })
    .getByRole('link')
  await expect(children).toHaveCount(2)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: 'Edit Locations', exact: true }).click()
  await expect(children).toHaveCount(2, { timeout: 60_000 })
  expect(inclusionWrites).toBe(1)
})

test('opens the saved parent from the session and continues the constituent editor on that parent', async ({
  page,
}) => {
  // Keep the live lookup read-only even if another editor changes the session between clicks.
  const unexpectedWrites = []
  await page.route('**/_app/remote/**', route => {
    if (route.request().method() === 'GET') return route.continue()
    unexpectedWrites.push(new URL(route.request().url()).pathname)
    return route.abort()
  })
  await page.goto(session, { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: 'Edit Locations', exact: true }).click()
  const included = page.getByRole('complementary', { name: 'Included Locations' })
  // The session is edited during field work. Resolve both identities from one current, editable parent.
  const card = included
    .locator('li')
    .filter({ has: page.getByRole('button', { name: 'Add constituent building' }) })
    .filter({ has: page.getByRole('list', { name: 'Constituent buildings' }) })
    .first()
  const parentHref = await card
    .getByRole('link')
    .first()
    .getAttribute('href', { timeout: 60_000 })
  const parentUrl = new URL(parentHref, page.url())
  const parentId = decodeURIComponent(parentUrl.pathname.split('/').pop())
  const organisation = parentUrl.searchParams.get('organisation')
  const href = await card
    .getByRole('list', { name: 'Constituent buildings' })
    .getByRole('link')
    .first()
    .getAttribute('href')
  await page.getByRole('button', { name: 'Find a physical building' }).click()
  const parents = page.getByRole('region', { name: 'Existing physical buildings' })
  await parents.getByRole('textbox').fill(parentId)
  const saved = parents.locator(`a[href="${parentHref}"]`)
  await saved
    .locator('../..')
    .getByRole('button', { name: 'Select physical building' })
    .click()
  await expect(
    page.getByRole('region', { name: 'Editing physical building' }),
  ).toBeVisible()

  await page.goto(href + '&edit=true#relationships', { waitUntil: 'domcontentloaded' })
  // Return the already saved parent when testing navigation. Keep this real session's composition intact.
  await page.route('**/_app/remote/*/attachPhysicalBuildingMember', route => {
    expect(input(route)).toMatchObject({
      organisationId: organisation,
      source: {
        importedLocationId: decodeURIComponent(
          new URL(href, page.url()).pathname.split('/').pop(),
        ),
      },
      target: { requestId: expect.any(String) },
    })
    return reply(route, { locationId: parentId })
  })
  await page.getByRole('button', { name: 'Create Physical Building' }).click()
  await expect(page).toHaveURL(new RegExp(parentId + '.*#relationships$'))
  await expect(
    page.getByRole('region', { name: 'Constituent building search' }),
  ).toBeVisible({ timeout: 60_000 })
  expect(unexpectedWrites).toEqual([])
})
