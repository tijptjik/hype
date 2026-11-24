<script lang="ts">
// SVELTE
import { onMount } from 'svelte'
// I18N
import { t } from './i18n'
// COMPONENTS
import Choice from './Choice.svelte'
// PREFERENCES
import { preferences, setPreferences, type RecorderTheme } from './preferences.svelte'
let {
  view,
  account = null,
  onSignOut,
}: {
  view: string
  account?: { name: string | null; image?: string | null; email?: string | null } | null
  onSignOut?: () => Promise<void>
} = $props()
let open = $state(false)
let avatarFailed = $state(false)
$effect(() => {
  account?.image
  avatarFailed = false
})
let signingOut = $state(false)
let failure = $state('')
let dialog: HTMLDialogElement
$effect(() => {
  if (open && !dialog.open) dialog.showModal()
  else if (!open && dialog.open) dialog.close()
})
async function signOut(): Promise<void> {
  if (!onSignOut || signingOut) return
  signingOut = true
  failure = ''
  try {
    await onSignOut()
    open = false
  } catch {
    failure = t('could_not_sign_out_check_your_connection_and_try_again')
  } finally {
    signingOut = false
  }
}
let hidden = $state(false)
let previous = 0
let distance = 0
$effect(() => {
  view
  hidden = false
  distance = 0
})
onMount(() => {
  previous = window.scrollY
  function scroll(): void {
    const position = Math.max(
      0,
      Math.min(
        window.scrollY,
        document.documentElement.scrollHeight - window.innerHeight,
      ),
    )
    const delta = position - previous
    previous = position
    if (Math.sign(delta) !== Math.sign(distance)) distance = 0
    distance += delta
    if (position < 16) hidden = false
    else if (Math.abs(distance) > 12) hidden = distance > 0
  }
  window.addEventListener('scroll', scroll, { passive: true })
  return () => window.removeEventListener('scroll', scroll)
})
</script>

<nav
  aria-label={t('main_menu')}
  class={[
    'border-line bg-canvas/95 fixed inset-x-0 bottom-0 z-20 mx-auto flex max-w-lg justify-end border-t px-5 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] transition-transform duration-200 motion-reduce:transition-none',
    hidden ? 'translate-y-full' : 'translate-y-0',
  ]}
  inert={hidden}
>
  <button
    type="button"
    aria-label={t('user')}
    onclick={() => (open = true)}
    aria-haspopup="dialog"
    class="text-muted grid size-12 place-items-center rounded-xl"
  >
    {#if account?.image && !avatarFailed}
      <img
        src={account.image}
        alt=""
        onerror={() => (avatarFailed = true)}
        class="size-10 rounded-full object-cover"
      >
    {:else}
      <svg
        aria-hidden="true"
        width="26"
        height="26"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.7"
      >
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21v-2a8 8 0 0 1 16 0v2" />
      </svg>
    {/if}
  </button>
</nav>

<dialog
  bind:this={dialog}
  onclose={() => (open = false)}
  class="border-line bg-panel text-ink m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-sm overflow-y-auto rounded-2xl border p-6 backdrop:bg-black/60"
  aria-labelledby="account-title"
>
  <div class="flex items-center justify-between gap-3">
    <h2 id="account-title" class="text-xl font-semibold">{t('account')}</h2>
    <button
      type="button"
      onclick={() => (open = false)}
      class="min-h-12 px-3"
      aria-label={t('close_account')}
    >
      ✕
    </button>
  </div>
  {#if account?.image && !avatarFailed}
    <img
      src={account.image}
      alt=""
      onerror={() => (avatarFailed = true)}
      class="my-3 size-16 rounded-full object-cover"
    >
  {/if}
  <p class="text-lg break-words">
    {account?.name || account?.email || t('hype_contributor')}
  </p>
  {#if account?.email && account.email !== account.name}
    <p class="text-muted break-words">{account.email}</p>
  {/if}
  <div class="border-line mt-6 grid gap-5 border-t pt-5">
    <Choice
      label={t('appearance')}
      value={preferences.theme}
      options={[
        { value: 'breadline-light', label: t('light_milque') },
        { value: 'hype-dark', label: t('dark_nebula') },
      ]}
      onchange={value => setPreferences(value as RecorderTheme)}
    />
    <label class="text-muted grid gap-2 text-sm"
      >{t('language')}
      <select
        aria-label={t('language')}
        value={preferences.language}
        onchange={() => setPreferences(preferences.theme, 'en')}
        class="border-line bg-surface text-ink min-h-12 rounded-xl border px-3"
      >
        <option value="en">{t('english')}</option>
      </select>
    </label>
  </div>
  <button
    type="button"
    disabled={signingOut || !onSignOut}
    onclick={signOut}
    class="bg-accent text-on-accent mt-5 min-h-12 w-full rounded-xl px-4 font-semibold disabled:opacity-50"
  >
    {t('sign_out')}
  </button>
  {#if failure}
    <p role="alert" class="text-danger mt-3">{failure}</p>
  {/if}
</dialog>
