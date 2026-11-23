// NODE
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import sharp from 'sharp'
// PLAYWRIGHT
import { chromium, expect } from '@playwright/test'
const origin = process.env.PLAYWRIGHT_BASE_URL
const artifacts = process.env.DEV_RUNNER_ARTIFACTS
const placement = process.env.DEV_RUNNER_CHROME_CLASS
if (!origin || !artifacts || !placement)
  throw new Error('Use dev-remote --port PORT chrome')
await mkdir(artifacts, { recursive: true })
const browser = await chromium.launch({
  channel: 'chrome',
  headless: false,
  args: ['--disable-web-security', '--ozone-platform=x11', `--class=${placement}`],
})
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  const errors: string[] = []
  const tileFailures: string[] = []
  page.on('response', response => {
    if (response.status() >= 400)
      tileFailures.push(
        `${response.status()} ${new URL(response.url()).origin}${new URL(response.url()).pathname}`,
      )
  })
  page.on('requestfailed', request =>
    tileFailures.push(
      `${new URL(request.url()).origin}${new URL(request.url()).pathname}: ${request.failure()?.errorText}`,
    ),
  )
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(`${origin}/admin`, { timeout: 120000 })
  const session = await (
    await page.request.get(`${origin}/api/auth/get-session`)
  ).json()
  expect(session?.user?.id).toBe('hype-local-agent-admin')
  expect(new URL(page.url()).pathname).toMatch(/^\/admin/)

  await page.evaluate(async () => {
    const maplibre = await import('/node_modules/.vite/deps/maplibre-gl.js')
    const { installBrandLocationCanvas } = await import(
      '/src/lib/locations/brandLocationCanvas.ts'
    )
    maplibre.setWorkerUrl(
      (await import('/node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'))
        .default,
    )
    await import('/node_modules/maplibre-gl/dist/maplibre-gl.css')
    const container = document.createElement('div')
    Object.assign(container.style, { position: 'fixed', inset: '0', zIndex: '99999' })
    document.body.append(container)
    const map = new maplibre.Map({
      container,
      center: [114.16, 22.31],
      zoom: 9,
      renderWorldCopies: false,
      style: {
        version: 8,
        sources: {},
        layers: [
          {
            id: 'background',
            type: 'background',
            paint: { 'background-color': '#14202c' },
          },
        ],
      },
    })
    await new Promise(resolve => map.on('load', resolve))
    const mapErrors: string[] = []
    map.on('error', (event: any) =>
      mapErrors.push(event.error?.message ?? String(event)),
    )
    const renderer = installBrandLocationCanvas(map, () => {})
    const points = Array.from({ length: 625 }, (_, i) => ({
      id: String(i),
      name: `Place ${i}`,
      coordinates: [114.1 + (i % 25) * 0.005, 22.25 + Math.floor(i / 25) * 0.005],
      hype: i % 2 === 0,
      upstream: true,
      linked: i % 3 === 0,
    }))
    renderer.update(points)
    ;(window as any).clusterCheck = { map, renderer, points, mapErrors }
  })
  for (const zoom of [8, 10, 9, 12, 11, 8]) {
    await page.evaluate(async zoom => {
      const map = (window as any).clusterCheck.map
      map.jumpTo({ zoom })
      await new Promise(resolve => map.once('idle', resolve))
    }, zoom)
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const map = (window as any).clusterCheck.map
            if (!map.getLayer('brand-location-markers')) return 0
            const features = map.queryRenderedFeatures({
              layers: ['brand-location-markers'],
            })
            const unique = new Map(
              features.map((f: any) => [
                f.properties.cluster ? `c${f.properties.cluster_id}` : f.properties.id,
                f,
              ]),
            )
            return [...unique.values()].reduce(
              (total: number, f: any) => total + (f.properties.point_count ?? 1),
              0,
            )
          }),
        { timeout: 20000 },
      )
      .toBe(625)
  }
  await page.screenshot({ path: resolve(artifacts, 'clusters-all-625.png') })
  await page.evaluate(() => {
    const { map, renderer } = (window as any).clusterCheck
    renderer.update(
      [0, 1, 2].map(i => ({
        id: String(i),
        name: `Place ${i}`,
        coordinates: [114.16 + (i === 2 ? 0.0005 : 0), 22.31],
        hype: true,
        upstream: true,
        linked: false,
      })),
    )
    map.jumpTo({ center: [114.16, 22.31], zoom: 15 })
  })
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const features = (window as any).clusterCheck.map.queryRenderedFeatures({
            layers: ['brand-location-markers'],
          })
          return (
            features.length === 3 && features.every((f: any) => !f.properties.cluster)
          )
        }),
      { timeout: 20000 },
    )
    .toBe(true)
  await page.mouse.click(720, 500)
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const map = (window as any).clusterCheck.map
          return (
            Boolean(map.getLayer('brand-location-markers-expanded')) &&
            map.queryRenderedFeatures({ layers: ['brand-location-markers-expanded'] })
              .length
          )
        }),
      { timeout: 10000 },
    )
    .toBe(2)
  await page.screenshot({
    path: resolve(artifacts, 'coincident-locations-expanded.png'),
  })
  expect(await page.evaluate(() => (window as any).clusterCheck.mapErrors)).toEqual([])
  expect(errors).toEqual([])
} finally {
  await browser.close()
}
