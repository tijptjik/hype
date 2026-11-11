import { chromium } from 'playwright'
type Sample = {
  main: number
  header: number
  height: number
  opacity: number
  inert: boolean
  panelTransform: string
}
type SampleWindow = Window & { samples: Sample[] }
const browser = await chromium.launch({ headless: true })
try {
  for (const reducedMotion of ['no-preference', 'reduce'] as const) {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 900 },
      reducedMotion,
    })
    await page.addInitScript(() => {
      ;(window as SampleWindow).samples = []
      function sample() {
        const main = document.querySelector('.bits-admin-shell__main')
        const shell = document.querySelector('.bits-admin-shell')
        const header = shell?.previousElementSibling
        const panel = document.querySelector('#right-panel')
        if (main && header && panel)
          (window as SampleWindow).samples.push({
            main: main.getBoundingClientRect().top,
            header: header.getBoundingClientRect().top,
            height: header.getBoundingClientRect().height,
            opacity: Number(getComputedStyle(main).opacity),
            inert: main.hasAttribute('inert'),
            panelTransform: getComputedStyle(panel).transform,
          })
        requestAnimationFrame(sample)
      }
      requestAnimationFrame(sample)
    })
    await page.route('**/__header-entrance.html*', route =>
      route.fulfill({
        contentType: 'text/html',
        body: '<html class="bits-theme" data-theme="breadline-light"><head><style>@layer theme,base,components,utilities;</style><script>globalThis.__sveltekit_dev={env:{}}</script></head><body style="margin:0"><div id="app"></div><script type="module" src="/src/tests/fixtures/resourceTransitionCheck.ts"></script></body></html>',
      }),
    )
    await page.goto('http://127.0.0.1:5175/__header-entrance.html?shell')
    await page.locator('[data-test-main]').waitFor()
    await page.waitForTimeout(800)
    const samples: Sample[] = await page.evaluate(
      () => (window as SampleWindow).samples,
    )
    const tops = samples.map((s: Sample) => s.main),
      headers = samples.map((s: Sample) => s.header)
    if (Math.max(...tops) - Math.min(...tops) > 0.1)
      throw Error(`Main moved: ${JSON.stringify(samples)}`)
    if (reducedMotion === 'no-preference' && Math.min(...headers) > -5)
      throw Error('Missing entrance')
    if (reducedMotion === 'reduce' && Math.min(...headers) < -0.1)
      throw Error('Reduced motion animated')
    if (Math.abs(headers.at(-1) ?? Infinity) > 0.1) throw Error('Header did not settle')
    if (samples.some((s: Sample) => s.header < -0.1 && s.opacity > 0.001))
      throw Error('Content visible while header entering')
    if (
      samples.some(
        (s: Sample) =>
          s.opacity > 0.001 &&
          s.panelTransform !== 'none' &&
          Math.abs(Number(s.panelTransform.split(',')[4])) > 0.1,
      )
    )
      throw Error('Content visible while side panel entering')
    const background = await page.locator('[data-admin-shell]').evaluate(el => ({
      image: getComputedStyle(el).backgroundImage,
      height: el.getBoundingClientRect().height,
    }))
    if (background.image === 'none' || background.height !== 900)
      throw Error('Missing full-window background')
    if (samples.at(-1)?.opacity !== 1 || samples.at(-1)?.inert)
      throw Error('Content not revealed')
    if (
      reducedMotion === 'no-preference' &&
      !samples.some((s: Sample) => s.opacity > 0 && s.opacity < 1)
    )
      throw Error('Missing fade')
    console.log(
      JSON.stringify({
        reducedMotion,
        frames: samples.length,
        mainTop: tops[0],
        headerStart: Math.min(...headers),
        headerEnd: headers.at(-1),
      }),
    )
    await page.close()
  }
} finally {
  await browser.close()
}
