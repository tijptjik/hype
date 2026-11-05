// DRIZZLE
import { sql, type SQL } from 'drizzle-orm'

/** Match literal queue searches before both counting and row hydration.
 * @param query Search across task, contributor and related resource text.
 * @returns A predicate compatible with the stored task table and live queue projection.
 */
export function taskIndexSearchCondition(query: string): SQL {
  const needle = query.trim()
  return sql`(instr(lower(task.id),lower(${needle}))>0
    OR instr(lower(task.message),lower(${needle}))>0
    OR instr(lower(task.featureId),lower(${needle}))>0
    OR EXISTS(SELECT 1 FROM user u WHERE u.id=task.contributorId AND instr(lower(u.name),lower(${needle}))>0)
    OR EXISTS(SELECT 1 FROM featureI18n f WHERE f.featureId=task.featureId
      AND (instr(lower(f.title),lower(${needle}))>0 OR instr(lower(f.description),lower(${needle}))>0
        OR instr(lower(f.displayAddress),lower(${needle}))>0))
    OR EXISTS(SELECT 1 FROM project p WHERE p.id=task.projectId
      AND (instr(lower(p.id),lower(${needle}))>0 OR instr(lower(p.code),lower(${needle}))>0))
    OR EXISTS(SELECT 1 FROM projectI18n p WHERE p.projectId=task.projectId
      AND (instr(lower(p.name),lower(${needle}))>0 OR instr(lower(p.nameShort),lower(${needle}))>0
        OR instr(lower(p.description),lower(${needle}))>0))
    OR EXISTS(SELECT 1 FROM organisation o WHERE o.id=task.organisationId
      AND (instr(lower(o.id),lower(${needle}))>0 OR instr(lower(o.code),lower(${needle}))>0))
    OR EXISTS(SELECT 1 FROM organisationI18n o WHERE o.organisationId=task.organisationId
      AND (instr(lower(o.name),lower(${needle}))>0 OR instr(lower(o.nameShort),lower(${needle}))>0
        OR instr(lower(o.description),lower(${needle}))>0)))`
}
