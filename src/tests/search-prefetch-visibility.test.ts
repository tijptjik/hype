// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/svelte/pure'
import { afterEach, expect, it, vi } from 'vitest'
import Search from '#lib/bits/custom/search/Search.svelte'

afterEach(cleanup)

it('prefetches silently, opens on focus, and closes on an outside click', async () => {
  vi.useRealTimers()
  const onInput = vi
    .fn()
    .mockResolvedValue([{ id: 'one', name: 'Example organisation' }])
  render(Search, {
    prefetchOnMount: true,
    onInput,
    onSelect: vi.fn(),
    resultMap: {
      image: () => null,
      title: (item: Record<string, unknown>) => String(item.name),
    },
  })
  await waitFor(() => expect(onInput).toHaveBeenCalled())
  expect(screen.queryByText('Example organisation')).toBeNull()
  screen.getByRole('textbox').focus()
  expect(await screen.findByText('Example organisation')).toBeTruthy()
  // The component ignores the same click that opened it for one animation frame.
  await new Promise(resolve => setTimeout(resolve, 20))
  await fireEvent.click(document.body)
  await waitFor(() => expect(screen.queryByText('Example organisation')).toBeNull())
})
