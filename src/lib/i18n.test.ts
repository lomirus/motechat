import assert from 'node:assert/strict'
import { get } from 'svelte/store'
import { language, languages, parseLanguage, t, translate, translations } from './i18n.ts'

assert.deepEqual(languages, [
  ['en', 'English'], ['zh-CN', '简体中文'], ['zh-TW', '繁體中文'],
  ['es', 'Español'], ['it', 'Italiano'], ['pt', 'Português'],
  ['fr', 'Français'], ['de', 'Deutsch'], ['ja', '日本語'], ['ko', '한국어'],
])

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort()
for (const [code] of languages) {
  assert.equal(parseLanguage(code), code)
  assert.deepEqual(Object.keys(translations[code]).sort(), Object.keys(translations.en).sort())
  for (const [key, value] of Object.entries(translations[code])) {
    assert(value.trim(), `${code}: empty translation for ${key}`)
    assert.deepEqual(placeholders(value), placeholders(key), `${code}: mismatched placeholders for ${key}`)
  }
}
for (const invalid of [undefined, null, '', 'unknown', 'toString', '__proto__', 1, {}, ['en']]) {
  assert.equal(parseLanguage(invalid), 'en')
}

assert.equal(translate('zh-CN', 'Settings'), '设置')
assert.equal(translate('zh-TW', 'Settings'), '設定')
assert.equal(translate('ja', 'Unknown service error'), 'Unknown service error')
assert.equal(translate('ja', 'toString'), 'toString')
assert.equal(translate('en', 'Profile: {name}', { name: '$& {name} <script>' }), 'Profile: $& {name} <script>')
assert.equal(translate('zh-CN', 'Profile: {name}'), '配置：{name}')
assert.equal(translate('de', 'Models available: {count}. Choose one or enter a model ID.', { count: 1 }),
  'Verfügbare Modelle: 1. Wähle eines aus oder gib eine Modell-ID ein.')

const updates: string[] = []
const unsubscribe = t.subscribe((translate) => updates.push(translate('Settings')))
language.set('zh-CN')
language.set('zh-TW')
language.set('ja')
language.set('en')
unsubscribe()
assert.deepEqual(updates, ['Settings', '设置', '設定', '設定', 'Settings'])
assert.equal(get(t)('Settings'), 'Settings')
console.log('i18n tests passed')
