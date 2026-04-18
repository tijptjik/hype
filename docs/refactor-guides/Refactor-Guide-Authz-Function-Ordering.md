# Authz Function Ordering Convention

This convention defines how authorization modules should be ordered so cross-resource comparisons are easy.

## Group Order
Keep top-level groups in this order:
1. Auth input types
2. Policy constants
3. Role resolution
4. Input normalizers
5. Actor resolution
6. Read/List policy evaluation
7. Action policies
8. Read/List authorization
9. Write authorization
10. Command authorization
11. Optional: action permissions
12. Optional: policy map

## Function Order Within Each Group
Use CRUD-first ordering, then specialized actions.

1. `list*`
2. `read*` / `get*`
3. `create*`
4. `update*`
5. `delete*`
6. Specialized actions (for example `manageRoles`, `publish`, `manageCapabilities`, `assignCapabilities`)

## General Before Variant
For each action family, place the general function first, then its variants directly after.

Examples:
- `authorizeProjectCreate` then `authorizeProjectCreateForSubmission`
- `authorizeOrganisationList` then `authorizeOrganisationListForContext`
- `authorizeProjectRead` then `authorizeProjectReadForProbe`

## Policy Map Order
When a policy map is present, use the same ordering as action policies:
- `list`, `read/get`, `create`, `update`, `delete`, then specialized actions.

## Refactor Rule
When adding a new action:
- add it to TOC in the matching position,
- place policy + exported authorization functions in matching positions,
- keep variant functions adjacent to their general function.

## Policy Implementation Style
Use one implementation style across authz modules.

1. Policy handlers use a single `params` object
- Define one policy params type per resource (`*PolicyParams`).
- Keep `ProjectPolicyHandler`/`OrganisationPolicyHandler` as `(params) => decision`.
- Do not use mixed multi-arg handler signatures.

2. Read/List action policies delegate state logic
- `list*Policy` should only:
  - enforce session requirements,
  - call `evaluate*ListStatePolicy(params)`.
- `read*Policy` should only:
  - enforce session requirements,
  - call `evaluate*ReadStatePolicy(params)`.
- State validation (`REQUEST_STATE_REQUIRED`) belongs in evaluator helpers.

3. Action policies stay thin
- `create*`/`update*`/`delete*`/specialized actions should:
  - enforce auth prerequisites,
  - enforce role/field rules,
  - delegate to shared policy where applicable.
- Reuse shared rules by delegation (for example `publish* -> update*`, `delete* -> create*` when intended).

4. Exported authorize wrappers are adapters only
- `authorize*` functions map typed actor/target inputs into policy `params`.
- `authorize*ForSubmission` variants should call their matching general `authorize*` function.

5. Policy maps use direct handler references
- When a policy map exists, map actions directly to handler functions instead of wrapper lambdas/casts.

## Central Dispatcher Wiring (Next Refactor)
Current status:
- `src/lib/api/services/authz/index.ts` central `authorize(params)` dispatches only `organisation`.
- `projectPolicyMap` exists in `src/lib/api/services/authz/project.ts` but is not yet routed by the central dispatcher.

Refactor wiring steps:
1. Extend central `policyMap` in `authz/index.ts` to include `project: projectPolicyMap`.
2. Expand central action typing to include project actions (not only organisation actions).
3. Update `authorize(params)` to dispatch by `params.resourceType` without hard-failing `project`.
4. Keep unsupported resources explicitly `NOT_IMPLEMENTED` until each has a policy map.
5. Add dispatcher tests that assert:
- `resourceType: 'organisation'` routes to organisation map.
- `resourceType: 'project'` routes to project map.
- unsupported resource types/actions return `NOT_IMPLEMENTED`.
