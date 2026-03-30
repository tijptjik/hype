# Images Pattern Design Spec

## Summary

This document describes the current gallery/image pattern package as implemented in
`src/lib/bits/patterns/images`.

The package is no longer a greenfield proposal. It is active, exported through
`$lib/bits`, and currently powers both the feature image editor flow and the
single-image resource viewer flow.

The current package provides reusable Bits patterns for:

- `Thumbnail`
- `AdminThumbnail`
- `Image`
- `Viewer`
- `AdminViewer`
- `CameraViewer`
- `ThumbnailWrapper`
- `ImageEditor`
- `ResourceViewer`
- `Dropzone`
- `entityImage/*`

The core composition work that has landed includes:

- normalized render items via `ViewerRenderable`
- explicit persisted/upload/replacement/finalized status variants
- parent-filling image and viewer layout
- consistent `fit` and `cover` handling across surfaces
- blurred fit-mode backdrops
- source-to-source crossfades in `ImageSurface`
- viewer foreground and backdrop crossfades in `ViewerStage`
- package-level dropzone composition
- fullscreen viewer transitions
- editor and resource-specific wrapper composition
- adapter-based projection from `ImageCtx` into package-facing item contracts

The main remaining gaps are orchestration and legacy overlap:

- `ImageCtx` is still the real provider contract
- gallery state still depends on image-domain adapters instead of a gallery-owned store
- upload/delete/metadata behavior is normalized for current consumers, but still not fully package-owned
- legacy gallery and viewer implementations still exist in parallel

## Current Status

### Implemented

- The package lives at `src/lib/bits/patterns/images`.
- The public barrel exports all root patterns, `entityImage/*`, and `images.types.ts`.
- `$lib/bits` re-exports the gallery roots for app consumption.
- `FeatureImageEditor.svelte` consumes `ImageEditor` through `useImageEditorGalleryModel(...)`.
- `ResourceViewer.svelte` consumes `AdminViewer` + `Dropzone` through `useEntityImageViewerModel(...)`.
- `ViewerRenderable` is the current normalized render contract for all package roots.
- `ViewerRenderableStatus` distinguishes:
  - `persisted`
  - `optimistic-upload`
  - `replacement-upload`
  - `finalized-upload`
- `ImageSurface` owns delayed skeletons, fallback identity imagery, source promotion crossfades, blurred fit backdrops, and rotation-overlay handling.
- `ViewerStage` holds previous, displayed, incoming, and pending scenes, preloads required scene assets, and crossfades both foreground and fit-mode backdrop layers.
- `ThumbnailWrapper` owns rail scrolling, hover-preview debounce, active-item centering by request key/id, FLIP animation, and optimistic-upload batch scroll handling for the vertical admin rail.
- `AdminThumbnail` supports publish-state overlay, upload-state overlay, retry, local delete confirmation, and prop-driven intent selection.
- `AdminViewer` provides an empty-state upload affordance through `Dropzone`.
- `CameraViewer` adds `CameraCaptureButton` and routes captured files to the upload callback path.
- `ImageEditor` provides the current feature image editor layout:
  - fullscreen viewer toggling
  - bottom viewer edit controls
  - vertical admin thumbnail rail
  - footer thumbnail controls
- `ResourceViewer` provides the current single-image resource editor/viewer composition:
  - outer dropzone wrapping
  - single-image admin viewer
  - presentation-mode controls
  - rotate/replace/delete/download actions
  - lazy metadata panel

### Partially Implemented

- The package uses normalized items and status variants, but collection state is still projected out of `ImageCtx`.
- `ThumbnailIntentSelector` is now context-agnostic at the component layer, but intent persistence still flows through adapter actions that call `ImageCtx.handleSetIntent(...)`.
- Full upload and replacement flows are normalized for current feature/resource consumers, but not yet packaged as a general gallery store API.
- Metadata loading is handled in adapters rather than in package-owned orchestration.
- `CameraViewer` reuses the capture-button path, but robust mobile camera capability/session handling is still outside this package.

### Not Yet Implemented

