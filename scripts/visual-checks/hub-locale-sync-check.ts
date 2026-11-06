// NODE
import assert from 'node:assert/strict'
// PLAYWRIGHT
import { chromium, firefox } from 'playwright'

for (const engine of [chromium, firefox]) {
  const browser = await engine.launch({ headless: true })
  try {
    const page = await browser.newPage({
      viewport: { width: 1360, height: 1000 },
      reducedMotion: 'reduce',
    })
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.route('**/__hub-locale-sync.html', route =>
      route.fulfill({
        contentType: 'text/html',
        body: '<html lang="en" data-theme="breadline-light"><head><style>@layer theme,base,components,utilities;</style><script>globalThis.__sveltekit_dev={env:{}}</script></head><body><div id="app"></div><script type="module" src="/src/tests/fixtures/descriptorProfileCheck.ts"></script></body></html>',
      }),
    )
    await page.goto(
      `${process.env.CHECK_ORIGIN ?? 'http://127.0.0.1:4173'}/__hub-locale-sync.html`,
    )
    await page.getByRole('button', { name: 'Hub profile', exact: true }).click()
    await page.getByRole('button', { name: 'Multilingual', exact: true }).click()
    const chips = page.locator('[data-locale-toolbar] [data-locale]')
    await chips.filter({ hasText: '繁中' }).click()
    await chips.locator('..').first().waitFor()
    await page
      .locator('[data-locale-toolbar] [data-locale="zh-Hans"]')
      .press('Alt+ArrowLeft')
    const expected = await chips.evaluateAll(nodes =>
      nodes.map(node => [
        node.getAttribute('data-locale'),
        node.getAttribute('aria-pressed'),
      ]),
    )
    for (const tab of ['Policies tab', 'Fields tab', 'Profile tab']) {
      await page.getByRole('button', { name: tab, exact: true }).click()
      await chips.first().waitFor()
      assert.deepEqual(
        await chips.evaluateAll(nodes =>
          nodes.map(node => [
            node.getAttribute('data-locale'),
            node.getAttribute('aria-pressed'),
          ]),
        ),
        expected,
        `${tab} shares order and visibility`,
      )
    }
    // Changes from Fields must also flow back into both descriptor tabs.
    await page.getByRole('button', { name: 'Fields tab', exact: true }).click()
    await page.locator('[data-locale-toolbar] [data-locale="zh-Hant"]').click()
    for (const tab of ['Policies tab', 'Profile tab']) {
      await page.getByRole('button', { name: tab, exact: true }).click()
      assert.equal(
        await page
          .locator('[data-locale-toolbar] [data-locale="zh-Hant"]')
          .getAttribute('aria-pressed'),
        'true',
      )
    }
    // Add a language from Policies, edit its legal copy, and retain it across tabs.
    await page.getByRole('button', { name: 'Policies tab', exact: true }).click()
    await page.getByRole('button', { name: 'Toggle editing', exact: true }).click()
    await page.getByRole('button', { name: '+ Add', exact: true }).click()
    await page.getByRole('combobox', { name: 'Search languages' }).fill('pt-BR')
    await page.getByRole('option', { name: /pt-BR/ }).click({ timeout: 5000 })
    await page.getByRole('button', { name: /^Privacy Policy ·.*Brazil/ }).click()
    const policy = page.getByRole('textbox', { name: /^Privacy Policy ·.*Brazil/ })
    await policy.fill('Protegemos seus dados.')
    await policy.press('Tab')
    for (const tab of ['Profile tab', 'Fields tab', 'Policies tab']) {
      await page.getByRole('button', { name: tab, exact: true }).click()
      assert.equal(
        await page
          .locator('[data-locale-toolbar] [data-locale="pt-BR"]')
          .getAttribute('aria-pressed'),
        'true',
      )
    }
    await page.getByRole('button', { name: /^Privacy Policy ·.*Brazil/ }).click()
    assert.equal(await policy.inputValue(), 'Protegemos seus dados.')
    await policy.press('Escape')
    assert.deepEqual(errors, [])
    console.log(
      `${engine.name()}: Profile, Policies and Fields share language visibility and order`,
    )
  } finally {
    await browser.close()
  }
}
