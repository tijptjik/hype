import assert from 'node:assert/strict'
import { chromium, firefox } from 'playwright'
import { mkdir } from 'node:fs/promises'
const base = process.env.HYPE_CHECK_ORIGIN ?? 'http://localhost:5175'
const dark = process.env.TASK_WORKSPACE_DARK === '1'
const output = `output/playwright/task-workspace${dark ? '/dark' : ''}`
await mkdir(output, { recursive: true })
for (const [name, engine] of [
  ['chromium', chromium],
  ['firefox', firefox],
] as const) {
  const browser = await engine.launch({
    headless: true,
    ...(name === 'chromium' ? { args: ['--disable-web-security'] } : {}),
  })
  try {
    for (const width of [1536, 390]) {
      for (const type of [
        'newFeature',
        'reportedMissing',
        'newPhoto',
        'locationFacts',
        'locationPosition',
        'locationIdentity',
        'locationMerge',
      ]) {
        if (dark && type !== 'newFeature') continue
        const page = await browser.newPage({ viewport: { width, height: 1000 } })
        const errors: string[] = []
        page.on('pageerror', error => {
          errors.push(error.message)
          console.error(error.message)
        })
        await page.route('**/__new-feature-review.html*', route =>
          route.fulfill({
            contentType: 'text/html',
            body: '<html lang="en" data-theme="breadline-light"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>@layer theme,base,components,utilities;</style><script>globalThis.__sveltekit_dev={env:{}}</script></head><body><div id="app"></div><script type="module" src="/src/tests/fixtures/newFeatureReviewCheck.ts"></script></body></html>'.replace(
              'breadline-light',
              dark ? 'hype-dark' : 'breadline-light',
            ),
          }),
        )
        await page.route('**/src/lib/api/featureRevisions.remote.*', route =>
          route.fulfill({
            contentType: 'application/javascript',
            body: `
          export async function getFeatureGalleryRevisionEditor() {
            return { enabled: true, comparisonRevisionId: 'fixture', locales: ['en', 'zh-Hant'],
              gallery: { order: ['first', 'second'], entries: Object.fromEntries(['first', 'second'].map(id => [id, { caption: { en: 'Photo caption', 'zh-Hant': '相片說明' }, alt: {} }])) } };
          }
          ${['getFeatureRevisionWorkspace', 'getFeaturePublicationReview', 'saveFeatureTranslationDraft', 'submitFeatureTranslationDraft', 'publishFeatureTranslationRevision', 'decideFeatureTranslationRevision', 'getFeatureFormRevisionReview', 'publishFeatureFormRevision', 'saveFeatureGalleryRevision', 'getFeaturePrivateReview'].map(name => `export async function ${name}() { return { enabled: false }; }`).join('\n')}
        `,
          }),
        )
        await page.route('**/review-fixture/**', route => {
          if (
            !route.request().url().includes('first') &&
            !route.request().url().includes('second')
          )
            return route.continue()
          return route.fulfill({
            contentType: 'image/svg+xml',
            body: `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="600"><rect width="900" height="600" fill="${route.request().url().includes('first') ? '#557766' : '#887755'}"/></svg>`,
          })
        })
        await page.route('https://tiles.saanseoi.hk/**', route =>
          route.fulfill({
            contentType: 'application/json',
            body: JSON.stringify({
              tilejson: '3.0.0',
              tiles: ['https://review-map.invalid/{z}/{x}/{y}.pbf'],
              minzoom: 0,
              maxzoom: 14,
            }),
          }),
        )
        await page.route('https://review-map.invalid/**', route =>
          route.fulfill({ status: 204, body: '' }),
        )

        await page.goto(
          `${base}/__new-feature-review.html?pending&legacy&type=${type}`,
          { waitUntil: 'domcontentloaded' },
        )
        const workspace = page.locator('[data-task-workspace]')
        await workspace.waitFor()
        await page.waitForTimeout(350)
        const original = await workspace.elementHandle()
        const imagePane = await page.locator('[data-task-image-pane]').elementHandle()
        const mapPane =
          type === 'newPhoto'
            ? null
            : await page.locator('[data-task-map-pane]').elementHandle()
        const strip = page.locator('[data-image-thumbnail-strip]')
        const before = await page.locator('[data-task-image-pane]').boundingBox()
        assert(before && before.height > 100)
        if (type !== 'newPhoto')
          assert.equal(
            await strip.evaluate(node => node.getBoundingClientRect().height),
            128,
          )
        if (type === 'newFeature' && width > 900) {
          const separator = page.locator(
            '[role=separator][aria-orientation=vertical][aria-label="Resize map and image section"]',
          )
          await separator.focus()
          await separator.press('ArrowRight')
          assert.equal(await separator.getAttribute('aria-valuenow'), '55')
        }
        if (
          ['newFeature', 'newPhoto', 'reportedMissing', 'locationFacts'].includes(type)
        )
          await page.screenshot({
            path: `${output}/${name}-${width}-${type}-pending.png`,
          })
        const beforeResolve = await page.locator('[data-task-image-pane]').boundingBox()
        await page.getByRole('button', { name: 'Resolve task', exact: true }).click()
        await page.waitForFunction(() => !document.querySelector('[data-task-loading]'))
        await page.waitForTimeout(350)
        assert(
          await original?.evaluate(node => node.isConnected),
          'Workspace remounted',
        )
        assert(
          await imagePane?.evaluate(node => node.isConnected),
          'Image pane remounted',
        )
        if (mapPane)
          assert(await mapPane.evaluate(node => node.isConnected), 'Map pane remounted')
        if (type !== 'newPhoto')
          assert.equal(
            await strip.evaluate(node => node.getBoundingClientRect().height),
            128,
            'Thumbnail strip shifted',
          )
        const after = await page.locator('[data-task-image-pane]').boundingBox()
        assert(after && beforeResolve)
        assert(
          Math.abs(after.width - beforeResolve.width) < 2,
          'Split width changed on resolution',
        )
        if (type === 'newFeature' && width > 900)
          assert.equal(
            await page
              .locator(
                '[role=separator][aria-orientation=vertical][aria-label="Resize map and image section"]',
              )
              .getAttribute('aria-valuenow'),
            '55',
          )
        assert.equal(
          await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
          false,
          'Horizontal overflow',
        )
        assert.deepEqual(errors, [])
        if (
          ['newFeature', 'newPhoto', 'reportedMissing', 'locationFacts'].includes(type)
        )
          await page.screenshot({
            path: `${output}/${name}-${width}-${type}-ready.png`,
          })
        console.log(
          `${name} ${width} ${type}: persistent workspace and media panes, reserved rail; image height ${Math.round(beforeResolve.height)} -> ${Math.round(after.height)}`,
        )
        await page.close()
      }
    }
  } finally {
    await browser.close()
  }
}
