// NODE
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
// PLAYWRIGHT
import { chromium, firefox, webkit, type Page } from 'playwright'

// biome-ignore lint/suspicious/noUndeclaredEnvVars: Uncached manual browser check.
const origin = process.env.HYPE_CHECK_ORIGIN ?? 'http://127.0.0.1:4173'
const output = 'output/playwright'
// biome-ignore lint/suspicious/noUndeclaredEnvVars: Select installed engines for this manual check.
const requestedBrowsers = process.env.HYPE_CHECK_BROWSERS?.split(',')
await mkdir(output, { recursive: true })

type Sample = {
  time: number
  x: number
  width: number
  contentWidth: number
  anchor: number | null
  rows: { id: string; x: number; y: number; width: number }[]
}

/** Samples actual rendered offsets while triggering one complete shell transition. */
async function capture(page: Page, action: 'open' | 'close'): Promise<Sample[]> {
  return page.evaluate(async action => {
    const samples: Sample[] = []
    const start = performance.now()
    const trigger = document.querySelector<HTMLButtonElement>(
      `[data-action="${action}"]`,
    )
    if (!trigger) throw new Error(`Missing ${action} control`)
    trigger.click()
    await new Promise<void>(resolve => {
      const sample = (): void => {
        const shell = document.querySelector<HTMLElement>('#left-panel, #right-panel')
        if (shell) {
          const rect = shell.getBoundingClientRect()
          const content =
            shell.querySelector<HTMLElement>('[data-motion-body]') ??
            shell.firstElementChild ??
            shell
          const anchor = shell.querySelector<HTMLElement>(
            '[data-motion-anchor], header',
          )
          samples.push({
            time: performance.now() - start,
            x: rect.x,
            width: rect.width,
            contentWidth: content.getBoundingClientRect().width,
            anchor: anchor ? anchor.getBoundingClientRect().x - rect.x : null,
            rows: [
              ...shell.querySelectorAll<HTMLElement>(
                '[data-motion-row], [data-resource-id]',
              ),
            ].map(row => ({
              id: row.dataset.motionRow ?? row.dataset.resourceId ?? row.id,
              x: row.getBoundingClientRect().x - rect.x,
              y: row.getBoundingClientRect().y - rect.y,
              width: row.getBoundingClientRect().width,
            })),
          })
        }
        if (performance.now() - start >= 650) resolve()
        else requestAnimationFrame(sample)
      }
      requestAnimationFrame(sample)
    })
    return samples
  }, action)
}

/** Checks fixed local geometry while allowing intentional vertical row reordering. */
function verify(samples: Sample[], label: string, inline: boolean): void {
  assert.ok(samples.length >= 2, `${label}: missing transition samples`)
  const spread = (values: number[]): number => Math.max(...values) - Math.min(...values)
  if (!inline)
    assert.ok(
      spread(samples.map(sample => sample.width)) < 1.5,
      `${label}: shell width changed`,
    )
  assert.ok(
    spread(samples.map(sample => sample.contentWidth)) < 1.5,
    `${label}: contents reflowed`,
  )
  const anchors = samples.flatMap(sample =>
    sample.anchor === null ? [] : [sample.anchor],
  )
  assert.ok(spread(anchors) < 1.5, `${label}: header moved relative to shell`)
  const ids = new Set(samples.flatMap(sample => sample.rows.map(row => row.id)))
  assert.ok(ids.size > 0, `${label}: missing row samples`)
  for (const id of ids) {
    const rows = samples.flatMap(sample => sample.rows.filter(row => row.id === id))
    assert.ok(
      spread(rows.map(row => row.x)) < 1.5,
      `${label}: ${id} moved horizontally inside shell (${spread(rows.map(row => row.x))}px)`,
    )
    assert.ok(
      spread(rows.map(row => row.width)) < 1.5,
      `${label}: ${id} resized inside shell`,
    )
  }
}

