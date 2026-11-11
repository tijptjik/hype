<script lang="ts">
// SVELTE
import { onMount, untrack } from 'svelte'
import { fade } from 'svelte/transition'
// THIRD-PARTY
import { draggable, droppable, dndState, type DragDropState } from '@thisux/sveltednd'
import GripIcon from 'virtual:icons/lucide/grip-vertical'
import TrashIcon from 'virtual:icons/lucide/trash-2'
import ImageIcon from 'virtual:icons/lucide/image'
import InfoIcon from 'virtual:icons/lucide/info'
import EyeIcon from 'virtual:icons/lucide/eye'
import LayersIcon from 'virtual:icons/lucide/layers'
// SERVICES
import { getDropIndex } from '#lib/client/services/dragDrop.js'
// REMOTE
import { getImageIntentSettings } from '#lib/api/imageIntents.remote.js'
import { refreshRemoteQuery } from '#lib/remote/index.js'
// BITS COMPONENTS
import { SectionHeader } from '#lib/bits/custom/form/index.js'
import { SimpleTooltip } from '#lib/bits/core/index.js'
import Button from '#lib/bits/core/button/Button.svelte'
import Switch from '#lib/bits/custom/switch/Switch.svelte'
import * as Card from '#lib/bits/custom/card/index.js'
import ChoiceDialog from '#lib/bits/core/dialog/ChoiceDialog.svelte'
// DOMAIN
import { DEFAULT_IMAGE_INTENTS, IMAGE_INTENT_ROLES } from '#lib/images/intents.js'
// TYPES
import type { ImageIntentDefinition } from '#lib/images/intents.js'

let {
  scopeType,
  scopeId,
  loadingOnly = false,
  disabled = false,
  resetVersion = 0,
  onChange,
}: {
  scopeType: 'hub' | 'project'
  scopeId: string
  /** Render the pending owner layout without requesting settings. */
  loadingOnly?: boolean
  disabled?: boolean
  resetVersion?: number
  onChange?: (value: string | undefined) => void
} = $props()
let intents = $state<ImageIntentDefinition[]>([])
let inherited = $state(false)
let automatic = $state(true)
let usage = $state<Record<string, number>>({})
let version = $state(-1)
let hubVersion = $state(-1)
let loading = $state(true)
let changed = $state(false)
let message = $state('')
let reassignments = $state<Record<string, string>>({})
let removing = $state<ImageIntentDefinition | null>(null)
let replacement = $state('undefined')
let inheritedIntents = $state<ImageIntentDefinition[]>([])
let request = 0
let motionDuration = $state(160)
onMount(() => {
  const preference = window.matchMedia('(prefers-reduced-motion: reduce)')
  const sync = (): void => {
    motionDuration = preference.matches ? 0 : 160
  }
  sync()
  preference.addEventListener('change', sync)
  return () => preference.removeEventListener('change', sync)
})
const instanceId = $props.id()
const container = `image-intents-${instanceId}`
const locked = $derived(disabled || loading)
const catalogueLocked = $derived(locked || inherited)
const role = (id: string): string | undefined =>
  IMAGE_INTENT_ROLES[id as keyof typeof IMAGE_INTENT_ROLES]

/** Loads settings for this owner without allowing late responses to replace another editor. */
async function load(): Promise<void> {
  const serial = ++request
  loading = true
  message = ''
  try {
    const value = await refreshRemoteQuery(
      getImageIntentSettings({ type: scopeType, id: scopeId }),
    )
    if (serial !== request) return
    intents = structuredClone(value.intents)
    inheritedIntents = structuredClone(value.hubIntents)
    inherited = value.inherited
    automatic = value.autoPublishUnclassified
    usage = value.usage
    version = value.version
    hubVersion = value.hubVersion
    reassignments = {}
    changed = false
  } catch (cause) {
    if (serial === request)
      message =
        cause instanceof Error ? cause.message : 'Could not load image settings.'
  } finally {
    if (serial === request) loading = false
  }
}

$effect(() => {
  if (loadingOnly) return
  scopeId
  scopeType
  resetVersion
  // Only owner identity and explicit reset/save invalidate this editor.
  untrack(() => {
    void load()
  })
  return () => {
    request++
  }
})

/**
 * Reorders the staged catalogue using the same drop-edge semantics as Layers.
 * @param state Current drag state.
 * @param targetId Intent receiving the drop.
 * @returns Nothing; the owning form saves the resulting order.
 */
function handleDrop(state: DragDropState, targetId: string): void {
  if (catalogueLocked) return
  const ids = intents.map(intent => intent.id)
  const destination = getDropIndex(state, ids, targetId, container)
  if (destination === null) return
  const dragged = state.draggedItem as { id: string }
  const next = [...intents]
  const [item] = next.splice(ids.indexOf(dragged.id), 1)
  next.splice(destination, 0, item)
  intents = next
  changed = true
}

