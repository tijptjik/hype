import { chromium } from 'playwright'
const browser = await chromium.launch({
  executablePath: '/home/io/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome',
  args: ['--disable-web-security'],
})
try {
  const page = await browser.newPage({ viewport: { width: 1320, height: 1050 } })
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(
    `${process.env.FEATURE_CHECK_URL ?? 'http://127.0.0.1:4173'}/admin/features/new`,
    { waitUntil: 'domcontentloaded', timeout: 60000 },
  )
  const find = page.getByRole('button', { name: 'Find an existing Place', exact: true })
  await page
    .locator('canvas.maplibregl-canvas')
    .waitFor({ state: 'attached', timeout: 60000 })
  await find.waitFor({ timeout: 60000 })
  const add = page.getByRole('button', { name: 'Add your own', exact: true })
  const [findBox, addBox] = await Promise.all([find.boundingBox(), add.boundingBox()])
  if (!findBox || !addBox || addBox.x >= findBox.x)
    throw Error('Unexpected button order')
  const colour = await find.evaluate(button => getComputedStyle(button).color)
  if (colour !== 'rgb(255, 255, 255)') throw Error(`Primary text colour: ${colour}`)
  await page.getByText('Find a place to use its address', { exact: true }).waitFor()
  const parentSections = page.locator('.bits-form__parent-resource')
  if ((await parentSections.count()) !== 3)
    throw Error('Expected three parent selectors')
  for (const section of await parentSections.all()) {
    if (await section.getByRole('button', { name: 'Cancel', exact: true }).count())
      throw Error('Parent cancel action remains')
  }
  await page.screenshot({
    path: 'output/playwright/feature-entry-tightened.png',
    fullPage: true,
  })
  const input = parentSections.first().getByRole('textbox')
  await input.click()
  await page.waitForTimeout(500)
  await page.getByText('Find a place to use its address', { exact: true }).click()
  await add.click()
  await find.waitFor({ state: 'hidden' })
  if (errors.length) throw Error(errors.join('\n'))
  console.log(
    JSON.stringify({
      authenticated: !page.url().includes('sign-in'),
      buttonOrder: true,
      primaryText: colour,
      parentCancelButtons: 0,
      profileFormRevealed: true,
      errors,
    }),
  )
} finally {
  await browser.close()
}
