// NODE
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { join } from 'node:path'
// PLAYWRIGHT
import { expect, test, type Page } from '@playwright/test'

/** Serve a known part hierarchy and capture receipts in the isolated browser test.
 * @param page Managed Chrome page. @returns Once all Recorder remote handlers are registered.
 */
async function useLocationFixture(
  page: Page,
  withRecord: boolean | 'grouped' = false,
): Promise<void> {
  // Match the wire serializer from the installed SvelteKit package in isolated Bun workspaces.
  const fromKit = createRequire(
    createRequire(import.meta.url).resolve('@sveltejs/kit/package.json'),
  )
  const { parse, stringify } = await import(fromKit.resolve('devalue'))
  const records: {
    id: string
    title: string
    featureId: string
    locationId?: string
    pin?: object
    identifierTags?: string[]
  }[] = []
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
      geometry: properties.unit_id
        ? {
            type: 'Polygon',
            coordinates: [
              [
                [40, 40],
                [60, 40],
                [60, 60],
                [40, 60],
                [40, 40],
              ],
            ],
          }
        : polygon,
      properties,
    })),
  })
  const texture = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/aXkAAAAASUVORK5CYII=',
    'base64',
  )
  // The placement fixture uses a local tile to avoid depending on the external basemap service.
  await page.route('https://mapapi.geodata.gov.hk/**', route =>
    route.fulfill({ body: texture, contentType: 'image/png' }),
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
  await page.route('**' + exterior + 'placement.json*', route =>
    route.fulfill({
      json: {
        comparisonFile: null,
        alignments: {
          '11111111-1111-4111-8111-111111111111': {
            revision: 1,
            lines: [
              {
                id: 'ground',
                elevation: 0,
                locked: true,
                designation: { type: 'ground' },
              },
              { id: 'roof', elevation: 1, locked: true },
            ],
          },
        },
      },
    }),
  )
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
        unit_address_en: 'Lift 2, G/F, 12 Kai Tak Road',
        canonical_location_id: 'lift',
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
    description: '',
    photoRevisions: [] as string[],
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
        key: 'Condition',
        type: 'classifier',
        component: 'SelectField',
        dataType: 'text',
        cardinality: 'one',
        values: [
          { id: 'poor', value: 'Heavily Deteriorated', icon: 'condition-deteriorated' },
          { id: 'weathered', value: 'Weathered', icon: 'condition-weathered' },
          { id: 'good', value: 'Well Preserved', icon: 'condition-preserved' },
        ],
      },
      {
        id: 'materials',
        key: 'Materials',
        type: 'classifier',
        component: 'SelectField',
        dataType: 'text',
        cardinality: 'many',
        values: [
          { id: 'metal', value: 'Metal', icon: 'material-metal' },
          { id: 'glass', value: 'Acrylic', icon: 'material-acrylic' },
          { id: 'wood', value: 'Wood', icon: 'material-wood' },
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
      materials: ['metal'],
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
        kind: 'building',
        address: '12 Kai Tak Road',
        addressSortKey: 'Kai Tak Road 12',
        maps: [map],
        point: [114.17, 22.3],
      },
      maps: [{ ...map, unitId: 'lift-unit' }],
      point: [114.17, 22.3],
      iconPath: 'M4 8h16v14H4zM12 8v14',
    },
    {
      id: 'unmapped',
      name: 'Unnamed Building',
      address: '2 Kai Tak Road',
      addressSortKey: 'Kai Tak Road 2',
      kind: 'building',
      premises: null,
      building: null,
      exteriorUrl: null,
      maps: [],
      point: null,
      iconPath: null,
    },
    {
      id: 'east',
      name: 'Unnamed Building',
      kind: 'building',
      address: '1 Lung Kong Road',
      addressSortKey: 'Lung Kong Road 1',
      building: null,
      premises: null,
      maps: [],
      point: null,
    },
    {
      id: 'arcade',
      name: 'Arcade',
      kind: 'building',
      address: '',
      addressSortKey: '',
      building: null,
      premises: null,
      maps: [],
      point: null,
    },
  ]
  if (withRecord) {
    editor.id = 'survey-record'
    records.push({ id: editor.id, title: editor.title, featureId: 'survey-feature' })
  }
  if (withRecord === 'grouped') {
    const placements = [
      { locationId: 'unmapped' },
      {
        locationId: 'lift',
        pin: { realm: 'interior', mapId: map.id, hash, floorId: 'g' },
      },
      {
        locationId: 'north',
        pin: {
          realm: 'exterior',
          surface: 'facade',
          floorId: 'gf',
          floorLabel: 'Ground floor',
        },
      },
      {
        locationId: 'north',
        pin: { realm: 'interior', mapId: map.id, hash, floorId: 'upper' },
      },
    ]
    for (const [i, placement] of placements.entries()) {
      records.push({
        ...placement,
        id: 'r' + i,
        featureId: 'f' + i,
        title: 'Capture ' + (i + 2),
      })
    }
  }
  const uploads = new Map<string, string>()
  let interrupted = false
  await page.route('**/api/images/revisions/*', route => {
    const url = new URL(route.request().url())
    const firstRevision = editor.photoRevisions[0]
    if (url.searchParams.has('t') && url.pathname.endsWith('/' + firstRevision))
      return route.fulfill({ status: 503 })
    return route.fulfill({ body: texture, contentType: 'image/png' })
  })
  await page.route('**/api/recorder/records/*/photos/*', async route => {
    const request = route.request()
    const url = new URL(request.url())
    const name = url.searchParams.get('filename')!
    expect(url.pathname.split('/')[4]).toBe(editor.id)
    expect(request.method()).toBe('PUT')
    expect(request.postDataBuffer()).toEqual(texture)
    expect(['first.png', 'last.png']).toContain(name)
    if (uploads.has(name)) {
      expect(name).toBe('last.png')
      expect(uploads.get(name)).toBe(url.pathname)
    } else {
      uploads.set(name, url.pathname)
      editor.photoRevisions.push(url.pathname.split('/').at(-1)!)
      editor.version++
    }
    // Lose the last acknowledgement after acceptance, then recognize the retry.
    if (name === 'last.png' && !interrupted) {
      interrupted = true
      await route.fulfill({ status: 503 })
    } else {
      await route.fulfill({ json: editor })
    }
  })
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
      recorderRecords: records.map(row => ({
        ...row,
        thumbnailRevision:
          row.id === editor.id ? (editor.photoRevisions[0] ?? null) : null,
      })),
      recorderEditor: editor,
    }
    if (method === 'recordFeature') {
      const payload = parse(
        Buffer.from(request.postDataJSON().payload, 'base64url').toString(),
      )
      expect(payload.sessionId).toBe(sessions[0].id)
      expect(payload.layerId).toBe('layer')
      if (payload.placement.spatialRealm === 'exterior')
        expect(payload.placement.pin).toMatchObject({
          surface: 'facade',
          percent: [expect.any(Number), expect.any(Number)],
          floorId: 'ground',
          alignmentRevision: 1,
        })
      else
        expect(payload.placement).toMatchObject({
          spatialRealm: 'interior',
          locationId: 'lift',
          pin: {
            realm: 'interior',
            mapId: map.id,
            hash,
            floorId: 'g',
            unitId: 'lift-unit',
            unitLocationId: 'lift',
            unitAddress: 'Lift 2, G/F, 12 Kai Tak Road',
            percent: [expect.any(Number), expect.any(Number)],
            point: [expect.any(Number), expect.any(Number)],
          },
        })
      records.push({
        identifierTags: ['E', '#001'],
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

/** Opens the bundled Recorder in Chrome with native requests routed through the test origin.
 * @param page Managed Chrome page. @returns Once the Recorder entry page is open.
 */
async function openNativeRecorder(page: Page): Promise<void> {
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
          if (command === 'plugin:opener|open_url') {
            // The Android browser takes foreground ownership until the contributor returns.
            Object.defineProperty(document, 'hidden', {
              configurable: true,
              value: true,
            })
            return
          }
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
                body: ['POST', 'PUT'].includes(config.method)
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
}

test('resumes browser approval and retries account loading without pairing again', async ({
  page,
}) => {
  let grants = 0
  let exchanges = 0
  let interruptAccount = true
  await useLocationFixture(page)
  await page.route('**/api/auth/device/code', route => {
    grants++
    return route.fulfill({
      json: {
        device_code: 'test-grant',
        user_code: 'TESTCODE',
        interval: 5,
        expires_in: 600,
      },
    })
  })
  await page.route('**/api/auth/device/token', route => {
    exchanges++
    return route.fulfill({ json: { access_token: 'test-session' } })
  })
  await page.route('**/_app/remote/*/recorderAccount', route => {
    if (!exchanges)
      return route.fulfill({ json: { type: 'result', data: '[{"_":1},null]' } })
    if (interruptAccount) {
      interruptAccount = false
      return route.fulfill({ status: 503 })
    }
    return route.fallback()
  })

  await openNativeRecorder(page)
  await page.clock.install()
  await page.getByRole('button', { name: 'Sign in with HYPE' }).click()
  await expect(page.getByText('TESTCODE')).toBeVisible()
  await expect.poll(() => page.evaluate(() => document.hidden)).toBe(true)
  await page.clock.fastForward(6000)
  expect(exchanges).toBe(0)
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: false })
  })
  await page.clock.fastForward(6000)
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(page.getByRole('heading', { name: 'Sessions' })).toBeVisible()
  expect(grants).toBe(1)
  expect(exchanges).toBe(1)
})

