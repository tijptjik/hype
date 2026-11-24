<script lang="ts">
// I18N
import { t } from './i18n'

let { url }: { url: string } = $props()
let host: HTMLDivElement
let failed = $state(false)
let loading = $state(true)
let attempt = $state(0)

$effect(() => {
  const container = host
  const source = url
  attempt
  const controller = new AbortController()
  const { signal } = controller
  const objects: string[] = []
  loading = true
  failed = false

  // Texture loaders can bypass fetch in a WebView. Resolve all siblings with the device session first.
  function objectUrl(blob: Blob): string {
    signal.throwIfAborted()
    const result = URL.createObjectURL(blob)
    objects.push(result)
    return result
  }

  async function load(): Promise<void> {
    const [, response] = await Promise.all([
      import('@google/model-viewer'),
      fetch(source, { signal }),
    ])
    if (!response.ok) throw new Error('Model unavailable')
    const model = await response.json()
    const resources: { uri?: string }[] = [
      ...(model.buffers ?? []),
      ...(model.images ?? []),
    ]
    const siblings = new Map<string, string>()
    const base = new URL(source, location.href)
    for (const resource of resources) {
      if (!resource.uri || resource.uri.startsWith('data:')) continue
      const file = resource.uri
      if (!/^[a-zA-Z0-9_.-]+\.(bin|jpe?g|png)$/i.test(file))
        throw new Error('Invalid model resource')
      let local = siblings.get(file)
      if (!local) {
        const asset = await fetch(new URL(file, base), { signal })
        if (!asset.ok) throw new Error('Model resource unavailable')
        local = objectUrl(await asset.blob())
        siblings.set(file, local)
      }
      resource.uri = local
    }

    const viewer = document.createElement('model-viewer')
    viewer.setAttribute('alt', t('building_model'))
    viewer.setAttribute('camera-controls', '')
    viewer.setAttribute('loading', 'eager')
    viewer.className = 'h-full w-full'
    viewer.addEventListener(
      'load',
      () => {
        loading = false
      },
      { signal },
    )
    viewer.addEventListener(
      'error',
      () => {
        failed = true
        loading = false
      },
      { signal },
    )
    viewer.setAttribute(
      'src',
      objectUrl(new Blob([JSON.stringify(model)], { type: 'model/gltf+json' })),
    )
    container.replaceChildren(viewer)
  }
  void load().catch(() => {
    if (!signal.aborted) {
      failed = true
      loading = false
    }
  })
  return () => {
    controller.abort()
    container.replaceChildren()
    for (const object of objects) URL.revokeObjectURL(object)
  }
})
</script>

<div class="bg-surface relative h-[38dvh] min-h-52 overflow-hidden rounded-xl">
  <div bind:this={host} class="h-full w-full"></div>
  {#if loading}
    <div
      class="bg-panel absolute inset-0 animate-pulse"
      role="status"
      aria-label={t('loading_building_model')}
    ></div>
  {:else if failed}
    <div class="absolute inset-0 grid place-content-center gap-2 px-4">
      <p role="alert">{t('building_model_failed')}</p>
      <button
        type="button"
        class="border-line min-h-12 rounded-xl border"
        onclick={() => attempt++}
      >
        {t('retry')}
      </button>
    </div>
  {/if}
</div>
