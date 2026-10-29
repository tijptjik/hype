// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/svelte/pure'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import Fixture from './fixtures/components/FeatureProfileFixture.svelte'
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})
beforeEach(() => {
  vi.useRealTimers()
  if (!Element.prototype.getAnimations) Element.prototype.getAnimations = () => []
  // JSDOM has no Web Animations API; exercise motion in the real-browser checks.
  vi.stubGlobal('matchMedia', () => ({
    matches: true,
    addEventListener() {},
    removeEventListener() {},
  }))
})
const state = (container: HTMLElement) =>
  JSON.parse(
    container
      .querySelector('[data-profile-state]')!
      .getAttribute('data-profile-state')!,
  )

it('opens inline fields, cancels with Escape, commits on blur, and retains rich description markup', async () => {
  const view = render(Fixture)
  expect(screen.queryByRole('textbox', { name: 'description en' })).toBeNull()
  const display = screen.getByRole('button', { name: 'description en' })
  expect(display.querySelector('strong')?.textContent).toBe('neighbours')
  await fireEvent.keyDown(display, { key: 'Enter' })
  const input = await screen.findByRole('textbox', { name: 'description en' })
  const original = (input as HTMLTextAreaElement).value
  await fireEvent.input(input, {
    target: { value: '<p>Edited <strong>rich</strong></p>' },
  })
  await fireEvent.keyDown(input, { key: 'Escape' })
  expect(state(view.container).values.en.description).toBe(original)
  expect(state(view.container).values.en.descriptionGen).toBe(true)
  await fireEvent.click(display)
  await fireEvent.input(input, {
    target: { value: '<p>Edited <strong>rich</strong></p>' },
  })
  await fireEvent.blur(input)
  await fireEvent.focusOut(input)
  expect(state(view.container).values.en.description).toBe(
    '<p>Edited <strong>rich</strong></p>',
  )
  expect(state(view.container).values.en.descriptionGen).toBe(false)
  expect(
    screen.getByRole('button', { name: 'description en' }).querySelector('strong')
      ?.textContent,
  ).toBe('rich')
})
it('locks inherited titles including empty rows, keeps Edit Location and separate-name action', async () => {
  const view = render(Fixture)
  await fireEvent.click(screen.getByRole('button', { name: 'title en' }))
  await fireEvent.click(screen.getByRole('button', { name: 'Use Location name' }))
  expect(screen.getByRole('button', { name: 'Set by Location' })).toBeTruthy()
  expect(screen.queryByRole('textbox', { name: 'title en' })).toBeNull()
  expect(screen.queryByRole('button', { name: 'title en' })).toBeNull()
  await fireEvent.click(screen.getByRole('button', { name: 'Multilingual' }))
  expect(screen.queryByRole('button', { name: 'title ja' })).toBeNull()
  expect(screen.getByText('富怡コート')).toBeTruthy()
  expect(
    view.container.querySelector('[data-profile-field="title"] [data-profile-sources]'),
  ).toBeNull()
  await fireEvent.click(screen.getByRole('button', { name: 'Edit Location' }))
  expect(state(view.container).editedLocation).toBe(true)
  // The Bits popover and independent-name action are exercised in the real-browser layout check.
  expect(screen.getByRole('button', { name: 'Set by Location' })).toBeTruthy()
  await fireEvent.click(screen.getByRole('button', { name: 'Toggle editing' }))
  expect(screen.queryByRole('button', { name: 'Edit Location' })).toBeNull()
  expect(screen.getAllByText('Set by Location')).toHaveLength(1)
})
it('fills all empty selected values from the header including a hidden target, preserving populated values and other fields', async () => {
  const view = render(Fixture)
  await fireEvent.click(screen.getByRole('button', { name: 'Multilingual' }))
  await fireEvent.click(screen.getByRole('button', { name: 'Japanese' }))
  const description = view.container.querySelector(
    '[data-profile-field="description"]',
  ) as HTMLElement
  await fireEvent.click(
    within(description).getByRole('button', {
      name: 'Translate empty values from English',
    }),
  )
  await waitFor(() =>
    expect(state(view.container).values.ja?.descriptionGen).toBe(true),
  )
  expect(state(view.container).values.zhHant.description).toContain('zh-Hant:')
  expect(state(view.container).values.zhHans.description).toBe('保留內容')
  expect(state(view.container).values.en.title).toBe('')
  expect(screen.queryByRole('button', { name: 'description ja' })).toBeNull()
  expect(within(description).getByRole('status').textContent).toContain(
    'Filled 2 translations.',
  )
})
it('preserves verification, dynamic field registration, reorder and draft recovery across hidden locales', async () => {
  const view = render(Fixture)
  await fireEvent.click(screen.getByRole('button', { name: 'Multilingual' }))
  await fireEvent.click(screen.getByRole('button', { name: 'description ja' }))
  const input = screen.getByRole('textbox', { name: 'description ja' })
  await fireEvent.input(input, { target: { value: '日本語の内容' } })
  await fireEvent.focusOut(input)
  await fireEvent.keyDown(screen.getByRole('button', { name: 'Japanese' }), {
    key: 'ArrowLeft',
    altKey: true,
  })
  await fireEvent.keyDown(screen.getByRole('button', { name: 'Japanese' }), {
    key: 'ArrowLeft',
    altKey: true,
  })
  await fireEvent.keyDown(screen.getByRole('button', { name: 'Japanese' }), {
    key: 'ArrowLeft',
    altKey: true,
  })
  await fireEvent.click(screen.getByRole('button', { name: 'Japanese' }))
  await fireEvent.click(screen.getByRole('button', { name: 'Checkpoint draft' }))
  await fireEvent.keyDown(screen.getByRole('button', { name: 'Japanese' }), {
    key: 'ArrowRight',
    altKey: true,
  })
  await fireEvent.click(screen.getByRole('button', { name: 'Recover draft' }))
  expect(state(view.container).localeState.selectedLocales[0]).toBe('ja')
  expect(state(view.container).localeState.visibleLocales).not.toContain('ja')
  expect(state(view.container).values.ja.description).toBe('日本語の内容')
  const data = new FormData(view.container.querySelector('form')!)
  expect(data.get('data.i18n.ja.description')).toBe('日本語の内容')
  expect(data.get('data.i18n.ja.descriptionGen')).toBe('false')
  await fireEvent.click(screen.getByRole('button', { name: 'Multilingual' }))
  expect(screen.getByRole('button', { name: 'description ja' })).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'description en' })).toBeNull()
})
it('protects a user starting an empty target edit during translation', async () => {
  const provider = vi.fn(
    () => new Promise<{ status: 'translated'; text: string }>(() => {}),
  )
  const view = render(Fixture, { provider })
  await fireEvent.click(screen.getByRole('button', { name: 'Multilingual' }))
  // Two targets share this pending result; editing the Japanese row invalidates it.
  const requests: Array<(result: { status: 'translated'; text: string }) => void> = []
  provider.mockImplementation(() => new Promise(r => requests.push(r)))
  await fireEvent.click(
    screen.getByRole('button', { name: 'Translate empty values from English' }),
  )
  await fireEvent.click(screen.getByRole('button', { name: 'description ja' }))
  for (const complete of requests) complete({ status: 'translated', text: 'Machine' })
  await waitFor(() =>
    expect(state(view.container).values.zhHant.description).toBe('Machine'),
  )
  expect(state(view.container).values.ja?.description ?? '').toBe('')
})

