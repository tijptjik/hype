// PLAYWRIGHT
import { chromium, firefox } from 'playwright'
// NODE
import assert from 'node:assert/strict'
import { mkdir, readFile } from 'node:fs/promises'
// IMAGES
import sharp from 'sharp'

const origin = process.env.HYPE_CHECK_ORIGIN ?? 'http://localhost:5175'
const output = 'output/playwright'
await mkdir(output, { recursive: true })
const sources = {
  square:
    '<svg width="100" height="100"><rect width="100" height="100" fill="white"/><rect x="20" y="20" width="60" height="60" fill="#fa8500"/></svg>',
  wide: '<svg width="800" height="100"><rect width="800" height="100" fill="#188c46"/><rect x="20" y="20" width="760" height="60" fill="#fa8500"/></svg>',
  bands:
    '<svg width="100" height="100"><rect width="100" height="50" fill="#e02020"/><rect y="50" width="100" height="50" fill="#2040e0"/><rect x="90" width="10" height="50" fill="#e0c020"/><rect x="90" y="50" width="10" height="50" fill="#20a040"/><rect x="20" y="20" width="60" height="60" fill="white"/></svg>',
  alpha:
    '<svg width="100" height="100"><rect x="20" y="20" width="60" height="60" fill="#fa8500"/></svg>',
  rim: '<svg width="200" height="200"><rect width="200" height="200" fill="#3333cc"/><path d="M0 200V0H200" fill="none" stroke="#3737cc" stroke-width="6"/><path d="M0 200V0H200" fill="none" stroke="#6464cc" stroke-width="4"/><path d="M0 200V0H200" fill="none" stroke="#a0a0cc" stroke-width="2"/><rect x="60" y="60" width="80" height="80" fill="white"/></svg>',
  crisp:
    '<svg width="256" height="256"><rect width="256" height="256" fill="white"/><rect x="1" y="1" width="254" height="254" fill="#3333cc"/></svg>',
}
const assets = new Map<string, Buffer>(
  await Promise.all(
    Object.entries(sources).map(
      async ([key, svg]) =>
        [
          `__edge-${key}.png`,
          await sharp(
            Buffer.from(
              svg.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" '),
            ),
          )
            .png()
            .toBuffer(),
        ] as const,
    ),
  ),
)
const referenceImage = process.env.HYPE_EDGE_REFERENCE_IMAGE
if (referenceImage) assets.set('__edge-eunic.webp', await readFile(referenceImage))

