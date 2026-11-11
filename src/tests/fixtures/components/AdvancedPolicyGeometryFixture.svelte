<script lang="ts">
import FormSurface from '#lib/bits/patterns/forms/formSurface/FormSurface.svelte'
import { m } from '#lib/i18n.js'
import { SectionHeader } from '#lib/bits/custom/form/index.js'
import PolicySelect from '#lib/bits/patterns/forms/locationUpdatePolicy/PolicySelect.svelte'
import RelocationPolicySection from '#lib/bits/patterns/forms/locationUpdatePolicy/RelocationPolicySection.svelte'
import DescriptionsIcon from 'virtual:icons/lucide/file-text'
let isEditing = $state(false)
const canEditLayerFields = true
const selectedParentProject = true
const projectFeaturePolicy = { allowDescriptions: true, locationBasedNames: false }
const formCtx = { submitting: false }
let policies = $state<Record<string, boolean | undefined>>({})
function setFeaturePolicyOverride(key: string, value: string) {
  policies[key] = value === '' ? undefined : value === 'true'
}
let relocation = $state<'fixed' | 'review' | 'follow' | null>('fixed')
</script>
<button type="button" onclick={() => (isEditing = !isEditing)}>Toggle editing</button>
<div class="bits-theme bg-background text-foreground" data-policy-surface>
  <div class="bits-admin-shell__main">
    <FormSurface>
      <section class="flex min-h-0 flex-col gap-6 pb-6">
        <SectionHeader
          title={m.feature_policy_descriptions_heading()}
          icon={DescriptionsIcon}
          description={m.feature_policy_descriptions_subtitle()}
        />
        <div
          class="mx-6 grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,max(480px,calc((100%_-_2rem)/2))),1fr))] gap-8"
        >
          {#each [
            {
              key: 'allowFeatureDescriptions',
              label: m.feature_policy_descriptions(),
              projectDefault: projectFeaturePolicy.allowDescriptions,
            },
            {
              key: 'locationBasedFeatureNames',
              label: m.feature_policy_location_names(),
              projectDefault: projectFeaturePolicy.locationBasedNames,
            },
          ] as setting (setting.key)}
            {@const policyValue = policies[setting.key]}
            <div
              class="flex min-w-0 flex-wrap items-center gap-4 rounded-xl border border-[var(--form-control-border)] bg-[var(--form-control-edit-fill)] px-5 py-3"
            >
              <h3
                class="min-w-0 flex-1 basis-48 text-sm font-semibold break-words whitespace-normal"
              >
                {setting.label}
              </h3>
              <div
                class="ml-auto flex max-w-full min-w-0 flex-wrap items-center justify-end gap-x-6 gap-y-2"
              >
                {#if selectedParentProject}
                  <p
                    class="text-muted-foreground flex flex-wrap items-baseline gap-x-2 border-r border-[var(--form-control-border)] pr-6 text-sm"
                  >
                    <span>{m.location_policy_project_default({ policy: '' })}</span>
                    <span class="text-foreground font-medium">
                      {setting.projectDefault
                        ? m.feature_policy_enabled()
                        : m.feature_policy_disabled()}
                    </span>
                  </p>
                {/if}
                <PolicySelect
                  label={setting.label}
                  value={policyValue == null ? 'inherit' : String(policyValue)}
                  items={[
                    { value: 'inherit', label: m.location_policy_inherit() },
                    { value: 'true', label: m.feature_policy_enabled() },
                    { value: 'false', label: m.feature_policy_disabled() },
                  ]}
                  isEditing={isEditing && canEditLayerFields}
                  disabled={formCtx.submitting}
                  onValueChange={value =>
                    setFeaturePolicyOverride(
                      setting.key as
                        | 'allowFeatureDescriptions'
                        | 'locationBasedFeatureNames',
                      value === 'inherit' ? '' : value,
                    )}
                />
              </div>
            </div>
          {/each}
        </div>
      </section>
      <RelocationPolicySection
        value={relocation}
        inherited="review"
        allowInherit
        {isEditing}
        onValueChange={value => (relocation = value)}
      />
    </FormSurface>
  </div>
</div>
