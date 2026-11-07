// BROWSER
import { chromium, webkit } from 'playwright'
// NODE
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, extname, resolve, join } from 'node:path'
// TYPES
import type { FeatureFromCollection } from '../../src/lib/db/zod/schema/feature.types'

/** Real renderer benchmark with synthetic images and an empty basemap; no API or tile timings. */
type BenchmarkWindow = Window & {
  createMarkerRenderer: typeof import('../../src/lib/map/markers').createMarkerRenderer
  createAdaptiveMarkerRenderer: typeof import('../../src/lib/map/adaptiveMarkers').createAdaptiveMarkerRenderer
  installFeatureViewportScheduler: typeof import('../../src/lib/map/viewportScheduler').installFeatureViewportScheduler
  maplibregl: typeof import('maplibre-gl')
  disposeMarkerBenchmark?: () => void
}

/**
 * Reads an optional named CLI argument without interpreting shell input.
 * @param name - Argument name without its leading dashes.
 * @returns The supplied value, or undefined when omitted.
 */
function option(name: string): string | undefined {
  return process.argv
    .find(argument => argument.startsWith(`--${name}=`))
    ?.slice(name.length + 3)
}

/**
 * Validates a numeric benchmark setting before launching a browser.
 * @param name - CLI setting name.
 * @param fallback - Default when the setting is omitted.
 * @param minimum - Lowest supported value.
 * @param maximum - Highest supported value.
 * @param integer - Whether fractional values are invalid.
 * @returns The validated setting.
 */
function numericOption(
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
  integer = true,
): number {
  const value = Number(option(name) ?? fallback)
  if (
    !Number.isFinite(value) ||
    value < minimum ||
    value > maximum ||
    (integer && !Number.isInteger(value))
  )
    throw new Error(
      `--${name} must be ${integer ? 'an integer' : 'a number'} between ${minimum} and ${maximum}`,
    )
  return value
}

/**
 * Validates a finite set of benchmark choices.
 * @param name - CLI setting name.
 * @param choices - Supported values, with the default first.
 * @returns The selected supported value.
 */
function choiceOption<const T extends readonly string[]>(
  name: string,
  choices: T,
): T[number] {
  const value = option(name) ?? choices[0]
  if (!choices.includes(value))
    throw new Error(`--${name} must be one of: ${choices.join(', ')}`)
  return value
}

// Keep the application ceiling and total retained budget explicit in density comparisons.
const active = numericOption('active', 500, 1, 500)
const cached = numericOption('cached', 1000, 0, 1500 - active)
const arrival = numericOption('arrival', 0, 0, active - 1)
const pitch = numericOption('pitch', 0, 0, 60, false)
const bearing = numericOption('bearing', 0, -180, 180, false)
const widths = option('width') ? [numericOption('width', 390, 1, 4096)] : [1280, 390]
const markerStyle = choiceOption('style', ['image', 'dot'] as const)
const motion = choiceOption('motion', ['pan', 'zoom', 'fly'] as const)
const engine = choiceOption('engine', ['chromium', 'webkit'] as const)
const rendererKind = choiceOption('renderer', ['native', 'adaptive'] as const)
const deviceScaleFactor = numericOption('dpr', 1, 1, 4, false)
const mapPixelRatio = option('map-dpr')
  ? numericOption('map-dpr', deviceScaleFactor, 1, 4, false)
  : undefined
const warmupMs = numericOption('warmup', 500, 0, 10000)
const screenshotPath = option('screenshot')
const requestedCpuSlowdown = numericOption('cpu', 4, 1, 20, false)
// WebKit has no CDP CPU-throttling API; never present it as a slowed iPhone simulation.
const cpuSlowdown = engine === 'chromium' ? requestedCpuSlowdown : 1
const root = resolve(import.meta.dir, '../..')
const temporary = await mkdtemp(join(tmpdir(), 'hype-marker-benchmark-'))
const entry = join(temporary, 'entry.ts')
// Compare with HEAD or a fixed revision without changing the working tree.
const baselineRef = process.argv
  .find(argument => argument.startsWith('--baseline-ref='))
  ?.slice('--baseline-ref='.length)
