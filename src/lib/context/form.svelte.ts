// TYPES
import type { SuperValidated } from 'sveltekit-superforms/client'
import type { AdminCtx } from './admin.svelte'
import type { Ref, ResourceType } from '$lib/types'
import type { Feature } from '$lib/db/zod/schema/feature.types'
import type { Hub, HubNew } from '$lib/db/zod/schema/hub.types'
import type { Layer, LayerNew } from '$lib/db/zod/schema/layer.types'
import type {
  Organisation,
  OrganisationNew,
} from '$lib/db/zod/schema/organisation.types'
import type { Project, ProjectNew } from '$lib/db/zod/schema/project.types'

const DEPRECATED_FORM_CONTEXT_MESSAGE =
  'Deprecated: $lib/context/form.svelte has been removed. Migrate to route-local configureForm(...) / Main.Form state instead.'

const failDeprecatedFormContext = (): never => {
  throw new Error(DEPRECATED_FORM_CONTEXT_MESSAGE)
}

/**
 * @deprecated Legacy superforms context. Do not use for new code.
 * Kept only so imports remain resolvable during migration.
 */
class DeprecatedForm<_T extends Record<string, unknown>> {
  constructor(..._args: unknown[]) {
    failDeprecatedFormContext()
  }

  get form(): never {
    return failDeprecatedFormContext()
  }
  get enhance(): never {
    return failDeprecatedFormContext()
  }
  get constraints(): never {
    return failDeprecatedFormContext()
  }
  get validate(): never {
    return failDeprecatedFormContext()
  }
  get validateForm(): never {
    return failDeprecatedFormContext()
  }
  get tainted(): never {
    return failDeprecatedFormContext()
  }
  get isTainted(): never {
    return failDeprecatedFormContext()
  }
  get submit(): never {
    return failDeprecatedFormContext()
  }
  get reset(): never {
    return failDeprecatedFormContext()
  }
  get errors(): never {
    return failDeprecatedFormContext()
  }
  get message(): never {
    return failDeprecatedFormContext()
  }
  get posted(): never {
    return failDeprecatedFormContext()
  }
  get hasClientErrors(): never {
    return failDeprecatedFormContext()
  }

  handleSubmit(): never {
    return failDeprecatedFormContext()
  }
  setClientError(): never {
    return failDeprecatedFormContext()
  }
  clearClientError(): never {
    return failDeprecatedFormContext()
  }
  clearAllClientErrors(): never {
    return failDeprecatedFormContext()
  }
}

/** @deprecated */
export class OrganisationForm extends DeprecatedForm<Organisation> {}
/** @deprecated */
export class ProjectForm extends DeprecatedForm<Project> {}
/** @deprecated */
export class LayerForm extends DeprecatedForm<Layer> {}
/** @deprecated */
export class FeatureForm extends DeprecatedForm<Feature> {}
/** @deprecated */
export class HubForm extends DeprecatedForm<Hub> {}

/** @deprecated */
export const getContextRef = (resourceType: ResourceType, entity: Ref): string =>
  `deprecated-form-${resourceType}-${entity}`

/** @deprecated */
export function setForm(
  resourceType: 'organisation',
  entity: Ref,
  form: SuperValidated<OrganisationNew | Organisation>,
  adminCtx: AdminCtx,
): OrganisationForm
/** @deprecated */
export function setForm(
  resourceType: 'project',
  entity: Ref,
  form: SuperValidated<ProjectNew | Project>,
  adminCtx: AdminCtx,
): ProjectForm
/** @deprecated */
export function setForm(
  resourceType: 'layer',
  entity: Ref,
  form: SuperValidated<LayerNew | Layer>,
  adminCtx: AdminCtx,
): LayerForm
/** @deprecated */
export function setForm(
  resourceType: 'feature',
  entity: Ref,
  form: SuperValidated<Feature>,
  adminCtx: AdminCtx,
): FeatureForm
/** @deprecated */
export function setForm(
  resourceType: 'hub',
  entity: Ref,
  form: SuperValidated<HubNew | Hub>,
  adminCtx: AdminCtx,
): HubForm
/** @deprecated */
export function setForm(
  _resourceType: ResourceType,
  _entity: Ref,
  _form: SuperValidated<Record<string, unknown>>,
  _adminCtx: AdminCtx,
): never {
  return failDeprecatedFormContext()
}

/** @deprecated */
export function getForm(resource: 'organisation', entity: Ref): OrganisationForm
/** @deprecated */
export function getForm(resource: 'project', entity: Ref): ProjectForm
/** @deprecated */
export function getForm(resource: 'layer', entity: Ref): LayerForm
/** @deprecated */
export function getForm(resource: 'feature', entity: Ref): FeatureForm
/** @deprecated */
export function getForm(resource: 'hub', entity: Ref): HubForm
/** @deprecated */
export function getForm(_resource: ResourceType, _entity: Ref): never {
  return failDeprecatedFormContext()
}
