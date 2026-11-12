import assert from 'node:assert/strict'
import { chromium } from '@playwright/test'
const base = process.env.PLAYWRIGHT_BASE_URL
const output = process.env.DEV_RUNNER_ARTIFACTS
if (!base || !output) throw new Error('Run through dev-remote chrome')
const browser = await chromium.launch({
  channel: 'chrome',
  headless: false,
  args: ['--ozone-platform=x11', `--class=${process.env.DEV_RUNNER_CHROME_CLASS}`],
})
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  await page.goto(base)
  const session = await (await page.request.get(`${base}/api/auth/get-session`)).json()
  assert.equal(session?.user?.id, 'hype-local-agent-admin')
  const response = await page.goto(`${base}/admin`)
  assert(response?.ok())
  assert(new URL(page.url()).pathname.startsWith('/admin'))
  const toggle = page.getByRole('button', { name: /^(All views|Close views)$/ })
  await toggle.waitFor({ timeout: 120000 })
  const taskIcon = page
    .getByRole('navigation', { name: 'Admin menu' })
    .getByRole('link', { name: 'Tasks', exact: true })
    .locator('[data-admin-menu-icon]')
  const badgeOffset = () =>
    taskIcon.evaluate(node => {
      const icon = node.getBoundingClientRect()
      const badge = node.querySelector('[role="img"]')?.getBoundingClientRect()
      if (!badge) throw new Error('Missing task badge')
      return { x: badge.x - icon.x, y: badge.y - icon.y }
    })
  await taskIcon.locator('[role="img"]').waitFor({ timeout: 60000 })
  const closedBadge = await badgeOffset()
  await toggle.click()
  const popup = page.locator('[data-admin-menu-expanded="true"]')
  await popup.getByRole('link', { name: 'Brand Catalog', exact: true }).waitFor()
  await page.waitForTimeout(400)
  assert.deepEqual(await badgeOffset(), closedBadge, 'Badge stays attached to its icon')
  await page.screenshot({ path: `${output}/admin-expanded.png` })
  // Exercise the real narrow sidebar with the full admin menu, including a scrolled menu.
  await page.locator('[data-sidebar-toggle]').first().click()
  await popup.waitFor({ state: 'detached' })
  await page.waitForTimeout(600)
  const realNav = page.getByRole('navigation', { name: 'Admin menu' })
  for (const scrollToEnd of [false, true]) {
    await toggle.click()
    await page.waitForTimeout(450)
    if (scrollToEnd)
      await popup.evaluate(node => {
        node.scrollTop = node.scrollHeight
      })
    await toggle.click()
    await page.waitForTimeout(160)
    await page.screenshot({ path: `${output}/narrow-retracting-${scrollToEnd}.png` })
    await popup.waitFor({ state: 'detached' })
    await page.waitForTimeout(500)
    assert.equal(
      await realNav.locator('[data-menu-item]').count(),
      5,
      'No outgoing icon wrappers survive collapse',
    )
    assert.equal(
      await realNav.locator('[data-admin-menu-label]').count(),
      0,
      'No labels survive collapse',
    )
    assert.equal(await realNav.getByRole('link').count(), 4)
    const boxes = await realNav.locator('[data-admin-menu-icon]').evaluateAll(nodes =>
      nodes.map(node => {
        const rect = node.getBoundingClientRect()
        return { x: rect.x, y: rect.y }
      }),
    )
    assert(boxes.every(box => Math.abs(box.x - boxes[0].x) < 1))
    assert(
      boxes.slice(1).every((box, index) => Math.abs(box.y - boxes[index].y - 56) < 1),
      'Compact icons return to evenly spaced vertical slots',
    )
    await page.screenshot({ path: `${output}/narrow-retracted-${scrollToEnd}.png` })
  }
  await page.locator('[data-sidebar-toggle]').first().click()
  await page.waitForTimeout(600)
  await toggle.click()
  await page.waitForTimeout(450)
  await popup.getByRole('link', { name: 'Brand Catalog', exact: true }).click()
  await page.waitForURL('**/admin/catalogue')
  await popup.waitFor({ state: 'detached' })
  assert.equal(await popup.count(), 0)
  await page.route('**/__admin-menu.html', route =>
    route.fulfill({
      contentType: 'text/html',
      body: '<html><body><div id="app"></div><script type="module" src="/src/tests/fixtures/adminMenuCheck.ts"></script></body></html>',
    }),
  )
  await page.goto(`${base}/__admin-menu.html`)
  await toggle.waitFor()
  const nav = page.getByRole('navigation', { name: 'Admin menu' })
  assert.equal(await nav.getByRole('link').count(), 4)
  await page.waitForTimeout(400)
  const motion = await nav.evaluate(async node => {
    const first = node.querySelector('a')
    if (!first) throw new Error('Missing first shortcut')
    const initialTop = first.getBoundingClientRect().top
    node.querySelector('button')?.click()
    await new Promise(resolve => setTimeout(resolve, 100))
    const label = first.querySelector('[data-admin-menu-label]')
    if (!label) throw new Error('Missing view label')
    const opacity = Number(getComputedStyle(label).opacity)
    const moving = (first.parentElement?.getAnimations().length ?? 0) > 0
    const icons = [...node.querySelectorAll('[data-admin-menu-icon]')].map(icon => {
      const wrapper = icon.parentElement?.parentElement
      if (!wrapper) throw new Error('Missing animated wrapper')
      const style = getComputedStyle(wrapper)
      const matrix = new DOMMatrixReadOnly(style.transform)
      return {
        opacity: Number(style.opacity),
        scaleX: matrix.a,
        scaleY: matrix.d,
        x: matrix.e,
        moving: wrapper.getAnimations().length > 0,
      }
    })
    await new Promise(resolve => setTimeout(resolve, 400))
    return {
      retained: first === node.querySelector('a'),
      initialTop,
      finalTop: first.getBoundingClientRect().top,
      opacity,
      moving,
      icons,
    }
  })
  assert(motion.retained && motion.moving && motion.finalTop < motion.initialTop)
  assert(motion.opacity < 1, 'Labels fade in during expansion')
  assert.equal(motion.icons.length, 12)
  assert(
    motion.icons.every(
      icon =>
        icon.opacity === 1 &&
        icon.scaleX === 1 &&
        icon.scaleY === 1 &&
        Math.abs(icon.x) < 1 &&
        icon.moving,
    ),
    'Every icon translates vertically without fading or scaling',
  )
  assert.equal(await popup.getByRole('link').count(), 12)
  assert.equal(
    await popup
      .locator(':scope > div')
      .nth(4)
      .getByRole('button', { name: 'Close views' })
      .count(),
    1,
    'Wide toggle stays in the fifth slot',
  )
  const retraction = await nav.evaluate(async node => {
    const wrappers = [...node.querySelectorAll<HTMLElement>('[data-menu-item]')]
    const before = wrappers.map(wrapper => wrapper.getBoundingClientRect())
    node.querySelector('button')?.click()
    await new Promise(resolve => setTimeout(resolve, 120))
    return wrappers.map((wrapper, index) => {
      const rect = wrapper.getBoundingClientRect()
      const style = getComputedStyle(wrapper)
      const matrix = new DOMMatrixReadOnly(style.transform)
      return {
        dx: rect.x - before[index].x,
        dy: rect.y - before[index].y,
        opacity: Number(style.opacity),
        scaleX: matrix.a,
        scaleY: matrix.d,
      }
    })
  })
  assert(
    retraction.every(
      item =>
        Math.abs(item.dx) < 1 &&
        item.dy >= 0 &&
        item.opacity === 1 &&
        item.scaleX === 1 &&
        item.scaleY === 1,
    ),
    'Retraction keeps the expanded layout while every icon moves vertically down without scaling or fading',
  )
  await popup.waitFor({ state: 'detached' })
  assert.equal(await popup.count(), 0)
  await page.getByRole('button', { name: 'Five views' }).click()
  await toggle.waitFor({ state: 'detached' })
  assert.equal(await toggle.count(), 0)
  assert.equal(await nav.getByRole('link').count(), 5)
  await page.getByRole('button', { name: 'Six views' }).click()
  await page.getByRole('button', { name: 'Collapse prism' }).click()
  await page.waitForTimeout(400)
  const narrowBefore = await nav.boundingBox()
  const firstBefore = await nav.getByRole('link').first().boundingBox()
  await toggle.click()
  await page.waitForTimeout(400)
  const narrowAfter = await popup.boundingBox()
  const firstAfter = await nav.getByRole('link').first().boundingBox()
  assert(narrowBefore && narrowAfter && firstBefore && firstAfter)
  assert.equal(narrowAfter.width, narrowBefore.width, 'Collapsed prism keeps its width')
  assert.equal(narrowAfter.x, narrowBefore.x, 'Menu does not move sideways')
  assert(
    Math.abs(
      firstAfter.x + firstAfter.width / 2 - firstBefore.x - firstBefore.width / 2,
    ) < 1,
    'Icon center stays on the same vertical axis',
  )
  assert(firstAfter.y < firstBefore.y, 'Icons move upward')
  assert.equal(await popup.getByRole('link').count(), 6)
  assert.equal(
    await popup
      .locator(':scope > div')
      .last()
      .getByRole('button', { name: 'Close views' })
      .count(),
    1,
    'Narrow toggle remains last',
  )
  const triggerBox = await toggle.boundingBox()
  const popupBox = await popup.boundingBox()
  assert(popupBox && triggerBox)
  assert(popupBox.y < triggerBox.y)
  assert.equal(
    await popup.evaluate(
      node => getComputedStyle(node).gridTemplateColumns.split(' ').length,
    ),
    1,
  )
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${output}/collapsed-expanded.png` })
  await page.keyboard.press('Escape')
  await page.setViewportSize({ width: 390, height: 844 })
  await toggle.click()
  const mobileBox = await popup.boundingBox()
  assert(mobileBox)
  assert(mobileBox.x >= 0 && mobileBox.x + mobileBox.width <= 390)
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${output}/narrow-expanded.png` })
  await page.getByRole('button', { name: 'Five views' }).click()
  await popup.waitFor({ state: 'detached' })
  assert.equal(await popup.count(), 0)
  console.log(
    'PASS: authenticated Catalog navigation, four shortcuts, five-item cutoff, six/twelve labeled views, Escape, outside click, collapsed upward expansion, narrow viewport bounds',
  )
} finally {
  await browser.close()
}
