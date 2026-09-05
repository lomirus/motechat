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

function usageRecord(response: unknown): Record<string, unknown> | undefined {
  if (!isRecord(response)) return
  const usage = isRecord(response.usage)
    ? response.usage
    : isRecord(response.response) && isRecord(response.response.usage)
      ? response.response.usage
      : undefined
  return isRecord(usage) ? usage : undefined
}

function tokenCount(value: unknown): number | undefined {
  return typeof value === 'number' && value > 0 ? value : undefined
}

function readCount(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined
}

function nestedRecord(value: Record<string, unknown>, key: string): Record<string, unknown> | undefined {
  return isRecord(value[key]) ? value[key] : undefined
}

export type TokenUsage = {
  input: number
  output: number
  total: number
  cached: number
  reasoning: number
}

export const usagePartKeys = ['cached', 'input', 'reasoning', 'output'] as const
export type UsagePart = typeof usagePartKeys[number]

function firstCount(...values: unknown[]): number | undefined {
  for (const value of values) {
    const n = readCount(value)
    if (n != null) return n
  }
}

export function extractInputTokens(response: unknown): number | undefined {
  const usage = usageRecord(response)
  return usage ? tokenCount(usage.input_tokens) ?? tokenCount(usage.prompt_tokens) : undefined
}

export function extractOutputTokens(response: unknown): number | undefined {
  const usage = usageRecord(response)
  return usage ? tokenCount(usage.output_tokens) ?? tokenCount(usage.completion_tokens) : undefined
}

export function extractTotalTokens(response: unknown): number | undefined {
  const usage = usageRecord(response)
  if (!usage) return
  const total = tokenCount(usage.total_tokens)
  if (total) return total
  const input = firstCount(usage.input_tokens, usage.prompt_tokens)
  const output = firstCount(usage.output_tokens, usage.completion_tokens)
  if (input == null || output == null) return
  const summed = input + output
  return summed > 0 ? summed : undefined
}

export function extractUsage(response: unknown): TokenUsage | undefined {
  const usage = usageRecord(response)
  if (!usage) return
  const input = firstCount(usage.input_tokens, usage.prompt_tokens)
  const output = firstCount(usage.output_tokens, usage.completion_tokens)
  const total = firstCount(usage.total_tokens)
    ?? (input != null && output != null && input + output > 0 ? input + output : undefined)
  if (!input && !output && !total) return

  const resolvedInput = input ?? 0
  const resolvedOutput = output ?? 0
  const resolvedTotal = total ?? resolvedInput + resolvedOutput
  const inputDetails = nestedRecord(usage, 'input_tokens_details') ?? nestedRecord(usage, 'prompt_tokens_details')
  const outputDetails = nestedRecord(usage, 'output_tokens_details') ?? nestedRecord(usage, 'completion_tokens_details')
  const cached = Math.min(
    resolvedInput,
    firstCount(inputDetails?.cached_tokens, usage.prompt_cache_hit_tokens) ?? 0,
  )
  const reasoning = firstCount(outputDetails?.reasoning_tokens) ?? 0
  return { input: resolvedInput, output: resolvedOutput, total: resolvedTotal, cached, reasoning }
}

export function usageParts(usage: TokenUsage | undefined): { key: UsagePart; tokens: number }[] {
  const input = usage?.input ?? 0
  const output = usage?.output ?? 0
  const cached = Math.min(input, usage?.cached ?? 0)
  const reasoning = usage?.reasoning ?? 0
  const visible = output >= reasoning ? output - reasoning : output
  return [
    { key: 'cached', tokens: cached },
    { key: 'input', tokens: input - cached },
    { key: 'reasoning', tokens: reasoning },
    { key: 'output', tokens: visible },
  ]
}

export const currencies = ['CNY', 'USD'] as const
export type Currency = typeof currencies[number]

export type ModelPrices = {
  cacheHit: number
  cacheMiss: number
  output: number
}

