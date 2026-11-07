// BROWSER
import { chromium } from 'playwright'
// IMAGES
import sharp from 'sharp'
// NODE
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
// MAP
import { MAP_STYLE_RENDER_VIEW } from '../../src/lib/map/styles/render.shared'
// TYPES
import type { Page } from 'playwright'
import type { Map as MapLibreMap, StyleSpecification } from 'maplibre-gl'
import type { FeatureFromCollection } from '../../src/lib/db/zod/schema/feature.types'
import type { MarkerRenderer } from '../../src/lib/map/markers'

/** Run with dev-check; uses public vector tiles, local photo samples and the Vite fixture. */
type CheckWindow = Window & {
  maplibregl: typeof import('maplibre-gl')
  createMarkerRenderer: typeof import('../../src/lib/map/markers').createMarkerRenderer
  quercusCheck: {
    map: MapLibreMap
    renderer: MarkerRenderer | null
    errors: string[]
    patternIds: string[]
    missingImages: string[]
    sourceContentEvents: number
    selectedId: string | null
    sync: () => void
  }
}

const root = resolve(import.meta.dir, '../..')
// Manual dev-check settings are independent of the application's Turbo environment.
const checkEnv: Record<string, string | undefined> = process.env
const origin = checkEnv.QUERCUS_CHECK_ORIGIN ?? 'http://127.0.0.1:4173'
const pickerOnly =
  process.argv.includes('--picker-only') || checkEnv.CHECK_ONLY === 'picker'
const output = join(root, 'output/playwright')
const scenes = [
  {
    name: 'park',
    id: 'ghsRowTA-AgP',
    coordinates: [114.157243554204, 22.330388666746856] as [number, number],
    imagePath: checkEnv.QUERCUS_PARK_IMAGE ?? '/tmp/quercus-park-local.webp',
    imageUrl:
      '/image/upload/c_fill,h_256,w_256/g_auto/f_webp/q_auto/v1792980450473/h/features/ghsRowTA-AgP/gUkAKe5Hjy4k0UqL',
  },
  {
    name: 'street',
    id: '4gY2qbqvieZr',
    coordinates: [114.23067830285459, 22.28089765723692] as [number, number],
    imagePath: checkEnv.QUERCUS_CANOPY_IMAGE ?? '/tmp/quercus-canopy-local.webp',
    imageUrl:
      '/image/upload/c_fill,h_256,w_256/g_auto/f_webp/q_auto/v1792983416173/h/features/4gY2qbqvieZr/NZPWWrZbYTveAFs8',
  },
] as const

await mkdir(output, { recursive: true })
console.log('[quercus] Building the production marker-renderer harness')
const temporary = await mkdtemp(join(tmpdir(), 'hype-quercus-check-'))
let markerBundle: string
try {
  const entry = join(temporary, 'entry.ts')
  await Bun.write(
    entry,
    `import { createMarkerRenderer } from ${JSON.stringify(`${root}/src/lib/map/markers.ts`)};
window.createMarkerRenderer = createMarkerRenderer;`,
  )
  // Keep the production marker renderer; photo lookup alone uses local sample bytes.
  const built = await Bun.build({
    entrypoints: [entry],
    target: 'browser',
    plugins: [
      {
        name: 'local-quercus-photos',
        setup(build) {
          build.onLoad({ filter: /client\/services\/image\.ts$/ }, () => ({
            contents: 'export const getImageSrc = image => image',
            loader: 'js',
          }))
          build.onLoad({ filter: /\.css$/ }, () => ({ contents: '', loader: 'js' }))
        },
      },
    ],
  })
  if (!built.success) throw new Error(String(built.logs))
  markerBundle = await built.outputs[0].text()
} finally {
  await rm(temporary, { recursive: true, force: true })
}

