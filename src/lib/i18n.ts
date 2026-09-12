import { derived, writable } from 'svelte/store'
import en from './locales/en.json' with { type: 'json' }
import zhCN from './locales/zh-CN.json' with { type: 'json' }
import zhTW from './locales/zh-TW.json' with { type: 'json' }
import es from './locales/es.json' with { type: 'json' }
import it from './locales/it.json' with { type: 'json' }
import pt from './locales/pt.json' with { type: 'json' }
import fr from './locales/fr.json' with { type: 'json' }
import de from './locales/de.json' with { type: 'json' }
import ja from './locales/ja.json' with { type: 'json' }
import ko from './locales/ko.json' with { type: 'json' }

// Autonyms are fixed, regardless of the selected interface language.
export const languages = [
  ['en', 'English'],
  ['zh-CN', '简体中文'],
  ['zh-TW', '繁體中文'],
  ['es', 'Español'],
  ['it', 'Italiano'],
  ['pt', 'Português'],
  ['fr', 'Français'],
  ['de', 'Deutsch'],
  ['ja', '日本語'],
  ['ko', '한국어'],
] as const

export type Language = typeof languages[number][0]
type MessageKey = keyof typeof en
type Parameters = Record<string, string | number>

export const translations: Record<Language, Record<MessageKey, string>> = {
  en, 'zh-CN': zhCN, 'zh-TW': zhTW, es, it, pt, fr, de, ja, ko,
}

export function parseLanguage(value: unknown): Language {
  return languages.find(([code]) => code === value)?.[0] ?? 'en'
}

export function translate(language: Language, key: string, parameters: Parameters = {}): string {
  // Unknown text (such as a service error) stays intact.
  const message = Object.hasOwn(en, key) ? translations[language][key as MessageKey] : key
  return message.replace(/\{(\w+)\}/g, (match: string, name: string) => (
    Object.hasOwn(parameters, name) ? String(parameters[name]) : match
  ))
}

export const language = writable<Language>('en')
export const t = derived(language, (current) => (
  (key: string, parameters?: Parameters) => translate(current, key, parameters)
))

export type Translator = (key: string, parameters?: Parameters) => string
