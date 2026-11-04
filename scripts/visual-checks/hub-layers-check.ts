// NODE
import { mkdir } from 'node:fs/promises'
// PLAYWRIGHT
import { chromium, firefox } from 'playwright'

const directory = 'output/playwright/hub-layers'
await mkdir(directory, { recursive: true })
for (const [name, engine] of [
  ['chromium', chromium],
  ['firefox', firefox],
] as const) {
  const browser = await engine.launch({ headless: true })
  try {
    for (const width of [1360, 700, 390, 320]) {
      const page = await browser.newPage({
        viewport: { width, height: 1000 },
        reducedMotion: 'reduce',
      })
      const errors: string[] = []
      page.on('pageerror', error => errors.push(error.message))
      await page.route('**/__hub-layers.html', route =>
        route.fulfill({
          contentType: 'text/html',
          body: '<html lang="en" data-theme="breadline-light"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>@layer theme,base,components,utilities;</style><script>globalThis.__sveltekit_dev={env:{}}</script></head><body><div id="app"></div><script type="module" src="/src/tests/fixtures/hubLayersCheck.ts"></script></body></html>',
        }),
      )
      // Fixture map previews exercise loading and a missing-preview fallback without live data.
      await page.route('**/api/mapRenders/layers/*/asset', route => {
        if (route.request().url().includes('/three/'))
          return route.fulfill({ status: 404, body: '' })
        const color = route.request().url().includes('/one/') ? '#187b91' : '#a35e75'
        return route.fulfill({
          contentType: 'image/svg+xml',
          body: `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 80 80"><rect width="80" height="80" fill="#f4e9df"/><path d="M-10 60L90 15M10-10L50 90" stroke="white" stroke-width="10"/><circle cx="43" cy="38" r="13" fill="${color}"/></svg>`,
        })
      })
      await page.goto('http://127.0.0.1:4173/__hub-layers.html')
      await page
        .getByRole('img', { name: 'Food collection locations', exact: true })
        .waitFor()
      await page.waitForFunction(
        () =>
          [...document.querySelectorAll('img')].filter(image => image.naturalWidth > 0)
            .length === 2,
      )
      await page.getByText('CK', { exact: true }).waitFor()
      const header = page.locator('.bits-form__section-header').first()
      const geometry = await header.evaluate(element => {
        const root = element.getBoundingClientRect()
        const button = element.querySelector('button')!.getBoundingClientRect()
        const icon = element
          .querySelector('.bits-header__icon-wrap')!
          .getBoundingClientRect()
        return {
          mid: root.y + root.height / 2,
          buttonMid: button.y + button.height / 2,
          iconMid: icon.y + icon.height / 2,
          rightInset: root.right - button.right,
          containerType: getComputedStyle(
            element.querySelector('.bits-form__section-header-right')!,
          ).containerType,
        }
      })
      if (
        geometry.containerType !== 'normal' ||
        Math.abs(geometry.buttonMid - geometry.mid) > 1 ||
        Math.abs(geometry.iconMid - geometry.mid) > 1 ||
        geometry.rightInset < 20
      )
        throw new Error(`Header misaligned at ${width}: ${JSON.stringify(geometry)}`)
      const firstToggle = page.getByRole('switch').first()
      await firstToggle.click()
      if ((await firstToggle.getAttribute('aria-checked')) !== 'false')
        throw new Error('Default visibility did not update')
      await header.locator('button').click()
      if (await firstToggle.isVisible())
        throw new Error('Collapse all did not hide rows')
      await header.locator('button').click()
      if (
        !(await firstToggle.isVisible()) ||
        (await firstToggle.getAttribute('aria-checked')) !== 'false'
      )
        throw new Error('Expanding lost the visibility selection')
      await page.mouse.move(0, 0)
      if (await page.getByRole('tooltip').count())
        await page.getByRole('tooltip').waitFor({ state: 'hidden' })
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      )
      if (overflow) throw new Error(`Horizontal overflow at ${width}`)
      await page
        .locator('.bits-form__section')
        .first()
        .screenshot({ path: `${directory}/${name}-${width}.png` })
      if (errors.length) throw new Error(errors.join('; '))
      console.log(
        `${name} ${width}px: aligned header, layer previews/fallback, collapse and default visibility passed`,
      )
      await page.close()
    }
  } finally {
    await browser.close()
  }
}
