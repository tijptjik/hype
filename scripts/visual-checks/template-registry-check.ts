import { chromium, firefox } from 'playwright'
import { mkdir } from 'node:fs/promises'
await mkdir('output/playwright/template-registry', { recursive: true })
// Authenticated local admin persona; retain the intended establishment template, not disposable test data.
for (const [name, engine] of [
  ['chromium', chromium],
  ['firefox', firefox],
] as const) {
  const browser = await engine.launch()
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
    await page.goto('http://127.0.0.1:4173/admin/templates')
    await page.getByRole('button', { name: 'New template', exact: true }).waitFor()
    await page.waitForFunction(
      () => !document.querySelector('[aria-label="Loading templates"]'),
    )
    if (await page.getByRole('alert').count())
      throw Error(await page.getByRole('alert').innerText())
    if (
      name === 'chromium' &&
      !(await page.getByRole('button', { name: /Establishment name/ }).count())
    ) {
      await page.getByRole('button', { name: 'New template', exact: true }).click()
      await page
        .getByRole('textbox', { name: 'Name', exact: true })
        .fill('Establishment name')
      await page
        .getByRole('textbox', { name: 'Code', exact: true })
        .fill('establishment-name')
      for (const locale of ['en', 'zh-Hant', 'zh-Hans']) {
        await page.getByRole('button', { name: locale, exact: true }).click()
        await page
          .getByRole('textbox', { name: 'Expression', exact: true })
          .fill('{{ pair(format.name ?? brand.name, branch, " - ") ?? source.name }}')
      }
      await page.getByRole('button', { name: 'Save', exact: true }).click()
      await page.getByText('Version saved', { exact: true }).waitFor()
      await page.reload()
    }
    await page.getByRole('button', { name: /Establishment name/ }).waitFor()
    await page.getByRole('button', { name: /Establishment name/ }).click()
    if (
      !(
        await page
          .getByRole('textbox', { name: 'Expression', exact: true })
          .inputValue()
      ).includes('pair(format.name')
    )
      throw Error('Saved expression missing')
    await page.screenshot({
      path: `output/playwright/template-registry/${name}.png`,
      fullPage: true,
    })
    console.log(
      name + ': authenticated registry loads, saved template persists, no error',
    )
  } finally {
    await browser.close()
  }
}
