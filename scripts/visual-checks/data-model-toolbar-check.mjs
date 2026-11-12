import { chromium } from '@playwright/test'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'

const output = process.env.DEV_RUNNER_ARTIFACTS
const baseURL = process.env.PLAYWRIGHT_BASE_URL
if (!output || !baseURL) throw new Error('Run through dev-remote --port PORT chrome')
const browser = await chromium.launch({
  channel: 'chrome',
  headless: false,
  args: ['--ozone-platform=x11', `--class=${process.env.DEV_RUNNER_CHROME_CLASS}`],
})
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
const page = await context.newPage()
const result = {}
try {
  await page.goto(baseURL)
  const session = await (
    await context.request.get(new URL('/api/auth/get-session', baseURL).href)
  ).json()
  if (session?.user?.id !== 'hype-local-agent-admin')
    throw new Error('Local admin session required')
  const response = await page.goto(
    new URL('/admin/projects/hkghostsigns#location', baseURL).href,
  )
  if (!response?.ok() || !new URL(page.url()).pathname.startsWith('/admin/projects/'))
    throw new Error('Admin project access failed')
  const remove = page.getByRole('button', { name: 'Remove Type', exact: true })
  await remove.waitFor({ state: 'visible', timeout: 60000 })
  if (!(await remove.isDisabled()))
    throw new Error('Expected disabled remove button in view mode')
  const cursor = await remove.evaluate(el => getComputedStyle(el).cursor)
  if (cursor !== 'default') throw new Error(`Disabled cursor is ${cursor}`)
  result.disabledCursor = cursor
  const before = await remove.evaluate(el => getComputedStyle(el).backgroundColor)
  await remove.hover({ force: true })
  const after = await remove.evaluate(el => getComputedStyle(el).backgroundColor)
  if (before !== after)
    throw new Error(`Disabled hover changed background: ${before} -> ${after}`)
  const separator = await remove.evaluate(el => {
    const style = getComputedStyle(el.parentElement)
    return {
      border: style.borderInlineStartWidth,
      padding: style.paddingInlineStart,
      margin: style.marginInlineStart,
    }
  })
  if (parseFloat(separator.border) < 1 || parseFloat(separator.padding) < 12)
    throw new Error('Missing toolbar separation')
  result.separator = separator
  result.disabledBackground = after
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    await remove.scrollIntoViewIfNeeded()
    await page.screenshot({
      path: path.join(output, `data-model-toolbar-${width}.png`),
      fullPage: true,
    })
  }
  // Exercise all disabled semantics against the application's actual CSS cascade.
  result.cursorCases = await page.evaluate(() => {
    const fixture = document.createElement('div')
    fixture.innerHTML = `
      <button disabled class="cursor-pointer"><span class="cursor-pointer">Native</span></button>
      <button aria-disabled="true" class="cursor-pointer">ARIA</button>
      <a aria-disabled="true" href="#" class="cursor-pointer">Link</a>
      <div role="menuitem" data-disabled class="cursor-pointer">Bits</div>
      <fieldset disabled><button class="cursor-pointer">Fieldset</button></fieldset>
      <div class="bits-theme"><div class="bits-switch-field--disabled"><label class="bits-switch-label">Switch label</label></div><div class="bits-checkbox-field--disabled"><label class="bits-checkbox-label">Checkbox label</label></div></div>
      <button data-disabled="false" class="cursor-pointer">Enabled</button>`
    document.body.append(fixture)
    const cursors = [
      ...fixture.querySelectorAll('button, a, [role="menuitem"], span, label'),
    ].map(el => ({ text: el.textContent, cursor: getComputedStyle(el).cursor }))
    fixture.remove()
    return cursors
  })
  for (const entry of result.cursorCases) {
    const expected = entry.text === 'Enabled' ? 'pointer' : 'default'
    if (entry.cursor !== expected)
      throw new Error(`${entry.text}: expected ${expected}, got ${entry.cursor}`)
  }
  result.passed = true
} catch (error) {
  result.error = String(error)
  await page
    .screenshot({ path: path.join(output, 'failure.png'), fullPage: true })
    .catch(() => {})
  process.exitCode = 1
} finally {
  await writeFile(path.join(output, 'toolbar.json'), JSON.stringify(result, null, 2))
  await browser.close()
}
