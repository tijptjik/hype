// BROWSER
import { chromium } from 'playwright'
// NODE
import assert from 'node:assert/strict'
import { mkdir, readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
// MAP
import { MAP_STYLE_RENDER_VIEW } from '../../src/lib/map/styles/render.shared'
import { SELECTABLE_MAP_STYLE_CATALOG } from '../../src/lib/map/styles/catalog'
// TYPES
import type { Browser } from 'playwright'
import type { Map as MapLibreMap, StyleSpecification } from 'maplibre-gl'

type CheckWindow = Window & {
  maplibregl: typeof import('maplibre-gl')
  registrationCheck: { map: MapLibreMap; errors: string[]; missingImages: string[] }
}

const root = resolve(import.meta.dir, '../..')
// This manual dev-check script does not participate in Turbo's application cache.
const checkEnv: Record<string, string | undefined> = process.env
const origin = checkEnv.MAP_STYLE_CHECK_ORIGIN ?? 'http://127.0.0.1:4173'
const output = join(root, 'output/playwright')
const previews = join(root, 'static/mapStylePreviews')
const reports: Record<string, unknown>[] = []

/**
 * Captures a bundled preview from the registered style and actual Hong Kong tiles.
 * @param browser - Isolated headless browser owned by this dev-check.
 * @param key - Registered map style whose picker card needs a bundled image.
 * @returns Nothing; writes its clean 256px preview and records render evidence.
 */
async function capturePreview(
  browser: Browser,
  key: 'hype-dark' | 'hype-light',
): Promise<void> {
  const page = await browser.newPage({ viewport: { width: 256, height: 256 } })
  const errors: string[] = []
  let tileResponses = 0
  page.setDefaultTimeout(60_000)
  page.on('pageerror', error => errors.push(error.message))
  page.on('response', response => {
    const url = new URL(response.url())
    if (
      url.hostname === 'tiles.saanseoi.hk' &&
      /\/\d+\/\d+\/\d+/.test(url.pathname) &&
      response.ok()
    )
      tileResponses += 1
  })
  await page.route('https://tiles.saanseoi.hk/**', async route => {
    const response = await route.fetch({
      headers: { ...route.request().headers(), origin: 'http://hype.localhost' },
    })
    await route.fulfill({ response })
  })
  await page.route(`${origin}/__map-style-preview-check`, route =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><html><body style="margin:0"><div id="map" style="position:absolute;inset:0"></div></body></html>',
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
  await page.goto(`${origin}/__map-style-preview-check`)
  await page.addStyleTag({
    content: await readFile(
      join(root, 'node_modules/maplibre-gl/dist/maplibre-gl.css'),
      'utf8',
    ),
  })
  await page.addScriptTag({
    type: 'module',
    content:
      "import * as maplibregl from '/maplibre-dist/maplibre-gl.mjs'; window.maplibregl = maplibregl;",
  })
  await page.waitForFunction(() =>
    Boolean((window as unknown as CheckWindow).maplibregl),
  )
  await page.evaluate(
    async ({ key, view }) => {
      const w = window as unknown as CheckWindow
      const response = await fetch(`/api/mapStyles/${key}?inline=1`)
      if (!response.ok) throw new Error(`${key} returned ${response.status}`)
      const style = (await response.json()) as StyleSpecification
      // Inline JSON has no style-document URL for resolving local sprite namespaces.
      if (typeof style.sprite === 'string')
        style.sprite = new URL(style.sprite, location.origin).toString()
      else if (style.sprite)
        style.sprite = style.sprite.map(sprite => ({
          ...sprite,
          url: new URL(sprite.url, location.origin).toString(),
        }))
      const map = new w.maplibregl.Map({
        container: 'map',
        style,
        center: [view.lng, view.lat],
        zoom: view.zoom,
        bearing: view.bearing,
        pitch: view.pitch,
        attributionControl: false,
        fadeDuration: 0,
        preserveDrawingBuffer: true,
      })
      const state: CheckWindow['registrationCheck'] = {
        map,
        errors: [],
        missingImages: [],
      }
      w.registrationCheck = state
      map.on('error', event => state.errors.push(event.error.message))
      map.on('styleimagemissing', event => state.missingImages.push(event.id))
    },
    { key, view: MAP_STYLE_RENDER_VIEW },
  )
  await page.waitForFunction(() => {
    const { map, errors } = (window as unknown as CheckWindow).registrationCheck
    return (
      errors.length > 0 ||
      (map.isStyleLoaded() &&
        map.areTilesLoaded() &&
        map
          .queryRenderedFeatures()
          .some(feature => feature.source === 'hongkong-latest'))
    )
  })
  const evidence = await page.evaluate(() => {
    const { map, errors, missingImages } = (window as unknown as CheckWindow)
      .registrationCheck
    return {
      errors,
      missingImages,
      renderedFeatures: map
        .queryRenderedFeatures()
        .filter(feature => feature.source === 'hongkong-latest').length,
    }
  })
  assert.deepEqual(errors, [], `${key} JavaScript errors`)
  assert.deepEqual(evidence.errors, [], `${key} map errors`)
  assert.deepEqual(evidence.missingImages, [], `${key} missing sprites`)
  assert.ok(
    tileResponses > 0 && evidence.renderedFeatures > 0,
    `${key} did not render real vector tiles`,
  )
  await page.screenshot({ path: join(previews, `${key}.png`) })
  reports.push({ key, tileResponses, ...evidence })
  await page.close()
}

/**
 * Checks every displayed preview and independent style selection in the real picker.
 * @param browser - Isolated headless browser owned by this dev-check.
 * @returns Nothing; saves the dark-theme picker screenshot and selection evidence.
 */
async function checkPicker(browser: Browser): Promise<void> {
  const page = await browser.newPage({ viewport: { width: 390, height: 1000 } })
  const errors: string[] = []
  page.setDefaultTimeout(60_000)
  page.on('pageerror', error => errors.push(error.message))
  await page.route(`${origin}/__map-style-registration-check`, route =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><html data-theme="hype-black"><head><meta name="viewport" content="width=device-width,initial-scale=1"><script>globalThis.__sveltekit_dev={env:{}}</script><script type="module" src="/@vite/client"></script></head><body style="margin:0"><div id="app"></div><script type="module" src="/src/tests/fixtures/quercusStylePickerCheck.ts"></script></body></html>',
    }),
  )
  await page.goto(`${origin}/__map-style-registration-check`, {
    waitUntil: 'domcontentloaded',
  })
  await page
    .locator('input[type="radio"][value="quercus"]')
    .waitFor({ state: 'attached' })
  await page.getByRole('button', { name: 'Show more', exact: true }).click()
  const expectedCards = SELECTABLE_MAP_STYLE_CATALOG.filter(
    style => !style.projectCode,
  ).length
  const cards = page
    .locator('label')
    .filter({ has: page.locator('input[type="radio"][value]') })
    .filter({ has: page.locator('img') })
  assert.equal(
    await cards.count(),
    expectedCards,
    'Expected every selectable global map style',
  )
  await cards.locator('img').evaluateAll(images =>
    images.forEach(image => {
      ;(image as HTMLImageElement).loading = 'eager'
    }),
  )
  await page.waitForFunction(expectedCards => {
    const cards = [...document.querySelectorAll<HTMLLabelElement>('label')].filter(
      label =>
        label.querySelector('input[type="radio"][value]') && label.querySelector('img'),
    )
    return (
      cards.length === expectedCards &&
      cards.every(card => {
        const image = card.querySelector('img')
        return image?.complete && image.naturalWidth > 0
      })
    )
  }, expectedCards)
  const images = await cards.evaluateAll(labels =>
    labels.map(label => {
      const image = label.querySelector('img')
      const input = label.querySelector<HTMLInputElement>('input')
      return {
        key: input?.value,
        src: image?.getAttribute('src'),
        loaded: Boolean(image?.complete && image.naturalWidth > 0),
      }
    }),
  )
  for (const key of ['hype-dark', 'hype-light', 'quercus']) {
    const radio = cards.locator(`input[type="radio"][value="${key}"]`)
    await radio.locator('..').click()
    assert.equal(await radio.isChecked(), true, `${key} selection did not apply`)
    assert.equal(await page.evaluate(() => localStorage.getItem('hype-map-style')), key)
  }
  const selection = await page.evaluate(() => ({
    theme: document.documentElement.dataset.theme,
    mapStyle: localStorage.getItem('hype-map-style'),
    sync: localStorage.getItem('hype-sync-ui-map-styles'),
    horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
  }))
  assert.deepEqual(errors, [])
  assert.deepEqual(selection, {
    theme: 'hype-black',
    mapStyle: 'quercus',
    sync: 'false',
    horizontalOverflow: false,
  })
  await page.screenshot({
    path: join(output, 'map-style-registration.png'),
    fullPage: true,
  })
  reports.push({ picker: { images, selection, errors } })
  await page.close()
}

await Promise.all([
  mkdir(output, { recursive: true }),
  mkdir(previews, { recursive: true }),
])
const browser = await chromium.launch({
  headless: true,
  executablePath: checkEnv.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  args: ['--disable-web-security'],
})
try {
  for (const key of ['hype-dark', 'hype-light'] as const) {
    console.log(`[map-style-registration] Rendering ${key} preview`)
    await capturePreview(browser, key)
  }
  console.log(
    '[map-style-registration] Checking every featured preview and style selection',
  )
  await checkPicker(browser)
  console.log(JSON.stringify({ browserVersion: browser.version(), reports }, null, 2))
} finally {
  await browser.close()
}
