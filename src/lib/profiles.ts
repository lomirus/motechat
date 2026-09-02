import { isRecord } from './responses.ts'

export type Profile = {
  id: string
  name: string
  systemPrompt: string
}

function isProfile(value: unknown): value is Profile {
  return isRecord(value)
    && typeof value.id === 'string'
    && value.id.length > 0
    && typeof value.name === 'string'
    && typeof value.systemPrompt === 'string'
}

export function nextProfileName(names: readonly string[]): string {
  const used = new Set(names)
  if (!used.has('Default')) return 'Default'
  for (let n = 2; ; n++) {
    const name = `Profile ${n}`
    if (!used.has(name)) return name
  }
}

export function createProfile(existing: readonly Profile[], systemPrompt = ''): Profile {
  return {
    id: crypto.randomUUID(),
    name: nextProfileName(existing.map((profile) => profile.name)),
    systemPrompt,
  }
}

export function parseProfiles(stored: Record<string, unknown>): { profiles: Profile[]; activeProfileId: string } {
  const profiles = Array.isArray(stored.profiles) ? stored.profiles.filter(isProfile) : []
  if (!profiles.length) {
    const systemPrompt = typeof stored.systemPrompt === 'string' ? stored.systemPrompt : ''
    const fallback = { id: 'default', name: 'Default', systemPrompt }
    return { profiles: [fallback], activeProfileId: fallback.id }
  }
  const activeProfileId = typeof stored.activeProfileId === 'string'
    && profiles.some((profile) => profile.id === stored.activeProfileId)
    ? stored.activeProfileId
    : profiles[0].id
  return { profiles, activeProfileId }
}
