import { test, expect } from '@playwright/test'
test('diagnose large upload handling', async ({ page }) => {
  await page.goto(
    '/admin/locations/building:02bf0a51eb6193415c64498e051def3679f1a7bc87aac8abad53be5489de5d07#interior',
  )
  const session = await (await page.request.get('/api/auth/get-session')).json()
  expect(session.user.id).toBe('hype-local-agent-admin')
  const response = await page.request.post(
    '/api/locations/building:02bf0a51eb6193415c64498e051def3679f1a7bc87aac8abad53be5489de5d07/interior/jobs',
    {
      data: Buffer.alloc(4980751, 120),
      headers: { 'content-type': 'application/octet-stream' },
    },
  )
  console.log('DIAGNOSTIC', response.status(), await response.text())
})
