import { chromium, firefox } from 'playwright'
import { mkdir } from 'node:fs/promises'
await mkdir('/tmp/hype-policy-geometry', { recursive: true })
for (const [name, engine] of [
  ['chromium', chromium],
  ['firefox', firefox],
] as const) {
  const browser = await engine.launch(
    name === 'chromium'
      ? { args: ['--disable-features=LocalNetworkAccessChecks'] }
      : {},
  )
  try {
    for (const width of [1560, 1024, 640, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 } })
      const errors: string[] = []
      page.on('pageerror', error => {
        errors.push(error.message)
        console.log(error.message)
      })
      page.on('console', msg => {
        if (msg.type() === 'error') console.log(msg.text())
      })
      await page.route('**/__policy-geometry.html', route =>
        route.fulfill({
          contentType: 'text/html',
          body: '<html lang="en" data-theme="breadline-light"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>@layer theme,base,components,utilities;</style><script>globalThis.__sveltekit_dev={env:{}}</script></head><body class="bits-theme"><div id="app"></div><script type="module" src="/src/tests/fixtures/advancedPolicyGeometryCheck.ts"></script></body></html>',
        }),
      )
      await page.goto('http://127.0.0.1:4173/__policy-geometry.html')
      await page.getByText('Allow Feature descriptions', { exact: true }).waitFor()
      await page.evaluate(() => document.fonts.ready)
      const geometry = () =>
        page.locator('[data-policy-surface]').evaluate(root => {
          const elements = [...root.querySelectorAll('h3')].map(h =>
            h.textContent?.includes('Business')
              ? h.parentElement?.parentElement?.parentElement
              : h.parentElement,
          )
          elements.push(
            ...root.querySelectorAll('h3'),
            ...root.querySelectorAll('div.grid:has(> div[aria-hidden="true"])'),
          )
          return elements.map(el => {
            if (!el) throw new Error('Missing policy card')
            const r = el.getBoundingClientRect()
            return [r.x, r.y, r.width, r.height]
          })
        })
      const before = await geometry()
      await page.getByRole('button', { name: 'Toggle editing' }).click()
      await page.getByRole('combobox').first().waitFor()
      const editing = await geometry()
      if (JSON.stringify(before) !== JSON.stringify(editing))
        throw Error(
          `${name} ${width}: view/edit shift ${JSON.stringify({ before, editing })}`,
        )
      await page.getByRole('combobox').first().click()
      await page.getByRole('option', { name: 'Disabled', exact: true }).click()
      await page.getByRole('combobox').last().click()
      await page
        .getByRole('option', { name: 'Inherit from Project', exact: true })
        .click()
      const changed = await geometry()
      if (JSON.stringify(editing) !== JSON.stringify(changed))
        throw Error(`${name} ${width}: value change shift`)
      await page.getByRole('button', { name: 'Toggle editing' }).click()
      if (JSON.stringify(before) !== JSON.stringify(await geometry()))
        throw Error(`${name} ${width}: return to view shift`)
      if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth))
        throw Error(`${name} ${width}: horizontal overflow`)
      if (errors.length) throw Error(errors.join('\n'))
      await page.screenshot({
        path: `/tmp/hype-policy-geometry/${name}-${width}.png`,
        fullPage: true,
      })
      console.log(
        `${name} ${width}: all three cards stable across edit, value change, and view; no overflow`,
      )
      await page.close()
    }
  } finally {
    await browser.close()
  }
}
