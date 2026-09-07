import { describe, expect, it } from 'vitest'
import { Segmenter } from '../src/index'
import type { LanguageCode } from '../src/index'

describe('Python Unicode behavior', () => {
  const cases: { language: LanguageCode; text: string; expected: string[] }[] =
    [
      {
        language: 'en',
        text: '١. First item 2. Second item.',
        expected: ['١. First item ', '2. Second item.'],
      },
      {
        language: 'en',
        text: '𝟙. First item 2. Second item.',
        expected: ['𝟙. First item ', '2. Second item.'],
      },
      {
        language: 'en',
        text: '۱) First item 2) Second item.',
        expected: ['۱) First item ', '2) Second item.'],
      },
      {
        language: 'en',
        text: 'U.İ. navy left. Next.',
        expected: ['U.İ. navy left. ', 'Next.'],
      },
      {
        language: 'en',
        text: 'ı.b.m. works. Next.',
        expected: ['ı.b.m. works. ', 'Next.'],
      },
      {
        language: 'de',
        text: 'a.\u0085Max left. Next.',
        expected: ['a.\u0085Max left. ', 'Next.'],
      },
      {
        language: 'kk',
        text: 'А.\u0085Иван ушёл. Потом.',
        expected: ['А.\u0085Иван ушёл. ', 'Потом.'],
      },
      {
        language: 'ar',
        text: 'خبر،\u0085ثم، انتهى. بعدها.',
        expected: ['خبر،\u0085ثم، ', 'انتهى. ', 'بعدها.'],
      },
      {
        language: 'sk',
        text: 'i. vec ii. vec iii. vec. Next.',
        expected: ['i. ', 'vec ii. vec iii. vec. ', 'Next.'],
      },
      {
        language: 'sk',
        text: 'I. Vec II. Vec III. Vec IV. Vec. Next.',
        expected: ['I. Vec II. Vec III. ', 'Vec IV. Vec. ', 'Next.'],
      },
    ]
  it.each(cases)(
    'preserves $language boundaries in $text',
    ({ language, text, expected }) => {
      expect(new Segmenter({ language }).segment(text)).toEqual(expected)
    },
  )

  it.each(['<é>Hi.</é> Next.', '<𐐀>Hi.</𐐀> Next.', '{b^>１２<b^}Hi. Next.'])(
    'cleans Unicode markup in %s',
    (text) => {
      expect(new Segmenter({ clean: true }).segment(text)).toEqual([
        'Hi.',
        'Next.',
      ])
    },
  )

  it.each(['$&', '$1', '$$', "$'"])(
    'preserves literal replacement characters %s',
    (suffix) => {
      expect(
        new Segmenter({ clean: true }).segment(`Hi.There${suffix}`),
      ).toEqual(['Hi.', `There${suffix}`])
    },
  )

  it('uses the Japanese cleaner without removing HTML tags', () => {
    expect(
      new Segmenter({ language: 'ja', clean: true }).segment(
        'の\n𐐀。<b>次。</b>',
      ),
    ).toEqual(['の𐐀。', '<b>次。', '</b>'])
  })

  it('keeps the BOM as text rather than treating it as whitespace', () => {
    expect(
      new Segmenter({ language: 'kk' }).segment('А.\ufeffИван ушёл. Потом.'),
    ).toEqual(['А.', '\ufeffИван ушёл. ', 'Потом.'])
  })

  it.each([
    { text: String.raw`Hi.There\\p`, expected: ['Hi.', String.raw`There\p`] },
    { text: String.raw`Hi.There\123`, expected: ['Hi.', 'ThereS'] },
    { text: String.raw`Hi.There\077`, expected: ['Hi.', 'There?'] },
  ])(
    'retains Python replacement escape behavior in $text',
    ({ text, expected }) => {
      expect(new Segmenter({ clean: true }).segment(text)).toEqual(expected)
    },
  )

  it('rejects invalid replacement escapes during connected-word cleaning', () => {
    expect(() =>
      new Segmenter({ clean: true }).segment(String.raw`Hi.There\p`),
    ).toThrow(SyntaxError)
  })

  it('retains Python integer parsing errors for information separators in list markers', () => {
    expect(() =>
      new Segmenter().segment('\x1c1. First item 2. Second item.'),
    ).toThrow(RangeError)
  })

  it('returns original UTF-16 spans across emoji and combining marks', () => {
    const text = '😀 Hi. 👩‍💻 Bye. e\u0301 Done.'
    const spans = new Segmenter({ charSpan: true }).segment(text)
    expect(spans).toEqual([
      { sent: '😀 Hi. ', start: 0, end: 7 },
      { sent: '👩‍💻 Bye. ', start: 7, end: 18 },
      { sent: 'e\u0301 Done.', start: 18, end: 26 },
    ])
    for (const span of spans) {
      expect(text.slice(span.start, span.end)).toBe(span.sent)
    }
  })

  it('matches repeated sentences to their positions after leading whitespace', () => {
    const text = '  😀 Hi. 😀 Hi. '
    const spans = new Segmenter({ charSpan: true }).segment(text)
    expect(spans).toEqual([
      { sent: '😀 Hi. ', start: 2, end: 9 },
      { sent: '😀 Hi. ', start: 9, end: 16 },
    ])
  })

  it('preserves lone UTF-16 surrogates without changing later offsets', () => {
    expect(new Segmenter({ charSpan: true }).segment('A\ud800. Next.')).toEqual(
      [
        { sent: 'A\ud800. ', start: 0, end: 4 },
        { sent: 'Next.', start: 4, end: 9 },
      ],
    )
  })
})
