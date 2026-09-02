import assert from 'node:assert/strict'
import {
  extractModelIds,
  extractOutputTokens,
  extractResponseReasoning,
  extractResponseText,
  modelsUrl,
  imageFileError,
  isReasoningEffort,
  outputSpeed,
  reasoningConfig,
  responseDeltas,
  responsesUrl,
  responseTextDeltas,
  toResponseInput,
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

assert.equal(extractOutputTokens({ usage: { output_tokens: 42 } }), 42)
assert.equal(extractOutputTokens({ response: { usage: { output_tokens: 7 } } }), 7)
assert.equal(extractOutputTokens({ usage: { output_tokens: 0 } }), undefined)
assert.equal(outputSpeed(50, 2000), 25)
assert.equal(outputSpeed(0, 1000), undefined)
assert.equal(isReasoningEffort('high'), true)
assert.equal(isReasoningEffort('default'), false)
assert.equal(reasoningConfig('', false), undefined)
assert.deepEqual(reasoningConfig('', true), { summary: 'auto' })
assert.deepEqual(reasoningConfig('high', false), { effort: 'high' })
assert.deepEqual(reasoningConfig('high', true), { effort: 'high', summary: 'auto' })
assert.equal(imageFileError({ type: 'image/png', size: 12 }), undefined)
assert.equal(imageFileError({ type: 'image/svg+xml', size: 12 }), 'Choose a photo, screenshot, or other image file.')
assert.equal(imageFileError({ type: 'text/plain', size: 12 }), 'Choose a photo, screenshot, or other image file.')
assert.equal(imageFileError({ type: 'image/jpeg', size: 10 * 1024 * 1024 + 1 }), 'Images must be 10 MB or smaller.')
assert.deepEqual(toResponseInput([
  { role: 'user', content: 'Hi' },
  { role: 'user', content: 'Look', images: ['data:image/png;base64,abc'] },
  { role: 'user', content: '', images: ['data:image/jpeg;base64,xyz'] },
  { role: 'assistant', content: 'Nice' },
]), [
  { role: 'user', content: 'Hi' },
  { role: 'user', content: [
    { type: 'input_text', text: 'Look' },
    { type: 'input_image', image_url: 'data:image/png;base64,abc' },
  ] },
  { role: 'user', content: [
    { type: 'input_image', image_url: 'data:image/jpeg;base64,xyz' },
  ] },
  { role: 'assistant', content: 'Nice' },
])

const usageBody = new ReadableStream<Uint8Array>({
  start(controller) {
    controller.enqueue(encoder.encode('data: {"type":"response.output_text.delta","delta":"Hi"}\n\n'))
    controller.enqueue(encoder.encode('data: {"type":"response.completed","response":{"usage":{"output_tokens":3}}}\n\n'))
    controller.close()
  },
})
const usageEvents = []
for await (const event of responseDeltas(usageBody)) usageEvents.push(event)
assert.deepEqual(usageEvents, [
  { type: 'output_text', delta: 'Hi' },
  { type: 'usage', outputTokens: 3 },
])
