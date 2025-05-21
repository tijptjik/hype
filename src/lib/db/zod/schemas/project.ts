// ZOD
import { z } from 'zod';
// DRIZZLE
import { createSelectSchema, createInsertSchema, createUpdateSchema } from 'drizzle-zod';
// DRIZZLE SCHEMA
import { project, projectI18n, projectRole } from '$lib/db/schema';
// CONSTRAINTS
import { getDefaultConstraints, getLocales, getMaintainerRoles } from '../constraints';
// TYPES
import { UserBasic, UserPrivacyPreserving } from './user';
// ZOD SCHEMAS
import { PropertyAPI, PropertyInsertAPI, PropertyUpdateAPI } from './property';

/* ----------------- */
// PROJECT CORE SCHEMAS
/* -------- */

export const ProjectBase = createSelectSchema(project);
export const ProjectInsert = createInsertSchema(project).extend({
  ...getDefaultConstraints(project),
  // TODO - Why is this here? Check if this can be deleted.
  id: z.string().optional()
});
export const ProjectUpdate = createUpdateSchema(project).extend({
  ...getDefaultConstraints(project),
});

/* ----------------- */
// PROJECT RELATIONAL SCHEMAS
/* -------- */

export const ProjectI18nBase = createSelectSchema(projectI18n);
export const ProjectI18nInsert = createInsertSchema(projectI18n).extend({
  ...getDefaultConstraints(projectI18n)
});
export const ProjectI18nUpdate = createUpdateSchema(projectI18n).extend({
  ...getDefaultConstraints(projectI18n)
});

export const ProjectRoleBase = createSelectSchema(projectRole);
export const ProjectRoleBaseExtra = ProjectRoleBase.extend({
  user: UserPrivacyPreserving
});
export const ProjectRoleInsert = createInsertSchema(projectRole);
export const ProjectRoleInsertExtra = ProjectRoleInsert.extend({
  role: z.enum(['maintainer', 'member']),
  user: UserBasic
});
export const ProjectRoleUpdate = createUpdateSchema(projectRole);
export const ProjectRoleUpdateExtra = ProjectRoleUpdate.extend({
  role: z.enum(['maintainer', 'member']),
  user: UserBasic
});

/* ----------------- */
// PROJECT API SCHEMAS
/* -------- */

export const ProjectAPI = ProjectBase.extend({
  i18n: getLocales(ProjectI18nBase),
  maintainerRoles: getMaintainerRoles(ProjectRoleBaseExtra),
  properties: z.array(PropertyAPI)
});

export const ProjectInsertAPI = ProjectInsert.extend({
  i18n: getLocales(ProjectI18nInsert),
  maintainerRoles: getMaintainerRoles(ProjectRoleInsertExtra),
  properties: z.array(PropertyInsertAPI)
});

export const ProjectUpdateAPI = ProjectUpdate.extend({
  i18n: getLocales(ProjectI18nUpdate),
  maintainerRoles: getMaintainerRoles(ProjectRoleUpdateExtra),
  properties: z.array(PropertyUpdateAPI)
});

// TODO Remove once we've migrated to the new schemas

/* ----------------- */
// DEPRECATED PROJECTS
/* -------- */

// // Schema for selecting a project - can be used to validate API responses
// export const ProjectBase = createSelectSchema(project);
// export const ProjectI18nBase = createSelectSchema(projectI18n);
// export const ProjectRoleBase = createSelectSchema(projectRole);

// // Base schema to validate submit data
// export const ProjectInsert = createInsertSchema(project).extend({
//   ...getDefaultConstraints(project)
// });

// export const ProjectUpdate = ProjectInsert.extend({
//   id: z.string()
// });

// export const ProjectI18nUpdate = createInsertSchema(projectI18n).extend({
//   ...getDefaultConstraints(projectI18n)
// });

// export const ProjectRoleUpdate = createInsertSchema(projectRole).extend({
//   role: z.enum(['maintainer'])
// });
// export const ProjectRoleUpdateExtra = ProjectRoleUpdate.extend({
//   role: z.enum(['maintainer', 'member']),
//   user: UserBasic
// });

// export const ProjectI18nInsert = ProjectI18nUpdate.omit({ projectId: true });
// export const ProjectRoleInsertExtra = ProjectRoleUpdateExtra.omit({ projectId: true });

// export const ProjectInsertAPI = ProjectInsert.extend({
//   i18n: getLocales(ProjectI18nInsert),
//   maintainerRoles: getMaintainerRoles(ProjectRoleInsertExtra),
//   properties: z.array(PropertyInsertAPI)
//   // tasks: z.array(TaskInsert).optional()
// });

// export const ProjectUpdateAPI = ProjectUpdate.extend({
//   i18n: getLocales(ProjectI18nUpdate),
//   maintainerRoles: getMaintainerRoles(ProjectRoleUpdateExtra),
//   properties: z.array(PropertyUpdateAPI)
//   // tasks: z.array(TaskUpdate).optional()
// });

// export const ProjectPatch = ProjectUpdate.partial();