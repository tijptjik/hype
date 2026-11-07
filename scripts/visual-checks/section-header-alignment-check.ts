// Run from the repository root with dev-check bun scripts/visual-checks/section-header-alignment-check.ts.
// Retain the important minimum used by formSelectionSearchHeaderStyles: it caused the original regression.
import { chromium, firefox } from 'playwright'
const source = await Bun.file(
  'src/lib/bits/patterns/forms/formSurface/alignSectionHeaders.ts',
).text()
const js = new Bun.Transpiler({ loader: 'ts' })
  .transformSync(source)
  .replace('export function', 'function')
for (const [name, engine] of [
  ['chromium', chromium],
  ['firefox', firefox],
] as const) {
  const browser = await engine.launch()
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 800 } })
    const errors: string[] = []
    page.on('pageerror', e => errors.push(e.message))
    await page.setContent(
      `<style>*{box-sizing:border-box}body{margin:0;font:16px sans-serif}.row{display:grid;grid-template-columns:repeat(3,minmax(0,1fr))}.column{min-width:0;border:1px solid #777}header{display:grid;align-items:center;grid-template-columns:minmax(0,1fr) auto;min-height:68px!important;padding:12px 24px;background:#342536;color:white}h2{font-size:20px;margin:0}p{font-size:12px;margin:4px 0 0}article{height:80px}@media(max-width:600px){.row{grid-template-columns:1fr}}</style><div data-form-surface><div class="row">${['Map Style', 'Marker Style', 'Card Style'].map((title, i) => `<div class="column"><section><header class="bits-form__section-header"><div><h2>${title}</h2><p>${['Choose the basemap assigned to this project.', 'Choose how locations appear on the map.', 'Choose how features are displayed.'][i]}</p></div><div></div></header><article>Content</article></section></div>`).join('')}</div></div>`,
    )
    await page.addScriptTag({
      content:
        js +
        ';globalThis.cleanup=alignSectionHeaders(document.querySelector("[data-form-surface]"))',
    })
    const sizes = () =>
      page
        .locator('header')
        .evaluateAll(es => es.map(e => e.getBoundingClientRect().height))
    const settle = () => page.waitForTimeout(150)
    const equal = async (label: string) => {
      await settle()
      const h = await sizes()
      if (Math.max(...h) - Math.min(...h) > 1) throw Error(label + JSON.stringify(h))
      return h[0]
    }
    const wide = await equal('initial')
    await page.setViewportSize({ width: 700, height: 800 })
    const narrow = await equal('wrap')
    if (narrow <= wide) throw Error('description did not wrap')
    await page
      .locator('p')
      .first()
      .evaluate(e => (e.textContent = 'A much longer description '.repeat(12)))
    const tall = await equal('dynamic growth')
    if (tall <= narrow) throw Error('no growth')
    await page
      .locator('p')
      .first()
      .evaluate(e => (e.textContent = 'Short'))
    const short = await equal('dynamic shrink')
    if (short >= tall) throw Error('no shrink')
    await page.setViewportSize({ width: 390, height: 800 })
    await page
      .locator('p')
      .first()
      .evaluate(e => (e.textContent = 'A much longer description '.repeat(12)))
    await settle()
    const stacked = await sizes()
    if (stacked[0] <= stacked[1]) throw Error('stacked headers incorrectly matched')
    await page.setViewportSize({ width: 700, height: 800 })
    await equal('restore columns')
    await page.screenshot({
      path: 'output/playwright/' + name + '-section-header-alignment.png',
    })
    await page
      .locator('.column')
      .first()
      .evaluate(e => e.remove())
    await equal('remove tallest')
    if (errors.length) throw Error(errors.join('\n'))
    console.log(
      name + ': wrapping, growth, shrinkage, stacked layout, resize and removal passed',
    )
  } finally {
    await browser.close()
  }
}
