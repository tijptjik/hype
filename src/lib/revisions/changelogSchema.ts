// VALIDATION
import { z } from 'zod'

/** Shared bounded pagination and filter inputs for resource and user history feeds. */
export const changelogQueryFields = {
  locale: z.enum(['en', 'zhHant', 'zhHans']),
  filters: z
    .strictObject({
      resourceType: z
        .enum(['hub', 'organisation', 'project', 'layer', 'feature', 'property'])
        .optional(),
      category: z
        .enum(['profile', 'fields', 'staff', 'publication', 'maintenance'])
        .optional(),
      action: z
        .enum([
          'created',
          'updated',
          'added',
          'removed',
          'published',
          'unpublished',
          'archived',
          'restored',
          'baseline',
        ])
        .optional(),
      actor: z
        .strictObject({
          id: z.string().min(1).max(256),
          origin: z.string().min(1).max(64),
        })
        .optional(),
      origin: z.enum(['user', 'system', 'migration', 'import', 'restore']).optional(),
      search: z.string().max(200).optional(),
      from: z.iso.date().optional(),
      to: z.iso.date().optional(),
    })
    .refine(value => !value.from || !value.to || value.from <= value.to, {
      message: 'Start date must precede end date',
    })
    .optional(),
  includeFilterOptions: z.boolean().optional(),
  before: z
    .strictObject({
      createdAt: z.string().min(1).max(64),
      key: z.string().min(1).max(256),
    })
    .optional(),
}
