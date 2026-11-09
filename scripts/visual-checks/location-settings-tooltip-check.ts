// Manual verification of shared tooltips and the actual Location settings controls.
import { chromium, firefox } from 'playwright'
import { mkdir } from 'node:fs/promises'
await mkdir('output/playwright', { recursive: true })
for (const [name, engine] of [
  ['chromium', chromium],
  ['firefox', firefox],
] as const) {
  const browser = await engine.launch()
  const page = await browser.newPage({ viewport: { width: 1100, height: 950 } })
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  try {
    await page.route('**/__location-settings-tooltip.html', route =>
      route.fulfill({
        contentType: 'text/html',
        body: '<html data-theme="breadline-light"><head><meta name="viewport" content="width=device-width,initial-scale=1"><script>globalThis.__sveltekit_dev={env:{}}</script></head><body><div id="app"></div><script type="module" src="/src/tests/fixtures/locationSettingsTooltipCheck.ts"></script></body></html>',
      }),
    )
    await page.goto('http://127.0.0.1:4173/__location-settings-tooltip.html')
    const sync = page.getByRole('combobox', { name: 'Location sync' })
    await sync.hover()
    await page.waitForTimeout(200)
    if (await page.getByRole('tooltip').count())
      throw new Error('Redundant Synced tooltip')
    await page.getByRole('combobox', { name: 'Location visibility' }).hover()
    if (await page.getByRole('tooltip').count())
      throw new Error('Redundant Shared tooltip')
    await sync.locator('.bits-form__select-label').evaluate(node => {
      node.style.display = 'none'
    })
    await sync.hover()
    await page.getByRole('tooltip').getByText('Synced', { exact: true }).waitFor()
    await sync.locator('.bits-form__select-label').evaluate(node => {
      node.style.removeProperty('display')
    })
    if (await page.locator('[title]').count()) throw new Error('Native tooltip remains')
    await sync.click()
    await page.getByRole('listbox').waitFor()
    await page.getByRole('tooltip').waitFor({ state: 'hidden' })
    await page.getByRole('option', { name: 'Unsynced', exact: true }).click()
    await page.mouse.move(0, 0)
    await sync.hover()
    await page.waitForTimeout(200)
    if (await page.getByRole('tooltip').count())
      throw new Error('Redundant Unsynced tooltip')
    await page.keyboard.press('Escape')
    const keyboard = page.getByRole('button', { name: 'Keyboard target' })
    await keyboard.focus()
    await page.getByRole('tooltip').getByText('Keyboard help').waitFor()
    if (
      !(await keyboard.getAttribute('aria-describedby'))?.includes(
        'existing-description ',
      )
    )
      throw new Error('Accessible description was replaced')
    await page.keyboard.press('Escape')
    await page.getByRole('tooltip').waitFor({ state: 'hidden' })
    if ((await keyboard.getAttribute('aria-describedby')) !== 'existing-description')
      throw new Error('Tooltip description was not cleaned up')
    await page.getByRole('button', { name: 'Scroll target' }).hover()
    await page.getByRole('tooltip').getByText('Scrollable help').waitFor()
    await page.locator('[data-scroll-region]').evaluate(node => {
      node.scrollTop = 80
    })
    await page.getByRole('tooltip').waitFor({ state: 'hidden' })
    for (const theme of ['breadline-light', 'hype-dark']) {
      for (const [width, height] of [
        [1100, 950],
        [390, 844],
        [390, 600],
      ]) {
        await page.setViewportSize({ width, height })
        await page
          .locator('html')
          .evaluate((node, theme) => node.setAttribute('data-theme', theme), theme)
        await page
          .getByRole('button', {
            name: 'About sync, visibility and multilingual editing',
          })
          .click()
        const help = page.getByRole('tooltip')
        await help.getByRole('heading', { name: 'Keep details in sync' }).waitFor()
        await page.waitForTimeout(200)
        const bounds = await help.boundingBox()
        if (
          !bounds ||
          bounds.x < 0 ||
          bounds.x + bounds.width > width ||
          bounds.y < 0 ||
          bounds.y + bounds.height > height
        )
          throw new Error(`Tooltip outside viewport: ${JSON.stringify(bounds)}`)
        if (
          await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
        )
          throw new Error('Horizontal overflow')
        if (height === 600) {
          const scroll = help.locator('div.overflow-y-auto').first()
          await scroll.evaluate(node => {
            node.scrollTop = node.scrollHeight
          })
          if (!(await scroll.evaluate(node => node.scrollTop > 0)))
            throw new Error('Short-screen card cannot scroll')
        }
        await page.screenshot({
          path: `output/playwright/location-settings-${name}-${theme}-${width}-${height}.png`,
        })
        await page.keyboard.press('Escape')
      }
    }
    if (errors.length) throw new Error(errors.join('\n'))
    console.log(
      `${name}: themed labels, menu interaction, keyboard descriptions, dismissal, and responsive help passed`,
    )
  } finally {
    await browser.close()
  }
}
