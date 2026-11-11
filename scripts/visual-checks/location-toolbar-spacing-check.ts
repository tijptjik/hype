import { chromium, firefox } from 'playwright'
for (const [name, engine] of [
  ['chromium', chromium],
  ['firefox', firefox],
] as const) {
  const browser = await engine.launch()
  try {
    for (const width of [1440, 1000, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 800 } })
      const errors: string[] = []
      page.on('pageerror', error => errors.push(error.message))
      await page.route('**/__rule-title.html*', route =>
        route.fulfill({
          contentType: 'text/html',
          body: '<html lang="en" data-theme="breadline-light"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>@layer theme,base,components,utilities;</style><script>globalThis.__sveltekit_dev={env:{}}</script></head><body class="bits-theme"><div id="app"></div><script type="module" src="/src/tests/fixtures/locationToolbarSpacingCheck.ts"></script></body></html>',
        }),
      )
      await page.route('**/src/lib/api/division.remote.*', route =>
        route.fulfill({
          contentType: 'application/javascript',
          body: 'export function getAddressDivisionLabel(){return {current:null}};export function getAddressDivisionContext(){return {current:null}};export function getDivisionGeometry(){return {current:null}}',
        }),
      )
      await page.goto(`${process.argv[2] ?? 'http://127.0.0.1:4173'}/__rule-title.html`)
      page.setDefaultTimeout(15000)
      await page
        .getByRole('button', { name: 'Display location using: Automatic' })
        .waitFor()
      for (const editing of [true, false]) {
        if (!editing) await page.getByRole('button', { name: 'Toggle editing' }).click()
        await page.waitForFunction(() => {
          const toolbar = document.querySelector<HTMLElement>(
            '[data-address-toolbar-settings]',
          )?.parentElement
          return toolbar && getComputedStyle(toolbar).visibility === 'visible'
        })
        const layout = await page
          .locator('[data-address-toolbar-settings]')
          .evaluate(el => {
            const boxes = [...el.children]
              .map(child => child.getBoundingClientRect())
              .filter(box => box.width)
            return {
              ys: boxes.map(box => box.y + box.height / 2),
              widths: boxes.map(box => box.width),
              scrollWidth: document.documentElement.scrollWidth,
              viewport: innerWidth,
            }
          })
        if (Math.max(...layout.ys) - Math.min(...layout.ys) > 2)
          throw Error(`Wrapped controls: ${JSON.stringify(layout)}`)
        if (layout.widths.some(width => width < 39))
          throw Error(`Squeezed controls: ${JSON.stringify(layout)}`)
        if (layout.scrollWidth > layout.viewport)
          throw Error(`Horizontal overflow: ${JSON.stringify(layout)}`)
        const trigger = page.getByRole('button', {
          name: 'Display location using: Automatic',
        })
        if (!editing) {
          await trigger.click()
          if (await page.getByRole('menu').count())
            throw Error('Editable menu in view mode')
          await page.mouse.move(0, 0)
          await trigger.hover()
          await page.getByRole('tooltip').waitFor()
        }
        await page.screenshot({
          path: `/tmp/location-toolbar-${name}-${width}-${editing}.png`,
        })
        console.log(name, width, editing ? 'edit' : 'view', layout)
      }
      if (errors.length) throw Error(errors.join('\n'))
      await page.close()
    }
  } finally {
    await browser.close()
  }
}
