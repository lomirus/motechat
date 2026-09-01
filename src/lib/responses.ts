function apiUrl(baseUrl: string, path: string) {
  return `${baseUrl.trim().replace(/\/+$/, '')}/${path}`
}

export function responsesUrl(baseUrl: string) {
  return apiUrl(baseUrl, 'responses')
}

export function modelsUrl(baseUrl: string) {
  return apiUrl(baseUrl, 'models')
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isUnknownArray(value: unknown): value is unknown[] {
  return Array.isArray(value)
}

export function parseJson(text: string): unknown {
  return JSON.parse(text)
}

export function readResponseJson(response: Response): Promise<unknown> {
  return response.json()
}

export function responseErrorMessage(response: unknown): string | undefined {
  if (!isRecord(response)) return
  const error = isRecord(response.error)
    ? response.error
    : isRecord(response.response) && isRecord(response.response.error)
      ? response.response.error
      : undefined
  return typeof error?.message === 'string' ? error.message : undefined
}

export function extractModelIds(response: unknown): string[] {
  if (!isRecord(response) || !Array.isArray(response.data)) return []
  return [...new Set(response.data
    .map((item) => isRecord(item) && typeof item.id === 'string' ? item.id : '')
    .filter(Boolean))].sort()
}

export function extractResponseText(response: unknown): string {
  if (!isRecord(response)) throw new Error('The service returned an empty response.')
  if (typeof response.output_text === 'string' && response.output_text) return response.output_text

  const text = (isUnknownArray(response.output) ? response.output : [])
    .flatMap((item) => isRecord(item) && isUnknownArray(item.content) ? item.content : [])
    .map((item) => isRecord(item) && item.type === 'output_text' && typeof item.text === 'string' ? item.text : '')
    .filter(Boolean)
    .join('\n')

  if (!text) throw new Error('The service returned an empty response.')
  return text
}

export function extractResponseReasoning(response: unknown): string {
  if (!isRecord(response)) return ''

  return (isUnknownArray(response.output) ? response.output : [])
    .flatMap((item) => {
      if (!isRecord(item) || item.type !== 'reasoning') return []
      return [
        ...(isUnknownArray(item.summary) ? item.summary : []),
        ...(isUnknownArray(item.content) ? item.content : []),
      ]
    })
    .map((part) => isRecord(part)
      && (part.type === 'summary_text' || part.type === 'reasoning_text')
      && typeof part.text === 'string' ? part.text : '')
    .filter(Boolean)
    .join('\n')
}

export async function* responseDeltas(body: ReadableStream<Uint8Array>) {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    buffer += decoder.decode(value, { stream: !done })

    const events = buffer.replace(/\r\n/g, '\n').split('\n\n')
    buffer = events.pop() || ''

    for (const event of events) {
      const data = event
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trimStart())
        .join('\n')
      if (!data || data === '[DONE]') continue

      const payload = parseJson(data)
      if (!isRecord(payload)) continue
      if (payload.type === 'response.output_text.delta' && typeof payload.delta === 'string') {
        yield { type: 'output_text' as const, delta: payload.delta }
      }
      if ((payload.type === 'response.reasoning_summary_text.delta'
        || payload.type === 'response.reasoning_text.delta')
        && typeof payload.delta === 'string') {
        yield { type: 'reasoning' as const, delta: payload.delta }
      }
      if (payload.type === 'error' || payload.type === 'response.failed') {
        throw new Error(responseErrorMessage(payload) || 'Response failed.')
      }
    }

    if (done) break
  }
}

export async function* responseTextDeltas(body: ReadableStream<Uint8Array>) {
  for await (const event of responseDeltas(body)) {
    if (event.type === 'output_text') yield event.delta
  }
}
