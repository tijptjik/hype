import { strict as assert } from 'node:assert'
import { browserCases } from './lib/browser-cases'

const html =
  '<html lang="en" data-theme="breadline-light"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>@layer theme,base,components,utilities;</style><script>globalThis.__sveltekit_dev={env:{}}</script></head><body><div id="app"></div><script type="module" src="/src/tests/fixtures/resourceChangelogCheck.ts"></script></body></html>'
for await (const { name, browser } of browserCases()) {
  const page = await browser.newPage()
  await page.route('**/__changelog-images.html*', route =>
    route.fulfill({ contentType: 'text/html', body: html }),
  )
  await page.route('**/api/images/revisions/**', route =>
    route.request().url().includes('unavailable-revision')
      ? route.fulfill({ status: 404, body: 'Unavailable' })
      : route.fulfill({
          contentType: 'image/png',
          body: Buffer.from(
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
            'base64',
          ),
        }),
  )
  await page.goto(
    `${process.env.CHANGELOG_CHECK_URL ?? 'http://127.0.0.1:4173'}/__changelog-images.html?images`,
  )
  const row = page.locator('details[data-change-key="first-0"]')
  await row.locator(':scope > summary').click()
  await row.getByText('Historical image unavailable', { exact: true }).waitFor()
  await row.getByText('Cover', { exact: true }).waitFor()
  await row.getByText('Full · Cast Edges', { exact: true }).waitFor()
  const previews = row.getByRole('img', { name: 'Updated image', exact: true })
  assert.equal(await previews.count(), 2)
  assert.ok(
    await previews
      .first()
      .evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0),
  )
  assert.equal(
    await row
      .getByText('Exact historical preview unavailable', { exact: true })
      .count(),
    1,
  )
  assert.equal(await row.getByText('Image reference', { exact: true }).count(), 0)
  assert.equal(await row.getByText('legacy-image', { exact: true }).count(), 0)
  const toggles = row.getByRole('button', { name: 'Image metadata', exact: true })
  assert.equal(await toggles.count(), 3)
  await toggles.nth(1).click()
  await row.getByText('legacy-image', { exact: true }).waitFor()
  await row.getByText('fixture-image', { exact: true }).waitFor()
  await toggles.nth(1).click()
  assert.equal(await row.getByText('legacy-image', { exact: true }).count(), 0)
  assert.equal(await row.getByText('fixture-image', { exact: true }).count(), 0)
  await toggles.first().click()
  assert.equal(await row.getAttribute('open'), '')
  await row.getByText('fixture-revision', { exact: true }).first().waitFor()
  console.log(
    name +
      ': pinned preview, matching image ID, legacy fallback, failed load and reference disclosure passed',
  )
}
