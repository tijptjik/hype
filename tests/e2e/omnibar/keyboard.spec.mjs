import { expect, test } from '@playwright/test'

test('arrow keys navigate visible results and Enter activates the focused result', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 800 })
  await page.route('**/__omnibar-keyboard.html', route =>
    route.fulfill({
      contentType: 'text/html',
      body: '<html><head><script>globalThis.__sveltekit_dev={env:{}}</script></head><body><div id="app"></div><script type="module" src="/src/tests/fixtures/omnibarSearchCheck.ts"></script></body></html>',
    }),
  )
  await page.goto('/__omnibar-keyboard.html')
  const input = page.locator('#omni-search-bar')
  const results = page.locator('[data-omni-result]:visible')
  await expect(results.first()).toBeVisible()
  await expect.poll(() => results.count()).toBeGreaterThan(1)
  await input.focus()
  await page.keyboard.press('ArrowDown')
  await expect(results.nth(0)).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(results.nth(1)).toBeFocused()
  await page.keyboard.press('ArrowUp')
  await expect(results.nth(0)).toBeFocused()
  await page.keyboard.press('ArrowUp')
  await expect(input).toBeFocused()
  await page.keyboard.press('ArrowUp')
  await expect(results.last()).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(input).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await expect(page.locator('output')).toHaveText('activate:feature-0')
})
