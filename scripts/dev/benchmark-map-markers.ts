// BROWSER
import { chromium } from 'playwright'
// NODE
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'
// TYPES
import type { FeatureFromCollection } from '../../src/lib/db/zod/schema/feature.types'

/** Real renderer benchmark with synthetic images and an empty basemap; no API or tile timings. */
type BenchmarkWindow = Window & {
  createMarkerRenderer: typeof import('../../src/lib/map/markers').createMarkerRenderer
  maplibregl: typeof import('maplibre-gl')
}
const root = resolve(import.meta.dir, '../..')
const temporary = await mkdtemp(join(tmpdir(), 'hype-marker-benchmark-'))
const entry = join(temporary, 'entry.ts')
// Compare with HEAD or a fixed revision without changing the working tree.
const baselineRef = process.argv
  .find(argument => argument.startsWith('--baseline-ref='))
  ?.slice('--baseline-ref='.length)
const baseline = process.argv.includes('--baseline') || Boolean(baselineRef)
/** Reads one committed benchmark dependency. @param path Repository-relative path. @returns Source at the selected revision. */
function readBaseline(path: string): string {
  const result = Bun.spawnSync(['git', 'show', `${baselineRef ?? 'HEAD'}:${path}`], {
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
    `import { createMarkerRenderer } from '${root}/src/lib/map/markers.ts'; window.createMarkerRenderer = createMarkerRenderer;`,
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
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  args: ['--disable-web-security'],
})
const results = []
try {
  for (let trial = 1; trial <= repeats; trial++) {
    for (const width of [1280, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 844 } })
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
      const cdp = await page.context().newCDPSession(page)
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
      results.push(
        await page.evaluate(
          async ({ width, spacing, trial, baseline }) => {
            const w = window as unknown as BenchmarkWindow
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
              attributionControl: false,
            })
            await new Promise(r => map.on('load', r))
            const renderer = w.createMarkerRenderer(map, w.maplibregl)
            const image =
              'data:image/svg+xml,' +
              encodeURIComponent(
                '<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128"><rect width="128" height="128" fill="#587d92"/><circle cx="64" cy="64" r="40" fill="#e8ad9a"/></svg>',
              )
            const rows = Array.from({ length: 1500 }, (_, i) => ({
              id: `f-${i}`,
              projectId: 'p',
              image,
              geometry: {
                type: 'Point',
                coordinates: [
                  114.17 + ((i % 50) - 25) * spacing,
                  22.32 + (Math.floor(i / 50) - 15) * spacing,
                ],
              },
            })) as unknown as FeatureFromCollection[]
            const retention = { scope: 'bench', budget: 1500 }
            for (let i = 0; i < 3; i++)
              renderer.sync(rows.slice(i * 500, (i + 1) * 500), { retention })
            await new Promise(r => setTimeout(r, 500))
            const attachedBefore =
              document.querySelectorAll('.maplibregl-marker').length
            const intervals: number[] = []
            let last = performance.now()
            let running = true
            function tick(t: number): void {
              intervals.push(t - last)
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
            await new Promise<void>(resolve => {
              map.once('moveend', () => resolve())
              map.easeTo({
                center: [114.185, 22.325],
                duration: 2500,
                easing: (t: number) => t,
              })
            })
            running = false
            intervals.sort((a, b) => a - b)
            const selected = rows[1029]
            const original = renderer.getElement(selected.id)
            renderer.sync(rows.slice(1000), {
              retention,
              selectedId: selected.id,
              highlightedIds: new Set([selected.id]),
            })
            const reused = renderer.getElement(selected.id) === original
            const selectionWorks =
              renderer.getElement(selected.id)?.classList.contains('active') ?? false
            const result = {
              baseline,
              trial,
              spacing,
              reused,
              selectionWorks,
              width,
              cpuSlowdown: 4,
              active: 500,
              cached: 1000,
              attachedBefore,
              attachedAfter: document.querySelectorAll('.maplibregl-marker').length,
              frames: intervals.length,
              p50: intervals[Math.floor(intervals.length * 0.5)],
              p95: intervals[Math.floor(intervals.length * 0.95)],
              over50ms: intervals.filter(x => x > 50).length,
            }
            renderer.clear()
            map.remove()
            return result
          },
          { width, spacing, trial, baseline },
        ),
      )
      await page.close()
    }
  }
  console.log(JSON.stringify(results, null, 2))
} finally {
  await browser.close()
}
