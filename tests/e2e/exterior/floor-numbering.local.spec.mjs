import { expect, test } from '@playwright/test'

test('renumbers Kai King Mansion above a mezzanine and restores the sequence on undo', async ({
  page,
}) => {
  test.setTimeout(180_000)
  const admin = await page.goto('/admin', { waitUntil: 'domcontentloaded' })
  expect(admin.ok()).toBeTruthy()
  await expect(page).toHaveURL(/\/admin(?:\/features)?\/?$/)
  const session = await (await page.request.get('/api/auth/get-session')).json()
  expect(session.user.id).toBe('hype-local-agent-admin')

  await page.goto(
    '/admin/locations/building%3Acbab3d4d32f73b706b05fb7836f120f3d695277bdd5ecba28894dc7c0aedce26?organisation=oDucgyH4H4Bm#exterior',
    { waitUntil: 'domcontentloaded' },
  )
  const editor = page.getByRole('region', { name: 'Visual façade floor alignment' })
  const labels = editor.getByRole('button', { name: /^Edit .* designation$/ })
  await expect(labels.last()).toHaveText('Top', { timeout: 90_000 })
  // Start this browser's draft from the real geometry with automatic floor numbers.
  // The shared model may already contain the reviewer's manually numbered floors.
  await page.evaluate(() => {
    const key = Object.keys(localStorage).find(key =>
      key.startsWith('hype-facade-alignment:'),
    )
    const draft = JSON.parse(localStorage.getItem(key))
    for (const line of draft.lines) delete line.designation
    localStorage.setItem(key, JSON.stringify(draft))
  })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(labels.nth(1)).toHaveText('Floor 1', { timeout: 90_000 })
  await expect(labels.nth(2)).toHaveText('Floor 2')
  const original = await labels.allTextContents()
  await labels.nth(1).click()
  const type = editor.getByLabel('Floor type')
  await type.selectOption('mezzanine')
  await expect(editor.getByLabel('Floor number')).toHaveCount(0)
  await editor.getByRole('button', { name: 'Done' }).click()
  await expect(labels).toHaveText([
    'Base',
    'Mezzanine',
    ...original.slice(2, -1).map((_, i) => `Floor ${i + 1}`),
    'Top',
  ])
  await labels.nth(2).click()
  await expect(editor.getByLabel('Floor number')).toHaveValue('1')
  await editor.getByRole('button', { name: 'Done' }).click()
  await editor.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(labels).toHaveText(original)
})
