import { expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import {
  readSplitManifest,
  selectSplitRemoteTarget,
  splitProxyConfig,
} from './split-execution'

const id = '7786af0e-3782-47f8-b70d-de645ba836ad'
const account = 'a'.repeat(32)
const config = {
  env: {
    production: {
      d1_databases: [{ binding: 'DB', database_id: id, database_name: 'hype-db-prod' }],
    },
  },
}

test('requires the explicit environment and matching repository database identity', () => {
  expect(() => selectSplitRemoteTarget(config, '', id, account)).toThrow('ENVIRONMENT')
  expect(() => selectSplitRemoteTarget(config, 'production', 'wrong', account)).toThrow(
    'DATABASE_ID_MISMATCH',
  )
  expect(() => selectSplitRemoteTarget(config, 'production', id, '')).toThrow('ACCOUNT')
  expect(() => selectSplitRemoteTarget(config, 'preview', id, account)).toThrow(
    'DATABASE_ID_MISMATCH',
  )
})

test('builds a proxy with exactly one explicit remote DB and no app bindings', () => {
  const target = selectSplitRemoteTarget(config, 'production', id, account)
  const proxy = splitProxyConfig(target)
  expect(proxy).toEqual({
    name: 'hype-place-split-executor',
    compatibility_date: '2026-10-20',
    account_id: account,
    d1_databases: [
      { binding: 'DB', database_name: 'hype-db-prod', database_id: id, remote: true },
    ],
  })
})

test('checks exact manifest bytes and rejects duplicate Feature identities', () => {
  const document = {
    version: 1,
    strategy: 'unresolved-with-preserved-values',
    plans: [{ featureId: 'feature', projectId: 'project' }],
  }
  const bytes = JSON.stringify(document)
  const hash = createHash('sha256').update(bytes).digest('hex')
  expect(readSplitManifest(bytes, hash).plans).toHaveLength(1)
  expect(() => readSplitManifest(bytes + '\n', hash)).toThrow('HASH_MISMATCH')
  const duplicate = JSON.stringify({
    ...document,
    plans: [...document.plans, ...document.plans],
  })
  expect(() =>
    readSplitManifest(duplicate, createHash('sha256').update(duplicate).digest('hex')),
  ).toThrow('DUPLICATE')
})
