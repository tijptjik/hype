<script lang="ts">
// CONTEXT
import type { ImportCtx } from '$lib/context/import.svelte'
// I18N
import { m } from '$lib/i18n'
// COMPONENTS
import {
  FormParentSection,
  type ParentSectionOrganisationItem,
  type ParentSectionProjectItem,
} from '$lib/bits/patterns/forms/formParentSection'
import ImportRows from '../../../shared/ImportRows.svelte'
import ImportRowCol from '../../../shared/ImportRowCol.svelte'
import ImportRowCols from '../../../shared/ImportRowCols.svelte'
import ColumnMappingRowLabel from './ColumnMappingRowLabel.svelte'
import ColumnMappingRowSelects from './ColumnMappingRowSelects.svelte'

type Props = {
  importCtx: ImportCtx
  selectedParentOrganisation: ParentSectionOrganisationItem | null
  selectedParentProject: ParentSectionProjectItem | null
  onSearchParentOrganisations: (
    query: string,
  ) => Promise<ParentSectionOrganisationItem[]>
  onReplaceParentOrganisation: (organisation: ParentSectionOrganisationItem) => void
  onRemoveParentOrganisation: () => void
  onSearchParentProjects: (query: string) => Promise<ParentSectionProjectItem[]>
  onReplaceParentProject: (project: ParentSectionProjectItem) => void
  onRemoveParentProject: () => void
}

let {
  importCtx,
  selectedParentOrganisation,
  selectedParentProject,
  onSearchParentOrganisations,
  onReplaceParentOrganisation,
  onRemoveParentOrganisation,
  onSearchParentProjects,
  onReplaceParentProject,
  onRemoveParentProject,
}: Props = $props()
</script>

<div class="space-y-5">
  <div class="grid flex-none grid-cols-1 gap-4 xl:grid-cols-2">
    <FormParentSection
      title={m.feature_import__parent_organisation_title()}
      subtitle={m.feature_import__parent_organisation_subtitle()}
      parent={selectedParentOrganisation}
      startInAddingMode={false}
      closeOnParentChange={true}
      onSearch={onSearchParentOrganisations}
      onReplaceParent={onReplaceParentOrganisation}
      onRemoveParent={onRemoveParentOrganisation}
    />
    <FormParentSection
      title={m.feature_import__parent_project_title()}
      subtitle={m.feature_import__parent_project_subtitle()}
      parent={selectedParentProject}
      startInAddingMode={false}
      searchScopeKey={selectedParentOrganisation?.id ?? 'all-projects'}
      closeOnParentChange={true}
      onSearch={onSearchParentProjects}
      onReplaceParent={onReplaceParentProject}
      onRemoveParent={onRemoveParentProject}
    />
  </div>

  <ImportRows class="px-0 pt-0" innerClass="space-y-4">
    {#each importCtx.getColumns() as column, index}
      <ImportRowCols cols={7}>
        <ImportRowCol span={2}>
          <ColumnMappingRowLabel {column} />
        </ImportRowCol>
        <ColumnMappingRowSelects {importCtx} {index} />
      </ImportRowCols>
    {/each}
  </ImportRows>
</div>