const css = [
  await readFile(join(root, 'node_modules/maplibre-gl/dist/maplibre-gl.css'), 'utf8'),
  await readFile(join(root, 'src/lib/styles/themes.css'), 'utf8'),
  await readFile(join(root, 'src/lib/styles/map-markers.css'), 'utf8'),
  // The renderer uses these two Tailwind utilities during image decoding.
  '.opacity-0{opacity:0}.opacity-100{opacity:1}',
].join('\n')

const browser = await chromium.launch({
  headless: true,
  executablePath: checkEnv.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  args: ['--disable-web-security'],
})
const reports: Record<string, unknown>[] = []
const comparisonImages: Array<{
  scene: string
  width: number
  style: string
  path: string
}> = []
type ComparisonStyle = 'quercus' | 'breadline-light'

/**
 * Reads the selected local photo or falls back to the existing local asset service.
 * @param scene - The real tree record and its local sample paths.
 * @returns WebP photo bytes as a browser-safe data URL.
 */
async function readSceneImage(scene: (typeof scenes)[number]): Promise<string> {
  let bytes: Buffer
  try {
    bytes = await readFile(scene.imagePath)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    const assetOrigin = checkEnv.QUERCUS_ASSET_ORIGIN ?? 'http://127.0.0.1:8790'
    const response = await fetch(new URL(scene.imageUrl, assetOrigin))
    if (!response.ok) throw new Error(`${scene.name} photo returned ${response.status}`)
    bytes = Buffer.from(await response.arrayBuffer())
  }
  return `data:image/webp;base64,${bytes.toString('base64')}`
}

/**
 * Renders the real runtime style and waits for source-backed geometry to paint.
 * @param page - Isolated headless page.
 * @param viewport - Exact screenshot dimensions.
 * @param coordinates - Real tree location, or the standard picker-preview center.
 * @param image - Optional local photo data URL for the production renderer.
 * @param featureId - Persisted feature represented by the image.
 * @param styleKey - Registered style rendered at the same scene and camera.
 * @returns Loaded-map evidence and a list of JavaScript failures.
 */
