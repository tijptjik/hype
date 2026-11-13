// NODE
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
// PLAYWRIGHT
import { chromium, expect } from '@playwright/test'

const origin = process.env.PLAYWRIGHT_BASE_URL
const artifacts = process.env.DEV_RUNNER_ARTIFACTS
const placement = process.env.DEV_RUNNER_CHROME_CLASS
if (!origin || !artifacts || !placement) throw new Error('Use dev-remote chrome')
const browser = await chromium.launch({
  channel: 'chrome',
  headless: false,
  args: ['--ozone-platform=x11', `--class=${placement}`],
})
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  await page.goto(origin)
  const session = await (
    await page.request.get(`${origin}/api/auth/get-session`)
  ).json()
  assert.equal(session?.user?.id, 'hype-local-agent-admin')
  const response = await page.goto(`${origin}/admin/catalog/brand/7eleven?panel=admin`)
  assert(response?.ok())
  assert(new URL(page.url()).pathname.startsWith('/admin'))
  const header = page.locator('[data-adaptive-toolbar-right-group]').first()
  const toggle = header.getByRole('button', { name: 'Multilingual', exact: true })
  await expect(toggle).toBeVisible({ timeout: 120000 })
  await page.evaluate(() => document.fonts.ready)
  const reports: unknown[] = []
  // Admin routes explicitly require at least 1200px; check every supported header layout.
  for (const width of [1200, 1440, 1920]) {
    await page.setViewportSize({ width, height: 1000 })
    await page.waitForTimeout(1000)
    if ((await toggle.getAttribute('aria-expanded')) === 'true') {
      await toggle.click()
      await page.waitForTimeout(1000)
    }
    for (const expanded of [true, false]) {
      // Sample every frame to distinguish a real layout transition from a final-position screenshot.
      const samples = await toggle.evaluate(async button => {
        const root = button.closest('[data-adaptive-toolbar-right-group]')
        const toolbar = button.closest('[data-locale-toolbar]')
        if (!root || !toolbar) throw new Error('Missing header toolbar')
        const neighbour = Array.from(root.querySelectorAll('button')).findLast(
          node =>
            !toolbar.contains(node) &&
            node.getBoundingClientRect().width > 0 &&
            Boolean(
              node.compareDocumentPosition(toolbar) & Node.DOCUMENT_POSITION_FOLLOWING,
            ),
        )
        if (!neighbour) throw new Error('Missing adjacent header control')
        const samples: {
          t: number
          x: number
          width: number
          label: string
          height: number
          scrollbarHeight: number
        }[] = []
        const start = performance.now()
        const sample = (): void => {
          const scroll = toolbar.querySelector<HTMLElement>('[data-locale-scroll]')
          samples.push({
            height: toolbar.getBoundingClientRect().height,
            scrollbarHeight: scroll ? scroll.offsetHeight - scroll.clientHeight : 0,
            t: performance.now() - start,
            x: neighbour.getBoundingClientRect().x,
            width: toolbar.getBoundingClientRect().width,
            label: neighbour.getAttribute('aria-label') ?? neighbour.textContent ?? '',
          })
        }
        sample()
        ;(button as HTMLButtonElement).click()
        while (performance.now() - start < 800) {
          await new Promise(requestAnimationFrame)
          sample()
        }
        return samples
      })
      await expect(toggle).toHaveAttribute('aria-expanded', String(expanded))
      const first = samples[0]
      const last = samples.at(-1)
      assert(first && last)
      assert(
        samples.every(sample => sample.scrollbarHeight === 0),
        'No scrollbar track may appear during the reveal',
      )
      assert(
        samples.every(sample => Math.abs(sample.height - first.height) < 1),
        'The locale strip must retain its height throughout the reveal',
      )
      reports.push({ width, expanded, samples })
      await writeFile(
        `${artifacts}/header-locale-motion.json`,
        JSON.stringify(reports, null, 2),
      )
      assert(
        Math.abs(last.width - first.width) > 20,
        'Locale strip must change layout width',
      )
      assert(
        new Set(samples.map(sample => Math.round(sample.width))).size > 4,
        'Width must animate over multiple frames',
      )
      assert(
        Math.abs(last.x - first.x) > 20,
        'Adjacent navigation must move with the locale strip',
      )
      if (Math.abs(last.x - first.x) > 5) {
        assert(
          new Set(samples.map(sample => Math.round(sample.x))).size > 4,
          'Adjacent control must slide through intermediate positions',
        )
        const biggestStep = Math.max(
          ...samples
            .slice(1)
            .map((sample, index) =>
              Math.abs(sample.x - (samples[index]?.x ?? sample.x)),
            ),
        )
        assert(
          biggestStep < Math.abs(last.x - first.x) * 0.75,
          'Adjacent control must not jump in one frame',
        )
      }
      await page.screenshot({
        path: `${artifacts}/header-locales-${width}-${expanded ? 'expanded' : 'collapsed'}.png`,
      })
    }
  }
  // Freeze the opening animation halfway to inspect clipping, then resume normally.
  await toggle.evaluate(async button => {
    ;(button as HTMLButtonElement).click()
    await new Promise(requestAnimationFrame)
    await new Promise(requestAnimationFrame)
    for (const animation of button
      .closest('[data-locale-toolbar]')
      ?.getAnimations({ subtree: true }) ?? []) {
      animation.pause()
      animation.currentTime = 90
    }
  })
  await page.screenshot({ path: `${artifacts}/header-locales-mid-reveal.png` })
  await toggle.evaluate(button => {
    for (const animation of button
      .closest('[data-locale-toolbar]')
      ?.getAnimations({ subtree: true }) ?? [])
      animation.play()
  })
  await page.waitForTimeout(300)
  const scroll = header.locator('[data-locale-scroll]')
  await expect(scroll).toHaveCSS('scrollbar-width', 'none')
  if (await scroll.evaluate(node => node.scrollWidth > node.clientWidth)) {
    await scroll.hover()
    await page.mouse.wheel(0, 200)
    await expect.poll(() => scroll.evaluate(node => node.scrollLeft)).toBeGreaterThan(0)
  }
  await toggle.click()
  await page.waitForTimeout(300)
  const collapsedWidth = await toggle.evaluate(
    button => button.closest('[data-locale-toolbar]')?.getBoundingClientRect().width,
  )
  await toggle.evaluate(async button => {
    ;(button as HTMLButtonElement).click()
    await new Promise(resolve => setTimeout(resolve, 60))
    ;(button as HTMLButtonElement).click()
  })
  await page.waitForTimeout(400)
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  assert.equal(
    await toggle.evaluate(
      button => button.closest('[data-locale-toolbar]')?.getBoundingClientRect().width,
    ),
    collapsedWidth,
    'Interrupted transitions must restore the collapsed footprint',
  )
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await toggle.focus()
  await page.keyboard.press('Enter')
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await writeFile(
    `${artifacts}/header-locale-motion.json`,
    JSON.stringify(reports, null, 2),
  )
  console.log(
    'PASS: multilingual expansion and collapse move header neighbours at supported admin widths; reduced motion toggles remain usable',
  )
} finally {
  await browser.close()
}