test.describe('mobile building picker', () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } })

  test('sorts buildings by street and highlights the tapped address', async ({
    page,
  }) => {
    await useLocationFixture(page)
    await openNativeRecorder(page)
    await page.getByRole('button', { name: 'North tower survey' }).tap()
    await page.getByRole('button', { name: 'Location', exact: true }).tap()
    const building = page.getByRole('button', { name: 'Building', exact: true })
    await building.tap()
    const choices = page.getByRole('dialog', { name: 'Building' })
    const rows = choices.locator('button[aria-pressed]')
    await expect(rows).toHaveText([
      /Unnamed Building\s*2 Kai Tak Road/,
      /North Tower\s*12 Kai Tak Road/,
      /Unnamed Building\s*1 Lung Kong Road/,
      /Arcade/,
    ])
    await rows.first().tap()
    await expect(choices).toBeHidden()
    await expect(building).toContainText('2 Kai Tak Road')
    await building.tap()
    await expect(rows.first()).toHaveAttribute('aria-pressed', 'true')
    await expect(rows.last()).toHaveAttribute('aria-pressed', 'false')
    const themeArtifacts = process.env.DEV_RUNNER_ARTIFACTS
    if (themeArtifacts)
      await page.screenshot({ path: join(themeArtifacts, 'building-picker.png') })
    await page.keyboard.press('Escape')
    await expect(building).toBeFocused()
  })
  test('pinches and pans the plan and flicks between floors', async ({
    page,
    context,
  }) => {
    await useLocationFixture(page)
    await openNativeRecorder(page)
    await page.getByRole('button', { name: 'North tower survey' }).tap()
    await page.getByRole('button', { name: 'Location', exact: true }).tap()
    await page.getByRole('button', { name: 'Building', exact: true }).tap()
    await page
      .getByRole('dialog', { name: 'Building' })
      .getByRole('button', { name: /North Tower/ })
      .tap()
    await page.getByRole('button', { name: 'Interior', exact: true }).tap()
    const plan = page.getByRole('button', { name: 'Floor plan' })
    await expect(plan).toBeVisible()
    const cdp = await context.newCDPSession(page)
    const touch = (
      type: 'touchStart' | 'touchMove' | 'touchEnd',
      points: { x: number; y: number; id: number }[],
    ) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points })
    const bounds = await plan.boundingBox()
    const x = bounds!.x + bounds!.width / 2,
      y = bounds!.y + bounds!.height / 2
    const width = () =>
      plan.evaluate(el => (el as unknown as SVGSVGElement).viewBox.baseVal.width)
    const before = await width()
    await touch('touchStart', [
      { x: x - 20, y, id: 1 },
      { x: x + 20, y, id: 2 },
    ])
    await touch('touchMove', [
      { x: x - 48, y, id: 1 },
      { x: x + 48, y, id: 2 },
    ])
    await touch('touchEnd', [])
    await expect.poll(width).toBeLessThan(before)
    const zoomed = await plan.getAttribute('viewBox')
    await touch('touchStart', [{ x, y, id: 1 }])
    await touch('touchMove', [{ x: x + 30, y: y + 12, id: 1 }])
    await touch('touchEnd', [])
    await expect(plan).not.toHaveAttribute('viewBox', zoomed!)
    const floor = page.getByRole('button', { name: 'Floor', exact: true })
    const rect = await floor.boundingBox()
    const point = { x: rect!.x + rect!.width / 2, y: rect!.y + rect!.height / 2, id: 1 }
    await touch('touchStart', [point])
    await touch('touchMove', [{ ...point, y: point.y - 32 }])
    await touch('touchEnd', [])
    await expect(floor).toContainText('Upper')
    await expect(page.getByRole('dialog', { name: 'Floor' })).toBeHidden()
    // Activate the chooser independently of Chrome's synthesized tap immediately after a native flick.
    await floor.press('Enter')
    await expect(page.getByRole('dialog', { name: 'Floor' })).toBeVisible()
    await page
      .getByRole('dialog', { name: 'Floor' })
      .getByRole('button', { name: 'ALL', exact: true })
      .tap()
    const upper = plan.locator('[data-level="upper"] > path').first()
    await expect(page.getByRole('button', { name: 'Zoom in' })).toBeEnabled()
    await upper.tap()
    await expect(floor).toContainText('Upper')
    await expect(plan.locator('[data-level]')).toHaveCount(1)
    async function pinchOut(): Promise<void> {
      await touch('touchStart', [
        { x: x - 48, y, id: 1 },
        { x: x + 48, y, id: 2 },
      ])
      await touch('touchMove', [
        { x: x - 21, y, id: 1 },
        { x: x + 21, y, id: 2 },
      ])
      await touch('touchMove', [
        { x: x - 14, y, id: 1 },
        { x: x + 14, y, id: 2 },
      ])
      await touch('touchEnd', [])
    }
    await pinchOut()
    await expect(floor).toContainText('Upper')
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
    await expect(floor).toContainText('ALL')
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
    await touch('touchStart', [{ x: midX, y: midY, id: 1 }])
    await touch('touchMove', [{ x: midX + 55, y: midY + 32, id: 1 }])
    await touch('touchEnd', [])
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
    await touch('touchStart', [
      { x: midX - 18, y: midY, id: 1 },
      { x: midX + 18, y: midY, id: 2 },
    ])
    await touch('touchMove', [
      { x: midX - 26, y: midY + 28, id: 1 },
      { x: midX + 70, y: midY + 12, id: 2 },
    ])
    await touch('touchEnd', [])
    await expect(plan).not.toHaveAttribute('viewBox', previousView!)
    await expect(floor).toContainText('ALL')
    await page.getByRole('button', { name: 'Reset view' }).tap()
    await expect.poll(pose).toEqual(initialPose)
    const artifacts = process.env.DEV_RUNNER_ARTIFACTS
    if (artifacts)
      await page.screenshot({ path: join(artifacts, 'recorder-floor-stack.png') })
    await cdp.detach()
  })
})

