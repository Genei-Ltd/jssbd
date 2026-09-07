export type Rule = { source: string; replacement: string }

const word = String.raw`[\p{L}\p{N}_]`
const whitespace = String.raw`\t-\r\x1c-\x20\x85\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000`

export function pattern(source: string, flags = 'g'): RegExp {
  let translated = ''
  let inClass = false
  const ignoreCase = flags.includes('i')
  for (let index = 0; index < source.length; index++) {
    const character = source.charAt(index)
    if (character !== '\\') {
      if (
        ignoreCase &&
        inClass &&
        /^[a-zA-Z]-[a-zA-Z]$/u.test(source.slice(index, index + 3))
      ) {
        const end = source.charAt(index + 2)
        translated += source.slice(index, index + 3)
        if (
          (character <= 'I' && end >= 'I') ||
          (character <= 'i' && end >= 'i')
        ) {
          translated += 'İı'
        }
        index += 2
        continue
      }
      if (ignoreCase && /[iIİı]/u.test(character)) {
        translated += inClass ? 'iİı' : '[iİı]'
        continue
      }
      if (character === '[') {
        inClass = true
      } else if (character === ']') {
        inClass = false
      }
      translated +=
        !inClass && character === '.'
          ? '[^\\n]'
          : !inClass && character === '$'
            ? '(?=\\n?(?![\\s\\S]))'
            : character
      continue
    }
    const escaped = source.charAt(++index)
    if (escaped === 'A') {
      translated += '^'
    } else if (escaped === 'Z') {
      translated += '(?![\\s\\S])'
    } else if (escaped === 'd') {
      translated += '\\p{Nd}'
    } else if (escaped === 'D') {
      translated += '\\P{Nd}'
    } else if (escaped === 'w') {
      translated += inClass ? '\\p{L}\\p{N}_' : word
    } else if (escaped === 's') {
      translated += inClass ? whitespace : `[${whitespace}]`
    } else if (escaped === 'S') {
      translated += `[^${whitespace}]`
    } else if (escaped === 'b') {
      translated += inClass
        ? '\\x08'
        : `(?:(?<=${word})(?!${word})|(?<!${word})(?=${word}))`
    } else if (
      /[^a-zA-Z0-9]/u.test(escaped) &&
      !'^$\\.*+?()[]{}|/'.includes(escaped)
    ) {
      translated += escaped
    } else {
      translated += `\\${escaped}`
    }
  }
  return new RegExp(translated, `${flags}u`)
}

export function trimWhitespace(text: string): string {
  return text.replace(
    new RegExp(`^[${whitespace}]+|[${whitespace}]+$`, 'gu'),
    '',
  )
}

export function applyRules(text: string, rules: readonly Rule[]): string {
  for (const { source, replacement } of rules) {
    text = text.replace(
      pattern(source),
      replacement.replace(/\\(\d+)/g, '$$$1'),
    )
  }
  return text
}

export function escapePattern(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
