// NODE
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { join } from 'node:path'
// PLAYWRIGHT
import { expect, test, type Page } from '@playwright/test'

/** Serve a known part hierarchy and capture receipts in the isolated browser test.
 * @param page Managed Chrome page. @returns Once all Recorder remote handlers are registered.
 */
async function useLocationFixture(page: Page): Promise<void> {
  // Match the wire serializer from the installed SvelteKit package in isolated Bun workspaces.
  const fromKit = createRequire(
    createRequire(import.meta.url).resolve('@sveltejs/kit/package.json'),
  )
  const { parse, stringify } = await import(fromKit.resolve('devalue'))
  const records: { id: string; title: string; featureId: string }[] = []
  const sessions = [
    'North tower survey',
    'West tower survey',
    ...Array.from({ length: 12 }, (_, i) => 'Survey ' + (i + 3)),
  ].map((name, i) => ({
    id: String(i),
    name,
    updatedAt: '2026-01-01',
    completed: false,
    captureIssue: null,
    layers: [{ id: 'layer', name: 'Survey' }],
    defaultLayerId: 'layer',
  }))
  const polygon = {
    type: 'Polygon',
    coordinates: [
      [
        [0, 0],
        [100, 0],
        [100, 100],
        [0, 100],
        [0, 0],
      ],
    ],
  }
  const layer = (...properties: Record<string, unknown>[]) => ({
    type: 'FeatureCollection',
    features: properties.map(properties => ({
      type: 'Feature',
      geometry: polygon,
      properties,
    })),
  })
  const bundle = JSON.stringify({
    schemaVersion: 1,
    documents: [],
    data: {
      retrievedAt: '2026-01-01',
      coordinateSpace: 'image-pixels',
      connections: [],
      venue_polygon: layer({}),
      level_polygon: layer({
        level_id: 'g',
        level_ordinal: 0,
        level_name_en: 'Ground',
      }),
      unit_polygon: layer({
        level_id: 'g',
        unit_id: 'lift-unit',
        unit_category: 'elevator',
      }),
      opening_line: layer(),
      amenity_point: layer(),
      occupant_point: layer(),
    },
  })
  const hash = createHash('sha256').update(bundle).digest('hex')
  const map = { id: 'north-tower', name: 'North Tower', hash, unitId: null }
  await page.route('**/api/premises-maps/north-tower/releases/' + hash, route =>
    route.fulfill({ body: bundle, contentType: 'application/json' }),
  )
  const locations = [
    {
      id: 'lift',
      name: 'Lift 2',
      kind: 'building_part',
      premises: null,
      building: {
        id: 'north',
        name: 'North Tower',
        maps: [map],
        point: [114.17, 22.3],
      },
      maps: [{ ...map, unitId: 'lift-unit' }],
      point: [114.17, 22.3],
      iconPath: 'M4 8h16v14H4zM12 8v14',
    },
  ]
  await page.route('**/_app/remote/**', async route => {
    const request = route.request()
    const url = new URL(request.url())
    const method = url.pathname.split('/').at(-1)
    if (method === 'recorderLocations')
      await new Promise(resolve => setTimeout(resolve, 500))
    const data: Record<string, unknown> = {
      recorderAccount: { id: 'device-user', name: 'Researcher' },
      recorderSessions: sessions,
      recorderLocations: locations,
      recorderRecords: records,
    }
    if (method === 'recordFeature') {
      const payload = parse(
        Buffer.from(request.postDataJSON().payload, 'base64url').toString(),
      )
      expect(payload.sessionId).toBe(sessions[0].id)
      expect(payload.layerId).toBe('layer')
      expect(payload.placement).toMatchObject({
        spatialRealm: 'interior',
        locationId: 'lift',
        pin: {
          realm: 'interior',
          mapId: map.id,
          hash,
          floorId: 'g',
          point: [expect.any(Number), expect.any(Number)],
        },
      })
      records.push({
        ...payload.placement,
        id: payload.id,
        featureId: 'feature-' + payload.id,
        title: 'Survey ' + (records.length + 1),
      })
      data.recordFeature = payload.id
    }
    if (!method || !Object.hasOwn(data, method))
      throw new Error('Unexpected Recorder remote call')
    await route.fulfill({
      json: { type: 'result', data: stringify({ _: data[method] }) },
    })
  })
}

