import { chromium, firefox } from 'playwright'
import { mkdir } from 'node:fs/promises'
await mkdir('/tmp/hype-location-source-policy', { recursive: true })
for (const [name, engine] of [
  ['chromium', chromium],
  ['firefox', firefox],
] as const) {
  const browser = await engine.launch()
  try {
    for (const width of [1440, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 } })
      const errors: string[] = []
      page.on('pageerror', e => errors.push(e.message))
      await page.route('**/__source-policy.html', route =>
        route.fulfill({
          contentType: 'text/html',
          body: '<html lang="en" data-theme="breadline-light"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>@layer theme,base,components,utilities;</style><script>globalThis.__sveltekit_dev={env:{}}</script></head><body class="bits-theme"><div id="app"></div><script type="module" src="/src/tests/fixtures/locationSourcePolicyCheck.ts"></script></body></html>',
        }),
      )
      await page.goto('http://127.0.0.1:4173/__source-policy.html')
      await page.getByRole('heading', { name: 'Communications', exact: true }).waitFor()
      await page.getByLabel('Same policy for community changes').check()
      const draft = JSON.parse(
        (await page.locator('[data-draft]').textContent()) ?? '{}',
      )
      if (!draft.policy.sameSources) throw new Error('Source coupling was not staged')
      await page.getByLabel('Same policy for community changes').uncheck()
      await page.getByLabel('Accept when our value is empty').last().check()
      const split = JSON.parse(
        (await page.locator('[data-draft]').textContent()) ?? '{}',
      )
      if (!split.policy.community.acceptMissing || split.policy.acceptMissing)
        throw new Error('Exceptions crossed origins')
      if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth))
        throw new Error('Horizontal overflow')
      await page.screenshot({
        path: `/tmp/hype-location-source-policy/${name}-${width}.png`,
        fullPage: true,
      })
      if (errors.length) throw new Error(errors.join('\n'))
      console.log(
        `${name} ${width}: source toggle, independent exceptions, no overflow`,
      )
      await page.close()
    }
  } finally {
    await browser.close()
  }
}