export function isCurrency(value: unknown): value is Currency {
  return currencies.includes(value as Currency)
}

export function addUsage(a: TokenUsage | undefined, b: TokenUsage | undefined): TokenUsage | undefined {
  if (!a) return b
  if (!b) return a
  return {
    input: a.input + b.input,
    output: a.output + b.output,
    total: a.total + b.total,
    cached: a.cached + b.cached,
    reasoning: a.reasoning + b.reasoning,
  }
}

export function usageCost(usage: TokenUsage | undefined, prices: ModelPrices): number {
  const cached = Math.min(usage?.input ?? 0, usage?.cached ?? 0)
  const input = (usage?.input ?? 0) - cached
  const output = usage?.output ?? 0
  return (cached * prices.cacheHit + input * prices.cacheMiss + output * prices.output) / 1_000_000
}

export function formatMoney(amount: number, currency: Currency): string {
  const symbol = currency === 'USD' ? '$' : '¥'
  if (!Number.isFinite(amount) || amount <= 0) return `${symbol}0`
  const digits = amount >= 1 ? 2 : amount >= 0.01 ? 4 : 6
  return `${symbol}${amount.toFixed(digits)}`
}

export function usageRing(
  parts: { key: UsagePart; tokens: number }[],
  limit: number,
  circumference: number,
): { key: UsagePart; dash: number; offset: number }[] {
  if (!limit) return []
  const ring = []
  let offset = 0
  let remaining = circumference
  for (const part of parts) {
    if (!part.tokens || remaining <= 0) continue
    const dash = Math.min(remaining, circumference * (part.tokens / limit))
    if (dash > 0) ring.push({ key: part.key, dash, offset })
    offset += dash
    remaining -= dash
  }
  return ring
}

export function outputSpeed(tokens: number, elapsedMs: number): number | undefined {
  if (tokens <= 0 || elapsedMs <= 0) return
  return tokens / (elapsedMs / 1000)
}

const maxImageBytes = 10 * 1024 * 1024

export function imageFileError(file: { type: string; size: number }, maxBytes = maxImageBytes): string | undefined {
  if (!file.type.startsWith('image/') || file.type === 'image/svg+xml') {
    return 'Choose a photo, screenshot, or other image file.'
  }
  if (file.size > maxBytes) return 'Images must be 10 MB or smaller.'
}

export const reasoningEfforts = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const
export type ReasoningEffort = typeof reasoningEfforts[number]

export function isReasoningEffort(value: unknown): value is ReasoningEffort {
  return reasoningEfforts.includes(value as ReasoningEffort)
}

export function reasoningConfig(effort: ReasoningEffort | '') {
  if (!effort) return
  return { effort }
}

export function toResponseInput(messages: { role: string; content: string; images?: string[] }[]) {
  return messages.map(({ role, content, images }) => {
    if (!images?.length) return { role, content }
    return {
      role,
      content: [
        ...(content ? [{ type: 'input_text' as const, text: content }] : []),
        ...images.map((image_url) => ({ type: 'input_image' as const, image_url })),
      ],
    }
  })
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
    if (done && buffer.trim()) events.push(buffer)

    for (const event of events) {
      const data = event
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trimStart())
        .join('\n')
      if (!data || data === '[DONE]') continue

      let payload: unknown
      try {
        payload = parseJson(data)
      } catch {
        continue
      }
      if (!isRecord(payload)) continue
      if (payload.type === 'response.output_text.delta' && typeof payload.delta === 'string') {
        yield { type: 'output_text' as const, delta: payload.delta }
      }
      if ((payload.type === 'response.reasoning_summary_text.delta'
        || payload.type === 'response.reasoning_text.delta')
        && typeof payload.delta === 'string') {
        yield { type: 'reasoning' as const, delta: payload.delta }
      }
      const usage = extractUsage(payload)
      if (usage) yield { type: 'usage' as const, usage }
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
