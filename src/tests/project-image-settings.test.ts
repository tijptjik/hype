// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { ProjectFlagsSchema } from '#lib/projects/flags.js'
import { ProjectEntityFormData } from '#lib/db/zod/schema/project.js'
import { toProjectFormInput } from '#lib/client/services/project.js'
import { toProjectSubmittedFields } from '#lib/api/services/authz/project.js'

const flagsForm = ProjectEntityFormData.pick({ flags: true })

describe('project image settings', () => {
  it('uses inherited defaults for new and older projects', () => {
    expect(flagsForm.parse({}).flags).toEqual({})
    expect(toProjectFormInput().data.flags).toEqual({})
  })

  it('round-trips independent switches and retains other project preferences', () => {
    const flags = {
      autoPublishClassifiedImages: true,
      autoFeatureFirstImage: false,
      futurePreference: true,
    }
    const parsed = flagsForm.parse({ flags: JSON.stringify(flags) })
    expect(parsed.flags).toEqual(flags)
    expect(toProjectSubmittedFields(parsed)).toContain('flags')
  })

  it('rejects malformed JSON and non-boolean policy values', () => {
    expect(flagsForm.safeParse({ flags: '{invalid' }).success).toBe(false)
    expect(
      ProjectFlagsSchema.safeParse({ autoFeatureFirstImage: 'false' }).success,
    ).toBe(false)
    expect(
      ProjectFlagsSchema.safeParse({ autoPublishClassifiedImages: 0 }).success,
    ).toBe(false)
  })
})
