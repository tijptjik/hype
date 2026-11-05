<script lang="ts">
// BITS COMPONENTS
import { SectionHeader } from '#lib/bits/custom/form/index.js'
import Switch from '#lib/bits/custom/switch/Switch.svelte'
// ICONS
import UsersIcon from 'virtual:icons/proicons/person-multiple'
// TYPES
import type { OrganisationUserPolicy } from '#lib/organisation-users/policy.js'

let {
  policy,
  hubId,
  hubDomain,
  disabled = false,
  onChange,
}: {
  policy: OrganisationUserPolicy
  hubId: string | null
  hubDomain: string | null
  disabled?: boolean
  onChange: (patch: Partial<OrganisationUserPolicy>) => void
} = $props()
const id = $props.id()
const rules = $derived([
  ...(hubId
    ? [
        {
          key: 'hubSignIn' as const,
          label: 'If the user signs in through the hub',
          description: '',
          checked: policy.hubSignIn,
          unavailable: false,
        },
        {
          key: 'emailDomain' as const,
          label: hubDomain
            ? `If the user's email address ends with @${hubDomain}`
            : 'If the user’s email address matches the hub domain',
          description: hubDomain
            ? 'The email address must be verified.'
            : 'Configure a domain on the hub to enable this option.',
          checked: policy.emailDomain !== null,
          unavailable: !hubDomain,
        },
      ]
    : []),
  {
    key: 'contribution' as const,
    label: 'If the user contributes to a project',
    description:
      'Submitting a feature, photo or missing report adds the user immediately, before review.',
    checked: policy.contribution,
    unavailable: false,
  },
  {
    key: 'customCard' as const,
    label: 'If the user triggers the onboarding step in the custom card',
    description: '',
    checked: policy.customCard,
    unavailable: false,
  },
])
</script>

<section class="border-border flex min-w-0 flex-col border-b lg:border-r lg:border-b-0">
  <SectionHeader
    icon={UsersIcon}
    title="Users"
    description="Choose how people become users of your organisation."
  />
  <div class="p-4 lg:p-6">
    <div
      class="divide-border/20 border-border bg-foreground/4 flex min-w-0 flex-col divide-y rounded-xl border px-5"
    >
      <div class="flex flex-wrap items-center justify-between gap-3 py-4">
        <div class="min-w-0 flex-1 basis-48">
          <label for={`${id}-enabled`} class="text-sm font-medium"
            >Enable Users specific to this Organisation</label
          >
          <p class="text-muted-foreground mt-1 text-xs">
            Users can join through any of the selected options.
          </p>
        </div>
        <Switch
          id={`${id}-enabled`}
          checked={policy.enabled}
          {disabled}
          onCheckedChange={checked => onChange({ enabled: checked === true })}
        />
      </div>
      {#if policy.enabled}
        {#each rules as rule (rule.key)}
          <div class="flex flex-wrap items-center justify-between gap-3 py-4">
            <div class="min-w-0 flex-1 basis-48">
              <label for={`${id}-${rule.key}`} class="text-sm font-medium"
                >{rule.label}</label
              >
              {#if rule.description}
                <p class="text-muted-foreground mt-1 text-xs">{rule.description}</p>
              {/if}
            </div>
            <Switch
              id={`${id}-${rule.key}`}
              checked={rule.checked}
              disabled={disabled || rule.unavailable}
              onCheckedChange={checked =>
                onChange({
                  [rule.key]:
                    rule.key === 'emailDomain'
                      ? checked
                        ? hubDomain
                        : null
                      : checked === true,
                })}
            />
          </div>
        {/each}
      {/if}
    </div>
  </div>
</section>
