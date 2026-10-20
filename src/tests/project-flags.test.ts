// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { ProjectFlagsSchema, show3dAddressOptions } from '#lib/projects/flags.js'
import {
  ProjectEntityFormData,
  ProjectCompactProfileAPI,
} from '#lib/db/zod/schema/project.js'
import { toProjectFormInput } from '#lib/client/services/project.js'
import { toParentProjectItem } from '#lib/bits/patterns/forms/formFeatureParentSection/formFeatureParentSection.controller.js'
import { toProjectSubmittedFields } from '#lib/api/services/authz/project.js'
import type { Project } from '#lib/db/zod/schema/project.types.js'

const flagsForm = ProjectEntityFormData.pick({ flags: true })

describe('project address flags', () => {
  it('enables 3D address options for existing and new projects by default', () => {
    expect(show3dAddressOptions()).toBe(true)
    expect(show3dAddressOptions(flagsForm.parse({}).flags)).toBe(true)
    expect(toProjectFormInput().data.flags).toEqual({})
  })

  it('round-trips explicit false and evolving flags through form, API, and parent selection', () => {
    const flags = { show3dAddressOptions: false, futureOption: true }
    const parsed = flagsForm.parse({ flags: JSON.stringify(flags) })
    expect(parsed.flags).toEqual(flags)
    expect(show3dAddressOptions(parsed.flags)).toBe(false)
    const project = {
      id: 'project',
      code: 'project',
      organisationId: 'org',
      flags,
    } as unknown as Project
    expect(toProjectFormInput(project).data.flags).toEqual(flags)
    const compact = ProjectCompactProfileAPI.pick({ flags: true }).parse(project)
    expect(toParentProjectItem({ ...project, ...compact })?.flags).toEqual(flags)
    expect(toProjectSubmittedFields(parsed)).toContain('flags')
    expect(project.flags).toEqual(flags)
  })

  it('rejects malformed JSON and non-boolean flags', () => {
    expect(flagsForm.safeParse({ flags: '{bad' }).success).toBe(false)
    expect(
      ProjectFlagsSchema.safeParse({ show3dAddressOptions: 'false' }).success,
    ).toBe(false)
    expect(ProjectFlagsSchema.safeParse({ futureOption: {} }).success).toBe(false)
  })
})
