// PLAYWRIGHT
import { chromium, firefox } from 'playwright'

for (const [name, engine] of [['chromium', chromium], ['firefox', firefox]] as const) {
  const browser = await engine.launch()
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' })
    await page.route('**/__locale-drag.html', route => route.fulfill({ contentType: 'text/html', body: '<html data-theme="breadline-light"><head><script>globalThis.__sveltekit_dev={env:{}}</script></head><body><div id="app"></div><script type="module" src="/src/tests/fixtures/localeControlsCheck.ts"></script></body></html>' }))
    await page.goto('http://127.0.0.1:4173/__locale-drag.html')
    const settings = page.getByRole('region', { name: 'Default Languages' }).first()
    const english = settings.locator('[data-locale="en"]')
    await english.waitFor()
    const start = await english.boundingBox()
    const end = await settings.locator('[data-locale="zh-Hans"]').boundingBox()
    if (!start || !end) throw new Error('Missing locale chip')
    // Start on the text body, away from the grip, and require the library's floating clone.
    await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2)
    await page.mouse.down()
    await page.mouse.move(start.x + start.width / 2 + 12, start.y + start.height / 2, { steps: 4 })
    await page.locator('#dnd-action-dragged-el').waitFor()
    await page.mouse.move(end.x + end.width / 2, end.y + end.height / 2, { steps: 15 })
    await page.waitForTimeout(250)
    await page.mouse.up()
    await page.waitForFunction(() => JSON.parse(document.querySelector('[data-locale-state]')!.getAttribute('data-locale-state')!).override?.at(-1) === 'en')
    // A click on the body does not remove a default language; only its X does.
    await english.click()
    if (await settings.locator('[data-locale]').count() !== 3) throw new Error('Body click removed a locale')
    await settings.getByRole('button', { name: 'Remove English', exact: true }).click()
    await page.waitForFunction(() => !JSON.parse(document.querySelector('[data-locale-state]')!.getAttribute('data-locale-state')!).override?.includes('en'))
    console.log(`${name}: whole-chip drag clone, reorder and separate remove pass`)
  } finally { await browser.close() }
}
