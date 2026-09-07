import data from './data.json'
import { applyRules, pattern, trimWhitespace } from './regex'
import { decimalValue } from './unicode'

const regex = data.listRegex
const romanNumerals = data.romanNumerals
const latinNumerals = Array.from('abcdefghijklmnopqrstuvwxyz')

function decimalNumber(text: string): number {
  // Python int rejects these controls even though str.strip accepts them.
  // eslint-disable-next-line no-control-regex
  if (/[\x1c-\x1f]/u.test(text)) {
    throw new RangeError('Invalid decimal list marker.')
  }
  let value = 0
  for (const character of trimWhitespace(text)) {
    const digit = decimalValue(character)
    if (digit === undefined) {
      throw new RangeError('Invalid decimal list marker.')
    }
    value = value * 10 + digit
  }
  return value
}

export function replaceListItems(input: string, language: string): string {
  let text = input

  function replaceAlphabeticalList(value: string, parens: boolean): string {
    if (!parens) {
      return text.replace(
        pattern(regex.ALPHABETICAL_LIST_LETTERS_AND_PERIODS_REGEX, 'gi'),
        (match) => {
          const letter = match.replace(/^\.+|\.+$/g, '')
          return letter === value ? `\r${letter}∯` : match
        },
      )
    }
    return text.replace(
      pattern(regex.EXTRACT_ALPHABETICAL_LIST_LETTERS_REGEX, 'gi'),
      (match) => {
        if (match.includes('(')) {
          const letter = match.replace(/^\(+|\(+$/g, '')
          return letter === value ? `\r&✂&${letter}` : match
        }
        return match === value ? `\r${match}` : match
      },
    )
  }

  function formatAlphabeticalLists(alphabet: string[], parens: boolean) {
    const expression = parens
      ? regex.ALPHABETICAL_LIST_WITH_PARENS
      : regex.ALPHABETICAL_LIST_WITH_PERIODS
    const values = Array.from(
      pattern(expression).finditer(text),
      (match) => match[0],
    ).filter((value) => alphabet.includes(value))
    for (const [index, value] of values.entries()) {
      const previous = values[(index + values.length - 1) % values.length] ?? ''
      const distance = Math.abs(
        alphabet.indexOf(previous) - alphabet.indexOf(value),
      )
      const isLast = index === values.length - 1
      if (
        isLast
          ? distance === 1
          : alphabet.indexOf(values[index + 1] ?? '') -
              alphabet.indexOf(value) ===
              1 || distance === 1
      ) {
        text = replaceAlphabeticalList(value, parens)
      }
    }
  }

  function scanNumberedLists(
    source: string,
    replacementSource: string,
    replacement: string,
    strip: boolean,
  ) {
    const values = Array.from(pattern(source).finditer(text), (match) =>
      decimalNumber(match[0]),
    )
    for (const [index, value] of values.entries()) {
      const previous = values[index - 1]
      const next = values[index + 1]
      if (
        value + 1 !== next &&
        !(
          index > 0 &&
          (value - 1 === previous ||
            (value === 0 && previous === 9) ||
            (value === 9 && previous === 0))
        )
      ) {
        continue
      }
      text = text.replace(pattern(replacementSource), (match) => {
        const normalized = strip ? trimWhitespace(match) : match
        const number =
          normalized.length === 1
            ? normalized
            : normalized.replace(/^[.\])]+|[.\])]+$/g, '')
        return String(value) === number
          ? `${String(value)}${replacement}`
          : normalized
      })
    }
  }

  if (language !== 'sk') {
    formatAlphabeticalLists(latinNumerals, false)
    formatAlphabeticalLists(latinNumerals, true)
  }
  formatAlphabeticalLists(romanNumerals, false)
  formatAlphabeticalLists(romanNumerals, true)
  scanNumberedLists(
    regex.NUMBERED_LIST_REGEX_1,
    regex.NUMBERED_LIST_REGEX_2,
    '♨',
    true,
  )
  if (
    text.includes('♨') &&
    !pattern(String.raw`♨.+[\n\r].+♨`, '').test(text) &&
    !pattern(String.raw`for\s\d{1,2}♨\s[a-z]`, '').test(text)
  ) {
    text = applyRules(text, [
      ...data.listRules.SpaceBetweenListItemsFirstRule,
      ...data.listRules.SpaceBetweenListItemsSecondRule,
    ])
  }
  text = text.replace(/♨/gu, '∯')
  scanNumberedLists(
    regex.NUMBERED_LIST_PARENS_REGEX,
    regex.NUMBERED_LIST_PARENS_REGEX,
    '☝',
    false,
  )
  scanNumberedLists(
    regex.NUMBERED_LIST_PARENS_REGEX,
    regex.NUMBERED_LIST_PARENS_REGEX,
    '☝',
    false,
  )
  if (
    text.includes('☝') &&
    !pattern(String.raw`☝.+[\n\r].+☝`, '').test(text)
  ) {
    text = applyRules(text, data.listRules.SpaceBetweenListItemsThirdRule)
  }
  return text.replace(/☝/gu, '')
}
