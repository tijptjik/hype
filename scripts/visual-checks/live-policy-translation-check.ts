import { mkdir } from 'node:fs/promises'
await mkdir(
  process.env.DEV_RUNNER_ARTIFACTS ?? 'output/playwright/hub-translation-review',
  { recursive: true },
)
import { chromium } from '@playwright/test'
for (const type of [chromium]) {
  if (!process.env.DEV_RUNNER_CHROME_CLASS || !process.env.PLAYWRIGHT_BASE_URL)
    throw new Error('Run through dev-remote chrome with managed visible launch options')
  const browser = await type.launch({
    headless: false,
    channel: 'chrome',
    args: ['--ozone-platform=x11', `--class=${process.env.DEV_RUNNER_CHROME_CLASS}`],
  })
  try {
    for (const width of [1440]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 } })
      const pageErrors: string[] = []
      page.on('pageerror', error => {
        pageErrors.push(error.stack ?? error.message)
        console.error(error.stack ?? error.message)
      })
      const baseURL = process.env.PLAYWRIGHT_BASE_URL!
      const adminResponse = await page.goto(new URL('/admin', baseURL).href, {
        waitUntil: 'domcontentloaded',
        timeout: 120000,
      })
      if (!adminResponse?.ok() || !new URL(page.url()).pathname.startsWith('/admin'))
        throw Error('Admin access failed')
      await page
        .locator('main:visible, [role=main]:visible, button:visible')
        .first()
        .waitFor({ timeout: 120000 })
      const sessionResponse = await page.request.get(
        new URL('/api/auth/get-session', baseURL).href,
      )
      const session = await sessionResponse.json()
      if (session?.user?.id !== 'hype-local-agent-admin')
        throw Error('Local admin identity not available')
      const result = await page.evaluate(async () => {
        const modulePath = '/src/lib/api/translation.remote.ts'
        const { translateContentField } = await import(modulePath)
        return translateContentField({
          source: 'zh-Hant',
          target: 'en',
          text: '# 私隱政策\n\n## 資料收集\n\n我們只收集提供服務所需的個人資料。\n\n## 聯絡我們\n\n如有私隱問題，請聯絡我們。',
        })
      })
      if (
        result.status !== 'translated' ||
        !result.text.trim() ||
        !result.automatic.receipt
      )
        throw Error(
          'Live policy translation did not return a signed suggestion: ' +
            JSON.stringify(result),
        )
      console.log('PASS live Chinese-to-English Markdown policy translation', {
        status: result.status,
        text: result.text,
        signed: Boolean(result.automatic.receipt),
      })
      await page.close()
    }
  } finally {
    await browser.close()
  }
}
