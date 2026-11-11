// NODE
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
// PLAYWRIGHT
import { chromium, firefox } from 'playwright'
const origin = process.argv[2] ?? 'http://127.0.0.1:4174'
const output = 'output/playwright/header-edit-stability'
await mkdir(output, { recursive: true })
for (const [name, engine] of [
  ['chromium', chromium],
  ['firefox', firefox],
] as const) {
  const browser = await engine.launch({ headless: true })
  try {
    for (const width of [1440, 1200, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 500 } })
      const errors: string[] = []
      page.on('pageerror', error => errors.push(error.message))
      await page.route('**/__header-edit-stability.html', route =>
        route.fulfill({
          contentType: 'text/html',
          body: '<html><head><script>globalThis.__sveltekit_dev={env:{}}</script></head><body><div id="app"></div><script type="module" src="/src/tests/fixtures/headerEditStabilityCheck.ts"></script></body></html>',
        }),
      )
      await page.goto(`${origin}/__header-edit-stability.html`)
      for (const resource of [
        'location',
        'feature',
        'organisation',
        'project',
        'layer',
        'hub',
        'property',
        'user',
      ]) {
        await page.getByRole('combobox', { name: 'Resource' }).selectOption(resource)
        const edit = page.getByRole('button', { name: 'Edit', exact: true })
        await edit.waitFor()
        await page.waitForTimeout(180)
        const before = await edit.boundingBox()
        assert(before)
        await edit.hover()
        await page.mouse.down()
        await page.waitForTimeout(100)
        const pressed = await edit.boundingBox()
        assert(pressed)
        assert(
          Math.abs(before.y - pressed.y) < 0.1 &&
            Math.abs(before.height - pressed.height) < 0.1,
          `${name} ${width} ${resource}: Edit moved on pointer-down`,
        )
        await page.mouse.up()
        const cancel = page.getByRole('button', { name: 'Cancel', exact: true })
        await cancel.waitFor()
        const frames = await cancel.evaluate(async button => {
          const samples: { y: number; height: number }[] = []
          const started = performance.now()
          while (performance.now() - started < 250) {
            const rect = button.getBoundingClientRect()
            samples.push({ y: rect.y, height: rect.height })
            await new Promise(requestAnimationFrame)
          }
          return samples
        })
        assert(
          frames.every(
            frame =>
              Math.abs(frame.y - before.y) < 0.1 &&
              Math.abs(frame.height - before.height) < 0.1,
          ),
          `${name} ${width} ${resource}: Edit transition moved vertically`,
        )
        await cancel.click()
        await edit.waitFor()
      }
      await page.screenshot({ path: `${output}/${name}-${width}.png` })
      assert.deepEqual(errors, [])
      console.log(
        `${name} ${width}: eight form headers retain button height and vertical position through Edit/Cancel`,
      )
      await page.close()
    }
  } finally {
    await browser.close()
  }
}
