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
  const page = await browser.newPage({ viewport: { width: 1200, height: 850 } })
  const errors: string[] = []
  page.on('requestfailed', request =>
    console.error('Request failed', request.url(), request.failure()?.errorText),
  )
  page.on('response', response => {
    if (response.status() >= 400)
      console.error('HTTP', response.status(), response.url())
  })
  page.on('pageerror', error => {
    errors.push(error.message)
    console.error(error.message)
  })
  await page.route('**/__tooltip-layout.html', route =>
    route.fulfill({
      contentType: 'text/html',
      body: '<html lang="en" data-theme="breadline-light"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>@layer theme,base,components,utilities;</style><script>globalThis.__sveltekit_dev={env:{}}</script></head><body><div id="app"></div><script type="module" src="/src/tests/fixtures/tooltipLayoutCheck.ts"></script></body></html>',
    }),
  )
  await page.goto('http://127.0.0.1:4173/__tooltip-layout.html')
  const helpTrigger = page.getByRole('button', {
    name: 'Location visibility',
    exact: true,
  })
  const help = page.getByRole('tooltip')
  await helpTrigger.waitFor({ timeout: 20000 }).catch(async error => {
    console.log((await page.locator('body').innerText()).slice(0, 2500))
    await page.screenshot({ path: 'output/playwright/clickable-tooltip-debug.png' })
    throw error
  })
  await page.evaluate(() => document.fonts.ready)

  /** Capture form geometry and both document and internal scrolling.
   * @returns Stable measurements to compare across help activation.
   */
  async function layout(): Promise<string> {
    return page.evaluate(() =>
      JSON.stringify({
        viewport: [
          innerWidth,
          innerHeight,
          scrollX,
          scrollY,
          document.documentElement.scrollWidth,
          document.documentElement.scrollHeight,
        ],
        elements: [
          ...document.querySelectorAll<HTMLElement>(
            '[data-layout-container], [data-layout-form], [data-form-surface], [data-address-details]',
          ),
        ].map(element => ({
          rect: element.getBoundingClientRect().toJSON(),
          scroll: [
            element.scrollTop,
            element.scrollLeft,
            element.scrollWidth,
            element.scrollHeight,
          ],
        })),
      }),
    )
  }

  const results = []
  for (const width of [1200, 390]) {
    await page.setViewportSize({ width, height: 850 })
    await helpTrigger.scrollIntoViewIfNeeded()
    await page.mouse.move(0, 0)
    await page.evaluate(async () => {
      await new Promise<void>(resolve =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      )
      // Settle the editor's sidebar resize before measuring the tooltip itself.
      await Promise.all(
        document
          .getAnimations()
          .filter(
            animation => animation.effect?.getComputedTiming().iterations !== Infinity,
          )
          .map(animation => animation.finished.catch(() => {})),
      )
    })
    const before = await layout()
    await helpTrigger.click()
    await help.waitFor()
    const text = await help.innerText()
    if (
      !text.includes('\nOrganisation-only') ||
      !text.includes('\n\nOrganisation name overrides')
    )
      throw Error(`Missing help line breaks: ${text}`)
    if ((await layout()) !== before) {
      console.log('BEFORE', before, 'AFTER', await layout())
      await page.screenshot({
        path: 'output/playwright/clickable-tooltip-layout-debug.png',
        fullPage: true,
        animations: 'disabled',
      })
      throw Error(`Form moved when help opened at ${width}px`)
    }
    await page.screenshot({
      path: `output/playwright/clickable-tooltip-${width}.png`,
      fullPage: true,
      animations: 'disabled',
    })
    await page.mouse.move(0, 0)
    await page.waitForTimeout(400)
    if (!(await help.isVisible()))
      throw Error('Clicked help closed when the pointer left')
    await page.keyboard.press('Escape')
    await help.waitFor({ state: 'hidden' })
    if ((await layout()) !== before)
      throw Error(`Form moved when help closed at ${width}px`)
    await helpTrigger.focus()
    await page.keyboard.press('Enter')
    await help.waitFor()
    await page.keyboard.press('Space')
    await help.waitFor({ state: 'hidden' })
    await helpTrigger.click()
    await help.waitFor()
    await page.getByRole('button', { name: 'Outside help', exact: true }).click()
    await help.waitFor({ state: 'hidden' })
    results.push({
      width,
      click: true,
      keyboard: true,
      escape: true,
      outside: true,
      layoutStable: true,
    })
  }

  await page.setViewportSize({ width: 1200, height: 850 })
  await helpTrigger.hover()
  await help.waitFor()
  await helpTrigger.click()
  await page.mouse.move(0, 0)
  await page.waitForTimeout(400)
  if (!(await help.isVisible())) throw Error('Click did not pin the hover preview')
  await helpTrigger.click()
  await help.waitFor({ state: 'hidden' })
  if (errors.length) throw Error(errors.join('\n'))
  console.log(
    JSON.stringify({ results, hoverPreview: true, clickPinsPreview: true, errors }),
  )
} finally {
  await browser.close()
}
