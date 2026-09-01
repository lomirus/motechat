export function responsesUrl(baseUrl: string) {
  return `${baseUrl.trim().replace(/\/+$/, '')}/responses`
}

export function extractResponseText(response: any): string {
  if (typeof response.output_text === 'string' && response.output_text) return response.output_text

  const text = response.output
    ?.flatMap((item: any) => item.content || [])
    .filter((item: any) => item.type === 'output_text' && typeof item.text === 'string')
    .map((item: any) => item.text)
    .join('\n')

  if (!text) throw new Error('The service returned an empty response.')
  return text
}

export async function* responseTextDeltas(body: ReadableStream<Uint8Array>) {
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

      const payload = JSON.parse(data)
      if (payload.type === 'response.output_text.delta' && typeof payload.delta === 'string') {
        yield payload.delta
      }
      if (payload.type === 'error' || payload.type === 'response.failed') {
        throw new Error(payload.error?.message || payload.response?.error?.message || 'Response failed.')
      }
    }

    if (done) break
  }
}
