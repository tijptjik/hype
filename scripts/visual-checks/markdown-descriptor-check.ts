// NODE
import assert from 'node:assert/strict'
// PLAYWRIGHT
import { chromium, firefox } from 'playwright'

for (const [name, engine] of [
  ['chromium', chromium],
  ['firefox', firefox],
] as const) {
  const browser = await engine.launch({ headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 1300, height: 800 } })
    await page.route('**/__markdown-descriptor.html', route =>
      route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><html lang="en" data-theme="breadline-light"><head><style>@layer theme,base,components,utilities;</style><script>globalThis.__sveltekit_dev={env:{}}</script></head><body><div id="app"></div><script type="module" src="/src/tests/fixtures/descriptorProfileCheck.ts"></script></body></html>',
      }),
    )
    await page.goto('http://127.0.0.1:4173/__markdown-descriptor.html')
    await page.getByRole('button', { name: 'Hub profile', exact: true }).click()
    await page.getByRole('button', { name: 'Policies tab', exact: true }).click()
    await page.getByRole('button', { name: 'Toggle editing', exact: true }).click()
    await page.getByRole('button', { name: 'Multilingual', exact: true }).click()
    const field = page.locator('[data-profile-field="privacyPolicy"]')
    await field
      .locator('[data-profile-locale="en"] [data-inline-locale-row] [role="button"]')
      .click()
    const toolbar = field.locator('[data-markdown-toolbar]')
    await toolbar.getByRole('button', { name: 'Bold', exact: true }).waitFor()
    assert(
      await toolbar.locator('[data-profile-sources]').isVisible(),
      'Translation controls belong inside editor toolbar',
    )
    assert(
      !(await field
        .locator('[data-profile-field-header] [data-profile-sources]')
        .isVisible()),
      'No duplicate translation strip above editor',
    )
    await toolbar.getByRole('button', { name: 'Markdown', exact: true }).click()
    await field
      .locator('textarea:visible')
      .fill(
        Array.from(
          { length: 30 },
          (_, i) => `## Section ${i}\n\nLong policy content.`,
        ).join('\n\n'),
      )
    await toolbar.getByRole('button', { name: 'Visual', exact: true }).click()
    await toolbar.getByRole('button', { name: 'Bold', exact: true }).waitFor()
    const before = await page
      .locator('[data-descriptor-state]')
      .getAttribute('data-descriptor-state')
    await toolbar
      .getByRole('button', { name: /Translate empty values from English/ })
      .click()
    await page.waitForFunction(
      before =>
        document
          .querySelector('[data-descriptor-state]')
          ?.getAttribute('data-descriptor-state') !== before,
      before,
    )
    await page
      .locator('[data-fixture-scroll]')
      .evaluate(element => (element.scrollTop += 500))
    const boxes = await Promise.all([
      toolbar.boundingBox(),
      field.locator('[data-profile-field-header]').boundingBox(),
    ])
    assert(boxes[0] && boxes[1])
    assert(
      Math.abs(boxes[0].y - boxes[1].y - boxes[1].height) < 2,
      'Editor toolbar sticks beneath the field heading',
    )
    await page.screenshot({
      path: `output/playwright/markdown-editor/${name}-descriptor-sticky.png`,
    })
    console.log(
      `${name}: real descriptor translation placement, action, and sticky offset passed`,
    )
  } finally {
    await browser.close()
  }
}