- drag-and-drop reordering
- rank-based ordering
- package-owned transition orchestration outside component-local staging
- cross-collection continuity APIs
- removal of the remaining legacy gallery/viewer implementations

## Goals

- Keep image/gallery rendering in Bits patterns and local image primitives.
- Keep non-thumbnail patterns layout-stable with `h-full w-full`.
- Ensure source image dimensions never dictate viewer layout.
- Keep `fit` and `cover` behavior consistent between viewer, image, and thumbnail surfaces.
- Preserve optimistic upload, replacement, and finalized-asset transitions without viewer flicker.
- Continue moving feature- and resource-specific image concerns out of route/component scope and into adapters or future package-level abstractions.

## Non-Goals For The Current Package

- replacing all legacy image/gallery consumers in one pass
- solving every upload lifecycle concern inside the Bits package itself
- full native camera flow orchestration
- full drag sorting and persistence
- removing `ImageCtx` before replacement abstractions are ready

## Package Layout

The package lives at `src/lib/bits/patterns/images`.

- `components/*`
  - local image/gallery primitives and small composition helpers
- `entityImage/*`
- `Thumbnail.svelte`
- `AdminThumbnail.svelte`
- `Image.svelte`
- `Viewer.svelte`
- `AdminViewer.svelte`
- `CameraViewer.svelte`
- `ThumbnailWrapper.svelte`
- `ImageEditor.svelte`
- `ResourceViewer.svelte`
- `images.types.ts`
- `index.ts`

Current primitive exports under `components/*` include:

- `AdminStateOverlay`
- `CameraCaptureButton`
- `Dropzone`
- `EmptyState`
- `FullScreen`
- `ImageMetadataCard`
- `ImageViewerControls`
- `ImageSurface`
- `ThumbnailButton`
- `ThumbnailIntentSelector`
- `ThumbnailControls`
- `ViewerControls`
- `ViewerStage`

## Current Normalized Item Model

The implemented item shape is:

```ts
type ViewerRenderable = {
  id: string
  renderKey?: string
  src?: string | null
  sourceFallbackSrc?: string | null
  thumbnailSrc?: string | null
  blurSrc?: string | null
  alt?: string | null
  fallbackSeed?: string | null
  intent?: string | null
  isPublished?: boolean | null
  rotationDegrees?: number | null
  animateRotation?: boolean | null
  status?: ViewerRenderableStatus | null
  meta?: Record<string, unknown>
}
```

The implemented status model is:

```ts
type ViewerRenderableStatus =
  | {
      kind: 'persisted'
      savedImageId?: string | null
      sortCreatedAt?: string | null
    }
  | {
      kind: 'optimistic-upload'
      savedImageId?: string | null
      sortCreatedAt?: string | null
      uploadStatus: UploadStatus
      uploadErrorMessage?: string | null
    }
  | {
      kind: 'replacement-upload'
      savedImageId?: string | null
      sortCreatedAt?: string | null
      uploadStatus: UploadStatus
      uploadErrorMessage?: string | null
    }
  | {
      kind: 'finalized-upload'
      savedImageId?: string | null
      sortCreatedAt?: string | null
      uploadStatus: 'uploaded'
      uploadErrorMessage?: string | null
    }
```

Notes on the implemented fields:

- `renderKey` lets optimistic rows preserve animation identity separately from persisted ids.
- `sourceFallbackSrc` supports optimistic preview to finalized-asset promotion without abrupt swaps.
- `thumbnailSrc` allows thumbnail-specific derivatives when available.
- `blurSrc` drives fit-mode backdrop imagery.
- `rotationDegrees` and `animateRotation` are already part of the render contract because the current editor/resource consumers support rotation workflows.
- `status` carries sorting, upload, retry, and replacement semantics required by current consumers.
- `meta` is currently used for internal render hints such as forced source-transition behavior.

## State Ownership Today

### Primitive / Component Layer

Implemented local state includes:

- delayed skeleton visibility
- image load/error state
- source-to-source crossfade state
- fit-mode backdrop rendering
- rotation overlay state in `ImageSurface`
- local delete confirmation state
- hover-preview debounce in `ThumbnailWrapper`
- active-thumbnail scroll targeting
- staged scene preloading and crossfade state in `ViewerStage`
- local fullscreen state in `Viewer`
- drag-active state in `Dropzone`

