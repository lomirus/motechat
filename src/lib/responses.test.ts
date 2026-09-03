import assert from 'node:assert/strict'
import {
  extractModelIds,
  extractInputTokens,
  extractOutputTokens,
  extractTotalTokens,
  extractUsage,
  usageParts,
  usageRing,
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

assert.equal(extractInputTokens({ usage: { input_tokens: 18 } }), 18)
assert.equal(extractInputTokens({ response: { usage: { input_tokens: 4 } } }), 4)
assert.equal(extractInputTokens({ usage: { input_tokens: 0 } }), undefined)
assert.equal(extractOutputTokens({ usage: { output_tokens: 42 } }), 42)
assert.equal(extractOutputTokens({ response: { usage: { output_tokens: 7 } } }), 7)
assert.equal(extractOutputTokens({ usage: { output_tokens: 0 } }), undefined)
assert.equal(extractTotalTokens({ usage: { total_tokens: 120 } }), 120)
assert.equal(extractTotalTokens({ response: { usage: { input_tokens: 10, output_tokens: 5 } } }), 15)
assert.equal(extractTotalTokens({ usage: { total_tokens: 0, input_tokens: 0, output_tokens: 0 } }), undefined)
assert.equal(extractTotalTokens({ usage: { output_tokens: 5 } }), undefined)
assert.deepEqual(extractUsage({ usage: {
  input_tokens: 100,
  input_tokens_details: { cached_tokens: 40 },
  output_tokens: 50,
  output_tokens_details: { reasoning_tokens: 20 },
  total_tokens: 150,
} }), { input: 100, output: 50, total: 150, cached: 40, reasoning: 20 })
assert.deepEqual(extractUsage({ usage: {
  prompt_tokens: 10,
  prompt_tokens_details: { cached_tokens: 3 },
  completion_tokens: 5,
  completion_tokens_details: { reasoning_tokens: 2 },
} }), { input: 10, output: 5, total: 15, cached: 3, reasoning: 2 })
assert.deepEqual(extractUsage({ usage: { input_tokens: 5, output_tokens: 9, total_tokens: 14 } }), {
  input: 5, output: 9, total: 14, cached: 0, reasoning: 0,
})
assert.deepEqual(extractUsage({ usage: {
  input_tokens: 10,
  input_tokens_details: { cached_tokens: 99 },
  output_tokens: 4,
  output_tokens_details: { reasoning_tokens: 99 },
} }), { input: 10, output: 4, total: 14, cached: 10, reasoning: 99 })
assert.deepEqual(extractUsage({ usage: { output_tokens: 3, total_tokens: 8 } }), {
  input: 0, output: 3, total: 8, cached: 0, reasoning: 0,
})
assert.deepEqual(usageParts({ input: 100, output: 50, total: 150, cached: 40, reasoning: 20 }), [
  { key: 'cached', tokens: 40 },
  { key: 'input', tokens: 60 },
  { key: 'reasoning', tokens: 20 },
  { key: 'output', tokens: 30 },
])
assert.deepEqual(usageParts({ input: 10, output: 18, total: 69, cached: 0, reasoning: 41 }), [
  { key: 'cached', tokens: 0 },
  { key: 'input', tokens: 10 },
  { key: 'reasoning', tokens: 41 },
  { key: 'output', tokens: 18 },
])
assert.deepEqual(usageRing(usageParts({ input: 50, output: 50, total: 100, cached: 25, reasoning: 0 }), 200, 100), [
  { key: 'cached', dash: 12.5, offset: 0 },
  { key: 'input', dash: 12.5, offset: 12.5 },
  { key: 'output', dash: 25, offset: 25 },
])
assert.deepEqual(usageRing(usageParts(undefined), 0, 100), [])
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
    controller.enqueue(encoder.encode('data: {"type":"response.completed","response":{"usage":{"output_tokens":3,"total_tokens":8}}}\n\n'))
    controller.close()
  },
})
const usageEvents = []
for await (const event of responseDeltas(usageBody)) usageEvents.push(event)
assert.deepEqual(usageEvents, [
  { type: 'output_text', delta: 'Hi' },
  { type: 'usage', usage: { input: 0, output: 3, total: 8, cached: 0, reasoning: 0 } },
])

const tailBody = new ReadableStream<Uint8Array>({
  start(controller) {
    controller.enqueue(encoder.encode('data: {"type":"response.output_text.delta","delta":"Hi"}\n\n'))
    controller.enqueue(encoder.encode('event: response.completed\ndata: {"type":"response.completed","response":{"usage":{"input_tokens":185,"output_tokens":195,"total_tokens":380}}}'))
    controller.close()
  },
})
const tailEvents = []
for await (const event of responseDeltas(tailBody)) tailEvents.push(event)
assert.deepEqual(tailEvents, [
  { type: 'output_text', delta: 'Hi' },
  { type: 'usage', usage: { input: 185, output: 195, total: 380, cached: 0, reasoning: 0 } },
])

const brokenThenCompleted = new ReadableStream<Uint8Array>({
  start(controller) {
    controller.enqueue(encoder.encode('data: {"type":"response.output_text.delta","delta":"Hi"}\n\n'))
    controller.enqueue(encoder.encode('data: not-json\n\n'))
    controller.enqueue(encoder.encode('data: {"type":"response.completed","response":{"usage":{"input_tokens":185,"output_tokens":195,"total_tokens":380}}}\n\n'))
    controller.close()
  },
})
const recovered = []
for await (const event of responseDeltas(brokenThenCompleted)) recovered.push(event)
assert.deepEqual(recovered, [
  { type: 'output_text', delta: 'Hi' },
  { type: 'usage', usage: { input: 185, output: 195, total: 380, cached: 0, reasoning: 0 } },
])
