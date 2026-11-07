<script lang="ts">
// SVELTE
import { slide } from 'svelte/transition'
import { cubicOut } from 'svelte/easing'
import { prefersReducedMotion } from 'svelte/motion'
// MOTION
import { VIEWER_TRANSITION_MS } from '#lib/bits/patterns/images/images.motion'
// ICONS
import CameraIcon from 'virtual:icons/proicons/camera'
// COMPONENTS
import type { Snippet } from 'svelte'
import FeatureCardLicenseConditions from './FeatureCardLicenseConditions.svelte'
import FeatureCardLicense from './FeatureCardLicense.svelte'
// TYPES
import type { ProjectLicense } from '#lib/db/zod/schema/projectLicense.types.js'
// DATE FORMATTING
import { formatDistanceToNow } from 'date-fns'
import { enGB, zhCN, zhTW } from 'date-fns/locale'
// UTILITIES
import { resolveAvatarImageSrc } from '#lib/utils/avatar.js'
// TYPES
import type { UserHydrationResult } from '#lib/db/zod/schema/user.types.js'
// I18N
import { getLocaleKey, m } from '#lib/i18n.js'
// DOMAIN
import { captureLabel, imageDateLabel } from '#lib/images/capturePresentation.js'
// TYPES
import type { ImageMetadataBasic } from '#lib/db/zod/schema/image.types.js'
let {
  projectLicense = null,
  imageUser = null,
  featureUser = null,
  onOpenProfile,
  metadata,
  loading = false,
  imageCredit,
  featureCredit,
  featureCreatedAt,
}: {
  projectLicense?: ProjectLicense | null
  imageUser?: UserHydrationResult
  featureUser?: UserHydrationResult
  onOpenProfile?: (username: string) => void
  metadata: ImageMetadataBasic | null
  loading?: boolean
  imageCredit?: string | null
  featureCredit?: string | null
  featureCreatedAt?: string | null
} = $props()
let cameraOpen = $state(false)
const cameraId = $props.id()
const cameraRows = $derived(
  [
    { label: m.camera(), value: metadata?.cameraModel, fullWidth: false },
    {
      label: m.image__metadata_dimensions(),
      value:
        metadata?.originalWidth && metadata?.originalHeight
          ? `${metadata.originalWidth} × ${metadata.originalHeight}`
          : null,
      fullWidth: false,
    },
    {
      label: m.image_attribution_embedded_credit(),
      value:
        metadata?.credit && imageCredit && metadata.credit !== imageCredit
          ? metadata.credit
          : null,
      fullWidth: true,
    },
  ].filter(row => row.value),
)
const locale = $derived(
  getLocaleKey() === 'en'
    ? 'en-HK'
    : getLocaleKey() === 'zhHant'
      ? 'zh-Hant-HK'
      : 'zh-Hans-HK',
)
const captured = $derived(
  metadata?.capture
    ? captureLabel(metadata.capture)
    : imageDateLabel(metadata?.capturedAt, locale),
)
const dateLocale = $derived(
  getLocaleKey() === 'en' ? enGB : getLocaleKey() === 'zhHant' ? zhTW : zhCN,
)
// Omit media labels when the effective licenses are identical across all content.
const sharedLicense = $derived(
  projectLicense &&
    JSON.stringify(projectLicense.media.image) ===
      JSON.stringify(projectLicense.media.text) &&
    JSON.stringify(projectLicense.media.text) ===
      JSON.stringify(projectLicense.media.data)
    ? projectLicense.media.image
    : null,
)
</script>

