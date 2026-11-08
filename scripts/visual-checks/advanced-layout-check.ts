import { chromium, firefox } from 'playwright'
for (const [name, engine] of [
  ['chromium', chromium],
  ['firefox', firefox],
] as const) {
  const browser = await engine.launch()
  try {
    for (const width of [1564, 768, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 1100 } })
      await page.route('**/__advanced-layout.html', route =>
        route.fulfill({
          contentType: 'text/html',
          body: '<html data-theme="breadline-light"><head><script>globalThis.__sveltekit_dev={env:{}}</script></head><body><div id="app"></div><script type="module" src="/src/tests/fixtures/advancedLayoutCheck.ts"></script></body></html>',
        }),
      )
      await page.goto('http://127.0.0.1:4173/__advanced-layout.html')
      const toggle = page.getByRole('button', { name: 'Toggle editing' })
      await toggle.waitFor()
      await page.evaluate(() => document.fonts.ready)
      const measure = () =>
        page
          .locator('section, h3, [role="switch"], [role="combobox"]')
          .evaluateAll(nodes =>
            nodes.map(node => {
              const { x, y, width, height } = node.getBoundingClientRect()
              return { x, y, width, height }
            }),
          )
      const before = await measure()
      await toggle.click()
      await page.waitForTimeout(250)
      const after = await measure()
      if (JSON.stringify(before) !== JSON.stringify(after))
        throw new Error(
          `${name} ${width}: layout shifted\n${JSON.stringify({ before, after })}`,
        )
      await toggle.click()
      await page.waitForTimeout(250)
      if (JSON.stringify(before) !== JSON.stringify(await measure()))
        throw new Error('Cancel shifted layout')
      if (await page.getByRole('button', { name: 'Add', exact: true }).count())
        throw new Error('Read-only Add is accessible')
      await page.screenshot({
        path: `/tmp/advanced-layout-${name}-${width}.png`,
        fullPage: true,
      })
      console.log(
        `${name} ${width}: edit/cancel geometry unchanged; read-only actions hidden`,
      )
      await page.close()
    }
  } finally {
    await browser.close()
  }
}
