import { expect, it } from 'vitest'
import { Segmenter } from '../src/index'

it.each(['A', 'É', 'Ⅰ'])(
  'retains the upstream abbreviation guard for %s',
  (character) => {
    expect(
      new Segmenter({ clean: true }).segment(
        `{etc} ${character} etc. lower. Next.`,
      ),
    ).toEqual([`{etc} ${character} etc.`, 'lower.', 'Next.'])
  },
)

it.each([
  { language: 'it', abbreviation: 'a.c', word: 'axc' },
  { language: 'es', abbreviation: 'ph.d', word: 'phxd' },
] as const)(
  'retains upstream abbreviation regex matching in $language',
  ({ language, abbreviation, word }) => {
    expect(
      new Segmenter({ language, clean: true }).segment(
        `${abbreviation}. Smith. ${word}. Smith.`,
      ),
    ).toEqual([`${abbreviation}. Smith.`, `${word}. Smith.`])
  },
)

it.each([
  {
    language: 'nl',
    text: 'ed(s) eds. word.',
    expected: ['ed(s) eds. ', 'word.'],
  },
  {
    language: 'it',
    text: 'ten.(lt) ten.lt. word.',
    expected: ['ten.', '(lt) ten.lt. ', 'word.'],
  },
] as const)(
  'retains captured abbreviation matching in $language',
  ({ language, text, expected }) => {
    expect(new Segmenter({ language }).segment(text)).toEqual(expected)
  },
)

it.each([
  { language: 'de', abbreviation: 'd.h', word: 'd]h' },
  { language: 'ru', abbreviation: 'у.е', word: 'у{е' },
  { language: 'ar', abbreviation: 'ا.د', word: 'ا}د' },
] as const)(
  'accepts Python literal brackets in $language abbreviation matches',
  ({ language, abbreviation, word }) => {
    expect(
      new Segmenter({ language, clean: true }).segment(
        `${abbreviation}. Smith. ${word}. Smith.`,
      ),
    ).toEqual([`${abbreviation}. Smith.`, `${word}. Smith.`])
  },
)

it.each([
  { language: 'de', text: 'd.h. d*h.' },
  { language: 'ru', text: 'у.е. у+е.' },
  { language: 'ar', text: 'ا.د. ا?د.' },
  { language: 'de', text: 'd.h. d|h.' },
] as const)(
  'retains Python variable-width lookbehind errors for $text',
  ({ language, text }) => {
    expect(() => new Segmenter({ language }).segment(text)).toThrow(
      new SyntaxError('look-behind requires fixed-width pattern'),
    )
  },
)

it('preserves spans when an abbreviation match contains a literal bracket', () => {
  expect(
    new Segmenter({ language: 'de', charSpan: true }).segment('d.h. d]h.'),
  ).toEqual([{ sent: 'd.h. d]h.', start: 0, end: 9 }])
})

it('accepts abbreviation alternatives of equal width', () => {
  expect(new Segmenter({ language: 'de' }).segment('d|h. d.h.')).toEqual([
    'd|h. d.h.',
  ])
})

it('accepts Python bell escapes in a regex built from an abbreviation match', () => {
  expect(
    new Segmenter({ language: 'de' }).segment(String.raw`b.a b\a`),
  ).toEqual([String.raw`b.a b\a`])
})
