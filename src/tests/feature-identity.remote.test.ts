// @vitest-environment node
// TESTS
import { beforeEach, expect, it, vi } from 'vitest'
import { withRemoteMeta } from './remote-function-mock'

const mocks = vi.hoisted(() => ({ probe:vi.fn(),authorize:vi.fn(),enabled:vi.fn(),inspect:vi.fn(),propose:vi.fn(),read:vi.fn(),decide:vi.fn(),access:vi.fn(),successors:vi.fn(),savedSuccessors:vi.fn() }))
vi.mock('#lib/api/server/guarded.js',()=>{
  const remote=(schema:{parse:(value:unknown)=>unknown},handler:(value:unknown,ctx:unknown)=>unknown)=>withRemoteMeta(async(value:unknown)=>handler(schema.parse(value),{
    db:{},user:{id:'session-reviewer'},userRoles:[],isAdminRequest:true,event:{locals:{hub:{id:'hub',isCore:false}}},
  }),'command')
  return {guardedCommand:remote,guardedQuery:remote}
})
vi.mock('#lib/db/services/feature.js',()=>({probeFeatureForUpdate:mocks.probe}))
vi.mock('#lib/api/services/authz/feature',()=>({authorizeFeaturePublishForSubmission:mocks.authorize}))
vi.mock('#lib/properties/audience.server.js',()=>({getInternalPropertyAccess:mocks.access}))
vi.mock('#lib/db/services/featureIdentityProposal.js',()=>({featureIdentityReviewEnabled:mocks.enabled,inspectFeatureIdentitySource:mocks.inspect,
  createFeatureIdentityProposal:mocks.propose,readFeatureIdentityProposal:mocks.read,decideFeatureIdentityProposal:mocks.decide}))
vi.mock('#lib/db/services/featureSuccessors.js',()=>({readPublicFeatureSuccessors:mocks.successors,readSavedFeatureSuccessors:mocks.savedSuccessors}))
import {proposeFeatureIdentity,decideFeatureIdentity,getFeatureSuccessors,getSavedFeatureSuccessors} from '#lib/api/featureIdentity.remote.js'
const selection={kind:'merge' as const,inputs:[{featureId:'a',revisionId:'a1',generation:1},{featureId:'b',revisionId:'b1',generation:1}],
  outputs:[{featureId:'a',sourceFeatureId:'b'}],reason:'Duplicates'}
beforeEach(()=>{
  vi.resetAllMocks();mocks.enabled.mockResolvedValue(true);mocks.authorize.mockReturnValue({allowed:true});mocks.access.mockResolvedValue({internal:new Set(),allowed:new Set()})
  mocks.probe.mockImplementation(async(idb,id)=>({id,organisationId:'persisted-org',projectId:'persisted-project',layerId:'persisted-layer',resourceHubId:'hub'}))
  mocks.propose.mockResolvedValue('proposal');mocks.decide.mockResolvedValue('operation')
  mocks.read.mockResolvedValue({plan:{heads:[{featureId:'a'},{featureId:'b'},{featureId:'child'}]}})
})
it('uses session attribution and persisted scopes for every input',async()=>{
  expect(await proposeFeatureIdentity(selection)).toEqual({proposalId:'proposal'})
  expect(mocks.authorize).toHaveBeenCalledTimes(2)
  expect(mocks.propose).toHaveBeenCalledWith({},expect.objectContaining({actorId:'session-reviewer',selection:expect.objectContaining({reason:'Duplicates'})}))
})
it('refuses proposal creation when any input lacks publisher authority',async()=>{
  mocks.authorize.mockImplementation(({resource})=>({allowed:resource.id!=='b'}))
  await expect(proposeFeatureIdentity(selection)).rejects.toMatchObject({status:403})
  expect(mocks.propose).not.toHaveBeenCalled()
})
it('rechecks authority over reserved outputs before accepting',async()=>{
  mocks.authorize.mockImplementation(({resource})=>({allowed:resource.id!=='child'}))
  await expect(decideFeatureIdentity({proposalId:'proposal',accept:true,reason:'Reviewed',relationshipsReviewed:true,taskAssignments:[]})).rejects.toMatchObject({status:403})
  expect(mocks.decide).not.toHaveBeenCalled()
})
it('reports stale acceptance without a false publication acknowledgement',async()=>{
  mocks.decide.mockResolvedValue(null)
  await expect(decideFeatureIdentity({proposalId:'proposal',accept:true,reason:'Reviewed',relationshipsReviewed:true,taskAssignments:[]})).rejects.toMatchObject({status:409})
})
it('requires explicit relationship review and keeps public resolution in the request hub',async()=>{
  await expect(decideFeatureIdentity({proposalId:'proposal',accept:true,reason:'Reviewed'} as never)).rejects.toThrow()
  expect(mocks.decide).not.toHaveBeenCalled()
  await getFeatureSuccessors({featureId:'old'})
  expect(mocks.successors).toHaveBeenCalledWith({},{featureId:'old',hubId:'hub',isCore:false})
})

it('uses only the session user for saved successor guidance',async()=>{
  await getSavedFeatureSuccessors({offset:20,userId:'someone-else'} as never)
  expect(mocks.savedSuccessors).toHaveBeenCalledWith({},{offset:20,userId:'session-reviewer',hubId:'hub',isCore:false})
})
