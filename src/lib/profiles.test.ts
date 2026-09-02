import assert from 'node:assert/strict'
import { createProfile, nextProfileName, parseProfiles } from './profiles.ts'

assert.equal(nextProfileName([]), 'Default')
assert.equal(nextProfileName(['Default']), 'Profile 2')
assert.equal(nextProfileName(['Default', 'Profile 2']), 'Profile 3')
assert.equal(nextProfileName(['Work']), 'Default')

const created = createProfile([])
assert.equal(created.name, 'Default')
assert.equal(created.systemPrompt, '')
assert.equal(created.icon, '')
assert.equal(createProfile([created], 'Be brief.').name, 'Profile 2')
assert.equal(createProfile([created], 'Be brief.').systemPrompt, 'Be brief.')
assert.equal(createProfile([created], 'Be brief.').icon, '')

assert.deepEqual(parseProfiles({}), {
  profiles: [{ id: 'default', name: 'Default', systemPrompt: '', icon: '' }],
  activeProfileId: 'default',
})
assert.deepEqual(parseProfiles({ systemPrompt: 'Stay concise.' }), {
  profiles: [{ id: 'default', name: 'Default', systemPrompt: 'Stay concise.', icon: '' }],
  activeProfileId: 'default',
})

const work = { id: 'work', name: 'Work', systemPrompt: 'Be formal.', icon: 'data:image/png;base64,abc' }
const home = { id: 'home', name: 'Home', systemPrompt: 'Be casual.', icon: '' }
assert.deepEqual(parseProfiles({
  profiles: [work, home, { id: '', name: 'Bad' }, 'nope'],
  activeProfileId: 'home',
  systemPrompt: 'ignored once profiles exist',
}), { profiles: [work, home], activeProfileId: 'home' })
assert.equal(parseProfiles({ profiles: [work, home], activeProfileId: 'missing' }).activeProfileId, 'work')
assert.equal(parseProfiles({ profiles: [{ id: 'a', name: 'A', systemPrompt: '' }] }).profiles[0].icon, '')
assert.equal(parseProfiles({ profiles: [{ id: 'a', name: 'A', systemPrompt: '', icon: 1 }] }).profiles[0].icon, '')
