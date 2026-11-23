// PLAYWRIGHT
import { expect, test } from '@playwright/test'

test('the mobile entry page directs browser visitors to native sign-in', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Recorder' })).toBeVisible()
  await page.getByRole('button', { name: 'Sign in with HYPE' }).click()
  await expect(page.getByRole('status')).toHaveText(
    'Open Hype Recorder on your device to sign in.',
  )
})
