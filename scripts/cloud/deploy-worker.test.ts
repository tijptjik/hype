import { describe, expect, it } from 'bun:test'
import { deployDatabaseConsumers } from './deploy-worker'

describe('database consumer deployment boundary (Refs #194)', () => {
  it('deploys both consumers to the same explicit environment', async () => {
    const commands: string[][] = []
    expect(await deployDatabaseConsumers('production', async command => {
      commands.push(command)
      return 0
    })).toBe(0)
    expect(commands.map(command => command[4])).toEqual([
      'workers/division-refresh/wrangler.jsonc',
      'workers/location-refresh/wrangler.jsonc',
    ])
    expect(commands.every(command => command.at(-1) === 'production')).toBe(true)
  })
  it('stops after the first failure and returns failure if the second consumer fails', async () => {
    let count = 0
    expect(await deployDatabaseConsumers('preview', async () => {count++; return 7})).toBe(7)
    expect(count).toBe(1)
    count = 0
    expect(await deployDatabaseConsumers('preview', async () => ++count === 2 ? 9 : 0)).toBe(9)
    expect(count).toBe(2)
  })
})
