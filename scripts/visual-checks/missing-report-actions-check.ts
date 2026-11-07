import { chromium, firefox } from 'playwright'
import { mkdir } from 'node:fs/promises'

const base = process.env.FEATURE_CHECK_URL ?? 'http://localhost:5175'
const directory = 'output/playwright/missing-report-actions'
await mkdir(directory, { recursive: true })
for (const [name, engine] of [
  ['chromium', chromium],
  ['firefox', firefox],
] as const) {
  if (process.env.REPORT_HELP_BROWSER && process.env.REPORT_HELP_BROWSER !== name) continue
  const browser = await engine.launch({
    ...(name === 'chromium' ? { args: ['--disable-web-security'] } : {}),
  })
  try {
    for (const variant of [
      { type: 'reportedMissing', legacy: false, labels: ['Reject', 'Permanently Unavailable', 'Unpublish', 'Delete'] },
      { type: 'newFeature', legacy: false, labels: ['Reject', 'Resolve duplicate', 'Accept'] },
      { type: 'newPhoto', legacy: false, labels: ['Reject', 'Accept'] },
      { type: 'newPhoto', legacy: true, labels: ['Reject', 'Accept All', 'Accept Classified'] },
    ]) {
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
      await page.goto(`${base}/__new-feature-review.html?missing&missing-info&help-type=${variant.type}${variant.legacy ? "&legacy" : ""}`)
      const dialog = page.getByRole('dialog')
      await dialog.waitFor({ timeout: 45000 })
      for (const label of variant.labels) {
        await dialog.getByText(label, { exact: true }).waitFor()
      }
      if (await dialog.getByText('INTANGIBILISE', { exact: true }).count()) throw Error('Old terminology remains')
      if (variant.type === 'reportedMissing') await dialog.getByText('This does not permanently erase its stored record.', { exact: false }).waitFor()
      if (await dialog.getByRole('button', { name: 'Tips', exact: true }).count()) throw Error('Old photo tabs remain')
      const cards = dialog.locator('section > div.space-y-3 > div')
      if (await cards.count() !== variant.labels.length || await cards.locator('svg').count() !== variant.labels.length) throw Error('Each action needs its icon')
      if (await dialog.evaluate(node => node.scrollWidth > node.clientWidth)) throw Error('Dialog overflows horizontally')
      await page.screenshot({ path: `${directory}/${variant.type}${variant.legacy ? "-legacy" : ""}-${name}-${width}.png`, fullPage: true })
      await dialog.getByRole('button', { name: 'Close task information' }).click()
      await dialog.waitFor({ state: 'hidden' })
      if (errors.length) throw Error(errors.join('\n'))
      console.log(`${variant.type}${variant.legacy ? " legacy" : ""} ${name} ${width}: actions, icons and dismissal passed`)
      await page.close()
    }
    }
  } finally { await browser.close() }
}
