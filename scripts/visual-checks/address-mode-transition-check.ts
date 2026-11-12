import { chromium, firefox } from 'playwright'
import { mkdir } from 'node:fs/promises'
declare global {
  interface Window {
    modeAnimations: {
      start: { x: number; y: number }
      target: string[]
      frames: Keyframe[] | PropertyIndexedKeyframes | null
    }[]
  }
}
await mkdir('output/playwright', { recursive: true })
for (const [name, engine] of [
  ['chromium', chromium],
  ['firefox', firefox],
] as const) {
  const browser = await engine.launch()
  const page = await browser.newPage({ viewport: { width: 1440, height: 850 } })
  const errors: string[] = []
  page.setDefaultTimeout(15000)
  page.on('pageerror', error => {
    errors.push(error.message)
    console.error(error.message)
  })
  try {
    const memberships = [
      ['Lantau', 'major_island', 'landform', 1],
      ['Tsuen Wan', 'district', 'administrative', 2],
      ['New Territories', 'region', 'administrative', 1],
      ['Hong Kong', 'country', 'administrative', 0],
      ['Hong Kong Disneyland Resort', 'neighbourhood', 'hood', 5],
    ].map(([id, kind, category, level]) => ({
      id,
      class: kind,
      category,
      level,
      names: { en: { name: id } },
    }))
    await page.route('**/src/lib/api/division.remote.ts*', route =>
      route.fulfill({
        contentType: 'text/javascript',
        body: `export async function getAddressDivisionContext(){return ${JSON.stringify({ available: true, memberships, options: memberships })}}; export function getAddressDivisionLabel(){return {current:null}}; export async function getDivisionGeometry(){return null}`,
      }),
    )
    await page.route('**/__address-mode-transition.html', route =>
      route.fulfill({
        contentType: 'text/html',
        body: '<html data-theme="breadline-light"><head><meta name="viewport" content="width=device-width,initial-scale=1"><script>globalThis.__sveltekit_dev={env:{}}</script></head><body><div id="app"></div><script type="module" src="/src/tests/fixtures/addressModeTransitionCheck.ts"></script></body></html>',
      }),
    )
    await page.goto(
      `${process.env.HYPE_CHECK_ORIGIN ?? 'http://127.0.0.1:4173'}/__address-mode-transition.html`,
      {
        timeout: 60000,
      },
    )
    await page
      .getByText('Lantau', { exact: true })
      .waitFor()
      .catch(async error => {
        console.log((await page.locator('body').textContent())?.slice(0, 1500))
        throw error
      })
    await page.evaluate(() => document.fonts.ready)
    await page.evaluate(() => {
      const original = Element.prototype.animate
      Object.assign(window, { modeAnimations: [] })
      Element.prototype.animate = function (...args) {
        const animation = original.apply(this, args)
        if (
          this.matches(
            '[data-address-details], [data-address-divisions], [data-address-parts-panel]',
          )
        ) {
          animation.pause()
          animation.currentTime = 0
          const start = this.getBoundingClientRect()
          window.modeAnimations.push({
            start: { x: start.x, y: start.y },
            target: this.getAttributeNames().filter(name =>
              name.startsWith('data-address-'),
            ),
            frames: args[0],
          })
        }
        animation.play()
        return animation
      }
    })
    for (const width of [1440, 1000, 390]) {
      await page.setViewportSize({ width, height: 850 })
      for (const reduced of [false, true]) {
        await page.emulateMedia({ reducedMotion: reduced ? 'reduce' : 'no-preference' })
        await page.evaluate(() => {
          window.modeAnimations = []
        })
        const divisions = await page.locator('[data-address-divisions]').elementHandle()
        const locality = await page
          .locator('[data-division-group=locality] li')
          .first()
          .elementHandle()
        const beforeGeometry = await page
          .locator('[data-address-divisions]')
          .boundingBox()
        await page.getByRole('button', { name: 'Toggle editing' }).click()
        await page.waitForTimeout(400)
        const records = await page.evaluate(() => window.modeAnimations)
        if (
          !(await divisions?.evaluate(
            node => node === document.querySelector('[data-address-divisions]'),
          ))
        )
          throw Error('Divisions was replaced')
        if (
          !(await locality?.evaluate(
            node =>
              node === document.querySelector('[data-division-group=locality] li'),
          ))
        )
          throw Error('Locality row was replaced')
        const movement = records.find(record =>
          record.target.includes('data-address-divisions'),
        )
        if (
          !reduced &&
          beforeGeometry &&
          (!movement ||
            Math.abs(movement.start.x - beforeGeometry.x) > 2 ||
            Math.abs(movement.start.y - beforeGeometry.y) > 2)
        )
          throw Error(
            'Divisions did not start at its view position: ' +
              JSON.stringify({ beforeGeometry, movement }),
          )
        if (
          reduced
            ? records.length !== 0
            : !records.some(record =>
                record.target.includes('data-address-parts-panel'),
              )
        )
          throw Error(
            'Missing entry animation or reduced motion ignored: ' +
              JSON.stringify(records),
          )
        await page.screenshot({
          path: `output/playwright/${name}-address-mode-${width}-${reduced}.png`,
        })
        await page.evaluate(() => {
          window.modeAnimations = []
        })
        const editGeometry = await page
          .locator('[data-address-divisions]')
          .boundingBox()
        await page.getByRole('button', { name: 'Toggle editing' }).click()
        await page.waitForTimeout(400)
        const exits = await page.evaluate(() => window.modeAnimations)
        const returning = exits.find(record =>
          record.target.includes('data-address-divisions'),
        )
        if (
          !reduced &&
          editGeometry &&
          (!returning ||
            Math.abs(returning.start.x - editGeometry.x) > 2 ||
            Math.abs(returning.start.y - editGeometry.y) > 2)
        )
          throw Error('Divisions did not return from its edit position')
        if (
          !(await locality?.evaluate(
            node =>
              node === document.querySelector('[data-division-group=locality] li'),
          ))
        )
          throw Error('Locality row was replaced on return')
        if (reduced ? exits.length !== 0 : exits.length === 0)
          throw Error('Missing return movement or reduced motion ignored')
        const stale = await page
          .locator('[data-address-editor-layout]')
          .evaluate(
            node =>
              node
                .getAnimations({ subtree: true })
                .filter(a => a.playState === 'running').length,
          )
        if (stale) throw Error('Animations did not settle')
        console.log(
          name,
          width,
          reduced ? 'reduced motion' : 'motion',
          'passed both directions',
        )
      }
    }
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    for (let toggle = 0; toggle < 4; toggle++) {
      await page
        .getByRole('button', { name: 'Toggle editing' })
        .evaluate(node => (node as HTMLButtonElement).click())
      await page.waitForTimeout(35)
    }
    await page.waitForTimeout(400)
    if (
      await page
        .locator('[data-address-editor-layout]')
        .evaluate(node =>
          node
            .getAnimations({ subtree: true })
            .some(animation => animation.playState === 'running'),
        )
    )
      throw Error('Rapid toggles left an animation running')
    console.log(name, 'rapid reversal passed')
    if (errors.length) throw Error(errors.join('\n'))
  } finally {
    await browser.close()
  }
}
