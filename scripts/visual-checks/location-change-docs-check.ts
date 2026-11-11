// BROWSER
import { chromium, firefox } from 'playwright'
// NODE
import { mkdir } from 'node:fs/promises'

await mkdir('/tmp/hype-location-change-docs', { recursive: true })
for (const [name, engine] of [
  ['chromium', chromium],
  ['firefox', firefox],
] as const) {
  const browser = await engine.launch()
  try {
    for (const width of [1440, 1200]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 } })
      const errors: string[] = []
      page.on('pageerror', error => errors.push(error.message))
      await page.goto('http://127.0.0.1:4173/admin/docs')
      await page.getByRole('link', { name: 'Location updates', exact: true }).click()
      const section = page.locator('#location-change-policies')
      await section.locator('svg.pele-flowchart').nth(1).waitFor({ timeout: 45000 })
      if (await section.getByRole('alert').count())
        throw new Error('Diagram failed to render')
      const provider = section.getByRole('link', { name: 'SaanSeoi', exact: true })
      if ((await provider.getAttribute('href')) !== 'https://saanseoi.hk')
        throw new Error('Incorrect provider link')
      if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth))
        throw new Error('Page overflow')
      const diagrams = section.getByRole('button', { name: /View .* full screen/ })
      if ((await diagrams.count()) !== 2)
        throw new Error('Expected separate resolution and edit diagrams')
      if (
        !(await diagrams.first().getAttribute('aria-label'))?.includes(
          'How a Feature gets its display values',
        )
      )
        throw new Error('Display resolution must be first')
      await diagrams.first().click()
      await page.getByRole('dialog').waitFor()
      await page.getByRole('dialog').locator('svg.pele-flowchart').waitFor()
      await page.screenshot({
        path: `/tmp/hype-location-change-docs/${name}-${width}-diagram.png`,
      })
      await page.getByRole('button', { name: 'Close full-screen diagram' }).click()
      await section.scrollIntoViewIfNeeded()
      await page.screenshot({
        path: `/tmp/hype-location-change-docs/${name}-${width}.png`,
      })
      if (errors.length) throw new Error(errors.join('\n'))
      console.log(
        `${name} ${width}: authenticated admin docs, rendered diagram, fullscreen and provider link passed`,
      )
      await page.close()
    }
  } finally {
    await browser.close()
  }
}
