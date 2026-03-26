# Gallery Pattern Design Spec

## Summary

This spec defines a new reusable gallery package at `src/lib/bits/patterns/gallery`.
It replaces the current legacy image gallery split across `src/lib/components/common`,
`src/lib/components/images/gallery`, feature-card gallery helpers, and ad hoc `imageCtx`
usage.

The immediate implementation target is a first-pass reusable pattern set for:

- `Thumbnail`
- `AdminThumbnail`
- `Image`
- `Viewer`
- `AdminViewer`
- `CameraViewer`
- `ThumbnailWrapper`
- `Gallery`
- `ImageEditor`

The first pass focuses on stable composition, sizing, fit/cover behavior, and a clean API.
Advanced orchestration, provider evolution, upload lifecycle management, cross-set transitions,
dropzone parity, and drag sorting are captured below as follow-up design work.

## Goals

- Move gallery rendering into Bits patterns that follow `docs/Components.md`.
- Keep root patterns composed only from local `./components` primitives.
- Make all non-thumbnail patterns fill their parent container with `h-full w-full`.
- Ensure image size never drives layout size.
- Support `fit` and `cover` consistently.
- In `fit` mode, show a blurred enlarged clone behind the main image for both `Image` and `Thumbnail`.
- Establish a normalized gallery item shape that adapters can target later.
- Prepare the provider to become a long-lived orchestration layer across feature-to-feature transitions.

## Non-Goals For First Pass

- Full upload queue orchestration inside the new Bits package
- Full drag-and-drop reordering
- Full remote delete integration
- Full mobile camera session management
- Full provider refactor
- Feature/task/server adapters

## Package Layout

The package lives at `src/lib/bits/patterns/gallery`.

- `components/*`
  - Context-agnostic render primitives and small UI behaviors.
- `Thumbnail.svelte`
- `AdminThumbnail.svelte`
- `Image.svelte`
- `Viewer.svelte`
- `AdminViewer.svelte`
- `CameraViewer.svelte`
- `ThumbnailWrapper.svelte`
- `Gallery.svelte`
- `AdminGallery.svelte`
- `gallery.types.ts`
- `index.ts`

## Normalized Item Model

The gallery package should render a normalized item model rather than directly depending on
`FeatureImage`, `TaskImage`, or raw DB envelopes.

Proposed shape:

```ts
type GalleryItem = {
  id: string
  alt?: string | null
  src?: string | null
  thumbnailSrc?: string | null
  blurSrc?: string | null
  fallbackSeed?: string | null
  intent?: string | null
  meta?: Record<string, unknown>
}
```

Notes:

- `src` is the canonical image for viewer usage.
- `thumbnailSrc` allows smaller derivatives for thumbnail tracks.
- `blurSrc` is optional. If omitted, the component reuses `src` for the blurred backdrop.
- `fallbackSeed` drives the hashicon fallback when no image URL exists.
- `meta` remains opaque so adapter layers can attach domain data without forcing pattern coupling.

## State Ownership

### Component Layer

The new render primitives own only:

- local hover state
- delayed skeleton visibility
- image decode / load booleans
- local delete confirmation display
- local thumbnail centering behavior
- local previous-image transition staging

### Pattern Root Layer

The root gallery patterns own only:

- current selected image id when used standalone
- next/prev navigation intent
- composition of viewer plus thumbnails
- routing of snippets for rails/widgets
- routing of admin-state booleans into admin thumbnails

### Adapter / Provider Layer

The provider should own:

- active image id
- collection identity and contents
- image status per item
- transition intent and previous/next ids
- image preload orchestration
- upload/delete lifecycle state
- cross-collection continuity when the routed feature changes

## First-Pass Component Contracts

### `Thumbnail`

- Fixed square root based on `size`
- Trigger surface for selecting an image
- `fit` or `cover`
- delayed skeleton
- shimmer while loading
- hashicon fallback when no image is available

### `AdminThumbnail`

- Composes `Thumbnail`
- Adds `IntentLabel`
- Adds state overlays for:
  - `isBlurred`
  - `isGreyscale`
  - `isLoading`
  - `isUploading`
  - `isDeleteMode`
- Local delete confirmation shim

### `Image`

- Single image
- No controls
- Always fills parent
- `fit` or `cover`
- blurred clone backdrop in `fit`

### `Viewer`

- Multi-image viewer
- Next/prev controls
- Root stage is always `h-full w-full`
- Crossfade between previous and current images
- Wraps the `Image` root pattern indirectly through local primitives
- Optional left/center/right widget rails

### `AdminViewer`

- Same as `Viewer`
- Adds upload affordance slot / empty prompt shell
- Full dropzone behavior deferred to follow-up

### `CameraViewer`