const report: { browser: string; label: string; frames: number }[] = []
for (const [name, engine] of [
  ['chromium', chromium],
  ['firefox', firefox],
  ['webkit', webkit],
] as const) {
  if (requestedBrowsers && !requestedBrowsers.includes(name)) continue
  const browser = await engine.launch({ headless: true })
  try {
    for (const viewport of [
      { width: 1440, height: 1000 },
      { width: 390, height: 844 },
    ]) {
      const page = await browser.newPage({ viewport })
      const errors: string[] = []
      page.on('pageerror', error => errors.push(error.message))
      await page.route('**/__panel-motion-check.html*', route =>
        route.fulfill({
          contentType: 'text/html',
          body: '<html data-theme="nullspace"><head><meta name="viewport" content="width=device-width,initial-scale=1"><script>globalThis.__sveltekit_dev={env:{}}</script></head><body><div id="app"></div><script type="module" src="/src/tests/fixtures/panelMotionCheck.ts"></script></body></html>',
        }),
      )
      await page.goto(`${origin}/__panel-motion-check.html`)
      await page.locator('[data-action="open"]').waitFor()
      await page.evaluate(() => document.fonts.ready)
      for (const resources of [false, true]) {
        await page.locator('[data-resources]').setChecked(resources)
        for (const inline of [false, true]) {
          await page.locator('[data-inline]').setChecked(inline)
          for (const position of ['left', 'right']) {
            await page.locator('[data-position]').selectOption(position)
            const label = `${viewport.width}-${resources ? 'maps' : 'list'}-${inline ? 'inline' : 'overlay'}-${position}`
            const opening = await capture(page, 'open')
            await writeFile(
              `${output}/panel-motion-${name}-${label}.json`,
              JSON.stringify(opening),
            )
            verify(opening, `${name} ${label} opening`, inline)
            if (!inline)
              assert.ok(
                Math.max(...opening.map(frame => frame.x)) -
                  Math.min(...opening.map(frame => frame.x)) >
                  20,
                `${label}: entrance was not sampled`,
              )
            const closing = await capture(page, 'close')
            verify(closing, `${name} ${label} closing`, inline)
            assert.equal(await page.locator('#left-panel, #right-panel').count(), 0)
            report.push({
              browser: name,
              label,
              frames: opening.length + closing.length,
            })
          }
        }
      }
      // The persistent admin rail must keep its pointer and tooltip anchors inside 64px.
      await page.locator('[data-inline]').check()
      await page.locator('[data-position]').selectOption('left')
      await capture(page, 'open')
      await page.locator('[data-narrow]').check()
      await page.waitForTimeout(600)
      const rail = await page.locator('#left-panel').boundingBox()
      assert.ok(rail && Math.abs(rail.width - 64) < 1.5, `${name}: narrow rail width`)
      const railRow = page.getByRole('button', {
        name: 'Steady panel row 1',
        exact: true,
      })
      const rowBounds = await railRow.boundingBox()
      assert.ok(
        rowBounds && rowBounds.width <= 64,
        `${name}: collapsed row exceeds rail`,
      )
      await railRow.focus()
      const label = page.locator('[data-resource-hover-label]')
      await label.waitFor()
      assert.ok(
        Math.abs(
          (await label.evaluate(node =>
            Number.parseFloat((node as HTMLElement).style.left),
          )) -
            (rail.x + rail.width),
        ) < 1.5,
        `${name}: tooltip anchor exceeds rail`,
      )
      await page.locator('[data-narrow]').uncheck()
      await page.waitForTimeout(600)
      await capture(page, 'close')
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await page.locator('[data-inline]').uncheck()
      const reduced = await capture(page, 'open')
      verify(reduced, `${name} ${viewport.width} reduced motion`, false)
      assert.ok(
        Math.max(...reduced.map(frame => frame.x)) -
          Math.min(...reduced.map(frame => frame.x)) <
          1.5,
      )
      await page.screenshot({
        path: `${output}/panel-motion-${name}-${viewport.width}.png`,
      })
      await capture(page, 'close')
      assert.equal(await page.locator('#left-panel, #right-panel').count(), 0)
      // A newly loaded component starts already open; its first mount must animate too.
      await page.emulateMedia({ reducedMotion: 'no-preference' })
      for (const inline of [false, true]) {
        await page.goto(`${origin}/__panel-motion-check.html?deferred&steady`)
        await page.locator('[data-resources]').check()
        await page.locator('[data-inline]').setChecked(inline)
        await page.evaluate(() => document.fonts.ready)
        for (const cycle of [0, 1]) {
          const label = `${viewport.width}-deferred-${inline ? 'inline' : 'overlay'}-${cycle === 0 ? 'first' : 'repeat'}`
          const opening = await capture(page, 'open')
          verify(opening, `${name} ${label}`, inline)
          const positions = opening.map(frame => (inline ? frame.width : frame.x))
          assert.ok(
            Math.max(...positions) - Math.min(...positions) > 20,
            `${name} ${label}: panel snapped directly into place`,
          )
          for (const row of opening.at(-1)?.rows ?? []) {
            const offsets = opening.flatMap(frame =>
              frame.rows.filter(item => item.id === row.id).map(item => item.y),
            )
            assert.ok(
              Math.max(...offsets) - Math.min(...offsets) < 1.5,
              `${name} ${label}: steady rows moved vertically`,
            )
          }
          const closing = await capture(page, 'close')
          verify(closing, `${name} ${label} closing`, inline)
          assert.equal(await page.locator('#left-panel, #right-panel').count(), 0)
          report.push({ browser: name, label, frames: opening.length + closing.length })
        }
      }
      assert.deepEqual(errors, [])
      await page.close()
    }
  } finally {
    await browser.close()
  }
}
await writeFile(`${output}/panel-motion-report.json`, JSON.stringify(report, null, 2))
console.log(JSON.stringify(report))
