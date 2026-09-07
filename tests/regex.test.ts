import { describe, expect, it } from 'vitest'
import { pattern } from '../src/regex'

function matches(source: string, text: string) {
  return Array.from(pattern(source).finditer(text), (match) => ({
    values: Array.from(match),
    index: match.index,
  }))
}

describe('Python regex matching', () => {
  it('requires a referenced group to have participated', () => {
    expect(matches(String.raw`(a)?\1`, 'a aa')).toEqual([
      { values: ['aa', 'a'], index: 2 },
    ])
  })

  it('retains captures from earlier repetitions and their backreferences', () => {
    expect(matches('(a|(b))+', 'ba')).toEqual([
      { values: ['ba', 'a', 'b'], index: 0 },
    ])
    expect(matches(String.raw`(a(b)?)+\2`, 'abab')).toEqual([
      { values: ['abab', 'a', 'b'], index: 0 },
    ])
  })

  it('captures lookbehind repetitions in forward text order', () => {
    expect(matches('(?<=(.){2})c', 'abc')).toEqual([
      { values: ['c', 'b'], index: 2 },
    ])
    expect(matches(String.raw`(a)(?<=\1)b`, 'ab')).toEqual([
      { values: ['ab', 'a'], index: 0 },
    ])
    expect(matches('(?<=(a*){0})b', 'b')).toEqual([
      { values: ['b', undefined], index: 0 },
    ])
  })

  it('does not backtrack into a successful positive assertion', () => {
    expect(matches(String.raw`(?=(a|aa))\1b`, 'aab')).toEqual([
      { values: ['ab', 'a'], index: 1 },
    ])
  })

  it('commits each required iteration of a possessive quantifier', () => {
    expect(matches('(?:a|ab){2}', 'aba')).toEqual([
      { values: ['aba'], index: 0 },
    ])
    expect(matches('(?:a|ab){2}+', 'aba')).toEqual([])
  })

  it('uses simple lowercase for backreferences and full equivalence for literals', () => {
    expect(matches('(?i)i', 'iIİı').map((match) => match.values[0])).toEqual([
      'i',
      'I',
      'İ',
      'ı',
    ])
    expect(matches(String.raw`(?i)(i)\1`, 'iı iİ')).toEqual([
      { values: ['iİ', 'i'], index: 3 },
    ])
    expect(matches(String.raw`(?i)(s)\1`, 'sſ')).toEqual([])
    expect(matches(String.raw`(?i)(σ)\1`, 'σς')).toEqual([])
  })

  it('exposes named captures in both matcher implementations', () => {
    expect(Array.from(pattern('(?P<word>a)').finditer('a'))[0]?.groups).toEqual(
      { word: 'a' },
    )
    expect(
      Array.from(pattern('(?P<word>a)+').finditer('aa'))[0]?.groups,
    ).toEqual({ word: 'a' })
  })

  it('permits a nonempty match immediately after an empty match', () => {
    expect(matches('.*?', 'ab')).toEqual([
      { values: [''], index: 0 },
      { values: ['a'], index: 0 },
      { values: [''], index: 1 },
      { values: ['b'], index: 1 },
      { values: [''], index: 2 },
    ])
    expect(pattern('.*?').sub('-', 'ab')).toBe('-----')
    expect(pattern('.*?').split('ab')).toEqual(['', '', '', '', '', ''])
  })

  it('keeps empty matches adjacent to a preceding nonempty match', () => {
    expect(pattern('x*').sub('-', 'abxd')).toBe('-a-b--d-')
    expect(pattern('x*').split('abxd')).toEqual(['', 'a', 'b', '', 'd', ''])
    expect(pattern('(^)|(b)?').split('ab')).toEqual([
      '',
      '',
      undefined,
      'a',
      undefined,
      'b',
      '',
      undefined,
      undefined,
      '',
    ])
  })

  it('counts empty repetitions when backtracking into a consuming alternative', () => {
    expect(matches('(?:^|a){2,3}', 'aa')).toEqual([
      { values: [''], index: 0 },
      { values: ['a'], index: 0 },
    ])
    expect(pattern('(?:^|a){2,3}').sub('-', 'aa')).toBe('--a')
    expect(pattern('(?:^|a){2,3}').split('aa')).toEqual(['', '', 'a'])
  })

  it('uses Unicode codepoints for iteration and UTF-16 for returned offsets', () => {
    expect(matches('.*?', '😀')).toEqual([
      { values: [''], index: 0 },
      { values: ['😀'], index: 0 },
      { values: [''], index: 2 },
    ])
    expect(matches(String.raw`\B`, '')).toEqual([])
  })

  it('keeps negation, category terms, and leading brackets distinct', () => {
    expect(matches(String.raw`[^\W_]+`, 'é_a9😀')).toEqual([
      { values: ['é'], index: 0 },
      { values: ['a9'], index: 2 },
    ])
    expect(matches('[]a-]+', ']a-x')).toEqual([{ values: [']a-'], index: 0 }])
    expect(matches('[^]]+', ']ab]')).toEqual([{ values: ['ab'], index: 1 }])
  })

  it('restores scoped flags and accepts successive global flag declarations', () => {
    expect(matches('(?i:a(?-i:b))', 'Ab aB ab AB')).toEqual([
      { values: ['Ab'], index: 0 },
      { values: ['ab'], index: 6 },
    ])
    expect(matches('(?i)(?m)^a$', 'A\na')).toEqual([
      { values: ['A'], index: 0 },
      { values: ['a'], index: 2 },
    ])
    expect(matches(String.raw`(?a:\w+)(?u:\w+)`, 'aé')).toEqual([
      { values: ['aé'], index: 0 },
    ])
  })

  it('ignores comments before flags and between atoms and quantifiers', () => {
    expect(matches('(?#comment)(?i)a', 'A')).toEqual([
      { values: ['A'], index: 0 },
    ])
    expect(matches('(?x) #comment\n (?i)a', 'A')).toEqual([
      { values: ['A'], index: 0 },
    ])
    expect(matches('a(?#comment)*', 'aa')).toEqual([
      { values: ['aa'], index: 0 },
      { values: [''], index: 2 },
    ])
    expect(matches(String.raw`(?#escaped\)comment)a`, 'a')).toEqual([
      { values: ['a'], index: 0 },
    ])
  })

  it('allows repeating a grouped anchor', () => {
    expect(matches('(?:^)*', 'a')).toEqual([
      { values: [''], index: 0 },
      { values: [''], index: 1 },
    ])
  })

  it('resolves forward conditional references after parsing all groups', () => {
    expect(matches('(?(1)a|b)(a)', 'ba')).toEqual([
      { values: ['ba', 'a'], index: 0 },
    ])
  })

  it('interprets Python replacement escapes without JavaScript dollar expansion', () => {
    expect(pattern('(a)?b').sub(String.raw`\1-\g<0>-$1`, 'b')).toBe('-b-$1')
    expect(pattern('(a)').sub(String.raw`\101\1\&`, 'a')).toBe('Aa\\&')
    expect(pattern('(?P<word>a)').sub(String.raw`\g<word>`, 'a')).toBe('a')
    expect(() => pattern('(a)').sub(String.raw`\2`, '')).toThrow(SyntaxError)
  })

  it.each([
    String.raw`(?<=a+)b`,
    String.raw`(?<=(a)\1)b`,
    String.raw`(?<=(a|bc))d`,
    '(?<=(?:a{2147483647}){3})b',
    '(?<=(?(1)a|b))(a)',
    '(?(1)a|b)',
    '(?(2)a|b)(a)',
    '(?i-i:a)',
    '(?i--i:a)',
    '(?i-:a)',
    '(?a-u:a)',
    '(?i)*',
    'a|(?i)b',
    '^*',
    '{2}',
    '{,2}',
    'a*{,2}',
    '[z-a]',
    String.raw`[\d-a]`,
    String.raw`\400`,
    '(?P<\u1c89>a)',
  ])('rejects invalid Python syntax: %s', (source) => {
    expect(() => pattern(source)).toThrow(SyntaxError)
  })
})
