import { isRecord } from './responses.ts'

export type CollectionOption = { id: string; label: string }
export type CollectionField = { id: string; name: string; options: CollectionOption[] }

/**
 * A collection groups connections behind user-defined fields (e.g. "Model": Fast | Expert,
 * "Pricing": Off-peak | Peak). Each combination of one option per field maps to a connection.
 * With no fields, the collection maps to a single connection.
 */
export type Collection = {
  id: string
  name: string
  fields: CollectionField[]
  /** fieldId → chosen optionId */
  selected: Record<string, string>
  /** comboKey(optionIds) → connectionId */
  mapping: Record<string, string>
}

/** Order-independent key so fields can be reordered or removed without breaking other entries. */
export function comboKey(optionIds: readonly string[]): string {
  return [...optionIds].sort().join('+')
}

/** Fields that take part in combinations: those with at least one option. */
export function activeFields(fields: readonly CollectionField[]): CollectionField[] {
  return fields.filter((field) => field.options.length > 0)
}

/** Every combination of one option per active field, in field order. */
export function combos(fields: readonly CollectionField[]): CollectionOption[][] {
  // ponytail: full cartesian product, rows = product of option counts. Fine for a few hand-made fields.
  return activeFields(fields).reduce<CollectionOption[][]>(
    (rows, field) => rows.flatMap((row) => field.options.map((option) => [...row, option])),
    [[]],
  )
}

/** Chosen option per active field, falling back to the first option when unset or stale. */
export function selectedOptionIds(collection: Collection): string[] {
  return activeFields(collection.fields).map((field) => {
    const chosen = collection.selected[field.id]
    return field.options.some((option) => option.id === chosen) ? chosen : field.options[0].id
  })
}

export function resolveConnectionId(collection: Collection): string | undefined {
  return collection.mapping[comboKey(selectedOptionIds(collection))]
}

export function nextCollectionName(names: readonly string[]): string {
  const used = new Set(names)
  if (!used.has('Default')) return 'Default'
  for (let n = 2; ; n++) {
    const name = `Collection ${n}`
    if (!used.has(name)) return name
  }
}

export function createCollection(existing: readonly Collection[]): Collection {
  return {
    id: crypto.randomUUID(),
    name: nextCollectionName(existing.map((collection) => collection.name)),
    fields: [],
    selected: {},
    mapping: {},
  }
}

export function createField(): CollectionField {
  return { id: crypto.randomUUID(), name: '', options: [] }
}

export function createOption(): CollectionOption {
  return { id: crypto.randomUUID(), label: '' }
}

function toOption(value: unknown): CollectionOption | undefined {
  if (!isRecord(value) || typeof value.id !== 'string' || !value.id) return
  return { id: value.id, label: typeof value.label === 'string' ? value.label : '' }
}

function toField(value: unknown): CollectionField | undefined {
  if (!isRecord(value) || typeof value.id !== 'string' || !value.id) return
  return {
    id: value.id,
    name: typeof value.name === 'string' ? value.name : '',
    options: Array.isArray(value.options) ? value.options.flatMap((option) => toOption(option) ?? []) : [],
  }
}

function stringEntries(value: unknown): [string, string][] {
  return isRecord(value)
    ? Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1] !== '')
    : []
}

/** Drops fields/options without ids and mapping or selection entries that point at nothing. */
function toCollection(value: unknown, connectionIds: ReadonlySet<string>): Collection | undefined {
  if (!isRecord(value) || typeof value.id !== 'string' || !value.id || typeof value.name !== 'string') return
  const fields = Array.isArray(value.fields) ? value.fields.flatMap((field) => toField(field) ?? []) : []
  const optionIds = new Set(fields.flatMap((field) => field.options.map((option) => option.id)))
  const fieldOf = new Map(fields.flatMap((field) => field.options.map((option) => [option.id, field.id] as const)))
  return {
    id: value.id,
    name: value.name,
    fields,
    selected: Object.fromEntries(stringEntries(value.selected).filter(([fieldId, optionId]) => fieldOf.get(optionId) === fieldId)),
    mapping: Object.fromEntries(stringEntries(value.mapping).filter(([key, connectionId]) =>
      connectionIds.has(connectionId) && (key === '' ? optionIds.size === 0 : key.split('+').every((id) => optionIds.has(id))))),
  }
}

/** Always returns at least a Default collection. An empty collection maps to connectionIds[0] if present. */
export function parseCollections(stored: Record<string, unknown>, connectionIds: readonly string[]): {
  collections: Collection[]
  activeCollectionId: string
} {
  const known = new Set(connectionIds)
  const collections = Array.isArray(stored.collections)
    ? stored.collections.flatMap((value) => toCollection(value, known) ?? [])
    : []
  if (!collections.length) {
    const fallback: Collection = {
      id: 'default',
      name: 'Default',
      fields: [],
      selected: {},
      mapping: connectionIds[0] ? { '': connectionIds[0] } : {},
    }
    return { collections: [fallback], activeCollectionId: fallback.id }
  }
  const activeCollectionId = typeof stored.activeCollectionId === 'string'
    && collections.some((collection) => collection.id === stored.activeCollectionId)
    ? stored.activeCollectionId
    : collections[0].id
  return { collections, activeCollectionId }
}
