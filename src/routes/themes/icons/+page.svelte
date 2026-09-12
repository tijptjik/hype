<script lang="ts">
// ICONS
import Search from 'virtual:icons/proicons/search'
import Add from 'virtual:icons/proicons/add'
import Location from 'virtual:icons/proicons/location'
import Layers from 'virtual:icons/proicons/layers'
import Check from 'virtual:icons/proicons/checkmark'
// BITS COMPONENTS
import Button from '$lib/bits/core/button/Button.svelte'
import Icon from '$lib/bits/custom/icon/Icon.svelte'
// DATA
import { iconComparisons } from './comparisons'
import { THEMES } from '$lib/themes/themes'
// TYPES
import type { ThemeId } from '$lib/themes/themes.types'

let selected = $state<ThemeId>('breadline-light')
let query = $state('')
let status = $state('All')
let size = $state(24)
const statuses = ['All', 'Applied', 'Retain'] as const
const filtered = $derived(
  iconComparisons
    .filter(
      icon =>
        (status === 'All' || icon.status === status) &&
        `${icon.name} ${icon.replacement} ${icon.note} ${icon.files.join(' ')}`
          .toLowerCase()
          .includes(query.toLowerCase().trim()),
    )
    .sort(
      (a, b) =>
        Number(a.status === 'Retain') - Number(b.status === 'Retain') ||
        b.count - a.count ||
        a.name.localeCompare(b.name),
    ),
)
const appliedCount = iconComparisons.filter(icon => icon.status === 'Applied').length
</script>

<svelte:head>
  <title>Icon study · Hype</title>
  <meta
    name="description"
    content="Compare the icons used in Hype with suggested Proicons replacements, in every app theme."
  >
</svelte:head>

