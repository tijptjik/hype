<script lang="ts">
// ICONS
import PhoneIcon from 'virtual:icons/lucide/phone'
import LinkIcon from 'virtual:icons/lucide/link'
import AtIcon from 'virtual:icons/lucide/at-sign'
import PlusIcon from 'virtual:icons/lucide/plus'
import RemoveIcon from 'virtual:icons/lucide/x'
// I18N
import { m } from '#lib/i18n.js'
// COMPONENTS
import LinkedFieldToggle from '../linkedFields/LinkedFieldToggle.svelte'
import FeatureFieldPhone from '../formFeatureField/components/FeatureFieldPhone.svelte'
// CONTEXT
import { getLinkedFields } from '../linkedFields/linkedFields.svelte.js'
// TYPES
import type { LocationProfileEdit } from '#lib/locations/profileEdit.js'
let {
  value,
  isEditing,
  onChange,
}: {
  value: Pick<LocationProfileEdit['values'], 'websites' | 'socials'> & {
    phoneNumber?: string[] | null
  }
  isEditing: boolean
  onChange: (value: LocationProfileEdit['values']) => void
} = $props()
const editor = getLinkedFields()
const uid = $props.id()
const contactFields = ['phoneNumber', 'websites', 'socials'] as const
// Legacy mixed assignments remain intact until the whole section is explicitly changed.
const visible = $derived(
  !editor?.available() ||
    !editor.expanded ||
    contactFields.some(field => editor.visible(field)),
)
const websites = $derived(value.websites ?? [])
const socials = $derived(Object.entries(value.socials ?? {}))
/** Rename a platform without overwriting another contact.
 * @param index Edited row. @param input Active platform input. @returns Nothing.
 */
function renameSocial(index: number, input: HTMLInputElement): void {
  if (socials.some(([service], i) => i !== index && service === input.value)) {
    input.value = socials[index][0]
    return
  }
  onChange({
    socials: Object.fromEntries(
      socials.map((entry, i) => (i === index ? [input.value, entry[1]] : entry)),
    ),
  })
}
</script>

<section
  hidden={!visible}
  class="col-span-6 min-w-0 space-y-5"
  aria-label={m.location_communications()}
>
  <h3 class="flex items-center gap-2 text-base font-semibold">
    {m.location_communications()}<LinkedFieldToggle
      field="phoneNumber"
      fields={['phoneNumber', 'websites', 'socials']}
      label={m.location_communications()}
    />
  </h3>
  <div class="min-w-0 space-y-2">
    <h4 class="flex items-center gap-2 text-sm font-semibold">
      <PhoneIcon class="size-4" aria-hidden="true" />
      {m.location_field_phone()}
    </h4>
    <FeatureFieldPhone
      id={`${uid}-phone`}
      value={JSON.stringify(value.phoneNumber ?? [])}
      {isEditing}
      onChange={text => onChange({ phoneNumber: JSON.parse(text) })}
    />
  </div>
  <div class="min-w-0 space-y-2">
    <h4 class="flex items-center gap-2 text-sm font-semibold">
      <LinkIcon class="size-4" aria-hidden="true" />
      {m.location_websites()}
    </h4>
    {#each websites as url, index}
      <div class="flex min-w-0 items-center gap-2">
        <input
          aria-label={`${m.location_websites()} ${index + 1}`}
          type="url"
          value={url}
          readonly={!isEditing}
          class="border-border min-w-0 flex-1 rounded-md border bg-transparent px-3 py-2"
          oninput={event =>
            onChange({
              websites: websites.map((value, i) =>
                i === index ? event.currentTarget.value : value,
              ),
            })}
        >
        {#if isEditing}
          <button
            type="button"
            aria-label={m.location_remove_contact()}
            onclick={() =>
              onChange({ websites: websites.filter((_, i) => i !== index) })}
          >
            <RemoveIcon class="size-4" />
          </button>
        {/if}
      </div>
    {/each}
    {#if isEditing}
      <button
        type="button"
        class="text-primary inline-flex items-center gap-2 text-sm"
        onclick={() => onChange({ websites: [...websites, ''] })}
      >
        <PlusIcon class="size-4" />{m.location_add_website()}
      </button>
    {/if}
  </div>
  <div class="min-w-0 space-y-2">
    <h4 class="flex items-center gap-2 text-sm font-semibold">
      <AtIcon class="size-4" aria-hidden="true" />
      {m.location_socials()}
    </h4>
    {#each socials as [service, url], index}
      <div class="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-2">
        <div class="grid min-w-0 gap-2">
          <input
            aria-label={m.location_social_service()}
            value={service}
            readonly={!isEditing}
            class="border-border min-w-0 rounded-md border bg-transparent px-3 py-2"
            oninput={event => renameSocial(index, event.currentTarget)}
          >
          <input
            aria-label={`${m.location_socials()} ${index + 1}`}
            type="url"
            value={url}
            readonly={!isEditing}
            class="border-border min-w-0 rounded-md border bg-transparent px-3 py-2"
            oninput={event =>
              onChange({
                socials: Object.fromEntries(
                  socials.map((entry, i) =>
                    i === index ? [service, event.currentTarget.value] : entry,
                  ),
                ),
              })}
          >
        </div>
        {#if isEditing}
          <button
            type="button"
            aria-label={m.location_remove_contact()}
            onclick={() =>
              onChange({
                socials: Object.fromEntries(socials.filter((_, i) => i !== index)),
              })}
          >
            <RemoveIcon class="size-4" />
          </button>
        {/if}
      </div>
    {/each}
    {#if isEditing}
      <button
        type="button"
        class="text-primary inline-flex items-center gap-2 text-sm"
        disabled={socials.some(([service, url]) => !service || !url)}
        onclick={() => onChange({ socials: { ...value.socials, '': '' } })}
      >
        <PlusIcon class="size-4" />{m.location_add_social()}
      </button>
    {/if}
  </div>
</section>
