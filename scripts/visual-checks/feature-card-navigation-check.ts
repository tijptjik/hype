// BROWSER
import { chromium } from 'playwright'
// NODE
import assert from 'node:assert/strict'
const b = await chromium.launch({ headless: true, args: ['--disable-web-security'] })
const p = await b.newPage({ viewport: { width: 814, height: 1411 } })
p.on('pageerror', e => console.log('ERROR', e.message))
/** Waits for the real route, collection position and decoded photo to agree. */
async function waitForCard(index: number): Promise<void> {
  await p.waitForFunction(
    expected => {
      const title = document.querySelector('#omni-nav-bar')?.textContent ?? ''
      const scenes = [
        ...document.querySelectorAll('[data-feature-card-gallery] .viewer-scene'),
      ]
      const image = scenes[0]?.querySelector('img')
      const featureId = location.pathname.split('/').at(-1)
      return (
        title.includes(`(${expected} of `) &&
        scenes.length === 1 &&
        image?.complete &&
        image.naturalWidth > 0 &&
        new URL(image.src).searchParams.get('feature') === featureId &&
        getComputedStyle(scenes[0]).opacity === '1'
      )
    },
    index,
    { timeout: 60000 },
  )
}

try {
  await p.goto(process.env.HYPE_CHECK_ORIGIN ?? 'http://hype.localhost')
  await p.getByPlaceholder('Start your journey...').fill('Mong Kok')
  await p.waitForTimeout(7000)
  await p.locator('[data-omni-section="neighbourhood"] [data-omni-entry]').click()
  await waitForCard(1)
  await p.evaluate(() => {
    const nodes = new WeakMap<Element, number>()
    let seq = 0
    const id = (e: Element | null) =>
      e ? (nodes.get(e) ?? (nodes.set(e, ++seq), seq)) : null
    const events: any[] = []
    Object.assign(window, { flashEvents: events })
    let last = ''
    const loop = () => {
      const gallery = document.querySelector('[data-feature-card-gallery]')
      const data = {
        url: location.pathname,
        gallery: id(gallery),
        imgs: [
          ...document.querySelectorAll('[data-feature-card-gallery] .viewer-scene img'),
        ].map(e => ({
          node: id(e),
          src: e.getAttribute('src'),
          opacity: getComputedStyle(e.closest('.viewer-scene')!).opacity,
          complete: (e as HTMLImageElement).complete,
        })),
        title: document.querySelector('#omni-nav-bar')?.textContent,
      }
      const key = JSON.stringify(data)
      if (key !== last) {
        events.push({ t: Math.round(performance.now()), ...data })
        last = key
      }
      requestAnimationFrame(loop)
    }
    loop()
  })
  for (let n = 0; n < 4; n++) {
    await p.locator('#omni-nav-bar button').last().click()
    await waitForCard(n + 2)
    await p.waitForTimeout(5000)
    console.log(
      'STEP',
      n + 2,
      p.url(),
      (await p.locator('#omni-nav-bar').innerText()).replaceAll('\n', ' '),
    )
  }
  const events = (await p.evaluate(() => (window as any).flashEvents)) as Array<{
    gallery: number
    imgs: Array<{ node: number; src: string }>
  }>
  await Bun.write('/tmp/card-flash-events.json', JSON.stringify(events, null, 2))
  assert.equal(
    new Set(events.map(event => event.gallery)).size,
    1,
    'Gallery must stay mounted',
  )
  const photos = new Map(
    events.flatMap(event => event.imgs.map(image => [image.node, image.src] as const)),
  )
  assert.equal(
    photos.size,
    5,
    'Each of the five destinations must mount exactly one photo',
  )
  assert.ok(
    [...photos.values()].every(src => src.startsWith('/api/images/revisions/')),
    'Preview and hydrated cards must use accepted revisions',
  )
  console.log('Verified one gallery and five photo nodes across five Mong Kok cards')
  await p.screenshot({ path: '/tmp/card-flash-progress.png' })
} finally {
  await b.close()
}
