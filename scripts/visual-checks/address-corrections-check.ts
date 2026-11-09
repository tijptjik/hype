// PLAYWRIGHT
import { chromium } from 'playwright'
// FILESYSTEM
import { mkdir } from 'node:fs/promises'

const browser = await chromium.launch({
  executablePath:
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ??
    '/home/io/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome',
  args: ['--disable-web-security'],
})
try {
  await mkdir('output/playwright', { recursive: true })
  const page = await browser.newPage({ viewport: { width: 1000, height: 1050 } })
  const errors: string[] = []
  page.on('pageerror', error => {
    errors.push(error.message)
    console.error(error.message)
  })
  await page.route('**/__address-corrections.html', route =>
    route.fulfill({
      contentType: 'text/html',
      body: '<html lang="en" data-theme="breadline-light"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>@layer theme,base,components,utilities;</style><script>globalThis.__sveltekit_dev={env:{}}</script></head><body><div id="app"></div><script type="module" src="/src/tests/fixtures/addressCorrectionsCheck.ts"></script></body></html>',
    }),
  )
  await page.goto('http://127.0.0.1:4173/__address-corrections.html')
  const regular = page.locator('[data-normal-conflict] [data-map-address-conflict]')
  const ambiguous = page.locator('[data-ambiguous-conflict]')
  await regular.waitFor()
  await page.evaluate(() => document.fonts.ready)
  if (await ambiguous.getByRole('button', { name: 'Accept Change' }).count())
    throw Error('Ambiguous results still permit acceptance')
  await ambiguous.getByRole('button', { name: 'Review Change' }).click()
  const card = await regular.evaluate(element => {
    const root = element.getBoundingClientRect()
    const icon = element.querySelector('svg')!.getBoundingClientRect()
    const content = element.lastElementChild!.getBoundingClientRect()
    const buttons = [...element.querySelectorAll('button')].map(button =>
      button.getBoundingClientRect(),
    )
    return {
      width: root.width,
      iconCenter: icon.y + icon.height / 2,
      cardCenter: root.y + root.height / 2,
      buttonCenter: (buttons[0].x + buttons.at(-1)!.right) / 2,
      contentCenter: content.x + content.width / 2,
    }
  })
  if (
    card.width >= 320 ||
    Math.abs(card.iconCenter - card.cardCenter) > 1 ||
    Math.abs(card.buttonCenter - card.contentCenter) > 1
  )
    throw Error(`Unexpected compact geometry: ${JSON.stringify(card)}`)
  await page.screenshot({
    path: 'output/playwright/address-corrections-desktop.png',
    fullPage: true,
    animations: 'disabled',
  })
  const streets = page.locator('details').first()
  if (await streets.evaluate(element => element.hasAttribute('open')))
    throw Error('Street suggestions start expanded')
  await streets.locator('summary').click()
  await streets.getByRole('button', { name: 'Hollywood Road 4 m Use street' }).click()
  if ((await page.locator('[data-selected-street]').innerText()) !== 'hollywood')
    throw Error('Name-only canonical street was not selected')
  await streets
    .getByRole('button', { name: 'Tai Ping Shan Street 26 m Use street' })
    .click()
  if (
    !(await page.locator('[data-display]').innerText()).includes('Tai Ping Shan Street')
  )
    throw Error('Street selection did not fill its name')
  const number = page.getByRole('textbox', { name: 'Street number', exact: true })
  await number.fill('132-128')
  await page.getByRole('alert').waitFor()
  if (await number.evaluate(element => (element as HTMLInputElement).checkValidity()))
    throw Error('Descending range was accepted')
  await page.getByRole('button', { name: 'Save fixture' }).click()
  if ((await page.locator('[data-submissions]').innerText()) !== '0')
    throw Error('Invalid form submitted')
  await page.screenshot({
    path: 'output/playwright/address-corrections-invalid.png',
    fullPage: true,
    animations: 'disabled',
  })
  await number.fill('124B & 124C')
  await page.keyboard.press('Tab')
  await page.waitForFunction(
    () =>
      (
        document.getElementById(
          'address-en-buildingNumberExpression',
        ) as HTMLInputElement
      )?.value === '124B/C',
  )
  await page.getByRole('button', { name: 'Save fixture' }).click()
  if ((await page.locator('[data-submissions]').innerText()) !== '1')
    throw Error('Corrected form did not submit')
  const content = JSON.parse(await page.locator('[data-content]').innerText())
  if (
    content.buildingNumberFrom !== '124B' ||
    content.buildingNumberTo !== '124C' ||
    content.buildingNumberConnector !== '/' ||
    content.buildingNumberExpression !== '124B/C'
  )
    throw Error(`Wrong persisted structure: ${JSON.stringify(content)}`)
  await page.setViewportSize({ width: 390, height: 1050 })
  await page.screenshot({
    path: 'output/playwright/address-corrections-mobile.png',
    fullPage: true,
    animations: 'disabled',
  })
  if ((await regular.evaluate(element => element.getBoundingClientRect().width)) > 358)
    throw Error('Compact card overflows mobile viewport')
  if (errors.length) throw Error(errors.join('\n'))
  console.log(
    JSON.stringify({
      card,
      ambiguousReviewOnly: true,
      streetsInitiallyCollapsed: true,
      namedStreetSelection: true,
      descendingRangeBlocked: true,
      correctedSubmission: true,
      content,
      errors,
    }),
  )
} finally {
  await browser.close()
}
