import { chromium } from 'playwright'
const browser = await chromium.launch({
  executablePath: '/home/io/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome',
  args: ['--disable-web-security'],
})
try {
  const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } })
  const errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  await page.goto('http://127.0.0.1:4174/admin/features/new', {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  })
  await page
    .getByRole('button', { name: 'Find an existing Place', exact: true })
    .click({ timeout: 60000 })
  const search = page.getByRole('textbox', {
    name: 'Search for a Location',
    exact: true,
  })
  await search.fill('curios')
  const rows = page.locator('[data-result-id]')
  await rows.first().waitFor({ timeout: 60000 })
  await page.waitForTimeout(3000)
  console.log('initial', await rows.allTextContents())
  const group = rows.filter({ hasText: /\d+ addresses/ }).first()
  await group.click()
  await page.waitForTimeout(300)
  console.log('subset', await rows.allTextContents())
  const count = await rows.count()
  for (let i = 0; i < count; i++) {
    await rows.nth(i).focus()
    const bounds = await rows.nth(i).boundingBox()
    const footer = await page
      .getByRole('button', { name: 'Add Manual Location', exact: true })
      .boundingBox()
    if (!bounds || !footer || bounds.y + bounds.height > footer.y) {
      await page.screenshot({ path: 'output/playwright/feature-discovery-overlap.png' })
      console.log(
        await page
          .locator(
            '[data-facet-id=address], [data-address-scroll], [data-address-scroll] section, [data-facet-id=address] .bits-main__section-body',
          )
          .evaluateAll(es =>
            es.map(e => ({
              tag: e.tagName,
              cls: e.className,
              rect: e.getBoundingClientRect().toJSON(),
              style: e.getAttribute('style'),
            })),
          ),
      )
      throw Error('Result overlaps footer: ' + JSON.stringify({ i, bounds, footer }))
    }
  }
  await rows.first().click()
  await page.getByRole('button', { name: 'Use Address', exact: true }).waitFor()
  if (await page.locator('[data-address-scroll] input:visible').count())
    throw Error('Preview revealed editable fields')
  await page.screenshot({ path: 'output/playwright/feature-discovery-grouping.png' })
  await page.getByRole('button', { name: 'Use Address', exact: true }).click()
  await page.waitForTimeout(300)
  await page.screenshot({ path: 'output/playwright/feature-discovery-accepted.png' })
  await page.getByRole('button', { name: 'Add Manual Location', exact: true }).click()
  await search.fill('Tai Hing')
  const place = page.locator('[data-result-kind="establishment"]').first()
  await place.waitFor({ timeout: 60000 })
  const readNames = async () => {
    await page.getByRole('button', { name: 'Profile', exact: true }).click()
    const fields = page.locator('[data-facet-id="core"] input[type="text"]')
    if (!(await fields.count())) throw Error('No profile name fields found')
    const values = await fields.evaluateAll(es =>
      es.map(e => (e as HTMLInputElement).value),
    )
    await page.getByRole('button', { name: 'Location', exact: true }).click()
    return values
  }
  const before = await readNames()
  await place.click()
  await page.getByRole('button', { name: 'Use Place', exact: true }).waitFor()
  const preview = await readNames()
  if (JSON.stringify(before) !== JSON.stringify(preview))
    throw Error('Preview changed names')
  await page.getByRole('button', { name: 'Use Place', exact: true }).click()
  const acceptedNames = await readNames()
  await page.getByRole('button', { name: 'Unlink', exact: true }).click()
  const unlinkedNames = await readNames()
  if (JSON.stringify(acceptedNames) !== JSON.stringify(unlinkedNames))
    throw Error('Unlink discarded copied names')
  await page.screenshot({ path: 'output/playwright/feature-discovery-unlinked.png' })
  console.log(
    JSON.stringify({
      subsetCount: count,
      previewPreservedNames: true,
      unlinkPreservedNames: true,
      errors,
    }),
  )
  if (errors.length) throw Error(errors.join('\n'))
} finally {
  await browser.close()
}
