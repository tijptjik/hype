// NODE
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
// PLAYWRIGHT
import { chromium, firefox } from 'playwright'

await mkdir('output/playwright/markdown-editor', { recursive: true })
for (const [name, engine] of [
  ['chromium', chromium],
  ['firefox', firefox],
] as const) {
  const browser = await engine.launch({ headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 1000, height: 900 } })
    const errors: string[] = []
    page.on('pageerror', error => {
      errors.push(error.message)
      console.error(error.stack)
    })
    await page.route('**/__markdown-editor.html', route =>
      route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><html lang="en" data-theme="breadline-light"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>@layer theme,base,components,utilities;</style><script>globalThis.__sveltekit_dev={env:{}}</script></head><body><div id="app"></div><script type="module" src="/src/tests/fixtures/markdownEditorCheck.ts"></script></body></html>',
      }),
    )
    await page.goto('http://127.0.0.1:4173/__markdown-editor.html')
    const original = await page.locator('[data-value]').textContent()
    await page.getByRole('button', { name: 'Privacy Policy', exact: true }).click()
    const editor = page.getByRole('textbox', { name: 'Privacy Policy', exact: true })
    await editor.waitFor()
    assert((await editor.locator('table').count()) >= 1)
    assert.equal(
      await page.locator('[data-value]').textContent(),
      original,
      'Opening must not rewrite content',
    )
    for (const width of [1000, 390, 320]) {
      await page.setViewportSize({ width, height: 900 })
      assert(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        'Table must not overflow page',
      )
      await page.screenshot({
        path: `output/playwright/markdown-editor/${name}-${width}-policy.png`,
        fullPage: true,
      })
    }
    await page.setViewportSize({ width: 1000, height: 900 })
    await page.getByRole('button', { name: 'Bold', exact: true }).focus()
    await page.keyboard.press('Enter')
    assert.equal(
      await page.locator('[data-saved]').textContent(),
      '',
      'Formatting must not submit the form',
    )
    await page.keyboard.press('Enter')
    await editor.locator('td').first().click()
    await page.keyboard.type(' edited')
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    assert.match((await page.locator('[data-saved]').textContent())!, /edited/)
    await page.getByRole('button', { name: 'Markdown', exact: true }).click()
    const source = page.getByRole('textbox', {
      name: 'Privacy Policy Markdown',
      exact: true,
    })
    assert.match(await source.inputValue(), /edited/)
    await source.fill('# Updated\n\nNew **content**')
    await page.getByRole('button', { name: 'Visual', exact: true }).click()
    await editor.getByRole('heading', { name: 'Updated' }).waitFor()
    await page.getByRole('button', { name: 'Replace', exact: true }).click()
    await editor.getByRole('heading', { name: 'Translated' }).waitFor()
    await editor.press('Escape')
    assert.equal(
      await page.locator('[data-value]').textContent(),
      original,
      'Escape restores field snapshot',
    )
    await page.getByRole('button', { name: 'Legacy', exact: true }).click()
    await page.getByRole('button', { name: 'Privacy Policy', exact: true }).click()
    await editor.locator('strong').waitFor()
    assert.equal(
      await page.locator('[data-value]').textContent(),
      '<p>Legacy <strong>HTML</strong></p>',
    )
    await editor.press('End')
    await page.keyboard.type(' changed')
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    assert.match(
      (await page.locator('[data-saved]').textContent())!,
      /\*\*HTML changed\*\*/,
    )
    for (const width of [1000, 390, 320]) {
      await page.setViewportSize({ width, height: 900 })
      assert(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        'No horizontal page overflow',
      )
      await page.screenshot({
        path: `output/playwright/markdown-editor/${name}-${width}.png`,
        fullPage: true,
      })
    }
    await page.getByRole('button', { name: 'Long document', exact: true }).click()
    await editor.getByRole('heading', { name: 'Section 1', exact: true }).waitFor()
    const heading = editor.getByRole('heading', { name: 'Section 1', exact: true })
    await heading.scrollIntoViewIfNeeded()
    const beforeSelection = await heading.boundingBox()
    await heading.evaluate(element => {
      const range = document.createRange()
      range.selectNodeContents(element)
      const selection = window.getSelection()!
      selection.removeAllRanges()
      selection.addRange(range)
    })
    await page.evaluate(
      () =>
        new Promise(resolve =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    )
    assert.deepEqual(
      await heading.boundingBox(),
      beforeSelection,
      'Selecting a heading must not move its text',
    )
    assert.equal(
      await page.locator('.milkdown-toolbar, .milkdown-block-handle').count(),
      0,
    )
    await page.setViewportSize({ width: 1000, height: 700 })
    for (const theme of ['breadline-light', 'breadline-dark']) {
      await page
        .locator('html')
        .evaluate((element, theme) => element.setAttribute('data-theme', theme), theme)
      await page.evaluate(() => window.scrollTo(0, 600))
      const header = page.locator('[data-markdown-toolbar]')
      assert(
        Math.abs((await header.boundingBox())!.y) < 2,
        'Both toolbar rows must stick together',
      )
      assert(
        await header.getByRole('button', { name: 'Bold', exact: true }).isVisible(),
      )
      assert(
        await header
          .getByRole('button', { name: 'Translate from English' })
          .isVisible(),
      )
      await page.screenshot({
        path: `output/playwright/markdown-editor/${name}-${theme}-sticky.png`,
      })
    }
    await page.getByRole('button', { name: 'Markdown', exact: true }).click()
    const longSource = page.getByRole('textbox', { name: 'Privacy Policy Markdown' })
    await page.waitForFunction(
      () => {
        const el = document.querySelector('textarea:not([hidden])')
        return el && el.clientHeight >= el.scrollHeight - 2
      },
      { timeout: 5000 },
    )
    const sourceSize = await longSource.evaluate(element => ({
      height: element.clientHeight,
      content: element.scrollHeight,
      inline: element.getAttribute('style'),
      max: getComputedStyle(element).maxHeight,
    }))
    assert(
      sourceSize.height >= sourceSize.content - 2 && sourceSize.height > 1200,
      `Markdown must expand to the full document: ${JSON.stringify(sourceSize)}`,
    )
    await page.getByRole('button', { name: 'Translate from English' }).click()
    assert.match(await longSource.inputValue(), /Translated from toolbar/)
    assert.deepEqual(errors, [])
    console.log(
      `${name}: tables, untouched content, immediate submit, source mode, replacement, cancel, legacy HTML and narrow layout passed`,
    )
  } finally {
    await browser.close()
  }
}