const baseline = process.argv.includes('--baseline') || Boolean(baselineRef)
const baselineCommit = baseline
  ? (() => {
      const revision = Bun.spawnSync(
        ['git', 'rev-parse', '--verify', `${baselineRef ?? 'HEAD'}^{commit}`],
        { cwd: root },
      )
      if (revision.exitCode !== 0) throw new Error('Cannot resolve baseline commit')
      return revision.stdout.toString().trim()
    })()
  : null
if (baseline && rendererKind !== 'native')
  throw new Error(
    'Baseline revisions benchmark the native renderer; use --renderer=native',
  )
/** Reads one committed benchmark dependency. @param path Repository-relative path. @returns Source at the selected revision. */
function readBaseline(path: string): string {
  const result = Bun.spawnSync(['git', 'show', `${baselineCommit}:${path}`], {
    cwd: root,
  })
  if (result.exitCode !== 0) throw new Error(`Cannot read baseline ${path}`)
  return result.stdout.toString()
}
const spacing = process.argv.includes('--spread') ? 0.004 : 0.001
const repeats = process.argv.includes('--repeat') ? 3 : 1
let bundle: string
try {
  await Bun.write(
    entry,
    `import { createMarkerRenderer } from '${root}/src/lib/map/markers.ts';
${rendererKind === 'adaptive' ? `import { createAdaptiveMarkerRenderer } from '${root}/src/lib/map/adaptiveMarkers.ts';` : ''}
import { installFeatureViewportScheduler } from '${root}/src/lib/map/viewportScheduler.ts';
window.createMarkerRenderer = createMarkerRenderer;
${rendererKind === 'adaptive' ? 'window.createAdaptiveMarkerRenderer = createAdaptiveMarkerRenderer;' : ''}
window.installFeatureViewportScheduler = installFeatureViewportScheduler;`,
  )
  const built = await Bun.build({
    entrypoints: [entry],
    target: 'browser',
    plugins: [
      {
        name: 'fixture-images',
        setup(build) {
          if (baseline) {
            for (const name of ['markers', 'markerRetention']) {
              build.onLoad({ filter: new RegExp(`/map/${name}\\.ts$`) }, () => ({
                contents: readBaseline(`src/lib/map/${name}.ts`),
                loader: 'ts',
              }))
            }
          }
          build.onLoad({ filter: /client\/services\/image\.ts$/ }, () => ({
            contents: 'export const getImageSrc = (image) => image',
            loader: 'js',
          }))
          build.onLoad({ filter: /\.css$/ }, () => ({ contents: '', loader: 'js' }))
        },
      },
    ],
  })
  if (!built.success) throw new Error(String(built.logs))
  bundle = await built.outputs[0].text()
} finally {
  await rm(temporary, { recursive: true, force: true })
}
const browser =
  engine === 'chromium'
    ? await chromium.launch({
        headless: true,
        executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
        args: ['--disable-web-security'],
      })
    : await webkit.launch({ headless: true })