async function renderMap(
  page: Page,
  viewport: { width: number; height: number },
  coordinates: [number, number],
  image?: string,
  featureId?: string,
  styleKey: ComparisonStyle = 'quercus',
): Promise<{
  pageErrors: string[]
  failures: string[]
  tileResponses: () => number
  textureResponses: string[]
}> {
  const pageErrors: string[] = []
  const failures: string[] = []
  let tileResponses = 0
  const textureResponses: string[] = []
  page.on('pageerror', error => pageErrors.push(error.message))
  page.on('requestfailed', request =>
    failures.push(`${request.url()}: ${request.failure()?.errorText}`),
  )
  page.on('response', response => {
    const url = new URL(response.url())
    if (url.pathname.startsWith('/mapSprites/quercus/texture') && response.ok()) {
      textureResponses.push(url.pathname)
    }
    if (
      url.hostname === 'tiles.saanseoi.hk' &&
      /\/\d+\/\d+\/\d+/.test(url.pathname) &&
      response.ok()
    ) {
      tileResponses += 1
    }
  })
  page.setDefaultTimeout(60_000)
  await page.setViewportSize(viewport)
  // The public tile service allows this configured first-party development origin.
  await page.route('https://tiles.saanseoi.hk/**', async route => {
    const response = await route.fetch({
      headers: { ...route.request().headers(), origin: 'http://hype.localhost' },
    })
    await route.fulfill({ response })
  })
  await page.route(`${origin}/__quercus-map-check`, route =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><html data-theme="breadline-light"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0"><div id="map" style="position:absolute;inset:0"></div></body></html>',
    }),
  )
  await page.route('**/maplibre-dist/*', async route => {
    const fileName = new URL(route.request().url()).pathname.split('/').pop()
    if (!fileName) throw new Error('Missing MapLibre distribution filename')
    await route.fulfill({
      contentType: 'text/javascript',
      body: await readFile(
        join(root, 'node_modules/maplibre-gl/dist', fileName),
        'utf8',
      ),
    })
  })
  await page.goto(`${origin}/__quercus-map-check`)
  await page.addStyleTag({ content: css })
  await page.addScriptTag({
    type: 'module',
    content: `import * as maplibregl from '/maplibre-dist/maplibre-gl.mjs'; window.maplibregl = maplibregl;`,
  })
  await page.waitForFunction(() =>
    Boolean((window as unknown as CheckWindow).maplibregl),
  )
  await page.addScriptTag({ content: markerBundle })
  await page.evaluate(
    async ({ coordinates, image, featureId, preview, styleKey }) => {
      const w = window as unknown as CheckWindow
      const response = await fetch(`/api/mapStyles/${styleKey}?inline=1`)
      if (!response.ok)
        throw new Error(`${styleKey} runtime style returned ${response.status}`)
      const style = (await response.json()) as StyleSpecification
      if (styleKey === 'quercus' && style.name !== 'Quercus')
        throw new Error('Expected the registered Quercus style')
      // Inline JSON has no document URL; resolve every local sprite namespace as the runtime does.
      if (typeof style.sprite === 'string') {
        style.sprite = new URL(style.sprite, location.origin).toString()
      } else if (style.sprite) {
        style.sprite = style.sprite.map(sprite => ({
          ...sprite,
          url: new URL(sprite.url, location.origin).toString(),
        }))
      }
      const patternIds = style.layers.flatMap(layer =>
        layer.type === 'fill' && typeof layer.paint?.['fill-pattern'] === 'string'
          ? [layer.paint['fill-pattern']]
          : [],
      )
      const map = new w.maplibregl.Map({
        container: 'map',
        style,
        center: coordinates,
        zoom: preview ? preview.zoom : 17.2,
        bearing: preview ? preview.bearing : 0,
        pitch: preview ? preview.pitch : 0,
        attributionControl: false,
        fadeDuration: 0,
        preserveDrawingBuffer: true,
      })
      const state: CheckWindow['quercusCheck'] = {
        map,
        renderer: null,
        errors: [],
        patternIds: [...new Set(patternIds)],
        missingImages: [],
        sourceContentEvents: 0,
        selectedId: null,
        sync: () => {},
      }
      w.quercusCheck = state
      map.on('error', event => state.errors.push(event.error.message))
      map.on('styleimagemissing', event => state.missingImages.push(event.id))
      map.on('sourcedata', event => {
        if (
          event.sourceId === 'hongkong-latest' &&
          event.sourceDataType === 'content'
        ) {
          state.sourceContentEvents += 1
        }
      })
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error('Quercus map load timed out')),
          55_000,
        )
        map.once('load', () => {
          clearTimeout(timer)
          resolve()
        })
      })
      if (!image || !featureId) return
      const renderer = w.createMarkerRenderer(map, w.maplibregl)
      state.renderer = renderer
      const rows = [
        {
          id: featureId,
          projectId: 'WZ76ff-FpBgi',
          image,
          geometry: { type: 'Point', coordinates },
        },
      ] as unknown as FeatureFromCollection[]
      state.sync = () =>
        renderer.sync(rows, {
          markerStyle: 'image',
          markerTheme: 'light',
          selectedId: state.selectedId,
        })
      map.on('click', event => {
        const target = event.originalEvent.target
        if (
          target instanceof Element &&
          target.closest(`[data-feature-id="${featureId}"]`)
        ) {
          state.selectedId = featureId
          state.sync()
        }
      })
      state.sync()
      // This small fixture legend uses the actual Milque palette rather than copied swatches.
      const legend = document.createElement('aside')
      legend.style.cssText =
        'position:absolute;left:16px;top:16px;max-width:calc(100vw - 64px);padding:12px 16px;border:1px solid var(--theme-border);border-radius:14px;background:var(--theme-panel);color:var(--theme-text);font:14px/1.5 sans-serif;box-shadow:0 3px 12px #173f4a0c'
      legend.innerHTML = `<strong style="color:var(--theme-primary)">${styleKey === 'quercus' ? 'Quercus' : 'Day Runner'}</strong><br>Ancient trees · Milque UI`
      document.body.append(legend)
    },
    {
      coordinates,
      image,
      featureId,
      preview: image ? null : MAP_STYLE_RENDER_VIEW,
      styleKey,
    },
  )
  try {
    await page.waitForFunction(() => {
      const state = (window as unknown as CheckWindow).quercusCheck
      return (
        state.errors.length > 0 ||
        (state.map.isStyleLoaded() &&
          state.map.areTilesLoaded() &&
          state.map.isSourceLoaded('hongkong-latest') &&
          state.map
            .queryRenderedFeatures()
            .some(feature => feature.source === 'hongkong-latest'))
      )
    })
  } catch (error) {
    const diagnostics = await page.evaluate(() => {
      const state = (window as unknown as CheckWindow).quercusCheck
      const source = state.map.getSource('hongkong-latest')
      const features = state.map.queryRenderedFeatures()
      return {
        errors: state.errors,
        styleLoaded: state.map.isStyleLoaded(),
        areTilesLoaded: state.map.areTilesLoaded(),
        sourceContentEvents: state.sourceContentEvents,
        renderedFeatures: features.length,
        renderedBasemapFeatures: features.filter(
          feature => feature.source === 'hongkong-latest',
        ).length,
        sourceExists: Boolean(source),
        sourceLoaded: source ? state.map.isSourceLoaded('hongkong-latest') : false,
        sourceType: source?.type,
      }
    })
    console.error(
      JSON.stringify(
        {
          phase: 'map-readiness-timeout',
          pageErrors,
          failures,
          tileResponses,
          ...diagnostics,
        },
        null,
        2,
      ),
    )
    throw error
  }
  if (image) {
    await page.waitForFunction(() => {
      const marker = document.querySelector<HTMLElement>('.marker-container--feature')
      const image = marker?.querySelector<HTMLImageElement>('img.marker-image')
      return (
        image?.complete &&
        image.naturalWidth > 0 &&
        marker?.querySelector<HTMLElement>('.marker-inner')?.dataset.imageState ===
          'ready' &&
        marker
          .getAnimations({ subtree: true })
          .every(animation => animation.playState !== 'running' && !animation.pending)
      )
    })
  }
  const patternEvidence = await page.evaluate(() => {
    const state = (window as unknown as CheckWindow).quercusCheck
    return {
      ids: state.patternIds,
      loaded: state.patternIds.every(id => state.map.hasImage(id)),
      rendered: state.map
        .queryRenderedFeatures()
        .filter(
          feature =>
            feature.layer.type === 'fill' && feature.layer.paint?.['fill-pattern'],
        ).length,
      missingImages: state.missingImages,
    }
  })
  assert.deepEqual(
    patternEvidence.missingImages,
    [],
    `${styleKey} requested missing sprites`,
  )
  if (styleKey === 'quercus') {
    assert.ok(patternEvidence.ids.length > 0, 'Quercus has no texture pattern layers')
    assert.equal(patternEvidence.loaded, true, 'Quercus texture sprites did not load')
    assert.ok(patternEvidence.rendered > 0, 'No textured geometry rendered')
    assert.ok(
      textureResponses.some(path => path.endsWith('.json')),
      'No texture sprite JSON loaded',
    )
    assert.ok(
      textureResponses.some(path => path.endsWith('.png')),
      'No texture sprite PNG loaded',
    )
  }
  return { pageErrors, failures, tileResponses: () => tileResponses, textureResponses }
}

