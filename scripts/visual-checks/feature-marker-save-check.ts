// PLAYWRIGHT
import { chromium, expect } from '@playwright/test'
// NODE
import { writeFile } from 'node:fs/promises'
const origin = process.env.PLAYWRIGHT_BASE_URL
const artifacts = process.env.DEV_RUNNER_ARTIFACTS
const placement = process.env.DEV_RUNNER_CHROME_CLASS
if (!origin || !artifacts || !placement || process.env.HYPE_E2E_PRIVATE_STATE !== '1')
  throw new Error(
    'Use dev-remote chrome with HYPE_E2E_PRIVATE_STATE=1 and an isolated database',
  )
const browser = await chromium.launch({
  channel: 'chrome',
  headless: false,
  args: ['--disable-web-security', '--ozone-platform=x11', `--class=${placement}`],
})
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
const errors: string[] = []
page.on('pageerror', error => errors.push(error.stack ?? error.message))
page.on('console', message => {
  if (message.type() === 'error' && message.text().includes('form_field'))
    errors.push(message.text())
})
await page.route('https://tiles.saanseoi.hk/**', async route => {
  const response = await route.fetch({
    headers: { ...route.request().headers(), origin: 'http://hype.localhost' },
  })
  await route.fulfill({ response })
})
try {
  await page.goto(`${origin}/admin`, { waitUntil: 'load', timeout: 120000 })
  expect(
    (await (await page.request.get(`${origin}/api/auth/get-session`)).json())?.user?.id,
  ).toBe('hype-local-agent-admin')
  expect(new URL(page.url()).pathname).toMatch(/^\/admin/)
  await page.goto(`${origin}/admin/features/blD0ebb3519a#location`, {
    waitUntil: 'load',
    timeout: 120000,
  })
  await page
    .getByRole('button', { name: 'Edit', exact: true })
    .click({ timeout: 120000 })
  const marker = page.locator('.maplibregl-marker').filter({ visible: true }).first()
  await marker.waitFor({ timeout: 60000 })
  await page.waitForTimeout(8000)
  const box = await marker.boundingBox()
  if (!box) throw new Error('Marker has no bounds')
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + 90, box.y + box.height / 2 + 50, {
    steps: 20,
  })
  await page.mouse.up()
  await expect(
    page.getByText(
      'The marker moved. Look up the address again or keep your local corrections.',
    ),
  ).toBeVisible()
  await writeFile(
    `${artifacts}/form-fields.json`,
    JSON.stringify(
      await page.locator('form').evaluateAll(forms =>
        forms.map(form => ({
          id: form.id,
          fields: [...new FormData(form as HTMLFormElement).keys()],
        })),
      ),
      null,
      2,
    ),
  )
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Edit', exact: true })).toBeVisible({
    timeout: 60000,
  })
  await expect(page.getByText('SHARED_LOCATION_REVISION_UNAVAILABLE')).toHaveCount(0)
  await page.reload({ waitUntil: 'load' })
  await expect(page.getByRole('button', { name: 'Edit', exact: true })).toBeVisible({
    timeout: 60000,
  })
  expect(errors).toEqual([])
} finally {
  await writeFile(
    `${artifacts}/marker-save-errors.json`,
    JSON.stringify(errors, null, 2),
  )
  await writeFile(
    `${artifacts}/marker-save-dom.txt`,
    await page.locator('body').innerText(),
  )
  await page.screenshot({ path: `${artifacts}/marker-save.png` })
  await browser.close()
}