{#snippet contributor(
  user: UserHydrationResult,
  credit: string | null | undefined,
  date: Snippet,
)}
  {@const label =
    credit ||
    (user && 'name' in user ? user.name : null) ||
    user?.displayUsername ||
    user?.username ||
    m.anonymous()}
  {@const src = user && 'image' in user ? resolveAvatarImageSrc(user.image) : null}
  {#snippet identity()}
    <span
      class="bg-muted relative flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full text-sm font-semibold"
      aria-hidden="true"
    >
      {label.slice(0, 1).toLocaleUpperCase()}
      {#if src}
        <img
          {src}
          alt=""
          class="absolute inset-0 size-full object-cover"
          onerror={event => {
            if (event.currentTarget instanceof HTMLImageElement)
              event.currentTarget.style.display = 'none'
          }}
        >
      {/if}
    </span>
    <span class="min-w-0">
      <span class="block break-words whitespace-normal">{label}</span>
      <span class="text-muted-foreground block text-xs font-normal"
        >{@render date()}</span
      >
    </span>
  {/snippet}
  {#if user?.username}
    <a
      href={`/users/${encodeURIComponent(user.username)}`}
      onclick={event => {
        if (
          !onOpenProfile ||
          !user.username ||
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        )
          return
        event.preventDefault()
        onOpenProfile(user.username)
      }}
      class="focus-visible:outline-primary inline-flex max-w-full items-center gap-3 rounded-md hover:underline focus-visible:outline-2"
    >
      {@render identity()}
    </a>
  {:else}
    <span class="inline-flex max-w-full items-center gap-3">{@render identity()}</span>
  {/if}
{/snippet}

{#snippet timestamp(value: string)}
  {#if Number.isFinite(new Date(value).getTime()) && !/^\d{4}(-\d{2})?$/.test(value)}
    <time datetime={value} data-tooltip={imageDateLabel(value, locale)}>
      {formatDistanceToNow(new Date(value), { addSuffix: true, locale: dateLocale })}
    </time>
  {:else}
    {imageDateLabel(value, locale)}
  {/if}
{/snippet}

<section
  class="flex flex-col gap-4 [&>*]:shrink-0"
  aria-label={m.image_attribution_title()}
  aria-busy={loading}
>
  {#if loading}
    <span class="sr-only" role="status">{m.image_attribution_loading()}</span>
    <div class="space-y-4 motion-safe:animate-pulse" aria-hidden="true">
      {#each [0, 1] as index}
        <div class={index ? 'border-border space-y-3 border-t pt-4' : 'space-y-3'}>
          <div class={index ? 'flex h-6 items-center' : 'flex h-8 items-center'}>
            <div class="bg-foreground/10 h-5 w-24 rounded"></div>
          </div>
          <div class="space-y-2">
            <div class="flex items-center gap-3">
              <div class="bg-foreground/10 size-10 shrink-0 rounded-full"></div>
              <div class="space-y-2">
                <div class="bg-foreground/10 h-4 w-32 rounded"></div>
                <div class="bg-foreground/10 h-3 w-20 rounded"></div>
              </div>
            </div>
            <div class="space-y-1 pl-13">
              {#if index}
                <div class="bg-foreground/10 h-4 w-24 rounded"></div>
              {/if}
              <div class="bg-foreground/10 h-6 w-28 rounded"></div>
            </div>
          </div>
        </div>
      {/each}
    </div>
  {:else}
    <div class="space-y-3">
      <div class="relative space-y-3">
        <div class="flex min-h-8 items-center gap-2 pr-12">
          <h3 class="font-semibold">{m.image_attribution_photo()}</h3>
          <FeatureCardLicenseConditions
            rights={projectLicense?.media.image}
            mediaLabel={m.image_attribution_photo()}
          />
        </div>
        <dl class="space-y-2 pr-12 text-sm">
          <div>
            <dt class="sr-only">{m.image_attribution_credit()}</dt>
            <dd>
              {#snippet photoDate()}
                {#if loading}
                  {m.image_attribution_loading()}
                {:else if !metadata?.capture && metadata?.capturedAt}
                  {@render timestamp(metadata.capturedAt)}
                {:else if metadata?.capture &&
                  !metadata.capture.approximate &&
                  !metadata.capture.endValue &&
                  ['day', 'minute', 'second'].includes(metadata.capture.precision)}
                  {@render timestamp(metadata.capture.value)}
                {:else}
                  {captured || m.image_attribution_unknown_date()}
                {/if}
              {/snippet}
              {@render contributor(
                imageUser,
                imageCredit || metadata?.credit,
                photoDate,
              )}
            </dd>
          </div>
          {#if projectLicense}
            <div class="pl-13">
              <FeatureCardLicense rights={projectLicense.media.image} />
            </div>
          {/if}
        </dl>
        {#if cameraRows.length}
          <button
            type="button"
            aria-label={m.image__metadata_open()}
            data-tooltip={m.image__metadata_open()}
            aria-expanded={cameraOpen}
            aria-controls={cameraId}
            onclick={() => (cameraOpen = !cameraOpen)}
            class="text-muted-foreground hover:bg-foreground/10 hover:text-foreground focus-visible:outline-primary absolute right-0 bottom-0 flex size-10 items-center justify-center rounded-full focus-visible:outline-2"
          >
            <CameraIcon class="size-5" aria-hidden="true" />
          </button>
        {/if}
      </div>
      {#if cameraOpen && cameraRows.length}
        <!-- Animate the measured content; the viewer follows without a second easing. -->
        <div id={cameraId} transition:slide={{ duration: prefersReducedMotion.current ? 0 : VIEWER_TRANSITION_MS, easing: cubicOut }}>
          <dl
            class="border-border grid grid-cols-2 gap-x-4 gap-y-3 border-t pt-3 text-sm"
          >
            {#each cameraRows as row (row.label)}
              <div class="min-w-0" class:col-span-2={row.fullWidth}>
                <dt class="text-muted-foreground text-xs">{row.label}</dt>
                <dd class="break-words whitespace-normal">{row.value}</dd>
              </div>
            {/each}
          </dl>
        </div>
      {/if}
    </div>
    <div class="border-border space-y-3 border-t pt-4">
      <div class="flex items-center gap-2">
        <h3 class="font-semibold">{m.image_attribution_record()}</h3>
        <FeatureCardLicenseConditions
          rights={projectLicense?.media.text}
          mediaLabel={m.admin__project_license_media_text()}
        />
      </div>
      <dl class="space-y-2 text-sm">
        <div>
          <dt class="sr-only">{m.image_attribution_contributor()}</dt>
          <dd>
            {#snippet featureDate()}
              {#if featureCreatedAt}
                {@render timestamp(featureCreatedAt)}
              {/if}
            {/snippet}
            {@render contributor(featureUser, featureCredit, featureDate)}
          </dd>
        </div>
        {#if projectLicense}
          {#if JSON.stringify(projectLicense.media.text) ===
            JSON.stringify(projectLicense.media.data)}
            <div class="pl-13">
              <FeatureCardLicense
                rights={projectLicense.media.text}
                mediaLabel={sharedLicense
                  ? undefined
                  : `${m.admin__project_license_media_text()} / ${m.admin__project_license_media_data()}`}
              />
            </div>
          {:else}
            <div class="grid grid-cols-2 items-start gap-3 pl-13">
              <FeatureCardLicense
                rights={projectLicense.media.text}
                mediaLabel={m.admin__project_license_media_text()}
              />
              <FeatureCardLicense
                rights={projectLicense.media.data}
                mediaLabel={m.admin__project_license_media_data()}
              />
            </div>
          {/if}
        {/if}
      </dl>
    </div>
    {#if projectLicense?.meta.attribution}
      <footer class="border-border space-y-3 border-t pt-3 text-left text-sm">
        {#if projectLicense?.meta.attribution}
          <div class="text-muted-foreground space-y-1">
            <p class="text-xs">{m.field_attribution()}</p>
            <p class="break-words whitespace-pre-wrap">
              {projectLicense.meta.attribution}
            </p>
          </div>
        {/if}
      </footer>
    {/if}
  {/if}
</section>
