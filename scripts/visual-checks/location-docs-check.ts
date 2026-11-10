// PLAYWRIGHT
import { chromium, firefox } from 'playwright'
// NODE
import { mkdir } from 'node:fs/promises'

const origin = process.argv[2] ?? 'http://127.0.0.1:4173'
await mkdir('output/playwright', { recursive: true })
for (const [name, engine] of [
  ['chromium', chromium],
  ['firefox', firefox],
] as const) {
  const browser = await engine.launch({ headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.route('**/__location-docs.html', route =>
      route.fulfill({
        contentType: 'text/html',
        body: '<html lang="en" data-theme="hype-light"><head><style>@layer theme,base,components,utilities;</style><script>globalThis.__sveltekit_dev={env:{}}</script></head><body><div id="app"></div><script type="module" src="/src/tests/fixtures/locationDocsCheck.ts"></script></body></html>',
      }),
    )
    await page.goto(`${origin}/__location-docs.html`)
    await page.locator('svg.pele').nth(3).waitFor()
    if ((await page.locator('svg.pele').count()) !== 4)
      throw new Error('Expected four diagrams')
    // Wide diagrams use the admin surface, and wheel input scrolls the docs owner.
    await page.setViewportSize({ width: 2200, height: 1000 })
    const dimensions = await page
      .locator('figure')
      .first()
      .evaluate(el => ({
        diagram: el.getBoundingClientRect().width,
        surface: document.querySelector('main')?.getBoundingClientRect().width ?? 0,
      }))
    if (Math.abs(dimensions.surface - dimensions.diagram - 64) > 2)
      throw new Error(
        `Diagram constrained by content column: ${JSON.stringify(dimensions)}`,
      )
    const scroller = page.locator('[data-docs-scroll]')
    await scroller.hover({ position: { x: 80, y: 180 } })
    await page.mouse.wheel(0, 700)
    await page.waitForFunction(
      () => (document.querySelector('[data-docs-scroll]')?.scrollTop ?? 0) > 0,
    )
    await scroller.evaluate(el => (el.scrollTop = 0))
    await page.screenshot({ path: `output/playwright/location-docs-${name}-wide.png` })
    await page.setViewportSize({ width: 1440, height: 1000 })
    const taxonomyLayout = await page
      .locator('figure')
      .first()
      .evaluate(figure => {
        const viewport = figure.querySelector('section')
        const panel = figure.closest('[data-docs-scroll]')
        const explanation = document.querySelector('table')
        return {
          height: viewport?.getBoundingClientRect().height ?? 0,
          panelHeight: panel?.clientHeight ?? 0,
          precedesExplanations: Boolean(
            explanation &&
              figure.compareDocumentPosition(explanation) &
                Node.DOCUMENT_POSITION_FOLLOWING,
          ),
        }
      })
    if (Math.abs(taxonomyLayout.height - taxonomyLayout.panelHeight) > 2)
      throw new Error(
        `Diagram does not use visible panel height: ${JSON.stringify(taxonomyLayout)}`,
      )
    if (!taxonomyLayout.precedesExplanations)
      throw new Error('Taxonomy must precede explanations')
    const themeColors: string[] = []
    for (const theme of [
      'hype-light',
      'hype-dark',
      'breadline-light',
      'breadline-dark',
    ]) {
      await page.evaluate(
        theme => (document.documentElement.dataset.theme = theme),
        theme,
      )
      const color = await page
        .locator('svg.pele text')
        .first()
        .evaluate(el => getComputedStyle(el).fill)
      themeColors.push(color)
      await page.screenshot({
        path: `output/playwright/location-docs-${name}-${theme}.png`,
        fullPage: true,
      })
    }
    if (themeColors[0] === themeColors[1] || themeColors[2] === themeColors[3])
      throw new Error(`Diagram text did not follow theme: ${themeColors}`)
    await page.getByText('Mermaid source', { exact: true }).first().click()
    if (!(await page.locator('pre').first().isVisible()))
      throw new Error('Source disclosure failed')
    await page.getByText('Mermaid source', { exact: true }).first().click()
    await page.setViewportSize({ width: 390, height: 844 })
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    )
    if (overflow) throw new Error('Page overflows at mobile width')
    const region = page.getByRole('region', {
      name: 'Membership, occupancy and address relationships',
    })
    await region.scrollIntoViewIfNeeded()
    const bounds = await region.boundingBox()
    if (!bounds) throw new Error('Missing diagram viewport')
    await page.mouse.move(bounds.x + 240, bounds.y + 80)
    await page.mouse.down()
    await page.mouse.move(bounds.x + 60, bounds.y + 80, { steps: 8 })
    await page.mouse.up()
    if (!(await region.evaluate(el => el.scrollLeft > 0)))
      throw new Error('Diagram cannot be dragged at mobile width')
    await page.screenshot({
      path: `output/playwright/location-docs-${name}-mobile.png`,
    })
    for (const [id, label] of [
      [
        'taxonomy',
        'Location kind and class: built, geographic, operational and address',
      ],
      ['divisions', 'Division categories, classes and levels'],
      ['address', 'Address identity, revisions and content composition'],
    ]) {
      const diagram = page.getByRole('region', { name: label })
      await diagram.scrollIntoViewIfNeeded()
      await page.screenshot({
        path: `output/playwright/location-docs-${name}-${id}-mobile.png`,
      })
      await page.setViewportSize({ width: 2200, height: 1200 })
      await diagram.scrollIntoViewIfNeeded()
      await page.screenshot({
        path: `output/playwright/location-docs-${name}-${id}-wide.png`,
      })
      await page.setViewportSize({ width: 390, height: 844 })
    }
    if (errors.length) throw new Error(errors.join('\n'))
    console.log(
      JSON.stringify({
        browser: name,
        diagrams: 4,
        fullWidth: dimensions,
        verticalWheelScroll: true,
        taxonomyLayout,
        themeColors,
        mobileOverflow: false,
        sourceDisclosure: true,
      }),
    )
  } finally {
    await browser.close()
  }
}
