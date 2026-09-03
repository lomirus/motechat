import { isCurrency, isReasoningEffort, isRecord, type Currency, type ReasoningEffort } from './responses.ts'

export type ConnectionOption = { id: string; label: string }
export type ConnectionField = { id: string; name: string; options: ConnectionOption[] }

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
  /** `connection, selected → fields`. Body of `(connection, selected) => { ... }`. */
  fieldsScript: string
  /** `connection, selected → connection overlay`. Body of `(connection, selected) => { ... }`. */
  configScript: string
  /** fieldId → chosen optionId */
  selected: Record<string, string>
}

export type EvaluatedConnection = {
  fields: ConnectionField[]
  selected: Record<string, string>
  effective: Connection
  fieldsError: string
  configError: string
}

function readPrice(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null
}

function connectionFields(value: Record<string, unknown>): Omit<Connection, 'id' | 'name' | 'fieldsScript' | 'configScript' | 'selected'> {
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

function stringMap(value: unknown): Record<string, string> {
  return isRecord(value)
    ? Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1] !== ''))
    : {}
}

function toConnection(value: unknown): Connection | undefined {
  if (!isRecord(value) || typeof value.id !== 'string' || !value.id || typeof value.name !== 'string') return
  return {
    id: value.id,
    name: value.name,
    ...connectionFields(value),
    fieldsScript: typeof value.fieldsScript === 'string' ? value.fieldsScript : '',
    configScript: typeof value.configScript === 'string' ? value.configScript : '',
    selected: stringMap(value.selected),
  }
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
    fieldsScript: '',
    configScript: '',
    selected: {},
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
    selected: { ...source.selected },
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
    const fallback = {
      id: 'default',
      name: 'Default',
      ...connectionFields(stored),
      fieldsScript: '',
      configScript: '',
      selected: {},
    }
    return { connections: [fallback], activeConnectionId: fallback.id }
  }
  const activeConnectionId = typeof stored.activeConnectionId === 'string'
    && connections.some((connection) => connection.id === stored.activeConnectionId)
    ? stored.activeConnectionId
    : connections[0].id
  return { connections, activeConnectionId }
}

/** Plain copy of the stored connection for user scripts. Mutations stay on this object. */
function connectionView(connection: Connection) {
  return {
    id: connection.id,
    name: connection.name,
    apiKey: connection.apiKey,
    baseUrl: connection.baseUrl,
    model: connection.model,
    contextLength: connection.contextLength,
    currency: connection.currency,
    cacheHitPrice: connection.cacheHitPrice,
    cacheMissPrice: connection.cacheMissPrice,
    outputPrice: connection.outputPrice,
    availableModels: [...connection.availableModels],
    reasoningEffort: connection.reasoningEffort,
  }
}

const scriptParamsHelp = `Function body: (connection, selected) => { ... }
Return a value. Do not wrap in function() or write to the form.

connection: {
  id: string
  name: string
  apiKey: string
  baseUrl: string
  model: string
  contextLength: number | null
  currency: 'CNY' | 'USD'
  cacheHitPrice: number | null
  cacheMissPrice: number | null
  outputPrice: number | null
  availableModels: string[]
  reasoningEffort: '' | 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max'
}

selected: {
  [fieldId: string]: string  // chosen option id
}`

export const fieldsScriptHelp = `${scriptParamsHelp}

returns: {
  id: string
  name: string
  options: { id: string, label: string }[]
}[]`

export const configScriptHelp = `${scriptParamsHelp}

returns: Partial<connection>`

function toOption(value: unknown): ConnectionOption | undefined {
  if (typeof value === 'string' && value) return { id: value, label: value }
  if (!isRecord(value)) return
  const label = typeof value.label === 'string' ? value.label : typeof value.id === 'string' ? value.id : ''
  const id = typeof value.id === 'string' && value.id ? value.id : label
  if (!id) return
  return { id, label }
}

function uniqueById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    if (seen.has(item.id)) return false
    seen.add(item.id)
    return true
  })
}

function toField(value: unknown): ConnectionField | undefined {
  if (!isRecord(value)) return
  const name = typeof value.name === 'string' ? value.name : ''
  const id = typeof value.id === 'string' && value.id ? value.id : name
  if (!id) return
  return {
    id,
    name,
    options: uniqueById(Array.isArray(value.options) ? value.options.flatMap((option) => toOption(option) ?? []) : []),
  }
}

export function parseFields(value: unknown): ConnectionField[] {
  const list = Array.isArray(value) ? value : isRecord(value) && Array.isArray(value.fields) ? value.fields : undefined
  if (!list) throw new Error('Fields script must return an array of fields.')
  return uniqueById(list.flatMap((field) => toField(field) ?? []))
}

/** Chosen option per field, falling back to the first option when unset or stale. */
export function chosenSelected(fields: readonly ConnectionField[], selected: Record<string, string>): Record<string, string> {
  return Object.fromEntries(fields.flatMap((field) => {
    if (!field.options.length) return []
    const chosen = selected[field.id]
    return [[field.id, field.options.some((option) => option.id === chosen) ? chosen : field.options[0].id]]
  }))
}

function runScript(source: string, connection: Connection, selected: Record<string, string>): { value: unknown; error: string } {
  if (!source.trim()) return { value: undefined, error: '' }
  try {
    // ponytail: Function() runs user-authored scripts in-page. Ceiling: no sandbox. Upgrade: worker/iframe if we ever load untrusted scripts.
    // oxlint-disable-next-line typescript/no-implied-eval
    const run = new Function('connection', 'selected', source) as (
      connection: ReturnType<typeof connectionView>,
      selected: Record<string, string>,
    ) => unknown
    return { value: run(connectionView(connection), { ...selected }), error: '' }
  } catch (cause) {
    return { value: undefined, error: cause instanceof Error ? cause.message : 'Script failed.' }
  }
}

function overlayConnection(base: Connection, value: unknown): Connection {
  if (!isRecord(value)) throw new Error('Config script must return an object.')
  return { ...base, ...connectionFields({ ...connectionView(base), ...value }) }
}

/**
 * Runs the connection's fields and config scripts as pure functions.
 * Neither script writes back to the stored connection; callers apply the return values.
 */
export function evaluateConnection(connection: Connection): EvaluatedConnection {
  const fieldsResult = runScript(connection.fieldsScript, connection, connection.selected)
  let fields: ConnectionField[] = []
  let fieldsError = fieldsResult.error
  if (!fieldsError && fieldsResult.value != null) {
    try {
      fields = parseFields(fieldsResult.value)
    } catch (cause) {
      fieldsError = cause instanceof Error ? cause.message : 'Fields script must return an array of fields.'
    }
  }
  const selected = chosenSelected(fields, connection.selected)
  const configResult = runScript(connection.configScript, connection, selected)
  let effective = connection
  let configError = configResult.error
  if (!configError && configResult.value != null) {
    try {
      effective = overlayConnection(connection, configResult.value)
    } catch (cause) {
      configError = cause instanceof Error ? cause.message : 'Config script must return an object.'
    }
  }
  return { fields, selected, effective, fieldsError, configError }
}
