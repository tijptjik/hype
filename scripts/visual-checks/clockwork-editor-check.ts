import { chromium, firefox } from 'playwright'
import { mkdir } from 'node:fs/promises'
await mkdir('output/playwright', { recursive: true })
for (const engine of [chromium, firefox]) {
  const browser = await engine.launch()
  try {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1100 },
      reducedMotion: 'reduce',
    })
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.route('**/__clockwork-editor.html', route =>
      route.fulfill({
        contentType: 'text/html',
        body: '<html lang="en" data-theme="breadline-light"><head><style>@layer theme,base,components,utilities;</style><script>globalThis.__sveltekit_dev={env:{}}</script></head><body><div id="app"></div><script type="module" src="/src/tests/fixtures/clockworkEditorCheck.ts"></script></body></html>',
      }),
    )
    await page.goto('http://127.0.0.1:4173/__clockwork-editor.html')
    const building = page.locator('[data-address-group="buildingName"]')
    await building
      .getByRole('button', { name: 'Replace: Por Mee Factory Building', exact: true })
      .waitFor({ timeout: 60000 })
    const legends = await building.locator('legend').evaluateAll(nodes =>
      nodes.map(n => ({
        text: n.textContent?.trim(),
        y: n.getBoundingClientRect().y,
      })),
    )
    const buildingTitle = legends.find(n => n.text?.startsWith('Name'))
    const blockTitle = legends.find(n => n.text?.startsWith('Block'))
    if (!buildingTitle || !blockTitle || Math.abs(buildingTitle.y - blockTitle.y) > 2)
      throw Error('Name and Block headings are not aligned: ' + JSON.stringify(legends))
    const street = page.locator('[data-address-group="buildingNumberExpression"]')
    const number = street.getByRole('textbox').first()
    const locale = street.locator('span.font-mono').first()
    const name = street.getByRole('button', {
      name: 'Replace: Castle Peak Road',
      exact: true,
    })
    const buildingName = building.getByRole('button', {
      name: 'Replace: Por Mee Factory Building',
      exact: true,
    })
    for (const control of [name, buildingName]) {
      const icon = await control.locator('svg').boundingBox()
      if (!icon || icon.width < 27) throw Error('Name icon is not prominent')
      const fits = await control.evaluate(el => {
        const viewport = el.querySelector('.bits-scrollable-text')!
        const text = el.querySelector('.bits-scrollable-text__content')!
        return (
          viewport.getBoundingClientRect().width > 0 &&
          text.getBoundingClientRect().width <=
            viewport.getBoundingClientRect().width + 1
        )
      })
      if (!fits) throw Error('Selected address name is clipped at desktop width')
    }
    const bounds = await Promise.all([number, locale, name].map(n => n.boundingBox()))
    if (
      bounds.some(b => !b) ||
      !(bounds[0]!.x < bounds[1]!.x && bounds[1]!.x < bounds[2]!.x)
    )
      throw Error('Street locale must follow shared number: ' + JSON.stringify(bounds))
    const mapHeight = await page
      .locator('[data-editor-map]')
      .evaluate(n => n.getBoundingClientRect().height)
    if (Math.abs(mapHeight - 320) > 2)
      throw Error('Map does not reserve 320px: ' + mapHeight)
    const metadata = await page.locator('[data-association-status]').boundingBox()
    const editor = await page
      .locator('[data-association-status]')
      .evaluate(el => el.closest('section')!.getBoundingClientRect().toJSON())
    if (
      !metadata ||
      metadata.x < editor.x + editor.width / 2 ||
      Math.abs(metadata.x + metadata.width - editor.right) > 40
    )
      throw Error('Association metadata is not at the right of the editor')
    await page.getByRole('button', { name: 'Mobility access', exact: true }).click()
    await page.getByRole('heading', { name: 'Mobility access', exact: true }).waitFor()
    await page.screenshot({
      path: `output/playwright/clockwork-editor-${engine.name()}.png`,
      fullPage: true,
    })
    await page.getByRole('button', { name: 'Toggle editor' }).click()
    if (
      await page.getByRole('heading', { name: 'Mobility access', exact: true }).count()
    )
      throw Error('Empty mobility shown in viewer')
    await page.getByRole('button', { name: 'Toggle editor' }).click()
    await page.getByRole('button', { name: 'Remove building name' }).click()
    const block = page.locator('[data-address-group="blockExpression"]')
    const heading = await block
      .getByRole('heading', { name: 'Building', exact: true })
      .boundingBox()
    const blockLegend = await block.locator('legend').first().boundingBox()
    if (!heading || !blockLegend || heading.y >= blockLegend.y)
      throw Error('Block-only group lost its Building section heading')
    if (errors.length) throw Error(errors.join('\n'))
    console.log(
      engine.name() +
        ': PASS compact map, aligned building headings, shared number before locale, mobility editable and empty viewer hidden',
    )
  } finally {
    await browser.close()
  }
}
