<script lang="ts">
// CONTEXT
import { setResponsiveCtx } from '#lib/context/responsive.svelte.js'
// COMPONENTS
import FormProjectLicenseSection from '#lib/bits/patterns/forms/formProjectLicenseSection/FormProjectLicenseSection.svelte'
// SERVICES
import { createDefaultProjectLicense } from '#lib/client/services/licence.js'
setResponsiveCtx()
</script>
<div class="bits-theme p-6">
  <FormProjectLicenseSection
    title="Licence"
    subtitle="The following conditions apply"
    license={createDefaultProjectLicense()}
    choiceCards={[]}
    rightRows={[]}
    leafMediaTypes={['text', 'image', 'data']}
    useCustomLicenseLabels={false}
    customLicenseLabels={{ text: '', image: '', data: '' }}
    isEditing
    onApplyLicense={() => {}}
  />
</div>
