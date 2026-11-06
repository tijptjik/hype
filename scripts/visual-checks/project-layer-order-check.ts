// NODE
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
// PLAYWRIGHT
import { chromium, firefox, type Page } from 'playwright'

const origin = process.env.HYPE_CHECK_ORIGIN ?? 'http://127.0.0.1:4173'
const artifactDirectory = 'output/playwright'
await mkdir(artifactDirectory, { recursive: true })

/** Drag a real card grip to an insertion edge using browser pointer input.
 * @param page The isolated fixture page.
 * @param sourceIndex Current index of the layer being moved.
 * @param targetIndex Current index of the destination layer.
 * @param edge Destination insertion edge.
 * @param screenshot Optional artifact path while the drop indicator is visible.
 * @returns Nothing after releasing the pointer.
 */
async function dragLayer(
  page: Page,
  sourceIndex: number,
  targetIndex: number,
  edge: 'before' | 'after',
  screenshot?: string,
): Promise<void> {
  const rows = page.locator('[data-dnd-item]')
  const grip = rows.nth(sourceIndex).locator('.bits-card__drag-handle')
  // CSS stacking must leave the visible grip exposed above the layer link.
  assert.equal(
    await grip.evaluate(element => {
      const bounds = element.getBoundingClientRect()
      return element.contains(
        document.elementFromPoint(
          bounds.x + bounds.width / 2,
          bounds.y + bounds.height / 2,
        ),
      )
    }),
    true,
  )
  const source = await grip.boundingBox()
  const target = await rows.nth(targetIndex).boundingBox()
  assert.ok(source && target)
  await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2)
  await page.mouse.down()
  // Release inside the padding, rather than over a card, to exercise the actual gap hit area.
  await page.mouse.move(
    target.x + source.width / 2,
    edge === 'before' ? target.y + 2 : target.y + target.height - 2,
    { steps: 15 },
  )
  const indicator = page.locator(
    '[data-dnd-item].drop-before, [data-dnd-item].drop-after',
  )
  await indicator.waitFor()
  const geometry = await indicator.evaluate(element => {
    const before = element.classList.contains('drop-before')
    const pseudo = getComputedStyle(element, before ? '::before' : '::after')
    const bounds = element.getBoundingClientRect()
    const card = element.querySelector('article')!.getBoundingClientRect()
    const adjacent = (
      before ? element.previousElementSibling : element.nextElementSibling
    )
      ?.querySelector('article')
      ?.getBoundingClientRect()
    const height = Number.parseFloat(pseudo.height)
    const shift =
      pseudo.transform === 'none' ? 0 : new DOMMatrixReadOnly(pseudo.transform).m42
    const center =
      (before
        ? bounds.top + Number.parseFloat(pseudo.top)
        : bounds.bottom - Number.parseFloat(pseudo.bottom) - height) +
      height / 2 +
      shift
    const expected = before
      ? adjacent
        ? (adjacent.bottom + card.top) / 2
        : bounds.top
      : adjacent
        ? (card.bottom + adjacent.top) / 2
        : bounds.bottom
    return {
      center,
      expected,
      color: pseudo.backgroundColor,
      gap: before ? card.top - center : center - card.bottom,
    }
  })
  assert.ok(
    Math.abs(geometry.center - geometry.expected) <= 0.5,
    JSON.stringify(geometry),
  )
  assert.ok(geometry.gap >= 5, 'Drop indicator overlaps the card')
  assert.notEqual(
    geometry.color,
    'rgb(59, 130, 246)',
    'Vendor blue must not override the themed indicator',
  )
  if (screenshot) await page.screenshot({ path: screenshot })
  await page.mouse.up()
}

for (const [name, engine] of [
  ['chromium', chromium],
  ['firefox', firefox],
] as const) {
  const browser = await engine.launch({ headless: true })
  try {
    for (const width of [950, 634]) {
      const page = await browser.newPage({ viewport: { width, height: 650 } })
      const errors: string[] = []
      page.on('pageerror', error => errors.push(error.message))
      await page.route('**/__project-layers-check.html', route =>
        route.fulfill({
          contentType: 'text/html',
          body: '<html lang="en" data-theme="hype-light"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>@layer theme,base,components,utilities;</style><script>globalThis.__sveltekit_dev={env:{}}</script></head><body style="margin:0"><div id="app"></div><script type="module" src="/src/tests/fixtures/projectLayersCheck.ts"></script></body></html>',
        }),
      )
      await page.goto(`${origin}/__project-layers-check.html`)
      await page.getByRole('link', { name: 'Open', exact: true }).waitFor()
      // The middle gap is hittable and leaves the order unchanged when already adjacent.
      await dragLayer(
        page,
        0,
        0,
        'after',
        `${artifactDirectory}/project-layer-gap-${name}-${width}.png`,
      )
      assert.equal(await page.getByTestId('moves').innerText(), '0')
      await dragLayer(page, 1, 0, 'before')
      await page.waitForFunction(
        () => document.querySelector('[data-testid="moves"]')?.textContent === '1',
      )
      assert.deepEqual(JSON.parse(await page.getByTestId('layer-order').innerText()), [
        { id: 'closed', rank: 0, isDefaultVisible: false },
        { id: 'open', rank: 1, isDefaultVisible: true },
      ])
      await page.screenshot({
        path: `${artifactDirectory}/project-layer-order-${name}-${width}.png`,
      })
      await dragLayer(page, 0, 1, 'after')
      await page.waitForFunction(
        () => document.querySelector('[data-testid="moves"]')?.textContent === '2',
      )
      assert.deepEqual(
        JSON.parse(await page.getByTestId('layer-order').innerText()).map(
          (item: { id: string }) => item.id,
        ),
        ['open', 'closed'],
      )
      assert.equal(
        await page
          .getByRole('link', { name: 'Open', exact: true })
          .getAttribute('href'),
        '/admin/layers/open',
      )
      // The visibility switch changes its own form value without initiating a drag.
      await page.getByRole('switch').nth(0).click()
      await page.waitForFunction(
        () =>
          JSON.parse(
            document.querySelector('[data-testid="layer-order"]')?.textContent ?? '[]',
          )[0]?.isDefaultVisible === false,
      )
      assert.equal(await page.getByTestId('moves').innerText(), '2')
      await page.getByRole('button', { name: 'Toggle editing' }).click()
      assert.equal(await page.locator('[data-dnd-item][draggable="true"]').count(), 0)
      assert.deepEqual(errors, [])
      await page.close()
      console.log(
        `${name} ${width}px: centered gap and end indicators, padding hit testing, reorder in both directions, dense ranks, visibility and disabled state passed`,
      )
    }
  } finally {
    await browser.close()
  }
}
