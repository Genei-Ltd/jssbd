import { createMatcher } from './regex-matcher'
import type { RegexMatch } from './regex-matcher'
import { escapeValues, parsePattern } from './regex-parser'
import type { ParsedPattern } from './regex-parser'
import { isIdentifier, whitespaceCharacters } from './unicode'

export type Rule = { source: string; replacement: string }
type Replacer = (substring: string, ...args: unknown[]) => string

function parseReplacement(
  template: string,
  parsed: ParsedPattern,
): (string | number)[] {
  const result: (string | number)[] = []
  let literal = ''
  function group(index: number) {
    if (index > parsed.groups) {
      throw new SyntaxError(`invalid group reference ${String(index)}`)
    }
    result.push(literal, index)
    literal = ''
  }
  for (let index = 0; index < template.length; index++) {
    const char = template.charAt(index)
    if (char !== '\\') {
      literal += char
      continue
    }
    const next = template.charAt(++index)
    if (!next) {
      throw new SyntaxError('bad escape (end of pattern)')
    }
    if (next === 'g') {
      if (template.charAt(++index) !== '<') {
        throw new SyntaxError('missing <')
      }
      const end = template.indexOf('>', index + 1)
      if (end < 0) {
        throw new SyntaxError('missing >, unterminated name')
      }
      const name = template.slice(index + 1, end)
      if (!/^[0-9]+$/u.test(name) && !isIdentifier(name)) {
        throw new SyntaxError(`bad character in group name '${name}'`)
      }
      const number = /^[0-9]+$/u.test(name)
        ? Number(name)
        : parsed.names.get(name)
      if (number === undefined) {
        throw new RangeError(`unknown group name '${name}'`)
      }
      group(number)
      index = end
    } else if (/[0-9]/u.test(next)) {
      let digits = next
      if (next === '0') {
        while (
          digits.length < 3 &&
          /^[0-7]$/u.test(template.charAt(index + 1))
        ) {
          digits += template.charAt(++index)
        }
        literal += String.fromCharCode(Number.parseInt(digits, 8))
      } else {
        if (/^[0-9]$/u.test(template.charAt(index + 1))) {
          digits += template.charAt(++index)
        }
        if (
          /^[0-7]{2}$/u.test(digits) &&
          /^[0-7]$/u.test(template.charAt(index + 1))
        ) {
          digits += template.charAt(++index)
          const value = Number.parseInt(digits, 8)
          if (value > 255) {
            throw new SyntaxError('octal escape outside of range 0-0o377')
          }
          literal += String.fromCharCode(value)
        } else {
          group(Number(digits))
        }
      }
    } else if (escapeValues[next] !== undefined) {
      literal += String.fromCodePoint(escapeValues[next])
    } else if (/[a-zA-Z]/u.test(next)) {
      throw new SyntaxError(`bad escape \\${next}`)
    } else {
      literal += `\\${next}`
    }
  }
  result.push(literal)
  return result
}

class PythonPattern {
  private readonly parsed: ParsedPattern
  private readonly matches: (text: string) => Generator<RegexMatch>

  constructor(
    source: string,
    private readonly global: boolean,
    flags: string,
  ) {
    this.parsed = parsePattern(source, flags)
    this.matches = createMatcher(this.parsed)
  }

  test(text: string): boolean {
    return !this.matches(text).next().done
  }

  *finditer(text: string): Generator<RegexMatch> {
    yield* this.matches(text)
  }

  split(text: string, maxSplit = 0): (string | undefined)[] {
    const result: (string | undefined)[] = []
    let previous = 0,
      splits = 0
    for (const match of this.matches(text)) {
      if (maxSplit !== 0 && splits >= maxSplit) {
        break
      }
      result.push(text.slice(previous, match.index), ...match.slice(1))
      previous = match.index + match[0].length
      splits++
    }
    result.push(text.slice(previous))
    return result
  }

  private replace(
    text: string,
    replacement: (match: RegexMatch) => string,
    count = this.global ? 0 : 1,
  ): string {
    let result = '',
      previous = 0,
      replacements = 0
    for (const match of this.matches(text)) {
      if (count !== 0 && replacements >= count) {
        break
      }
      result += text.slice(previous, match.index) + replacement(match)
      previous = match.index + match[0].length
      replacements++
    }
    return result + text.slice(previous)
  }

  sub(template: string, text: string, count = 0): string {
    const parts = parseReplacement(template, this.parsed)
    return this.replace(
      text,
      (match) =>
        parts
          .map((part) =>
            typeof part === 'number' ? (match[part] ?? '') : part,
          )
          .join(''),
      count,
    )
  }

  [Symbol.replace](text: string, replacement: string | Replacer): string {
    if (typeof replacement === 'function') {
      return this.replace(text, (match) =>
        replacement(
          match[0],
          ...match.slice(1),
          match.index,
          text,
          ...(match.groups ? [match.groups] : []),
        ),
      )
    }
    return this.replace(text, (match) =>
      replacement.replace(
        /\$([$&'`]|[0-9]{1,2}|<[^>]*>)/gu,
        (token: string, group: string) => {
          if (group === '$') {
            return '$'
          }
          if (group === '&') {
            return match[0]
          }
          if (group === '`') {
            return text.slice(0, match.index)
          }
          if (group === "'") {
            return text.slice(match.index + match[0].length)
          }
          if (group.startsWith('<')) {
            return match.groups
              ? (match.groups[group.slice(1, -1)] ?? '')
              : token
          }
          const index = Number(group)
          if (index > 0 && index <= this.parsed.groups) {
            return match[index] ?? ''
          }
          const first = Number(group.charAt(0))
          return group.length === 2 && first > 0 && first <= this.parsed.groups
            ? (match[first] ?? '') + group.charAt(1)
            : token
        },
      ),
    )
  }
}

const patterns = new Map<string, PythonPattern>()

export function pattern(source: string, flags = 'g'): PythonPattern {
  const key = `${flags}\0${source}`
  let compiled = patterns.get(key)
  if (!compiled) {
    compiled = new PythonPattern(source, flags.includes('g'), flags)
    if (patterns.size >= 512) {
      const oldest = patterns.keys().next().value
      if (oldest !== undefined) {
        patterns.delete(oldest)
      }
    }
    patterns.set(key, compiled)
  }
  return compiled
}

export function trimWhitespace(text: string): string {
  return text.replace(
    new RegExp(`^[${whitespaceCharacters}]+|[${whitespaceCharacters}]+$`, 'gu'),
    '',
  )
}

export function applyRules(text: string, rules: readonly Rule[]): string {
  for (const { source, replacement } of rules) {
    text = pattern(source).sub(replacement, text)
  }
  return text
}

export function escapePattern(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
