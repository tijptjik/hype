import { chromium } from 'playwright'
import sharp from 'sharp'
import {
  MAP_STYLE_RENDER_CAPTURE_SIZE,
  MAP_STYLE_RENDER_OUTPUT_SIZE,
  MAP_STYLE_RENDER_READY_SELECTOR,
} from '../../src/lib/map/styles/render.shared'
const browser = await chromium.launch({
  executablePath: '/home/io/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome',
  args: ['--disable-web-security'],
})
try {
  for (const key of ['midnight'] as const) {
    const page = await browser.newPage({ viewport: MAP_STYLE_RENDER_CAPTURE_SIZE })
    await page.route('http://localhost:5173/**', async route => {
      const response = await route.fetch({
        url: route
          .request()
          .url()
          .replace('http://localhost:5173', 'http://127.0.0.1:4173'),
      })
      await route.fulfill({ response })
    })
    await page.route('**/__render.html?*', route =>
      route.fulfill({
        contentType: 'text/html',
        body: '<html><head><style>html,body,#app{margin:0;width:100%;height:100%;overflow:hidden}</style></head><body><div id="app"></div><div id="map-style-render-ready" data-ready="false"></div><script type="module" src="/src/tests/fixtures/mapStyleRenderCheck.ts"></script></body></html>',
      }),
    )
    page.on('console', m => console.log(m.type(), m.text()))
    page.on('requestfailed', r =>
      console.log('FAILED', r.url(), r.failure()?.errorText),
    )
    page.on('pageerror', e => console.log(key, e.message))
    await page.goto(`http://localhost:5173/__render.html?style=${key}`, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    })
    await page.waitForSelector(MAP_STYLE_RENDER_READY_SELECTOR, {
      timeout: 60000,
      state: 'attached',
    })
    const buffer = await sharp(await page.screenshot())
      .resize(MAP_STYLE_RENDER_OUTPUT_SIZE.width, MAP_STYLE_RENDER_OUTPUT_SIZE.height, {
        fit: 'cover',
      })
      .png()
      .toBuffer()
    await Bun.write(`output/playwright/${key}-preview.png`, buffer)
    console.log('Captured', key)
    await page.close()
  }
} finally {
  await browser.close()
}