it('registers an added locale in both fields, keeps its empty inherited title locked and permits verification', async () => {
  const view = render(Fixture)
  await fireEvent.click(screen.getByRole('button', { name: 'Multilingual' }))
  await fireEvent.click(screen.getByRole('button', { name: '+ Add' }))
  const search = await screen.findByRole('combobox', { hidden: true })
  await fireEvent.input(search, { target: { value: '한국어' } })
  await fireEvent.keyDown(search, { key: 'Enter' })
  expect(screen.getByRole('button', { name: 'title ko' })).toBeTruthy()
  const koreanDescription = view.container.querySelector(
    '[data-profile-field="description"] [data-profile-locale="ko"]',
  ) as HTMLElement
  await fireEvent.click(
    within(koreanDescription).getByRole('button', { name: 'Human Validated' }),
  )
  expect(state(view.container).values.ko.descriptionGen).toBe(true)
  await fireEvent.click(screen.getByRole('button', { name: 'Use Location name' }))
  expect(screen.queryByRole('button', { name: 'title ko' })).toBeNull()
  const data = new FormData(view.container.querySelector('form')!)
  expect(data.get('data.i18n.ko.title')).toBe('')
  expect(data.get('data.i18n.ko.descriptionGen')).toBe('true')
})

it('omits only the first displayed locale prefix and relabels rows after reordering', async () => {
  const view = render(Fixture)
  await fireEvent.click(screen.getByRole('button', { name: 'Multilingual' }))
  const prefix = (locale: string) =>
    view.container.querySelector(
      `[data-profile-field="title"] [data-profile-locale="${locale}"] [data-inline-locale-row] > span`,
    )?.textContent ?? ''
  expect(prefix('en')).toBe('')
  expect(prefix('zh-Hant')).toBe('繁中')
  expect(prefix('zh-Hans')).toBe('简中')
  await fireEvent.keyDown(screen.getByRole('button', { name: 'Japanese' }), {
    key: 'ArrowLeft',
    altKey: true,
  })
  await fireEvent.keyDown(screen.getByRole('button', { name: 'Japanese' }), {
    key: 'ArrowLeft',
    altKey: true,
  })
  await fireEvent.keyDown(screen.getByRole('button', { name: 'Japanese' }), {
    key: 'ArrowLeft',
    altKey: true,
  })
  expect(prefix('ja')).toBe('')
  expect(prefix('en')).toBe('En')
})

