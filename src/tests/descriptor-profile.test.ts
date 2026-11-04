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
import Fixture from './fixtures/components/DescriptorProfileFixture.svelte'

beforeEach(() => {
  vi.useRealTimers()
  vi.stubGlobal('matchMedia', () => ({
    matches: true,
    addEventListener() {},
    removeEventListener() {},
  }))
  if (!Element.prototype.getAnimations) Element.prototype.getAnimations = () => []
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})
const snapshot = (container: HTMLElement) =>
  JSON.parse(
    container
      .querySelector('[data-descriptor-state]')!
      .getAttribute('data-descriptor-state')!,
  )

it('uses descriptor columns, reveals short-name-only languages and retains values when hidden', async () => {
  const view = render(Fixture)
  expect(
    [...view.container.querySelectorAll('[data-profile-field]')].map(field =>
      field.getAttribute('data-profile-field'),
    ),
  ).toEqual(['name', 'nameShort', 'description'])
  expect(screen.queryByRole('textbox')).toBeNull()
  await fireEvent.click(screen.getByRole('button', { name: 'Multilingual' }))
  const japanese = view.container.querySelector(
    '[data-profile-field="nameShort"] [data-profile-locale="ja"]',
  )!
  expect(japanese.textContent).toContain('日本語')
  expect(japanese.getAttribute('aria-hidden')).toBe('false')
  await fireEvent.click(view.container.querySelector('[data-locale="ja"]')!)
  expect(japanese.getAttribute('aria-hidden')).toBe('true')
  expect(snapshot(view.container).data.i18n.ja.nameShort).toBe('日本語')
})

it('edits and cancels one descriptor without losing rich content or unrelated flags', async () => {
  const view = render(Fixture)
  await fireEvent.click(screen.getByRole('button', { name: 'Toggle editing' }))
  const name = screen.getByRole('button', { name: 'Name · English' })
  await fireEvent.click(name)
  const input = await screen.findByRole('textbox', { name: 'Name · English' })
  await fireEvent.input(input, { target: { value: 'Changed' } })
  await fireEvent.keyDown(input, { key: 'Escape' })
  expect(snapshot(view.container).data.i18n.en.name).toBe('HKFoodWorks')
  expect(snapshot(view.container).data.i18n.en.description).toContain(
    '<strong>better tomorrow</strong>',
  )
  expect(snapshot(view.container).data.i18n.en.descriptionGen).toBe(true)
})

it('translates only empty values in the chosen descriptor, including hidden languages', async () => {
  const provider = vi.fn(async (_source: string, target: string, _text: string) => ({
    status: 'translated' as const,
    text: `Translated ${target}`,
  }))
  const view = render(Fixture, { provider })
  await fireEvent.click(screen.getByRole('button', { name: 'Toggle editing' }))
  await fireEvent.click(screen.getByRole('button', { name: 'Multilingual' }))
  await fireEvent.click(view.container.querySelector('[data-locale="ja"]')!)
  const description = view.container.querySelector(
    '[data-profile-field="description"]',
  ) as HTMLElement
  await fireEvent.click(
    within(description).getByRole('button', {
      name: 'Translate empty values from English',
    }),
  )
  await waitFor(() =>
    expect(snapshot(view.container).data.i18n.ja.descriptionGen).toBe(true),
  )
  expect(provider).toHaveBeenCalledTimes(3)
  expect(snapshot(view.container).data.i18n.zhHant.nameGen).toBe(true)
  expect(snapshot(view.container).data.i18n.en.name).toBe('HKFoodWorks')
  await fireEvent.click(screen.getByRole('button', { name: 'Hub profile' }))
  await waitFor(() =>
    expect(snapshot(view.container).data.i18n.en.name).toBe('Breadline'),
  )
})

it('uses inline Routing fields without verification controls and restores canceled edits', async () => {
  const view = render(Fixture)
  await fireEvent.click(screen.getByRole('button', { name: 'Hub profile' }))
  await fireEvent.click(screen.getByRole('button', { name: 'Toggle editing' }))
  const routing = view.container.querySelector(
    '[data-inline-field="Subdomain"]',
  ) as HTMLElement
  expect(routing.querySelector('.bits-form__gen-ai')).toBeNull()
  await fireEvent.click(within(routing).getByRole('button', { name: 'Subdomain' }))
  const input = within(routing).getByRole('textbox', { name: 'Subdomain' })
  await fireEvent.input(input, { target: { value: 'new-domain' } })
  expect(snapshot(view.container).data.code).toBe('new-domain')
  await fireEvent.keyDown(input, { key: 'Escape' })
  expect(snapshot(view.container).data.code).toBe('breadline')
})

it('shares one locale toolbar with subscription benefits and translates hidden empty benefits', async () => {
  const view = render(Fixture)
  await fireEvent.click(screen.getByRole('button', { name: 'Hub profile' }))
  await fireEvent.click(screen.getByRole('button', { name: 'Toggle editing' }))
  expect(view.container.querySelectorAll('[data-profile-locale-toolbar]')).toHaveLength(
    1,
  )
  expect(screen.queryByText('Descriptors')).toBeNull()
  await fireEvent.click(screen.getByRole('button', { name: 'Multilingual' }))
  await fireEvent.click(view.container.querySelector('[data-locale="ja"]')!)
  const benefits = view.container.querySelector(
    '[data-profile-field="subscriptionBenefits"]',
  ) as HTMLElement
  expect(
    benefits.querySelector('[data-profile-locale="ja"]')?.getAttribute('aria-hidden'),
  ).toBe('true')
  await fireEvent.click(
    within(benefits).getByRole('button', {
      name: 'Translate empty values from English',
    }),
  )
  await waitFor(() =>
    expect(snapshot(view.container).data.i18n.ja.subscriptionBenefitsGen).toBe(true),
  )
  expect(snapshot(view.container).data.i18n.en.name).toBe('Breadline')
  expect(snapshot(view.container).data.i18n.zhHant.nameGen).toBe(true)
})

it('keeps organisation search in the header and removes directly without changing modes', async () => {
  const view = render(Fixture)
  await fireEvent.click(screen.getByRole('button', { name: 'Hub profile' }))
  await fireEvent.click(screen.getByRole('button', { name: 'Toggle editing' }))
  const search = screen.getByPlaceholderText('Search organisations...')
  expect(search.closest('header')).not.toBeNull()
  const remove = screen.getAllByRole('button', { name: 'Remove organisation' })
  expect(remove).toHaveLength(2)
  await fireEvent.click(remove[0])
  expect(screen.getAllByRole('button', { name: 'Remove organisation' })).toHaveLength(1)
  expect(search.isConnected).toBe(true)
  await fireEvent.input(search, { target: { value: 'new' } })
  const result = await screen.findByText('New partner')
  await fireEvent.click(result)
  await waitFor(() =>
    expect(screen.getAllByRole('button', { name: 'Remove organisation' })).toHaveLength(
      2,
    ),
  )
})
