<script lang="ts">
// DATE
import { formatDistanceToNowStrict } from 'date-fns'
// ICONS
import Person from 'virtual:icons/proicons/person'
import Chat from 'virtual:icons/proicons/chat'
import Phone from 'virtual:icons/proicons/phone'
import Mail from 'virtual:icons/proicons/mail'
import MapPin from 'virtual:icons/proicons/location'
import Camera from 'virtual:icons/proicons/camera'
import Report from 'virtual:icons/proicons/alert-triangle'
// UTILS
import { resolveAvatarImageSrc } from '#lib/utils/avatar.js'
// TYPES
import type { DirectoryUser } from './userDirectory.types'
import type { UserDirectoryMetrics } from '#lib/users/directoryMetrics.types.js'

let {
  user,
  layout,
  metrics,
  metricsFailed = false,
  onRetry,
}: {
  user: DirectoryUser
  layout: 'list' | 'card'
  metrics?: UserDirectoryMetrics
  metricsFailed?: boolean
  onRetry: () => void
} = $props()
const avatar = $derived(
  resolveAvatarImageSrc(typeof user.image === 'string' ? user.image : null),
)
const name = $derived(
  user.name?.trim() || user.displayUsername || user.username || 'Unnamed user',
)
const joined = $derived(user.createdAt ? new Date(user.createdAt) : null)
const since = $derived(
  joined && Number.isFinite(joined.getTime())
    ? formatDistanceToNowStrict(joined, { addSuffix: true })
    : null,
)
const wide = $derived(layout === 'list')
const stats = $derived([
  {
    label: 'Published features',
    icon: MapPin,
    color: 'text-primary',
    value: metrics?.publishedFeatures,
  },
  {
    label: 'Published photos',
    icon: Camera,
    color: 'text-secondary',
    value: metrics?.publishedPhotos,
  },
  {
    label: 'Missing-place reports',
    icon: Report,
    color: 'text-warning',
    value: metrics?.missingPlaceReports,
  },
])
const sectionLabelClass =
  'mb-1.5 block text-center text-[10px] font-medium uppercase leading-none tracking-[0.12em] text-base-content/45'
// List rows progressively hide contributions, locale, then joined date as space shrinks.
// Keep dividers in the gutters so each group has a symmetric content area.
const wideDividerClass =
  'before:absolute before:inset-y-0 before:w-px before:bg-border/60'
const contactClass =
  'flex size-8 shrink-0 items-center justify-center rounded-md text-base-content/65 hover:bg-base-200 hover:text-primary focus-visible:outline-2 focus-visible:outline-focus'
</script>

<div
  class="grid items-center gap-x-4 gap-y-3 p-3 {wide
    ? 'grid-cols-[minmax(0,2fr)_minmax(6rem,0.8fr)_minmax(4.5rem,0.6fr)] @[500px]:grid-cols-[minmax(0,2fr)_minmax(6rem,0.8fr)_minmax(6rem,1fr)_minmax(4.5rem,0.6fr)] @[640px]:grid-cols-[minmax(0,2fr)_minmax(6rem,0.8fr)_minmax(8.5rem,1fr)_minmax(4.5rem,0.6fr)] @[800px]:grid-cols-[minmax(0,2fr)_minmax(6rem,0.8fr)_minmax(8.5rem,1fr)_minmax(11rem,1.2fr)_minmax(4.5rem,0.6fr)]'
    : 'grid-cols-[minmax(0,1fr)_auto]'}"
