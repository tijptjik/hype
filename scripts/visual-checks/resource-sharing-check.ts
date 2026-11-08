// PLAYWRIGHT
import { chromium, firefox } from 'playwright'
// NODE
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'

const origin = process.env.HYPE_CHECK_ORIGIN ?? 'http://localhost:5175'
await mkdir('output/playwright', { recursive: true })
for (const [name, engine] of [
  ['chromium', chromium],
  ['firefox', firefox],
] as const) {
  const browser = await engine.launch({
    headless: true,
    ...(name === 'chromium' ? { args: ['--disable-web-security'] } : {}),
  })
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'canShare', {
        configurable: true,
        value: () => true,
      })
      Object.defineProperty(navigator, 'share', {
        configurable: true,
        value: async (data: ShareData) => {
          ;(window as unknown as { shared: ShareData }).shared = data
        },
      })
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText: async (value: string) => {
            ;(window as unknown as { copied: string }).copied = value
          },
        },
      })
    })
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(`${origin}/features/06mgoWo87jHo`, {
      waitUntil: 'domcontentloaded',
    })
    const share = page.getByRole('button', { name: 'Share', exact: true })
    await share.waitFor({ timeout: 90000 })
    await share.click()
    const choices = page.getByRole('menuitem')
    assert.equal(await choices.count(), 4)
    await choices.last().click()
    await page.getByRole('link', { name: 'Facebook', exact: true }).waitFor()
    assert(
      (
        await page.getByRole('link', { name: 'X', exact: true }).getAttribute('href')
      )?.includes('intent/tweet'),
    )
    await page.getByRole('button', { name: 'Copy link', exact: true }).click()
    assert.equal(
      await page.evaluate(() => (window as unknown as { copied: string }).copied),
      `${origin}/features/06mgoWo87jHo`,
    )
    await page
      .getByRole('button', { name: 'More sharing options', exact: true })
      .click()
    assert.equal(
      await page.evaluate(
        () => (window as unknown as { shared: ShareData }).shared.url,
      ),
      `${origin}/features/06mgoWo87jHo`,
    )
    await page.screenshot({ path: `output/playwright/sharing-${name}-targets.png` })
    await page.getByRole('button', { name: 'Instagram', exact: true }).click()
    await page
      .getByRole('button', { name: 'Copy caption and link', exact: true })
      .waitFor()
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    await page.getByRole('button', { name: 'Share image', exact: true }).click()
    assert.equal(
      await page.evaluate(
        () => (window as unknown as { shared: ShareData }).shared.files?.[0]?.type,
      ),
      'image/jpeg',
    )
    const back = page.getByRole('button', { name: 'Back to photos', exact: true })
    assert(await back.evaluate(element => {
      const bounds = element.getBoundingClientRect()
      return element.contains(document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2))
    }), 'Back to photos must remain visible while Instagram options scroll')
    await page.screenshot({ path: `output/playwright/sharing-${name}-mobile.png` })
    await page.getByRole('button', { name: 'Back to photos', exact: true }).click()
    await share.waitFor()
    await share.focus()
    await page.keyboard.press('Enter')
    await page.getByRole('menuitem').first().waitFor()
    await page.waitForFunction(() => ['menu', 'menuitem'].includes(document.activeElement?.getAttribute('role') ?? ''))
    await page.keyboard.press('ArrowDown')
    await page.waitForFunction(() => document.activeElement?.getAttribute('role') === 'menuitem')
    await page.keyboard.press('Enter')
    await page.getByRole('heading', { name: /Share/ }).waitFor()
    await page.waitForFunction(() => document.activeElement?.id === 'feature-share-heading')
    assert.equal(
      await page.evaluate(() => document.activeElement?.id),
      'feature-share-heading',
    )
    await page.keyboard.press('Escape')
    await page.getByRole('heading', { name: /Share/ }).waitFor({ state: 'hidden' })
    await page.setViewportSize({ width: 1440, height: 1000 })
    await share.click()
    await page.getByRole('menuitem').nth(1).click()
    await page.getByRole('link', { name: 'Facebook', exact: true }).waitFor()
    await page.screenshot({ path: `output/playwright/sharing-${name}-desktop.png` })
    assert.deepEqual(errors, [])
    console.log(
      `${name}: live feature sharing, four scopes, platform links, Instagram handoff, keyboard and narrow layout passed`,
    )
  } finally {
    await browser.close()
  }
}
