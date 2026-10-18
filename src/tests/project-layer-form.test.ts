import { describe, expect, it } from 'vitest'
import { toProjectFormInput } from '#lib/client/services/project.js'
import { ProjectEntityFormData } from '#lib/db/zod/schema/project.js'
import type { Project } from '#lib/db/zod/schema/project.types.js'

const layersSchema = ProjectEntityFormData.pick({ layers: true })

describe('project layer form state', () => {
  it('clears default validation when one layer is selected and rejects clearing the last default', () => {
    const layers = [{ id: 'one', rank: 0, isDefaultVisible: false }]
    const invalid = layersSchema.safeParse({ layers })
    expect(invalid.success).toBe(false)
    if (!invalid.success) expect(invalid.error.issues[0].path).toEqual(['layers'])
    layers[0].isDefaultVisible = true
    expect(layersSchema.safeParse({ layers }).success).toBe(true)
    layers[0].isDefaultVisible = false
    expect(layersSchema.safeParse({ layers }).success).toBe(false)
  })

  it('allows omitted relations and projects without layers', () => {
    expect(layersSchema.safeParse({}).success).toBe(true)
    expect(layersSchema.safeParse({ layers: [] }).success).toBe(true)
  })

  it('uses the editable layer projection as the reset and dirty baseline', () => {
    const project = {
      id: 'project',
      code: 'project',
      organisationId: 'org',
      layers: [
        { id: 'second', rank: 9, isDefaultVisible: false },
        { id: 'hidden', rank: 0, isArchived: true, isDefaultVisible: true },
        { id: 'first', rank: 3, isDefaultVisible: true },
      ],
    } as unknown as Project
    const baseline = toProjectFormInput(project).data.layers
    if (!baseline) throw new Error('Expected project layers in the form baseline')
    expect(baseline).toEqual([
      { id: 'first', rank: 0, isDefaultVisible: true },
      { id: 'second', rank: 1, isDefaultVisible: false },
    ])
    const edited = structuredClone(baseline)
    edited[1].isDefaultVisible = true
    expect(edited).not.toEqual(baseline)
    edited[1].isDefaultVisible = false
    expect(edited).toEqual(baseline)
    expect(toProjectFormInput(project).data.layers).toEqual(baseline)
    expect(project.layers?.map(layer => layer.id)).toEqual([
      'second',
      'hidden',
      'first',
    ])
  })
})
