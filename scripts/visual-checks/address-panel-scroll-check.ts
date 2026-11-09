import { chromium, firefox } from 'playwright'
import { mkdir } from 'node:fs/promises'
await mkdir('output/playwright', { recursive: true })
for (const [name, engine] of [
  ['chromium', chromium],
  ['firefox', firefox],
] as const) {
  const browser = await engine.launch()
  const page = await browser.newPage({ viewport: { width: 1440, height: 850 } })
  const errors: string[] = []
  page.setDefaultTimeout(15000)
  page.on('pageerror', error => {
    errors.push(error.message)
    console.error(error.message)
  })
  try {
    const memberships = [
      ['Lantau', 'major_island', 'landform', 1],
      ['Tsuen Wan', 'district', 'administrative', 2],
      ['New Territories', 'region', 'administrative', 1],
      ['Hong Kong', 'country', 'administrative', 0],
      ['Hong Kong Disneyland Resort', 'neighbourhood', 'hood', 5],
    ].map(([id, kind, category, level]) => ({
      id,
      class: kind,
      category,
      level,
      names: { en: { name: id } },
    }))
    await page.route('**/src/lib/api/division.remote.ts*', route =>
      route.fulfill({
        contentType: 'text/javascript',
        body: `export async function getAddressDivisionContext(){return ${JSON.stringify({ available: true, memberships, options: memberships })}}; export function getAddressDivisionLabel(){return {current:null}}; export async function getDivisionGeometry(){return null}`,
      }),
    )
    await page.route('**/__address-panel-scroll.html', route =>
      route.fulfill({
        contentType: 'text/html',
        body: '<html data-theme="breadline-light"><head><meta name="viewport" content="width=device-width,initial-scale=1"><script>globalThis.__sveltekit_dev={env:{}}</script></head><body><div id="app"></div><script type="module" src="/src/tests/fixtures/addressPanelScrollCheck.ts"></script></body></html>',
      }),
    )
    await page.goto('http://127.0.0.1:4173/__address-panel-scroll.html')
    await page
      .getByText('Lantau', { exact: true })
      .waitFor()
      .catch(async error => {
        console.log((await page.locator('body').innerText()).slice(0, 1500))
        throw error
      })
    await page.evaluate(() => document.fonts.ready)
    const scroll = page.locator('[data-address-scroll]')
    const panels = page.locator(
      '[data-address-additions], [data-address-divisions-panel]',
    )
    const geometry = await panels.evaluateAll(nodes =>
      nodes.map(node => {
        const row = node.closest('[data-address-editor-layout]')!
        return {
          panelHeight: node.getBoundingClientRect().height,
          rowHeight: row.getBoundingClientRect().height,
          nestedScrollers: [node, ...node.querySelectorAll('*')].filter(
            element =>
              /auto|scroll/.test(getComputedStyle(element).overflowY) &&
              element.scrollHeight > element.clientHeight + 1,
          ).length,
        }
      }),
    )
    if (
      geometry.length !== 2 ||
      geometry.some(
        panel => panel.nestedScrollers || panel.rowHeight < panel.panelHeight,
      )
    )
      throw new Error(JSON.stringify(geometry))
    if (!(await scroll.evaluate(node => node.scrollHeight > node.clientHeight)))
      throw new Error('Containing panel should scroll')
    const before = await panels.evaluateAll(nodes =>
      nodes.map(node => node.getBoundingClientRect().y),
    )
    await scroll.evaluate(node => {
      node.scrollTop = node.scrollHeight
    })
    const delta = await scroll.evaluate(node => node.scrollTop)
    const after = await panels.evaluateAll(nodes =>
      nodes.map(node => node.getBoundingClientRect().y),
    )
    if (!delta || before.some((y, index) => Math.abs(y - after[index] - delta) > 1))
      throw new Error('Panels did not scroll together')
    await page.screenshot({
      path: `output/playwright/address-panels-${name}-shared-scroll.png`,
    })
    if (errors.length) throw new Error(errors.join('\n'))
    console.log(
      JSON.stringify({ browser: name, geometry, sharedScrollDistance: delta }),
    )
  } finally {
    await browser.close()
  }
}