>
  <section
    aria-label="User identity"
    class="col-start-1 row-start-1 flex min-w-0 items-center gap-3 {wide
      ? 'mr-4'
      : 'col-span-2 pr-20'}"
  >
    <div
      class="bg-base-200 flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-lg"
    >
      {#if avatar}
        <img
          src={avatar}
          alt=""
          class="size-full object-cover"
          loading="lazy"
          referrerpolicy="no-referrer"
        >
      {:else}
        <Person class="text-base-content/45 size-7" />
      {/if}
    </div>
    <div class="min-w-0">
      <p
        class="leading-snug font-semibold break-words whitespace-normal"
        data-tooltip={user.attribution?.trim()
          ? `Attribution: ${user.attribution.trim()}`
          : undefined}
      >
        {name}
      </p>
      {#if user.username}
        <a
          class="text-base-content/60 hover:text-primary focus-visible:outline-focus block min-w-0 text-sm break-words whitespace-normal underline-offset-4 hover:underline focus-visible:outline-2"
          href={`/admin/users/${encodeURIComponent(user.username)}`}
          >@{user.displayUsername || user.username}</a
        >
      {:else}
        <span class="text-base-content/45 text-sm">No username</span>
      {/if}
    </div>
  </section>
  <section
    aria-label="Messaging"
    class="{wide ? wideDividerClass : ''} relative text-center {wide
      ? 'col-start-2 row-start-1 before:-left-4'
      : 'col-start-1 row-start-2 border-t border-border/60 pt-3'}"
  >
    <div class="flex items-center justify-center">
      <a href="/admin/messaging" aria-label="Open messaging" class={contactClass}
        ><Chat class="size-6" /></a
      >
      {#if user.telephone}
        <a
          href={`tel:${user.telephone.replace(/[^+\d]/g, '')}`}
          aria-label={`Call ${name}`}
          class={contactClass}
          ><Phone class="size-6" /></a
        >
      {:else}
        <span
          role="img"
          aria-label="No phone number"
          class="text-base-content/20 flex size-8 items-center justify-center"
          ><Phone class="size-6" /></span
        >
      {/if}
      {#if user.email}
        <a
          href={`mailto:${user.email}`}
          aria-label={`Email ${name}`}
          class={contactClass}
          ><Mail class="size-6" /></a
        >
      {:else}
        <span
          role="img"
          aria-label="No email address"
          class="text-base-content/20 flex size-8 items-center justify-center"
          ><Mail class="size-6" /></span
        >
      {/if}
    </div>
  </section>
  <section
    aria-label="Joined and locale"
    class="{wide
      ? wideDividerClass
      : ''} relative items-center justify-center gap-4 text-center {wide
      ? 'hidden @[500px]:flex col-start-3 before:-left-2 row-start-1'
      : 'col-start-2 row-start-2 flex border-t border-border/60 pt-3'}"
  >
    <div>
      <span class={sectionLabelClass}>Joined</span>
      <span
        class="text-base-content/75 flex min-h-8 items-center justify-center text-xs"
        >{since ?? 'Unknown'}</span
      >
    </div>
    <div class={wide ? 'hidden @[640px]:block' : ''}>
      <span class={sectionLabelClass}>Locale</span>
      <span
        class="border-base-content/10 bg-base-content/[0.035] text-base-content/70 inline-flex min-h-8 items-center rounded-md border px-2 font-mono text-[11px] font-semibold tracking-wider uppercase"
        title={`Locale: ${user.locale || 'en'}`}
        >{(user.locale || 'en').toUpperCase()}</span
      >
    </div>
  </section>
  <section
    class="{wide ? wideDividerClass : ''} relative min-w-0 {wide
      ? 'hidden @[800px]:block col-start-4 before:-left-2 row-start-1'
      : 'col-span-2 col-start-1 row-start-3 border-t border-border/60 pt-3'}"
    aria-label="Contribution metrics"
    aria-busy={!metrics && !metricsFailed}
  >
    {#if metricsFailed}
      <button
        type="button"
        onclick={onRetry}
        class="bg-base-200 text-base-content/60 hover:text-primary w-full rounded-md px-3 py-2 text-xs"
      >
        Retry metrics
      </button>
    {:else}
      <dl
        class="flex min-h-8 flex-wrap items-center justify-center gap-y-2 {wide
          ? 'gap-x-1'
          : 'gap-x-4'}"
      >
        {#each stats as stat}
          <div class="flex min-w-0 items-center justify-center gap-1.5 px-1">
            <dt class="flex shrink-0 items-center">
              <stat.icon
                class="size-6 {stat.value ? stat.color : 'text-base-content/35'}"
                aria-hidden="true"
              />
              <span class="sr-only">{stat.label}</span>
            </dt>
            <dd
              class="text-lg font-semibold leading-none tabular-nums {stat.value
                ? 'text-base-content'
                : 'text-base-content/45'}"
            >
              {stat.value === undefined ? '—' : stat.value.toLocaleString()}
            </dd>
          </div>
        {/each}
      </dl>
    {/if}
  </section>
  <section
    aria-label="User status"
    class="{wide
      ? wideDividerClass
      : ''} relative row-start-1 flex items-center justify-center {wide
      ? 'col-start-3 @[500px]:col-start-4 @[800px]:col-start-5 before:-left-2 min-h-12'
      : 'col-start-2'}"
  >
    <span
      class="inline-flex items-center gap-1.5 justify-self-end rounded-md border px-2.5 py-1 text-[11px] font-semibold leading-none {user.isArchived
        ? 'border-base-content/15 bg-base-content/5 text-base-content/60'
        : 'border-success/20 bg-success/8 text-success'}"
      ><span class="size-1.5 rounded-full bg-current" aria-hidden="true"></span>
      {user.isArchived ? 'Archived' : 'Active'}</span
    >
  </section>
</div>