/**
 * Places matching Day Runner and Quercus views beside each other for visual review.
 * @returns Nothing; writes desktop and narrow comparison boards under output/playwright.
 */
async function createComparisonBoard(): Promise<void> {
  for (const width of [1280, 390]) {
    const panelWidth = width === 1280 ? 800 : 390
    const panelHeight = width === 1280 ? Math.round((900 * panelWidth) / width) : 844
    const headerHeight = 58
    const gap = 16
    const rowHeight = panelHeight + headerHeight
    const boardWidth = panelWidth * 2 + gap * 3
    const boardHeight = rowHeight * scenes.length + gap * (scenes.length + 1)
    const layers: Array<{ input: Buffer; left: number; top: number }> = []
    for (const [row, scene] of scenes.entries()) {
      for (const [column, style] of ['day-runner', 'quercus'].entries()) {
        const shot = comparisonImages.find(
          image =>
            image.scene === scene.name &&
            image.width === width &&
            image.style === style,
        )
        if (!shot)
          throw new Error(`Missing ${style} ${scene.name} comparison screenshot`)
        const left = gap + column * (panelWidth + gap)
        const top = gap + row * (rowHeight + gap)
        const title = style === 'quercus' ? 'Quercus' : 'Day Runner'
        const subtitle = `${scene.name === 'park' ? 'Sham Shui Po Park' : 'Shau Kei Wan'} · ${width}px viewport`
        const header = Buffer.from(
          `<svg xmlns="http://www.w3.org/2000/svg" width="${panelWidth}" height="${headerHeight}"><rect width="100%" height="100%" fill="#fffdfa"/><text x="16" y="23" font-family="sans-serif" font-size="17" font-weight="600" fill="#173f4a">${title}</text><text x="16" y="44" font-family="sans-serif" font-size="12" fill="#5d777b">${subtitle}</text></svg>`,
        )
        layers.push({ input: header, left, top })
        layers.push({
          input: await sharp(shot.path)
            .resize(panelWidth, panelHeight)
            .png()
            .toBuffer(),
          left,
          top: top + headerHeight,
        })
      }
    }
    const fileName =
      width === 1280 ? 'quercus-vs-day-runner.png' : 'quercus-vs-day-runner-390.png'
    await sharp({
      create: {
        width: boardWidth,
        height: boardHeight,
        channels: 3,
        background: '#e5e1d9',
      },
    })
      .composite(layers)
      .png()
      .toFile(join(output, fileName))
    reports.push({
      scene: 'comparison-board',
      viewportWidth: width,
      screenshot: fileName,
    })
  }
}

