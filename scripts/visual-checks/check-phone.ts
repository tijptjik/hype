import { chromium } from 'playwright'
const browser = await chromium.launch({ headless: true, executablePath: '/usr/bin/google-chrome', args: ['--disable-web-security'] })
try {
  const page = await browser.newPage({ viewport: { width: 1000, height: 700 } })
  await page.goto('http://127.0.0.1:4173', { waitUntil: 'domcontentloaded' })
  await page.evaluate(async () => {
    const { mount } = await import('/.svelte-kit/vite/deps/svelte.js')
    const { default: Phone } = await import('/src/tests/fixtures/PhonePropertyHarness.svelte')
    const host = document.createElement('div')
    host.id = 'phone-check'
    host.style.cssText = 'position:fixed;inset:60px;background:white;color:black;z-index:999999;padding:40px'
    document.body.appendChild(host)
    mount(Phone, { target: host, props: { id: 'test-phone', isPhone: true, value: 'invalid', isEditing: true, onChange: () => {} } })
  })
  const input = page.locator('#test-phone')
  await input.waitFor()
  if (await input.getAttribute('type') !== 'tel') throw new Error('Expected tel input')
  await page.getByText('Enter a valid Hong Kong phone number', { exact: false }).waitFor()
  await input.fill('2345 6789')
  await page.getByText('Enter a valid Hong Kong phone number', { exact: false }).waitFor({ state: 'hidden' })
  await page.screenshot({ path: 'output/playwright/phone-valid.png' })
  await input.fill('+853 66123456')
  await page.getByText('Enter a valid Hong Kong phone number', { exact: false }).waitFor()
  await page.screenshot({ path: 'output/playwright/phone-invalid.png' })
  console.log('Phone browser check passed: tel input, HK acceptance, foreign-number error')
} finally { await browser.close() }
