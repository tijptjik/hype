import { chromium } from 'playwright'
const browser = await chromium.launch({
  executablePath: '/home/io/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome',
  args: ['--disable-web-security'],
})
try {
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } })
  const errors: string[] = []
  let countRequested = false
  page.on('pageerror', error => errors.push(error.message))
  page.on('request', request => {
    if (request.url().includes('/getTasks')) countRequested = true
  })
  await page.goto(
    `${process.env.FEATURE_CHECK_URL ?? 'http://127.0.0.1:4173'}/admin/features/new`,
    { waitUntil: 'domcontentloaded', timeout: 60000 },
  )
  const task = page
    .getByRole('navigation', { name: 'Admin menu' })
    .locator('.bits-admin-menu__item')
    .filter({ has: page.getByRole('link', { name: 'Tasks', exact: true }) })
  const badge = task.locator('.bits-admin-menu__badge')
  await badge.waitFor({ timeout: 60000 })
  const count = (await badge.textContent())?.trim()
  if (!count || !countRequested) throw Error('Task count was not loaded independently')
  if (!page.url().includes('/admin/features/new')) throw Error('Left the initial page')
  if (errors.length) throw Error(errors.join('\n'))
  await page.screenshot({ path: 'output/playwright/admin-task-count-initial-load.png' })
  console.log(
    JSON.stringify({ freshFeaturePage: true, countRequested, badge: count, errors }),
  )
} finally {
  await browser.close()
}
