import { chromium } from 'playwright'
const browser = await chromium.launch({
  executablePath: '/home/io/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome',
  args: ['--disable-web-security'],
})
try {
  const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } })
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
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
  await search.fill('Tai Hing Hse')
  const rows = page.locator('[data-result-id]')
  await rows.first().waitFor({ timeout: 60000 })
  await page.waitForTimeout(1500)
  const group = rows.filter({ hasText: /\d+ addresses/ }).first()
  await group.click()
  await rows.first().focus()
  await page.getByRole('button', { name: 'Back to results', exact: true }).waitFor()
  await page.waitForTimeout(250)
  await rows.first().focus()
  await page.keyboard.press('Shift+Tab')
  console.log('focused', await page.evaluate(() => document.activeElement?.outerHTML))
  if (
    !(await page
      .getByRole('button', { name: 'Back to results', exact: true })
      .evaluate(e => e === document.activeElement))
  )
    throw Error('Subset back not focused')
  const nav = page.locator('[data-facet-nav]:visible')
  const manual = page.getByRole('button', { name: 'Add Manual Entry', exact: true })
  const n = (await nav.boundingBox())!,
    m = (await manual.boundingBox())!
  if (Math.abs(m.x + m.width / 2 - (n.x + n.width / 2)) > 1)
    throw Error('Manual action off center ' + JSON.stringify({ n, m }))
  await rows.last().focus()
  const last = (await rows.last().boundingBox())!
  if (last.y + last.height > m.y) throw Error('Footer overlaps last row')
  await rows.first().click()
  const firstId = await rows.first().getAttribute('data-result-id')
  const actions = page.locator(`[data-result-actions="${firstId}"]`)
  await actions.getByRole('button', { name: 'Use Address', exact: true }).waitFor()
  if (!(await rows.first().isVisible())) throw Error('Preview replaced list')
  await page.screenshot({ path: 'output/playwright/feature-inline-address.png' })
  await page.getByRole('button', { name: 'Place filters', exact: true }).click()
  const panel = page.getByRole('dialog', { name: 'Place filters', exact: true })
  await panel.getByRole('textbox', { name: 'Category', exact: true }).fill('abortion')
  await panel.getByRole('button', { name: 'Abortion Clinic', exact: true }).click()
  await panel.getByRole('button', { name: 'Operating status', exact: true }).click()
  if (!(await panel.getByRole('radio', { name: 'Open', exact: true }).isChecked()))
    throw Error('Open is not default')
  await page.screenshot({ path: 'output/playwright/feature-taxonomy-browser.png' })
  await panel.getByRole('button', { name: 'Apply filters', exact: true }).click()
  await page.waitForTimeout(1500)
  if (await page.locator('[data-result-kind="address"]').count())
    throw Error('Category filter retained address matches')
  await page.getByRole('button', { name: 'Place filters', exact: true }).click()
  await panel.getByRole('button', { name: 'Reset filters', exact: true }).click()
  await rows.first().waitFor({ timeout: 60000 })
  await search.fill('Tai Hing')
  const place = page.locator('[data-result-kind="establishment"]').first()
  await place.waitFor({ timeout: 60000 })
  const id = await place.getAttribute('data-result-id')
  const buttons = page.locator(`[data-result-actions="${id}"]`)
  await buttons.getByRole('button', { name: 'Link Place', exact: true }).waitFor()
  await buttons
    .getByRole('button', { name: 'Link and use Name', exact: true })
    .waitFor()
  await page.screenshot({ path: 'output/playwright/feature-inline-place.png' })
  if (errors.length) throw Error(errors.join('\n'))
  console.log(
    JSON.stringify({
      subsetBack: true,
      footerCentered: true,
      footerClearance: true,
      inlineActions: true,
      categoryClearsAddresses: true,
      defaultOpen: true,
      resetReruns: true,
      errors,
    }),
  )
} finally {
  await browser.close()
}