test('interrupts a session, selects an interior and reopens its saved record', async ({
  page,
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

  await openNativeRecorder(page)
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
  await expect(skeleton).toHaveCount(0)
  await expect(page.getByRole('heading', { name: session })).toBeVisible()
  const interrupt = page.getByRole('button', { name: 'Interrupt session' })
  await interrupt.click()
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await interrupt.click()
  await page.getByRole('button', { name: 'Yes', exact: true }).click()
  await testSession.click()
  const location = page.getByRole('button', { name: 'Location', exact: true })
  await expect(page.getByRole('heading', { name: 'Records' })).toBeVisible()
  const before = await page.getByRole('list').locator('li:has(button)').count()
  const artifacts = process.env.DEV_RUNNER_ARTIFACTS
  await location.click()
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(page.getByRole('list').locator('li:has(button)')).toHaveCount(before)
  await location.click()
  await expect(
    page.getByRole('button', { name: 'Interior', exact: true }),
  ).toHaveAttribute('aria-pressed', 'false')
  const building = page.getByRole('button', { name: 'Building', exact: true })
  await building.click()
  await page.getByRole('searchbox').fill(fixture ? 'North Tower' : parent)
  await page
    .getByRole('dialog', { name: 'Building' })
    .locator('button[aria-pressed]')
    .first()
    .click()
  await page.getByRole('button', { name: 'Interior', exact: true }).click()
  const plan = page.getByRole('button', { name: 'Floor plan' })
  await expect(plan.locator('image')).toBeVisible()
  const floor = page.getByRole('button', { name: 'Floor', exact: true })
  await floor.press('ArrowDown')
  await expect(floor).toContainText('Upper')
  await floor.press('ArrowUp')
  if (fixture) {
    const fitted = await plan.getAttribute('viewBox')
    await plan.dblclick()
    await expect(plan).not.toHaveAttribute('viewBox', fitted!)
    const viewport = (await plan.boundingBox())!
    await plan.click({ position: { x: 12, y: viewport.height / 2 } })
    await expect(plan).toHaveAttribute('viewBox', fitted!)
    await expect(page.getByRole('heading', { name: part })).toHaveCount(0)
  }
  await plan.dblclick()
  await expect(page.getByRole('heading', { name: part })).toBeVisible()
  await plan.click()
  if (themeArtifacts)
    await page.screenshot({ path: join(themeArtifacts, 'recorder-interior.png') })
  await page.getByRole('button', { name: 'Accept', exact: true }).click()
  await expect(page.getByRole('button', { name: /^Status/ })).toHaveAttribute(
    'aria-expanded',
    'false',
  )
  await expect(page.getByRole('button', { name: /^Fields/ })).toHaveAttribute(
    'aria-expanded',
    'true',
  )
  if (fixture) {
    await expect(
      page.getByRole('heading', { name: 'Lift 2, G/F, 12 Kai Tak Road' }),
    ).toBeVisible()
    await expect(page.getByText('#001', { exact: true })).toBeVisible()
    await page.getByLabel('Title', { exact: true }).fill('Painted shop sign')
    await page
      .getByLabel('Description', { exact: true })
      .fill('Red letters above the lift.')
    await page
      .getByRole('group', { name: 'Condition' })
      .getByRole('button', { name: 'Degraded' })
      .click()
    await page.getByLabel('notes', { exact: true }).fill('Observed during survey')
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeEnabled()
    await page.goBack()
    await page.getByRole('button', { name: /Lift 2.*E.*#001/ }).click()
    await expect(page.getByLabel('notes', { exact: true })).toHaveValue(
      'Observed during survey',
    )
    await expect(page.getByLabel('Title', { exact: true })).toHaveValue(
      'Painted shop sign',
    )
    await expect(page.getByLabel('Description', { exact: true })).toHaveValue(
      'Red letters above the lift.',
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
    if (artifacts)
      await page.screenshot({
        path: join(artifacts, 'recorder-editor.png'),
        fullPage: true,
      })
  }
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Records' })).toBeVisible()
  await expect(page.getByRole('list').locator('li:has(button)')).toHaveCount(before + 1)
  if (fixture) {
    await page.getByRole('button', { name: /Lift 2.*E.*#001/ }).click()
    await expect(
      page
        .getByRole('group', { name: 'Condition' })
        .getByRole('button', { name: 'Degraded' }),
    ).toHaveAttribute('aria-pressed', 'true')
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
  await expect(page.getByRole('list').locator('li:has(button)')).toHaveCount(before + 1)
  if (fixture) {
    await interrupt.click()
    await page.getByRole('button', { name: 'Yes', exact: true }).click()
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

test('reuses cached models and floor plans after restarting Recorder', async ({
  page,
}) => {
  test.setTimeout(120_000)
  await useLocationFixture(page)
  await openNativeRecorder(page)
  async function selectBuilding(): Promise<void> {
    await page.getByRole('button', { name: 'North tower survey' }).click()
    await page.getByRole('button', { name: 'Location', exact: true }).click()
    await page.getByRole('button', { name: 'Building', exact: true }).click()
    await page
      .getByRole('dialog', { name: 'Building' })
      .getByRole('button', { name: /North Tower/ })
      .click()
  }

  const interior = page.getByRole('button', { name: 'Interior', exact: true })
  const exterior = page.getByRole('button', { name: 'Exterior', exact: true })
  const plan = page.getByRole('button', { name: 'Floor plan' })
  const facade = page.getByRole('button', { name: 'Facade', exact: true })
  await selectBuilding()
  // A damaged release must be retryable at the same content-addressed URL.
  await page.route('**/releases/*', route => route.fulfill({ json: {} }), { times: 1 })
  await interior.click()
  await page.getByRole('button', { name: 'Retry floor plan' }).click()
  await expect(plan).toBeVisible()
  // A glTF can parse as JSON and still fail when the viewer resolves its dependencies.
  await page.route(
    '**/assembly.gltf',
    route => route.fulfill({ json: { buffers: [{ uri: 'invalid-resource' }] } }),
    { times: 1 },
  )
  // Hold the real viewer in its pending state until both motion preferences have been checked.
  let releasePlacement!: () => void
  const pendingPlacement = new Promise<void>(resolve => {
    releasePlacement = resolve
  })
  await page.route(
    '**/placement.json*',
    async route => {
      await pendingPlacement
      await route.fallback()
    },
    { times: 1 },
  )
  const loading = page.getByRole('status', { name: 'Loading building exterior model' })
  const animationCount = () =>
    loading.evaluate(el => el.getAnimations({ subtree: true }).length)
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  try {
    await exterior.click()
    await expect(loading).toBeVisible()
    await expect.poll(animationCount).toBeGreaterThan(0)
    const artifacts = process.env.DEV_RUNNER_ARTIFACTS
    if (artifacts)
      await loading.screenshot({ path: join(artifacts, 'building-model-loading.png') })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await expect.poll(animationCount).toBe(0)
    await expect(loading.locator('svg')).toBeVisible()
  } finally {
    releasePlacement()
  }
  const retry = page.getByRole('button', { name: 'Retry', exact: true })
  await expect(retry).toBeVisible()
  await expect(loading).toHaveCount(0)
  await retry.click()
  await expect(facade).toBeEnabled({ timeout: 45000 })
  await expect(loading).toHaveCount(0)

  // Keep the account and placement checks online, and make every asset download fail.
  const downloads: string[] = []
  await page.route(
    /\/(?:releases\/[^/]+|assembly\.gltf|mesh\.bin|wall\.png)$/,
    route => {
      downloads.push(route.request().url())
      return route.fulfill({ status: 503 })
    },
  )
  await page.reload()
  await selectBuilding()
  await interior.click()
  await expect(plan).toBeVisible()
  await expect(plan.locator('image')).toHaveAttribute('href', /^data:image\/png/)
  await exterior.click()
  await expect(facade).toBeEnabled({ timeout: 45000 })
  expect(downloads).toEqual([])

  await interior.click()
  await page.route('**/placement.json*', route => route.fulfill({ status: 403 }))
  await exterior.click()
  await expect(page.getByRole('alert')).toHaveText('Could not load facade information.')
  await expect(page.locator('model-viewer')).toHaveCount(0)

  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await page.getByRole('button', { name: 'Interrupt session' }).click()
  await page.getByRole('button', { name: 'Yes', exact: true }).click()
  await page.getByRole('button', { name: 'User', exact: true }).click()
  await page.getByRole('button', { name: 'Sign out', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Sign in with HYPE' })).toBeVisible()
  expect(await page.evaluate(() => caches.keys())).not.toContainEqual(
    expect.stringMatching(/^hype-recorder-assets-/),
  )
})

test('selects a model wall and restores its facade marker', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await useLocationFixture(page)
  await openNativeRecorder(page)
  await page.getByRole('button', { name: 'North tower survey' }).click()
  await page.getByRole('button', { name: 'Location', exact: true }).click()
  await page.getByRole('button', { name: 'Building', exact: true }).click()
  await page
    .getByRole('dialog', { name: 'Building' })
    .getByRole('button', { name: /North Tower/ })
    .click()
  await page.getByRole('button', { name: 'Exterior', exact: true }).click()
  await expect(page.getByRole('button', { name: '3D', exact: true })).toHaveCount(0)
  const modelBack = page.getByRole('button', { name: 'Return to 3D model' })
  await expect(modelBack).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Facade', exact: true })).toBeEnabled({
    timeout: 45000,
  })
  const model = page.locator('model-viewer')
  async function tapMesh() {
    const point = await model.evaluate(async el => {
      // A tap must land inside the triangle after the facade camera has settled.
      const viewer = el as import('@google/model-viewer').ModelViewerElement
      await viewer.updateComplete
      viewer.jumpCameraToGoal()
      await new Promise(resolve =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      )
      const r = el.getBoundingClientRect()
      for (let y = 0.15; y < 0.9; y += 0.025) {
        for (let x = 0.15; x < 0.9; x += 0.025) {
          const cx = Math.round(r.x + x * r.width),
            cy = Math.round(r.y + y * r.height)
          const hit = viewer.positionAndNormalFromPoint(cx, cy)
          if (
            hit &&
            hit.position.x > 0.12 &&
            hit.position.y > 0.12 &&
            hit.position.x + hit.position.y < 0.85
          )
            return { x: cx, y: cy }
        }
      }
      throw Error('No visible interior point on the fixture wall')
    })
    await page.mouse.click(point.x, point.y)
  }
  await tapMesh()
  await expect(modelBack).toBeVisible()
  await expect(model).toHaveJSProperty('zoomSensitivity', 0.65)
  await modelBack.click()
  await expect(modelBack).toHaveCount(0)
  await expect(model).toHaveJSProperty('zoomSensitivity', 1)
  await tapMesh()
  await expect(modelBack).toBeVisible()
  await tapMesh()
  await expect(page.getByLabel('Map marker')).toBeVisible()
  if (process.env.DEV_RUNNER_ARTIFACTS)
    await page.screenshot({
      path: join(process.env.DEV_RUNNER_ARTIFACTS, 'recorder-facade.png'),
    })
  await page.getByRole('button', { name: 'Accept', exact: true }).click()
  await expect(page.getByRole('heading', { name: '12 Kai Tak Road' })).toBeVisible()
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Records' })).toBeVisible()
  await expect(page.getByRole('list').locator('li:has(button)')).toHaveCount(1)
  await page.getByRole('button', { name: 'View on map' }).click()
  await expect(page.getByLabel('Map marker')).toBeVisible({ timeout: 45000 })
})

test('edits and reopens single and multiple fixed-choice properties', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await useLocationFixture(page, true)
  await openNativeRecorder(page)
  await page.getByRole('button', { name: 'North tower survey' }).click()
  const entry = page.getByRole('button', { name: 'Survey 1', exact: true })
  await entry.click()

  const single = page.getByRole('group', { name: 'Condition' })
  const good = single.getByRole('button', { name: 'Preserved' })
  const poor = single.getByRole('button', { name: 'Degraded' })
  const multi = page.getByRole('group', { name: 'Materials' })
  const metal = multi.getByRole('button', { name: 'Metal' })
  const glass = multi.getByRole('button', { name: 'Acrylic' })
  const wood = multi.getByRole('button', { name: 'Wood' })
  const buttons = single.getByRole('button')
  await expect(buttons).toHaveText(['Degraded', 'Weathered', 'Preserved'])
  await expect(buttons.locator('svg')).toHaveCount(3)
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 })
    const tops = await buttons.evaluateAll(nodes =>
      nodes.map(node => node.getBoundingClientRect().top),
    )
    expect(new Set(tops).size).toBe(1)
    await expect(good).toHaveCSS('flex-direction', 'column')
  }
  await expect(good).toHaveAttribute('aria-pressed', 'true')
  await expect(metal).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('button', { name: 'Clear Condition' })).toHaveCount(0)
  await good.click()
  await expect(good).toHaveAttribute('aria-pressed', 'false')
  await good.click()
  await poor.click()
  await expect(good).toHaveAttribute('aria-pressed', 'false')
  await metal.click()
  await expect(multi.locator('[aria-pressed=true]')).toHaveCount(0)
  await glass.click()
  await wood.click()
  const save = page.getByRole('button', { name: 'Save', exact: true })
  await save.click()
  await expect(page.getByRole('heading', { name: 'Records' })).toBeVisible()
  await entry.click()
  await expect(poor).toHaveAttribute('aria-pressed', 'true')
  await expect(metal).toHaveAttribute('aria-pressed', 'false')
  await expect(glass).toHaveAttribute('aria-pressed', 'true')
  await expect(wood).toHaveAttribute('aria-pressed', 'true')
  if (process.env.DEV_RUNNER_ARTIFACTS) {
    await single.scrollIntoViewIfNeeded()
    await page.screenshot({
      path: join(process.env.DEV_RUNNER_ARTIFACTS, 'property-buttons.png'),
    })
  }
  const fields = page.getByRole('button', { name: /^Fields/ })
  await fields.click()
  await expect(fields).toHaveAccessibleName(/Condition: Degraded/)
  await expect(fields.locator('svg')).toHaveCount(3)
  await expect(fields.locator('.sr-only').filter({ hasText: 'Condition' })).toHaveCount(
    1,
  )
  if (process.env.DEV_RUNNER_ARTIFACTS) {
    await fields.screenshot({
      path: join(process.env.DEV_RUNNER_ARTIFACTS, 'collapsed-options.png'),
    })
  }
})

test('reviews captured photos and retries only the remaining selection', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await useLocationFixture(page, true)
  await openNativeRecorder(page)
  await page.getByRole('button', { name: /North tower survey/ }).click()
  await page.getByRole('button', { name: 'Survey 1', exact: true }).click()
  const camera = page.getByRole('button', { name: 'Take photo' })
  const save = page.getByRole('button', { name: 'Save', exact: true })
  const image = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/aXkAAAAASUVORK5CYII=',
    'base64',
  )
  for (const name of ['first.png', 'skip.png', 'remove.png', 'last.png']) {
    const chooserEvent = page.waitForEvent('filechooser')
    if (name === 'skip.png')
      await page.getByRole('button', { name: 'Gallery', exact: true }).click()
    else await camera.click()
    const chooser = await chooserEvent
    expect(await chooser.element().getAttribute('capture')).toBe(
      name === 'skip.png' ? null : 'environment',
    )
    await chooser.setFiles({ name, mimeType: 'image/png', buffer: image })
  }
  await page.getByRole('checkbox', { name: 'Upload photo 2' }).uncheck()
  await page.getByRole('button', { name: 'Remove photo 3' }).click()
  await page.goBack()
  await page.getByRole('button', { name: 'Survey 1', exact: true }).click()
  await expect(page.getByRole('checkbox', { name: 'Upload photo 2' })).not.toBeChecked()
  await expect(page.getByRole('img', { name: 'Preview of photo 1' })).toHaveJSProperty(
    'naturalWidth',
    1,
  )
  await save.click()
  await expect(page.getByRole('alert')).toContainText('Tap Save to retry')
  const first = page.getByRole('img', { name: 'Saved photo 1' })
  await first.scrollIntoViewIfNeeded()
  await expect(first).toHaveJSProperty('naturalWidth', 1)
  await save.click()
  await expect(page.getByRole('heading', { name: 'Records' })).toBeVisible()
  const card = page.getByRole('button', { name: 'Survey 1', exact: true })
  await expect(card.locator('img')).toHaveJSProperty('naturalWidth', 1)
  await expect(card).toContainText('No address recorded')
  await expect(page.getByText('survey-record', { exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Survey 1', exact: true }).click()
  await expect(
    page.getByRole('list', { name: 'Saved photos' }).locator('img'),
  ).toHaveCount(2)
  await first.scrollIntoViewIfNeeded()
  await expect(first).toHaveJSProperty('naturalWidth', 1)
  // Photos excluded from this Save remain in the local draft when returning from the index.
  await expect(page.getByRole('checkbox')).toHaveCount(1)
  await expect(page.getByRole('checkbox')).not.toBeChecked()
  await page.getByRole('button', { name: 'Remove photo 1' }).click()
  await expect(first).toHaveAttribute('src', /\/revisions\/[^?]+$/)
  const second = page.getByRole('img', { name: 'Saved photo 2' })
  await expect(second).toHaveJSProperty('naturalWidth', 1)
  await expect(second).toHaveAttribute('src', /\?t=c_fit,w_320,h_320$/)
})

test('cycles through building and floor groups and keeps the selected index view', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 740 })
  await useLocationFixture(page, 'grouped')
  await openNativeRecorder(page)
  await page.getByRole('button', { name: 'North tower survey' }).click()
  const items = page.getByRole('listitem')
  await expect(items.first()).toContainText('Capture 5')
  await page.getByRole('button', { name: 'Newest first' }).click()
  await expect(items.first()).toContainText('Survey 1')
  const cycle = page.getByRole('button', { name: /^Group records:/ })
  await cycle.click()
  const buildings = page.getByRole('heading', { level: 3 })
  await expect(buildings).toHaveText([
    /2 Kai Tak Road/,
    /12 Kai Tak Road/,
    /No building recorded/,
  ])
  const north = buildings.nth(1).getByRole('button')
  await north.click()
  await expect(items).toHaveCount(2)
  await north.click()
  await cycle.click()
  const ground = page.getByRole('button', { name: /Ground floor.*2/ })
  await expect(ground).toBeVisible()
  await expect(page.getByRole('heading', { level: 4, name: /Upper/ })).toBeVisible()
  await ground.click()
  await expect(items).toHaveCount(3)
  await page.getByRole('button', { name: 'Collapse all sections' }).click()
  await expect(items).toHaveCount(0)
  await page.getByRole('button', { name: 'Expand all sections' }).click()
  await expect(items).toHaveCount(5)
  await ground.click()
  await page.getByRole('button', { name: 'Survey 1', exact: true }).click()
  await expect(page.getByLabel('Title', { exact: true })).toBeVisible()
  await page.goBack()
  await expect(ground).toHaveAttribute('aria-expanded', 'false')
  await expect(page.getByRole('button', { name: 'Oldest first' })).toBeVisible()
  await cycle.click()
  await expect(buildings).toHaveCount(0)
  await expect(items.first()).toContainText('Survey 1')
})
