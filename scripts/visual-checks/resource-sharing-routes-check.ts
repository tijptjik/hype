// PLAYWRIGHT
import { chromium } from 'playwright'
// NODE
import assert from 'node:assert/strict'
import { unflatten } from 'devalue'
import { writeFile } from 'node:fs/promises'

const origin = process.env.HYPE_CHECK_ORIGIN ?? 'http://localhost:5175'
const browser = await chromium.launch({
  headless: true,
  args: ['--disable-web-security'],
})
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  const requests: string[] = []
  page.on('request', request => {
    if (request.url().includes('_app/remote') && /feature/i.test(request.url()))
      requests.push(`${request.url()} ${request.postData() ?? ''}`)
  })
  for (const path of [
    '/layer/lMsnrDxWhJss',
    '/project/neon',
    '/organisation/cityrecorder',
  ]) {
    requests.length = 0
    if (path.startsWith('/layer/')) {
      const response = await page.goto(`${origin}${path}`, {
        waitUntil: 'domcontentloaded',
      })
      assert.equal(response?.status(), 200)
    } else {
      // Ordinary links exercise SvelteKit client navigation in the existing map instance.
      await page.evaluate(href => {
        const link = document.createElement('a')
        link.href = href
        link.id = 'route-check-link'
        link.textContent = 'Check map route'
        document.body.append(link)
        link.click()
        link.remove()
      }, path)
      await page.waitForURL(`${origin}${path}`)
    }
    await page.getByTestId('map').waitFor({ timeout: 60000 })
    await page.waitForTimeout(6000)
    assert.equal(new URL(page.url()).pathname, path)
    const ids = await page
      .locator('[data-feature-id]')
      .evaluateAll(elements => [
        ...new Set(elements.map(element => element.getAttribute('data-feature-id'))),
      ])
    assert(ids.length > 0, `${path} should display map features`)
    const kind = path.split('/')[1]
    const metadata = await (await page.request.get(`${origin}/api/share${path}`)).json()
    const encoded = requests
      .filter(request => request.includes('/getFeaturePage '))
      .at(-1)
      ?.split(' ')
      .slice(1)
      .join(' ')
    assert(encoded, `${path} should request its feature scope`)
    const payload = JSON.parse(encoded).payloads.at(-1)
    const args = unflatten(JSON.parse(Buffer.from(payload, 'base64url').toString()), {
      __skrao: value => value,
    }) as { prisms: Record<string, string[]> }
    assert.deepEqual(
      args.prisms[kind],
      [metadata.id],
      `${path} must select exactly its addressed scope`,
    )
    console.log(
      path,
      'persistent address and exact map query scope passed; visible markers:',
      ids.length,
    )
    await writeFile(
      `/tmp/hype-share-${path.split('/')[1]}-requests.json`,
      JSON.stringify(requests, null, 2),
    )
    await page.screenshot({
      path: `output/playwright/sharing-route-${path.split('/')[1]}.png`,
    })
  }
  assert.deepEqual(errors, [])
} finally {
  await browser.close()
}
