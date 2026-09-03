import assert from 'node:assert/strict'
import {
  activeFields,
  comboKey,
  combos,
  createCollection,
  createField,
  createOption,
  nextCollectionName,
  parseCollections,
  resolveConnectionId,
  selectedOptionIds,
} from './collections.ts'

assert.equal(comboKey(['b', 'a']), comboKey(['a', 'b']))
assert.equal(comboKey(['z']), 'z')
assert.equal(comboKey([]), '')

const a = { id: 'a', label: 'A' }
const b = { id: 'b', label: 'B' }
const x = { id: 'x', label: 'X' }
const y = { id: 'y', label: 'Y' }
const f1 = { id: 'f1', name: 'F1', options: [a, b] }
const f2 = { id: 'f2', name: 'F2', options: [x, y] }
const empty = { id: 'e', name: 'E', options: [] as typeof f1.options }

assert.deepEqual(activeFields([f1, empty, f2]), [f1, f2])

assert.deepEqual(combos([]), [[]])
assert.deepEqual(combos([f1]), [[a], [b]])
assert.deepEqual(combos([f1, f2]), [[a, x], [a, y], [b, x], [b, y]])
assert.deepEqual(combos([f1, empty, f2]), [[a, x], [a, y], [b, x], [b, y]])

const collection = { id: 'c', name: 'C', fields: [f1, empty, f2], selected: { f1: 'b', f2: 'y' }, mapping: {} }
assert.deepEqual(selectedOptionIds(collection), ['b', 'y'])
assert.deepEqual(selectedOptionIds({ ...collection, selected: {} }), ['a', 'x'])
assert.deepEqual(selectedOptionIds({ ...collection, selected: { f1: 'x', f2: 'nope' } }), ['a', 'x'])

assert.equal(resolveConnectionId({ ...collection, mapping: { [comboKey(['b', 'y'])]: 'conn1' } }), 'conn1')
assert.equal(resolveConnectionId(collection), undefined)
assert.equal(resolveConnectionId({ ...collection, fields: [], mapping: { '': 'conn1' } }), 'conn1')
assert.equal(resolveConnectionId({ ...collection, fields: [], mapping: {} }), undefined)

assert.equal(nextCollectionName([]), 'Default')
assert.equal(nextCollectionName(['Default']), 'Collection 2')
assert.equal(nextCollectionName(['Default', 'Collection 2']), 'Collection 3')
assert.equal(nextCollectionName(['Other']), 'Default')

const created = createCollection([])
assert.equal(typeof created.id, 'string')
assert.ok(created.id)
assert.equal(created.name, 'Default')
assert.deepEqual(created.fields, [])
assert.deepEqual(created.selected, {})
assert.deepEqual(created.mapping, {})
assert.equal(createCollection([created]).name, 'Collection 2')

const field = createField()
assert.equal(typeof field.id, 'string')
assert.ok(field.id)
assert.equal(field.name, '')
assert.deepEqual(field.options, [])
const option = createOption()
assert.equal(typeof option.id, 'string')
assert.ok(option.id)
assert.equal(option.label, '')

assert.deepEqual(parseCollections({}, []), {
  collections: [{ id: 'default', name: 'Default', fields: [], selected: {}, mapping: {} }],
  activeCollectionId: 'default',
})
assert.deepEqual(parseCollections({ collections: [] }, ['conn1']), {
  collections: [{ id: 'default', name: 'Default', fields: [], selected: {}, mapping: { '': 'conn1' } }],
  activeCollectionId: 'default',
})

const stored = {
  id: 'c1',
  name: 'Work',
  fields: [f1, f2],
  selected: { f1: 'b', f2: 'x' },
  mapping: { 'a+x': 'conn1', 'b+y': 'conn2' },
}
assert.deepEqual(parseCollections({ collections: [stored], activeCollectionId: 'c1' }, ['conn1', 'conn2']), {
  collections: [stored],
  activeCollectionId: 'c1',
})

const home = { id: 'c2', name: 'Home', fields: [], selected: {}, mapping: {} }
assert.deepEqual(parseCollections({
  collections: [{
    id: 'c1',
    name: 'C',
    fields: [
      { id: 'f1', name: 1, options: [{ id: 'a', label: 1 }, { label: 'nope' }, { id: '', label: 'empty' }, { id: 'b', label: 'B' }] },
      { name: 'no-id', options: [] },
      { id: '', name: 'empty-id' },
      { id: 'f2', name: 'F2', options: [{ id: 'x', label: 'X' }] },
    ],
    selected: { f1: 'z', f2: 'a', extra: 'x' },
    mapping: { 'a+x': 'conn1', 'a+z': 'conn1', b: 'gone', a: '' },
  }, { id: '', name: 'Bad' }, 'nope', home],
  activeCollectionId: 'c2',
}, ['conn1']), {
  collections: [{
    id: 'c1',
    name: 'C',
    fields: [
      { id: 'f1', name: '', options: [{ id: 'a', label: '' }, { id: 'b', label: 'B' }] },
      { id: 'f2', name: 'F2', options: [{ id: 'x', label: 'X' }] },
    ],
    selected: {},
    mapping: { 'a+x': 'conn1' },
  }, home],
  activeCollectionId: 'c2',
})
assert.equal(parseCollections({ collections: [stored, home], activeCollectionId: 'missing' }, ['conn1', 'conn2']).activeCollectionId, 'c1')
assert.equal(parseCollections({ collections: [stored, home] }, ['conn1', 'conn2']).activeCollectionId, 'c1')
assert.deepEqual(parseCollections({
  collections: [{ id: 'c3', name: 'Empty', fields: [], selected: {}, mapping: { '': 'conn1', 'gone': 'conn1' } }],
}, ['conn1']).collections[0].mapping, { '': 'conn1' })
assert.deepEqual(parseCollections({
  collections: [{ id: 'c3', name: 'Empty', fields: [f1], selected: {}, mapping: { '': 'conn1' } }],
}, ['conn1']).collections[0].mapping, {})
