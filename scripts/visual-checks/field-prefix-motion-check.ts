// NODE
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
// PLAYWRIGHT
import { chromium, firefox, type Locator } from 'playwright'

const directory = 'output/playwright/field-prefix-motion'
await mkdir(directory, { recursive: true })

/** Sample primary values while the form's multilingual switch changes prefix width.
 * @param toggle Multilingual toolbar button.
 * @returns Per-frame positions and confirmation that controls retained their identities.
 */
async function sampleMotion(toggle: Locator): Promise<{
  before: number[]
  after: number[]
  frames: number[][]
  sameNodes: boolean
  verificationBefore: number[]
  verificationAfter: number[]
}> {
  return toggle.evaluate(async button => {
    const rows = [...document.querySelectorAll('[data-property-text-column]')].map(
      column => column.querySelector('[data-inline-locale-row]')!,
    )
    const values = rows.map(row => row.querySelector('[data-inline-value]')!)
    const inputs = rows.map(row => row.querySelector('input'))
    const verification = rows.map(row => row.lastElementChild!)
    const read = () =>
      values.map(
        (value, index) =>
          value.getBoundingClientRect().x - rows[index].getBoundingClientRect().x,
      )
    const before = read()
    const verificationBefore = verification.map(
      (node, index) =>
        rows[index].getBoundingClientRect().right - node.getBoundingClientRect().right,
    )
    const frames = [before]
    ;(button as HTMLButtonElement).click()
    const started = performance.now()
    await new Promise<void>(resolve => {
      const sample = (): void => {
        frames.push(read())
        if (performance.now() - started < 320) requestAnimationFrame(sample)
        else resolve()
      }
      requestAnimationFrame(sample)
    })
    return {
      before,
      after: read(),
      frames,
      sameNodes: rows.every(
        (row, index) =>
          row.querySelector('[data-inline-value]') === values[index] &&
          row.querySelector('input') === inputs[index],
      ),
      verificationBefore,
      verificationAfter: verification.map(
        (node, index) =>
          rows[index].getBoundingClientRect().right -
          node.getBoundingClientRect().right,
      ),
    }
  })
}

for (const [name, engine] of [
  ['chromium', chromium],
  ['firefox', firefox],
] as const) {
  const browser = await engine.launch()
  try {
    for (const width of [1360, 390]) {
      const page = await browser.newPage({
        viewport: { width, height: 1000 },
        reducedMotion: 'no-preference',
      })
      const errors: string[] = []
      page.on('pageerror', error => errors.push(error.message))
      await page.route('**/__field-prefix-motion.html', route =>
        route.fulfill({
          contentType: 'text/html',
          body: '<html lang="en" data-theme="breadline-light"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>@layer theme,base,components,utilities;</style><script>globalThis.__sveltekit_dev={env:{}}</script></head><body><div id="app"></div><script type="module" src="/src/tests/fixtures/fieldOptionsPanelCheck.ts"></script></body></html>',
        }),
      )
      await page.goto('http://127.0.0.1:4173/__field-prefix-motion.html')
      const toggle = page.getByRole('button', { name: 'Multilingual', exact: true })
      await toggle.waitFor()
      for (const mode of ['editing', 'readonly']) {
        if (mode === 'readonly')
          await page
            .getByRole('button', { name: 'Toggle editing', exact: true })
            .click()
        for (const direction of ['expand', 'collapse']) {
          const result = await sampleMotion(toggle)
          for (let column = 0; column < result.before.length; column++) {
            const from = result.before[column]
            const to = result.after[column]
            assert(Math.abs(to - from - (direction === 'expand' ? 48 : -48)) < 1)
            assert(
              result.frames.some(
                frame =>
                  frame[column] > Math.min(from, to) + 2 &&
                  frame[column] < Math.max(from, to) - 2,
              ),
              'Primary text must travel through intermediate positions',
            )
            const largestStep = Math.max(
              ...result.frames
                .slice(1)
                .map((frame, index) =>
                  Math.abs(frame[column] - result.frames[index][column]),
                ),
            )
            assert(
              largestStep < 32,
              `Primary text jumped ${largestStep}px in one frame`,
            )
            assert(
              Math.abs(
                result.verificationAfter[column] - result.verificationBefore[column],
              ) < 1,
            )
          }
          assert(
            result.sameNodes,
            'Changing prefixes must retain the value and remote input nodes',
          )
          await writeFile(
            `${directory}/${name}-${width}-${mode}-${direction}.json`,
            JSON.stringify(result, null, 2),
          )
          console.log(
            `${name} ${width}px ${mode} ${direction}: primary values slide 48px, verification stays fixed, controls stay mounted`,
          )
        }
      }
      await page.emulateMedia({ reducedMotion: 'reduce' })
      const reduced = await sampleMotion(toggle)
      assert(
        reduced.frames.every(frame =>
          frame.every(
            (x, column) =>
              Math.abs(x - reduced.before[column]) < 1 ||
              Math.abs(x - reduced.after[column]) < 1,
          ),
        ),
        'Reduced motion should change position without intermediate travel',
      )
      assert(reduced.sameNodes)
      assert.deepEqual(errors, [])
      await page.close()
    }
  } finally {
    await browser.close()
  }
}
