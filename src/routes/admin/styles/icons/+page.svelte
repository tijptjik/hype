<script lang="ts">
// BITS COMPONENTS
import { Button } from '$lib/bits'

// COMPONENTS
import Icon from '$lib/components/common/Icon.svelte'

// DATA
import { ICON_USAGES, ICON_USAGE_EXPORT, TOTAL_IMPORT_SITES } from './icon-usage'

let copyState = $state<'idle' | 'copied' | 'error'>('idle')

async function copyMapping(): Promise<void> {
  try {
    await navigator.clipboard.writeText(ICON_USAGE_EXPORT)
    copyState = 'copied'
    setTimeout(() => {
      copyState = 'idle'
    }, 2000)
  } catch {
    copyState = 'error'
    setTimeout(() => {
      copyState = 'idle'
    }, 2000)
  }
}
</script>

<main class="h-full overflow-y-auto p-6">
  <section
    class="bits-theme space-y-6 rounded-xl border border-base-300 bg-base-100 p-6"
  >
    <div
      class="flex flex-col gap-4 border-b border-base-300 pb-6 lg:flex-row lg:items-end lg:justify-between"
    >
      <div class="space-y-2">
        <h1 class="text-2xl font-semibold text-foreground">Lucide Usage Audit</h1>
        <p class="max-w-3xl text-sm text-foreground-alt">
          This page audits every Lucide icon currently imported in the app, shows the
          rendered icon, and tracks how many import sites and files use it.
        </p>
        <p class="text-xs uppercase tracking-[0.2em] text-foreground-alt">
          {ICON_USAGES.length}
          unique icons across {TOTAL_IMPORT_SITES} import sites
        </p>
      </div>

      <div class="flex flex-wrap items-center gap-3">
        <Button text="Copy usage export" color="primary" onClick={copyMapping} />
        <span class="text-sm text-foreground-alt">
          {#if copyState === 'copied'}
            Copied icon usage export
          {:else if copyState === 'error'}
            Clipboard write failed
          {:else}
            Export includes import name, path, and usage counts
          {/if}
        </span>
      </div>
    </div>

    <div class="flex flex-wrap gap-4">
      {#each ICON_USAGES as icon}
        <article
          class="flex w-full max-w-[24rem] flex-1 flex-col gap-4 rounded-2xl border border-base-300 bg-base-50 p-4 shadow-sm"
        >
          <div class="flex items-start justify-between gap-3">
            <div>
              <h2 class="font-mono text-sm font-semibold text-foreground">
                {icon.name}
              </h2>
              <p class="mt-1 break-all text-[11px] text-foreground-alt">
                {icon.importPath}
              </p>
            </div>
            <div class="flex flex-col items-end gap-2">
              <span
                class="rounded-full border border-base-300 bg-base-100 px-2 py-1 text-xs text-foreground-alt"
              >
                {icon.usageCount}
                import{icon.usageCount === 1 ? '' : 's'}
              </span>
              <span
                class="rounded-full border border-base-300 bg-base-100 px-2 py-1 text-xs text-foreground-alt"
              >
                {icon.fileCount}
                file{icon.fileCount === 1 ? '' : 's'}
              </span>
            </div>
          </div>

          <div
            class="flex h-28 items-center justify-center rounded-xl border border-dashed border-success/30 bg-base-100 text-success"
          >
            <Icon src={icon.component} class="h-16 w-16" size="64px" />
          </div>

          <div class="space-y-2 rounded-xl border border-base-300 bg-base-100 p-3">
            <p
              class="text-[11px] font-semibold uppercase tracking-[0.18em] text-foreground-alt"
            >
              Local Names
            </p>
            <div class="flex flex-wrap gap-2">
              {#each icon.localNames as localName}
                <span
                  class="rounded-full border border-base-300 bg-base-50 px-2 py-1 font-mono text-[11px] text-foreground-alt"
                >
                  {localName}
                </span>
              {/each}
            </div>
          </div>
        </article>
      {/each}
    </div>
  </section>
</main>
