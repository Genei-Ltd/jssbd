import data from './data.json'

export const supportedLanguages = Object.freeze([
  'en',
  'hi',
  'mr',
  'zh',
  'es',
  'am',
  'ar',
  'hy',
  'bg',
  'ur',
  'ru',
  'pl',
  'fa',
  'nl',
  'da',
  'fr',
  'my',
  'el',
  'it',
  'ja',
  'de',
  'kk',
  'sk',
] as const)

export type LanguageCode = (typeof supportedLanguages)[number]

export function isLanguageCode(value: unknown): value is LanguageCode {
  return typeof value === 'string' && Object.hasOwn(data.languages, value)
}
