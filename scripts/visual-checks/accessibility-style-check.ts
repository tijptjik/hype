// Manual verification of the actual shared address/accessibility controls in both themes.
import { chromium, firefox } from 'playwright'
for (const [name, engine] of [
  ['chromium', chromium],
  ['firefox', firefox],
] as const) {
  console.log(`${name}: launching`)
  const browser = await engine.launch({
    timeout: 20000,
    args: name === 'chromium' ? ['--disable-web-security'] : [],
    executablePath:
      name === 'chromium' ? process.env.CHROMIUM_PATH : process.env.FIREFOX_PATH,
  })
  try {
    console.log(`${name}: loading fixture`)
    const page = await browser.newPage({ viewport: { width: 900, height: 1000 } })
    page.on('pageerror', error => console.error(error.message))
    page.on('console', message => {
      if (message.type() === 'error') console.error(message.text())
    })
    await page.route('**/src/lib/api/locationAccessibility.remote.ts*', route =>
      route.fulfill({
        contentType: 'text/javascript',
        body: 'export function getLocationAccessibility(){return {current:null}}; export async function updateLocationAccessibility(){}',
      }),
    )
    await page.route('**/__accessibility-style.html', route =>
      route.fulfill({
        contentType: 'text/html',
        body: '<html data-theme="hype-light"><head><meta name="viewport" content="width=device-width,initial-scale=1"><script>globalThis.__sveltekit_dev={env:{}}</script></head><body><div id="app"></div><script type="module" src="/src/tests/fixtures/accessibilityStyleCheck.ts"></script></body></html>',
      }),
    )
    await page.goto(
      `${process.env.ASSOCIATION_BASE_URL ?? 'http://127.0.0.1:4173'}/__accessibility-style.html`,
    )
    console.log(`${name}: fixture loaded`)
    const step = page.getByRole('combobox', { name: 'Step-free entrance', exact: true })
    await step.waitFor({ timeout: 60000 })
    for (const theme of ['hype-light', 'hype-dark']) {
      await page
        .locator('html')
        .evaluate((node, theme) => node.setAttribute('data-theme', theme), theme)
      // Let shared theme colour transitions finish before comparing computed surfaces.
      await page.waitForTimeout(400)
      const rows = page.locator('[data-inline-locale-row]')
      if ((await rows.count()) !== 3) throw Error('Expected three shared locale rows')
      await page.getByRole('button', { name: 'Access hints · EN', exact: true }).click()
      const hint = page.getByRole('textbox', { name: 'Access hints · EN', exact: true })
      await hint.fill('Rear entrance')
      await hint.press('Escape')
      await page.getByRole('button', { name: 'Access hints · EN', exact: true }).click()
      if ((await hint.inputValue()) !== 'Side entrance')
        throw Error('Escape did not restore original hint')
      await hint.fill('Side entrance')
      await hint.press('Enter')
      await step.click()
      const yes = page.getByRole('option', { name: 'Yes', exact: true })
      await yes.waitFor()
      await page.screenshot({
        path: `output/playwright/accessibility-clean-${name}-${theme}.png`,
        fullPage: true,
      })
      const backgrounds = await page
        .getByRole('option')
        .evaluateAll(nodes => nodes.map(node => getComputedStyle(node).backgroundColor))
      if (backgrounds.filter(color => color !== 'rgba(0, 0, 0, 0)').length > 1)
        throw Error('Unselected dropdown options should use the clean menu surface')
      await yes.click()
      if (!(await step.textContent())?.includes('Yes'))
        throw Error('Selection did not update')
      await page.setViewportSize({ width: 390, height: 1000 })
      if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth))
        throw Error('Narrow overflow')
      await page.setViewportSize({ width: 900, height: 1000 })
    }
    console.log(
      `${name}: locale edit/cancel, dropdown selection, themes and narrow layout passed`,
    )
  } finally {
    await browser.close()
  }
}
