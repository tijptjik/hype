import { chromium, firefox } from 'playwright'
import { mkdir } from 'node:fs/promises'

const base = process.env.FEATURE_CHECK_URL ?? 'http://localhost:5175'
const directory = 'output/playwright/missing-feature-review'
await mkdir(directory, { recursive: true })
for (const [name, engine] of [
  ['chromium', chromium],
  ['firefox', firefox],
] as const) {
  const browser = await engine.launch({
    ...(name === 'chromium' ? { args: ['--disable-web-security'] } : {}),
  })
  try {
    for (const width of [1536, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 } })
      const errors: string[] = []
      page.on('pageerror', error => {
        errors.push(error.message)
        console.log('Page error:', error.message)
      })
      page.on('response', response => {
        if (response.status() >= 500)
          console.log('HTTP error:', response.status(), response.url())
      })
      page.on('console', message => {
        if (message.type() === 'error') console.log('Console error:', message.text())
      })
      await page.route('**/__new-feature-review.html*', route =>
        route.fulfill({
          contentType: 'text/html',
          body: '<html lang="en" data-theme="breadline-light"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>@layer theme,base,components,utilities;</style><script>globalThis.__sveltekit_dev={env:{}}</script></head><body><div id="app"></div><script type="module" src="/src/tests/fixtures/newFeatureReviewCheck.ts"></script></body></html>',
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
      await page.route('**/src/lib/api/user.remote.*', route => route.fulfill({
        contentType: 'application/javascript',
        body: `
          ${['searchUsers', 'getAdminUserProfile', 'getUserContributionPreviews', 'getUserContributedFeatures', 'getUserContributedImages', 'getUserDirectoryMetrics', 'getUser', 'updateUserProfile', 'getUserLayers', 'setUserLayerDefaults', 'getUserFeatures', 'addUserFeatureToList', 'removeUserFeatureFromList'].map(name => `export async function ${name}(){ return null }`).join('\n')}
          export async function getUserForAttribution({ id }) {
            return { id, name: id === 'report-submitter' ? 'Report Submitter' : 'Original Contributor', attribution: id, username: id, image: '/review-fixture/first' }
          }
        `,
      }))
      await page.goto(`${base}/__new-feature-review.html?missing`)
      await page.getByText('Building got cleaned up and sign removed', { exact: true }).waitFor({ timeout: 45000 })
      await page.getByRole('heading', { name: 'Distance from Feature', exact: true }).waitFor()
      const attribution = page.locator('.bits-feature-attribution-shell[data-open="true"]')
      await attribution.getByText('Report Submitter', { exact: true }).waitFor()
      if (await attribution.locator('img').getAttribute('alt') !== 'Report Submitter') throw Error('Wrong report avatar')
      if (await attribution.getByRole('link').getAttribute('href') !== '/admin/users/report-submitter') throw Error('Wrong report profile link')
      if (await page.getByText('Original Contributor', { exact: true }).count()) throw Error('Feature contributor shown for report')
      if (await page.getByRole('heading', { name: 'Address', exact: true }).count()) throw Error('Missing reports must not show the feature address')
      const metadata = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Distance from Feature', exact: true }) }).last()
      if ((await metadata.locator('dt').allTextContents()).join(',') !== 'Reported,Captured') throw Error('Report timestamps must share the distance metadata card')
      if (await page.getByRole('heading', { name: 'Title', exact: true }).count()) throw Error('Title should be replaced')
      if (await page.getByRole('heading', { name: 'Description', exact: true }).count()) throw Error('Description should be replaced')
      await page.getByRole('region', { name: 'Location context map', exact: true }).waitFor()
      const reportDot = page.getByRole('img', { name: 'Photo submitted with this report' })
      await reportDot.waitFor()
      if (await reportDot.count() !== 1) throw Error('Only the report photo should have a dot')
      const dotBounds = await reportDot.boundingBox()
      if (!dotBounds || dotBounds.width > 12 || dotBounds.height > 12) throw Error('Report marker is not a compact dot')
      if (await page.locator('[data-gallery-thumb-id]').getByText('NEW', { exact: true }).count()) throw Error('Large NEW badge remains')
      const thumbnails = page.locator('[data-gallery-thumb-id] button[aria-pressed]:not([title])')
      await thumbnails.nth(1).click()
      await page.waitForFunction(() => document.querySelectorAll('[data-gallery-thumb-id] button[aria-pressed]:not([title])')[1]?.getAttribute('aria-pressed') === 'true')
      if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw Error('Horizontal overflow')
      await metadata.locator('dd').last().scrollIntoViewIfNeeded()
      await page.screenshot({ path: `${directory}/${name}-${width}.png`, fullPage: true })
      await page.goto(`${base}/__new-feature-review.html`)
      const address = page.getByText('5–7 Sha Wan Drive, Sandy Bay', { exact: true })
      await address.waitFor()
      const layerSection = page.locator('section').filter({ has: address }).last()
      await layerSection.getByText('5–7 Sha Wan Drive, Sandy Bay', { exact: true }).waitFor()
      const selectorBounds = await layerSection.getByRole('combobox').boundingBox()
      const addressBounds = await address.boundingBox()
      if (!selectorBounds || !addressBounds || addressBounds.y <= selectorBounds.y + selectorBounds.height) throw Error('Address must sit beneath the layer selector')
      await address.scrollIntoViewIfNeeded()
      if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw Error('New feature address overflows')
      await page.screenshot({ path: `${directory}/new-feature-address-${name}-${width}.png`, fullPage: true })
      if (errors.length) throw Error(errors.join('\n'))
      console.log(`${name} ${width}: missing report layout and photo selection passed`)
      await page.close()
    }
  } finally { await browser.close() }
}
