// Manual verification of the actual shared address/accessibility controls in both themes.
import { chromium, firefox } from 'playwright'
for (const [name, engine] of [
  ['chromium', chromium],
  ['firefox', firefox],
] as const) {
  console.log(`${name}: launching`)
  const browser = await engine.launch({
    timeout: 20000,
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
      `${process.env.ASSOCIATION_BASE_URL ?? 'http://127.0.0.1:4175'}/__accessibility-style.html`,
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
      const dimensions = await step.evaluate(node => ({
        height: node.getBoundingClientRect().height,
        background: getComputedStyle(node).backgroundColor,
        font: getComputedStyle(node).fontSize,
      }))
      const hint = page.getByRole('textbox', { name: 'Access hints · EN', exact: true })
      const hintStyles = await hint.evaluate(node => ({
        background: getComputedStyle(node.closest('.bits-form__control-wrap')!)
          .backgroundColor,
        font: getComputedStyle(node).fontSize,
      }))
      if (
        dimensions.height !== 48 ||
        dimensions.font !== hintStyles.font ||
        dimensions.background !== hintStyles.background
      )
        throw new Error(
          `${name}: mismatched control styles ${JSON.stringify({ dimensions, hintStyles })}`,
        )
      await page.screenshot({
        path: `output/playwright/accessibility-${name}-${theme}.png`,
        fullPage: true,
      })
      await step.click()
      await page.getByRole('option', { name: 'Yes', exact: true }).click()
      if (!(await step.textContent().then(text => text?.includes('Yes'))))
        throw new Error('Selection did not update')
    }
    await page.setViewportSize({ width: 390, height: 844 })
    await page.screenshot({
      path: `output/playwright/accessibility-${name}-mobile.png`,
      fullPage: true,
    })
    console.log(
      JSON.stringify({
        browser: name,
        themes: 2,
        sharedControlStyles: true,
        selection: true,
      }),
    )
  } finally {
    await browser.close()
  }
}
