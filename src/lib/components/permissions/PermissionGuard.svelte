<script lang="ts">
// TYPES
import type { SessionUser } from '$lib/types';
// PERMISSIONS
import {
  canManageOrganisations,
  canUpdateOrganisation,
  canCreateProjects,
  canUpdateProject,
  canCreateLayers,
  canUpdateLayer,
  canManageFeatures
} from '$lib/client/services/auth';

type PermissionType = 
  | 'manage-organisations'
  | 'update-organisation'
  | 'create-projects'
  | 'update-project'
  | 'create-layers'
  | 'update-layer'
  | 'manage-features';

interface Props {
  user: SessionUser | null;
  permission: PermissionType;
  organisationId?: string;
  projectId?: string;
  children: any;
  fallback?: any;
  disabled?: boolean;
}

let { 
  user, 
  permission, 
  organisationId, 
  projectId, 
  children, 
  fallback, 
  disabled = false 
}: Props = $props();

// Check if user has the required permission
let hasPermission = $derived.by(() => {
  if (!user) return false;

  switch (permission) {
    case 'manage-organisations':
      return canManageOrganisations(user);
    
    case 'update-organisation':
      return organisationId ? canUpdateOrganisation(user, organisationId) : false;
    
    case 'create-projects':
      return canCreateProjects(user);
    
    case 'update-project':
      return projectId ? canUpdateProject(user, projectId, organisationId) : false;
    
    case 'create-layers':
      return projectId ? canCreateLayers(user, projectId) : false;
    
    case 'update-layer':
      return projectId ? canUpdateLayer(user, projectId) : false;
    
    case 'manage-features':
      return projectId ? canManageFeatures(user, projectId) : false;
    
    default:
      return false;
  }
});

// If disabled prop is true, pass the hasPermission check to children
// Otherwise, conditionally render children or fallback
</script>

{#if disabled}
  {@render children({ disabled: !hasPermission })}
{:else if hasPermission}
  {@render children()}
{:else if fallback}
  {@render fallback()}
{/if} 