import assert from 'node:assert/strict'
import { chromium } from '@playwright/test'
const base = process.env.PLAYWRIGHT_BASE_URL
const output = process.env.DEV_RUNNER_ARTIFACTS
if (!base || !output) throw Error('Run through dev-remote chrome')
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
  const response = await page.goto(`${base}/admin/features/vg0uryG54sIM#location`)
  assert(response?.ok())
  assert(new URL(page.url()).pathname.startsWith('/admin/'))
  const submits: string[] = []
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.route('**/*', async route => {
    if (
      route.request().method() === 'POST' &&
      route.request().url().includes('featureForm')
    ) {
      submits.push(route.request().url())
      await route.abort()
    } else await route.continue()
  })
  await page.getByRole('button', { name: 'Location', exact: true }).click()
  for (const width of [1440]) {
    await page.setViewportSize({ width, height: 1000 })
    for (const editing of [false, true]) {
      if (editing) await page.getByRole('button', { name: 'Edit', exact: true }).click()
      const trigger = page.getByRole('button', { name: 'Sync policy', exact: true })
      try {
        await trigger.waitFor({ timeout: 60000 })
      } catch (error) {
        console.log('Page errors:', errors)
        await page.screenshot({ path: `${output}/policy-trigger-failure.png` })
        throw error
      }
      await trigger.click()
      const tooltip = page.getByRole('tooltip', { name: 'Sync policy', exact: true })
      await tooltip.locator('[data-sync-policy-source]').waitFor({ timeout: 30000 })
      assert.equal(await tooltip.locator('[data-sync-policy-choice] svg').count(), 7)
      assert.deepEqual(
        await tooltip.locator('[data-sync-policy-group=sections] dt').allTextContents(),
        ['Name & brand', 'Address', 'Map location', 'Channels'],
      )
      assert.deepEqual(
        await tooltip.locator('[data-sync-policy-group=special] dt').allTextContents(),
        [
          'Fill empty sections automatically',
          'Business or venue moves',
          'Accept a newly matched address',
        ],
      )
      assert.equal(
        await tooltip.locator('[data-sync-policy-layer-definition]').count(),
        0,
      )
      assert.deepEqual(
        await tooltip
          .locator('h3')
          .allTextContents()
          .then(items => items.map(item => item.trim())),
        ['SaanSeoi', 'Community'],
      )
      assert.equal(
        await tooltip
          .getByText('Fill empty sections automatically', { exact: true })
          .count(),
        1,
      )
      assert.equal(
        await tooltip
          .getByText('Accept a newly matched address', { exact: true })
          .count(),
        1,
      )
      assert.equal(await tooltip.getByText(/Map movement rules still apply/).count(), 1)
      assert.equal(
        await page.locator('.bits-dialog__overlay, .bits-dialog__content').count(),
        0,
      )
      await page.waitForTimeout(400)
      await page.screenshot({ path: `${output}/policy-placement-${editing}.png` })
      const geometry = await tooltip.evaluate(node => {
        const rect = node.getBoundingClientRect()
        const probe = document.createElement('div')
        probe.style.backgroundColor = 'var(--color-panel)'
        node.append(probe)
        const expected = getComputedStyle(probe).backgroundColor
        probe.remove()
        const body = node.querySelector('[data-sync-policy-content]') ?? node
        return {
          x: rect.x,
          right: rect.right,
          width: innerWidth,
          actual: getComputedStyle(node).backgroundColor,
          expected,
          overflow: body.scrollWidth > body.clientWidth + 1,
        }
      })
      assert.equal(
        geometry.actual,
        geometry.expected,
        'Uses the shared tooltip panel color',
      )
      assert(
        geometry.x >= 0 && geometry.right <= geometry.width + 1 && !geometry.overflow,
        JSON.stringify(geometry),
      )
      const anchor = await trigger.boundingBox()
      const panel = await tooltip.boundingBox()
      assert(anchor && panel)
      assert(
        panel.x + panel.width <= anchor.x,
        'Policy opens to the left of its button',
      )
      const content = tooltip.locator('[data-sync-policy-content]')
      assert(
        await content.evaluate(node => node.scrollHeight <= node.clientHeight + 1),
        'Full policy is visible at desktop height',
      )
      await tooltip.getByText('SaanSeoi', { exact: true }).waitFor()
      await page.screenshot({
        path: `${output}/sync-policy-${width}-${editing ? 'edit' : 'view'}.png`,
      })
      await page.keyboard.press('Escape')
      await tooltip.waitFor({ state: 'hidden' })
      await trigger.focus()
      await page.keyboard.press('Enter')
      await tooltip.waitFor()
      await page.keyboard.press('Escape')
      await tooltip.waitFor({ state: 'hidden' })
      assert.equal(
        submits.length,
        0,
        'Policy inspection must never submit the Feature form',
      )
      assert.deepEqual(errors, [])
      if (editing)
        await page.getByRole('button', { name: 'Cancel', exact: true }).click()
      console.log(
        width,
        editing ? 'edit' : 'view',
        'policy click, keyboard, dismissal and non-submission passed',
      )
    }
  }
  await page.getByRole('button', { name: 'Sync policy', exact: true }).click()
  await page.locator('[data-sync-policy-source]').waitFor()
  const layerLink = page.locator('[data-sync-policy-layer-definition]')
  if (await layerLink.count()) {
    assert((await layerLink.textContent())?.trim())
    assert.match(
      (await layerLink.getAttribute('href')) ?? '',
      /^\/admin\/layers\/[^/]+#advanced$/,
    )
    await layerLink.click()
    await page
      .getByRole('heading', { name: 'Business or venue moves', exact: true })
      .waitFor({ timeout: 60000 })
    assert.equal(new URL(page.url()).hash, '#advanced')
    console.log('Layer definition link opens its relocation settings')
  }
  // Admin deliberately blocks phone viewports; verify the same component in isolation.
  await page.route('**/src/lib/api/location.remote.ts*', route =>
    route.fulfill({
      contentType: 'text/javascript',
      body: `export async function getFeatureLocationSyncPolicy(){return {source:'organisation',definition:{kind:'organisation',id:'o',i18n:{en:{name:'Cultural Foundation',nameGen:false,isAutomaticOnly:false}}},layerRelocation:null,policy:{version:1,coordinates:{mode:'withinDistance',maxMetres:25},address:'review',unit:'review',establishment:'review',relocation:'fixed',communications:'follow',sameSources:false,community:{acceptMissing:false,acceptUnresolved:false,coordinates:{mode:'withinDistance',maxMetres:25},address:'review',unit:'review',establishment:'review',relocation:'fixed',communications:'review'}}}}`,
    }),
  )
  await page.route('**/__feature-sync-policy.html', route =>
    route.fulfill({
      contentType: 'text/html',
      body: '<html data-theme="breadline-light"><head><meta name="viewport" content="width=device-width,initial-scale=1"><script>globalThis.__sveltekit_dev={env:{}}</script></head><body class="bits-theme"><form id="app"></form><script type="module" src="/src/tests/fixtures/featureSyncPolicyCheck.ts"></script></body></html>',
    }),
  )
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(`${base}/__feature-sync-policy.html`)
  await page.locator('form').evaluate(form => {
    form.dataset.submissions = '0'
    form.addEventListener('submit', event => {
      event.preventDefault()
      form.dataset.submissions = String(Number(form.dataset.submissions) + 1)
    })
  })
  await page.getByRole('button', { name: 'Sync policy', exact: true }).click()
  const narrow = page.getByRole('tooltip', { name: 'Sync policy', exact: true })
  await narrow.locator('[data-sync-policy-source]').waitFor()
  assert.equal(
    await narrow.locator('[data-sync-policy-definition]').textContent(),
    'Cultural Foundation',
  )
  assert.equal(
    await narrow.locator('[data-sync-policy-definition]').getAttribute('href'),
    '/admin/organisations/o#advanced',
  )
  assert.equal(await narrow.locator('[data-sync-policy-choice] svg').count(), 8)
  assert.equal(await narrow.locator('[data-sync-policy-shared=false]').count(), 1)
  assert.equal(await narrow.locator('[data-sync-policy-shared=true]').count(), 6)
  assert.equal(await narrow.getByText('Keep placement', { exact: true }).count(), 1)
  assert.equal(
    await narrow
      .getByText('Accept moves up to 25 m; review larger moves', { exact: true })
      .count(),
    1,
  )
  await page.waitForTimeout(400)
  const box = await narrow.boundingBox()
  assert(box && box.x >= 0 && box.x + box.width <= 391)
  assert.equal(
    await narrow.evaluate(node => node.scrollWidth > node.clientWidth + 1),
    false,
  )
  await narrow.locator('[data-sync-policy-content]').evaluate(node => {
    node.scrollTop = node.scrollHeight
  })
  await narrow.getByText('SaanSeoi', { exact: true }).waitFor()
  await page.screenshot({ path: `${output}/sync-policy-390.png` })
  await page.keyboard.press('Escape')
  await narrow.waitFor({ state: 'hidden' })
  assert.equal(await page.locator('form').getAttribute('data-submissions'), '0')
  assert.deepEqual(errors, [])
  console.log('390px component layout, scrolling, dismissal and non-submission passed')
} finally {
  await browser.close()
}