try {
  if (!pickerOnly) {
    // Picker cards use the same clean view and dimensions as the standard preview renderer.
    console.log('[quercus] Rendering the clean 256 × 256 picker preview')
    const preview = await browser.newPage({ viewport: { width: 256, height: 256 } })
    const previewState = await renderMap(preview, { width: 256, height: 256 }, [
      MAP_STYLE_RENDER_VIEW.lng,
      MAP_STYLE_RENDER_VIEW.lat,
    ])
    const previewEvidence = await preview.evaluate(() => {
      const state = (window as unknown as CheckWindow).quercusCheck
      return {
        errors: state.errors,
        sourceContentEvents: state.sourceContentEvents,
        renderedFeatures: state.map.queryRenderedFeatures().length,
      }
    })
    assert.deepEqual(previewState.pageErrors, [])
    assert.deepEqual(previewState.failures, [])
    assert.deepEqual(previewEvidence.errors, [])
    assert.ok(
      previewState.tileResponses() > 0,
      'Preview did not receive any vector tiles',
    )
    await mkdir(join(root, 'static/mapStylePreviews'), { recursive: true })
    await preview.screenshot({
      path: join(root, 'static/mapStylePreviews/quercus.png'),
    })
    reports.push({
      scene: 'picker-preview',
      ...previewEvidence,
      tileResponses: previewState.tileResponses(),
    })
    await preview.close()
    console.log('[quercus] Captured the bundled picker preview')

    for (const scene of scenes) {
      const image = await readSceneImage(scene)
      for (const viewport of [
        { width: 1280, height: 900 },
        { width: 390, height: 844 },
      ]) {
        for (const styleKey of ['breadline-light', 'quercus'] as const) {
          const prefix = styleKey === 'quercus' ? 'quercus' : 'day-runner'
          console.log(
            `[quercus] Rendering ${prefix} ${scene.name} at ${viewport.width} × ${viewport.height}`,
          )
          const page = await browser.newPage({ viewport })
          const state = await renderMap(
            page,
            viewport,
            scene.coordinates,
            image,
            scene.id,
            styleKey,
          )
          const marker = page.locator(
            `.marker-container[data-feature-id="${scene.id}"]`,
          )
          const screenshot = `${prefix}-${scene.name}-${viewport.width}.png`
          await page.screenshot({ path: join(output, screenshot) })
          comparisonImages.push({
            scene: scene.name,
            width: viewport.width,
            style: prefix,
            path: join(output, screenshot),
          })
          await marker.click()
          await page.waitForFunction(
            id =>
              (window as unknown as CheckWindow).quercusCheck.renderer
                ?.getElement(id)
                ?.classList.contains('active'),
            scene.id,
          )
          const evidence = await page.evaluate(() => {
            const state = (window as unknown as CheckWindow).quercusCheck
            const marker = document.querySelector<HTMLElement>(
              '.marker-container--feature',
            )
            if (!marker) throw new Error('Tree photo marker disappeared')
            const bounds = marker.getBoundingClientRect()
            const features = state.map.queryRenderedFeatures()
            return {
              errors: state.errors,
              missingImages: state.missingImages,
              patternIds: state.patternIds,
              selectedId: state.selectedId,
              sourceContentEvents: state.sourceContentEvents,
              renderedFeatures: features.filter(
                feature => feature.source === 'hongkong-latest',
              ).length,
              highwayGeometry: state.map
                .queryRenderedFeatures({ filter: ['==', ['get', 'kind'], 'highway'] })
                .filter(
                  feature =>
                    feature.source === 'hongkong-latest' &&
                    feature.sourceLayer === 'roads' &&
                    feature.layer.type === 'line',
                ).length,
              markerTheme: marker.className,
              markerVisible:
                bounds.left >= 0 &&
                bounds.right <= innerWidth &&
                bounds.top >= 0 &&
                bounds.bottom <= innerHeight,
              uiTheme: document.documentElement.dataset.theme,
              horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
            }
          })
          assert.deepEqual(state.pageErrors, [])
          assert.deepEqual(state.failures, [])
          assert.deepEqual(evidence.errors, [])
          assert.deepEqual(evidence.missingImages, [])
          assert.equal(evidence.selectedId, scene.id)
          assert.equal(evidence.uiTheme, 'breadline-light')
          assert.equal(evidence.markerVisible, true)
          assert.equal(evidence.horizontalOverflow, false)
          assert.ok(state.tileResponses() > 0, 'Map did not receive any vector tiles')
          if (styleKey === 'quercus')
            assert.equal(
              evidence.highwayGeometry,
              0,
              'Quercus rendered highway geometry',
            )
          else if (scene.name === 'street')
            assert.ok(
              evidence.highwayGeometry > 0,
              'Comparison view contains no Day Runner highway geometry',
            )
          const selectedScreenshot = `${prefix}-${scene.name}-${viewport.width}-selected.png`
          await page.screenshot({ path: join(output, selectedScreenshot) })
          reports.push({
            scene: scene.name,
            style: prefix,
            viewport,
            ...evidence,
            tileResponses: state.tileResponses(),
            textureResponses: state.textureResponses,
            screenshot,
            selectedScreenshot,
          })
          await page.close()
          console.log(`[quercus] Captured ${screenshot} and selected state`)
        }
      }
    }
    await createComparisonBoard()
  }

  console.log('[quercus] Checking Quercus selection in the Milque appearance picker')
  const picker = await browser.newPage({ viewport: { width: 390, height: 844 } })
  const pickerErrors: string[] = []
  const pickerRequestFailures: string[] = []
  const pickerConsoleErrors: string[] = []
  const pickerNon200: Array<{ status: number; url: string }> = []
  picker.on('pageerror', error => pickerErrors.push(error.message))
  picker.on('requestfailed', request =>
    pickerRequestFailures.push(`${request.url()}: ${request.failure()?.errorText}`),
  )
  picker.on('console', message => {
    if (message.type() === 'error') pickerConsoleErrors.push(message.text())
  })
  picker.on('response', response => {
    if (response.status() !== 200 && response.status() !== 304) {
      pickerNon200.push({ status: response.status(), url: response.url() })
    }
  })
  await picker.route(`${origin}/__quercus-picker-check`, route =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><html data-theme="breadline-light"><head><meta name="viewport" content="width=device-width,initial-scale=1"><script>globalThis.__sveltekit_dev={env:{}}</script><script type="module" src="/@vite/client"></script></head><body><div id="app"></div><script type="module" src="/src/tests/fixtures/quercusStylePickerCheck.ts"></script></body></html>',
    }),
  )
  await picker.goto(`${origin}/__quercus-picker-check`, {
    waitUntil: 'domcontentloaded',
  })
  try {
    await picker
      .getByRole('radio', { name: 'Quercus', exact: true })
      .waitFor({ state: 'attached' })
  } catch (error) {
    const diagnostics = await picker.evaluate(() => ({
      body: document.body.textContent?.slice(0, 10_000),
      scripts: [...document.querySelectorAll<HTMLScriptElement>('script[src]')].map(
        script => script.src,
      ),
      inputs: [...document.querySelectorAll<HTMLInputElement>('input')].map(input => ({
        type: input.type,
        value: input.value,
        label: input.getAttribute('aria-label'),
      })),
      viteError: document
        .querySelector('vite-error-overlay')
        ?.shadowRoot?.textContent?.slice(0, 10_000),
    }))
    await picker
      .screenshot({
        path: join(output, 'quercus-picker-diagnostic.png'),
        timeout: 10_000,
      })
      .catch(screenshotError => console.error(String(screenshotError)))
    console.error(
      JSON.stringify(
        {
          phase: 'picker-load-timeout',
          errors: pickerErrors,
          requestFailures: pickerRequestFailures,
          consoleErrors: pickerConsoleErrors,
          non200: pickerNon200,
          ...diagnostics,
        },
        null,
        2,
      ),
    )
    throw error
  }
  await picker.getByText('Quercus', { exact: true }).click()
  assert.equal(
    await picker.getByRole('radio', { name: 'Quercus', exact: true }).isChecked(),
    true,
  )
  const quercusImage = picker.locator('img[alt="Quercus"]')
  await quercusImage.evaluate(image => {
    ;(image as HTMLImageElement).loading = 'eager'
  })
  await picker.waitForFunction(() => {
    const image = document.querySelector<HTMLImageElement>('img[alt="Quercus"]')
    return image?.complete && image.naturalWidth === 256 && image.naturalHeight === 256
  })
  const pickerEvidence = await picker.evaluate(() => ({
    uiTheme: document.documentElement.dataset.theme,
    mapStyle: localStorage.getItem('hype-map-style'),
    sync: localStorage.getItem('hype-sync-ui-map-styles'),
    activeMap: localStorage.getItem('hype-use-active-map-style'),
    horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
  }))
  assert.deepEqual(pickerErrors, [])
  assert.deepEqual(pickerEvidence, {
    uiTheme: 'breadline-light',
    mapStyle: 'quercus',
    sync: 'false',
    activeMap: 'false',
    horizontalOverflow: false,
  })
  await quercusImage
    .locator('..')
    .screenshot({ path: join(output, 'quercus-picker-milque.png') })
  reports.push({ scene: 'picker', ...pickerEvidence, errors: pickerErrors })
  await picker.close()
  console.log(JSON.stringify({ browserVersion: browser.version(), reports }, null, 2))
} finally {
  await browser.close()
}