it('clears only the chosen field and marks it as manually edited', async () => {
  const view = render(Fixture)
  const initial = state(view.container).values
  await fireEvent.click(screen.getByRole('button', { name: 'Clear description en' }))
  const next = state(view.container).values
  expect(next.en.description).toBe('')
  expect(next.en.descriptionGen).toBe(false)
  expect(next.en.title).toBe(initial.en.title)
  expect(next.zhHans).toEqual(initial.zhHans)
})

it('animates only the chosen source and fades completion in the field header after three seconds', async () => {
  const requests: Array<(value: { status: 'translated'; text: string }) => void> = []
  render(Fixture, { provider: () => new Promise(resolve => requests.push(resolve)) })
  await fireEvent.click(screen.getByRole('button', { name: 'Multilingual' }))
  const section = document.querySelector('[data-profile-field="description"]')!
  const source = within(section as HTMLElement).getByRole('button', {
    name: 'Translate empty values from English',
  })
  await fireEvent.click(source)
  expect(source.getAttribute('aria-busy')).toBe('true')
  expect(source.className).toContain('animate-pulse')
  expect(screen.queryByText('Translating…')).toBeNull()
  vi.useFakeTimers()
  for (const resolve of requests) resolve({ status: 'translated', text: 'Translated' })
  await vi.advanceTimersByTimeAsync(0)
  const status = within(section as HTMLElement).getByRole('status')
  expect(status.parentElement?.querySelector('h3')?.textContent).toBe('Description')
  expect(status.textContent).toContain('Filled 2 translations.')
  expect(source.getAttribute('aria-busy')).toBe('false')
  await vi.advanceTimersByTimeAsync(3001)
  expect(status.getAttribute('aria-hidden')).toBe('true')
  expect(status.style.opacity).toBe('0')
})

it('offers translation controls only while multilingual mode is enabled', async () => {
  render(Fixture)
  expect(
    screen.queryByRole('button', { name: 'Translate empty values from English' }),
  ).toBeNull()
  await fireEvent.click(screen.getByRole('button', { name: 'Multilingual' }))
  expect(
    screen.getByRole('button', { name: 'Translate empty values from English' }),
  ).toBeTruthy()
  await fireEvent.click(screen.getByRole('button', { name: 'Multilingual' }))
  expect(
    screen.queryByRole('button', { name: 'Translate empty values from English' }),
  ).toBeNull()
})

it('sizes navigation skeletons to the visible languages and preserves form registrations', async () => {
  const view = render(Fixture)
  const before = new FormData(view.container.querySelector('form')!)
  await fireEvent.click(screen.getByRole('button', { name: 'Toggle loading' }))
  expect(
    view.container
      .querySelector('[data-feature-profile-editor]')
      ?.getAttribute('aria-busy'),
  ).toBe('true')
  expect(view.container.querySelectorAll('[data-profile-skeleton-row]')).toHaveLength(2)
  expect(screen.queryByRole('button', { name: 'description en' })).toBeNull()
  expect([...new FormData(view.container.querySelector('form')!).entries()]).toEqual([
    ...before.entries(),
  ])
  await fireEvent.click(screen.getByRole('button', { name: 'Toggle loading' }))
  await fireEvent.click(screen.getByRole('button', { name: 'Multilingual' }))
  await fireEvent.click(screen.getByRole('button', { name: 'Japanese' }))
  await fireEvent.click(screen.getByRole('button', { name: 'Toggle loading' }))
  expect(view.container.querySelectorAll('[data-profile-skeleton-row]')).toHaveLength(6)
  await fireEvent.click(screen.getByRole('button', { name: 'Toggle loading' }))
  expect(view.container.querySelectorAll('[data-profile-skeleton-row]')).toHaveLength(0)
  expect(screen.getByRole('button', { name: 'description en' })).toBeTruthy()
})

it('retains the current profile instead of skeletons while navigating to another record', async () => {
  const view = render(Fixture, { retainContent: true })
  await fireEvent.click(screen.getByRole('button', { name: 'Multilingual' }))
  const before = view.container.querySelector(
    '[data-profile-field="description"]',
  )!.textContent
  await fireEvent.click(screen.getByRole('button', { name: 'Toggle loading' }))
  expect(view.container.querySelectorAll('[data-profile-skeleton-row]')).toHaveLength(0)
  expect(
    view.container.querySelector('[data-profile-field="description"]')!.textContent,
  ).toBe(before)
  expect(
    (view.container.querySelector('[data-feature-profile-editor]') as HTMLElement)
      .inert,
  ).toBe(true)
  await fireEvent.click(screen.getByRole('button', { name: 'Toggle loading' }))
  expect(
    (view.container.querySelector('[data-feature-profile-editor]') as HTMLElement)
      .inert,
  ).toBe(false)
})
