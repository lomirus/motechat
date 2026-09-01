import assert from 'node:assert/strict'
import { extractResponseText, responsesUrl, responseTextDeltas } from './responses.ts'

assert.equal(responsesUrl('https://api.example.com/v1/'), 'https://api.example.com/v1/responses')
assert.equal(extractResponseText({ output_text: 'Hello' }), 'Hello')
assert.equal(extractResponseText({ output: [{ content: [{ type: 'output_text', text: 'Hi' }] }] }), 'Hi')

const encoder = new TextEncoder()
const chunks = [
  'event: response.output_text.delta\r\ndata: {"type":"response.output_text.delta","delta":"Hel"}\r\n\r',
  '\nevent: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"lo"}\n\n',
]
const body = new ReadableStream({
  start(controller) {
    chunks.forEach((chunk) => controller.enqueue(encoder.encode(chunk)))
    controller.close()
  },
})
const deltas = []
for await (const delta of responseTextDeltas(body)) deltas.push(delta)
assert.equal(deltas.join(''), 'Hello')
