<script lang="ts">
// I18N
import { m } from '#lib/i18n.js'
// BITS COMPONENTS
import Switch from '#lib/bits/custom/switch/Switch.svelte'

let {
  permitted = false,
  canManage = false,
  disabled = false,
  onChange,
}: {
  permitted?: boolean
  canManage?: boolean
  disabled?: boolean
  onChange: (permitted: boolean) => void
} = $props()
const id = $props.id()
</script>

<div class="min-w-0">
  <div
    class="border-border bg-foreground/4 flex min-w-0 flex-col rounded-xl border px-5"
  >
    <div class="flex flex-wrap items-center justify-between gap-3 py-4">
      <div class="min-w-0 flex-1 basis-48">
        <label for={id} class="text-sm font-medium"
          >{m.organisation_permission_user_details()}</label
        >
        <p class="text-muted-foreground mt-1 text-xs">
          {m.organisation_permission_user_details_description()}
        </p>
        <p class="text-muted-foreground mt-1 text-xs">
          {m.organisation_permissions_superadmin_only()}
        </p>
      </div>
      <div class="shrink-0">
        <Switch
          {id}
          checked={permitted}
          disabled={disabled || !canManage}
          onCheckedChange={checked => onChange(checked === true)}
        />
      </div>
    </div>
  </div>
</div>
