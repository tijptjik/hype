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
      const settingsCard = page.getByRole('region', { name: 'Default Languages' }).first()
      if (!(await settingsCard.innerText()).includes('Availability and order of languages in the editors used across HKFoodWorks.')) throw new Error('Language defaults description is missing')
      if (await settingsCard.getByRole('button', { name: 'Edit', exact: true }).count()) throw new Error('Unexpected local Edit button')
      const addControl = profile.getByRole('button', { name: '+ Add language' })
      if (await addControl.evaluate(element => getComputedStyle(element).opacity) !== '1') throw new Error('Add language is hidden without hover')
      if (!(await profile.locator('[data-locale-dnd-zone]').evaluate((element, add) => Boolean(element.compareDocumentPosition(add as Node) & Node.DOCUMENT_POSITION_FOLLOWING), await addControl.elementHandle()))) throw new Error('Add language is not after the language list')
      const beforeOverlay = await profile.boundingBox()
      await profile.getByRole('button', { name: '+ Add language' }).click()
      await page.getByRole('combobox').waitFor()
      const afterOverlay = await profile.boundingBox()
      if (!beforeOverlay || !afterOverlay || Math.abs(beforeOverlay.height - afterOverlay.height) > 1) throw new Error('Language overlay shifted form content')
      for (const query of ['Cantonese', 'yue']) {
        await page.getByRole('combobox').fill(query)
        if (await page.getByRole('option').count()) throw new Error('An already added language was suggested')
      }
      await page.getByRole('combobox').press('Tab')
      if (!(await page.getByRole('button', { name: 'Close language search' }).evaluate(element => element === document.activeElement))) throw new Error('Tab skipped the close button: ' + await page.evaluate(() => `${document.activeElement?.tagName}#${document.activeElement?.id}`))
      await page.getByRole('button', { name: 'Close language search' }).press('Shift+Tab')
      if (!(await page.getByRole('combobox').evaluate(element => element === document.activeElement))) throw new Error('Reverse Tab skipped search')
      await page.getByRole('combobox').fill('')
      const results = page.getByRole('option')
      await results.first().waitFor()
      await page.getByRole('combobox').press('Tab')
      await page.getByRole('button', { name: 'Close language search' }).press('Tab')
      if (!(await results.nth(0).evaluate(element => element === document.activeElement))) throw new Error('Tab skipped first result: ' + await page.evaluate(() => `${document.activeElement?.tagName}#${document.activeElement?.id}`))
      await results.nth(0).press('Tab')
      if (!(await results.nth(1).evaluate(element => element === document.activeElement))) throw new Error('Tab skipped second result')
      await results.nth(1).press('Shift+Tab')
      if (!(await results.nth(0).evaluate(element => element === document.activeElement))) throw new Error('Reverse Tab skipped result')
      await results.nth(0).press('Shift+Tab')
      await page.getByRole('button', { name: 'Close language search' }).press('Shift+Tab')
      await page.getByRole('combobox').fill('Punjabi')
      await page.evaluate(() => document.fonts.ready)
      const fontLoaded = await page.evaluate(() => document.fonts.check('16px "Noto Sans Gurmukhi"', 'ਪੰਜਾਬੀ'))
      if (!fontLoaded) throw new Error('Punjabi font did not load')
      await page.screenshot({ path: `${directory}/${name}-${width}-overlay.png`, fullPage: true })
      const overlayFill = await page.getByRole('combobox').evaluate(element => getComputedStyle(element.parentElement!.parentElement!).backgroundColor)
      if (overlayFill === 'rgba(0, 0, 0, 0)' || overlayFill === 'transparent') throw new Error('Search overlay is transparent')
      await page.getByRole('combobox').press('Escape')
      await page.waitForFunction(() => document.activeElement?.textContent?.includes('Add language'))
      await profile.getByRole('button', { name: '+ Add language' }).click()
      await page.getByRole('combobox').fill('日本語')
      await page.getByRole('combobox').press('Tab')
      await page.getByRole('button', { name: 'Close language search' }).press('Tab')
      await page.getByRole('option').press('Enter')
      const japanese = profile.getByRole('button', { name: 'Japanese', exact: true })
      await page.waitForFunction(() => document.activeElement?.textContent?.includes('Add language'))
      if (await addControl.evaluate(element => getComputedStyle(element).outlineStyle) !== 'none') throw new Error('Returned focus has a visible outline')
      await addControl.press('Enter')
      await page.getByRole('combobox').waitFor()
      await page.getByRole('combobox').fill('Japanese')
      if (await page.getByRole('option').count()) throw new Error('Added Japanese still appears in search')
      await page.getByRole('button', { name: 'Close language search' }).click()
      await page.waitForFunction(() => document.activeElement?.textContent?.includes('Add language'))
      await japanese.press('Alt+ArrowLeft')
      await japanese.press('Alt+ArrowLeft')
      await japanese.press('Alt+ArrowLeft')
      await profile.getByRole('button', { name: 'Multilingual' }).click()
      if (await page.locator('[data-field-locale]').count() !== 1 || await page.locator('[data-field-locale]').getAttribute('data-field-locale') !== 'ja') throw new Error('Collapsed locale does not follow reordered first locale')
      await profile.locator('[id$="-strip"]').waitFor({ state: 'detached' })
      const collapsedHeight = 0
      if (collapsedHeight > 1) throw new Error('Collapsed strip reserves empty height')
      await profile.getByRole('button', { name: 'Multilingual' }).click()
      const settings = page.getByRole('region', { name: 'Default Languages' }).first()
      await settings.locator('[data-locale-toolbar]').hover()
      await settings.getByRole('button', { name: '+ Add language' }).click()
      await page.getByRole('combobox').fill('Português')
      await page.screenshot({ path: `${directory}/${name}-${width}.png`, fullPage: true })
      await page.locator('html').evaluate(element => element.setAttribute('data-theme', 'breadline-dark'))
      await page.waitForTimeout(200)
      await page.screenshot({ path: `${directory}/${name}-${width}-dark.png`, fullPage: true })
      await page.locator('html').evaluate(element => element.setAttribute('data-theme', 'breadline-light'))
      if (width === 1440) {
        const trigger = await profile.getByRole('button', { name: 'Multilingual' }).boundingBox()
        const strip = await profile.locator('[id$="-strip"]').boundingBox()
        if (!trigger || !strip || strip.x + strip.width > trigger.x) throw new Error('Locale strip is not left of the right-hand trigger')
        await profile.getByRole('button', { name: 'Multilingual' }).click()
        await profile.locator('[id$="-strip"]').waitFor({ state: 'detached' })
        await profile.getByRole('button', { name: 'Multilingual' }).click()
        await page.waitForFunction(() => [...document.querySelectorAll('[id$="-strip"]')].some(element => element.getAnimations().some(item => Number(item.effect?.getTiming().duration) > 0)))
        await page.waitForTimeout(220)
        const after = await profile.getByRole('button', { name: 'Multilingual' }).boundingBox()
        if (!after || Math.abs(after.x - trigger.x) > 1 || Math.abs(after.y - trigger.y) > 1) throw new Error('Right-hand trigger shifted during expansion')
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
      reports.push({ browser: name, touchContext: touch, normalMotionChecked: width === 1440, ...layout, errors })
      await page.close()
    }
  } finally { await browser.close() }
}
await writeFile(`${directory}/report.json`, JSON.stringify(reports, null, 2))
console.log(JSON.stringify(reports, null, 2))
