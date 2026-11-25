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
  const texture = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/aXkAAAAASUVORK5CYII=',
    'base64',
  )
  const exterior = '/api/location-exterior/north/11111111-1111-4111-8111-111111111111/'
  const model = {
    asset: { version: '2.0' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [
      { primitives: [{ attributes: { POSITION: 0, TEXCOORD_0: 1 }, material: 0 }] },
    ],
    buffers: [{ uri: 'mesh.bin', byteLength: 60 }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: 36 },
      { buffer: 0, byteOffset: 36, byteLength: 24 },
    ],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: 3,
        type: 'VEC3',
        min: [0, 0, 0],
        max: [1, 1, 0],
      },
      { bufferView: 1, componentType: 5126, count: 3, type: 'VEC2' },
    ],
    materials: [
      { doubleSided: true, pbrMetallicRoughness: { baseColorTexture: { index: 0 } } },
    ],
    textures: [{ source: 0 }],
    images: [{ uri: 'wall.png' }],
  }
  await page.route('**' + exterior + 'assembly.gltf', route =>
    route.fulfill({ json: model }),
  )
  await page.route('**' + exterior + 'mesh.bin', route =>
    route.fulfill({
      body: Buffer.from(
        new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1]).buffer,
      ),
    }),
  )
  await page.route('**' + exterior + 'wall.png', route =>
    route.fulfill({ body: texture, contentType: 'image/png' }),
  )
  const bundle = JSON.stringify({
    schemaVersion: 1,
    documents: [],
    data: {
      retrievedAt: '2026-01-01',
      coordinateSpace: 'image-pixels',
      connections: [],
      venue_polygon: layer({}),
      level_polygon: layer(
        {
          level_id: 'g',
          level_ordinal: 0,
          level_name_en: 'Ground',
          image_width: 100,
          image_height: 100,
          image_url: 'data:image/png;base64,' + texture.toString('base64'),
        },
        { level_id: 'upper', level_ordinal: 1, level_name_en: 'Upper' },
      ),
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
        exteriorUrl: exterior + 'assembly.gltf',
        id: 'north',
        name: 'North Tower',
        maps: [map],
        point: [114.17, 22.3],
      },
      maps: [{ ...map, unitId: 'lift-unit' }],
      point: [114.17, 22.3],
      iconPath: 'M4 8h16v14H4zM12 8v14',
    },
    {
      id: 'unmapped',
      name: 'Annex',
      kind: 'building',
      premises: null,
      building: null,
      exteriorUrl: null,
      maps: [],
      point: null,
      iconPath: null,
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
    const browserFetch = window.fetch.bind(window)
    const requests = new Map<number, Response>()
    let serial = 0
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      value: {
        invoke: async (
          command: string,
          args: Uint8Array | { rid: number },
          options?: { headers?: Record<string, string> },
        ) => {
          if (command === 'plugin:http|fetch') {
            const config = JSON.parse(
              decodeURIComponent(options?.headers?.['client-config'] ?? ''),
            )
            const url = new URL(config.url)
            if (
              !['https://hype.hk', 'https://fi.tailb49776.ts.net:9443'].includes(
                url.origin,
              )
            )
              throw new Error('Unexpected native origin')
            const id = ++serial
            if (url.pathname === '/api/auth/sign-out') {
              requests.set(id, new Response())
            } else {
              const response = await browserFetch(url.pathname + url.search, {
                method: config.method,
                headers: config.headers,
                body:
                  config.method === 'POST'
                    ? (args as Uint8Array<ArrayBuffer>)
                    : undefined,
              })
              requests.set(id, response)
            }
            return id
          }
          const { rid } = args as { rid: number }
          const response = requests.get(rid)
          if (command === 'plugin:http|fetch_send' && response)
            return {
              status: response.status,
              statusText: response.statusText,
              url: response.url,
              headers: [...response.headers],
              rid,
            }
          if (command === 'plugin:http|fetch_read_body' && response) {
            requests.delete(rid)
            const bytes = new Uint8Array(await response.arrayBuffer())
            const chunk = new Uint8Array(bytes.length + 1)
            chunk.set(bytes)
            return bytes.length ? chunk : [1]
          }
          if (command === 'plugin:http|fetch_read_body') return [1]
          if (command.startsWith('plugin:http|fetch_cancel')) {
            requests.delete(rid)
            return
          }
          throw new Error('Unexpected native command')
        },
      },
    })
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
    const location = page.getByRole('combobox', { name: 'Location', exact: true })
    const model = page.locator('model-viewer')
    await expect(model).toHaveJSProperty('loaded', true, { timeout: 30000 })
    if (themeArtifacts)
      await model.screenshot({
        path: join(themeArtifacts, 'recorder-building-model.png'),
      })
    await location.scrollIntoViewIfNeeded()
    const box = (await location.boundingBox())!
    const touch = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [touch],
    })
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ ...touch, y: touch.y - 32 }],
    })
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await expect(location).toHaveValue('north')
    await location.hover()
    await page.mouse.wheel(0, 80)
    await expect(location).toHaveValue('unmapped')
    await expect(model).toHaveCount(0)
    await expect(
      page.getByText('No exterior model is linked to this location.'),
    ).toBeVisible()
    await location.selectOption('lift')
    await page.getByRole('button', { name: /^interior$/i }).click()
    const plan = page.getByRole('button', { name: 'Floor plan' })
    const floor = page.getByRole('combobox', { name: 'Floor', exact: true })
    await expect(plan.locator('[data-level]')).toHaveCount(1)
    await expect(plan.locator('image')).toBeVisible()
    await floor.selectOption({ label: 'ALL' })
    const upper = plan.locator('[data-level="upper"] > path').first()
    await expect(page.getByRole('button', { name: 'Zoom in' })).toBeEnabled()
    await upper.click()
    await expect(floor).toHaveValue('upper')
    await expect(plan.locator('[data-level]')).toHaveCount(1)
    const planTouch = (
      type: 'touchStart' | 'touchMove' | 'touchEnd',
      touchPoints: { x: number; y: number; id: number }[],
    ) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints })
    const planBounds = (await plan.boundingBox())!
    const x = planBounds.x + planBounds.width / 2
    const y = planBounds.y + planBounds.height / 2
    async function pinchOut(): Promise<void> {
      await planTouch('touchStart', [
        { x: x - 48, y, id: 1 },
        { x: x + 48, y, id: 2 },
      ])
      await planTouch('touchMove', [
        { x: x - 21, y, id: 1 },
        { x: x + 21, y, id: 2 },
      ])
      await planTouch('touchMove', [
        { x: x - 14, y, id: 1 },
        { x: x + 14, y, id: 2 },
      ])
      await planTouch('touchEnd', [])
    }
    await pinchOut()
    await expect(floor).toHaveValue('upper')
    const sampled = await plan.evaluateHandle(element => {
      const upper = element.querySelector('[data-level="upper"]')!
      const frames: { transform: string; view: string }[] = []
      const observer = new MutationObserver(() => {
        const transform = upper.getAttribute('transform')
        const view = element.getAttribute('viewBox')
        if (transform && view) frames.push({ transform, view })
      })
      observer.observe(upper, { attributes: true, attributeFilter: ['transform'] })
      return { frames, stop: () => observer.disconnect() }
    })
    await pinchOut()
    await expect(floor).toHaveValue('__all_floors__')
    await expect(plan.locator('[data-level]')).toHaveCount(2)
    await expect(page.getByRole('button', { name: 'Zoom in' })).toBeEnabled()
    const frames = await sampled.evaluate(sample => {
      sample.stop()
      return sample.frames
    })
    if (
      !(await page.evaluate(
        () => matchMedia('(prefers-reduced-motion: reduce)').matches,
      ))
    ) {
      expect(new Set(frames.map(frame => frame.transform)).size).toBeGreaterThan(1)
      expect(new Set(frames.map(frame => frame.view)).size).toBeGreaterThan(1)
    }
    // Orbit the stack from the touch surface, then change layer spacing independently.
    const rotation = page.getByRole('slider', { name: 'Rotation' })
    const tilt = page.getByRole('slider', { name: 'Tilt' })
    const spacing = page.getByRole('slider', { name: 'Floor spacing' })
    const pose = () => upper.locator('..').getAttribute('transform')
    const initialPose = await pose()
    const stackBounds = (await plan.boundingBox())!
    const midX = stackBounds.x + stackBounds.width / 2
    const midY = stackBounds.y + stackBounds.height / 2
    await planTouch('touchStart', [{ x: midX, y: midY, id: 1 }])
    await planTouch('touchMove', [{ x: midX + 55, y: midY + 32, id: 1 }])
    await planTouch('touchEnd', [])
    await expect.poll(pose).not.toEqual(initialPose)
    await expect
      .poll(async () => Number(await rotation.inputValue()))
      .toBeGreaterThan(0)
    await expect.poll(async () => Number(await tilt.inputValue())).toBeLessThan(60)
    const orbited = await pose()
    await spacing.press('ArrowRight')
    await expect.poll(pose).not.toEqual(orbited)
    // Spread and translate the contacts together, preserving the exploded selection.
    const previousView = await plan.getAttribute('viewBox')
    await planTouch('touchStart', [
      { x: midX - 18, y: midY, id: 1 },
      { x: midX + 18, y: midY, id: 2 },
    ])
    await planTouch('touchMove', [
      { x: midX - 26, y: midY + 28, id: 1 },
      { x: midX + 70, y: midY + 12, id: 2 },
    ])
    await planTouch('touchEnd', [])
    await expect(plan).not.toHaveAttribute('viewBox', previousView!)
    await expect(floor).toHaveValue('__all_floors__')
    await page.getByRole('button', { name: 'Reset view' }).click()
    await expect.poll(pose).toEqual(initialPose)
    const stackArtifacts = process.env.DEV_RUNNER_ARTIFACTS
    if (stackArtifacts)
      await page.screenshot({ path: join(stackArtifacts, 'recorder-floor-stack.png') })
    await floor.selectOption('g')
    await expect(plan.locator('[data-level]')).toHaveCount(1)
    await plan.click()
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
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeEnabled()
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
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(
      page.getByRole('button', { name: 'Save', exact: true }).locator('svg'),
    ).toBeVisible()
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled()
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
