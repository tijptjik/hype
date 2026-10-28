// NODE
import { mkdir, writeFile } from 'node:fs/promises'
// PLAYWRIGHT
import { chromium, firefox } from 'playwright'

const directory = 'output/playwright/locale-controls'
await mkdir(directory, { recursive: true })
const reports: unknown[] = []
for (const [name, engine] of [['chromium', chromium], ['firefox', firefox]] as const) {
  const browser = await engine.launch({ headless: true })
  try {
    for (const width of [320, 390, 1440]) {
      console.log(`Checking ${name} at ${width}px`)
      const touch = name === 'chromium' && width === 390
      const page = await browser.newPage({ viewport: { width, height: 1000 }, hasTouch: touch, reducedMotion: width === 1440 ? 'no-preference' : 'reduce' })
      const errors: string[] = []
      page.on('pageerror', error => errors.push(error.message))
      await page.route('**/__locale-controls.html', route => route.fulfill({
        contentType: 'text/html',
        body: '<html lang="en" data-theme="breadline-light"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>@layer theme,base,components,utilities;</style><script>globalThis.__sveltekit_dev={env:{}}</script></head><body><div id="app"></div><script type="module" src="/src/tests/fixtures/localeControlsCheck.ts"></script></body></html>',
      }))
      await page.goto('http://127.0.0.1:4173/__locale-controls.html')
      const profile = page.getByRole('region', { name: 'Profile languages' })
      await profile.getByRole('button', { name: 'Multilingual' }).waitFor()
      await profile.getByRole('button', { name: '+ Add language' }).click()
      await page.getByRole('combobox').fill('日本語')
      await page.getByRole('combobox').press('Enter')
      const japanese = profile.getByRole('button', { name: 'Japanese', exact: true })
      await page.waitForFunction(() => document.activeElement?.getAttribute('data-locale') === 'ja')
      await japanese.press('Alt+ArrowLeft')
      if (touch) await profile.getByRole('button', { name: 'Move Japanese earlier' }).tap()
      else await profile.getByRole('button', { name: 'Move Japanese earlier' }).click()
      await profile.getByRole('button', { name: 'Move Japanese earlier' }).click()
      await profile.getByRole('button', { name: 'Multilingual' }).click()
      if (await page.locator('[data-field-locale]').count() !== 1 || await page.locator('[data-field-locale]').getAttribute('data-field-locale') !== 'ja') throw new Error('Collapsed locale does not follow reordered first locale')
      const collapsedHeight = await profile.locator('[id$="-strip"]').evaluate(element => element.getBoundingClientRect().height)
      if (collapsedHeight > 1) throw new Error('Collapsed strip reserves empty height')
      await profile.getByRole('button', { name: 'Multilingual' }).click()
      await page.getByRole('button', { name: 'Override for Project' }).click()
      const settings = page.getByRole('region', { name: 'Supported locales' }).first()
      await settings.getByRole('button', { name: '+ Add language' }).click()
      await page.getByRole('combobox').fill('Português')
      await page.screenshot({ path: `${directory}/${name}-${width}.png`, fullPage: true })
      if (width === 1440) {
        const trigger = await profile.getByRole('button', { name: 'Multilingual' }).boundingBox()
        const strip = await profile.locator('[id$="-strip"]').boundingBox()
        if (!trigger || !strip || strip.x <= trigger.x + trigger.width) throw new Error('Desktop strip did not expand rightward')
        const duration = await profile.locator('[id$="-strip"]').evaluate(element => getComputedStyle(element).transitionDuration)
        if (duration === '0s') throw new Error('Normal-motion expansion transition is missing')
        await page.emulateMedia({ reducedMotion: 'reduce' })
      }
      const layout = await page.evaluate(() => ({
        width: innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
        reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
        transitions: [...document.querySelectorAll<HTMLElement>('[id$="-strip"]')].map(element => getComputedStyle(element).transitionDuration),
      }))
      if (layout.scrollWidth > width) throw new Error(`Horizontal overflow at ${width}`)
      if (layout.transitions.some(duration => duration !== '0s')) throw new Error('Reduced motion transition is active')
      if (errors.length) throw new Error(errors.join('\n'))
      reports.push({ browser: name, touchReorder: touch, normalMotionChecked: width === 1440, ...layout, errors })
      await page.close()
    }
  } finally { await browser.close() }
}
await writeFile(`${directory}/report.json`, JSON.stringify(reports, null, 2))
console.log(JSON.stringify(reports, null, 2))
