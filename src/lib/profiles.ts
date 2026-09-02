import { isRecord } from './responses.ts'

export type Profile = {
  id: string
  name: string
  systemPrompt: string
  icon: string
}

function toProfile(value: unknown): Profile | undefined {
  if (!isRecord(value)
    || typeof value.id !== 'string'
    || !value.id
    || typeof value.name !== 'string'
    || typeof value.systemPrompt !== 'string') return
  return {
    id: value.id,
    name: value.name,
    systemPrompt: value.systemPrompt,
    icon: typeof value.icon === 'string' ? value.icon : '',
  }
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
    icon: '',
  }
}

export function parseProfiles(stored: Record<string, unknown>): { profiles: Profile[]; activeProfileId: string } {
  const profiles = Array.isArray(stored.profiles)
    ? stored.profiles.flatMap((value) => {
        const profile = toProfile(value)
        return profile ? [profile] : []
      })
    : []
  if (!profiles.length) {
    const systemPrompt = typeof stored.systemPrompt === 'string' ? stored.systemPrompt : ''
    const fallback = { id: 'default', name: 'Default', systemPrompt, icon: '' }
    return { profiles: [fallback], activeProfileId: fallback.id }
  }
  const activeProfileId = typeof stored.activeProfileId === 'string'
    && profiles.some((profile) => profile.id === stored.activeProfileId)
    ? stored.activeProfileId
    : profiles[0].id
  return { profiles, activeProfileId }
}
