import { test, expect } from '@playwright/test'
import { join } from 'node:path'

for (const width of [1440, 390]) {
  test(`bounded station collection and venue fades at ${width}px`, async ({ page }) => {
    test.setTimeout(180000)
    await page.setViewportSize({ width, height: 1000 })
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await page.goto('/premises/kennedy-town-mtr?walk=mtr-stations')
    expect(
      (await (await page.request.get('/api/auth/get-session')).json()).user.id,
    ).toBe('hype-local-agent-admin')
    const scene = page.locator('[data-station-scene]')
    await expect(scene).toBeVisible({ timeout: 90000 })
    const nav = page.locator('#omni-nav-bar')
    await nav.getByRole('button', { name: /MTR stations/ }).click()
    const tray = page.locator('[data-omni-collection]')
    await expect(tray).toBeVisible()
    await expect(async () => {
      const bounds = await tray.boundingBox()
      const header = await nav.boundingBox()
      expect(bounds.height + header.height).toBeLessThanOrEqual(752)
      expect(bounds.height).toBeGreaterThan(200)
    }).toPass()
    const scroll = tray.locator('div.overflow-y-auto')
    expect(await scroll.evaluate(el => el.scrollHeight > el.clientHeight)).toBe(true)
    await expect(tray.getByRole('button', { name: /Kennedy Town/ })).toBeInViewport()
    await page.screenshot({
      // biome-ignore lint/suspicious/noUndeclaredEnvVars: managed runner artifact directory.
      path: join(process.env.DEV_RUNNER_ARTIFACTS, `bounded-walk-${width}.png`),
    })
    await nav.getByRole('button', { name: /MTR stations/ }).click()
    await expect(tray).toHaveCount(0)
    await page.route('**/api/premises-maps/**', async route => {
      await new Promise(resolve => setTimeout(resolve, 800))
      await route.continue()
    })
    await page.evaluate(() => {
      window.navButtons = [
        ...document.querySelectorAll('[data-app-intro-item="nav"] button'),
      ]
      window.fitButton = window.navButtons.find(
        button =>
          button.textContent.includes('Fit') ||
          button.getAttribute('aria-label') === 'Fit',
      )
      window.legendNodes = [...document.querySelectorAll('[data-station-legend]')]
      window.legendText = window.legendNodes.map(node => node.textContent)
      window.venueFrames = []
      window.recordVenue = true
      const frame = () => {
        const el = document.querySelector('[data-station-venue-content]')
        window.venueFrames.push({
          opacity: Number(getComputedStyle(el).opacity),
          label: el.parentElement.getAttribute('aria-label'),
          navRetained:
            Boolean(window.fitButton) &&
            window.navButtons.every(button => button.isConnected),
          legendsRetained:
            window.legendNodes.length === 2 &&
            window.legendNodes.every(
              node => node.isConnected && getComputedStyle(node).opacity === '1',
            ),
          oldLegends: window.legendNodes.every(
            (node, index) => node.textContent === window.legendText[index],
          ),
          flip: window.legendNodes.some(node =>
            node
              .getAnimations({ subtree: true })
              .some(animation =>
                animation.effect
                  ?.getKeyframes()
                  .some(keyframe => keyframe.transform?.includes('translate')),
              ),
          ),
        })
        if (window.recordVenue) requestAnimationFrame(frame)
      }
      requestAnimationFrame(frame)
    })
    await page.getByRole('button', { name: 'Next', exact: true }).click()
    const content = page.locator('[data-station-venue-content]')
    await expect(page.locator('[data-station-surface]')).not.toHaveAttribute(
      'aria-label',
      /Kennedy Town/,
    )
    await expect(content).toHaveCSS('opacity', '1', { timeout: 90000 })
    const frames = await page.evaluate(() => {
      window.recordVenue = false
      return window.venueFrames
    })
    expect(
      frames.some(
        f => f.label.includes('Kennedy Town') && f.opacity > 0 && f.opacity < 0.95,
      ),
    ).toBe(true)
    expect(
      frames.some(
        f => !f.label.includes('Kennedy Town') && f.opacity > 0 && f.opacity < 0.95,
      ),
    ).toBe(true)
    expect(frames.every(frame => frame.legendsRetained)).toBe(true)
    expect(frames.every(frame => frame.navRetained)).toBe(true)
    const pending = frames.filter(
      frame => !frame.label.includes('Kennedy Town') && frame.opacity === 0,
    )
    expect(pending.length).toBeGreaterThan(0)
    expect(pending.some(frame => frame.oldLegends)).toBe(true)
    expect(frames.some(frame => frame.flip)).toBe(true)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.getByRole('button', { name: 'Previous', exact: true }).click()
    await expect(page.locator('[data-station-surface]')).toHaveAttribute(
      'aria-label',
      /Kennedy Town/,
    )
    await expect(content).toHaveCSS('transition-duration', '0s')
    await expect(content).toHaveCSS('opacity', '1')
    await expect(scene).toBeVisible()
  })
}
