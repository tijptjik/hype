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
  const editor = {
    id: '',
    title: 'Survey 1',
    revisionId: 'revision-1',
    version: 1,
    modifiedAt: '2026-11-24',
    editable: true,
    status: {
      featureType: 'object',
      isVisitable: true,
      isIntangible: false,
      isDraft: true,
      isPendingReview: true,
    },
    types: [
      { id: 'object', label: 'Object', kind: 'object' },
      { id: 'place', label: 'Place', kind: 'place' },
    ],
    fields: [
      {
        id: 'vitality',
        key: 'vitality',
        type: 'classifier',
        component: 'SelectField',
        dataType: 'text',
        cardinality: 'one',
        values: [
          { id: 'good', value: 'Good' },
          { id: 'poor', value: 'Poor' },
        ],
      },
      {
        id: 'notes',
        key: 'notes',
        type: 'specifier',
        component: 'TextareaField',
        dataType: 'text',
      },
      {
        id: 'count',
        key: 'count',
        type: 'specifier',
        component: 'InputField',
        dataType: 'number',
      },
      {
        id: 'hours',
        key: 'hours',
        type: 'specifier',
        component: 'TimeRangeField',
        dataType: 'timeRange',
        timeMaxHour: 36,
      },
      {
        id: 'phone',
        key: 'phone',
        type: 'specifier',
        component: 'PhoneField',
        dataType: 'text',
      },
      {
        id: 'links',
        key: 'links',
        type: 'specifier',
        component: 'LinkField',
        dataType: 'link',
      },
    ],
    values: {
      vitality: 'good',
      notes: null,
      count: null,
      hours: null,
      phone: null,
      links: null,
    },
  }
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
      recorderAccount: {
        id: 'device-user',
        name: 'Researcher',
        email: 'researcher@example.test',
        image: '/icon.png',
      },
      recorderSessions: sessions,
      recorderLocations: locations,
      recorderRecords: records,
      recorderEditor: editor,
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
      editor.id = payload.id
      data.recordFeature = payload.id
    }
    if (method === 'saveRecorder') {
      const payload = parse(
        Buffer.from(request.postDataJSON().payload, 'base64url').toString(),
      )
      expect(payload.id).toBe(editor.id)
      Object.assign(editor, payload, { version: editor.version + 1 })
      data.saveRecorder = editor
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
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      value: {
        invoke: async (
          command: string,
          _args: unknown,
          options?: { headers?: Record<string, string> },
        ) => {
          if (command === 'plugin:http|fetch') {
            const config = JSON.parse(
              decodeURIComponent(options?.headers?.['client-config'] || '{}'),
            )
            if (!config.url?.endsWith('/api/auth/sign-out'))
              throw new Error('Unexpected native request')
            return 1
          }
          if (command === 'plugin:http|fetch_send')
            return {
              status: 200,
              statusText: 'OK',
              url: 'https://hype.hk/api/auth/sign-out',
              headers: [],
              rid: 2,
            }
          if (command === 'plugin:http|fetch_read_body') return [1]
          if (command === 'plugin:http|fetch_cancel_body') return
          throw new Error('Unexpected native command')
        },
      },
    })
    const fetch = window.fetch.bind(window)
    Object.defineProperty(window, 'fetch', { get: () => fetch, set: () => {} })
  })
  const build = join(process.cwd(), 'apps/recorder/build')
  await page.route('**/preferences.js', route =>
    route.fulfill({
      path: join(build, 'preferences.js'),
      contentType: 'text/javascript',
    }),
  )
  await page.route('**/icon.png', route =>
    route.fulfill({ path: join(build, 'icon.png') }),
  )
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
  await page.getByRole('button', { name: 'User', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Account' })).toBeVisible()
  await expect(page.getByText('researcher@example.test')).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Sign out', exact: true }),
  ).toBeEnabled()
  const themeArtifacts = process.env.DEV_RUNNER_ARTIFACTS
  await expect(
    page.getByRole('combobox', { name: 'Language', exact: true }),
  ).toHaveValue('en')
  await expect(
    page.getByRole('combobox', { name: 'Language', exact: true }).locator('option'),
  ).toHaveCount(1)
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'hype-dark')
  if (themeArtifacts)
    await page.screenshot({ path: join(themeArtifacts, 'account-nebula.png') })
  await page.getByRole('button', { name: 'Light · Milque', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'breadline-light')
  await expect(page.locator('html')).toHaveCSS('background-color', 'rgb(248, 244, 237)')
  await expect(page.getByRole('dialog', { name: 'Account' })).toHaveCSS(
    'background-color',
    'rgb(255, 253, 250)',
  )
  if (themeArtifacts)
    await page.screenshot({ path: join(themeArtifacts, 'account-milque.png') })
  await page.getByRole('button', { name: 'Close account' }).click()
  await page.reload()
  await expect(testSession).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'breadline-light')
  if (themeArtifacts)
    await page.screenshot({ path: join(themeArtifacts, 'sessions-milque.png') })
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
    if (themeArtifacts)
      await page.screenshot({ path: join(themeArtifacts, 'indoor-milque.png') })
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
  await expect(page.getByRole('button', { name: /^Status/ })).toHaveAttribute(
    'aria-expanded',
    'false',
  )
  await expect(page.getByRole('button', { name: /^Fields/ })).toHaveAttribute(
    'aria-expanded',
    'true',
  )
  if (fixture) {
    await page.getByLabel('vitality', { exact: true }).selectOption('poor')
    await page.getByLabel('notes', { exact: true }).fill('Observed during survey')
    await expect(page.getByRole('button', { name: 'Save changes' })).toBeEnabled()
    await page.goBack()
    await page.getByRole('button', { name: 'See Records' }).click()
    await page.getByRole('button', { name: 'Survey 1', exact: true }).click()
    await expect(page.getByLabel('notes', { exact: true })).toHaveValue(
      'Observed during survey',
    )
    await page.getByLabel('count', { exact: true }).fill('0')
    await page.getByLabel('From', { exact: true }).fill('24:00')
    await page.getByLabel('To', { exact: true }).fill('25:00')
    await page.getByRole('button', { name: 'Add number' }).click()
    await page.getByLabel('phone 1', { exact: true }).fill('+85212345678')
    await page.getByRole('button', { name: 'Add link', exact: true }).click()
    await page.getByLabel('Label', { exact: true }).fill('Reference')
    await page.getByLabel('URL', { exact: true }).fill('https://example.com')
    await page.getByRole('button', { name: /^Status/ }).click()
    await page.getByRole('button', { name: 'Place', exact: true }).click()
    await page
      .getByRole('group', { name: 'Draft', exact: true })
      .getByRole('button', { name: 'No', exact: true })
      .click()
    await page.getByRole('button', { name: 'Save changes' }).click()
    await expect(page.getByText('Changes saved.')).toBeVisible()
    if (artifacts)
      await page.screenshot({
        path: join(artifacts, 'recorder-editor.png'),
        fullPage: true,
      })
  }
  await page.goBack()
  if (!fixture) await page.getByRole('button', { name: 'See Records' }).click()
  await expect(page.getByRole('list').locator('li small')).toHaveCount(before + 1)
  if (fixture) {
    await page.getByRole('button', { name: 'Survey 1', exact: true }).click()
    await expect(page.getByLabel('vitality', { exact: true })).toHaveValue('poor')
    await expect(page.getByLabel('notes', { exact: true })).toHaveValue(
      'Observed during survey',
    )
    await expect(page.getByLabel('From', { exact: true })).toHaveValue('24:00')
    await expect(page.getByLabel('To', { exact: true })).toHaveValue('25:00')
    await page.goBack()
    await page.getByRole('button', { name: 'View on map' }).click()
    await expect(page.getByRole('img', { name: 'Floor plan' })).toBeVisible()
    await page.goBack()
    await expect(page.getByRole('heading', { name: 'Records' })).toBeVisible()
  }
  await page.reload()
  await testSession.click()
  await page.getByRole('button', { name: 'See Records' }).click()
  await expect(page.getByRole('list').locator('li small')).toHaveCount(before + 1)
  if (fixture) {
    await page.getByRole('button', { name: 'User', exact: true }).click()
    await expect(
      page.getByRole('dialog', { name: 'Account' }).locator('img'),
    ).toHaveJSProperty('complete', true)
    await page.getByRole('button', { name: 'Dark · Nebula', exact: true }).click()
    await expect(page.locator('html')).toHaveCSS('background-color', 'rgb(8, 9, 14)')
    await page.getByRole('button', { name: 'Sign out', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Sign in with HYPE' })).toBeVisible()
  }
})
