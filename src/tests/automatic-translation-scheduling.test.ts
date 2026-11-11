// @vitest-environment node
import { expect, it, vi } from 'vitest'
import { schedulePropertyTranslations } from '#lib/api/services/automaticTranslations.js'
import type { GuardedBaseContext } from '#lib/api/guarded.types.js'

const { cache } = vi.hoisted(() => ({ cache: vi.fn() }))
vi.mock('#lib/db/services/automaticTranslationCache.js', () => ({
  cacheResourceTranslations: cache,
}))

it('warms a catalogue sequentially without delaying the save or accepting values', async () => {
  let active = 0
  let maximum = 0
  cache.mockImplementation(async () => {
    active += 1
    maximum = Math.max(maximum, active)
    await Promise.resolve()
    active -= 1
    return {}
  })
  const tasks: Promise<unknown>[] = []
  const context = {
    db: {},
    event: {
      locals: {
        platform: {
          env: {},
          context: {
            waitUntil: (task: Promise<unknown>) => {
              tasks.push(task)
            },
          },
        },
      },
    },
  } as unknown as GuardedBaseContext
  const properties = [
    {
      id: 'a',
      i18n: { en: { label: 'Name' } },
      values: [{ id: 'v', i18n: { en: { value: 'Choice' } } }],
    },
    { id: 'b', i18n: { ja: { label: '名前' } } },
  ]
  expect(schedulePropertyTranslations(context, properties)).toBeUndefined()
  expect(tasks).toHaveLength(1)
  await tasks[0]
  expect(maximum).toBe(1)
  expect(cache.mock.calls.map(([input]) => [input.resource, input.id])).toEqual([
    ['property', 'a'],
    ['propertyValue', 'v'],
    ['property', 'b'],
  ])
  expect(properties[0].i18n.en?.label).toBe('Name')
})
