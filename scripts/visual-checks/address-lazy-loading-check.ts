import { chromium } from 'playwright'
const browser = await chromium.launch({
  executablePath: '/home/io/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome',
  args: ['--disable-web-security'],
})
try {
  for (const mobile of [false, true]) {
    const page = await browser.newPage({
      viewport: mobile ? { width: 390, height: 844 } : { width: 1200, height: 1050 },
    })
    const errors: string[] = []
    const batches: {
      count: number
      total: number
      ids: string[]
      continued: boolean
    }[] = []
    page.on('pageerror', error => {
      errors.push(error.message)
    })
    page.on('response', async response => {
      const url = new URL(response.url())
      if (
        url.pathname !== '/addresses/v1/geocode' ||
        url.searchParams.get('address') !== 'hollywood'
      )
        return
      const body = await response.json()
      if (body.errors) {
        errors.push(JSON.stringify(body.errors))
        return
      }
      batches.push({
        count: body.data.length,
        total: body.meta.total,
        ids: body.data.flatMap(
          (row: { relationships: { address: { data: { id: string }[] } } }) =>
            row.relationships.address.data.map(item => item.id),
        ),
        continued: Boolean(url.searchParams.get('cursor')),
      })
    })
    await page.route('**/src/lib/api/draftLocation.remote.ts*', route =>
      route.fulfill({
        contentType: 'text/javascript',
        body: 'export async function searchDraftLocations(){return {rows:[],partial:false}}; export async function searchNearbyDraftLocations(){return {rows:[],partial:false}}',
      }),
    )
    await page.route('**/src/lib/api/division.remote.ts*', route =>
      route.fulfill({
        contentType: 'text/javascript',
        body: 'export function getAddressDivisionLabel(){return {current:null}}; export async function getAddressDivisionContext(){return {available:true,memberships:[],options:[]}}; export async function getDivisionGeometry(){return null}',
      }),
    )
    await page.route('**/__address-lazy.html', route =>
      route.fulfill({
        contentType: 'text/html',
        body: '<html data-theme="hype-dark"><head><meta name="viewport" content="width=device-width, initial-scale=1"><script>globalThis.__sveltekit_dev={env:{}}</script></head><body><div id="app"></div><script type="module" src="/src/tests/fixtures/buildingDiscoveryCheck.ts"></script></body></html>',
      }),
    )
    await page.goto('http://hype.localhost/__address-lazy.html')
    await page.getByRole('button', { name: 'Search by name', exact: true }).click()
    await page.getByRole('button', { name: 'Building', exact: true }).click()
    await page.getByRole('button', { name: 'Shops', exact: true }).click()
    await page.getByRole('textbox').first().fill('hollywood')
    const footer = page.locator('[data-address-pagination]')
    await footer.waitFor({ timeout: 60000 })
    const state = () =>
      footer.innerText().then(text => {
        const match = /([\d,]+) of ([\d,]+) addresses loaded/.exec(text)
        if (!match) throw new Error('Missing loaded/total count: ' + text)
        return {
          count: Number(match[1].replaceAll(',', '')),
          total: Number(match[2].replaceAll(',', '')),
        }
      })
    const initial = await state()
    const first = page.locator('[data-result-id]').first()
    await first.focus()
    const firstId = await first.getAttribute('data-result-id')
    const list = page
      .locator('section')
      .filter({ has: page.locator('[data-result-id]') })
      .last()
    await page.screenshot({
      path: `output/playwright/address-lazy-${mobile ? 'mobile' : 'desktop'}-first.png`,
    })
    let last = initial
    for (let iteration = 0; last.count < last.total && iteration < 100; iteration++) {
      await list.evaluate(element => {
        element.scrollTop = element.scrollHeight
        element.dispatchEvent(new Event('scroll'))
      })
      await page.waitForFunction(
        count => {
          const text =
            document.querySelector('[data-address-pagination]')?.textContent ?? ''
          const match = /([\d,]+) of/.exec(text)
          return match && Number(match[1].replaceAll(',', '')) > count
        },
        last.count,
        { timeout: 15000 },
      )
      last = await state()
    }
    if (last.count !== last.total || last.total <= initial.count)
      throw new Error('Did not load subsequent address batches')
    const ids = batches.flatMap(batch => batch.ids)
    if (new Set(ids).size !== ids.length || ids.length !== last.total)
      throw new Error('Duplicate or missing source addresses across pages')
    const focused = await page.locator(':focus').getAttribute('data-result-id')
    if (focused !== firstId) throw new Error('Loading more replaced keyboard focus')
    const position = await list.evaluate(element => ({
      top: element.scrollTop,
      height: element.clientHeight,
      content: element.scrollHeight,
    }))
    if (position.top < 1000)
      throw new Error('Appending results unexpectedly recentered the list')
    await list.evaluate(element => {
      element.scrollTop = element.scrollHeight
    })
    await page.screenshot({
      path: `output/playwright/address-lazy-${mobile ? 'mobile' : 'desktop'}-all.png`,
    })
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth))
      throw new Error('Mobile horizontal overflow')
    if (errors.length) throw new Error(errors.join('\n'))
    console.log(
      JSON.stringify({
        mobile,
        initial,
        final: last,
        requests: batches.length,
        continuationRequests: batches.filter(batch => batch.continued).length,
        uniqueAddresses: new Set(ids).size,
        focusPreserved: true,
        scrollPreserved: true,
        errors,
      }),
    )
    await page.close()
  }
} finally {
  await browser.close()
}