for (const [name, engine, deviceScaleFactor] of [
  ['chromium', chromium, 1],
  ['firefox', firefox, 1],
  ['chromium-2x', chromium, 2],
  ['firefox-2x', firefox, 2],
] as const) {
  const browser = await engine.launch({ headless: true })
  try {
    const page = await browser.newPage({
      viewport: { width: 1280, height: 960 },
      deviceScaleFactor,
    })
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.route('https://images.test/**', route => {
      const asset = assets.get(new URL(route.request().url()).pathname.slice(1))
      assert(asset)
      // Intentionally omit CORS headers: casting must work for ordinary <img> sources.
      return route.fulfill({ contentType: 'image/png', body: asset })
    })
    await page.route('**/api/images/presentation-source?*', route => {
      const source = new URL(new URL(route.request().url()).searchParams.get('src')!)
      if (source.hostname !== 'images.test') return route.continue()
      const asset = assets.get(source.pathname.slice(1))
      assert(asset)
      return route.fulfill({
        contentType: source.pathname.endsWith('.webp') ? 'image/webp' : 'image/png',
        body: asset,
      })
    })
    await page.route('**/__image-presentation.html*', route =>
      route.fulfill({
        contentType: 'text/html',
        body: '<html data-theme="hype-light"><head><script>globalThis.__sveltekit_dev={env:{}}</script></head><body><div id="app"></div><script type="module" src="/src/tests/fixtures/imagePresentationCheck.ts"></script></body></html>',
      }),
    )
    await page.route('**/_app/remote/**', route => {
      errors.push('Unexpected application data request')
      return route.abort()
    })
    const referenceSource = process.env.HYPE_EDGE_REFERENCE_SOURCE
    if (referenceSource && referenceImage) {
      // Native image loading under headless local-host policies uses the captured
      // immutable bytes; the same-origin analysis request still exercises the live reader.
      await page.route(referenceSource, route =>
        route.fulfill({
          contentType: 'image/webp',
          body: assets.get('__edge-eunic.webp')!,
        }),
      )
    }
    await page.goto(
      `${origin}/__image-presentation.html${referenceSource ? `?reference=${encodeURIComponent(referenceSource)}` : ''}`,
    )
    const trigger = () => page.getByRole('button', { name: /^Image presentation:/ })
    await trigger().waitFor()

    /**
     * Reads a painted pixel relative to one of the real rendered image surfaces.
     * @param surface - Test fixture surface identifier.
     * @param x - Horizontal position as a proportion of its width.
     * @param y - Vertical position as a proportion of its height.
     * @returns RGB screenshot sample.
     */
    async function pixel(surface: string, x: number, y: number): Promise<number[]> {
      const png = await page.getByTestId(surface).screenshot()
      const { data, info } = await sharp(png)
        .removeAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true })
      const offset =
        (Math.floor(info.height * y) * info.width + Math.floor(info.width * x)) *
        info.channels
      return [...data.subarray(offset, offset + 3)]
    }

    /**
     * Waits for replacement images and the viewer's staged decode transition.
     * @returns Completion after visible image elements have loaded and scenes settle.
     */
    async function settle(): Promise<void> {
      await page
        .waitForFunction(() =>
          Array.from(document.images).every(
            image => image.complete && image.naturalWidth > 0,
          ),
        )
        .catch(async error => {
          console.log(
            'Image failure',
            errors,
            await page.evaluate(() =>
              Array.from(document.images).map(image => ({
                src: image.src.slice(0, 160),
                complete: image.complete,
                width: image.naturalWidth,
              })),
            ),
          )
          throw error
        })
      await page.waitForTimeout(650)
    }

    // Keyboard selection must expose a radio menu, save once and return focus.
    await trigger().focus()
    await page.keyboard.press('Enter')
    const edgesOption = page.getByRole('menuitemradio', { name: /Full · Cast Edges/ })
    await edgesOption.waitFor()
    await page.screenshot({ path: `${output}/image-presentation-picker-${name}.png` })
    await page.keyboard.press('End')
    await page.keyboard.press('Enter')
    await settle()
    assert.equal(await page.getByLabel('Saved mode').textContent(), 'cast-edges')
    assert.equal(await page.getByLabel('Save count').textContent(), '1')
    assert(await trigger().evaluate(element => element === document.activeElement))

    // A white-bordered logo should have seamless white extensions on all surfaces.
    for (const surface of ['card', 'stage', 'surface']) {
      const sample = await pixel(surface, 0.04, 0.25)
      assert(
        sample.every(channel => channel >= 253),
        `${name} ${surface}: white edge ${sample}`,
      )
    }
    await page.screenshot({ path: `${output}/image-presentation-edges-${name}.png` })

    // Real grid cards have fractional content heights. Casts must reach the same
    // first painted row as the foreground, including on high-density displays.
    const fractionalCard = page.getByTestId('fractional-card')
    for (const width of [361, 363, 363.4, 364, 377]) {
      await fractionalCard.evaluate((element, width) => {
        element.style.width = `${width}px`
      }, width)
      await page.waitForTimeout(80)
      const strip = await fractionalCard.screenshot()
      const { data, info } = await sharp(strip)
        .removeAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true })
      const foregroundOffset = 100 * deviceScaleFactor * info.channels
      const foreground = [...data.subarray(foregroundOffset, foregroundOffset + 3)]
      for (const x of [25, width - 25]) {
        const castOffset = Math.floor(x * deviceScaleFactor) * info.channels
        const cast = [...data.subarray(castOffset, castOffset + 3)]
        assert(
          cast.every((channel, i) => Math.abs(channel - foreground[i]) <= 2),
          `${name} ${width}px: top row at ${x} ${cast} / ${foreground}`,
        )
      }
    }
    await fractionalCard.screenshot({
      path: `${output}/image-presentation-top-fixed-${name}.png`,
    })

    // Each edge retains its varying colours rather than becoming an average fill.
    await page.getByRole('button', { name: 'Colour bands', exact: true }).click()
    await settle()
    for (const surface of ['card', 'stage', 'surface']) {
      const top = await pixel(surface, 0.04, 0.25)
      const bottom = await pixel(surface, 0.04, 0.75)
      assert(top[0] > 200 && top[2] < 60, `${name} ${surface}: red edge ${top}`)
      assert(
        bottom[2] > 200 && bottom[0] < 60,
        `${name} ${surface}: blue edge ${bottom}`,
      )
      const rightTop = await pixel(surface, 0.96, 0.25)
      const rightBottom = await pixel(surface, 0.96, 0.75)
      assert(
        rightTop[0] > 200 && rightTop[1] > 170 && rightTop[2] < 60,
        `${name} ${surface}: yellow right edge ${rightTop}`,
      )
      assert(
        rightBottom[1] > 140 && rightBottom[0] < 60 && rightBottom[2] < 85,
        `${name} ${surface}: green right edge ${rightBottom}`,
      )
    }

    // Thin pale rims must not become full-width bands on either side.
    await page.getByRole('button', { name: 'Export rim', exact: true }).click()
    await settle()
    assert.match(
      (await page
        .getByAltText('Example logo')
        .first()
        .getAttribute('data-rim-bounds')) ?? '',
      /^3,3,/,
    )
    for (const surface of ['card', 'stage', 'surface']) {
      for (const x of [0.04, 0.96]) {
        const sample = await pixel(surface, x, 0.4)
        assert(
          sample[0] < 65 && sample[1] < 65 && sample[2] > 190,
          `${name} ${surface}: export rim ${sample}`,
        )
      }
    }
    if (referenceImage) {
      await page.getByRole('button', { name: 'EUNIC logo', exact: true }).click()
      await settle()
      await page
        .getByTestId('card')
        .locator('img[data-rim-bounds]')
        .waitFor({ state: 'attached', timeout: 15000 })
      const detected = (
        await page.getByAltText('Example logo').first().getAttribute('data-rim-bounds')
      )
        ?.split(',')
        .map(Number)
      assert(
        detected && detected[0] > 0 && detected[1] > 0,
        `${name}: EUNIC rim bounds ${detected}`,
      )
      for (const surface of ['card', 'stage', 'surface']) {
        const left = await pixel(surface, 0.04, 0.4)
        const right = await pixel(surface, 0.96, 0.4)
        assert(
          left.every((channel, i) => Math.abs(channel - right[i]) < 12),
          `${name} ${surface}: EUNIC sides ${left} / ${right}`,
        )
        assert(
          left[0] < 70 && left[1] < 70 && left[2] > 190,
          `${name} ${surface}: EUNIC rim ${left}`,
        )
        const box = (await page.getByTestId(surface).boundingBox())!
        const pictureLeft = (box.width - Math.min(box.width, box.height)) / 2
        const foregroundEdge = await pixel(
          surface,
          (Math.ceil(pictureLeft) + 0.5) / box.width,
          0.4,
        )
        assert(
          foregroundEdge[0] < 70 && foregroundEdge[1] < 70 && foregroundEdge[2] > 190,
          `${name} ${surface}: clipped foreground ${foregroundEdge}`,
        )
      }
      await page.screenshot({ path: `${output}/image-presentation-eunic-${name}.png` })
    }

    await page.getByRole('button', { name: 'Intentional border', exact: true }).click()
    await settle()
    assert.equal(
      await page.getByAltText('Example logo').first().getAttribute('data-rim-bounds'),
      '0,0,256,256',
    )

    // Wide sources must cast vertically instead of horizontally.
    await page.getByRole('button', { name: 'Wide image', exact: true }).click()
    await settle()
    for (const surface of ['card', 'stage', 'surface']) {
      for (const y of [0.06, 0.94]) {
        const sample = await pixel(surface, 0.25, y)
        assert(
          sample[1] > 125 && sample[0] < 40 && sample[2] < 85,
          `${name} ${surface}: green edge ${sample}`,
        )
      }
    }

    // The corresponding first/last-column seams must also stay filled when casting vertically.
    for (const width of [363.4, 364]) {
      await fractionalCard.evaluate((element, width) => {
        element.style.width = `${width}px`
      }, width)
      await page.waitForTimeout(80)
      const { data, info } = await sharp(await fractionalCard.screenshot())
        .removeAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true })
      for (const x of [0, Math.floor(width * deviceScaleFactor) - 1]) {
        const offset = (25 * deviceScaleFactor * info.width + x) * info.channels
        const sample = [...data.subarray(offset, offset + 3)]
        assert(
          sample[1] > 125 && sample[0] < 40 && sample[2] < 85,
          `${name} ${width}px: outer column ${x}: ${sample}`,
        )
      }
    }

    // Transparent borders must reveal the same theme surface as transparent source pixels.
    await page.getByRole('button', { name: 'Transparent logo', exact: true }).click()
    await settle()
    for (const surface of ['card', 'stage', 'surface']) {
      const edge = await pixel(surface, 0.04, 0.25)
      const inside = await pixel(surface, 0.5, 0.06)
      assert(
        edge.every((channel, i) => Math.abs(channel - inside[i]) <= 2),
        `${name} ${surface}: alpha ${edge} / ${inside}`,
      )
    }

    // Transparent edges also preserve the dark theme surface.
    await page.evaluate(() => (document.documentElement.dataset.theme = 'hype-dark'))
    for (const surface of ['card', 'stage', 'surface']) {
      const edge = await pixel(surface, 0.04, 0.25)
      const inside = await pixel(surface, 0.5, 0.06)
      assert(
        edge.every((channel, i) => Math.abs(channel - inside[i]) <= 2),
        `${name} ${surface}: dark alpha ${edge} / ${inside}`,
      )
    }
    await page.screenshot({ path: `${output}/image-presentation-dark-${name}.png` })
    await page.evaluate(() => (document.documentElement.dataset.theme = 'hype-light'))

    // Existing choices remain available and readonly editors cannot open the picker.
    await trigger().click()
    await page.getByRole('menuitemradio', { name: /^Cover/ }).click()
    await settle()
    assert.equal(await page.getByLabel('Saved mode').textContent(), 'cover')
    await trigger().click()
    await page.getByRole('menuitemradio', { name: /Full · Blur/ }).click()
    await settle()
    assert.equal(await page.getByLabel('Saved mode').textContent(), 'contain')
    await page.getByRole('button', { name: 'Toggle readonly', exact: true }).click()
    assert(await trigger().isDisabled())
    await page.getByRole('button', { name: 'Toggle readonly', exact: true }).click()

    await page.setViewportSize({ width: 390, height: 844 })
    await page.getByRole('button', { name: 'Square logo', exact: true }).click()
    await trigger().click()
    const menu = page.getByRole('menu')
    const bounds = await menu.boundingBox()
    assert(bounds && bounds.x >= 0 && bounds.x + bounds.width <= 391)
    await page.getByRole('menuitemradio', { name: /Full · Cast Edges/ }).click()
    await settle()
    await page.screenshot({
      path: `${output}/image-presentation-mobile-${name}.png`,
      fullPage: true,
    })
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    assert.deepEqual(errors, [])
    console.log(
      `${name}: edge pixels, resizing, transparency, cross-origin images, picker keyboard/focus, legacy modes and readonly state passed`,
    )
  } finally {
    await browser.close()
  }
}
