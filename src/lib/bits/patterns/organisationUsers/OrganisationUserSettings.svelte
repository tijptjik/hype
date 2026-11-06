<script lang="ts">
// BITS COMPONENTS
import { SectionHeader } from '#lib/bits/custom/form/index.js'
import Switch from '#lib/bits/custom/switch/Switch.svelte'
// ICONS
import SignInIcon from 'virtual:icons/proicons/arrow-enter'
import MailIcon from 'virtual:icons/proicons/mail'
import ContributionIcon from 'virtual:icons/proicons/add-square'
import CustomCardIcon from 'virtual:icons/proicons/cursor-click'
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
          label: 'Hub Sign-in',
          icon: SignInIcon,
          description: 'Add users when they sign in through the hub.',
          checked: policy.hubSignIn,
          unavailable: false,
        },
        {
          key: 'emailDomain' as const,
          label: 'Hub Domain Email',
          icon: MailIcon,
          description: hubDomain
            ? `Add users with a verified email address ending in @${hubDomain}.`
            : 'Configure a domain on the hub to enable this option.',
          checked: policy.emailDomain !== null,
          unavailable: !hubDomain,
        },
      ]
    : []),
  {
    key: 'contribution' as const,
    label: 'Project Contribution',
    icon: ContributionIcon,
    description:
      'Submitting a feature, photo or missing report adds the user immediately, before review.',
    checked: policy.contribution,
    unavailable: false,
  },
  {
    key: 'customCard' as const,
    label: 'Custom Card Trigger',
    icon: CustomCardIcon,
    description: 'Add users when they trigger the onboarding step in the custom card.',
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
    <div class="@container min-w-0 space-y-4">
      <div
        class="border-border bg-foreground/4 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 rounded-xl border px-5 py-4"
      >
        <div class="min-w-0">
          <label for={`${id}-enabled`} class="text-sm font-medium"
            >Enable Users specific to this Organisation</label
          >
          <p class="text-muted-foreground mt-1 text-xs">
            Keep a separate user list for this organisation.
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
        <fieldset
          {disabled}
          aria-labelledby={`${id}-join-options`}
          class="border-border bg-foreground/4 min-w-0 rounded-xl border px-5 py-4"
        >
          <h3 id={`${id}-join-options`} class="text-sm font-medium">How users join</h3>
          <p class="text-muted-foreground mt-1 text-xs">
            Users can join through any of the selected options.
          </p>
          <div class="mt-2 grid min-w-0 gap-x-6 @min-[38rem]:grid-cols-2">
            {#each rules as rule (rule.key)}
              <div
                class="border-border/20 grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-4 border-t py-4"
              >
                <div class="min-w-0 break-words whitespace-normal">
                  <label
                    for={`${id}-${rule.key}`}
                    class="flex items-start gap-2 text-sm font-medium"
                  >
                    <rule.icon
                      class="text-primary mt-0.5 size-4 shrink-0"
                      aria-hidden="true"
                    />
                    <span class="min-w-0">{rule.label}</span>
                  </label>
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
          </div>
        </fieldset>
      {/if}
    </div>
  </div>
</section>
