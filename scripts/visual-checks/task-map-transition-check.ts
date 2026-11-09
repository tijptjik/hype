import { browserCases } from './lib/browser-cases'
import { mkdir } from 'node:fs/promises'

await mkdir('output/playwright/map-settle', { recursive: true })
const base = process.env.FEATURE_CHECK_URL ?? 'http://hype.localhost'

for await (const { name, browser } of browserCases({ map: true })) {
  const page = await browser.newPage({ viewport: { width: 1000, height: 900 } })
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.route('**/__map-settle.html', r =>
    r.fulfill({
      contentType: 'text/html',
      body: `<html><head><script>globalThis.__sveltekit_dev={env:{}}</script><style>@layer theme,base,components,utilities;</style></head><body style="margin:0"><div id="app" style="width:700px;height:600px;margin:80px"></div><script type="module" src="/src/tests/fixtures/taskMapTransitionCheck.ts"></script></body></html>`,
    }),
  )
  await page.route('**/src/lib/map/styles/definitions/etch.ts', r =>
    r.fulfill({
      contentType: 'application/javascript',
      body: `export function buildEtchStyle(){return {version:8,sources:{},layers:[{id:'background',type:'background',paint:{'background-color':'#f04d7f'}}]}}`,
    }),
  )
  await page.goto(`${base}/__map-settle.html`, {
    waitUntil: 'domcontentloaded',
  })
  await page.getByRole('button', { name: 'Open fullscreen map' }).waitFor()
  await page.waitForTimeout(5000)
  await page.screenshot({ path: `output/playwright/map-settle/${name}-before.png` })
  await page.getByRole('button', { name: 'Open fullscreen map' }).click()
  await page.waitForTimeout(800)
  await page.screenshot({ path: `output/playwright/map-settle/${name}-full.png` })
  await page.evaluate(() => {
    ;(window as any).resizeSnapshots = 0
    new MutationObserver(records => {
      for (const record of records)
        for (const node of record.addedNodes)
          if (node instanceof Element && node.matches('[data-map-resize-snapshot]'))
            (window as any).resizeSnapshots++
    }).observe(document.body, { childList: true, subtree: true })
  })
  await page.getByRole('button', { name: 'Exit fullscreen map' }).click()
  for (let i = 0; i < 7; i++) {
    await page.screenshot({
      path: `output/playwright/map-settle/${name}-return-${i}.png`,
    })
    await page.waitForTimeout(50)
  }
  if (await page.evaluate(() => (window as any).resizeSnapshots))
    throw Error('Resize copied the WebGL canvas')
  const canvas = page.locator('.maplibregl-canvas')
  if (
    (await canvas.count()) !== 1 ||
    (await canvas.evaluate(node => getComputedStyle(node).opacity)) !== '1'
  )
    throw Error('Original canvas was not retained visibly')
  if (errors.length) throw Error(errors.join('\n'))
  console.log(`${name}: original canvas retained through fullscreen return`)
}
