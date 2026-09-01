import assert from 'node:assert/strict'
import {
  extractModelIds,
  extractResponseReasoning,
  extractResponseText,
  modelsUrl,
  responseDeltas,
  responsesUrl,
  responseTextDeltas,
} from './responses.ts'

assert.equal(responsesUrl('https://api.example.com/v1/'), 'https://api.example.com/v1/responses')
assert.equal(modelsUrl('https://api.example.com/v1/'), 'https://api.example.com/v1/models')
assert.deepEqual(extractModelIds({ data: [{ id: 'model-b' }, { id: 'model-a' }, { id: 'model-b' }] }), ['model-a', 'model-b'])
assert.equal(extractResponseText({ output_text: 'Hello' }), 'Hello')
assert.equal(extractResponseText({ output: [{ content: [{ type: 'output_text', text: 'Hi' }] }] }), 'Hi')
assert.equal(extractResponseReasoning({
  output: [{ type: 'reasoning', summary: [{ type: 'summary_text', text: 'Checked the constraints.' }] }],
}), 'Checked the constraints.')

const encoder = new TextEncoder()
const chunks = [
  'event: response.reasoning_summary_text.delta\r\ndata: {"type":"response.reasoning_summary_text.delta","delta":"Think"}\r\n\r',
  '\nevent: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"Hel"}\n\n',
  '\nevent: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"lo"}\n\n',
]
const body = new ReadableStream<Uint8Array>({
  start(controller) {
    chunks.forEach((chunk) => controller.enqueue(encoder.encode(chunk)))
    controller.close()
  },
})
const deltas: string[] = []
for await (const delta of responseTextDeltas(body)) deltas.push(delta)
assert.equal(deltas.join(''), 'Hello')

const eventBody = new ReadableStream<Uint8Array>({
  start(controller) {
    chunks.forEach((chunk) => controller.enqueue(encoder.encode(chunk)))
    controller.close()
  },
})
const events = []
for await (const event of responseDeltas(eventBody)) events.push(event)
assert.deepEqual(events, [
  { type: 'reasoning', delta: 'Think' },
  { type: 'output_text', delta: 'Hel' },
  { type: 'output_text', delta: 'lo' },
])
