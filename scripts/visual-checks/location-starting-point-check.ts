import { chromium, firefox } from 'playwright'
import { mkdir } from 'node:fs/promises'
await mkdir('output/playwright/location-starting-point', { recursive: true })
for (const [name, engine] of [
  ['chromium', chromium],
  ['firefox', firefox],
] as const) {
  const browser = await engine.launch()
  try {
    for (const width of [1440, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 } })
      const errors: string[] = []
      page.on('pageerror', error => errors.push(error.message))
      await page.route('**/__starting-point.html', route =>
        route.fulfill({
          contentType: 'text/html',
          body: '<html lang="en" data-theme="breadline-light"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>@layer theme,base,components,utilities;</style><script>globalThis.__sveltekit_dev={env:{}}</script></head><body class="bits-theme"><div id="app"></div><script type="module" src="/src/tests/fixtures/locationStartingPointCheck.ts"></script></body></html>',
        }),
      )
      await page.route('**/src/lib/api/division.remote.*', route =>
        route.fulfill({
          contentType: 'application/javascript',
          body: 'export function getAddressDivisionLabel(){return {current:null}}',
        }),
      )
      await page.goto('http://127.0.0.1:4173/__starting-point.html')
      const input = page.getByRole('textbox', { name: /Service point.*Name/i })
      try {
        await input.waitFor({ timeout: 10000 })
        await page.getByText('Service point name (required)', { exact: true }).waitFor()
        if (
          !(await page
            .getByRole('button', { name: 'Create service point', exact: true })
            .isDisabled())
        )
          throw Error('Unnamed service point can be submitted')
        await input.fill('Recycling point', { timeout: 10000 })
      } catch (error) {
        console.log(errors, await page.locator('body').innerText())
        throw error
      }
      const relation = page.getByRole('checkbox', {
        name: 'Operates in Neighbourhood shop',
      })
      if (await relation.isChecked()) throw Error('Operating relationship was inferred')
      await relation.check()
      const action = page.getByRole('button', {
        name: 'Create service point',
        exact: true,
      })
      const box = await action.boundingBox()
      if (!box || box.height < 48 || box.width < 250)
        throw Error('Empty-state creation action is too small')
      if (await page.getByRole('button', { name: 'Use Location', exact: true }).count())
        throw Error('Creation intent was replaced with use-location wording')
      await page.screenshot({
        path: `output/playwright/location-starting-point/${name}-${width}.png`,
      })
      await page.getByRole('button', { name: 'Create service point' }).click()
      await page.waitForFunction(() =>
        document
          .querySelector('[data-accepted]')
          ?.textContent?.includes('Recycling point'),
      )
      const accepted = JSON.parse(await page.locator('[data-accepted]').innerText())
      if (
        accepted.identity ||
        accepted.source ||
        accepted.kind !== 'service_point' ||
        accepted.address.association.operatesInLocationId !== 'host'
      )
        throw Error('Incorrect created identity or relationship')
      if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth))
        throw Error('Horizontal overflow')
      if (errors.length) throw Error(errors.join('\n'))
      console.log(
        `${name} ${width}: distinct identity and explicit operating relationship passed`,
      )
      await page.close()
    }
  } finally {
    await browser.close()
  }
}
