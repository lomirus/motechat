import assert from 'node:assert/strict'
import {
  chosenSelected,
  createConnection,
  duplicateConnection,
  evaluateConnection,
  nextConnectionName,
  nextCopyName,
  parseConnections,
  parseFields,
} from './connections.ts'

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
assert.equal(created.fieldsScript, '')
assert.equal(created.configScript, '')
assert.deepEqual(created.selected, {})
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
    fieldsScript: '',
    configScript: '',
    selected: {},
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
  fieldsScript: '',
  configScript: '',
  selected: {},
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
  fieldsScript: 'return [{ id: "tier", name: "Tier", options: ["fast"] }]',
  configScript: 'return { model: "o3" }',
  selected: { tier: 'fast' },
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
  fieldsScript: '',
  configScript: '',
  selected: {},
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
assert.notEqual(copy.selected, work.selected)

assert.equal(parseConnections({ connections: [{ id: 'a', name: 'A' }] }).connections[0].fieldsScript, '')
assert.deepEqual(parseConnections({
  connections: [{ id: 'a', name: 'A', fieldsScript: 1, selected: { keep: 'yes', skip: 1, empty: '' } }],
}).connections[0].selected, { keep: 'yes' })

assert.deepEqual(parseFields([]), [])
assert.deepEqual(parseFields({ fields: [{ name: 'Model', options: ['Fast', { id: 'expert', label: 'Expert' }, '', { id: '', label: '' }] }] }), [
  { id: 'Model', name: 'Model', options: [{ id: 'Fast', label: 'Fast' }, { id: 'expert', label: 'Expert' }] },
])
assert.throws(() => parseFields('nope'), { message: 'Fields script must return an array of fields.' })

const fields = [
  { id: 'tier', name: 'Tier', options: [{ id: 'fast', label: 'Fast' }, { id: 'expert', label: 'Expert' }] },
  { id: 'empty', name: 'Empty', options: [] as { id: string; label: string }[] },
]
assert.deepEqual(chosenSelected(fields, { tier: 'expert', empty: 'x', extra: 'y' }), { tier: 'expert' })
assert.deepEqual(chosenSelected(fields, {}), { tier: 'fast' })
assert.deepEqual(chosenSelected(fields, { tier: 'gone' }), { tier: 'fast' })

const blank = evaluateConnection(home)
assert.deepEqual(blank.fields, [])
assert.deepEqual(blank.selected, {})
assert.equal(blank.effective, home)
assert.equal(blank.fieldsError, '')
assert.equal(blank.configError, '')

const original = { ...work, model: 'gpt-4o' }
const evaluated = evaluateConnection({
  ...original,
  fieldsScript: `
    connection.model = 'mutated'
    const fields = selected.tier === 'fast'
      ? [{ id: 'tier', name: 'Tier', options: ['fast', 'expert'] }, { id: 'size', name: 'Size', options: ['8k'] }]
      : [{ id: 'tier', name: 'Tier', options: ['fast', 'expert'] }]
    selected.tier = 'hacked'
    return fields
  `,
  configScript: `
    connection.apiKey = 'leaked'
    return { model: selected.tier === 'fast' ? 'flash' : 'pro', cacheHitPrice: 9 }
  `,
  selected: { tier: 'fast', gone: 'x' },
})
assert.equal(original.model, 'gpt-4o')
assert.equal(original.apiKey, 'sk-work')
assert.equal(original.selected.tier, 'fast')
assert.deepEqual(evaluated.fields.map((field) => field.id), ['tier', 'size'])
assert.deepEqual(evaluated.selected, { tier: 'fast', size: '8k' })
assert.equal(evaluated.effective.model, 'flash')
assert.equal(evaluated.effective.cacheHitPrice, 9)
assert.equal(evaluated.effective.apiKey, 'sk-work')
assert.equal(evaluated.effective.id, original.id)
assert.equal(evaluated.fieldsError, '')
assert.equal(evaluated.configError, '')

assert.equal(evaluateConnection({ ...home, fieldsScript: 'return {' }).fieldsError.length > 0, true)
assert.equal(evaluateConnection({ ...home, fieldsScript: 'return 1' }).fieldsError, 'Fields script must return an array of fields.')
assert.equal(evaluateConnection({ ...home, configScript: 'return 1' }).configError, 'Config script must return an object.')
assert.equal(evaluateConnection({ ...home, configScript: 'throw new Error("boom")' }).configError, 'boom')
assert.equal(evaluateConnection({ ...original, configScript: 'return { model: "only" }' }).effective.model, 'only')
assert.equal(evaluateConnection({ ...original, configScript: 'return { model: "only" }' }).effective.apiKey, original.apiKey)
