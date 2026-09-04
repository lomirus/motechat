import assert from 'node:assert/strict'
import { javascript } from '@codemirror/lang-javascript'
import { EditorState } from '@codemirror/state'
import { scriptMarks } from './code.ts'

const state = EditorState.create({
  doc: 'selected.model; connection.model; const beijing = new Date(Date.now()); let mutable = beijing; function read(value) { return { beijing, model: beijing, value, mutable } }',
  extensions: [javascript()],
})

const marks = scriptMarks(state)
const marked = (kind: (typeof marks)[number]['kind']) => marks
  .filter((mark) => mark.kind === kind)
  .map((mark) => state.doc.sliceString(mark.from, mark.to))

assert.deepEqual(marked('local'), ['beijing', 'beijing', 'beijing'])
assert.deepEqual(marked('parameter'), ['selected', 'connection'])
assert.deepEqual(marked('class'), ['Date', 'Date'])
assert.deepEqual(marked('special-keyword'), ['new'])
assert.equal(marked('bracket-2').includes('('), true)
assert.equal(marked('bracket-3').includes('{'), true)
