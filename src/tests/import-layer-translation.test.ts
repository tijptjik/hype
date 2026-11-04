// TESTS
import { beforeEach, expect, it, vi } from 'vitest'
// CONTEXT
import { ImportCtx } from '#lib/context/import.svelte.js'
// I18N
import { translateI18nFields } from '#lib/i18n.js'
// SERVICES
import {
  showLayerCreationForm,
  translateLayerFormLocale,
} from '#lib/client/services/import/features/layer.js'

vi.mock('#lib/i18n.js', async importOriginal => ({
  ...(await importOriginal<object>()),
  translateI18nFields: vi.fn(),
}))
beforeEach(() => {
  vi.mocked(translateI18nFields).mockReset()
})

it.each(['reopen', 'source-edit', 'target-edit'])(
  'does not apply stale layer translation after %s',
  async scenario => {
    const ctx = new ImportCtx()
    showLayerCreationForm(ctx, 'Original')
    let finish!: (value: unknown) => void
    vi.mocked(translateI18nFields).mockReturnValue(
      new Promise(resolve => {
        finish = resolve
      }) as never,
    )
    const pending = translateLayerFormLocale(ctx, 'en', 'zh-hant')
    if (scenario === 'reopen') {
      ctx.reset()
      showLayerCreationForm(ctx, 'New layer')
    } else if (scenario === 'source-edit') {
      ctx.getLayerForm()!.i18n.en!.name = 'Edited'
      ctx.getLayerForm()!.i18n.en!.nameShort = 'Edited'
    } else {
      ctx.getLayerForm()!.i18n.zhHant!.name = 'Manual'
      ctx.getLayerForm()!.i18n.zhHant!.nameShort = 'Manual'
    }
    finish({ name: 'Old translation', nameShort: 'Old translation' })
    expect(await pending).toBe(false)
    expect(ctx.getLayerForm()!.i18n.zhHant!.name).toBe(
      scenario === 'target-edit' ? 'Manual' : '',
    )
  },
)

it('applies a current translation and marks generated fields', async () => {
  const ctx = new ImportCtx()
  showLayerCreationForm(ctx, 'Original')
  vi.mocked(translateI18nFields).mockResolvedValue({
    name: '名稱',
    nameShort: '名稱',
  } as never)
  expect(await translateLayerFormLocale(ctx, 'en', 'zh-hant')).toBe(true)
  expect(ctx.getLayerForm()!.i18n.zhHant).toMatchObject({ name: '名稱', nameGen: true })
})

it('retains independent locale translations completing within the same draft', async () => {
  const ctx = new ImportCtx()
  showLayerCreationForm(ctx, 'Original')
  const finishes: ((value: unknown) => void)[] = []
  vi.mocked(translateI18nFields).mockImplementation(
    () => new Promise(resolve => finishes.push(resolve)) as never,
  )
  const traditional = translateLayerFormLocale(ctx, 'en', 'zh-hant')
  const simplified = translateLayerFormLocale(ctx, 'en', 'zh-hans')
  finishes[0]({ name: '傳統', nameShort: '傳統' })
  expect(await traditional).toBe(true)
  finishes[1]({ name: '简体', nameShort: '简体' })
  expect(await simplified).toBe(true)
  expect(ctx.getLayerForm()!.i18n.zhHant!.name).toBe('傳統')
  expect(ctx.getLayerForm()!.i18n.zhHans!.name).toBe('简体')
})
