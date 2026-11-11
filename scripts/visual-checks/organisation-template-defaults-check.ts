// NODE
import { mkdir } from 'node:fs/promises'
// BROWSER
import { chromium, firefox } from 'playwright'

const origin = process.argv[2] ?? 'http://127.0.0.1:4174'
const organisation = process.argv[3] ?? '2u4orWMxRNbz'
await mkdir('output/playwright/template-defaults', { recursive: true })
for (const [name, engine] of [
  ['chromium', chromium],
  ['firefox', firefox],
] as const) {
  const browser = await engine.launch()
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
    page.on('pageerror', error => console.error(error.message))
    await page.goto(`${origin}/admin/templates?organisation=${organisation}`)
    const section = page.getByRole('region', { name: 'Organisation naming defaults' })
    const select = section.locator('select').first()
    await select.waitFor()
    const original = await select.inputValue()
    const next = await select
      .locator('option')
      .evaluateAll(
        options => options.find(option => option.value && !option.disabled)?.value,
      )
    if (!next || original)
      throw Error(
        'Use an Organisation with an inherited default and a community template',
      )
    await select.selectOption(next)
    await section.getByRole('button', { name: 'Save default' }).first().click()
    await page.waitForFunction(() => {
      const section = document.querySelector(
        'section[aria-label="Organisation naming defaults"]',
      )
      const field = section?.querySelector('select')
      return (
        field &&
        !field.disabled &&
        section?.querySelector('button')?.hasAttribute('disabled')
      )
    })
    await page.reload()
    await select.waitFor()
    if ((await select.inputValue()) !== next) throw Error('Default did not persist')
    await page.screenshot({
      path: `output/playwright/template-defaults/${name}.png`,
      fullPage: true,
    })
    // Restore inheritance using the same public editor, retaining attributed policy history.
    await select.selectOption('')
    await section.getByRole('button', { name: 'Save default' }).first().click()
    await page.waitForFunction(() => {
      const section = document.querySelector(
        'section[aria-label="Organisation naming defaults"]',
      )
      const field = section?.querySelector('select')
      return (
        field &&
        !field.disabled &&
        section?.querySelector('button')?.hasAttribute('disabled')
      )
    })
    await page.reload()
    await select.waitFor()
    if ((await select.inputValue()) !== '') throw Error('Reset did not persist')
    if (await page.getByRole('alert').count())
      throw Error(
        await page
          .getByRole('alert')
          .allTextContents()
          .then(values => values.join('\n')),
      )
    console.log(`${name}: Organisation default save, reload and reset passed`)
  } finally {
    await browser.close()
  }
}
