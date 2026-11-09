import { chromium, firefox } from 'playwright'
for (const [name, engine] of [
  ['chromium', chromium],
  ['firefox', firefox],
] as const) {
  const browser = await engine.launch()
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 500 } })
    await page.route('**/__header-overlap.html', route =>
      route.fulfill({
        contentType: 'text/html',
        body: '<html data-theme="breadline-light"><head><script>globalThis.__sveltekit_dev={env:{}}</script></head><body><div id="app"></div><script type="module" src="/src/tests/fixtures/headerOverlapCheck.ts"></script></body></html>',
      }),
    )
    await page.goto('http://127.0.0.1:4173/__header-overlap.html')
    const visibleLabel = (visible: boolean) =>
      page.waitForFunction(expected => {
        const group = document.querySelector(
          'header > [data-adaptive-toolbar-right-group]',
        )
        const label = [...(group?.querySelectorAll('span[aria-hidden]') ?? [])].find(
          span => span.textContent?.trim() === 'Advanced',
        )
        return label?.getAttribute('aria-hidden') === String(!expected)
      }, visible)
    await visibleLabel(true)
    await page.getByRole('button', { name: 'Toggle settings panel' }).click()
    await visibleLabel(false)
    await page.waitForTimeout(350)
    const boxes = await page
      .locator('header > [data-adaptive-toolbar-right-group] button')
      .evaluateAll(buttons =>
        buttons.map(button => ({
          label: button.textContent,
          left: button.getBoundingClientRect().left,
          right: button.getBoundingClientRect().right,
        })),
      )
    for (let index = 1; index < boxes.length; index++)
      if (boxes[index].left < boxes[index - 1].right - 1)
        throw new Error(`Overlapping header buttons: ${JSON.stringify(boxes)}`)
    await page.screenshot({
      path: `output/playwright/${name}-header-settings-open.png`,
    })
    await page.getByRole('button', { name: 'Toggle settings panel' }).click()
    await visibleLabel(true)
    await page.getByRole('button', { name: 'Toggle identity width' }).click()
    await visibleLabel(false)
    await page.getByRole('button', { name: 'Toggle identity width' }).click()
    await visibleLabel(true)
    // Save adds a fourth labelled action; its intrinsic width must include Preview.
    await page.getByRole('button', { name: 'Toggle editing' }).click()
    for (const width of [1920, 1600, 1566, 1280, 1024, 768]) {
      await page.setViewportSize({ width, height: 500 })
      await page.waitForTimeout(700)
      const actions = await page
        .locator('header > [data-adaptive-toolbar-right-group] button')
        .evaluateAll(buttons =>
          buttons.map(button => ({
            label: button.textContent,
            left: button.getBoundingClientRect().left,
            right: button.getBoundingClientRect().right,
          })),
        )
      for (let index = 1; index < actions.length; index++)
        if (actions[index].left < actions[index - 1].right - 1)
          throw new Error(`${name} at ${width}: overlapping ${JSON.stringify(actions)}`)
      const avatar = actions.at(-1)
      if (!avatar || avatar.right > width)
        throw new Error(`${name} at ${width}: avatar outside viewport`)
    }
    console.log(
      `${name}: panel resize and identity reservation collapse/restore labels without overlap`,
    )
  } finally {
    await browser.close()
  }
}
