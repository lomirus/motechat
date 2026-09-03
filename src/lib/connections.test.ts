import assert from 'node:assert/strict'
import { createConnection, duplicateConnection, nextConnectionName, nextCopyName, parseConnections } from './connections.ts'

assert.equal(nextConnectionName([]), 'Default')
assert.equal(nextConnectionName(['Default']), 'Connection 2')
assert.equal(nextConnectionName(['Default', 'Connection 2']), 'Connection 3')
assert.equal(nextConnectionName(['Work']), 'Default')

const created = createConnection([])
assert.equal(created.name, 'Default')
assert.equal(created.apiKey, '')
assert.equal(created.baseUrl, '')
assert.equal(created.model, '')
assert.equal(created.contextLength, null)
assert.equal(created.currency, 'CNY')
assert.deepEqual(created.availableModels, [])
assert.equal(created.reasoningEffort, '')
assert.equal(createConnection([created]).name, 'Connection 2')

assert.equal(nextCopyName('Work', []), 'Work copy')
assert.equal(nextCopyName('Work', ['Work copy']), 'Work copy 2')
assert.equal(nextCopyName('Work', ['Work copy', 'Work copy 2']), 'Work copy 3')
assert.equal(nextCopyName('  ', ['Connection copy']), 'Connection copy 2')

assert.deepEqual(parseConnections({}), {
  connections: [{
    id: 'default',
    name: 'Default',
    apiKey: '',
    baseUrl: '',
    model: '',
    contextLength: null,
    currency: 'CNY',
    cacheHitPrice: null,
    cacheMissPrice: null,
    outputPrice: null,
    availableModels: [],
    reasoningEffort: '',
  }],
  activeConnectionId: 'default',
})

const migrated = parseConnections({
  apiKey: 'sk-old',
  baseUrl: 'https://api.example.com/v1',
  model: 'gpt-4o',
  contextLength: 128000,
  currency: 'USD',
  cacheHitPrice: 0.5,
  cacheMissPrice: 2,
  outputPrice: 8,
  availableModels: ['gpt-4o', 1, 'o3'],
  reasoningEffort: 'high',
})
assert.equal(migrated.activeConnectionId, 'default')
assert.deepEqual(migrated.connections[0], {
  id: 'default',
  name: 'Default',
  apiKey: 'sk-old',
  baseUrl: 'https://api.example.com/v1',
  model: 'gpt-4o',
  contextLength: 128000,
  currency: 'USD',
  cacheHitPrice: 0.5,
  cacheMissPrice: 2,
  outputPrice: 8,
  availableModels: ['gpt-4o', 'o3'],
  reasoningEffort: 'high',
})

const work = {
  id: 'work',
  name: 'Work',
  apiKey: 'sk-work',
  baseUrl: 'https://work.example/v1',
  model: 'gpt-4o',
  contextLength: 8000,
  currency: 'USD' as const,
  cacheHitPrice: 1,
  cacheMissPrice: 2,
  outputPrice: 3,
  availableModels: ['gpt-4o'],
  reasoningEffort: 'low' as const,
}
const home = {
  id: 'home',
  name: 'Home',
  apiKey: '',
  baseUrl: '',
  model: '',
  contextLength: null,
  currency: 'CNY' as const,
  cacheHitPrice: null,
  cacheMissPrice: null,
  outputPrice: null,
  availableModels: [] as string[],
  reasoningEffort: '' as const,
}
assert.deepEqual(parseConnections({
  connections: [work, home, { id: '', name: 'Bad' }, 'nope'],
  activeConnectionId: 'home',
  apiKey: 'ignored once connections exist',
}), { connections: [work, home], activeConnectionId: 'home' })
assert.equal(parseConnections({ connections: [work, home], activeConnectionId: 'missing' }).activeConnectionId, 'work')
assert.equal(parseConnections({ connections: [{ id: 'a', name: 'A', currency: 'EUR', reasoningEffort: 'nope' }] }).connections[0].currency, 'CNY')
assert.equal(parseConnections({ connections: [{ id: 'a', name: 'A', contextLength: 0 }] }).connections[0].contextLength, null)
assert.equal(parseConnections({ connections: [{ id: 'a', name: 'A', cacheHitPrice: -1 }] }).connections[0].cacheHitPrice, null)

const copy = duplicateConnection(work, [work])
assert.notEqual(copy.id, work.id)
assert.notEqual(copy.availableModels, work.availableModels)
assert.equal(copy.name, 'Work copy')
assert.deepEqual({ ...copy, id: work.id, name: work.name }, work)
