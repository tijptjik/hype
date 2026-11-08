<script lang="ts">
// I18N
import { m } from '#lib/i18n.js'

let {
  problem,
  telephone = '',
}: {
  problem?: 'invalid' | 'in-use'
  telephone?: string
} = $props()
</script>

<main
  class="bg-background text-foreground flex min-h-screen items-center justify-center p-6"
>
  <form method="POST" class="w-full max-w-sm rounded-2xl border border-current/15 p-6">
    <h1 class="text-xl font-semibold">{m.breadline__phone_title()}</h1>
    <p class="mt-3 text-sm opacity-75">{m.breadline__phone_description()}</p>
    <label class="mt-5 flex flex-col gap-2 text-sm">
      {m.breadline__phone_label()}
      <input
        class="rounded-lg border border-current/20 bg-transparent px-3 py-2"
        type="tel"
        name="telephone"
        autocomplete="tel"
        maxlength="64"
        value={telephone}
        placeholder="+852 9123 4567"
        required
        aria-invalid={problem ? 'true' : undefined}
        aria-describedby={problem ? 'phone-problem' : undefined}
      >
    </label>
    {#if problem}
      <p id="phone-problem" role="alert" class="mt-3 text-sm text-red-500">
        {problem === 'in-use'
          ? m.breadline__phone_in_use()
          : m.breadline__phone_invalid()}
      </p>
    {/if}
    <button
      class="bg-primary text-primary-content mt-4 w-full rounded-lg px-4 py-2"
      type="submit"
    >
      {m.breadline__phone_continue()}
    </button>
  </form>
</main>
