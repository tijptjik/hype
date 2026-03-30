// SVELTE
import { untrack } from 'svelte'
import type { Page } from '@sveltejs/kit'
// REMOTE
import { getImageById } from '$lib/api/server/image.remote'
// TYPES
import type {
  ImageCtxConstructorOptions,
  ImageProviderModel,
  ImageProviderSyncTarget,
} from '$lib/types'
import type { ImageCtxEnvelope } from '$lib/db/zod/schema/image.types'

/**
 * Adapter that owns URL/image orchestration for ImageCtx-backed views.
 * @param getPage - Getter for the current page state.
 * @param getOptions - Getter for call-site supplied image context options.
 * @returns Provider model consumed by `ImageProvider`.
 */
export function useImageProviderModel(
  getPage: () => Page,
  getOptions: () => ImageCtxConstructorOptions,
): ImageProviderModel {
  let lastSet: string | undefined
  let lastImageId: string | undefined | null
  let lastImageState = ''
  let lastFullScreen: boolean | undefined = false
  let lastPathname = ''
  let targetImage: ImageCtxEnvelope | null = null
  let initialisingContext = false
  let requestedImageId: string | null = null

  function getUrlImageId(): string | null {
    return getPage().url.searchParams.get('imageId') || null
  }

  function getIsFullScreen(): boolean {
    return getPage().url.searchParams.get('fullscreen') === 'true'
  }

  function getInitialImage(): ImageCtxEnvelope | null | undefined {
    const options = getOptions()
    const urlImageId = getUrlImageId()

    return options.image &&
      ((options.image.image.id ?? null) === urlImageId || !urlImageId)
      ? options.image
      : urlImageId
        ? undefined
        : null
  }

  function buildContextId(): string | undefined {
    const options = getOptions()
    return options.context
      ? `${options.context.ctxType}-${options.context.ctxId}${options.context.ctxTypeSecondary ? `-${options.context.ctxTypeSecondary}-${options.context.ctxIdSecondary}` : ''}`
      : undefined
  }

  function buildImageStateSignature(): string {
    const options = getOptions()
    return JSON.stringify({
      imageId: options.image?.image.id ?? null,
      imagesLength: options.images?.length || 0,
      hasImages: !!options.images,
    })
  }

  function resolveTargetImage(): void {
    const options = getOptions()
    const urlImageId = getUrlImageId()
    const defaultImageId = options.image?.image.id ?? null

    if (!options.isValid) {
      return
    }

    if (urlImageId && urlImageId !== defaultImageId) {
      if (requestedImageId === urlImageId) {
        return
      }

      requestedImageId = urlImageId

      untrack(() =>
        getImageById({
          id: urlImageId,
          meta: { isAdminRequest: true },
        }).then(result => {
          if (requestedImageId === urlImageId) {
            targetImage = (result?.data as ImageCtxEnvelope | null | undefined) ?? null
          }
        }),
      )
      return
    }

    requestedImageId = null
    untrack(() => {
      targetImage = options.image ?? null
    })
  }

  async function applyTargetImage(
    imageCtx: ImageProviderSyncTarget,
    targetImageId: string,
  ): Promise<void> {
    const options = getOptions()
    const currentActiveImageId = imageCtx.state.activeImage?.image.id

    if (currentActiveImageId === targetImageId || !options.isValid) {
      return
    }

    if (imageCtx.state.images?.get(targetImageId)) {
      await imageCtx.target(targetImageId)
    } else {
      await imageCtx.refreshImages(targetImageId)
    }

    lastImageId = targetImageId
  }

  function getInitialOptions(): ImageCtxConstructorOptions {
    const options = getOptions()

    return {
      ...options,
      isFullScreen: getIsFullScreen(),
      image: getInitialImage(),
    }
  }

  function sync(imageCtx: ImageProviderSyncTarget): void {
    resolveTargetImage()

    const options = getOptions()
    const isFullScreen = getIsFullScreen()
    const contextId = buildContextId()
    const currentImageState = buildImageStateSignature()
    const targetImageId = targetImage?.image.id
    const currentPathname = getPage().url.pathname

    if (!options.isValid) {
      if (lastPathname && currentPathname !== lastPathname && lastSet) {
        untrack(() => {
          initialisingContext = true
          imageCtx
            .setContext({
              context: null,
              image: null,
              images: null,
              highlightedIds: [],
            })
            .then(() => {
              initialisingContext = false
            })
          lastSet = undefined
          lastImageState = ''
          lastPathname = currentPathname
        })
      } else if (!lastPathname) {
        lastPathname = currentPathname
      }

      return
    }

    untrack(() => {
      const contextChanged = lastSet !== contextId
      const imageStateChanged = lastImageState !== currentImageState

      if (contextChanged || imageStateChanged) {
        initialisingContext = true
        imageCtx
          .setContext({
            ...options,
            image: getInitialImage(),
          })
          .then(() => {
            initialisingContext = false
          })
          .catch(() => {
            initialisingContext = false
          })

        if (options.context?.ctxTypeSecondary) {
          imageCtx.refreshImages(targetImageId)
        }

        lastSet = contextId
        lastImageState = currentImageState
        lastPathname = currentPathname
      } else if (targetImageId && targetImageId !== lastImageId) {
        if (initialisingContext) {
          imageCtx.setTargetImageId(targetImageId)
        } else {
          void applyTargetImage(imageCtx, targetImageId)
        }
      } else if (!targetImageId && lastImageId !== null) {
        lastImageId = null
      }

      if (isFullScreen !== lastFullScreen) {
        imageCtx.setMode(isFullScreen ? 'fullscreen' : 'normal')
        lastFullScreen = isFullScreen
      }
    })
  }

  return {
    getInitialOptions,
    sync,
  }
}
