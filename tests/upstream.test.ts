import { describe, expect, it } from 'vitest'
import { cleanText } from '../src/cleaner'
import { Segmenter, supportedLanguages } from '../src/index'
import type { LanguageCode } from '../src/index'
import fixtures from './fixtures/upstream.json'

const pythonWhitespace = new Set(
  '\t\n\v\f\r\u001c\u001d\u001e\u001f \u0085\u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000',
)

function strip(text: string): string {
  let start = 0
  let end = text.length
  while (pythonWhitespace.has(text[start] ?? '')) {
    start++
  }
  while (end > start && pythonWhitespace.has(text[end - 1] ?? '')) {
    end--
  }
  return text.slice(start, end)
}

describe('upstream sentence boundaries', () => {
  for (const fixture of fixtures.sentences) {
    const test = fixture.expectedFailure ? it.fails : it
    test(fixture.id, () => {
      const segmenter = new Segmenter({
        language: fixture.language as LanguageCode,
        clean: fixture.clean,
      })
      const sentences = segmenter.segment(fixture.text)
      const actual =
        fixture.strip && Array.isArray(sentences)
          ? sentences.map(strip)
          : sentences
      expect(actual).toEqual(fixture.expected)
      if (fixture.reconstruct) {
        expect(Array.isArray(actual) ? actual.join(' ') : actual).toBe(
          fixture.text,
        )
      }
    })
  }
})

describe('upstream character spans', () => {
  for (const fixture of fixtures.spans) {
    const test = fixture.expectedFailure ? it.fails : it
    test(fixture.id, () => {
      const segmenter = new Segmenter({
        language: fixture.language as LanguageCode,
        charSpan: true,
      })
      const spans = segmenter.segment(fixture.text)
      expect(spans).toEqual(fixture.expected)
      expect(spans.map((span) => span.sent).join('')).toBe(fixture.text)
    })
  }
})

describe('upstream cleaning', () => {
  for (const fixture of fixtures.cleaner) {
    it(fixture.id, () => {
      const actual =
        fixture.text === null ? cleanText(null) : cleanText(fixture.text)
      expect(actual).toBe(fixture.expected)
    })
  }
})

describe('upstream input preservation', () => {
  for (const fixture of fixtures.inputIntegrity) {
    it(fixture.id, () => {
      const text = fixture.text
      if (fixture.cleaner) {
        cleanText(text)
      } else {
        new Segmenter().segment(text)
      }
      expect(text).toBe(fixture.text)
    })
  }
})

describe('upstream language selection', () => {
  for (const fixture of fixtures.languageRegistry) {
    it(fixture.id, () => {
      expect([...supportedLanguages].sort()).toEqual(
        [...fixture.languages].sort(),
      )
      for (const language of supportedLanguages) {
        expect(new Segmenter({ language }).language).toBe(language)
      }
    })
  }
  for (const fixture of fixtures.invalidLanguages) {
    it(fixture.id, () => {
      expect(
        () => new Segmenter({ language: fixture.language as LanguageCode }),
      ).toThrow(RangeError)
      expect(
        () => new Segmenter({ language: fixture.language as LanguageCode }),
      ).toThrow(fixture.message)
    })
  }
})

describe('upstream option validation', () => {
  for (const fixture of fixtures.invalidOptions) {
    it(fixture.id, () => {
      expect(
        () =>
          new Segmenter({ clean: fixture.clean, charSpan: fixture.charSpan }),
      ).toThrow(
        new RangeError(
          'charSpan must be false if clean is true. Cleaning modifies the original text.',
        ),
      )
    })
  }
})