const browserVersion = browser.version()
const results = []
try {
  for (let trial = 1; trial <= repeats; trial++) {
    for (const width of widths) {
      const page = await browser.newPage({
        viewport: { width, height: 844 },
        deviceScaleFactor,
      })
      const pageErrors: string[] = []
      page.on('pageerror', error => pageErrors.push(error.message))
      page.setDefaultTimeout(20_000)
      await page.route('http://127.0.0.1:4173/marker-benchmark', r =>
        r.fulfill({
          contentType: 'text/html',
          body: '<div id="map" style="position:absolute;inset:0"></div>',
        }),
      )
      await page.goto('http://127.0.0.1:4173/marker-benchmark')
      await page.addStyleTag({
        content:
          (await readFile(
            `${root}/node_modules/maplibre-gl/dist/maplibre-gl.css`,
            'utf8',
          )) +
          '\n' +
          (baseline
            ? readBaseline('src/lib/styles/map-markers.css')
            : await readFile(`${root}/src/lib/styles/map-markers.css`, 'utf8')),
      })
      await page.route('**/maplibre-dist/*', async r =>
        r.fulfill({
          contentType: 'text/javascript',
          body: await readFile(
            `${root}/node_modules/maplibre-gl/dist/${new URL(r.request().url()).pathname.split('/').pop()}`,
            'utf8',
          ),
        }),
      )
      await page.addScriptTag({
        type: 'module',
        content: `import * as maplibregl from '/maplibre-dist/maplibre-gl.mjs'; window.maplibregl = maplibregl;`,
      })
      await page.waitForFunction(() =>
        Boolean((window as unknown as BenchmarkWindow).maplibregl),
      )
      await page.addScriptTag({ content: bundle })
      if (engine === 'chromium') {
        const cdp = await page.context().newCDPSession(page)
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpuSlowdown })
      }
      results.push(
        await page.evaluate(
          async ({
            width,
            spacing,
            trial,
            baseline,
            baselineCommit,
            active,
            cached,
            arrival,
            pitch,
            bearing,
            markerStyle,
            motion,
            engine,
            rendererKind,
            mapPixelRatio,
            keepMapForScreenshot,
            warmupMs,
            browserVersion,
            cpuSlowdown,
            requestedCpuSlowdown,
          }) => {
            const w = window as unknown as BenchmarkWindow
            const mapErrors: string[] = []
            const map = new w.maplibregl.Map({
              container: 'map',
              style: {
                version: 8,
                sources: {},
                layers: [
                  {
                    id: 'bg',
                    type: 'background',
                    paint: { 'background-color': '#19202b' },
                  },
                ],
              },
              center: [114.17, 22.32],
              zoom: 13,
              pitch,
              bearing,
              ...(mapPixelRatio === undefined ? {} : { pixelRatio: mapPixelRatio }),
              attributionControl: false,
            })
            map.on('error', event => mapErrors.push(event.error.message))
            /**
             * Waits for one renderer event with a bounded failure deadline.
             * @param event - Map event expected to finish the current phase.
             * @returns Completion when the event fires; rejects on a stalled phase.
             */
            function waitForMapEvent(event: 'load' | 'moveend'): Promise<void> {
              return new Promise((resolve, reject) => {
                const timer = setTimeout(() => {
                  map.off(event, onEvent)
                  reject(new Error(`Map did not emit ${event} within 15 seconds`))
                }, 15_000)
                function onEvent(): void {
                  clearTimeout(timer)
                  resolve()
                }
                map.once(event, onEvent)
              })
            }
            await waitForMapEvent('load')
            // Read only the existing public canvas context; never create a second renderer.
            const canvas = map.getCanvas()
            const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl')
            const rendererInfo = gl?.getExtension('WEBGL_debug_renderer_info')
            const glRenderer = gl
              ? String(
                  gl.getParameter(rendererInfo?.UNMASKED_RENDERER_WEBGL ?? gl.RENDERER),
                )
              : null
            const renderer =
              rendererKind === 'adaptive'
                ? w.createAdaptiveMarkerRenderer(map, w.maplibregl)
                : w.createMarkerRenderer(map, w.maplibregl)
            /**
             * Counts exact identities from public source snapshots, including offscreen points.
             * @returns IDs represented by the renderer's owned GeoJSON sources.
             * @remarks This proves data membership, not successful GPU paint or hit testing.
             */
            function gpuFeatureIds(): Set<string> {
              const identities = new Set<string>()
              for (const [id, source] of Object.entries(map.getStyle().sources)) {
                if (!id.startsWith('hype-marker-points-') || source.type !== 'geojson')
                  continue
                const data = source.data
                if (typeof data !== 'object' || data.type !== 'FeatureCollection')
                  continue
                for (const feature of data.features) {
                  const featureId = feature.properties?.featureId
                  if (typeof featureId === 'string') identities.add(featureId)
                }
              }
              return identities
            }
            const image =
              'data:image/svg+xml,' +
              encodeURIComponent(
                '<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128"><rect width="128" height="128" fill="#587d92"/><circle cx="64" cy="64" r="40" fill="#e8ad9a"/></svg>',
              )
            const rows = Array.from({ length: active + cached }, (_, i) => ({
              id: `f-${i}`,
              projectId: 'p',
              image,
              geometry: {
                type: 'Point',
                coordinates: [
                  114.17 + ((i % 50) - 25) * spacing,
                  22.32 +
                    (Math.floor(i / 50) - Math.ceil((active + cached) / 50) / 2) *
                      spacing,
                ],
              },
            })) as unknown as FeatureFromCollection[]
            const retention = { scope: 'bench', budget: 1500 }
            const activeRows = rows.slice(cached)
            const syncStartedAt = performance.now()
            for (let offset = 0; offset < cached; offset += 500)
              renderer.sync(rows.slice(offset, Math.min(offset + 500, cached)), {
                retention,
                markerStyle,
              })
            const activeSyncStartedAt = performance.now()
            renderer.sync(activeRows.slice(0, active - arrival), {
              retention,
              markerStyle,
            })
            const activeSyncMs = performance.now() - activeSyncStartedAt
            const initialSyncMs = performance.now() - syncStartedAt
            await new Promise(r => setTimeout(r, warmupMs))
            const attachedBefore =
              document.querySelectorAll('.maplibregl-marker').length
            const attachedImagesBefore = document.querySelectorAll(
              '.maplibregl-marker img.marker-image',
            ).length
            const gpuPointsBefore = gpuFeatureIds().size
            const intervals: number[] = []
            let last: number | undefined
            let running = true
            function tick(t: number): void {
              if (last !== undefined) intervals.push(t - last)
              last = t
              if (running) requestAnimationFrame(tick)
            }
            requestAnimationFrame(tick)
            map.on(
              'movestart',
              () => (map.getContainer().dataset.markerMotion = 'moving'),
            )
            map.on('moveend', () => {
              delete map.getContainer().dataset.markerMotion
              renderer.updateCamera(true)
            })
            map.on('move', () => renderer.updateCamera())
            // Exercise the real camera-event contract; publication counts are not API requests.
            let viewportPublications = 0
            const disposeViewportScheduler = w.installFeatureViewportScheduler(map, {
              publish: () => {
                viewportPublications++
              },
              isLoading: () => false,
            })
            // Installation publishes the initial viewport before this movement starts.
            viewportPublications = 0
            const movementFinished = waitForMapEvent('moveend')
            const motionStartedAt = performance.now()
            let arrivalSyncMs: number | null = null
            let arrivalAtMs: number | null = null
            let arrivalDuringMotion: boolean | null = null
            // Model one arriving page independently of network latency and image downloads.
            const arrivalTimer = arrival
              ? setTimeout(() => {
                  arrivalAtMs = performance.now() - motionStartedAt
                  arrivalDuringMotion = map.isMoving()
                  const arrivalStartedAt = performance.now()
                  renderer.sync(activeRows, { retention, markerStyle })
                  arrivalSyncMs = performance.now() - arrivalStartedAt
                }, 700)
              : undefined
            if (motion === 'fly') {
              map.flyTo({
                center: [114.185, 22.325],
                zoom: 15,
                minZoom: 11,
                duration: 2500,
                essential: true,
              })
            } else {
              map.easeTo({
                ...(motion === 'zoom'
                  ? { zoom: 12 }
                  : { center: [114.185, 22.325] as [number, number] }),
                duration: 2500,
                easing: (t: number) => t,
                essential: true,
              })
            }
            await movementFinished
            // Capture endpoint attachment before selection can promote/reconcile an overlay.
            const attachedAtMoveEnd =
              document.querySelectorAll('.maplibregl-marker').length
            const attachedImagesAtMoveEnd = document.querySelectorAll(
              '.maplibregl-marker img.marker-image',
            ).length
            clearTimeout(arrivalTimer)
            running = false
            intervals.sort((a, b) => a - b)
            // Select an attached active marker so null === null can never pass DOM reuse.
            const selected = activeRows.find(row => renderer.getElement(row.id))
            const original = selected ? renderer.getElement(selected.id) : null
            renderer.sync(activeRows, {
              retention,
              markerStyle,
              selectedId: selected?.id,
              highlightedIds: new Set(selected ? [selected.id] : []),
            })
            const reused = selected
              ? original !== null && renderer.getElement(selected.id) === original
              : null
            const selectionWorks = selected
              ? (renderer.getElement(selected.id)?.classList.contains('active') ??
                false)
              : null
            const gpuIds = gpuFeatureIds()
            const missingActiveIds = activeRows
              .filter(row => !gpuIds.has(row.id) && !renderer.getElement(row.id))
              .map(row => row.id)
            const result = {
              baseline,
              baselineCommit,
              trial,
              spacing,
              reused,
              selectionWorks,
              selectionChecked: Boolean(selected),
              width,
              engine,
              renderer: rendererKind,
              browserVersion,
              deviceScaleFactor: window.devicePixelRatio,
              requestedMapPixelRatio: mapPixelRatio ?? null,
              mapPixelRatio: map.getPixelRatio(),
              appliedMapPixelRatio: canvas.width / map.getContainer().clientWidth,
              antialias: gl?.getContextAttributes()?.antialias ?? null,
              canvasWidth: canvas.width,
              canvasHeight: canvas.height,
              glRenderer,
              warmupMs,
              markerStyle,
              motion,
              cpuSlowdown,
              requestedCpuSlowdown,
              active,
              cached,
              arrival,
              pitch,
              bearing,
              initialSyncMs,
              activeSyncMs,
              arrivalScheduledAtMs: arrival ? 700 : null,
              arrivalAtMs,
              arrivalDuringMotion,
              arrivalSyncMs,
              viewportPublications,
              attachedBefore,
              attachedImagesBefore,
              attachedAtMoveEnd,
              attachedImagesAtMoveEnd,
              attachedAfter: document.querySelectorAll('.maplibregl-marker').length,
              attachedImagesAfter: document.querySelectorAll(
                '.maplibregl-marker img.marker-image',
              ).length,
              gpuPointsBefore,
              gpuPointsAfter: gpuIds.size,
              activeGpuIdentities: activeRows.filter(row => gpuIds.has(row.id)).length,
              representedActiveIdentities: activeRows.length - missingActiveIds.length,
              missingActiveIds,
              mapErrors,
              frames: intervals.length,
              p50: intervals[Math.floor(intervals.length * 0.5)],
              p95: intervals[Math.floor(intervals.length * 0.95)],
              maxFrameMs: intervals.at(-1) ?? null,
              over50ms: intervals.filter(x => x > 50).length,
            }
            const dispose = (): void => {
              disposeViewportScheduler()
              renderer.clear()
              map.remove()
            }
            if (keepMapForScreenshot) w.disposeMarkerBenchmark = dispose
            else dispose()
            return result
          },
          {
            width,
            spacing,
            trial,
            baseline,
            baselineCommit,
            active,
            cached,
            arrival,
            pitch,
            bearing,
            markerStyle,
            motion,
            engine,
            rendererKind,
            mapPixelRatio,
            keepMapForScreenshot: Boolean(screenshotPath),
            warmupMs,
            browserVersion,
            cpuSlowdown,
            requestedCpuSlowdown,
          },
        ),
      )
      if (pageErrors.length)
        throw new Error(`Benchmark page errors: ${pageErrors.join('; ')}`)
      if (screenshotPath) {
        const extension = extname(screenshotPath) || '.png'
        const path =
          repeats === 1 && widths.length === 1
            ? screenshotPath
            : join(
                dirname(screenshotPath),
                `${basename(screenshotPath, extname(screenshotPath))}-${width}-trial-${trial}${extension}`,
              )
        await mkdir(dirname(path), { recursive: true })
        // Screenshots wait for the progressive endpoint, outside the recorded motion interval.
        await page.waitForTimeout(500)
        await page.screenshot({ path })
        await page.evaluate(() =>
          (window as unknown as BenchmarkWindow).disposeMarkerBenchmark?.(),
        )
      }
      await page.close()
    }
  }
  console.log(JSON.stringify(results, null, 2))
} finally {
  await browser.close()
}
