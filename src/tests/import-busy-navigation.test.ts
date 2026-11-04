// @vitest-environment jsdom
// TESTS
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/svelte/pure'
// COMPONENTS
import ImportImageFlow from '#lib/bits/patterns/import/ImportImageFlow.svelte'
// SERVICES
import { handleImageDropEvent } from '#lib/client/services/import/images.js'

const navigation = vi.hoisted(() => ({
  guard: null as null | ((event: { shallow: boolean; cancel: () => void }) => void),
}))
vi.mock('$app/navigation', () => ({
  beforeNavigate: (guard: typeof navigation.guard) => {
    navigation.guard = guard
  },
}))

vi.mock('svelte/transition', () => ({ fade: () => ({ duration: 0 }) }))
vi.mock('#lib/context/responsive.svelte.js', async importOriginal => {
  const original =
    await importOriginal<typeof import('#lib/context/responsive.svelte.js')>()
  return { ...original, getResponsiveCtx: () => new original.ResponsiveCtx() }
})
vi.mock('#lib/client/services/import/images.js', () => ({
  handleImageDropEvent: vi.fn(),
  processSingleUpload: vi.fn(),
  downloadImageUploadResults: vi.fn(),
}))
beforeEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
})
afterEach(cleanup)

it('blocks navigation while uploading and allows it after completion', async () => {
  render(ImportImageFlow, {
    adminCtx: { view: { getRoleScopeQueryKey: () => 'account-a' } } as never,
    pendingDrop: {
      acceptedFiles: [new File(['image'], 'feature.1.jpg')],
      fileRejections: [],
    } as never,
    onCancel: vi.fn(),
  })
  await waitFor(() => expect(handleImageDropEvent).toHaveBeenCalledOnce())
  const setUploading = vi.mocked(handleImageDropEvent).mock.calls[0][3]
  setUploading(true)
  const cancel = vi.fn()
  navigation.guard!({ shallow: false, cancel })
  expect(cancel).toHaveBeenCalledOnce()
  setUploading(false)
  navigation.guard!({ shallow: false, cancel })
  expect(cancel).toHaveBeenCalledOnce()
})
