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
    const panes = page.locator(
      '[data-address-additions], [data-address-details], [data-address-divisions-panel] > div',
    )
    await page.locator('[data-editor-container]').evaluate(node => {
      node.style.height = '240px'
    })
    const geometry = await panes.evaluateAll(nodes =>
      nodes.map(node => ({
        height: node.clientHeight,
        contentHeight: node.scrollHeight,
        overflow: getComputedStyle(node).overflowY,
      })),
    )
    if (
      geometry.length !== 3 ||
      geometry.some(
        pane => pane.overflow !== 'auto' || pane.contentHeight <= pane.height,
      )
    )
      throw Error(JSON.stringify(geometry))
    const metadata = await page.locator('[data-address-additions]').evaluate(node => {
      const controls = node.firstElementChild
      const metadata = node.lastElementChild
      if (!controls || !metadata) throw Error('Missing sidebar content')
      return {
        controlsBottom: controls.getBoundingClientRect().bottom,
        metadataTop: metadata.getBoundingClientRect().top,
      }
    })
    if (metadata.metadataTop < metadata.controlsBottom)
      throw Error('Metadata overlaps controls')
    for (let index = 0; index < 3; index++) {
      await panes.nth(index).evaluate(node => {
        node.scrollTop = node.scrollHeight
      })
      const positions = await panes.evaluateAll(nodes =>
        nodes.map(node => node.scrollTop),
      )
      if (
        !positions[index] ||
        positions.some((top, other) => other !== index && top !== 0)
      )
        throw Error(`Panes did not scroll independently: ${positions}`)
      await panes.nth(index).evaluate(node => {
        node.scrollTop = 0
      })
    }
    if (
      await scroll.evaluate(
        node => node.scrollTop !== 0 || node.scrollHeight > node.clientHeight + 1,
      )
    )
      throw Error('Outer editor should not scroll')
    await page.screenshot({
      path: `output/playwright/address-panels-${name}-independent-scroll.png`,
    })
    await page.locator('[data-editor-container]').evaluate(node => {
      node.style.height = '700px'
    })
    const bottoms = await panes.evaluateAll(nodes =>
      nodes.map(node => node.getBoundingClientRect().bottom),
    )
    if (Math.max(...bottoms) - Math.min(...bottoms) > 1)
      throw Error(`Panel bottoms differ: ${bottoms}`)
    await page.screenshot({
      path: `output/playwright/address-panels-${name}-full-height.png`,
    })
    if (errors.length) throw Error(errors.join('\n'))
    console.log(
      JSON.stringify({ browser: name, geometry, independentScroll: true, bottoms }),
    )
  } finally {
    await browser.close()
  }
}
