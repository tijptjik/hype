// PLAYWRIGHT
import { chromium, firefox } from 'playwright'
// NODE
import assert from 'node:assert/strict'

const origin = process.env.HYPE_CHECK_ORIGIN ?? 'http://localhost:5175'
for (const [name, engine] of [
  ['chromium', chromium],
  ['firefox', firefox],
] as const) {
  const browser = await engine.launch({
    headless: true,
    ...(name === 'chromium' ? { args: ['--disable-web-security'] } : {}),
  })
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } })
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(`${origin}/features/06mgoWo87jHo`, {
      waitUntil: 'domcontentloaded',
    })
    await page
      .getByRole('button', { name: 'Share', exact: true })
      .waitFor({ timeout: 60000 })
    await page.getByRole('button', { name: 'Share', exact: true }).click()
    await page.getByRole('menuitem').nth(1).click()
    await page.getByRole('link', { name: 'Facebook', exact: true }).waitFor()
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 1200 })
      for (const theme of ['hype-light', 'hype-black']) {
        await page.evaluate(
          theme => document.documentElement.setAttribute('data-theme', theme),
          theme,
        )
        const heading = page.getByRole('heading', { name: /Share/ })
        await heading.evaluate(element => {
          const scroller = element.closest('section')
          if (scroller) scroller.scrollTop = 0
        })
        await page.waitForTimeout(350)
        const boxes = await Promise.all(
          [
            page.getByRole('link', { name: 'Facebook', exact: true }),
            page.getByRole('link', { name: 'Threads', exact: true }),
            page.getByRole('link', { name: 'X', exact: true }),
            page.getByRole('button', { name: 'Instagram', exact: true }),
            page.getByRole('button', { name: 'Copy link', exact: true }),
            page.getByRole('button', { name: 'Download image', exact: true }),
          ].map(locator => locator.boundingBox()),
        )
        assert(boxes.every(Boolean))
        const [facebook, threads, x, instagram, copy, download] = boxes.map(box => box!)
        assert.equal(facebook.y, x.y)
        assert.equal(threads.y, instagram.y)
        assert(threads.y > facebook.y)
        assert.equal(copy.y, download.y)
        assert(copy.y > threads.y)
        assert(download.x < copy.x)
        assert(facebook.x < x.x)
        assert(threads.x < instagram.x)
        assert(facebook.height >= 56 && facebook.height <= 72)
        assert(copy.height >= 48 && copy.height <= 72)
        assert(facebook.width <= 224)
        await page.getByRole('heading', { name: 'Socials', exact: true }).waitFor()
        await page.getByRole('heading', { name: 'Direct', exact: true }).waitFor()
        const placement = await heading.evaluate(element => {
          const section = element.closest('section')!
          const area = section.getBoundingClientRect()
          const content = section.firstElementChild!.getBoundingClientRect()
          return { area: { x: area.x, y: area.y, width: area.width, height: area.height }, content: { x: content.x, y: content.y, width: content.width, height: content.height } }
        })
        assert(Math.abs(placement.area.x + placement.area.width / 2 - placement.content.x - placement.content.width / 2) < 2)
        if (width > 390) assert(Math.abs(placement.area.y + placement.area.height / 2 - placement.content.y - placement.content.height / 2) < 2)
        assert(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        )
        await page.screenshot({
          path: `output/playwright/share-design-${name}-${theme}-${width}.png`,
        })
      }
    }
    await page.getByRole('button', { name: 'Instagram', exact: true }).click()
    await page
      .getByRole('button', { name: 'Copy caption and link', exact: true })
      .waitFor()
    assert.deepEqual(errors, [])
    console.log(
      `${name}: compact grouped actions, centered content, light/dark and mobile/desktop passed`,
    )
  } finally {
    await browser.close()
  }
}
