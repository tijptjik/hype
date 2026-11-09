import { browserCases } from './lib/browser-cases'
import { mkdir } from 'node:fs/promises'
await mkdir('output/playwright/profile-edit-layout', { recursive: true })
for await (const { name, browser } of browserCases()) {
  for (const width of [390, 1440]) {
    const page = await browser.newPage({
      viewport: { width, height: 1000 },
      reducedMotion: width === 1440 ? 'no-preference' : 'reduce',
    })
    await page.route('**/__profile-layout.html', route =>
      route.fulfill({
        contentType: 'text/html',
        body: '<html lang="en" data-theme="breadline-dark"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>@layer theme,base,components,utilities;</style><script>globalThis.__sveltekit_dev={env:{}}</script></head><body><div id="app"></div><script type="module" src="/src/tests/fixtures/featureProfileCheck.ts"></script></body></html>',
      }),
    )
    await page.goto('http://127.0.0.1:4173/__profile-layout.html')
    const display = page.getByRole('button', { name: 'description en', exact: true })
    await display.click()
    const input = page.getByRole('textbox', { name: 'description en', exact: true })
    await input.fill(
      Array(12)
        .fill(
          'The shoemaker worked here for many years. Neighbours remember his careful craftsmanship and the stories he shared with visitors.',
        )
        .join('\n\n'),
    )
    await page.getByRole('button', { name: 'Checkpoint draft' }).click()
    const before = await display.boundingBox()
    await display.click()
    const after = await input.evaluate(element => {
      const box = element.closest('.bits-form__control-wrap')!.getBoundingClientRect()
      return { width: box.width, height: box.height }
    })
    if (
      !before ||
      !after ||
      before.height < 384 ||
      Math.abs(before.height - after.height) > 1 ||
      Math.abs(before.width - after.width) > 1
    )
      throw new Error(`Focus changed size ${JSON.stringify({ before, after })}`)
    await input.fill(
      Array(18)
        .fill(
          'More text typed into this description should expand its height instead of adding an internal scrollbar.',
        )
        .join('\n\n'),
    )
    const growth = await input.evaluate(element => ({
      height: element.getBoundingClientRect().height,
      scroll: element.scrollHeight,
      client: element.clientHeight,
    }))
    if (growth.scroll > growth.client + 1 || growth.height <= after.height)
      throw new Error(`Description did not grow: ${JSON.stringify(growth)}`)
    await page.getByRole('button', { name: 'Checkpoint draft' }).click()
    await page.getByRole('button', { name: 'Use Location name', exact: true }).click()
    if (await page.getByText('Linked · read-only').count())
      throw new Error('Duplicate link indicator')
    await page.getByRole('button', { name: 'Edit Location', exact: true }).waitFor()
    const linked = page.locator('[data-profile-derived]')
    await linked.hover()
    const geometry = await linked.evaluate(element => {
      const box = element.getBoundingClientRect()
      const field = element.closest('[data-profile-field]')!.getBoundingClientRect()
      const header = element.parentElement!.querySelector('h3')!.getBoundingClientRect()
      return {
        width: box.width,
        fieldWidth: field.width,
        y: box.y,
        headerY: header.y,
        height: box.height,
      }
    })
    if (
      width === 1440 &&
      (geometry.width >= geometry.fieldWidth - 10 ||
        Math.abs(geometry.y + geometry.height / 2 - geometry.headerY - 10) > 5)
    )
      throw new Error(
        `Linked controls do not fit beside Title: ${JSON.stringify(geometry)}`,
      )

    await page.getByRole('button', { name: 'Unlink', exact: true }).waitFor()
    await page.getByRole('button', { name: 'Unlink', exact: true }).click()
    await page.getByRole('button', { name: 'title en', exact: true }).waitFor()
    await page.getByRole('button', { name: 'Use Location name', exact: true }).click()
    await page.getByRole('button', { name: 'Multilingual', exact: true }).click()
    const add = await page
      .getByRole('button', { name: '+ Add', exact: true })
      .boundingBox()
    const first = await page.locator('[data-locale="en"]').boundingBox()
    if (!add || !first || (add.y >= first.y && add.x >= first.x))
      throw new Error('Add is not first')
    await page.screenshot({
      path: `output/playwright/profile-edit-layout/${name}-${width}.png`,
    })
    await page.getByRole('button', { name: 'Toggle editing' }).click()
    await page
      .getByRole('button', { name: 'Edit Location', exact: true })
      .waitFor({ state: 'hidden' })
    console.log(
      `${name} ${width}: stable textarea, Add-first toolbar, single link indicator passed`,
    )
    await page.close()
  }
}