test('opens a shared session, swipes, selects a building part and persists a record', async ({
  page,
  context,
}) => {
  const fixture = process.env.RECORDER_TEST_FIXTURE === '1'
  const session = fixture
    ? 'North tower survey'
    : (process.env.RECORDER_TEST_SESSION ?? '')
  const part = fixture ? 'Lift 2' : (process.env.RECORDER_TEST_PART ?? '')
  const parent = fixture ? 'Building' : (process.env.RECORDER_TEST_PARENT ?? 'Premises')
  test.skip(
    !fixture && (!session.startsWith('[Test]') || !part),
    'Requires a named local test session or the isolated location fixture.',
  )
  test.setTimeout(120_000)
  await page.setViewportSize({ width: 390, height: 844 })
  if (fixture) {
    await useLocationFixture(page)
  } else {
    // Establish and verify the real local admin account before opening the static device bundle.
    await page.request.get('/robots.txt', { headers: { accept: 'text/html' } })
    const admin = await page.request.get('/admin', { headers: { accept: 'text/html' } })
    expect(admin.ok()).toBe(true)
    expect(new URL(admin.url()).pathname).toMatch(/^\/admin(?:\/|$)/)
    expect(
      (await (await page.request.get('/api/auth/get-session')).json()).user.id,
    ).toBe('hype-local-agent-admin')
  }

  // Chrome shares the backend origin here; use its authenticated fetch in place of Tauri IPC.
  await page.addInitScript(() => {
    Object.defineProperty(window, 'isTauri', { value: true })
    const fetch = window.fetch.bind(window)
    Object.defineProperty(window, 'fetch', { get: () => fetch, set: () => {} })
  })
  const build = join(process.cwd(), 'apps/recorder/build')
  await page.route('**/_app/immutable/**', route =>
    route.fulfill({ path: join(build, new URL(route.request().url()).pathname) }),
  )
  await page.route(
    url => url.pathname === '/',
    route =>
      route.fulfill({ path: join(build, 'index.html'), contentType: 'text/html' }),
  )
  await page.goto('/')
  const testSession = page.getByRole('button', { name: session, exact: false })
  await expect(page.getByRole('button', { name: 'Sign out' })).toHaveCount(0)
  const menu = page.getByRole('navigation', { name: 'Main menu' })
  await expect(menu).toBeVisible()
  await page.evaluate(() => window.scrollTo(0, 400))
  await expect(menu).toHaveClass(/translate-y-full/)
  await page.evaluate(() => window.scrollTo(0, 150))
  await expect(menu).toHaveClass(/translate-y-0/)
  await page.evaluate(() => window.scrollTo(0, 0))
  await testSession.click()
  const skeleton = page.getByRole('status', { name: 'Loading session', exact: true })
  await expect(skeleton).toBeVisible()
  const realm = page.getByRole('group', { name: 'Spatial realm' })
  const beforeLoad = await realm.boundingBox()
  await expect(skeleton).toHaveCount(0)
  const afterLoad = await realm.boundingBox()
  expect(Math.abs(beforeLoad!.y - afterLoad!.y)).toBeLessThan(2)
  const picker = page.getByRole('combobox', { name: 'Session', exact: true })
  const id = await picker.inputValue()
  const bounds = await picker.boundingBox()
  if (!bounds) throw new Error('Session selector has no touch target')
  const index = await picker.evaluate(el => (el as HTMLSelectElement).selectedIndex)
  const count = await picker.locator('option').count()
  expect(count).toBeGreaterThan(1)
  const cdp = await context.newCDPSession(page)
  const x = bounds.x + bounds.width / 2
  const y = bounds.y + bounds.height / 2
  const dy = index === count - 1 ? 31 : -31
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x, y }],
  })
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ x, y: y + dy }],
  })
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await expect(picker).not.toHaveValue(id)
  await picker.selectOption(id)

  await page.getByRole('button', { name: 'Search session locations' }).click()
  await page.goBack()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.goBack()
  await expect(testSession).toBeVisible()
  await testSession.click()
  await expect(
    page.getByRole('button', { name: '‹ Sessions', exact: true }),
  ).toHaveCount(0)
  await page.getByRole('button', { name: 'Search session locations' }).click()
  await page.getByRole('searchbox').fill(part)
  await page.getByRole('dialog').getByRole('button', { name: part }).first().click()
  await expect(
    page.getByRole('combobox', {
      name: parent,
      exact: true,
    }),
  ).toHaveValue(/.+/)
  await expect(page.getByRole('combobox', { name: 'Building part' })).toHaveValue(/.+/)
  if (fixture) {
    await page.getByRole('button', { name: /^exterior$/i }).click()
    await page.getByRole('button', { name: 'Open location map' }).click()
    await expect(page.getByRole('button', { name: /^exterior$/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await page.getByRole('button', { name: /^interior$/i }).click()
    await page.getByRole('button', { name: 'Floor plan' }).click()
    await expect(page.getByText('Pin placed.')).toBeVisible()
    await page.getByRole('button', { name: 'Use location' }).click()
    await expect(page.getByRole('button', { name: /^interior$/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await expect(page.getByText('Map pin selected.')).toBeVisible()
  }
  const artifacts = process.env.DEV_RUNNER_ARTIFACTS
  if (artifacts)
    await page.screenshot({ path: join(artifacts, 'recorder-location.png') })

  await page.getByRole('button', { name: 'See Records' }).click()
  await expect(page.getByRole('list')).toBeVisible()
  const before = await page.getByRole('list').locator('li small').count()
  await page.getByRole('button', { name: '‹ Session', exact: true }).click()
  await page.getByRole('button', { name: 'Record', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Records', exact: true }),
  ).toBeVisible()
  await expect(page.getByText('Record saved.')).toBeVisible()
  await expect(page.getByRole('list').locator('li small')).toHaveCount(before + 1)
  if (fixture) {
    await page.getByRole('button', { name: 'View on map' }).click()
    await expect(page.getByRole('img', { name: 'Floor plan' })).toBeVisible()
    await page.goBack()
    await expect(page.getByRole('heading', { name: 'Records' })).toBeVisible()
  }
  await page.reload()
  await testSession.click()
  await page.getByRole('button', { name: 'See Records' }).click()
  await expect(page.getByRole('list').locator('li small')).toHaveCount(before + 1)
})
