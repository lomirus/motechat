import { isCurrency, isReasoningEffort, isRecord, type Currency, type ReasoningEffort } from './responses.ts'

export type Connection = {
  id: string
  name: string
  apiKey: string
  baseUrl: string
  model: string
  contextLength: number | null
  currency: Currency
  cacheHitPrice: number | null
  cacheMissPrice: number | null
  outputPrice: number | null
  availableModels: string[]
  reasoningEffort: ReasoningEffort | ''
}

function readPrice(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null
}

function connectionFields(value: Record<string, unknown>): Omit<Connection, 'id' | 'name'> {
  return {
    apiKey: typeof value.apiKey === 'string' ? value.apiKey : '',
    baseUrl: typeof value.baseUrl === 'string' ? value.baseUrl : '',
    model: typeof value.model === 'string' ? value.model : '',
    contextLength: typeof value.contextLength === 'number' && value.contextLength > 0
      ? Math.floor(value.contextLength)
      : null,
    currency: isCurrency(value.currency) ? value.currency : 'CNY',
    cacheHitPrice: readPrice(value.cacheHitPrice),
    cacheMissPrice: readPrice(value.cacheMissPrice),
    outputPrice: readPrice(value.outputPrice),
    availableModels: Array.isArray(value.availableModels)
      ? value.availableModels.filter((item): item is string => typeof item === 'string')
      : [],
    reasoningEffort: isReasoningEffort(value.reasoningEffort) ? value.reasoningEffort : '',
  }
}

function toConnection(value: unknown): Connection | undefined {
  if (!isRecord(value) || typeof value.id !== 'string' || !value.id || typeof value.name !== 'string') return
  return { id: value.id, name: value.name, ...connectionFields(value) }
}

export function nextConnectionName(names: readonly string[]): string {
  const used = new Set(names)
  if (!used.has('Default')) return 'Default'
  for (let n = 2; ; n++) {
    const name = `Connection ${n}`
    if (!used.has(name)) return name
  }
}

export function createConnection(existing: readonly Connection[]): Connection {
  return {
    id: crypto.randomUUID(),
    name: nextConnectionName(existing.map((connection) => connection.name)),
    ...connectionFields({}),
  }
}

export function nextCopyName(base: string, names: readonly string[]): string {
  const used = new Set(names)
  const stem = base.trim() || 'Connection'
  const copy = `${stem} copy`
  if (!used.has(copy)) return copy
  for (let n = 2; ; n++) {
    const name = `${stem} copy ${n}`
    if (!used.has(name)) return name
  }
}

export function duplicateConnection(source: Connection, existing: readonly Connection[]): Connection {
  return {
    ...source,
    id: crypto.randomUUID(),
    name: nextCopyName(source.name, existing.map((connection) => connection.name)),
    availableModels: [...source.availableModels],
  }
}

export function parseConnections(stored: Record<string, unknown>): {
  connections: Connection[]
  activeConnectionId: string
} {
  const connections = Array.isArray(stored.connections)
    ? stored.connections.flatMap((value) => {
        const connection = toConnection(value)
        return connection ? [connection] : []
      })
    : []
  if (!connections.length) {
    const fallback = { id: 'default', name: 'Default', ...connectionFields(stored) }
    return { connections: [fallback], activeConnectionId: fallback.id }
  }
  const activeConnectionId = typeof stored.activeConnectionId === 'string'
    && connections.some((connection) => connection.id === stored.activeConnectionId)
    ? stored.activeConnectionId
    : connections[0].id
  return { connections, activeConnectionId }
}
