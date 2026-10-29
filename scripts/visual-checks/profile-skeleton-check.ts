// NODE
import { mkdir } from 'node:fs/promises'
// PLAYWRIGHT
import { chromium, firefox } from 'playwright'

const directory = 'output/playwright/profile-skeleton'
await mkdir(directory, { recursive: true })
for (const [name, engine] of [['chromium', chromium], ['firefox', firefox]] as const) {
  const browser = await engine.launch({ headless: true })
  try {
    for (const width of [320, 390, 1440]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 }, reducedMotion: width === 1440 ? 'no-preference' : 'reduce' })
      await page.route('**/__profile-skeleton.html', route => route.fulfill({ contentType: 'text/html', body: '<html lang="en" data-theme="breadline-light"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>@layer theme,base,components,utilities;</style><script>globalThis.__sveltekit_dev={env:{}}</script></head><body><div id="app"></div><script type="module" src="/src/tests/fixtures/featureProfileCheck.ts"></script></body></html>' }))
      await page.goto('http://127.0.0.1:4173/__profile-skeleton.html')
      await page.getByRole('button', { name: 'Use Location name', exact: true }).click()
      await page.getByRole('button', { name: 'Toggle editing' }).click()
      const row = page.locator('[data-profile-derived]')
      const text = await row.locator('p').boundingBox()
      const button = await page.getByRole('button', { name: 'Edit Location', exact: true }).boundingBox()
      if (!text || !button || (width === 1440 && Math.abs(text.y + text.height / 2 - button.y - button.height / 2) > 1)) throw new Error('Linked-name row is misaligned')
      await page.screenshot({ path: `${directory}/${name}-${width}-row.png` })
      for (const expanded of [false, true]) {
        if (expanded) await page.getByRole('button', { name: 'Multilingual', exact: true }).click()
        await page.getByRole('button', { name: 'Toggle loading' }).click()
        const rows = await page.locator('[data-profile-skeleton-row]').count()
        if (rows !== (expanded ? 8 : 2)) throw new Error(`Unexpected skeleton row count: ${rows}`)
        if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error('Horizontal overflow')
        await page.screenshot({ path: `${directory}/${name}-${width}-${expanded ? 'multi' : 'single'}.png` })
        await page.getByRole('button', { name: 'Toggle loading' }).click()
      }
      await page.evaluate(() => {
        const original = Element.prototype.animate
        ;(window as any).profileEntries = 0
        Element.prototype.animate = function(frames, options) {
          if (JSON.stringify(frames).includes('translateX(8px)')) (window as any).profileEntries++
          return original.call(this, frames, options)
        }
      })
      await page.getByRole('button', { name: 'Next record', exact: true }).click()
      if (await page.locator('[data-profile-skeleton-row]').count()) throw new Error('Navigation replaced content with skeletons')
      if (!await page.locator('[data-feature-profile-editor]').evaluate(element => (element as HTMLElement).inert)) throw new Error('Outgoing content is interactive')
      await page.locator('[data-profile-field="description"]').getByText('Next record description', { exact: true }).waitFor()
      const entries = await page.evaluate(() => (window as any).profileEntries)
      if (entries !== (width === 1440 ? 1 : 0)) throw new Error(`Unexpected incoming animations: ${entries}`)
      await page.screenshot({ path: `${directory}/${name}-${width}-navigation.png` })
      console.log(`${name} ${width}: compact row and single/multilingual skeletons passed`)
      await page.close()
    }
  } finally { await browser.close() }
}
