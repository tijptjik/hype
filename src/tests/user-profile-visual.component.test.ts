// @vitest-environment jsdom
// TESTS
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
// TYPES
import type { UserContributionPreview } from '#lib/users/contributionPreview.types.js'

const { query, goto } = vi.hoisted(() => ({ query: vi.fn(), goto: vi.fn() }))
vi.mock('#lib/api/user.remote.js', () => ({ getUserContributionPreviews: query }))
vi.mock('$app/navigation', () => ({ goto }))
vi.mock('#lib/client/services/image.js', () => ({
  getImageSrc: (image: { publicId: string } | null) => image?.publicId ?? null,
  uploadAndProcessImage: vi.fn(),
}))
import UserContributionPreviews from '#lib/bits/patterns/userDirectory/UserContributionPreviews.svelte'

const photo: UserContributionPreview = {
  id: 'photo',
  kind: 'photo',
  featureId: 'place',
  imageId: 'photo',
  title: 'Contributed place',
  image: {
    id: 'photo',
    cdn: 'cloudflareR2',
    env: 'local',
    publicId: '/thumbnail.jpg',
    version: 1,
  },
}
const profile = { id: 'target' }
const props = {
  profile,
  onMore: vi.fn(),
}
beforeEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    },
  )
})
afterEach(cleanup)

it('renders and opens a photo from one preview request, without contribution ID lists', async () => {
  query.mockResolvedValue([photo])
  const view = render(UserContributionPreviews, props)
  const tile = await screen.findByRole('button', {
    name: 'Contributed place · Photo contribution',
  })
  expect(query).toHaveBeenCalledExactlyOnceWith({ userId: 'target' })
  expect(tile.querySelector('img')?.getAttribute('src')).toBe('/thumbnail.jpg')
  expect(tile.querySelector('img')?.classList.contains('opacity-0')).toBe(true)
  const thumbnail = tile.querySelector('img')
  if (!thumbnail) throw new Error('Missing thumbnail')
  await fireEvent.load(thumbnail)
  expect(tile.querySelector('img')?.classList.contains('opacity-0')).toBe(false)
  await fireEvent.click(tile)
  expect(goto).toHaveBeenCalledWith('/admin/features/place?imageId=photo')
  await view.rerender({ ...props, profile: { ...profile } })
  expect(query).toHaveBeenCalledTimes(1)
})

it('discards a late response after switching to another user', async () => {
  let resolveOld!: (value: UserContributionPreview[]) => void
  query.mockReturnValueOnce(
    new Promise(resolve => {
      resolveOld = resolve
    }),
  )
  query.mockResolvedValueOnce([])
  const view = render(UserContributionPreviews, props)
  await waitFor(() => expect(query).toHaveBeenCalledWith({ userId: 'target' }))
  expect(screen.getByRole('status').classList.contains('sr-only')).toBe(true)
  expect(screen.getByLabelText('Contribution previews').getAttribute('aria-busy')).toBe(
    'true',
  )
  await view.rerender({ ...props, profile: { ...profile, id: 'next' } })
  await screen.findByText('No published contributions yet.')
  resolveOld([photo])
  await waitFor(() => expect(query).toHaveBeenCalledTimes(2))
  expect(screen.queryByText('Contributed place')).toBeNull()
  expect(screen.queryByText('Loading contributions…')).toBeNull()
})

it('uses previews delivered with the profile without a second remote request', async () => {
  render(UserContributionPreviews, { ...props, initialPreviews: [photo] })
  await screen.findByRole('button', { name: 'Contributed place · Photo contribution' })
  expect(query).not.toHaveBeenCalled()
  expect(screen.queryByRole('status')).toBeNull()
})

it('finishes loading with a recoverable error when the preview request fails', async () => {
  query.mockRejectedValue(new Error('Unavailable'))
  render(UserContributionPreviews, props)
  await screen.findByText('Unable to load contribution previews.')
  expect(screen.queryByText('Loading contributions…')).toBeNull()
  await fireEvent.click(screen.getByRole('button', { name: 'More' }))
  expect(props.onMore).toHaveBeenCalledOnce()
})

vi.mock('#lib/api/image.remote.js', () => ({
  discardImageUpload: vi.fn(async () => ({ discarded: true })),
}))
vi.mock('#lib/context/responsive.svelte.js', () => ({
  getResponsiveCtx: () => ({ isMobile: false }),
}))
import UserProfileVisual from '#lib/bits/patterns/userDirectory/UserProfileVisual.svelte'
import { uploadAndProcessImage } from '#lib/client/services/image.js'
import { discardImageUpload } from '#lib/api/image.remote.js'

it('previews a deferred avatar by image identity without saving the profile', async () => {
  const onImageChange = vi.fn()
  vi.mocked(uploadAndProcessImage).mockResolvedValue({
    publicId: '/new-avatar.jpg',
    image: { id: 'verified-image' },
  } as never)
  render(UserProfileVisual, {
    profile,
    initialPreviews: [],
    avatar: null,
    editing: true,
    onImageChange,
    onBusyChange: vi.fn(),
    onMore: vi.fn(),
  })
  await fireEvent.change(screen.getByLabelText('Upload user avatar'), {
    target: { files: [new File(['test'], 'avatar.png', { type: 'image/png' })] },
  })
  await waitFor(() =>
    expect(onImageChange).toHaveBeenCalledWith({
      imageId: 'verified-image',
      url: '/new-avatar.jpg',
    }),
  )
  expect(uploadAndProcessImage).toHaveBeenCalledWith(
    expect.any(File),
    expect.objectContaining({
      attachment: 'deferred',
      ctxType: 'user',
      ctxId: profile.id,
    }),
  )
  expect(discardImageUpload).not.toHaveBeenCalled()
})

it('discards a completed upload when Reset invalidates its edit session', async () => {
  let finish!: (value: never) => void
  vi.mocked(uploadAndProcessImage).mockImplementation(
    () =>
      new Promise(resolve => {
        finish = resolve
      }),
  )
  const onImageChange = vi.fn()
  const props = {
    profile,
    initialPreviews: [],
    avatar: null,
    editing: true,
    selectionEpoch: 0,
    onImageChange,
    onBusyChange: vi.fn(),
    onMore: vi.fn(),
  }
  const view = render(UserProfileVisual, props)
  await fireEvent.change(screen.getByLabelText('Upload user avatar'), {
    target: { files: [new File(['test'], 'avatar.png', { type: 'image/png' })] },
  })
  await view.rerender({ ...props, selectionEpoch: 1 })
  finish({ publicId: '/new-avatar.jpg', image: { id: 'abandoned' } } as never)
  await waitFor(() =>
    expect(discardImageUpload).toHaveBeenCalledWith({ imageId: 'abandoned' }),
  )
  expect(onImageChange).not.toHaveBeenCalled()
})