- Same as `AdminViewer`
- Adds capture trigger
- First pass uses file input with `accept="image/*"` and `capture="environment"`
- Full native-camera and robust mobile integration deferred

### `ThumbnailWrapper`

- Scrollable track
- Select on click
- Preview/select on hover
- Keeps active thumbnail centered
- Optional `admin` variant
- Optional `flipMode`
- Optional `isDeleteMode`

### `Gallery`

- Composes `Viewer` or `CameraViewer`
- Composes `ThumbnailWrapper`
- Uses local controlled state if no provider wiring exists

### `ImageEditor`

- Composes `AdminViewer`
- Composes `ThumbnailWrapper`
- Mirrors the layout intent of the current `ImageGallery.svelte`

## Provider Evolution

`ImageProvider.svelte` should remain the mount point, but `ImageCtx` needs a cleaner public
contract oriented around collection orchestration rather than mixed UI concerns.

Target provider surface:

- `collection`
  - ordered item list
  - collection identity key
- `active`
  - active id
  - active item
  - previous item
  - next item
  - previous id
  - next id
- `statusById`
  - network load status
  - onscreen display readiness
  - upload status
  - delete status
  - transition status
- actions
  - `toPrev()`
  - `toNext()`
  - `toIdx(index)`
  - `toId(id)`
  - `transitionToImage(id, options)`
  - `preloadCollection(items)`
  - `prefetchFeatures(featureIds)`

Important nuance:

- Native `img.onload` fires when the image resource finishes loading.
- That does not guarantee the image has painted on screen.
- For viewer transitions we should treat:
  - network/decode ready
  - staged in DOM
  - visually settled
  as separate milestones where needed.

## Cross-Collection Continuity

The provider should not blank to empty when a feature changes.

Target behavior:

- Keep the previous active image staged while the new collection is prepared.
- Preload the new target image before releasing the previous layer.
- Allow controlled crossfade across collection swaps.
- Avoid clearing the collection synchronously when a route-level rehydration happens.

This implies the provider should preserve:

- previous collection snapshot
- active outgoing item
- incoming collection key
- incoming target id

## Upload / Admin Abstraction

`AdminGallery` must eventually unify three item states:

1. Existing server images
2. Client-selected uploads in processing
3. Finalized uploaded images available from assets

Recommended abstraction:

```ts
type GalleryRenderableItem = {
  id: string
  render: GalleryItem
  origin: 'server' | 'staged' | 'uploaded'
  status:
    | 'idle'
    | 'loading'
    | 'loaded'
    | 'uploading'
    | 'uploaded'
    | 'deleting'
    | 'deleted'
    | 'error'
  replaceTargetId?: string | null
}
```

Adapters should translate feature/task image records into this render model.

## Advanced Requirements Todo

- Refactor `ImageCtx` into a focused collection/navigation/status store.
- Add `transitionToImage(id, { fade, slide })` support with blur-out / blur-in staging.
- Hold the outgoing image until the incoming image reaches its final unblurred state.
- Add dropzone parity without directly depending on the existing legacy wrapper.
- Support multiple uploads and image replacement flows.
- Add upload progress notifications for each state transition.
- Integrate browser-side HEIC/TIFF/large-raster conversion from `src/lib/images/upload.ts`.
- Add full viewer bottom rails for metadata, attribution, and download widgets.
- Add robust mobile camera flow:
  - capability detection
  - native capture preference
  - return path handling
  - fallback to standard file input
- Add hover-driven viewer transition semantics in the provider, not just component-local selection.
- Add staggered thumbnail entrance motion.
- Add delete-mode remote integration through `deleteImage(id)`.
- Add animated removal on delete.
- Add adapter contracts for `FeatureImage`, `TaskImage`, and other image-bearing resources.
- Add collection prefetch via `prefetchFeatures(featureIds)` using app cache where possible.
- Add explicit distinction between resource-loaded and visually-settled states.

## Sorting And Future Drag Reorder

Current default ordering is derived from `featureImage.intent`.

Future work:

- Add `featureImage.rank`.
- Treat `null` rank as “use default intent-based sort”.
- Support drag-and-drop reordering inside `ThumbnailWrapper`.
- Expose `onDefaultSort` on `ThumbnailWrapper` so a UI control can reset ordering.
- Document migration needs for `featureImage.rank` and any deferred rollout in
  `docs/Deferred-Migrations.md` when implementation begins.

## Open Questions

- Should the provider own transition timing globally, or should viewer patterns accept a
  transition controller object from adapters?
- Should staged uploads receive stable client ids that survive server finalization, or should the
  adapter reconcile temporary and final ids?
- Should hover change the active image immediately, or only issue a preview transition intent that
  can be throttled or disabled on touch devices?