<main data-theme={selected} class="bits-theme min-h-screen bg-canvas text-base-content">
  <div class="mx-auto max-w-[1440px] px-4 py-6 sm:px-10 lg:px-14">
    <header
      class="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-6"
    >
      <a
        href="/themes"
        class="flex items-center gap-3 text-sm font-semibold tracking-widest"
        ><span
          class="grid size-9 place-items-center rounded-xl bg-primary text-primary-content"
          >H</span
        >
        HYPE <span class="font-normal text-muted-foreground">/ ICON STUDY</span></a
      >
      <label class="flex items-center gap-3 text-sm"
        >Theme
        <select
          bind:value={selected}
          class="rounded-xl border border-border bg-surface px-3 py-2 text-base-content"
        >
          {#each THEMES as theme}
            <option value={theme.id}>{theme.name}</option>
          {/each}
        </select>
      </label>
    </header>

    <section class="grid gap-8 py-10 lg:grid-cols-[1.1fr_1fr] lg:items-center">
      <div>
        <p class="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-primary">
          A softer set of signals
        </p>
        <h1 class="text-5xl font-medium leading-tight tracking-[-0.045em] sm:text-6xl">
          Small details.<br><span class="text-muted-foreground">More like an app.</span>
        </h1>
        <p class="mt-5 max-w-xl text-base leading-relaxed text-muted-foreground">
          Proicons brings a quieter stroke and gently rounded shapes to our warm
          surfaces. Compare the original icons with the replacements now used in the
          app.
        </p>
        <p class="mt-4 text-sm text-muted-foreground">
          {iconComparisons.length}
          original icons · {appliedCount} replacements applied
        </p>
      </div>
      <div class="rounded-3xl border border-border bg-surface p-5 sm:p-7">
        <p
          class="mb-5 text-xs font-semibold uppercase tracking-widest text-muted-foreground"
        >
          Proicons in context
        </p>
        <div class="flex items-center gap-3 rounded-2xl bg-canvas p-4">
          <Icon src={Search} size="md" aria-hidden="true" />
          <span class="text-sm text-muted-foreground"
            >Find a place, layer or project</span
          >
        </div>
        <div class="my-5 flex items-center gap-4">
          <span
            class="grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary"
            ><Icon src={Location} size="lg" aria-hidden="true" /></span
          >
          <div>
            <p class="font-semibold">Around the neighbourhood</p>
            <p class="mt-1 text-sm text-muted-foreground">
              Places worth coming together for
            </p>
          </div>
        </div>
        <div class="flex flex-wrap items-center gap-3">
          <Button
            text="Add a place"
            iconComponent={Add}
            color="primary"
            style="soft"
            class="!text-primary"
          />
          <span
            class="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm"
            ><Layers class="size-4" aria-hidden="true" />
            3 layers</span
          ><span class="inline-flex items-center gap-1 text-sm text-secondary"
            ><Check class="size-4" aria-hidden="true" />
            Saved</span
          >
        </div>
      </div>
    </section>

    <section aria-label="Icon comparisons">
      <div
        class="flex flex-wrap items-end justify-between gap-4 border-y border-border py-5"
      >
        <label class="min-w-0 flex-1 text-xs font-semibold uppercase tracking-wider"
          >Find an icon
          <input
            type="search"
            bind:value={query}
            placeholder="Search names, meaning or source files…"
            class="mt-2 block w-full min-w-48 rounded-xl border border-border bg-surface px-4 py-3 text-sm font-normal tracking-normal normal-case text-base-content"
          >
        </label>
        <label class="text-xs font-semibold uppercase tracking-wider"
          >Show
          <select
            bind:value={status}
            class="mt-2 block rounded-xl border border-border bg-surface px-3 py-3 text-sm font-normal tracking-normal normal-case text-base-content"
          >
            {#each statuses as option}
              <option>{option}</option>
            {/each}
          </select>
        </label>
        <label class="text-xs font-semibold uppercase tracking-wider"
          >Icon size
          <select
            bind:value={size}
            class="mt-2 block rounded-xl border border-border bg-surface px-3 py-3 text-sm font-normal tracking-normal normal-case text-base-content"
          >
            {#each [16, 20, 24, 32] as value}
              <option {value}>{value} px</option>
            {/each}
          </select>
        </label>
      </div>
      <div
        class="flex flex-wrap justify-between gap-2 py-5 text-sm text-muted-foreground"
      >
        <p aria-live="polite">
          {filtered.length}
          of {iconComparisons.length} comparisons
        </p>
        <p>Native strokes · Same size · Same colour</p>
      </div>
      <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {#each filtered as icon (icon.name)}
          <article
            class="min-w-0 rounded-2xl border border-border bg-surface p-5"
            data-icon-comparison={icon.name}
          >
            <div class="mb-5 flex items-center justify-between gap-2">
              <span class="text-xs text-muted-foreground"
                >{icon.count}
                source {icon.count === 1 ? 'file' : 'files'}</span
              ><span
                class={['rounded-full px-2.5 py-1 text-xs font-medium', icon.status === 'Applied' ? 'bg-primary/10 text-primary' : 'bg-canvas']}
                >{icon.status}</span
              >
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div class="min-w-0">
                <div class="grid h-20 place-items-center rounded-xl bg-canvas">
                  <icon.current width={size} height={size} aria-hidden="true" />
                </div>
                <p
                  class="mt-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground"
                >
                  Original
                </p>
                <p class="mt-1 break-words font-mono text-xs">{icon.name}</p>
              </div>
              <div class="min-w-0">
                <div class="grid h-20 place-items-center rounded-xl bg-primary/5">
                  <icon.proposed width={size} height={size} aria-hidden="true" />
                </div>
                <p
                  class="mt-3 text-[10px] font-semibold uppercase tracking-widest text-primary"
                >
                  {icon.status === 'Retain' ? 'Keep original' : 'Applied'}
                </p>
                <p class="mt-1 break-words font-mono text-xs">{icon.replacement}</p>
              </div>
            </div>
            <p class="mt-4 text-sm leading-relaxed text-muted-foreground">
              {icon.note}
            </p>
            <details class="mt-4 border-t border-border pt-3">
              <summary class="cursor-pointer text-xs text-muted-foreground">
                Where it’s used
              </summary>
              <ul class="mt-3 space-y-2">
                {#each icon.files as file}
                  <li class="break-all font-mono text-[11px] text-muted-foreground">
                    {file}
                  </li>
                {/each}
              </ul>
            </details>
          </article>
        {/each}
      </div>
      {#if filtered.length === 0}
        <p class="py-16 text-center text-muted-foreground">
          No icons match. Try a different name or choose All.
        </p>
      {/if}
    </section>
    <footer
      class="mt-10 border-t border-border py-6 text-sm leading-relaxed text-muted-foreground"
    >
      The applied icon migration, with the selected Lucide exceptions and original
      brand, flag and licence artwork preserved.
    </footer>
  </div>
</main>
