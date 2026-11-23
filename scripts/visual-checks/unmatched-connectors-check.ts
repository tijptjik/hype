// NODE
import assert from 'node:assert/strict'
// PLAYWRIGHT
import { chromium, expect } from '@playwright/test'
// DATA
import source from '../../src/lib/indoor/network-connectors/KOT.json'

const origin = process.env.PLAYWRIGHT_BASE_URL
const artifacts = process.env.DEV_RUNNER_ARTIFACTS
if (!origin || !artifacts) throw new Error('Use dev-remote chrome')
const browser = await chromium.launch({
  channel: 'chrome',
  headless: false,
  args: ['--ozone-platform=x11', `--class=${process.env.DEV_RUNNER_CHROME_CLASS}`],
})
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  await page.goto(`${origin}/admin/premises-maps?map=kowloon-tong-mtr`)
  assert.equal(
    (await (await page.request.get(`${origin}/api/auth/get-session`)).json()).user.id,
    'hype-local-agent-admin',
  )
  const queue = page.getByRole('region', { name: 'Unmatched connectors' })
  await expect(queue).toBeVisible({ timeout: 120000 })
  const previous = queue.getByRole('button', { name: 'Previous unmatched' })
  const next = queue.getByRole('button', { name: 'Next unmatched' })
  await expect(previous).toBeDisabled()
  const visited: string[] = []
  const floors = new Set<string>()
  for (let index = 0; index < source.unresolved.length; index++) {
    await next.click()
    await expect(queue).toContainText(
      `${index + 1} of ${source.unresolved.length} unmatched`,
    )
    const selected = page.locator(
      '[data-connection-map="left"] [data-state="Selected"]',
    )
    await expect(selected).toHaveCount(1)
    const id = await selected.getAttribute('data-facility')
    assert(id)
    visited.push(id)
    floors.add(await page.getByRole('combobox', { name: 'Left floor' }).innerText())
    await expect(
      page.getByRole('button', { name: 'Save connections', exact: true }),
    ).toBeDisabled()
    const left = page.locator('[data-connection-map="left"] > svg')
    const right = page.locator('[data-connection-map="right"] > svg')
    assert(await left.getAttribute('viewBox'))
    assert.equal(
      await left.getAttribute('viewBox'),
      await right.getAttribute('viewBox'),
    )
    if (index === 1)
      await page.screenshot({ path: `${artifacts}/unmatched-kowloon-tong-desktop.png` })
  }
  assert.equal(new Set(visited).size, source.unresolved.length)
  assert.deepEqual(new Set(visited), new Set(source.unresolved))
  assert(floors.size > 1)
  await expect(next).toBeDisabled()
  await previous.click()
  await expect(
    page.locator('[data-connection-map="left"] [data-state="Selected"]'),
  ).toHaveAttribute('data-facility', visited.at(-2)!)
  await page.setViewportSize({ width: 390, height: 900 })
  await expect(queue).toBeVisible()
  await page.screenshot({ path: `${artifacts}/unmatched-kowloon-tong-mobile.png` })
  console.log(
    `PASS: ${visited.length} unmatched polygons across ${floors.size} floors; next/previous, shared camera and no draft mutations`,
  )
} finally {
  await browser.close()
}