/** Records an explicit reassignment; persistence happens with the complete settings save. */
function remove(target: string): void {
  if (!removing || role(removing.id)) return
  reassignments = { ...reassignments, [removing.id]: target }
  usage[target] = (usage[target] ?? 0) + (usage[removing.id] ?? 0)
  for (const [id, replacementId] of Object.entries(reassignments))
    if (replacementId === removing.id) reassignments[id] = target
  intents = intents.filter(intent => intent.id !== removing?.id)
  removing = null
  changed = true
}

// Stage edits in the owning resource form; its Save and Reset actions own persistence.
$effect(() => {
  if (loading) return
  const draft = changed
    ? JSON.stringify({
        version,
        hubVersion,
        intents: inherited ? null : intents,
        autoPublishUnclassified: automatic,
        reassignments,
      })
    : undefined
  untrack(() => onChange?.(draft))
})
</script>

<section
  class="flex w-full min-w-0 flex-col"
  aria-label="Image intents"
  aria-busy={loading}
  inert={loadingOnly}
>
  <SectionHeader
    showControlLabels
    title="Image Intent"
    icon={ImageIcon}
    description="Intent determines public visibility. Order these intents to organise the gallery."
  >
    {#snippet right()}
      <div class="flex w-full items-center justify-end gap-3">
        <div class="flex min-h-11 w-32 items-center justify-end">
          {#if !inherited}
            <div transition:fade={{ duration: motionDuration }} inert={inherited}>
              <Button
                text="Add Intent"
                style="outline"
                disabled={catalogueLocked}
                onClick={() => {
                  intents = [
                    ...intents,
                    {
                      id: `intent_${crypto.randomUUID()}`,
                      label: 'New intent',
                      isPublished: false,
                    },
                  ]
                  changed = true
                }}
              />
            </div>
          {/if}
        </div>
        <SimpleTooltip
          contentProps={{ role: 'tooltip' }}
          contentClass="w-[360px] max-w-[calc(100vw-2rem)]!"
          triggerClass="flex items-center"
        >
          {#snippet trigger()}
            <button
              type="button"
              aria-label="About image intent visibility"
              class="text-muted-foreground hover:text-foreground focus-visible:outline-primary inline-flex size-7 shrink-0 items-center justify-center rounded-full focus-visible:outline-2"
            >
              <InfoIcon class="size-4" aria-hidden="true" />
            </button>
          {/snippet}
          <div class="flex min-w-0 flex-col gap-3 text-sm leading-5">
            <p class="font-semibold">How image intents work</p>
            <p>An intent describes an image’s role and controls its visibility.</p>
            <div>
              <p class="mb-1 flex items-center gap-2 font-semibold">
                <EyeIcon class="size-4 shrink-0" aria-hidden="true" />Visibility
              </p>
              <ul class="list-disc space-y-1 pl-5">
                <li><strong>Public:</strong> visible when the Feature is published.</li>
                <li><strong>Internal:</strong> stays private.</li>
              </ul>
            </div>
            <div>
              <p class="mb-1 flex items-center gap-2 font-semibold">
                <ImageIcon class="size-4 shrink-0" aria-hidden="true" />Permanent roles
              </p>
              <ul class="list-disc space-y-1 pl-5">
                <li><strong>Featured:</strong> the cover image.</li>
                <li><strong>Catch-All:</strong> the default public category.</li>
                <li><strong>Unclassified:</strong> stays private.</li>
              </ul>
            </div>
            <div>
              <p class="mb-1 flex items-center gap-2 font-semibold">
                <LayersIcon class="size-4 shrink-0" aria-hidden="true" />Gallery
                configuration
              </p>
              <ul class="list-disc space-y-1 pl-5">
                <li>Intent order organises the gallery.</li>
                <li>Projects inherit the Hub’s intents or customise their own.</li>
              </ul>
            </div>
          </div>
        </SimpleTooltip>
      </div>
    {/snippet}
  </SectionHeader>
  <div class="flex min-w-0 flex-col gap-5 p-6">
    {#if scopeType === 'project'}
      <div
        class="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,max(480px,calc((100%_-_2rem)/2))),1fr))] gap-x-8 gap-y-3"
      >
        <Card.Root
          size="md"
          class="border-border bg-foreground/4 min-h-14 rounded-lg border bg-none shadow-none before:hidden"
        >
          <label
            for={`automatic-${scopeId}`}
            class="flex min-w-0 flex-1 flex-col justify-center px-5 py-3 text-sm font-semibold"
          >
            <span>Automatically publish all unclassified images</span>
            <span class="text-muted-foreground mt-1 block text-xs font-normal">
              New uploads are assigned to
              {intents.find(intent => intent.id === 'general')?.label ?? 'General'}.
              Contributor photos still require approval.
            </span>
          </label>
          <Card.Actions
            padding="md"
            bg="none"
            class="border-border/60 w-auto! min-w-0! shrink-0 border-l"
          >
            <Switch
              id={`automatic-${scopeId}`}
              size="sm"
              checked={automatic}
              disabled={locked}
              onCheckedChange={value => {
                automatic = value === true
                changed = true
              }}
            />
          </Card.Actions>
        </Card.Root>
        <Card.Root
          size="md"
          class="border-border bg-foreground/4 min-h-14 rounded-lg border bg-none shadow-none before:hidden"
        >
          <label
            for={`inherit-${scopeId}`}
            class="flex min-w-0 flex-1 flex-col justify-center px-5 py-3 text-sm font-semibold"
          >
            <span>Inherit from Hub</span>
            <span class="text-muted-foreground mt-1 block text-xs font-normal">
              Turn off to customise a copy for this Project.
            </span>
          </label>
          <Card.Actions
            padding="md"
            bg="none"
            class="border-border/60 w-auto! min-w-0! shrink-0 border-l"
          >
            <Switch
              id={`inherit-${scopeId}`}
              size="sm"
              checked={inherited}
              disabled={locked}
              onCheckedChange={value => {
                inherited = value === true
                if (value) intents = structuredClone(inheritedIntents)
                changed = true
              }}
            />
          </Card.Actions>
        </Card.Root>
      </div>
    {/if}
    <!-- The pending catalogue shares the loaded row grid, including mobile action rows. -->
    <ol
      class="flex min-w-0 flex-col [--bits-dnd-gap:0px] {loading
        ? '[&_input]:text-transparent! [&_input]:bg-foreground/10! [&_input]:motion-safe:animate-pulse'
        : ''}"
      aria-hidden={loading}
      inert={loading}
    >
      {#each loading && intents.length === 0
        ? DEFAULT_IMAGE_INTENTS
        : intents as intent (intent.id)}
        <!-- Each row owns its spacing so drop edges remain hittable, as in Layers. -->
        <li
          data-dnd-item
          data-dnd-active={dndState.isDragging}
          data-intent-id={intent.id}
          class="before:bg-foreground! after:bg-foreground! relative min-w-0 py-1.5 before:absolute before:top-0! after:absolute after:bottom-0!"
          use:draggable={{
            container: `${container}-${intent.id}`,
            containerGroup: container,
            dragData: { id: intent.id },
            disabled: catalogueLocked,
            keyboard: true,
            handle: '[data-intent-grip]',
            interactive: ['input', 'button', 'label'],
            attributes: { draggingClass: 'opacity-55' },
          }}
          use:droppable={{
            container: `${container}-${intent.id}`,
            containerGroup: container,
            disabled: catalogueLocked,
            callbacks: { onDrop: state => handleDrop(state, intent.id) },
          }}
        >
          <div
            class="bits-card border-border bg-foreground/4 grid! min-h-14 min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 rounded-lg border bg-none pl-10 shadow-none before:hidden lg:grid-cols-[minmax(0,1fr)_7rem_5rem_auto]"
            data-size="md"
            data-draggable={!catalogueLocked}
          >
            {#if !inherited}
              <button
                type="button"
                transition:fade={{ duration: motionDuration }}
                inert={inherited}
                data-intent-grip
                tabindex={catalogueLocked ? -1 : 0}
                aria-label={`Reorder ${intent.label}`}
                aria-disabled={catalogueLocked}
                title="Drag to reorder; use Space and arrow keys with the keyboard"
                class="bits-card__drag-handle focus-visible:outline-primary focus-visible:outline-2"
                class:cursor-grab={!catalogueLocked}
                class:opacity-30={catalogueLocked}
              >
                <GripIcon class="size-5" />
              </button>
            {/if}
            <div class="col-span-2 grid min-w-0 pr-3 lg:col-span-1 lg:pr-0">
              {#if inherited}
                <span
                  transition:fade={{ duration: motionDuration }}
                  aria-hidden={!inherited}
                  class="col-start-1 row-start-1 my-2 block border border-transparent px-3 py-2 text-sm font-semibold break-words"
                  >{intent.label}</span
                >
              {:else}
                <input
                  transition:fade={{ duration: motionDuration }}
                  inert={inherited}
                  id={`intent-${scopeId}-${intent.id}`}
                  aria-label={`${intent.label} label`}
                  class="focus-visible:outline-primary enabled:hover:border-border-input enabled:focus:border-border-input col-start-1 row-start-1 my-2 w-full min-w-0 rounded-sm border border-transparent bg-transparent px-3 py-2 text-sm font-semibold focus-visible:outline-2"
                  bind:value={intent.label}
                  disabled={catalogueLocked}
                  oninput={() => (changed = true)}
                  onkeydown={event => {
                    if (event.key !== 'Enter' || event.isComposing) return
                    event.preventDefault()
                    event.stopPropagation()
                    event.currentTarget.blur()
                  }}
                >
              {/if}
            </div>
            <span
              class="text-primary min-w-0 pr-3 text-xs lg:pr-0"
              title={role(intent.id)
                ? 'Permanent role: can be renamed but cannot be deleted'
                : undefined}
              >{role(intent.id) ?? ''}</span
            >
            <span
              class="text-muted-foreground flex items-center justify-end gap-2 pr-3 text-xs tabular-nums lg:justify-start lg:pr-0"
              title="Affected images"
            >
              <ImageIcon class="size-4 shrink-0" />
              <span>{usage[intent.id] ?? 0}<span class="sr-only"> images</span></span>
            </span>
            <div
              class="border-border/60 col-span-2 flex min-h-14 items-center justify-end gap-3 px-3 py-2 lg:col-span-1 lg:border-l lg:px-4"
            >
              <div class="grid w-52 shrink-0 items-center">
                {#if inherited}
                  <span
                    transition:fade={{ duration: motionDuration }}
                    aria-hidden={!inherited}
                    class="text-muted-foreground col-start-1 row-start-1 text-right text-xs font-medium"
                    >{intent.isPublished ? 'Public' : 'Internal'}</span
                  >
                {:else}
                  <div
                    transition:fade={{ duration: motionDuration }}
                    inert={inherited}
                    class="col-start-1 row-start-1 flex items-center justify-end gap-3"
                  >
                    <div
                      class="[&_.bits-switch-label]:text-[10px] [&_.bits-switch-label]:font-medium [&_.bits-switch-label]:tracking-wider [&_.bits-switch-label]:uppercase"
                    >
                      <Switch
                        id={`public-${scopeId}-${intent.id}`}
                        size="sm"
                        leftText="Internal"
                        rightText="Public"
                        checked={intent.isPublished}
                        disabled={catalogueLocked ||
                          intent.id === 'undefined' ||
                          intent.id === 'general'}
                        onCheckedChange={value => {
                          intent.isPublished = value === true
                          changed = true
                        }}
                      />
                    </div>
                    <span class="flex size-8 shrink-0 items-center justify-center">
                      {#if !role(intent.id)}
                        <button
                          type="button"
                          aria-label={`Remove ${intent.label}`}
                          title={`Remove ${intent.label}`}
                          disabled={catalogueLocked}
                          class="text-muted-foreground hover:bg-base-200 focus-visible:outline-primary flex size-8 items-center justify-center rounded focus-visible:outline-2 disabled:opacity-30"
                          onclick={() => {
                            removing = intent
                            replacement = 'undefined'
                          }}
                        >
                          <TrashIcon class="size-4" />
                        </button>
                      {/if}
                    </span>
                  </div>
                {/if}
              </div>
            </div>
          </div>
        </li>
      {/each}
    </ol>
    {#if message}
      <p class="text-sm" role="status">{message}</p>
    {/if}
  </div>
</section>

{#if removing}
  <ChoiceDialog
    title={`Remove ${removing.label}?`}
    description={`${usage[removing.id] ?? 0} images use this intent. Choose another intent, keep them unclassified, or rename the intent instead.`}
    onCancel={() => (removing = null)}
  >
    <div class="flex flex-col gap-4">
      <label class="flex flex-col gap-2 text-sm"
        >Reassign images to
        <select
          bind:value={replacement}
          class="border-border-input bg-base-100 rounded-md border p-2"
        >
          {#each intents.filter(
            intent => intent.id !== removing?.id,
          ) as intent (intent.id)}
            <option value={intent.id}>{intent.label}</option>
          {/each}
        </select>
      </label>
      <div class="flex flex-wrap gap-2">
        <Button text="Reassign and remove" onClick={() => remove(replacement)} />
        <Button
          text="Make unclassified"
          style="outline"
          onClick={() => remove('undefined')}
        />
        <Button
          text="Rename instead"
          style="ghost"
          onClick={() => {
            const id = removing?.id
            removing = null
            document.getElementById(`intent-${scopeId}-${id}`)?.focus()
          }}
        />
      </div>
    </div>
  </ChoiceDialog>
{/if}
