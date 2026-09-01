import assert from 'node:assert/strict'
import { extractResponseText, responsesUrl } from './responses.ts'

assert.equal(responsesUrl('https://api.example.com/v1/'), 'https://api.example.com/v1/responses')
assert.equal(extractResponseText({ output_text: 'Hello' }), 'Hello')
assert.equal(extractResponseText({ output: [{ content: [{ type: 'output_text', text: 'Hi' }] }] }), 'Hi')
