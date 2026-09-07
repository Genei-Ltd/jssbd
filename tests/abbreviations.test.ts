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
