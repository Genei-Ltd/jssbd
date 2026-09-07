import data from './unicode-data.json'

export const unicodeVersion = data.unicodeVersion

function rangeIndex(ranges: readonly number[], code: number): number {
  let start = 0
  let end = ranges.length / 2 - 1
  while (start <= end) {
    const middle = Math.floor((start + end) / 2)
    const offset = middle * 2
    if (code < (ranges[offset] ?? 0)) {
      end = middle - 1
    } else if (code > (ranges[offset + 1] ?? 0)) {
      start = middle + 1
    } else {
      return offset
    }
  }
  return -1
}

function includes(ranges: readonly number[], code: number): boolean {
  return rangeIndex(ranges, code) !== -1
}

function singleCodePoint(character: string): number | undefined {
  const code = character.codePointAt(0)
  return code !== undefined && character.length === (code > 0xffff ? 2 : 1)
    ? code
    : undefined
}

function escapedCodePoint(code: number): string {
  return code <= 0xffff
    ? `\\u${code.toString(16).padStart(4, '0')}`
    : `\\u{${code.toString(16)}}`
}

function classCharacters(ranges: readonly number[]): string {
  let source = ''
  for (let index = 0; index < ranges.length; index += 2) {
    const start = ranges[index] ?? 0
    const end = ranges[index + 1] ?? start
    source += escapedCodePoint(start)
    if (start !== end) {
      source += `-${escapedCodePoint(end)}`
    }
  }
  return source
}

export const wordCharacters = classCharacters(data.word)
export const decimalCharacters = classCharacters(data.decimal)
export const whitespaceCharacters = classCharacters(data.whitespace)

export function isWord(character: string): boolean {
  const code = singleCodePoint(character)
  return code !== undefined && includes(data.word, code)
}

export function isDecimal(character: string): boolean {
  const code = singleCodePoint(character)
  return code !== undefined && includes(data.decimal, code)
}

export function isWhitespace(character: string): boolean {
  const code = singleCodePoint(character)
  return code !== undefined && includes(data.whitespace, code)
}

export function decimalValue(character: string): number | undefined {
  const code = singleCodePoint(character)
  if (code === undefined) {
    return undefined
  }
  const index = rangeIndex(data.decimal, code)
  return index === -1 ? undefined : (code - (data.decimal[index] ?? 0)) % 10
}

export function isUppercase(text: string): boolean {
  let hasUppercase = false
  for (const character of text) {
    const code = character.codePointAt(0) ?? 0
    if (includes(data.uppercase, code)) {
      hasUppercase = true
    } else if (includes(data.cased, code)) {
      return false
    }
  }
  return hasUppercase
}

export function isIdentifier(text: string): boolean {
  let first = true
  for (const character of text) {
    const ranges = first ? data.identifierStart : data.identifierContinue
    if (!includes(ranges, character.codePointAt(0) ?? 0)) {
      return false
    }
    first = false
  }
  return !first
}

function lowercaseCharacter(character: string): string {
  const code = character.codePointAt(0) ?? 0
  let start = 0
  let end = data.lowercaseKeys.length - 1
  while (start <= end) {
    const middle = Math.floor((start + end) / 2)
    const key = data.lowercaseKeys[middle] ?? 0
    if (code < key) {
      end = middle - 1
    } else if (code > key) {
      start = middle + 1
    } else {
      return data.lowercaseValues[middle] ?? character
    }
  }
  return character
}

export function simpleLowercaseCodePoint(code: number): number {
  return lowercaseCharacter(String.fromCodePoint(code)).codePointAt(0) ?? code
}

export function lowercase(text: string): string {
  const characters = Array.from(text)
  let result = ''
  for (const [index, character] of characters.entries()) {
    if (character === 'Σ') {
      let previous = index - 1
      let next = index + 1
      while (
        previous >= 0 &&
        includes(data.caseIgnorable, characters[previous]?.codePointAt(0) ?? 0)
      ) {
        previous--
      }
      while (
        next < characters.length &&
        includes(data.caseIgnorable, characters[next]?.codePointAt(0) ?? 0)
      ) {
        next++
      }
      if (
        previous >= 0 &&
        includes(data.cased, characters[previous]?.codePointAt(0) ?? 0) &&
        (next === characters.length ||
          !includes(data.cased, characters[next]?.codePointAt(0) ?? 0))
      ) {
        result += 'ς'
        continue
      }
    }
    result += lowercaseCharacter(character)
  }
  return result
}

export function casefoldCodePoint(code: number): number {
  let start = 0
  let end = data.casefold.length / 2 - 1
  while (start <= end) {
    const middle = Math.floor((start + end) / 2)
    const offset = middle * 2
    const key = data.casefold[offset] ?? 0
    if (code < key) {
      end = middle - 1
    } else if (code > key) {
      start = middle + 1
    } else {
      return data.casefold[offset + 1] ?? code
    }
  }
  return code
}

export function caseInsensitiveCharacters(start: number, end = start): string {
  const representatives = new Set<number>()
  for (let index = 0; index < data.casefold.length; index += 2) {
    const code = data.casefold[index] ?? 0
    const canonical = data.casefold[index + 1] ?? code
    if (
      (code >= start && code <= end) ||
      (canonical >= start && canonical <= end)
    ) {
      representatives.add(canonical)
    }
  }
  const extraCharacters = new Set(representatives)
  for (let index = 0; index < data.casefold.length; index += 2) {
    const code = data.casefold[index] ?? 0
    const canonical = data.casefold[index + 1] ?? code
    if (representatives.has(canonical)) {
      extraCharacters.add(code)
    }
  }
  let source = classCharacters([start, end])
  for (const code of extraCharacters) {
    if (code < start || code > end) {
      source += escapedCodePoint(code)
    }
  }
  return source
}