### Pattern Root Layer

Implemented root-level responsibilities include:

- viewer and thumbnail composition
- left/center/right rail snippet routing
- active id binding
- local fullscreen behavior in `Viewer`
- empty-state upload affordance in `AdminViewer`
- camera capture affordance composition in `CameraViewer`
- editor-specific vertical rail composition in `ImageEditor`
- resource-specific single-image composition in `ResourceViewer`

### Provider / Adapter Layer

Implemented responsibilities still live outside the package:

- collection loading and invalidation
- active image targeting
- URL sync
- image prefetch/refresh through `ImageCtx`
- upload queue orchestration
- delete actions
- intent persistence
- publish-state mutation
- presentation-mode mutation
- rotation persistence
- metadata fetching
- optimistic promotion from preview URLs to finalized asset URLs

Current adapter entry points are:

- `src/lib/adapters/image/useImageEditorGalleryModel.svelte.ts`
- `src/lib/adapters/image/useEntityImageViewerModel.svelte.ts`

## Root Pattern Contracts

### `Thumbnail`

Implemented behavior:

- fixed square trigger surface based on `size`
- active ring styling
- `fit` or `cover`
- delayed skeleton and shimmer support through `ImageSurface`
- thumbnail derivative usage when `thumbnailSrc` exists
- fallback identity imagery through `ImageSurface`

### `AdminThumbnail`

Implemented behavior:

- composes `ThumbnailButton`
- supports `isBlurred`, `isGreyscale`, `isLoading`, `isUploading`, and `isDeleteMode`
- shows `ThumbnailIntentSelector` when not deleting or uploading
- shows unpublished-state overlay when `isPublished === false`
- supports retry for failed uploads
- uses a local confirmation step before delete

Current limitation:

- intent selection UI is package-level, but actual mutation still depends on adapter-provided callbacks backed by `ImageCtx`

### `Image`

Implemented behavior:

- fills the parent container
- renders through `ImageSurface`
- supports `fit` or `cover`
- shows blurred fit-mode backdrop

### `Viewer`

Implemented behavior:

- parent-filling multi-item viewer
- next/previous navigation
- optional left/center/right rails
- fullscreen mode with portal rendering
- center tap target that can toggle fullscreen or run a custom action
- browser view-transition integration where supported
- scene identity reuse checks to avoid unnecessary restaging
- crossfade between previous and incoming scenes
- synchronized fit-mode backdrop crossfade in `ViewerStage`
- asset-preload gate before scene swap

### `AdminViewer`

Implemented behavior:

- composes `Viewer`
- provides empty-state upload affordance through `Dropzone`
- supports `single` or `multiple` upload selection

Important scope note:

- full drag-and-drop composition for non-empty states is handled by wrappers such as `ResourceViewer`, not by `AdminViewer` alone

### `CameraViewer`

Implemented behavior:

- composes `AdminViewer`
- adds `CameraCaptureButton`
- routes captured files to `onCaptureFiles ?? onUploadFiles`

Missing parity:

- no package-owned camera capability detection or session management

### `Dropzone`

Implemented behavior:

- wraps arbitrary children
- supports single or multiple upload selection
- provides hover and drag-active prompt states
- supports empty-state presentation or overlay prompt presentation
- exposes accepted files and file rejections through a shared callback

### `ThumbnailWrapper`

Implemented behavior:

- horizontal or vertical scrolling track
- default and admin variants
- click selection
- hover preview callback with debounce while the user is moving or scrolling the rail
- requested active-item centering through `followActiveIdRequestKey` and `followActiveIdRequestId`
- optional FLIP animation
- upload-batch-aware scroll reset for the vertical admin rail
- optional footer snippet

### `ImageEditor`

Implemented behavior:

- current richest multi-image composition in the package
- composes `AdminViewer` and vertical `ThumbnailWrapper`
- adds bottom viewer controls via `ImageViewerControls`
- adds footer `ThumbnailControls`
- supports fullscreen toggling
- supports hover-preview disable
- supports thumbnail load/error callbacks
- supports replace/add/delete/retry/download/publish/presentation-mode actions

### `ResourceViewer`

Implemented behavior:

- composes outer `Dropzone` with inner `AdminViewer`
- narrows the gallery/editor model down to a single visible item
- supports single-image replace/add/delete/download flows
- supports presentation-mode changes
- supports rotate actions
- supports lazy metadata loading

### `entityImage/*`

Current reality:

- `entityImage/EntityImage.svelte` is still an older Bits wrapper around `ImageProvider` and the legacy common viewer path
- it has not yet been migrated onto `ResourceViewer`

## Provider Reality

`ImageProvider.svelte` is still a thin mount point around `setImageCtx(...)`.
`useImageProviderModel.svelte.ts` keeps `ImageCtx` synchronized with page state,
URL state, context changes, and fetched image envelopes.

That means the current package is reusable at the render/composition layer, but
the application still depends on `ImageCtx` for collection state, mutation
actions, metadata fetching, upload orchestration, and navigation semantics.

This is currently expressed through adapters rather than direct package-owned
stores:

- `useImageEditorGalleryModel.svelte.ts` adapts `ImageCtx` state, upload queue
  state, promoted asset URLs, rotation state, metadata state, and admin actions
  into the `ImageEditor` contract.
- `useEntityImageViewerModel.svelte.ts` narrows that model to the single-image
  resource-viewer contract while preserving upload/replacement and metadata
  behavior.

## What Matches The Earlier Design Direction

- reusable Bits gallery/image pattern package exists
- normalized gallery items exist
- explicit persisted/upload/replacement/finalized status modeling exists
- viewer and image surfaces fill their containers
- fit-mode blurred backdrops exist
- admin thumbnail controls live directly in the rail
- viewer background and foreground transitions are both crossfaded
- feature-specific component scope has been reduced through adapters
- resource-specific composition now reuses the same normalized render model

## What Still Does Not Match The Intended End State

- root patterns are still backed by `ImageCtx` rather than a gallery-owned store
- package orchestration is still adapter-driven instead of provider/store-driven
- metadata, presentation mode, and rotation persistence live outside the pattern layer
- `entityImage/*` and other legacy image/gallery code still exist in parallel
- standalone gallery patterns do not yet provide a fully self-contained orchestration layer beyond prop wiring

## TODO

### High Priority

- Define a gallery-focused provider/store contract that separates:
  - collection state
  - active/previous/next state
  - per-item status
  - navigation actions
  - preview/hover intent
  - transition hints
- Move `FeatureImageEditor` and `ResourceViewer` orchestration onto that contract instead of projecting `ImageCtx` directly through adapters.
- Migrate `entityImage/*` onto the package roots so the older viewer path can be removed.

### Medium Priority

- Formalize metadata-loading ownership and API boundaries.
- Decide whether hover preview should remain component-local or move into provider-owned preview intent.
- Add explicit delete lifecycle states beyond local confirmation UI.
- Audit and migrate additional legacy consumers to the package roots.

### Lower Priority

- Add drag-and-drop reorder support.
- Add rank-based ordering support and document any deferred migration in `docs/Deferred-Migrations.md` when implementation starts.
- Add collection prefetch APIs for cross-entity transitions.
- Add more reusable metadata/download side-rail patterns beyond the current editor/resource compositions.
- Add robust mobile camera flow:
  - capability detection
  - native capture preference
  - return-path handling
  - fallback behavior
- Remove obsolete legacy image/gallery components after consumer migration is complete.

## Open Questions

- Should the next provider abstraction own transition timing globally, or should transitions remain primarily inside `ViewerStage` with provider hints?
- Should optimistic upload ids remain stable through finalization, or should a gallery store reconcile temporary ids to final ids explicitly?
- Should hover preview be treated as immediate active selection, or as a separate preview channel that can be disabled on touch devices and throttled centrally?
- Should `ResourceViewer` remain a specialized root, or should it collapse into a documented composition recipe once the gallery store exists?
