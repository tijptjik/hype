// SVELTE
import { mount } from 'svelte'
// STYLES
import '#lib/styles/app.css'
// COMPONENTS
import UserAccessFixture from './components/UserAccessFixture.svelte'
// TYPES
import type { UserAccessOverview, UserAccessResource } from '#lib/users/access.types.js'

const resource: UserAccessResource = {
  id: 'sample',
  code: 'community-project',
  name: 'Community food redistribution and neighborhood volunteer coordination',
  parent: 'community-organization',
  role: 'maintainer',
  isArchived: false,
  permissions: [
    'Edit project',
    'Publish project',
    'Manage roles',
    'Assign capabilities',
  ],
  capabilities: [
    { key: 'manageVolunteers', available: true },
    { key: 'manageDropOffs', available: false },
  ],
}
const access: UserAccessOverview = {
  scope: 'managed',
  hubs: [
    {
      ...resource,
      code: 'community-hub',
      name: 'Community Hub',
      role: 'admin',
      parent: null,
      capabilities: [],
      permissions: [
        'Edit hub',
        'Publish hub',
        'Delete hub',
        'Manage roles',
        'Create hubs',
        'Create organisations',
      ],
    },
  ],
  organisations: [],
  projects: [
    resource,
    {
      ...resource,
      id: 'archived',
      name: 'Archived project',
      isArchived: true,
      role: 'user',
      capabilities: [],
      permissions: [],
    },
  ],
}
const target = document.getElementById('app')
if (!target) throw new Error('Missing access fixture target')
mount(UserAccessFixture, { target, props: { access } })
